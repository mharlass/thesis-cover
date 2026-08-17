# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A generator for a PhD thesis cover wrap (back · spine · front) rendered as a single print-ready SVG. The artwork is "cohort ridge" line art after Suppl. Fig. 3 of the thesis: one polyline per simulated birth cohort, with a few highlighted "risk strata" lines. Not a git repository; versions are kept as parallel directories and zips.

## Commands

All commands run from inside a version directory (e.g. `PhD Thesis Cover Design_v3/`).

```sh
Rscript generate_cover.R          # canonical: writes thesis-cover.svg (base R, no packages)
node run-cover.mjs                # same SVG from the JS path (only present in "PhD Thesis Cover Design/")
```

Verify the two implementations still agree (this is the project's only real test):

```sh
node run-cover.mjs && mv thesis-cover.svg js.svg
Rscript generate_cover.R
diff js.svg thesis-cover.svg      # expected: identical except R's trailing newline
```

Confirmed for v3: byte-identical apart from the final newline, and the R output matches the checked-in `thesis-cover.svg` exactly.

Previewing:

- `Thesis Cover (standalone).html` — self-contained bundle of the interactive app; open directly in a browser.
- `Thesis Cover.dc.html` — the app source; needs `support.js` and `_ds/` alongside it and a static server (`python3 -m http.server`), not `file://`.
- `tools/svg-view.html` — bare full-bleed render; `fetch`es `../thesis-cover.svg`, so it also needs a static server.

Parameters live in one place per implementation: `DEFAULTS` in `cover-generator.js`, `params` in `generate_cover.R`. Change them there and re-run rather than editing the SVG.

## Architecture

### One algorithm, two mirrored implementations

`cover-generator.js` (ES module, `buildCoverSVG(opts)`) and `generate_cover.R` (base R, `build_cover_svg(p)`) are line-for-line mirrors: same PRNG, same draw order, same constants, same emitted markup. **Any change to one must be made in the other and verified with the diff above.** Parity is only possible because both round every coordinate through `fmt` (2 dp) before printing.

What makes the mirror fragile:

- **PRNG**: Lehmer LCG (`s = s * 16807 % 2147483647`), chosen because it stays exact in doubles in both languages. The *order* of `rng()` draws is part of the contract — `makeLattice`/`make_lattice` consumes a variable number of draws, so inserting a call anywhere shifts everything downstream.
- **Three independent streams**: the main `seed`, `seed + 101` (weave), `seed + 202` (strata jitter). They are separate so moving one slider morphs its own feature instead of rescrambling the whole image.
- **Indexing**: R's `path_for(i0)` takes a *zero-based* index and indexes `lats[[i0 + 1]]` to keep the JS loop structure intact. Keep this convention.

### Geometry

All units are millimetres, matching the SVG's `viewBox` 1:1. `TRIM_W 170 × TRIM_H 240`, `BLEED 3`, so the wrap is `2*BLEED + 2*TRIM_W + spine` wide (358 mm at the default 12 mm spine) by `TRIM_H + 2*BLEED` tall. `FX = BLEED + TRIM_W + spine` is the front panel's left trim edge and anchors the title block, the ridge crest, and the glow ellipse — most magic numbers in `hAt`/`h_at` are offsets from it.

The ridge is a composition of scalar functions of `x`: `hAt` (crest height, a sum of smoothsteps, Gaussians and two noise lattices), `bottomAt` (baseline drift), `spreadAt` (fan-out toward the front). Line `i` is that profile scaled by rank `f = i/(N-1)` plus per-line noise.

Output layer ids are stable and meaningful for downstream print work: `background`, `ridge` (containing `cohort-lines` and `strata-lines`), `fold-shading`, `spine-text`, `front-text`, `guides`.

### Interactive preview

`Thesis Cover.dc.html` is a "dc" component: the `data-props` attribute on the inline script is a JSON schema of editor controls (range/int/enum/boolean, grouped into Print / Type / Line art / Strata sections) that the runtime turns into a control panel. The class body maps those props to generator options in `_params()`, calls `buildCoverSVG`, and injects the result twice — full wrap, plus a front-only view produced by overriding the `viewBox` to `FX 3 170 240`. **Adding a parameter means touching four places**: `data-props`, `_params()`, `DEFAULTS`, and `params` in the R file.

`support.js` is the generated dc runtime (`// GENERATED … do not edit`) and `_ds/nocturne-.../` is the vendored Nocturne design system. Treat both as vendored assets. The generators' hard-coded `C` / `COL` hexes are a deliberate copy of the Nocturne tokens in `_ds/.../styles.css` (bg `#161826`, text `#e9e9ed`, accent `#9184d9`, plus the neutral ramp) — keep them in step if the design system changes.

### Directory layout

- `PhD Thesis Cover Design/` — v1. Fixed strata fractions; the only directory with `run-cover.mjs`.
- `PhD Thesis Cover Design_v3/` — current. Adds `strataWidth`, `strataSpread`, `strataJitter`, `dispersion`, `weave`, `lineAlpha`, `titleScale` and viridis-family `palette` options, and replaces v1's fixed strata fractions with crest-first spacing down the stack. Work here unless told otherwise; copy `run-cover.mjs` in if you need the JS path.
- `*.zip` — snapshots of each version as delivered; v2 exists only as a zip.
- `candidates/` — SVGs downloaded from the preview app, not regenerable from the checked-in defaults (v3.x are ~100 lines, 4 viridis strata, stroke width 1.0 / 0.9).
- `uploads/` — source material from the thesis project (`suppl_figure_3.pdf`, `index.qmd`, `01_introduction.qmd`, `fig_render.png`). Reference inputs; do not modify.

## Print conventions

- The 12 mm spine is a placeholder. Final width comes from the printer's page-count calculation; changing it shifts `FX` and therefore the whole front panel, so always re-render and inspect afterwards.
- `guides` (trim, fold, safe area, dimension label) ships in every SVG with `display="none"`; enable via `show_guides` / `showGuides` rather than hand-editing.
- Text is emitted as live SVG `<text>` in Inter, pulled from Google Fonts by an `@import` in the SVG's own `<style>`. Inter must be installed for local editing, and text should be converted to outlines for final print handoff.
- After any change, actually render the SVG and look at it (`tools/svg-view.html` or the preview app) — coordinate arithmetic here fails silently, off-canvas or behind the fade mask.
