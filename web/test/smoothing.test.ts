// Does smoothing actually help, or does it just look different?
//
// The ridge is a continuous function of x; the 2 mm samples are a reading of
// it. Straight segments between those samples are what produced the visible
// facets. The Catmull-Rom spline is only worth having if it sits closer to the
// real curve than the straight segments did, so that is what is measured here:
// both are compared against the same function evaluated 16 times more finely.

import { describe, expect, it } from "vitest";

import { coverGeometry } from "../src/cover/geometry";
import { segmentAt, smoothSegments } from "../src/cover/path";
import { coverParams } from "../src/cover/params";

/** Largest vertical gap between a set of drawn points and the true ridge. */
function deviation(
  drawn: { x: number; y: number }[],
  trueXs: Float64Array,
  trueYs: Float64Array,
): number {
  let worst = 0;
  for (const point of drawn) {
    // The fine grid contains the sample grid, so a linear read of the fine
    // grid at this x is the reference value to within a rounding error.
    const i = Math.min(
      trueXs.length - 2,
      Math.max(0, Math.floor((point.x / trueXs[trueXs.length - 1]) * (trueXs.length - 1))),
    );
    const span = trueXs[i + 1] - trueXs[i];
    const t = span === 0 ? 0 : (point.x - trueXs[i]) / span;
    const reference = trueYs[i] + (trueYs[i + 1] - trueYs[i]) * t;
    worst = Math.max(worst, Math.abs(point.y - reference));
  }
  return worst;
}

/** Points along the straight-segment rendering, at the same places. */
function polylinePoints(xs: Float64Array, ys: Float64Array, per: number) {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let k = 1; k < per; k++) {
      const t = k / per;
      out.push({
        x: xs[i] + (xs[i + 1] - xs[i]) * t,
        y: ys[i] + (ys[i + 1] - ys[i]) * t,
      });
    }
  }
  return out;
}

/** Points along the smoothed rendering, at the same places. */
function curvePoints(xs: Float64Array, ys: Float64Array, per: number) {
  const segments = smoothSegments(xs, ys);
  const out: { x: number; y: number }[] = [];
  segments.forEach((segment, i) => {
    const from = { x: xs[i], y: ys[i] };
    for (let k = 1; k < per; k++) out.push(segmentAt(from, segment, k / per));
  });
  return out;
}

describe.each([
  ["the default cover", coverParams()],
  ["the candidate_v31 preset", coverParams({}, "candidate_v31")],
  // The roughest thing the controls can ask for: maximum dispersion and weave
  // on top of the shortest-wavelength lattice, where a spline is most likely
  // to overshoot.
  ["the roughest settings", coverParams({ dispersion: 4, weave: 1, lines: 40, seed: 7 })],
])("%s", (_name, params) => {
  const drawn = coverGeometry(params);
  const truth = coverGeometry(params, { xStep: 0.125 });

  it("passes exactly through every sampled vertex", () => {
    // The spline interpolates rather than approximates, so the vertices the
    // regression fixtures pin are still on the curve.
    const line = drawn.lines[drawn.lines.length - 1];
    const segments = smoothSegments(drawn.xs, line.ys);
    segments.forEach((segment, i) => {
      expect(segment.x).toBeCloseTo(drawn.xs[i + 1], 9);
      expect(segment.y).toBeCloseTo(line.ys[i + 1], 9);
    });
  });

  it("tracks the underlying ridge more closely than straight segments", () => {
    let worstCurve = 0;
    let worstPolyline = 0;
    for (let i = 0; i < drawn.lines.length; i++) {
      const trueYs = truth.lines[i].ys;
      worstCurve = Math.max(
        worstCurve,
        deviation(curvePoints(drawn.xs, drawn.lines[i].ys, 8), truth.xs, trueYs),
      );
      worstPolyline = Math.max(
        worstPolyline,
        deviation(polylinePoints(drawn.xs, drawn.lines[i].ys, 8), truth.xs, trueYs),
      );
    }
    // Measured at roughly half the straight-segment error across all three.
    expect(worstCurve).toBeLessThan(0.6 * worstPolyline);
    // In absolute terms: one dot at 300 dpi is 0.085 mm, and the default and
    // preset covers come in under that. The deliberately extreme case reaches
    // about 0.13 mm, so the bound is set where the roughest thing the sliders
    // can ask for still lands inside two dots.
    expect(worstCurve).toBeLessThan(0.15);
  });
});
