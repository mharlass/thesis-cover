# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A generator for a PhD thesis cover wrap (back · spine · front). The artwork is "cohort ridge" line art after Suppl. Fig. 3 of the thesis: one polyline per simulated birth cohort, with a few highlighted "risk strata" lines.

There are two implementations, and the split matters:

- **`app/R/` is the definition of the shared ridge geometry.** A tidyverse pipeline builds the geometry, ggplot2 draws its version, and it runs from the command line and as a local Shiny app.
- **`web/` is what people actually use.** A TypeScript port of that geometry plus browser-only scene treatments and UI state, drawing with no R at all and published to GitHub Pages at <https://mharlass.github.io/thesis-cover/>. `contour_depth` and locally saved presets deliberately exist only here.

The port exists because the site used to be the Shiny app compiled to WebAssembly, and a cold visit cost about 76 MB and 30–40 s before anything appeared. It is now about 120 kB and paints in well under a second. What that trade buys is speed; what it costs is a second implementation of the shared geometry, so see "Keeping the shared geometry in step" below before touching either.

## Commands

```sh
# The R pipeline — the definition of the shared ridge geometry
Rscript scripts/generate_cover.R                       # writes thesis-cover.svg
Rscript scripts/generate_cover.R --preset candidate_v31 --out cover.pdf
Rscript scripts/generate_cover.R --seed 7 --view front --out front.png
Rscript -e 'shiny::runApp("app")'                      # the app, locally
Rscript -e 'testthat::test_dir("tests/testthat")'      # the tests
Rscript scripts/dump_geometry_fixture.R                # refresh the port's fixture

# The browser build — what is published
cd web && npm install
npm run dev                                            # local dev server
npm test                                               # the port's tests
npm run build                                          # static site into _site/
node scripts/render_samples.mjs                        # compare all three emitters
../scripts/subset_fonts.sh                             # rebuild the Inter subsets
```

`render_samples.mjs` needs Playwright's Chromium, Poppler's `pdftocairo` and
`uv`. It reports pixel differences and leaves PNGs behind; inspect those
images, because it does not enforce a visual threshold.

Any parameter in `app/R/params.R`'s `PARAM_SPEC` can be passed to the CLI as `--name value`. Output format follows the file extension: `.svg`, `.pdf`, `.png`. Browser-only parameters in `web/src/cover/params.ts`, currently `contour_depth`, are not accepted by the R CLI.

R dependencies are managed with `renv`; run `renv::restore()` after cloning. `_site/` is build output and is gitignored — it is rebuilt by `.github/workflows/deploy-pages.yml` on every push to `main`.

## Architecture

### The R pipeline

`app/R/` defines the shared ridge geometry and the R-rendered artwork. Shiny sources that directory automatically and `scripts/generate_cover.R` sources it explicitly.

```
cover_params()    validated parameters, from defaults / a preset / a URL
      |
cover_geometry()  tibbles: dims, lines (one row per line per vertex),
      |           strata, text — no drawing
      +-- cover_ggplot()  a ggplot in millimetres
      +-- cover_save()    svglite / cairo_pdf / ragg to a file
```

Files, in the order Shiny loads them:

- `00-setup.R` — package attachments, `register_cover_fonts()`.
- `geometry.R` — `cover_dims()`, `cover_geometry()`, `cohort_style()`, `strata_lines()`, `cover_text()`.
- `noise.R` — `lcg_stream()`, `noise_at()`, `smoothstep()`, `gaussian_bump()`.
- `palette.R` — Nocturne tokens, `cohort_colour()`, `strata_colour()`.
- `params.R` — `PARAM_SPEC`, `cover_params()`, `PRESETS`.
- `render.R` — `cover_ggplot()`, `cover_save()`, `title_overflow()`.
- `url_state.R` — `cover_query()`, `cover_params_from_query()`.

### The browser build

`web/src/cover/` is the port, function for function, with no DOM dependency above `scene.ts`. `web/src/ui/` is a Preact interface over it — no framework beyond Preact and its signals, because the interface is fifteen sliders and two previews and anything heavier would dominate the download this rewrite existed to shrink.

