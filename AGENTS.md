# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A generator for a PhD thesis cover wrap (back · spine · front). The artwork is "cohort ridge" line art after Suppl. Fig. 3 of the thesis: one polyline per simulated birth cohort, with a few highlighted "risk strata" lines.

It is an R project. A tidyverse pipeline builds the geometry, ggplot2 draws it, and the same code runs three ways: from the command line, as a local Shiny app, and as that app compiled to WebAssembly and published to GitHub Pages at <https://mharlass.github.io/thesis-cover/>.

## Commands

```sh
Rscript scripts/generate_cover.R                       # writes thesis-cover.svg
Rscript scripts/generate_cover.R --preset candidate_v31 --out cover.pdf
Rscript scripts/generate_cover.R --seed 7 --view front --out front.png
Rscript -e 'shiny::runApp("app")'                      # the app, locally
Rscript scripts/build_site.R                           # WebAssembly build into _site/
Rscript -e 'testthat::test_dir("tests/testthat")'      # the tests
```

Any parameter in `PARAM_SPEC` can be passed to the CLI as `--name value`. Output format follows the file extension: `.svg`, `.pdf`, `.png`.

Dependencies are managed with `renv`; run `renv::restore()` after cloning. `_site/` is build output and is gitignored — the deployed site is rebuilt by `.github/workflows/deploy-pages.yml` on every push to `main`.

## Architecture

### One pipeline, two renderings

`app/R/` is the single source of truth. Shiny sources that directory automatically, `scripts/generate_cover.R` sources it explicitly, and `shinylive::export()` copies it into the browser's virtual filesystem. There is no build step and no second implementation.

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

### Adding a parameter means adding one row

`PARAM_SPEC` in `app/R/params.R` is the only definition of a parameter. It feeds the defaults in `cover_params()`, the validation, the Shiny sidebar (built by iterating over it), and the URL query string. Add a row, use the value in `cover_geometry()` or `cover_ggplot()`, and everything else follows.

### The PRNG contract

Reproducibility rests on `lcg_stream()` and the *order* in which its draws are consumed. `cover_geometry()` takes three ridge lattices, then one offset draw plus one lattice per line; weave runs on `seed + 101` and strata jitter on `seed + 202` so those sliders morph their own feature instead of rescrambling the image. Inserting a draw anywhere shifts everything after it and changes the artwork.

This is enforced by `tests/testthat/test-geometry-legacy.R`, which reproduces the two checked-in covers vertex by vertex to within 0.01 mm. **It is the project's regression test — if it fails, the artwork has silently changed.** It replaces the R/JavaScript diff earlier versions relied on.

### Geometry

All units are millimetres in SVG orientation: x left to right across the wrap, y top to bottom. `TRIM_WIDTH 170 × TRIM_HEIGHT 240`, `BLEED 3`, so the wrap is `2*BLEED + 2*TRIM_WIDTH + spine` wide (358 mm at the default 12 mm spine) by 246 mm tall. `front_x` is the front panel's left trim edge and anchors the title block, the ridge crest and the glow; most magic numbers in `cover_geometry()` are offsets from it.

### Fonts

The cover is set in Inter, which is neither installed in webR nor guaranteed on a contributor's machine, so `Inter-Regular.ttf` and `Inter-Medium.ttf` are vendored under `app/www/fonts/` (SIL OFL, licence alongside) and registered by `register_cover_fonts()`. Weight 500 is registered in the `bold` slot, which is why the title uses `fontface = "bold"`.

**Two backends have to be told about Inter separately.** `svglite` and `ragg` read the systemfonts registry, so `register_font()` covers SVG and PNG. `cairo_pdf()` does not read it — it goes through fontconfig, and left alone it finds no family called Inter and silently substitutes. That is not hypothetical: PDF export was set in Bitstream Vera Sans, visibly heavier and wider than Inter Medium, wide enough that `title_overflow()` no longer described what the PDF laid out, and nothing warned about it.

