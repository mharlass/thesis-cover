# AGENTS.md

## What this is

This repository publishes a browser-based generator for a PhD thesis cover
wrap: back, spine, and front. The artwork is cohort-ridge line art after
Supplementary Figure 3 of the thesis, with one line per simulated birth cohort
and selected risk-strata lines highlighted above the rest.

The maintained implementation is entirely under `web/`. It is a static
TypeScript application using Preact and signals for the interface. It has no
server runtime. GitHub Pages publishes the Vite build from `_site/`.

## Commands

```sh
cd web
npm install
npm run dev                         # local Vite server
npm test                            # regression and exporter tests
npm run check                       # TypeScript type check
npm run build                       # production site in ../_site/
npm run preview                     # preview the production build
node scripts/render_samples.mjs     # compare Canvas, SVG, and PDF output
```

`render_samples.mjs` needs Playwright Chromium, `pdftocairo`, and `uv`. Install
the browser with `npx playwright install chromium`. The script reports pixel
differences and writes images for inspection. It does not enforce a pass/fail
threshold because the PDF deliberately approximates the SVG glow.

`_site/` is generated output and is gitignored. The deployment workflow
rebuilds it on every push to `main`.

## Architecture

The drawing pipeline has three boundaries:

```text
coverParams()     validated settings and built-in presets
      |
coverGeometry()   dimensions, sampled x positions, ridge lines, strata, text
      |
buildScene()      gradients, masks, ordered strokes, and type
      |
      +-- drawScene()    Canvas 2D previews and PNG source
      +-- sceneToSvg()   editable SVG download
      +-- sceneToPdf()   PDF download, loaded on demand
```

`web/src/cover/` contains the drawing pipeline and has no UI dependency above
`scene.ts`. `web/src/ui/` contains the Preact controls, preview components,
download actions, and browser-local preset state.

The scene is the consistency boundary. Canvas, SVG, and PDF must walk the same
ordered strokes rather than independently reconstructing the artwork. After
changing drawing behavior, run `node scripts/render_samples.mjs` and inspect
all emitted images.

### Geometry regression contract

`web/test/fixtures/geometry-regression.json` freezes twelve representative
parameter sets. `web/test/geometry.test.ts` checks page dimensions, ridge
summaries, sampled vertices, line styles, strata selection, colors, and text
layout against that fixture. It also protects pseudo-random stream order: one
shifted draw changes a line sum and fails the test.

`web/test/legacy-svg.test.ts` compares the generated vertices with the two
checked-in legacy SVG covers to within 0.01 mm. The archived SVGs are
load-bearing regression fixtures and must not be edited.

If geometry is intentionally changed, update the implementation and regression
fixture together, explain the expected visual difference, and render the cover
before accepting the new baseline. Do not loosen tolerances to hide drift.

### Parameters and URL state

`web/src/cover/params.ts` defines parameter defaults, validation, labels,
ranges, and built-in presets. Add a parameter there, then wire it into geometry
or scene construction as appropriate. The controls iterate over that
specification, so ordinary slider parameters need no separate UI definition.

`web/src/cover/url-state.ts` serializes all non-default settings into the query
string. A shared URL must reproduce the complete browser design. New parameters
therefore need query-string coverage in `web/test/params.test.ts`.

### Saved presets

Saved presets are browser-local UI state implemented in
`web/src/ui/saved-presets.ts`. They use the versioned storage key
`thesis-cover:saved-presets:v1`. Every stored value is passed through
`coverParams()` when read, so malformed or outdated data cannot bypass normal
validation.

Names are trimmed, limited to 60 characters, and unique without regard to
case. They may not collide with built-in preset labels. Presets are stored in
one browser profile only; URL state is the portable representation.

### Contour relief

`contour_depth` is a scene treatment. Its default is 0, which must produce the
established cover with no additional strokes. The built-in `relief` preset uses
0.9.

`buildScene()` adds a dark stroke with a small positive `offsetY` immediately
before each cohort line. Interleaving the shadow and visible stroke preserves
the visual stacking order. Canvas, SVG, and PDF each apply the offset in their
own emitter. Keep this logic in the shared scene rather than duplicating the
effect in individual exporters.

### Curves

The geometry samples every line at 2 mm intervals. `web/src/cover/path.ts`
fits a uniform Catmull-Rom spline through those samples and emits cubic Bézier
segments. The spline interpolates every regression-pinned vertex while keeping
tangents continuous between them.

`web/test/smoothing.test.ts` measures the spline against a more finely sampled
ridge. Do not replace it with denser straight segments without rechecking both
accuracy and SVG size.