```
coverParams()     shared geometry validation plus browser-only scene settings
      |
coverGeometry()   typed arrays: dims, xs, one Float64Array of y per line,
      |           strata, text — no drawing
buildScene()      one description of the picture: gradients, strokes, relief, type
      |
      +-- drawScene()    Canvas2D, for both previews and the PNG
      +-- sceneToSvg()   the file the printer gets
      +-- sceneToPdf()   raw PDF objects, loaded on demand
```

The scene in the middle is the point. Three emitters walking one description is what stops the preview and the download drifting apart; `web/scripts/render_samples.mjs` renders all three and diffs them, and is the check to run after touching any of them. Canvas and SVG currently agree to a mean of 0.35/255.

### Curves, not facets

`cover_geometry()` samples every line every 2 mm and the original generator joined those samples with `L` segments, which facets visibly at print size. `web/src/cover/path.ts` fits a uniform Catmull-Rom spline through the same samples and emits cubic Béziers instead.

The spline **interpolates**, so every vertex the regression fixtures pin is still exactly on the curve — this changes what happens between them and nothing else. Measured against the ridge evaluated 16× more finely, it halves the error the straight segments had (0.117 mm → 0.046 mm on the default cover, which is under one 300 dpi dot). The facets go away because the tangent is now continuous at every vertex, which is what the eye was actually picking up.

It costs file size: a `C` with six numbers where an `L` had two, so the downloaded SVG is about 2.6× the old one (the `candidate_v31` cover goes from 268 kB to 708 kB). `web/test/smoothing.test.ts` measures the accuracy claim rather than asserting it, and the obvious alternative — sampling more finely and keeping straight segments — was tried and rejected: it doubles the file again for a curve that is still faceted, just less so.

### Keeping the shared geometry in step

Two implementations of the same ridge geometry is exactly what this project spent its previous rewrite escaping, so the parity is enforced rather than hoped for. Three gates, all of which run in CI:

1. **`web/test/geometry.test.ts` against `web/test/fixtures/r-geometry.json`.** Twelve parameter sets, dumped from R by `scripts/dump_geometry_fixture.R`, covering the branches the legacy SVGs never reach: no strata, one stratum, colliding strata under heavy jitter, a fractional spine, both ends of the line-count range. Line styles, strata colours, text layout, and each line's ridge summarised by its sum, extremes and every twentieth sample — a single shifted PRNG draw moves the sum.
2. **`web/test/legacy-svg.test.ts`**, which is `tests/testthat/test-geometry-legacy.R` applied to the port: both reproduce the two checked-in covers vertex by vertex to within 0.01 mm.
3. **A freshness check in CI.** If `dump_geometry_fixture.R` produces a different file from the committed one, the R pipeline changed and the fixture is stale, and the build fails saying so.

**So: change the R geometry, and you must re-run `Rscript scripts/dump_geometry_fixture.R`, port the change, and commit both.** The freshness check will catch you if you forget; the port's tests will catch you if you update the fixture without porting.

This contract ends at `coverGeometry()`. A browser-only scene treatment may be
added after geometry is built when it has no R or Shiny counterpart. It must
default to no visual change, stay out of the PRNG and geometry fixture, and be
implemented in all affected browser emitters. `contour_depth` follows that
rule: `buildScene()` creates a low-edge relief stroke, and Canvas, SVG and PDF
all consume the same `offsetY` value.

Two things are deliberately *not* shared. R's `round()` breaks ties to even and JavaScript's `Math.round` does not, which shifts a cohort colour by one step and a stratum by one colormap index — `roundHalfEven()` in `palette.ts` exists only for that. And the viridis ramps are the exact 256-entry tables extracted from `viridisLite`, packed as hex strings, rather than re-derived.

### Adding parameters

For a shared geometry or R-rendering parameter, `PARAM_SPEC` in
`app/R/params.R` remains the definition. It feeds the R defaults, validation,
Shiny sidebar and URL state. Add the row there, port it to
`web/src/cover/params.ts`, regenerate the fixture, and implement both sides.

