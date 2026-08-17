import { describe, expect, it } from "vitest";

import { coverGeometry } from "../src/cover/geometry";
import { coverParams } from "../src/cover/params";
import { CONTOUR_SHADOW_COLOUR, buildScene } from "../src/cover/scene";

describe("contour relief", () => {
  it("adds no render-only strokes to the legacy default", () => {
    const geometry = coverGeometry(coverParams());
    const scene = buildScene(geometry, "wrap");
    const strata = geometry.lines.filter((line) => line.isStrata).length;

    expect(scene.ridge).toHaveLength(geometry.lines.length + strata);
    expect(scene.ridge.every((stroke) => stroke.offsetY === 0)).toBe(true);
  });

  it("adds one downward shadow per contour and keeps the original paths", () => {
    const geometry = coverGeometry(coverParams({}, "relief"));
    const scene = buildScene(geometry, "wrap");
    const shadows = scene.ridge.filter((stroke) => stroke.colour === CONTOUR_SHADOW_COLOUR);
    const original = scene.ridge.filter((stroke) => stroke.colour !== CONTOUR_SHADOW_COLOUR);

    expect(shadows).toHaveLength(geometry.lines.length);
    expect(shadows.every((stroke) => stroke.offsetY > 0)).toBe(true);
    expect(shadows[0].offsetY).toBeGreaterThan(shadows.at(-1)!.offsetY);
    expect(original.every((stroke) => stroke.offsetY === 0)).toBe(true);
  });
});
