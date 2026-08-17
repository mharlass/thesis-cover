// The gate on the port.
//
// app/R/ is the definition of the artwork. This file asserts that the
// TypeScript pipeline reproduces what the R pipeline produced, for a spread of
// parameter sets chosen to reach the branches the legacy SVGs never do.
// Regenerate the fixture with `Rscript scripts/dump_geometry_fixture.R` after
// any deliberate change to the R side, and expect this to fail loudly after an
// accidental one.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { coverGeometry, coverText, strataLines } from "../src/cover/geometry";
import { coverParams, type CoverParams } from "../src/cover/params";

interface FixtureLine {
  line_id: number;
  colour: string;
  linewidth: number;
  alpha: number;
  is_strata: boolean;
  y_sum: number;
  y_min: number;
  y_max: number;
  y_sample: number[];
}

interface FixtureCase {
  params: Record<string, unknown>;
  dims: Record<string, number>;
  n_x: number;
  x_last: number;
  lines: FixtureLine[];
  strata: { line_id: number; fraction: number; colour: string }[];
  text: {
    label: string;
    x: number;
    y: number;
    size: number;
    colour: string;
    face: string;
    angle: number;
  }[];
}

const fixture: Record<string, FixtureCase> = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/r-geometry.json", import.meta.url)), "utf8"),
);

// Tolerance is 1e-6 mm. Both sides evaluate the same arithmetic on IEEE
// doubles, so agreement should be near-exact; anything looser would let a real
// divergence through.
const TOL = 1e-6;

describe.each(Object.entries(fixture))("%s", (_name, expected) => {
  const params = expected.params as unknown as CoverParams;
  const geometry = coverGeometry(coverParams(params));

  it("reproduces the page dimensions", () => {
    expect(geometry.dims).toEqual({
      spine: expected.dims.spine,
      bleed: expected.dims.bleed,
      trimWidth: expected.dims.trim_width,
      trimHeight: expected.dims.trim_height,
      width: expected.dims.width,
      height: expected.dims.height,
      frontX: expected.dims.front_x,
    });
  });

  it("samples x at the same positions", () => {
    expect(geometry.xs.length).toBe(expected.n_x);
    expect(geometry.xs[geometry.xs.length - 1]).toBeCloseTo(expected.x_last, 9);
  });

  it("reproduces every line's ridge and style", () => {
    expect(geometry.lines.length).toBe(expected.lines.length);
    for (const want of expected.lines) {
      const got = geometry.lines[want.line_id];
      expect(got.lineId).toBe(want.line_id);
      expect(got.colour).toBe(want.colour);
      expect(got.linewidth).toBeCloseTo(want.linewidth, 9);
      expect(got.alpha).toBeCloseTo(want.alpha, 9);
      expect(got.isStrata).toBe(want.is_strata);

      let sum = 0;
      let min = Infinity;
      let max = -Infinity;
      for (const y of got.ys) {
        sum += y;
        if (y < min) min = y;
        if (y > max) max = y;
      }
      // A single shifted PRNG draw moves the sum, so this catches
      // stream-order drift as well as arithmetic drift.
      expect(sum).toBeCloseTo(want.y_sum, 4);
      expect(min).toBeCloseTo(want.y_min, 6);
      expect(max).toBeCloseTo(want.y_max, 6);
      want.y_sample.forEach((y, i) => {
        expect(Math.abs(got.ys[i * 20] - y)).toBeLessThan(TOL);
      });
    }
  });

  it("picks the same strata, in the same colours", () => {
    const got = strataLines(coverParams(params), params.lines);
    expect(got.length).toBe(expected.strata.length);
    got.forEach((s, i) => {
      expect(s.lineId).toBe(expected.strata[i].line_id);
      expect(s.fraction).toBeCloseTo(expected.strata[i].fraction, 9);
      expect(s.colour).toBe(expected.strata[i].colour);
    });
  });

  it("lays the type out identically", () => {
    const got = coverText(coverParams(params), geometry.dims);
    expect(got.length).toBe(expected.text.length);
    got.forEach((item, i) => {
      const want = expected.text[i];
      expect(item.label).toBe(want.label);
      expect(item.x).toBeCloseTo(want.x, 9);
      expect(item.y).toBeCloseTo(want.y, 9);
      expect(item.size).toBeCloseTo(want.size, 9);
      expect(item.colour).toBe(want.colour);
      expect(item.face).toBe(want.face);
      expect(item.angle).toBe(want.angle);
    });
  });
});
