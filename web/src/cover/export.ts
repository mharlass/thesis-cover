// Turning a cover into a file the browser will save.
//
// Three formats, and only one of them costs anything up front. SVG is a string
// this code already knows how to write; PNG is the same canvas the preview
// uses, at print resolution; PDF pulls in pdf-lib, which is why it is behind a
// dynamic import and nothing else here touches that module.

import { renderToCanvas } from "./canvas";
import type { CoverScene } from "./scene";
import { viewSize } from "./scene";
import { sceneToSvg } from "./svg";

export type Format = "svg" | "png" | "pdf";

/** Hand a blob to the browser as a download. */
function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Chrome needs the object URL to outlive the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Both vendored Inter faces as data URIs.
 *
 * An SVG loaded into an <img> — which is how it gets onto a canvas to be
 * rasterised — is not allowed to fetch anything, so a font referenced by URL
 * simply does not arrive. Both weights have to travel inside the file: the
 * title and the spine title are Medium, and falling back to Regular for those
 * sets them noticeably narrower.
 */
const FACE_URLS: Record<400 | 500, URL> = {
  400: new URL("../fonts/Inter-Regular.subset.woff2", import.meta.url),
  500: new URL("../fonts/Inter-Medium.subset.woff2", import.meta.url),
};

let inlineFonts: Promise<Record<400 | 500, string>> | null = null;

function interDataUris(): Promise<Record<400 | 500, string>> {
  inlineFonts ??= (async () => {
    const encode = async (url: URL) => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `url('data:font/woff2;base64,${btoa(binary)}') format('woff2')`;
    };
    const [regular, medium] = await Promise.all([encode(FACE_URLS[400]), encode(FACE_URLS[500])]);
    return { 400: regular, 500: medium } as Record<400 | 500, string>;
  })();
  return inlineFonts;
}

/** Render a scene to a PNG blob at a given resolution. */
export async function sceneToPng(scene: CoverScene, dpi = 300): Promise<Blob> {
  const canvas = document.createElement("canvas");
  renderToCanvas(canvas, scene, dpi / 25.4);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("The browser would not encode the PNG.");
  return blob;
}

/**
 * Download a cover.
 *
 * @param scene What to draw.
 * @param format Output format.
 * @param dpi Resolution for PNG output.
 */
export async function downloadCover(scene: CoverScene, format: Format, dpi = 300): Promise<void> {
  const name = `thesis-cover${scene.view === "front" ? "-front" : ""}.${format}`;
  switch (format) {
    case "svg":
      save(new Blob([sceneToSvg(scene)], { type: "image/svg+xml" }), name);
      return;
    case "png":
      save(await sceneToPng(scene, dpi), name);
      return;
    default: {
      const { sceneToPdf } = await import("./pdf");
      const bytes = await sceneToPdf(scene);
      save(new Blob([bytes as BlobPart], { type: "application/pdf" }), name);
    }
  }
}

/**
 * The scene as a self-contained SVG data URL, with Inter embedded.
 *
 * Used by nothing in the running app — the previews draw on canvas — but it is
 * what makes an SVG rasterisable, and it is the honest way to check that the
 * canvas and the SVG agree.
 */
export async function sceneToInlineSvg(scene: CoverScene): Promise<string> {
  return sceneToSvg(scene, { fontSources: await interDataUris(), inline: true });
}

/** Physical size of a view, for the specification table. */
export { viewSize };
