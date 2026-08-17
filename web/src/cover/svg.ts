// The cover as an SVG file.
//
// This is the format the printer gets, so the type stays live text and the
// artwork stays vector. Structure follows the original generator's named
// groups, including #background, #ridge, and #cohort-lines, which keeps the
// output addressable in Illustrator.

import { smoothPathData } from "./path";
import type { CoverScene, SceneGuide, SceneText, Stop } from "./scene";
import { viewSize } from "./scene";

/**
 * Inter as the printer's machine will see it, for a file opened elsewhere.
 *
 * Both faces, not just Regular. The cover sets its title, its spine title and
 * the accent rule in Inter Medium, and a file that names only Regular renders
 * those in Regular on any machine without Inter installed — about 1.5 mm
 * narrower per title line, which quietly makes the fit warning a lie.
 */
const INTER_WEB_FONTS: Record<400 | 500, string> = {
  400: "https://rsms.me/inter/font-files/Inter-Regular.woff2?v=4.1",
  500: "https://rsms.me/inter/font-files/Inter-Medium.woff2?v=4.1",
};

function fontFaceRules(sources: Record<400 | 500, string>): string {
  return ([400, 500] as const)
    .map(
      (weight) =>
        `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};` +
        `font-display:swap;src:${sources[weight]};}`,
    )
    .join("");
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function num(value: number, decimals = 2): string {
  return Number(value.toFixed(decimals)).toString();
}

function stopTags(stops: Stop[]): string {
  return stops
    .map(
      (s) =>
        `<stop offset="${num(s.offset, 4)}" stop-color="${s.colour}"` +
        (s.alpha === 1 ? "" : ` stop-opacity="${num(s.alpha, 4)}"`) +
        "/>",
    )
    .join("");
}

export interface SvgOptions {
  /**
   * A `@font-face` src for each Inter weight the cover uses. Defaults to the
   * public web font, which is what makes a downloaded file render correctly on
   * a machine without Inter installed. Passing data URIs instead makes the
   * file self-contained, which is what rasterising needs: an SVG loaded into
   * an <img> is not allowed to fetch anything external.
   */
  fontSources?: Record<400 | 500, string>;
  /** Omit the XML declaration, for embedding rather than saving. */
  inline?: boolean;
}

/** Render a scene as a complete SVG document. */
export function sceneToSvg(scene: CoverScene, options: SvgOptions = {}): string {
  const { viewBox } = scene;
  const size = viewSize(scene.dims, scene.view);
  const fontSources =
    options.fontSources ??
    ({
      400: `url('${INTER_WEB_FONTS[400]}') format('woff2')`,
      500: `url('${INTER_WEB_FONTS[500]}') format('woff2')`,
    } as Record<400 | 500, string>);
  const title = scene.texts
    .filter((t) => t.angle === 0 && t.weight === 500)
    .map((t) => t.label)
    .join(" ");

  const defs = [
    `<linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">${stopTags(scene.background)}</linearGradient>`,
    `<radialGradient id="peakGlow">${stopTags(scene.glow.stops)}</radialGradient>`,
    `<linearGradient id="edgeFade" gradientUnits="userSpaceOnUse" ` +
      `x1="0" y1="0" x2="${num(scene.dims.width)}" y2="0">` +
      scene.fade
        .map(
          (s) =>
            `<stop offset="${num(s.offset, 4)}" stop-color="${
              s.alpha === 1 ? "#fff" : "#000"
            }"/>`,
        )
        .join("") +
      "</linearGradient>",
    `<linearGradient id="foldShade" x1="0" y1="0" x2="1" y2="0">${stopTags(scene.fold.stops)}</linearGradient>`,
    `<mask id="fadeMask"><rect x="0" y="0" width="${num(scene.dims.width)}" ` +
      `height="${num(scene.dims.height)}" fill="url(#edgeFade)"/></mask>`,
    // The soft halo behind a highlighted stratum uses a real Gaussian here.
    `<filter id="glow" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feGaussianBlur stdDeviation="${scene.ridge.find((s) => s.blur > 0)?.blur ?? 1.1}"/></filter>`,
  ].join("\n");

  const cohort: string[] = [];
  const strata: string[] = [];
  for (const stroke of scene.ridge) {
    const d = smoothPathData(scene.xs, stroke.ys);
    const attrs =
      `<path d="${d}" fill="none" stroke="${stroke.colour}" ` +
      `stroke-width="${num(stroke.width)}"` +
      (stroke.offsetY === 0 ? "" : ` transform="translate(0 ${num(stroke.offsetY)})"`) +
      (stroke.blur > 0 ? ` filter="url(#glow)"` : "") +
      (stroke.alpha === 1 ? "" : ` opacity="${num(stroke.alpha, 4)}"`) +
      "/>";
    (stroke.layer === "strata" ? strata : cohort).push(attrs);
  }

  return [
    options.inline ? "" : '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(size.width)}mm" ` +
      `height="${num(size.height)}mm" viewBox="${num(viewBox.x)} ${num(viewBox.y)} ` +
      `${num(viewBox.width)} ${num(viewBox.height)}" font-family="Inter, sans-serif">`,
    `<title>${escapeXml(`Thesis cover ${scene.view} — ${title}`)}</title>`,
    `<style>${fontFaceRules(fontSources)}text{font-family:'Inter',sans-serif;}</style>`,
    `<defs>\n${defs}\n</defs>`,
    `<g id="background"><rect x="0" y="0" width="${num(scene.dims.width)}" ` +
      `height="${num(scene.dims.height)}" fill="url(#bgGrad)"/>` +
      `<ellipse cx="${num(scene.glow.cx)}" cy="${num(scene.glow.cy)}" ` +
      `rx="${num(scene.glow.rx)}" ry="${num(scene.glow.ry)}" fill="url(#peakGlow)"/></g>`,
    `<g id="ridge" mask="url(#fadeMask)">`,
    `<g id="cohort-lines">${cohort.join("")}</g>`,
    `<g id="strata-lines">${strata.join("")}</g>`,
    `</g>`,
    `<g id="fold-shading"><rect x="${num(scene.fold.x)}" y="0" ` +
      `width="${num(scene.fold.width)}" height="${num(scene.dims.height)}" ` +
      `fill="url(#foldShade)"/></g>`,
    `<g id="spine-text">${scene.texts.filter((t) => t.angle !== 0).map(textTag).join("")}</g>`,
    `<g id="front-text"><rect x="${num(scene.tick.x)}" y="${num(scene.tick.y)}" ` +
      `width="${num(scene.tick.width)}" height="${num(scene.tick.height)}" ` +
      `fill="${scene.tick.colour}"/>` +
      scene.texts.filter((t) => t.angle === 0).map(textTag).join("") +
      "</g>",
    scene.guides.length > 0 ? `<g id="guides">${scene.guides.map(guideTag).join("")}</g>` : "",
    "</svg>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
}

function textTag(text: SceneText): string {
  // letter-spacing needs its unit. SVG 1.1 accepted a bare number as user
  // units and the original generator wrote one, but the attribute is a CSS
  // property now and a unitless length is invalid CSS, so browsers drop it
  // silently — the downloaded file then set about 1.4 mm tighter per title
  // line than the preview did. "px" is user units in SVG.
  const common =
    `font-size="${num(text.size)}" font-weight="${text.weight}" ` +
    `fill="${text.colour}" letter-spacing="${num(text.tracking, 3)}px"`;
  const label = escapeXml(text.label);
  if (text.angle === 0) {
    return `<text x="${num(text.x)}" y="${num(text.y)}" ${common}>${label}</text>`;
  }
  // The spine reads top to bottom, which is a +90° rotation in SVG's y-down
  // coordinate space. Geometry stores the equivalent angle as -90°.
  return (
    `<text transform="translate(${num(text.x)} ${num(text.y)}) rotate(${num(-text.angle)})" ` +
    `${common}>${label}</text>`
  );
}

function guideTag(guide: SceneGuide): string {
  const dash = guide.dash ? ` stroke-dasharray="${guide.dash.join(" ")}"` : "";
  switch (guide.kind) {
    case "rect":
      return (
        `<rect x="${num(guide.x)}" y="${num(guide.y)}" width="${num(guide.width!)}" ` +
        `height="${num(guide.height!)}" fill="none" stroke="${guide.colour}" ` +
        `stroke-width="${guide.strokeWidth}"${dash}/>`
      );
    case "line":
      return (
        `<line x1="${num(guide.x)}" y1="${num(guide.y)}" x2="${num(guide.x2!)}" ` +
        `y2="${num(guide.y2!)}" stroke="${guide.colour}" stroke-width="${guide.strokeWidth}"${dash}/>`
      );
    default:
      return (
        `<text x="${num(guide.x)}" y="${num(guide.y)}" font-size="${guide.size}" ` +
        `fill="${guide.colour}">${escapeXml(guide.label!)}</text>`
      );
  }
}
