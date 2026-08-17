# Thesis cover

**[Open the generator](https://mharlass.github.io/thesis-cover/)**

A fast, static TypeScript application for designing a PhD thesis cover wrap:
back, spine, and front on one sheet. The artwork is cohort-ridge line art
after Supplementary Figure 3 of the thesis, with one line per simulated birth
cohort and highlighted risk strata.

For users, everything runs in the browser. There is no account, server, or
runtime to install. Settings update the previews immediately and are written
to the URL, so a design can be shared as a link.

Use **Save current** to store a named preset in the current browser profile.
Saved presets remain local to that browser. Use the URL when a preset needs to
be shared or opened elsewhere.

The built-in **Contour relief** preset demonstrates the optional depth
treatment. It adds a restrained dark lower edge beneath each cohort line so
the ridge resembles mountain contours viewed from the side. The **Contour
depth** control ranges from the original appearance at 0 to the strongest
relief at 1.

## Downloads

| Format | Intended use |
| --- | --- |
| **SVG** | Editable vector artwork for the printer, with live text and both Inter faces referenced as web fonts. |
| **PDF** | Portable vector artwork with both Inter faces embedded. |
| **PNG** | A 300 dpi raster preview for review or presentation slides. |

The default full wrap is 358 × 246 mm: two 170 × 240 mm panels, 3 mm bleed,
and a 12 mm spine. The spine width is a placeholder. Set the final width from
the printer's page-count calculation and inspect the resulting layout before
handoff.

## Development

The application lives in `web/` and uses TypeScript, Preact, Canvas 2D, SVG,
and PDF emitters.

```sh
cd web
npm install
npm run dev
npm test
npm run build
```

`npm run build` writes the static site to the repository-root `../_site/`. To
compare the Canvas, SVG, and PDF renderers locally, install Chromium for
Playwright plus `pdftocairo` and `uv`, then run:

```sh
cd web
npx playwright install chromium
node scripts/render_samples.mjs
```

The comparison script writes sample images and reports pixel differences. Its
output still needs visual inspection because the PDF intentionally approximates
the SVG glow.

## Architecture

`coverParams()` validates settings, `coverGeometry()` produces the sampled
ridge, and `buildScene()` creates one renderer-independent description of the
artwork. The Canvas preview, SVG download, and PDF download all consume that
scene. Regression fixtures preserve the established geometry, including
random-number stream order and the two checked-in legacy covers.

PNG export rasterizes the same inline SVG used by the vector exporter. The PDF
implementation and fonts are loaded only when requested, keeping the initial
site download small.

[`AGENTS.md`](AGENTS.md) documents the architecture, reproducibility contract,
print conventions, and verification workflow in detail.

## Deployment

Pushing to `main` runs the TypeScript tests, builds `_site/`, and deploys that
artifact with GitHub Actions. GitHub Pages is configured to use the workflow
artifact rather than a branch directory.

## Licence

The cover uses [Inter](https://rsms.me/inter/) by Rasmus Andersson under the SIL
Open Font License 1.1. The browser subsets and licence are included in `web/`.
