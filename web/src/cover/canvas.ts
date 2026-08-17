// The cover on a canvas, for the two previews and the PNG download.
//
// Canvas is what makes the sliders feel live: a 300-line cover is roughly
// 55,000 vertices, and serialising that to SVG and handing it to the DOM on
// every drag is far slower than painting it. The same scene drives both, so
// the preview and the downloaded file cannot disagree about what the cover
// looks like.
//
// Everything is drawn in millimetres. The context is scaled once, up front, so
// no coordinate in here needs converting.

import { traceSmooth } from "./path";
import type { CoverScene, SceneGuide, SceneText, Stop } from "./scene";
import { GLOW_HALOS, viewSize } from "./scene";

/**
 * Whether this browser applies `ctx.filter`.
 *
 * The soft halo behind a stratum is a real Gaussian blur where the browser
 * supports one. Safari only gained canvas filters in 18.1, so the fallback
 * stacks progressively wider, fainter strokes.
 */
function supportsFilter(ctx: CanvasRenderingContext2D): boolean {
  try {
    ctx.filter = "blur(1px)";
    const ok = ctx.filter === "blur(1px)";
    ctx.filter = "none";
    return ok;
  } catch {
    return false;
  }
}

function withAlpha(colour: string, alpha: number): string {
  if (alpha >= 1) return colour;
  const n = parseInt(colour.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function linearGradient(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stops: Stop[],
): CanvasGradient {
  const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  for (const stop of stops) gradient.addColorStop(stop.offset, withAlpha(stop.colour, stop.alpha));
  return gradient;
}

/**
 * Draw a scene onto a context already scaled to millimetres.
 *
 * @param ctx Destination context.
 * @param scene What to draw.
 * @param pxPerMm Device pixels per millimetre, needed to size the blur.
 * @param makeLayer Creates an offscreen canvas the size of the destination,
 *   used to composite the ridge before the edge fade is applied to it.
 */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  scene: CoverScene,
  pxPerMm: number,
  makeLayer: () => CanvasRenderingContext2D | null,
): void {
  const { dims, viewBox } = scene;

  ctx.save();
  ctx.translate(-viewBox.x, -viewBox.y);
  ctx.clearRect(viewBox.x, viewBox.y, viewBox.width, viewBox.height);

  // Background wash and the glow behind the ridge crest.
  ctx.fillStyle = linearGradient(ctx, 0, 0, 0, dims.height, scene.background);
  ctx.fillRect(0, 0, dims.width, dims.height);

  const { glow } = scene;
  ctx.save();
  ctx.translate(glow.cx, glow.cy);
  ctx.scale(glow.rx, glow.ry);
  const radial = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const stop of glow.stops) radial.addColorStop(stop.offset, withAlpha(stop.colour, stop.alpha));
  ctx.fillStyle = radial;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawRidge(ctx, scene, pxPerMm, makeLayer);

  // The shadow that reads as the fold between back and spine.
  ctx.fillStyle = linearGradient(
    ctx,
    scene.fold.x,
    0,
    scene.fold.x + scene.fold.width,
    0,
    scene.fold.stops,
  );
  ctx.fillRect(scene.fold.x, 0, scene.fold.width, dims.height);

  ctx.fillStyle = scene.tick.colour;
  ctx.fillRect(scene.tick.x, scene.tick.y, scene.tick.width, scene.tick.height);
  for (const text of scene.texts) drawText(ctx, text);
  for (const guide of scene.guides) drawGuide(ctx, guide);

  ctx.restore();
}

/**
 * Paint the ridge, faded into the background at both ends of the wrap.
 *
 * The original masked the whole composited ridge; fading each line's own
 * opacity instead sums differently and comes out visibly brighter. So the
 * lines go onto their own layer, the layer is masked with a horizontal ramp,
 * and the result is composited in one go. If an offscreen canvas is not
 * available the ridge is drawn directly and the ends simply do not fade,
 * which is wrong but visible rather than silently broken.
 */
