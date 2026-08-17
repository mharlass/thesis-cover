// The cover as a PDF, with both Inter faces embedded.
//
// This module is imported dynamically, so nothing here is downloaded until
// somebody actually asks for a PDF. That matters: pdf-lib and fontkit together
// are larger than the rest of the application put together, and the whole
// goal is to avoid making every visitor pay for machinery they may never use.
//
// pdf-lib has no gradient API, so the four gradients are built as raw PDF
// objects. That is not gold-plating — they carry the whole look of the cover,
// and a version with flat fills would be a different picture:
//
//   background  an axial (Type 2) shading, painted opaque.
//   glow        a flat fill under a luminosity soft mask whose group paints a
//               radial shading. PDF has no per-stop alpha, so a gradient in
//               the alpha channel has to be expressed as a mask.
//   fold        the same, with an axial mask.
//   edge fade   the whole ridge goes into a transparency group, and that group
//               is drawn under a horizontal luminosity mask. This is exactly
//               what the original SVG's <mask> did; see the note in scene.ts.
//
// Everything is drawn in millimetres with y running down the page, matching
// the rest of the pipeline, by way of a flipped base transform. Text has to
// undo that flip in its own text matrix or it comes out mirrored.

import { smoothSegments } from "./path";
import type { CoverScene, SceneGuide, SceneText, Stop } from "./scene";
import { GLOW_HALOS, viewSize } from "./scene";

const MM_TO_PT = 72 / 25.4;

// TrueType rather than the woff2 the page uses: pdf-lib embeds TrueType and
// cannot read woff2. Same subset, so the two can never disagree about which
// characters exist. Fetched only when a PDF is actually asked for.
const FONT_URLS = {
  400: new URL("../fonts/Inter-Regular.subset.ttf", import.meta.url),
  500: new URL("../fonts/Inter-Medium.subset.ttf", import.meta.url),
} as const;

type Box = [number, number, number, number];

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function fmt(value: number): string {
  return Number(value.toFixed(4)).toString();
}

function fill(colour: string): string {
  const [r, g, b] = rgb(colour);
  return `${fmt(r)} ${fmt(g)} ${fmt(b)} rg`;
}

function rect(box: Box): string {
  return `${fmt(box[0])} ${fmt(box[1])} ${fmt(box[2] - box[0])} ${fmt(box[3] - box[1])} re`;
}

// Minimal structural typing over pdf-lib, so its types do not have to be
// imported at module scope and dragged into the entry bundle.
interface PdfContextLike {
  obj(literal: Record<string, unknown>): unknown;
  register(object: unknown): unknown;
  stream(contents: string, dict?: Record<string, unknown>): unknown;
}

interface PageLike {
  node: {
    newXObject(tag: string, ref: unknown): { asString(): string };
    newExtGState(tag: string, ref: unknown): { asString(): string };
    newFontDictionary(tag: string, ref: unknown): { asString(): string };
  };
}

interface EmbeddedFont {
  ref: unknown;
  encode(text: string): string;
}

/** Builds the content stream for one scene, registering what it needs. */
class ScenePainter {
  private readonly ops: string[] = [];

  constructor(
    private readonly context: PdfContextLike,
    private readonly page: PageLike,
    private readonly scene: CoverScene,
    private readonly fonts: Record<400 | 500, EmbeddedFont>,
  ) {}

  build(): string {
    const { viewBox } = this.scene;
    const size = viewSize(this.scene.dims, this.scene.view);

    // Work in millimetres with y running down, then shift so the view's
    // top-left corner lands on the page's top-left corner.
    this.ops.push(
      "q",
      `${fmt(MM_TO_PT)} 0 0 ${fmt(-MM_TO_PT)} 0 ${fmt(size.height * MM_TO_PT)} cm`,
      `1 0 0 1 ${fmt(-viewBox.x)} ${fmt(-viewBox.y)} cm`,
    );

    this.paintBackground();
    this.paintGlow();
    this.paintRidge();
    this.paintFold();
    this.paintTick();
    for (const text of this.scene.texts) this.paintText(text);
    for (const guide of this.scene.guides) this.paintGuide(guide);

    this.ops.push("Q");
    return this.ops.join("\n");
  }

  // --- PDF plumbing --------------------------------------------------------

