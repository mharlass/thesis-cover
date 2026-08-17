// Turning the sampled ridge into a smooth curve.
//
// cover_geometry() evaluates each line every 2 mm, and both the original
// generator and the ggplot rewrite joined those samples with straight
// segments. At print size the facets are visible on the shallow lines, so the
// samples are interpolated with a uniform Catmull-Rom spline instead, written
// out as cubic Béziers.
//
// The spline passes exactly through every sample, so the vertices the
// regression fixtures pin are untouched: this changes what happens *between*
// them, and nothing else. Because x is a uniform grid, the control points sit
// a third of a step either side of each sample, and only their y has to be
// worked out.

export interface CurveSegment {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x: number;
  y: number;
}

/**
 * Cubic Bézier segments through every sample, in order.
 *
 * Control points come from the standard uniform Catmull-Rom construction with
 * tension 1/2: the tangent at each interior sample is half the vector between
 * its neighbours, and the end samples reuse their only neighbour so the curve
 * starts and ends without a flick.
 */
export function smoothSegments(xs: ArrayLike<number>, ys: ArrayLike<number>): CurveSegment[] {
  const n = xs.length;
  const segments: CurveSegment[] = [];
  if (n < 2) return segments;

  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i === 0 ? 0 : i - 1];
    const y0 = ys[i === 0 ? 0 : i - 1];
    const x1 = xs[i];
    const y1 = ys[i];
    const x2 = xs[i + 1];
    const y2 = ys[i + 1];
    const x3 = xs[i + 2 < n ? i + 2 : n - 1];
    const y3 = ys[i + 2 < n ? i + 2 : n - 1];

    segments.push({
      c1x: x1 + (x2 - x0) / 6,
      c1y: y1 + (y2 - y0) / 6,
      c2x: x2 - (x3 - x1) / 6,
      c2y: y2 - (y3 - y1) / 6,
      x: x2,
      y: y2,
    });
  }
  return segments;
}

/** Trim trailing zeros so the emitted path stays close to the old file size. */
function round(value: number, decimals: number): string {
  return Number(value.toFixed(decimals)).toString();
}

/**
 * SVG path data for one smoothed line.
 *
 * @param decimals Coordinate precision. The original generator wrote two
 *   decimal places, which is 10 µm on the page — far below anything a printer
 *   resolves, and it keeps a 300-line cover to a sensible file size.
 */
export function smoothPathData(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  decimals = 2,
): string {
  if (xs.length === 0) return "";
  const parts = [`M${round(xs[0], decimals)} ${round(ys[0], decimals)}`];
  for (const s of smoothSegments(xs, ys)) {
    parts.push(
      `C${round(s.c1x, decimals)} ${round(s.c1y, decimals)} ` +
        `${round(s.c2x, decimals)} ${round(s.c2y, decimals)} ` +
        `${round(s.x, decimals)} ${round(s.y, decimals)}`,
    );
  }
  return parts.join("");
}

/** Lay one smoothed line into a canvas path. */
export function traceSmooth(
  ctx: CanvasRenderingContext2D,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
): void {
  if (xs.length === 0) return;
  ctx.moveTo(xs[0], ys[0]);
  for (const s of smoothSegments(xs, ys)) {
    ctx.bezierCurveTo(s.c1x, s.c1y, s.c2x, s.c2y, s.x, s.y);
  }
}

/** Evaluate one Catmull-Rom segment at parameter `t` in [0, 1]. */
export function segmentAt(
  from: { x: number; y: number },
  segment: CurveSegment,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * from.x + b * segment.c1x + c * segment.c2x + d * segment.x,
    y: a * from.y + b * segment.c1y + c * segment.c2y + d * segment.y,
  };
}
