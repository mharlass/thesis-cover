# Shared setup for the cover generator.
#
# Shiny sources everything in this directory alphabetically before the app
# starts, and scripts/generate_cover.R sources it in the same order, so this
# file runs first and the rest may assume these packages are attached.

# Every package attached here is downloaded, unpacked and attached before the
# WebAssembly build can draw its first frame, so the list is kept to what is
# actually used. glue is free — Shiny depends on it, so webR already ships it
# in the base image — which is why the handful of interpolations here use it
# and the rest of the string work is base R. See "Startup cost" in AGENTS.md
# for what each remaining package costs before adding to this list.
library(dplyr)
library(tibble)
library(purrr)
library(glue)
library(ggplot2)
library(grid)
library(farver)
library(viridisLite)
library(systemfonts)
library(svglite)
library(ragg)

#' Register the bundled Inter faces under the family name "Inter".
#'
#' The cover is typeset in Inter, which is not installed inside webR and is
#' not guaranteed on a contributor's machine either, so the two faces the
#' artwork uses are vendored under `www/fonts/`. Falls back silently to the
#' platform sans-serif when the files are missing: rendering still works, with
#' different metrics, rather than failing outright.
#'
#' @param dir Directory holding `Inter-Regular.ttf` and `Inter-Medium.ttf`.
#' @returns `TRUE` if Inter was registered, `FALSE` if the fallback applies.
register_cover_fonts <- function(dir = "www/fonts") {
  regular <- file.path(dir, "Inter-Regular.ttf")
  medium <- file.path(dir, "Inter-Medium.ttf")
  if (!file.exists(regular) || !file.exists(medium)) {
    return(FALSE)
  }
  register_font(
    name = "Inter",
    plain = regular,
    bold = medium,
    italic = regular,
    bolditalic = medium
  )
  TRUE
}