### Pseudo-random number contract

Reproducibility rests on the linear-congruential stream in
`web/src/cover/noise.ts` and the order in which values are consumed.
`coverGeometry()` takes three ridge lattices, then one offset draw plus one
lattice per line. Weave uses `seed + 101`, and strata jitter uses `seed + 202`,
so those controls can change their own features without rescrambling the full
image.

Inserting or removing a draw shifts everything after it. Treat stream order as
part of the public output contract.

## Dimensions

All scene units are millimeters in SVG orientation: x increases left to right
and y increases top to bottom. Each panel trims to 170 × 240 mm with 3 mm bleed.
At the default 12 mm spine, the full wrap is 358 × 246 mm.

`frontX` is the front panel's left trim edge. It anchors the title block, ridge
crest, and glow. Changing the spine width shifts the front panel, so inspect the
result after entering the printer's final spine calculation.

## Rendering details

### Fonts

The site uses subsetted Inter Regular and Medium faces under `web/src/fonts/`.
Full licensed source faces live under `web/fonts/`; regenerate the subsets with
`scripts/subset_fonts.sh`.

Vite hashes the browser assets. PDF export uses TrueType copies of the same
glyph subset because the PDF library cannot read WOFF2. Both formats are
generated from one glyph set so browser and PDF output cannot disagree about
character availability.

The title, spine title, and accent rule use Inter Medium. SVG generation must
emit a separate `@font-face` for each weight. A single face declared across a
weight range silently renders the title in Regular on machines without Inter
installed.

SVG rasterization uses `sceneToInlineSvg()`, which embeds both font faces as
data URLs. An SVG loaded through `<img>` cannot be trusted to fetch external
font URLs.

### Canvas

Both previews set their CSS aspect ratio from the scene and derive backing-store
dimensions from `clientWidth`. Device pixel ratio is capped at 2 to avoid
allocating unnecessarily large canvases.

Canvas filters are feature-detected. When blur is unavailable, strata glow
falls back to the shared halo stack. The edge fade is applied to an offscreen
ridge layer with `destination-in`; fading each stroke independently produces a
different and visibly brighter sum.

### SVG

SVG is the preferred printer handoff. It keeps text live, restores named layer
groups, uses Gaussian blur for strata glow, and applies the edge fade with a
group mask. The root element uses millimeter dimensions and a matching viewBox.

### PDF

Nothing may import `web/src/cover/pdf.ts` at module scope. It must remain behind
the dynamic import in `export.ts`; otherwise the PDF and font libraries add
roughly half a megabyte of compressed JavaScript to every visit.

PDF has no blur operator, so its glow uses stacked halo strokes. PDF text is not
kerned because the library maps characters to glyphs without shaping. The
default title is about 0.35% wider than Canvas and SVG. These are known exporter
differences, not reasons to introduce separate scene geometry.

## Print conventions

- The 12 mm spine is a placeholder. Re-enter the printer's final value and
  inspect the cover before handoff.
- The current five-line title exceeds the safe area just above a title scale of
  1.20. The UI reports overflow even though the control allows values to 1.6.
- Guides appear only when `show_guides` is enabled.
- Keep text live in generated SVG. Convert it to outlines only for final print
  delivery if the printer requests it.
- Render and inspect every changed figure. Coordinate mistakes can remain valid
  code while placing content off-canvas or beneath the fade.

## Deployment

`.github/workflows/deploy-pages.yml` has one build job and one deploy job. The
build job installs Node dependencies, runs the TypeScript tests, builds `_site/`,
and uploads that directory as the Pages artifact. The deploy job depends only
on that build job.

GitHub Pages must remain configured with `build_type: workflow`. A successful
build without a successful deploy leaves the previous artifact live, so verify
the deployment job and the public HTML after changing the workflow.

## Directory layout

- `web/src/cover/` — geometry, scene construction, and Canvas/SVG/PDF emitters.
- `web/src/ui/` — controls, previews, downloads, URL state integration, and
  saved presets.
- `web/src/fonts/` — browser and PDF font subsets imported by the application.
- `web/fonts/` — full Inter source faces used to regenerate subsets.
- `web/test/` — geometry, legacy-cover, smoothing, PDF, scene, parameter, and
  preset tests.
- `web/scripts/render_samples.mjs` — cross-emitter rendering and visual samples.
- `scripts/subset_fonts.sh` — reproducible Inter subsetting.
- `candidates/` and the two legacy design directories — reference artwork and
  regression inputs. Do not develop the maintained application there.
