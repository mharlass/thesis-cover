# Thesis cover

**▶ Open the generator: <https://mharlass.github.io/thesis-cover/>**

No installation, no account, nothing to run locally — the page carries its own
copy of R, compiled to WebAssembly, and does all the drawing in the browser.
Give it a moment on a first visit; it has a fair amount to fetch before it can
draw anything.

A generator for a PhD thesis cover wrap — back, spine and front on one sheet.
The artwork is "cohort ridge" line art after Suppl. Fig. 3 of the thesis: one
polyline per simulated birth cohort, with a few highlighted risk strata drawn
over the top.

Move the sliders, set the title, download the result. The address bar tracks
the current settings, so a cover you like is just a link you can send to
someone.

## Downloads

| Format | For |
| --- | --- |
| **SVG** | the printer. Vector, live text, references Inter as a web font. |
| **PDF** | vector, with both Inter faces embedded. |
| **PNG** | 300 dpi, for a quick look or a slide. |

Trim 170 × 240 mm, 3 mm bleed, 12 mm spine, so the full wrap is 358 × 246 mm.
The spine is a placeholder: the real width comes from the printer's page-count
calculation, and changing it shifts the whole front panel, so re-render and
look afterwards.

## Running it yourself

An R project; dependencies are managed with `renv`.

```sh
Rscript -e 'renv::restore()'                           # once, after cloning

Rscript scripts/generate_cover.R                       # writes thesis-cover.svg
Rscript scripts/generate_cover.R --preset candidate_v31 --out cover.pdf
Rscript scripts/generate_cover.R --seed 7 --view front --out front.png
Rscript -e 'shiny::runApp("app")'                      # the app, locally
Rscript scripts/build_site.R                           # the WebAssembly build
Rscript -e 'testthat::test_dir("tests/testthat")'      # the tests
```

Every parameter the app exposes can be passed to the command line as
`--name value`. The output format follows the file extension.

The same code runs all three ways: `app/R/` builds the geometry and draws it,
`scripts/generate_cover.R` sources that directly, and `shinylive` copies it
into the browser. There is no second implementation and no build step.

## Contributing

[`AGENTS.md`](AGENTS.md) is the guide to the internals — the pipeline, the
pseudo-random number contract that makes covers reproducible, the print
conventions, and a list of traps that have already caught somebody. Worth
reading before changing anything that draws.

Deployment is automatic: pushing to `main` runs the tests and rebuilds the
site.

## Licence

The cover is set in [Inter](https://rsms.me/inter/) by Rasmus Andersson, used
under the SIL Open Font License 1.1. The two faces are vendored under
`app/www/fonts/` with the licence alongside — do not install them into your
system font library to "fix" a font warning, it breaks the build in a way
`AGENTS.md` explains.
