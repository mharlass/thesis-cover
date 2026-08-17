// What the cover looks like, as a structure rather than a picture.
//
// The app draws the same cover three ways — Canvas for the previews and the
// PNG, SVG for the file the printer gets, PDF for the download — and the only
// way to be sure the preview is telling the truth is for all three to walk one
// description. That description is built here, straight from cover_geometry(),
// and the emitters in svg.ts, canvas.ts and pdf.ts contain no layout decisions
// of their own.
//
// Numbers here are the original generator's, read back out of
// "PhD Thesis Cover Design_v3/thesis-cover.svg", which is also the file the
// regression tests measure against.

import { BLEED, TRIM_HEIGHT, TRIM_WIDTH, type CoverDims, type CoverGeometry, type CoverTextItem } from "./geometry";
import { NOCTURNE } from "./palette";

export type View = "wrap" | "front";

export interface Stop {
  offset: number;
  colour: string;
  alpha: number;
}

export interface RidgeStroke {
  /** y at each x in the scene's shared `xs`. */
  ys: Float64Array;
  colour: string;
  /** Stroke width in mm. */
  width: number;
  alpha: number;
  /** Gaussian standard deviation in mm; 0 for a crisp line. */
  blur: number;
  /** Down-page offset in mm; positive values form the contour relief shadow. */
  offsetY: number;
  /** Which of the original generator's two named groups this belongs to. */
  layer: "cohort" | "strata";
}

export interface SceneText extends CoverTextItem {
  /** CSS font weight: the vendored Inter Medium sits in the bold slot. */
  weight: 400 | 500;
}

export interface SceneGuide {
  kind: "rect" | "line" | "text";
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  label?: string;
  size?: number;
  colour: string;
  strokeWidth?: number;
  dash?: number[];
}

export interface CoverScene {
  dims: CoverDims;
  view: View;
  /** The visible rectangle in mm, and what the emitters size their page to. */
  viewBox: { x: number; y: number; width: number; height: number };
  xs: Float64Array;
  background: Stop[];
  glow: { cx: number; cy: number; rx: number; ry: number; stops: Stop[] };
  ridge: RidgeStroke[];
  /** Horizontal alpha ramp applied to the whole composited ridge. */
  fade: Stop[];
  fold: { x: number; width: number; stops: Stop[] };
  tick: { x: number; y: number; width: number; height: number; colour: string };
  texts: SceneText[];
  guides: SceneGuide[];
}

/** Standard deviation of the blur behind a highlighted stratum, in mm. */
export const GLOW_BLUR = 1.1;
/** Opacity of that blurred copy. */
export const GLOW_ALPHA = 0.6;

/** The restrained low edge that makes each path read as a raised contour. */
export const CONTOUR_SHADOW_COLOUR = "#0e101a";
const CONTOUR_SHADOW_MIN_OFFSET = 0.75;
const CONTOUR_SHADOW_OFFSET_RANGE = 0.55;
const CONTOUR_SHADOW_WIDTH = 0.28;
const CONTOUR_SHADOW_ALPHA = 0.38;
const CONTOUR_SHADOW_ALPHA_RANGE = 0.12;

/**
 * Stand-in for that blur where there is no blur to be had.
 *
 * SVG has feGaussianBlur and Canvas has ctx.filter, so both draw the real
 * thing. PDF has neither, and neither does Safari before 18.1, so those two
 * stack progressively wider and fainter copies of the same path instead —
 * the approximation the ggplot renderer used, and for the same reason. A
 * single wide stroke will not do: it reads as a fat band rather than a glow.
 *
 * Multipliers are on the stratum's own width and on the alpha it would have
 * been drawn at.
 */
export const GLOW_HALOS: readonly { width: number; alpha: number }[] = [
  { width: 3.4, alpha: 0.07 / GLOW_ALPHA },
  { width: 2.5, alpha: 0.11 / GLOW_ALPHA },
  { width: 1.8, alpha: 0.17 / GLOW_ALPHA },
];

/**
 * Widths of the fade at each end of the wrap, as a fraction of the page.
 *
 * The original masked the whole ridge group with this ramp. The ggplot rewrite
 * could not mask a group — only fade each line's own opacity, which composites
 * brighter — so it painted flat background over the ends instead and accepted
 * an error of about 3/255. SVG, Canvas and PDF can all mask properly, so the
 * original behaviour is restored here.
 */
const FADE_FRACTION = 0.06;

/** Physical size of a view, in mm. */
export function viewSize(dims: CoverDims, view: View) {
  return view === "front"
    ? { width: dims.trimWidth, height: dims.trimHeight }
    : { width: dims.width, height: dims.height };
}