For an intentionally browser-only scene parameter, add the row only to
`web/src/cover/params.ts`. Keep its default equivalent to the existing scene,
apply it after `coverGeometry()`, cover it with scene tests, and run
`web/scripts/render_samples.mjs` to compare Canvas, SVG and PDF.

### Browser-only presets and contour relief

Named personal presets live in `web/src/ui/saved-presets.ts` under the
versioned local-storage key `thesis-cover:saved-presets:v1`. Each entry stores
the complete validated `CoverParams`, including title and author. Names are
trimmed, limited to 60 characters and unique without regard to case. Malformed
entries are ignored individually so one bad value does not hide the rest.

These presets belong to one browser profile. They are not synchronized and
their names never enter the URL. Selecting one restores its values, after
which the normal URL synchronization still creates a portable link for the
browser site. R can restore the shared parameters from that URL but ignores
browser-only values such as `contour_depth`.

`contour_depth` is also browser-only. Its default is 0, so legacy covers remain
unchanged. The `relief` preset sets it to 0.9. `buildScene()` interleaves a
dark, downward-offset low edge with each existing path. This creates shallow
occlusion and depth without changing the ridge vertices, colours, PRNG draw
order or R geometry.

### The PRNG contract

Reproducibility rests on `lcg_stream()` and the *order* in which its draws are consumed. `cover_geometry()` takes three ridge lattices, then one offset draw plus one lattice per line; weave runs on `seed + 101` and strata jitter on `seed + 202` so those sliders morph their own feature instead of rescrambling the image. Inserting a draw anywhere shifts everything after it and changes the artwork.

This is enforced by `tests/testthat/test-geometry-legacy.R`, which reproduces the two checked-in covers vertex by vertex to within 0.01 mm. **It is the project's regression test — if it fails, the artwork has silently changed.** It replaces the R/JavaScript diff earlier versions relied on.

### Geometry

All units are millimetres in SVG orientation: x left to right across the wrap, y top to bottom. `TRIM_WIDTH 170 × TRIM_HEIGHT 240`, `BLEED 3`, so the wrap is `2*BLEED + 2*TRIM_WIDTH + spine` wide (358 mm at the default 12 mm spine) by 246 mm tall. `front_x` is the front panel's left trim edge and anchors the title block, the ridge crest and the glow; most magic numbers in `cover_geometry()` are offsets from it.

### Fonts

The cover is set in Inter, which is neither installed in webR nor guaranteed on a contributor's machine, so `Inter-Regular.ttf` and `Inter-Medium.ttf` are vendored under `app/www/fonts/` (SIL OFL, licence alongside) and registered by `register_cover_fonts()`. Weight 500 is registered in the `bold` slot, which is why the title uses `fontface = "bold"`.

**Two backends have to be told about Inter separately.** `svglite` and `ragg` read the systemfonts registry, so `register_font()` covers SVG and PNG. `cairo_pdf()` does not read it — it goes through fontconfig, and left alone it finds no family called Inter and silently substitutes. That is not hypothetical: PDF export was set in Bitstream Vera Sans, visibly heavier and wider than Inter Medium, wide enough that `title_overflow()` no longer described what the PDF laid out, and nothing warned about it.

So `register_cover_fonts()` also writes a fontconfig file into the session's temporary directory and points `FONTCONFIG_FILE` at it. It lists the vendored directory, the platform's own font directories so a character Inter lacks still has a fallback, and one `target="scan"` rule that reassigns Inter Medium's weight to bold — without it fontconfig matches Regular and fakes the weight rather than using Medium, which is the same 500-in-the-bold-slot mapping the registry uses. fontconfig reads its configuration once, on first use, which is why this happens at startup rather than inside `cover_save()`. A `FONTCONFIG_FILE` the caller has already set is left alone.

The retired shinylive build's Cairo honoured it too, so its downloaded PDF
embedded `Inter-Regular` and `Inter-Medium` exactly as the command line did.
The published TypeScript app now embeds its TrueType subsets through
`pdf-lib`; `pdffonts` on either output remains the check.

