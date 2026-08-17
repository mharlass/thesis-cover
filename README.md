# Thesis cover

**▶ Open the generator: <https://mharlass.github.io/thesis-cover/>**

No installation, no account, nothing to run locally. The page draws the cover
in your browser and opens more or less instantly — about 120 kB on a first
visit, most of which is the two font faces.

A generator for a PhD thesis cover wrap — back, spine and front on one sheet.
The artwork is "cohort ridge" line art after Suppl. Fig. 3 of the thesis: one
line per simulated birth cohort, with a few highlighted risk strata drawn over
the top.

Move the sliders, set the title, download the result. The address bar tracks
the current settings, so a cover you like is just a link you can send to
someone.

## Downloads

| Format | For |
| --- | --- |
| **SVG** | the printer. Vector, live text, references both Inter faces as web fonts. |
| **PDF** | vector, with both Inter faces embedded. |
| **PNG** | 300 dpi, for a quick look or a slide. |

Trim 170 × 240 mm, 3 mm bleed, 12 mm spine, so the full wrap is 358 × 246 mm.
The spine is a placeholder: the real width comes from the printer's page-count
calculation, and changing it shifts the whole front panel, so re-render and
look afterwards.

## Running it yourself

Two implementations, for two different jobs.

**The site** is a static TypeScript build with no framework beyond Preact.

```sh
cd web
npm install
npm run dev            # local dev server
npm test               # the tests, including parity with the R pipeline
npm run build          # static site into _site/
```

**The R pipeline** defines the artwork and renders from the command line.
Dependencies are managed with `renv`.

```sh
Rscript -e 'renv::restore()'                           # once, after cloning

Rscript scripts/generate_cover.R                       # writes thesis-cover.svg
Rscript scripts/generate_cover.R --preset candidate_v31 --out cover.pdf
Rscript scripts/generate_cover.R --seed 7 --view front --out front.png
Rscript -e 'shiny::runApp("app")'                      # the R app, locally
Rscript -e 'testthat::test_dir("tests/testthat")'      # the tests
```

Every parameter the app exposes can be passed to the command line as
`--name value`. The output format follows the file extension.

The two are held together rather than trusted to agree: the browser build is
tested against a geometry fixture dumped from R, and both are tested against
the same two checked-in covers, vertex by vertex. Changing one and not the
other fails the build.

The site used to be the R app compiled to WebAssembly, which worked but cost a
76 MB download and half a minute of waiting before it could draw anything.
[`AGENTS.md`](AGENTS.md) has the measurements and the reasoning.

## Contributing

[`AGENTS.md`](AGENTS.md) is the guide to the internals — the pipeline, the
pseudo-random number contract that makes covers reproducible, how the two
implementations are kept in step, the print conventions, and a list of traps
that have already caught somebody. Worth reading before changing anything that
draws.

Deployment is automatic: pushing to `main` runs both test suites and rebuilds
the site.

## Licence

The cover is set in [Inter](https://rsms.me/inter/) by Rasmus Andersson, used
under the SIL Open Font License 1.1. The full faces are vendored under
`app/www/fonts/` with the licence alongside, and `scripts/subset_fonts.sh`
cuts them down to the Latin subset the site ships. Do not install them into
your system font library to "fix" a font warning — it breaks the R build in a
way `AGENTS.md` explains.
