// A cover preview on a canvas.
//
// The canvas is sized from the element's own width and the device pixel ratio,
// and repainted whenever the scene or that width changes. Painting is deferred
// to an animation frame so that dragging a slider coalesces into one repaint
// per frame instead of one per input event — which is what makes a 300-line
// cover keep up with the mouse.

import { useEffect, useRef } from "preact/hooks";

import { renderToCanvas } from "../cover/canvas";
import type { CoverScene } from "../cover/scene";
import { viewSize } from "../cover/scene";

interface PreviewProps {
  scene: CoverScene;
  /** Set once Inter has loaded; a repaint before that sets the wrong type. */
  ready: boolean;
  label: string;
}

export function Preview({ scene, ready, label }: PreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frame = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const paint = () => {
      const width = canvas.clientWidth;
      if (width === 0) return;
      const size = viewSize(scene.dims, scene.view);
      // Cap the backing store so a wide window does not ask for a 40-megapixel
      // canvas; 2× the CSS size is past what any display resolves.
      const pxPerMm = (width / size.width) * Math.min(window.devicePixelRatio || 1, 2);
      renderToCanvas(canvas, scene, pxPerMm);
    };

    const schedule = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(paint);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(frame.current);
      observer.disconnect();
    };
  }, [scene, ready]);

  const size = viewSize(scene.dims, scene.view);
  return (
    <canvas
      ref={canvasRef}
      class="preview"
      aria-label={label}
      style={{ aspectRatio: `${size.width} / ${size.height}` }}
    />
  );
}
