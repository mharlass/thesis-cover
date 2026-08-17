# Shared setup for the cover generator.
#
# Shiny sources everything in this directory alphabetically before the app
# starts, and scripts/generate_cover.R sources it in the same order, so this
# file runs first and the rest may assume these packages are attached.

library(dplyr)
library(tidyr)
library(tibble)
library(purrr)
library(stringr)
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
