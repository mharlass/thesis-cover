// The download panel, the fit warning and the specification table.

import { useState } from "preact/hooks";

import { downloadCover, type Format } from "../cover/export";
import { titleOverflow } from "../cover/measure";
import { fontsLoaded, geometry, params, wrapScene } from "./state";

export function Downloads() {
  const [busy, setBusy] = useState<Format | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (format: Format) => {
    setBusy(format);
    setError(null);
    try {
      await downloadCover(wrapScene.value, format);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  // Measuring type needs the real face; before it loads the browser answers
  // with the fallback's metrics, which would raise a warning that is not true.
  const overflow = fontsLoaded.value ? titleOverflow(params.value) : -1;
  const dims = geometry.value.dims;

  return (
    <section class="panel">
      <h2>Download</h2>

      {overflow > 0 && (
        <p class="warning">
          The title runs {overflow.toFixed(1)} mm past the front panel’s safe area. Reduce the
          title scale or shorten the longest line.
        </p>
      )}

      <div class="buttons">
        <button class="primary" disabled={busy !== null} onClick={() => run("svg")}>
          {busy === "svg" ? "Preparing…" : "SVG (vector, for the printer)"}
        </button>
        <button disabled={busy !== null} onClick={() => run("pdf")}>
          {busy === "pdf" ? "Building the PDF…" : "PDF"}
        </button>
        <button disabled={busy !== null} onClick={() => run("png")}>
          {busy === "png" ? "Rendering…" : "PNG (300 dpi)"}
        </button>
      </div>

      {error && <p class="warning">{error}</p>}

      <dl class="spec">
        {(
          [
            ["Trim", `${dims.trimWidth} × ${dims.trimHeight} mm`],
            ["Bleed", `${dims.bleed} mm`],
            ["Spine", `${dims.spine} mm`],
            ["Wrap", `${dims.width} × ${dims.height} mm`],
            ["Seed", String(params.value.seed)],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