  /**
   * A PDF function mapping [0, 1] onto a ramp.
   *
   * Two stops become one exponential (Type 2) function; more become a
   * stitching (Type 3) function over one exponential per span. `channel`
   * selects what is interpolated: the stop colours for a visible gradient, or
   * their alpha as a grey level for a soft mask.
   */
  private ramp(stops: Stop[], channel: "colour" | "alpha"): unknown {
    const valueAt = (stop: Stop) => (channel === "colour" ? rgb(stop.colour) : [stop.alpha]);
    const span = (from: Stop, to: Stop) =>
      this.context.obj({
        FunctionType: 2,
        Domain: [0, 1],
        C0: valueAt(from),
        C1: valueAt(to),
        N: 1,
      });

    if (stops.length === 2) return span(stops[0], stops[1]);
    return this.context.obj({
      FunctionType: 3,
      Domain: [0, 1],
      Functions: stops.slice(0, -1).map((stop, i) => span(stop, stops[i + 1])),
      Bounds: stops.slice(1, -1).map((stop) => stop.offset),
      Encode: stops.slice(0, -1).flatMap(() => [0, 1]),
    });
  }

  private shading(
    type: 2 | 3,
    coords: number[],
    stops: Stop[],
    channel: "colour" | "alpha",
    extend: [boolean, boolean] = [true, true],
  ): unknown {
    return this.context.register(
      this.context.obj({
        ShadingType: type,
        ColorSpace: channel === "colour" ? "DeviceRGB" : "DeviceGray",
        Coords: coords,
        Function: this.ramp(stops, channel),
        Extend: extend,
      }),
    );
  }

  private registerForm(
    bbox: Box,
    contents: string,
    resources: Record<string, unknown>,
    group?: Record<string, unknown>,
  ): { name: string; ref: unknown } {
    const dict: Record<string, unknown> = {
      Type: "XObject",
      Subtype: "Form",
      FormType: 1,
      BBox: bbox,
      Resources: this.context.obj(resources),
    };
    if (group) dict.Group = this.context.obj(group);
    const ref = this.context.register(this.context.stream(contents, dict));
    return { name: this.page.node.newXObject("Sc", ref).asString(), ref };
  }

  /**
   * An ExtGState name that applies a shading as an alpha ramp.
   *
   * The mask is a luminosity group: a form XObject that paints a greyscale
   * shading over a black backdrop, so white means opaque and anywhere the
   * shading does not reach stays transparent.
   *
   * @param transform Operators placed between the backdrop and the shading,
   *   for a gradient that has to be squashed into an ellipse.
   */
  private softMask(bbox: Box, shadingRef: unknown, transform = ""): string {
    const { ref } = this.registerForm(
      bbox,
      `q 0 g ${rect(bbox)} f ${transform}/Sh0 sh Q`,
      { Shading: this.context.obj({ Sh0: shadingRef }) },
      { S: "Transparency", CS: "DeviceGray" },
    );
    const gsRef = this.context.register(
      this.context.obj({
        Type: "ExtGState",
        SMask: this.context.obj({ S: "Luminosity", G: ref, BC: [0] }),
      }),
    );
    return this.page.node.newExtGState("Sm", gsRef).asString();
  }

  /** Fill a box with a flat colour under an alpha ramp. */
  private maskedFill(bbox: Box, colour: string, mask: string): void {
    this.ops.push("q", `/${mask} gs`, fill(colour), `${rect(bbox)} f`, "Q");
  }

  // --- the cover itself ----------------------------------------------------

  private paintBackground(): void {
    const { dims } = this.scene;
    const bbox: Box = [0, 0, dims.width, dims.height];
    const shadingRef = this.shading(2, [0, 0, 0, dims.height], this.scene.background, "colour");
    const { name } = this.registerForm(
      bbox,
      `q ${rect(bbox)} W n /Sh0 sh Q`,
      { Shading: this.context.obj({ Sh0: shadingRef }) },
    );
    this.ops.push(`/${name} Do`);
  }

  private paintGlow(): void {
    const { glow } = this.scene;
    const bbox: Box = [glow.cx - glow.rx, glow.cy - glow.ry, glow.cx + glow.rx, glow.cy + glow.ry];
    // The shading is defined on a unit circle and squashed into the ellipse by
    // the transform, which is what the SVG and the canvas do too.
    const shadingRef = this.shading(3, [0, 0, 0, 0, 0, 1], glow.stops, "alpha", [true, false]);
    const transform = `${fmt(glow.rx)} 0 0 ${fmt(glow.ry)} ${fmt(glow.cx)} ${fmt(glow.cy)} cm `;
    this.maskedFill(bbox, glow.stops[0].colour, this.softMask(bbox, shadingRef, transform));
  }