export function buildScene(geometry: CoverGeometry, view: View): CoverScene {
  const { dims, params } = geometry;
  const viewBox =
    view === "front"
      ? { x: dims.frontX, y: BLEED, width: dims.trimWidth, height: dims.trimHeight }
      : { x: 0, y: 0, width: dims.width, height: dims.height };

  // A small, downward dark edge turns the stack into shallow relief without
  // changing any path. Lower contours carry a little more depth, as though
  // the mountain were lit from above. At zero this layer is absent and the
  // legacy cover is unchanged.
  const ridge: RidgeStroke[] = [];
  const reliefStroke = (
    line: CoverGeometry["lines"][number],
    layer: RidgeStroke["layer"],
  ): RidgeStroke => {
    const rank = line.lineId / (geometry.lines.length - 1);
    return {
      ys: line.ys,
      colour: CONTOUR_SHADOW_COLOUR,
      width: line.linewidth + CONTOUR_SHADOW_WIDTH * params.contour_depth,
      alpha:
        line.alpha *
        params.contour_depth *
        (CONTOUR_SHADOW_ALPHA + CONTOUR_SHADOW_ALPHA_RANGE * (1 - rank)),
      blur: 0,
      offsetY:
        params.contour_depth *
        (CONTOUR_SHADOW_MIN_OFFSET + CONTOUR_SHADOW_OFFSET_RANGE * (1 - rank)),
      layer,
    };
  };

  // Cohort lines next, then each stratum's blurred copy followed by the crisp
  // one, which is the order the original generator emitted.
  for (const line of geometry.lines) {
    if (line.isStrata) continue;
    if (params.contour_depth > 0) ridge.push(reliefStroke(line, "cohort"));
    ridge.push({
      ys: line.ys,
      colour: line.colour,
      width: line.linewidth,
      alpha: line.alpha,
      blur: 0,
      offsetY: 0,
      layer: "cohort",
    });
  }
  for (const line of geometry.lines) {
    if (!line.isStrata) continue;
    if (params.contour_depth > 0) ridge.push(reliefStroke(line, "strata"));
    const base = {
      ys: line.ys,
      colour: line.colour,
      width: line.linewidth,
      layer: "strata" as const,
    };
    ridge.push({ ...base, alpha: line.alpha * GLOW_ALPHA, blur: GLOW_BLUR, offsetY: 0 });
    ridge.push({ ...base, alpha: line.alpha, blur: 0, offsetY: 0 });
  }

  const texts: SceneText[] = geometry.text.map((item) => ({
    ...item,
    weight: item.face === "bold" ? 500 : 400,
  }));

  return {
    dims,
    view,
    viewBox,
    xs: geometry.xs,
    background: [
      { offset: 0, colour: "#1b1e30", alpha: 1 },
      { offset: 0.55, colour: NOCTURNE.bg, alpha: 1 },
      { offset: 1, colour: "#111320", alpha: 1 },
    ],
    glow: {
      cx: dims.frontX + 100,
      cy: 185,
      rx: 150,
      ry: 88,
      stops: [
        { offset: 0, colour: NOCTURNE.a900, alpha: 0.85 },
        { offset: 1, colour: NOCTURNE.a900, alpha: 0 },
      ],
    },
    ridge,
    fade: [
      { offset: 0, colour: "#ffffff", alpha: 0 },
      { offset: FADE_FRACTION, colour: "#ffffff", alpha: 1 },
      { offset: 1 - FADE_FRACTION, colour: "#ffffff", alpha: 1 },
      { offset: 1, colour: "#ffffff", alpha: 0 },
    ],
    fold: {
      x: BLEED + TRIM_WIDTH - 4,
      width: dims.spine + 8,
      stops: [
        { offset: 0, colour: "#0e101a", alpha: 0 },
        { offset: 0.5, colour: "#0e101a", alpha: 0.55 },
        { offset: 1, colour: "#0e101a", alpha: 0 },
      ],
    },
    tick: {
      x: geometry.text[0]?.x ?? dims.frontX + 18,
      y: 30.2,
      width: 13,
      height: 1.15,
      colour: NOCTURNE.accent,
    },
    texts,
    guides: params.show_guides ? buildGuides(dims) : [],
  };
}

/**
 * Trim, fold and safe-area guides.
 *
 * The original shipped these inside every SVG with `display="none"`, to be
 * switched on later. Nothing downstream reads a hidden layer, so they are
 * drawn when asked for and absent otherwise.
 */
function buildGuides(dims: CoverDims): SceneGuide[] {
  const safeX = [BLEED + 10, dims.frontX + 10];
  return [
    {
      kind: "rect",
      x: BLEED,
      y: BLEED,
      width: 2 * TRIM_WIDTH + dims.spine,
      height: TRIM_HEIGHT,
      colour: NOCTURNE.n500,
      strokeWidth: 0.25,
      dash: [2, 1.5],
    },
    ...[BLEED + TRIM_WIDTH, dims.frontX].map(
      (x): SceneGuide => ({
        kind: "line",
        x,
        y: 0,
        x2: x,
        y2: dims.height,
        colour: NOCTURNE.accent,
        strokeWidth: 0.25,
      }),
    ),
    ...safeX.map(
      (x): SceneGuide => ({
        kind: "rect",
        x,
        y: BLEED + 10,
        width: TRIM_WIDTH - 20,
        height: TRIM_HEIGHT - 20,
        colour: NOCTURNE.n600,
        strokeWidth: 0.2,
        dash: [0.8, 1.2],
      }),
    ),
    ...(
      [
        [BLEED + 4, "back"],
        [BLEED + TRIM_WIDTH + 1.2, `spine ${dims.spine} mm`],
        [dims.frontX + 4, "front"],
      ] as const
    ).map(
      ([x, label]): SceneGuide => ({
        kind: "text",
        x,
        y: 8.5,
        label,
        size: 2.8,
        colour: NOCTURNE.n500,
      }),
    ),
    {
      kind: "text",
      x: BLEED + 4,
      y: dims.height - 4.5,
      label:
        `trim ${TRIM_WIDTH} × ${TRIM_HEIGHT} mm · bleed ${BLEED} mm · ` +
        `total ${dims.width} × ${dims.height} mm`,
      size: 2.8,
      colour: NOCTURNE.n500,
    },
  ];
}