function drawRidge(
  ctx: CanvasRenderingContext2D,
  scene: CoverScene,
  pxPerMm: number,
  makeLayer: () => CanvasRenderingContext2D | null,
): void {
  const layer = makeLayer();
  const target = layer ?? ctx;
  if (layer) {
    layer.setTransform(ctx.getTransform());
  }

  const canBlur = supportsFilter(target);
  for (const stroke of scene.ridge) {
    target.save();
    if (stroke.offsetY !== 0) target.translate(0, stroke.offsetY);
    target.lineCap = "butt";
    target.lineJoin = "round";
    target.strokeStyle = stroke.colour;

    if (stroke.blur > 0 && !canBlur) {
      target.lineCap = "round";
      for (const halo of GLOW_HALOS) {
        target.globalAlpha = stroke.alpha * halo.alpha;
        target.lineWidth = stroke.width * halo.width;
        target.beginPath();
        traceSmooth(target, scene.xs, stroke.ys);
        target.stroke();
      }
      target.restore();
      continue;
    }

    target.filter = stroke.blur > 0 ? `blur(${stroke.blur * pxPerMm}px)` : "none";
    target.globalAlpha = stroke.alpha;
    target.lineWidth = stroke.width;
    target.beginPath();
    traceSmooth(target, scene.xs, stroke.ys);
    target.stroke();
    target.restore();
  }
  target.filter = "none";
  target.globalAlpha = 1;

  if (!layer) return;

  // destination-in keeps the layer only where the ramp is opaque.
  layer.globalCompositeOperation = "destination-in";
  layer.fillStyle = linearGradient(layer, 0, 0, scene.dims.width, 0, scene.fade);
  layer.fillRect(0, 0, scene.dims.width, scene.dims.height);
  layer.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(layer.canvas, 0, 0);
  ctx.restore();
}

function drawText(ctx: CanvasRenderingContext2D, text: SceneText): void {
  ctx.save();
  ctx.translate(text.x, text.y);
  // Geometry records clockwise rotation as negative; canvas and SVG use
  // clockwise-positive angles.
  if (text.angle !== 0) ctx.rotate((-text.angle * Math.PI) / 180);
  ctx.font = `${text.weight} ${text.size}px Inter, sans-serif`;
  ctx.letterSpacing = `${text.tracking}px`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = text.colour;
  ctx.fillText(text.label, 0, 0);
  ctx.letterSpacing = "0px";
  ctx.restore();
}

function drawGuide(ctx: CanvasRenderingContext2D, guide: SceneGuide): void {
  ctx.save();
  ctx.setLineDash(guide.dash ?? []);
  ctx.strokeStyle = guide.colour;
  ctx.fillStyle = guide.colour;
  ctx.lineWidth = guide.strokeWidth ?? 0.25;
  switch (guide.kind) {
    case "rect":
      ctx.strokeRect(guide.x, guide.y, guide.width!, guide.height!);
      break;
    case "line":
      ctx.beginPath();
      ctx.moveTo(guide.x, guide.y);
      ctx.lineTo(guide.x2!, guide.y2!);
      ctx.stroke();
      break;
    default:
      ctx.font = `400 ${guide.size}px Inter, sans-serif`;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(guide.label!, guide.x, guide.y);
  }
  ctx.restore();
}

/**
 * Size a canvas for a view and return a context scaled to millimetres.
 *
 * @param canvas Destination canvas.
 * @param scene What will be drawn.
 * @param pxPerMm Device pixels per millimetre.
 */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  scene: CoverScene,
  pxPerMm: number,
): CanvasRenderingContext2D | null {
  const size = viewSize(scene.dims, scene.view);
  canvas.width = Math.round(size.width * pxPerMm);
  canvas.height = Math.round(size.height * pxPerMm);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(pxPerMm, 0, 0, pxPerMm, 0, 0);
  return ctx;
}

/** Paint a scene onto a canvas at a given resolution. */
export function renderToCanvas(
  canvas: HTMLCanvasElement,
  scene: CoverScene,
  pxPerMm: number,
): void {
  const ctx = prepareCanvas(canvas, scene, pxPerMm);
  if (!ctx) return;
  drawScene(ctx, scene, pxPerMm, () => {
    const layer = document.createElement("canvas");
    layer.width = canvas.width;
    layer.height = canvas.height;
    return layer.getContext("2d");
  });
}