`TEXT_BASELINE_RATIO` in `render.R` bridges SVG's baseline positioning and ggplot's bounding-box centring. It is **measured, not derived** — `test-render.R` renders text and checks the emitted baselines land within 0.1 mm of what `cover_text()` asked for, so the constant cannot drift unnoticed.

## Startup cost, and why the site is no longer R

The site used to be the Shiny app compiled to WebAssembly by `shinylive`. Nothing was generated ahead of time and there was no data payload — the artwork comes from a seed and the only assets are the two Inter faces — so what the browser downloaded was *code*: **76 MB** of it, reaching a first drawn frame in about 10 s on localhost and 30–40 s over the network.

| | size | ours? |
| --- | --- | --- |
| `R.wasm`, `library.data.gz`, loader, translations | ~41 MB | no — this is webR |
| CRAN packages, unpacked into the virtual filesystem | 33.5 MB | yes |
| `app.json` (code and the two fonts) | 1.1 MB | marginal |

The floor, given webR plus the SVG and font machinery, was around 56 MB, and `stringi` alone was 13.4 MB that could not be removed: the chain is `svglite → textshaping → stringi`, and `svglite` is what emitted the live-text SVG the printer needs. Nothing cached between visits either — GitHub Pages serves everything `max-age=600` with no way to change it, and webR reinstalls every package into a fresh virtual filesystem on each load.

So the drawing moved to the browser instead. Measured the same way, over a static server:

| | before (shinylive) | now (`web/`) |
| --- | --- | --- |
| transferred, cold visit | ~76 MB | **~116 kB** gzipped, 5 requests |
| first drawn frame | 30–40 s over the network | under a second |
| repeat visit | ~22 s, nothing cached | served from cache |
| slider response | debounced 400 ms, redrawn in R | repainted per animation frame |

Of the 116 kB, **90 kB is the two Inter subsets** and only 24 kB is the application. That is the shape to keep in mind before optimising anything: the code is no longer the cost. `pdf-lib` and `fontkit` are another 508 kB gzipped, which is why `pdf.ts` is behind a dynamic `import()` and nothing else in the app may import it at module scope — doing so would put half a megabyte back on every visit for a button most people never press.

The fonts are subsetted by `scripts/subset_fonts.sh` from the full faces in `app/www/fonts/`, which stay as they are for the R side. Latin plus the punctuation the cover uses takes each face from ~410 kB to ~45 kB as woff2. TrueType copies of the *same subset* are emitted alongside for the PDF, because pdf-lib cannot read woff2; using one glyph set for both is what stops the page and the PDF disagreeing about which characters exist.

## Gotchas

- **`bslib::font_face` masks `svglite::font_face`.** `cover_save()` names the svglite one explicitly. Without that, SVG download breaks inside the app while the CLI keeps working.
- **shinylive bundles what is installed locally.** `shinylive::export()` inspects the local library to decide what to ship; a package missing locally is *warned about and silently omitted*, and only fails once the page runs in a browser. After changing dependencies, check the build log for "no package called".
- **Do not install Inter system-wide to "fix" the font warning.** It looks like the obvious cure for `no font could be found for family "Inter"` and it breaks the project. `systemfonts::register_font()` refuses any name that collides with an installed family — "A system font called `Inter` already exists" — so `register_cover_fonts()` throws and the CLI, the app and the tests all stop working. Skipping registration is not a way out either: only Regular (400) and Medium (500) get installed, there is no Bold (700), and a bold request then resolves to whatever the matcher lands on next, which on one macOS machine was Noto Sans Syriac. The vendored-and-registered pair is what makes output identical on every machine and inside webR; keep it that way. The warning itself is harmless — it only appears when drawing through `grDevices::png()`, which nothing in the project does.
- **`args[c(TRUE, FALSE)]` on an empty vector returns `NA`**, not an empty vector. The CLI argument parser indexes with `seq()` for that reason.
- **`testServer()` does not evaluate the UI**, so inputs start `NULL` and tests must set them. It also cannot observe `update*Input()` round trips, so preset and URL restore are tested at the function level instead.
- **`plotOutput()` is 400 px tall unless something overrides it.** Both previews size themselves by aspect ratio from the server, so they need `height = "auto"` and the `.shiny-plot-output` rules in `app.R`. Without them the page still looks plausible and simply crops the cover — the ridge lives in the lower half, so what you get is an empty dark rectangle with a title on it.
- **bslib maps `$light` onto a dark shade under a dark theme**, which leaves `btn-outline-light` invisible. The secondary download buttons carry `.btn-cover` and are coloured from the Nocturne tokens instead.
- **`layout_columns()` wraps each card in its own stretched grid item.** Putting `align-self` on the card does nothing; a card that should keep its natural height opts out with `flex: 0 0 auto`.