So `register_cover_fonts()` also writes a fontconfig file into the session's temporary directory and points `FONTCONFIG_FILE` at it. It lists the vendored directory, the platform's own font directories so a character Inter lacks still has a fallback, and one `target="scan"` rule that reassigns Inter Medium's weight to bold — without it fontconfig matches Regular and fakes the weight rather than using Medium, which is the same 500-in-the-bold-slot mapping the registry uses. fontconfig reads its configuration once, on first use, which is why this happens at startup rather than inside `cover_save()`. A `FONTCONFIG_FILE` the caller has already set is left alone.

webR's Cairo honours it too, so the PDF downloaded from the deployed app embeds `Inter-Regular` and `Inter-Medium` exactly as the command line does. `pdffonts` on the output is the check.

`TEXT_BASELINE_RATIO` in `render.R` bridges SVG's baseline positioning and ggplot's bounding-box centring. It is **measured, not derived** — `test-render.R` renders text and checks the emitted baselines land within 0.1 mm of what `cover_text()` asked for, so the constant cannot drift unnoticed.

## Startup cost

The published app is slow to open — about 30 s on a cold visit — and the reason is worth knowing before anyone tries to optimise the R.

Nothing is generated ahead of time and there is no data payload: the artwork comes from a seed and the only assets are the two Inter faces. What the browser downloads is *code*. Measured over a static server, one cold load pulls **76 MB** and reaches its first drawn frame in about 10 s on localhost, 30–40 s over the network:

| | size | ours? |
| --- | --- | --- |
| `R.wasm`, `library.data.gz`, loader, translations | ~41 MB | no — this is webR |
| CRAN packages, unpacked into the virtual filesystem | 33.5 MB | yes |
| `app.json` (code and the two fonts) | 1.1 MB | marginal |

Of the packages, roughly 15 MB is `svglite` and its font-shaping chain, 11 MB is ggplot2 and its dependencies, 4 MB the dplyr/tibble/purrr stack, and the rest the export devices and viridis.

Three things follow.

- **`stringi` (13.4 MB) cannot be removed.** It is easy to assume it arrives with `stringr` and to go rewriting string calls to shed it. It does not: the chain is `svglite → textshaping → stringi`, and `svglite` is what emits the live-text SVG the printer needs. `ragg` pulls the same chain. The app avoids `stringr` anyway — base R and `glue`, which webR already ships with Shiny, cover what it needs — but that saves `stringr`'s own 0.3 MB, not `stringi`.
- **Nothing caches between visits.** GitHub Pages serves everything with `max-age=600` and offers no way to change it, and webR reinstalls every package into a fresh virtual filesystem on each page load. A reload is faster than a cold visit (≈22 s against ≈42 s measured) but still pays for the whole download and the whole install.
- **Attaching a package you do not use is not free**, and it costs twice: the download, then the unpack and attach inside wasm. Removing the unused `tidyr` and `stringr` took first paint from 12.7 s to 10.2 s on localhost for only 1.2 MB, because the install step dominates. Keep `00-setup.R` to what is used, and check `_site/shinylive/webr/packages/` after a build to see what actually shipped.

The floor, given webR plus the SVG and font machinery, is around 56 MB. Getting materially below today's figure means dropping ggplot2 for raw grid, which is an architecture change, not a tidy-up.

## Gotchas