  private paintFold(): void {
    const { fold, dims } = this.scene;
    const bbox: Box = [fold.x, 0, fold.x + fold.width, dims.height];
    const shadingRef = this.shading(2, [fold.x, 0, fold.x + fold.width, 0], fold.stops, "alpha");
    this.maskedFill(bbox, fold.stops[0].colour, this.softMask(bbox, shadingRef));
  }

  /**
   * The ridge, composited as one group and then faded at both ends.
   *
   * Drawing the strokes straight onto the page and fading each one's opacity
   * separately sums to a brighter result — the difference AGENTS.md documents.
   * Grouping first, then masking, reproduces the original.
   */
  private paintRidge(): void {
    const { dims } = this.scene;
    const bbox: Box = [0, 0, dims.width, dims.height];

    // One ExtGState per distinct opacity, rather than one per stroke.
    const alphaNames = new Map<number, string>();
    const alphaStates: Record<string, unknown> = {};
    const nameFor = (value: number): string => {
      const alpha = Number(value.toFixed(4));
      let name = alphaNames.get(alpha);
      if (!name) {
        name = `Ga${alphaNames.size}`;
        alphaNames.set(alpha, name);
        alphaStates[name] = this.context.obj({ Type: "ExtGState", CA: alpha, ca: alpha });
      }
      return name;
    };

    const strokeOps: string[] = [];
    for (const stroke of this.scene.ridge) {
      // PDF has no blur, so a halo becomes the stack of wider, fainter copies
      // described in scene.ts; a crisp line is a single stroke.
      const passes =
        stroke.blur > 0
          ? GLOW_HALOS.map((halo) => ({
              width: stroke.width * halo.width,
              alpha: stroke.alpha * halo.alpha,
              round: true,
            }))
          : [{ width: stroke.width, alpha: stroke.alpha, round: false }];
      const path = this.pathOps(stroke.ys, stroke.offsetY);
      const [r, g, b] = rgb(stroke.colour);
      for (const pass of passes) {
        strokeOps.push(
          [
            "q",
            `${fmt(r)} ${fmt(g)} ${fmt(b)} RG`,
            `/${nameFor(pass.alpha)} gs`,
            `${fmt(pass.width)} w ${pass.round ? "1 J 1 j" : "0 J 1 j"}`,
            path,
            "S",
            "Q",
          ].join("\n"),
        );
      }
    }

    const { ref } = this.registerForm(
      bbox,
      strokeOps.join("\n"),
      { ExtGState: this.context.obj(alphaStates) },
      { S: "Transparency", CS: "DeviceRGB", I: true },
    );
    const formName = this.page.node.newXObject("Sc", ref).asString();
    const fadeShading = this.shading(2, [0, 0, dims.width, 0], this.scene.fade, "alpha");
    const mask = this.softMask(bbox, fadeShading);
    this.ops.push("q", `/${mask} gs`, `/${formName} Do`, "Q");
  }

  private pathOps(ys: Float64Array, offsetY = 0): string {
    const xs = this.scene.xs;
    const parts = [`${fmt(xs[0])} ${fmt(ys[0] + offsetY)} m`];
    for (const s of smoothSegments(xs, ys)) {
      parts.push(
        `${fmt(s.c1x)} ${fmt(s.c1y + offsetY)} ${fmt(s.c2x)} ${fmt(s.c2y + offsetY)} ` +
          `${fmt(s.x)} ${fmt(s.y + offsetY)} c`,
      );
    }
    return parts.join("\n");
  }

  private paintTick(): void {
    const { tick } = this.scene;
    this.ops.push(
      "q",
      fill(tick.colour),
      `${fmt(tick.x)} ${fmt(tick.y)} ${fmt(tick.width)} ${fmt(tick.height)} re f`,
      "Q",
    );
  }

