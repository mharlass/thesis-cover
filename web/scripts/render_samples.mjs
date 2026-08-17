// Render the same cover through all three emitters and compare them.
//
//   node scripts/render_samples.mjs [outDir]        (from web/)
//
// The app draws on canvas, downloads SVG, and builds PDFs out of raw PDF
// operators. Those are three separate pieces of drawing code walking one scene
// description, and nothing short of looking at the output will tell you they
// still agree. This renders each to PNG at the same size, reports the pixel
// difference between them, and leaves the images behind to be inspected.
//
// Needs playwright's chromium, poppler's pdftocairo for the PDF, and uv for
// the image comparison. Starts its own Vite dev server.

import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const webDir = fileURLToPath(new URL("..", import.meta.url));
const outDir = process.argv[2] ?? join(webDir, "scratch", "samples");
mkdirSync(outDir, { recursive: true });

// 358 mm at 4 px/mm: enough to see the type and the ridge, small enough to look at.
const PX_PER_MM = 4;
const PORT = 5199;

const cases = [
  { name: "default", params: {}, preset: "default" },
  { name: "candidate_v31", params: {}, preset: "candidate_v31" },
  { name: "guides", params: { show_guides: true }, preset: "default" },
];

const server = spawn(
  "npx",
  ["vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"],
  { cwd: webDir, stdio: "ignore" },
);
process.on("exit", () => server.kill());

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the dev server never came up at ${url}`);
}

const base = `http://127.0.0.1:${PORT}/`;
await waitForServer(base);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const failures = [];
page.on("pageerror", (e) => failures.push(String(e)));
await page.goto(base);

const written = [];

for (const testCase of cases) {
  const rendered = await page.evaluate(
    async ({ testCase, pxPerMm }) => {
      const { coverGeometry } = await import("/src/cover/geometry.ts");
      const { coverParams } = await import("/src/cover/params.ts");
      const { buildScene, viewSize } = await import("/src/cover/scene.ts");
      const { renderToCanvas } = await import("/src/cover/canvas.ts");
      const { sceneToInlineSvg } = await import("/src/cover/export.ts");
      const { sceneToPdf } = await import("/src/cover/pdf.ts");
      const { fontsReady } = await import("/src/cover/measure.ts");
      await fontsReady();

      const params = coverParams(testCase.params, testCase.preset);
      const scene = buildScene(coverGeometry(params), "wrap");
      const size = viewSize(scene.dims, "wrap");

      const canvas = document.createElement("canvas");
      renderToCanvas(canvas, scene, pxPerMm);

      // The SVG is rasterised through an <img>, which is why it has to carry
      // its own copy of Inter; see sceneToInlineSvg.
      const svgText = await sceneToInlineSvg(scene);
      const image = new Image();
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      image.src = URL.createObjectURL(blob);
      await image.decode();
      const svgCanvas = document.createElement("canvas");
      svgCanvas.width = canvas.width;
      svgCanvas.height = canvas.height;
      svgCanvas.getContext("2d").drawImage(image, 0, 0, svgCanvas.width, svgCanvas.height);

      return {
        canvas: canvas.toDataURL("image/png"),
        svg: svgCanvas.toDataURL("image/png"),
        svgText,
        pdf: [...(await sceneToPdf(scene))],
        width: size.width,
        height: size.height,
      };
    },
    { testCase, pxPerMm: PX_PER_MM },
  );

  const path = (suffix) => join(outDir, `${testCase.name}-${suffix}`);
  writeFileSync(`${path("canvas")}.png`, Buffer.from(rendered.canvas.split(",")[1], "base64"));
  writeFileSync(`${path("svg")}.png`, Buffer.from(rendered.svg.split(",")[1], "base64"));
  writeFileSync(join(outDir, `${testCase.name}.svg`), rendered.svgText);

  const pdfPath = join(outDir, `${testCase.name}.pdf`);
  writeFileSync(pdfPath, Buffer.from(rendered.pdf));
  execFileSync("pdftocairo", [
    "-png",
    "-singlefile",
    "-scale-to-x",
    String(Math.round(rendered.width * PX_PER_MM)),
    "-scale-to-y",
    String(Math.round(rendered.height * PX_PER_MM)),
    pdfPath,
    path("pdf"),
  ]);

  written.push(testCase.name);
}

await browser.close();
server.kill();

if (failures.length > 0) {
  console.error("page errors:", failures);
  process.exitCode = 1;
}

// Compare the renderings. Canvas and SVG should agree closely: same browser,
// same scene, both with a real Gaussian blur. The PDF is expected to differ
// around the highlighted strata, because PDF has no blur and falls back to the
// stack of wider, fainter strokes described in scene.ts.
const COMPARE = `
import sys
import numpy as np
from PIL import Image

out_dir, names = sys.argv[1], sys.argv[2:]

def load(path):
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.int16)

for name in names:
    canvas = load(f"{out_dir}/{name}-canvas.png")
    svg = load(f"{out_dir}/{name}-svg.png")
    pdf = load(f"{out_dir}/{name}-pdf.png")
    print(name)
    for label, other in (("svg", svg), ("pdf", pdf)):
        if other.shape != canvas.shape:
            print(f"  canvas vs {label}: different sizes {canvas.shape} {other.shape}")
            continue
        diff = np.abs(canvas - other)
        over = (diff.max(axis=2) > 12).mean() * 100
        print(
            f"  canvas vs {label}: mean {diff.mean():5.2f}/255  "
            f"p99 {np.percentile(diff, 99):5.1f}  max {diff.max():3d}  "
            f"pixels differing by >12: {over:5.2f}%"
        )
`;

const report = execFileSync(
  "uvx",
  ["--quiet", "--from", "pillow", "--with", "numpy", "python3", "-c", COMPARE, outDir, ...written],
  { encoding: "utf8" },
);
console.log(report);
console.log(`wrote ${outDir}`);
