// The original generator wrote every vertex into these two SVGs at two decimal
// places. Reproducing those coordinates protects the established geometry while
// the browser emitters improve how the samples are rendered between vertices.

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { coverGeometry } from "../src/cover/geometry";
import { coverParams, type CoverParams } from "../src/cover/params";

const repoDir = fileURLToPath(new URL("../..", import.meta.url));

function readGroup(file: string, group: string): string {
  const svg = readFileSync(file, "utf8");
  const match = svg.match(new RegExp(`<g id="${group}">([\\s\\S]*?)</g>`));
  return match ? match[1] : "";
}

function readPaths(file: string, group: string): string[] {
  return [...readGroup(file, group).matchAll(/d="([^"]+)"/g)].map((m) => m[1]);
}

function pathPoints(d: string): { x: number; y: number }[] {
  const values = d
    .replace(/[ML]/g, " ")
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .map(Number);
  const points = [];
  for (let i = 0; i < values.length; i += 2) {
    points.push({ x: values[i], y: values[i + 1] });
  }
  return points;
}

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Check that `params` reproduces a cover the old generator wrote.
 *
 * The old generator walked the stack once, appending each line to whichever
 * layer it belonged to, so both layers are in ascending line order. Strata
 * lines were emitted twice, once blurred and once crisp.
 */
function expectReproduces(file: string, params: CoverParams) {
  const geometry = coverGeometry(params);
  const cohortIds = geometry.lines.filter((l) => !l.isStrata).map((l) => l.lineId);
  const strataIds = geometry.lines.filter((l) => l.isStrata).map((l) => l.lineId);

  const cohortPaths = readPaths(file, "cohort-lines");
  const strataPaths = readPaths(file, "strata-lines");
  expect(cohortPaths.length).toBe(cohortIds.length);
  expect(strataPaths.length).toBe(2 * strataIds.length);

  const legacy = [
    ...cohortPaths.map((d, i) => [cohortIds[i], d] as const),
    ...strataPaths.filter((_, i) => i % 2 === 0).map((d, i) => [strataIds[i], d] as const),
  ];

  const xIndex = new Map<number, number>();
  geometry.xs.forEach((x, i) => xIndex.set(x, i));

  let compared = 0;
  let worst = 0;
  for (const [lineId, d] of legacy) {
    const ys = geometry.lines[lineId].ys;
    for (const point of pathPoints(d)) {
      const k = xIndex.get(point.x);
      expect(k, `no sample at x=${point.x}`).toBeDefined();
      worst = Math.max(worst, Math.abs(ys[k!] - point.y));
      compared++;
    }
  }
  expect(compared).toBeGreaterThan(0);
  expect(worst).toBeLessThan(0.01);

  // Strata colours are close but not identical: the old generator interpolated
  // between eight hard-coded stops per colormap, this one samples the true
  // 256-entry colormap. The largest disagreement is in the blue channel at the
  // yellow end of viridis, where both read as the same colour.
  const legacyColours = [...readGroup(file, "strata-lines").matchAll(/stroke="(#[0-9a-f]{6})"/g)]
    .map((m) => m[1])
    .filter((_, i) => i % 2 === 0);
  let drift = 0;
  strataIds.forEach((lineId, i) => {
    const mine = channels(geometry.lines[lineId].colour);
    const theirs = channels(legacyColours[i]);
    drift = Math.max(drift, ...mine.map((c, j) => Math.abs(c - theirs[j])));
  });
  expect(drift).toBeLessThan(25);
}

describe("the checked-in covers", () => {
  // Both files are tracked in git, so a missing one means the gate is broken
  // rather than unavailable. Fail on it instead of skipping quietly.
  it("reproduces the v3 SVG from the defaults", () => {
    const file = `${repoDir}PhD Thesis Cover Design_v3/thesis-cover.svg`;
    expect(existsSync(file), `missing regression fixture ${file}`).toBe(true);
    expectReproduces(file, coverParams());
  });

  it("reproduces the downloaded v3.1 SVG from the candidate_v31 preset", () => {
    const file = `${repoDir}candidates/thesis-cover_v3.1.svg`;
    expect(existsSync(file), `missing regression fixture ${file}`).toBe(true);
    expectReproduces(file, coverParams({}, "candidate_v31"));
  });
});