### In the browser build

- **Saved presets are local, not shared data.** Do not put preset names in the URL or treat local storage as an authoritative source. Shared links remain the interchange format; storage entries must pass through `coverParams()` validation when read.
- **Contour relief is a scene treatment, not geometry.** Keep `contour_depth = 0` identical to the legacy scene and do not spend PRNG draws on it. Any change to the relief stroke has to reach Canvas, SVG and PDF through `RidgeStroke`, pass `scene.test.ts`, and be inspected in the images from `render_samples.mjs`.
- **An SVG that names only Inter Regular sets the title in Regular.** The cover uses Medium for the title, the spine title and the accent rule, and `font-weight: 400 500` on a single `@font-face` does *not* make the browser synthesise the other weight — it just uses the one face it has. This cost about 1.5 mm per title line and made the fit warning wrong. `sceneToSvg()` emits one `@font-face` per weight, and `sceneToInlineSvg()` embeds both. It is invisible on any machine that happens to have Inter installed, which is why `render_samples.mjs` exists.
- **An SVG loaded into an `<img>` may not fetch anything.** That is how it gets rasterised, so a font referenced by URL simply does not arrive and the type silently falls back to the platform sans. Rasterising goes through `sceneToInlineSvg()`, which embeds the faces as data URIs.
- **R's `round()` breaks ties to even; `Math.round` rounds half up.** Two places hit an exact `.5` — mixing `#3f424d` toward `#75798c` lands a channel on 78.5, and sampling a colormap at 0.3 lands the index on 76.5 — so the port would shift a cohort line and a stratum by one step. `roundHalfEven()` in `palette.ts` is there for exactly this and nothing else.
- **`ctx.filter` is not everywhere.** Safari only got canvas filters in 18.1, so `canvas.ts` feature-detects and falls back to `GLOW_HALOS`. Assigning an unsupported filter fails silently and you get crisp strata with no glow.
- **The edge fade needs an offscreen layer.** Fading each line's own opacity is a different sum and comes out visibly brighter — the same trap the ggplot renderer fell into. `drawRidge()` composites to a layer, applies the ramp with `destination-in`, then draws the layer once.
- **`plotOutput`'s 400 px problem has a canvas equivalent.** A canvas with no CSS height collapses; both previews set `aspect-ratio` from the scene and take their backing-store size from `clientWidth`, capped at 2× device pixel ratio so a wide window does not ask for a 40-megapixel canvas.
- **Nothing may import `pdf.ts` at module scope.** It is reached only through `await import("./pdf")` in `export.ts`. A static import puts pdf-lib and fontkit — 508 kB gzipped, four times the whole rest of the site — into the entry bundle.

## Print conventions

- The 12 mm spine is a placeholder. Final width comes from the printer's page-count calculation; it shifts `front_x` and therefore the whole front panel, so re-render and look afterwards.
- The title-scale slider reaches 1.6, but the current five-line title stops fitting the front panel's safe area just past 1.20. `title_overflow()` reports this; the app shows a warning and the CLI emits one.
- Guides are drawn only when `show_guides` is `TRUE`. The old SVG shipped them hidden in a `#guides` layer; they are drawn or absent now, in both renderers.
- Text stays live text. The downloaded SVG references both Inter faces as web fonts so it renders anywhere; convert to outlines for final print handoff.
- After any change, render the cover and actually look at it. Coordinate arithmetic here fails silently, off-canvas or under the fade. For the browser build that means `node scripts/render_samples.mjs`, which draws all three emitters and diffs them — a change that only breaks one of them is the likely kind.