- **`bslib::font_face` masks `svglite::font_face`.** `cover_save()` names the svglite one explicitly. Without that, SVG download breaks inside the app while the CLI keeps working.
- **shinylive bundles what is installed locally.** `shinylive::export()` inspects the local library to decide what to ship; a package missing locally is *warned about and silently omitted*, and only fails once the page runs in a browser. After changing dependencies, check the build log for "no package called".
- **Do not install Inter system-wide to "fix" the font warning.** It looks like the obvious cure for `no font could be found for family "Inter"` and it breaks the project. `systemfonts::register_font()` refuses any name that collides with an installed family — "A system font called `Inter` already exists" — so `register_cover_fonts()` throws and the CLI, the app and the tests all stop working. Skipping registration is not a way out either: only Regular (400) and Medium (500) get installed, there is no Bold (700), and a bold request then resolves to whatever the matcher lands on next, which on one macOS machine was Noto Sans Syriac. The vendored-and-registered pair is what makes output identical on every machine and inside webR; keep it that way. The warning itself is harmless — it only appears when drawing through `grDevices::png()`, which nothing in the project does.
- **`args[c(TRUE, FALSE)]` on an empty vector returns `NA`**, not an empty vector. The CLI argument parser indexes with `seq()` for that reason.
- **`testServer()` does not evaluate the UI**, so inputs start `NULL` and tests must set them. It also cannot observe `update*Input()` round trips, so preset and URL restore are tested at the function level instead.
- **`plotOutput()` is 400 px tall unless something overrides it.** Both previews size themselves by aspect ratio from the server, so they need `height = "auto"` and the `.shiny-plot-output` rules in `app.R`. Without them the page still looks plausible and simply crops the cover — the ridge lives in the lower half, so what you get is an empty dark rectangle with a title on it.
- **bslib maps `$light` onto a dark shade under a dark theme**, which leaves `btn-outline-light` invisible. The secondary download buttons carry `.btn-cover` and are coloured from the Nocturne tokens instead.
- **`layout_columns()` wraps each card in its own stretched grid item.** Putting `align-self` on the card does nothing; a card that should keep its natural height opts out with `flex: 0 0 auto`.

## Print conventions

- The 12 mm spine is a placeholder. Final width comes from the printer's page-count calculation; it shifts `front_x` and therefore the whole front panel, so re-render and look afterwards.
- The title-scale slider reaches 1.6, but the current five-line title stops fitting the front panel's safe area just past 1.20. `title_overflow()` reports this; the app shows a warning and the CLI emits one.
- Guides are drawn only when `show_guides` is `TRUE`. Unlike the old SVG they cannot ship hidden in the file, because there is no addressable layer to switch on later.
- Text stays live text. The downloaded SVG carries an Inter web font reference so it renders anywhere; convert to outlines for final print handoff.
- After any change, render the cover and actually look at it. Coordinate arithmetic here fails silently, off-canvas or under the fade.

## Known differences from the pre-ggplot output

Consequences of rendering through ggplot rather than emitting SVG by hand. All were measured against `PhD Thesis Cover Design_v3/thesis-cover.svg`.

- **No named layers.** `#background`, `#ridge`, `#cohort-lines`, `#strata-lines`, `#spine-text`, `#front-text` and `#guides` are gone; svglite emits its own structure.
- **No Gaussian blur.** The strata glow is three stacked wider, fainter strokes (`GLOW_HALOS`) instead of `feGaussianBlur`.
- **No letter-spacing.** ggplot has no tracking control, so type sets marginally tighter than the original.
- **The edge fade paints flat background over the ridge** rather than masking it. Masking each line's own opacity instead composites differently and comes out visibly brighter, so the overlay is the faithful choice; the cost is that it uses one flat colour where the background is a vertical gradient, leaving an error of about 3/255 within the outer 22 mm at each end.
- **Strata colours come from `viridisLite`** rather than eight hard-coded stops per colormap. Closer to the true colormap, and different by at most about 20/255 in one channel at the yellow end of viridis.
- **The `<svg>` header uses points**, not `358mm` with a `0 0 358 246` viewBox. Physical size is preserved, which is what the printer uses.

## Directory layout

- `app/` — the app and, in `app/R/`, all the code. Canonical.
- `scripts/` — command-line entry points.
- `tests/testthat/` — the test suite.
- `PhD Thesis Cover Design/`, `PhD Thesis Cover Design_v3/` — **archive.** The original base-R SVG string writer, its 1:1 JavaScript mirror and the proprietary "dc" preview component, kept as reference and as fixtures for the regression test. Do not develop here. The R/JavaScript parity contract they document no longer applies.
- `candidates/` — SVGs downloaded from the old preview app. `thesis-cover_v3.1.svg` is reproduced exactly by the `candidate_v31` preset, whose settings were recovered from the file itself.
- `*/uploads/` — source material from the thesis project (`suppl_figure_3.pdf`, draft chapters, the title-page matter). **Gitignored on purpose**: it is unpublished work and this repository is public. Present locally, restorable from the `*.zip` snapshots. Reference inputs; do not modify.
