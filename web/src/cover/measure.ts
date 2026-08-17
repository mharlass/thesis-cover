// How wide the type sets, and therefore whether the title fits.
//
// The R pipeline asks textshaping for this; here the browser's own shaper
// answers, through a throwaway canvas. Both are measuring the same Inter faces
// with the same features, so the answers agree to within a rounding error —
// but the browser will only shape with Inter once the face has actually
// loaded, so callers must await `fontsReady()` before trusting a width.

import { coverDims } from "./geometry";
import type { CoverParams } from "./params";

let scratch: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (scratch === undefined) {
    scratch = document.createElement("canvas").getContext("2d");
  }
  return scratch;
}

/** Resolve once both Inter faces are available to the shaper. */
export async function fontsReady(): Promise<void> {
  if (!("fonts" in document)) return;
  await Promise.all([
    document.fonts.load('400 10px "Inter"'),
    document.fonts.load('500 10px "Inter"'),
  ]);
  await document.fonts.ready;
}

/**
 * Width of one run of type, in millimetres.
 *
 * @param text The string to set.
 * @param size Font size in mm.
 * @param weight 400 for Inter Regular, 500 for Medium.
 * @param tracking Extra advance after each glyph, in mm.
 */
export function textWidth(text: string, size: number, weight: 400 | 500, tracking = 0): number {
  const ctx = context();
  if (!ctx) return 0;
  ctx.font = `${weight} ${size}px Inter, sans-serif`;
  ctx.letterSpacing = `${tracking}px`;
  const width = ctx.measureText(text).width;
  ctx.letterSpacing = "0px";
  return width;
}

/**
 * How far the title runs past the front panel's safe area, in millimetres.
 *
 * Negative when it fits. The title-scale slider reaches sizes the panel cannot
 * hold, as it did in the generator this replaces, so the app checks this and
 * says so rather than silently printing a title off the edge.
 */
export function titleOverflow(params: CoverParams): number {
  const dims = coverDims(params.spine_mm);
  const size = 8.5 * params.title_scale;
  const widest = Math.max(
    ...params.title.map((line) => textWidth(line, size, 500, 0.05)),
  );
  return widest + 18 - (dims.trimWidth - 10);
}