## Known differences from the original hand-written SVG

All measured against `PhD Thesis Cover Design_v3/thesis-cover.svg`, which is also the regression fixture. The ggplot renderer and the browser renderer differ here, so the columns matter.

Four things ggplot could not express, which the browser build does again — it writes SVG directly, so it simply uses the features the original used:

| | ggplot (`app/R/`) | browser (`web/`) |
| --- | --- | --- |
| named layers (`#background`, `#ridge`, `#cohort-lines`, …) | gone; svglite emits its own structure | restored |
| strata glow | three stacked wider, fainter strokes (`GLOW_HALOS`) | real `feGaussianBlur`, as the original |
| letter-spacing | none; type sets marginally tight | restored (0.05 mm on the title, 0.5 on the author, 0.04 on the spine) |
| edge fade | flat background painted over the ends, ~3/255 error | the original's group `<mask>` |

Still different:

- **Strata colours come from the true 256-entry colormaps** rather than eight hard-coded stops per colormap. Closer to the real thing, and different from the original by at most about 20/255 in one channel at the yellow end of viridis. Both renderers.
- **svglite's `<svg>` header uses points**, not `358mm` with a `0 0 358 246` viewBox. Physical size is preserved, which is what the printer uses. R only — the browser build writes the original's millimetre header.
- **The ridge is a spline, not a polyline.** Same vertices, smooth between them; see "Curves, not facets". Browser only.

And three the browser build introduces:

- **Contour relief is optional and browser-only.** At `contour_depth > 0`, the scene adds a dark low edge beneath each line. The built-in `relief` preset uses 0.9; the default remains 0 and matches the R geometry without the extra strokes.
- **The PDF has no Gaussian blur.** PDF has no blur operator, so `pdf.ts` falls back to the same `GLOW_HALOS` stack ggplot used. This is the one place the PDF is knowingly not what the SVG shows. Do not "fix" it with a single wide stroke — that reads as a fat band rather than a glow, which is what it looked like before the stack went in.
- **PDF text is not kerned.** pdf-lib's `encodeText()` maps characters to glyphs without shaping, so it applies no GPOS kerning. The default title sets about 0.5 mm wider over 142 mm (0.35%) than the canvas and SVG do. Left alone deliberately: fixing it means bypassing pdf-lib's subsetting to emit a kerned `TJ` array, and SVG is the format the printer gets.

## Directory layout

- `app/` — the Shiny app and, in `app/R/`, the shared ridge geometry and R renderer.
- `web/` — the published site. `src/cover/` is the geometry port, browser scene and three emitters; `src/ui/` is the Preact interface and local preset store; `src/fonts/` holds the Inter subsets; `test/` covers parity, scene treatments and saved presets; `scripts/render_samples.mjs` is the visual comparison.
- `scripts/` — command-line entry points: `generate_cover.R`, `dump_geometry_fixture.R` (refreshes the port's fixture), `subset_fonts.sh`, and `build_site.R` (the old WebAssembly build, kept but no longer published).
- `tests/testthat/` — the R test suite.
- `PhD Thesis Cover Design/`, `PhD Thesis Cover Design_v3/` — **archive.** The original base-R SVG string writer, its 1:1 JavaScript mirror and the proprietary "dc" preview component, kept as reference and as fixtures for the regression test. Do not develop here. Note that the two checked-in `thesis-cover.svg` files are load-bearing: both implementations are tested against them.
- `candidates/` — SVGs downloaded from the old preview app. `thesis-cover_v3.1.svg` is reproduced exactly by the `candidate_v31` preset, whose settings were recovered from the file itself.
- `*/uploads/` — source material from the thesis project (`suppl_figure_3.pdf`, draft chapters, the title-page matter). **Gitignored on purpose**: it is unpublished work and this repository is public. Present locally, restorable from the `*.zip` snapshots. Reference inputs; do not modify.
