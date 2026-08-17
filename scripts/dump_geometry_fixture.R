#!/usr/bin/env Rscript
# Dump cover geometry from the R pipeline as a fixture for the browser build.
#
#   Rscript scripts/dump_geometry_fixture.R [destination]
#
# app/R/ remains the definition of the artwork. web/ reimplements it in
# TypeScript because the browser can no longer run R, and this fixture is what
# stops the two drifting: web/test/geometry.test.ts asserts the port
# reproduces every value here.
#
# Vertex data is not written out — the two checked-in legacy SVGs already pin
# every vertex, and both implementations are tested against those directly.
# What this covers is everything the SVGs do not: line styles, strata choice
# and colour, text layout, and the ridge for parameter sets no SVG exists for.

app_dir <- file.path(
  dirname(sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE))),
  "..", "app"
)
for (f in sort(list.files(file.path(app_dir, "R"), full.names = TRUE))) {
  source(f)
}

dest <- commandArgs(trailingOnly = TRUE)[1]
if (is.na(dest)) {
  dest <- file.path(dirname(app_dir), "web", "test", "fixtures", "r-geometry.json")
}

# Parameter sets chosen to exercise the branches the legacy SVGs never reach:
# no strata at all, a single stratum (which takes the length-1 palette
# shortcut), heavy jitter (which can collide two strata onto one line and
# trigger the distinct() rule), a fractional spine (which appends a final
# sample beyond the 2 mm grid), and both ends of the line-count range.
CASES <- list(
  default = list(),
  candidate_v31 = list(preset = "candidate_v31"),
  sparse = list(preset = "sparse"),
  woven = list(preset = "woven"),
  no_strata = list(strata = 0, lines = 10),
  one_stratum = list(strata = 1, lines = 10, palette = "cividis"),
  jittered = list(strata = 6, strata_jitter = 1, strata_spread = 3, lines = 12, palette = "turbo"),
  fractional_spine = list(spine_mm = 12.5, lines = 8, palette = "magma"),
  wide_spine = list(spine_mm = 24, lines = 9, strata = 2, palette = "inferno"),
  dense = list(lines = 300, strata = 5, palette = "plasma", weave = 1, dispersion = 4),
  minimal = list(lines = 8, title_scale = 0.6, strata = 4, palette = "viridis"),
  retitled = list(
    title = c("One", "Two"), name = "A. Researcher",
    title_scale = 1.6, spine_mm = 6, lines = 10
  )
)

#' Round to a precision far finer than the 0.01 mm the artwork is checked at,
#' so the fixture stays small without losing anything that matters.
round6 <- function(x) round(x, 6)

#' Everything about one parameter set that is worth pinning.
#'
#' The ridge is summarised rather than dumped vertex by vertex: for each line,
#' its y at every 20th sample plus the extremes and the sum. A single shifted
#' PRNG draw moves the sum, so this catches stream-order drift without
#' carrying 30,000 numbers per case.
describe_case <- function(params) {
  geometry <- cover_geometry(params)
  lines <- geometry$lines %>%
    group_by(line_id) %>%
    summarise(
      colour = first(colour),
      linewidth = first(linewidth),
      alpha = first(alpha),
      is_strata = first(is_strata),
      y_sum = round6(sum(y)),
      y_min = round6(min(y)),
      y_max = round6(max(y)),
      y_sample = list(round6(y[seq(1, n(), by = 20)])),
      .groups = "drop"
    )

  list(
    params = geometry$params,
    dims = geometry$dims,
    n_x = length(unique(geometry$lines$x)),
    x_last = round6(max(geometry$lines$x)),
    lines = lines,
    strata = strata_lines(geometry$params, geometry$params$lines),
    text = geometry$text,
    title_overflow_mm = NULL # measured with a font engine; checked separately
  )
}

fixture <- lapply(CASES, function(case) {
  preset <- case$preset %||% "default"
  describe_case(do.call(cover_params, c(
    case[setdiff(names(case), "preset")],
    preset = preset
  )))
})

dir.create(dirname(dest), showWarnings = FALSE, recursive = TRUE)
writeLines(
  jsonlite::toJSON(fixture, auto_unbox = TRUE, digits = NA, null = "null"),
  dest
)
cat(sprintf(
  "wrote %s - %d cases, %.0f KB\n",
  dest, length(fixture), file.size(dest) / 1024
))
