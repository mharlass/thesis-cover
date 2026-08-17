// The PDF is assembled from raw PDF objects — shadings, transparency groups
// and luminosity soft masks that pdf-lib has no API for — so it is worth
// checking that what comes out is a structurally sound file with the fonts
// actually embedded, rather than trusting that the operators were written
// correctly.
//
// The file is read back with pdf-lib rather than grepped: objects go into
// compressed object streams, so the dictionaries are not in the bytes as text.
//
// None of this checks that it *looks* right. That is done by rasterising the
// output and comparing it against the canvas and SVG renderings; see
// web/scripts/render_samples.mjs.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { coverGeometry } from "../src/cover/geometry";
import { coverParams } from "../src/cover/params";
import { sceneToPdf } from "../src/cover/pdf";
import { buildScene } from "../src/cover/scene";

const fontDir = new URL("../src/fonts/", import.meta.url);

async function fontBytes(weight: 400 | 500): Promise<ArrayBuffer> {
  const name = weight === 400 ? "Inter-Regular.subset.ttf" : "Inter-Medium.subset.ttf";
  const buffer = await readFile(fileURLToPath(new URL(name, fontDir)));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

/** Every indirect object in the file, as text, so dictionaries can be searched. */
async function objectsOf(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  return doc.context
    .enumerateIndirectObjects()
    .map(([, object]) => object.toString())
    .join("\n");
}

describe("the PDF export", () => {
  it("produces a document with both Inter faces embedded", async () => {
    const scene = buildScene(coverGeometry(coverParams({ show_guides: true })), "wrap");
    const bytes = await sceneToPdf(scene, fontBytes);

    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");

    const objects = await objectsOf(bytes);
    // Embedded, not merely referenced by name: a PDF that names Inter without
    // carrying it renders in whatever the viewer decides to substitute, which
    // is exactly the failure AGENTS.md records for the cairo build.
    expect(objects.match(/\/FontFile2/g)?.length).toBe(2);
    expect(objects).toMatch(/Inter-Regular/);
    expect(objects).toMatch(/Inter-Medium/);

    // The constructions the look depends on: axial and radial shadings, and
    // the luminosity masks that give PDF a gradient in the alpha channel.
    expect(objects).toMatch(/\/ShadingType 2/);
    expect(objects).toMatch(/\/ShadingType 3/);
    expect(objects).toMatch(/\/Luminosity/);
    expect(objects).toMatch(/\/Transparency/);
  });

  it("sizes the page to the wrap and to the trimmed front", async () => {
    const geometry = coverGeometry(coverParams());
    const pt = (mm: number) => (mm * 72) / 25.4;

    for (const [view, width, height] of [
      ["wrap", 358, 246],
      ["front", 170, 240],
    ] as const) {
      const bytes = await sceneToPdf(buildScene(geometry, view), fontBytes);
      const doc = await PDFDocument.load(bytes);
      const size = doc.getPage(0).getSize();
      expect(size.width).toBeCloseTo(pt(width), 1);
      expect(size.height).toBeCloseTo(pt(height), 1);
    }
  });

  it("draws the ridge inside a masked transparency group", async () => {
    // The edge fade has to apply to the composited ridge, not to each line's
    // own opacity — the difference AGENTS.md documents. Without the group the
    // cover would still render, just visibly brighter at both ends, so it is
    // worth asserting the structure rather than waiting to notice.
    const scene = buildScene(coverGeometry(coverParams()), "wrap");
    const doc = await PDFDocument.load(await sceneToPdf(scene, fontBytes));
    const objects = doc.context.enumerateIndirectObjects().map(([, o]) => o.toString());

    expect(objects.filter((o) => o.includes("/Group")).length).toBeGreaterThan(0);
    // One soft mask each for the glow, the fold and the edge fade.
    expect(objects.filter((o) => o.includes("/SMask")).length).toBeGreaterThanOrEqual(3);
  });
});