  /**
   * One run of type.
   *
   * The base transform flips y, so the text matrix has to flip back or every
   * glyph comes out mirrored. Horizontal type uses [1 0 0 -1 x y]; the spine
   * reads top to bottom with the letters turned clockwise, which is
   * [0 1 1 0 x y]. Tc is in unscaled text space units, so the tracking values
   * carry over from the scene in millimetres unchanged.
   */
  private paintText(text: SceneText): void {
    const font = this.fonts[text.weight];
    const name = this.page.node.newFontDictionary("F", font.ref).asString();
    const matrix =
      text.angle === 0
        ? `1 0 0 -1 ${fmt(text.x)} ${fmt(text.y)}`
        : `0 1 1 0 ${fmt(text.x)} ${fmt(text.y)}`;
    this.ops.push(
      "q",
      "BT",
      `/${name} ${fmt(text.size)} Tf`,
      `${fmt(text.tracking)} Tc`,
      fill(text.colour),
      `${matrix} Tm`,
      `${font.encode(text.label)} Tj`,
      "ET",
      "Q",
    );
  }

  private paintGuide(guide: SceneGuide): void {
    const [r, g, b] = rgb(guide.colour);
    const dash = guide.dash ? `[${guide.dash.map(fmt).join(" ")}] 0 d` : "[] 0 d";
    this.ops.push("q", `${fmt(r)} ${fmt(g)} ${fmt(b)} RG`, fill(guide.colour));
    switch (guide.kind) {
      case "rect":
        this.ops.push(
          `${fmt(guide.strokeWidth ?? 0.25)} w`,
          dash,
          `${fmt(guide.x)} ${fmt(guide.y)} ${fmt(guide.width!)} ${fmt(guide.height!)} re S`,
        );
        break;
      case "line":
        this.ops.push(
          `${fmt(guide.strokeWidth ?? 0.25)} w`,
          dash,
          `${fmt(guide.x)} ${fmt(guide.y)} m ${fmt(guide.x2!)} ${fmt(guide.y2!)} l S`,
        );
        break;
      default: {
        const font = this.fonts[400];
        const name = this.page.node.newFontDictionary("F", font.ref).asString();
        this.ops.push(
          "BT",
          `/${name} ${fmt(guide.size ?? 2.8)} Tf`,
          "0 Tc",
          `1 0 0 -1 ${fmt(guide.x)} ${fmt(guide.y)} Tm`,
          `${font.encode(guide.label!)} Tj`,
          "ET",
        );
      }
    }
    this.ops.push("Q");
  }
}

/**
 * Render a scene as a PDF.
 *
 * @param scene What to draw.
 * @param fetchFont Loads a font face's bytes; overridable so the tests can run
 *   outside a browser.
 * @returns The file's bytes.
 */
export async function sceneToPdf(
  scene: CoverScene,
  fetchFont: (weight: 400 | 500) => Promise<ArrayBuffer> = defaultFetchFont,
): Promise<Uint8Array> {
  const [{ PDFDocument }, fontkitModule] = await Promise.all([
    import("pdf-lib"),
    import("@pdf-lib/fontkit"),
  ]);
  const fontkit = (fontkitModule as { default?: unknown }).default ?? fontkitModule;

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit as Parameters<typeof doc.registerFontkit>[0]);

  const [regular, medium] = await Promise.all(
    ([400, 500] as const).map(async (weight) =>
      doc.embedFont(await fetchFont(weight), { subset: true }),
    ),
  );

  const size = viewSize(scene.dims, scene.view);
  const page = doc.addPage([size.width * MM_TO_PT, size.height * MM_TO_PT]);

  const painter = new ScenePainter(
    doc.context as unknown as PdfContextLike,
    page as unknown as PageLike,
    scene,
    {
      400: { ref: regular.ref, encode: (t) => regular.encodeText(t).toString() },
      500: { ref: medium.ref, encode: (t) => medium.encodeText(t).toString() },
    },
  );

  const streamRef = doc.context.register(
    doc.context.flateStream(painter.build()) as never,
  );
  page.node.addContentStream(streamRef);

  doc.setTitle(`Thesis cover ${scene.view}`);
  doc.setCreator("thesis-cover");
  return doc.save();
}

async function defaultFetchFont(weight: 400 | 500): Promise<ArrayBuffer> {
  const response = await fetch(FONT_URLS[weight]);
  if (!response.ok) {
    throw new Error(`Could not load Inter ${weight} for the PDF (${response.status}).`);
  }
  return response.arrayBuffer();
}
