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

# Where macOS and Linux keep their own faces. Listed so that a character Inter
# does not carry still has somewhere to fall back to; fontconfig ignores the
# entries that do not exist on the machine in hand. Windows is absent on
# purpose: cairo uses its own font backend there, and a drive-lettered path is
# not absolute as far as fontconfig is concerned, so listing one only earns an
# "ambiguous path" warning on every render.
SYSTEM_FONT_DIRS <- c(
  "/System/Library/Fonts", "/Library/Fonts", "~/Library/Fonts",
  "/usr/share/fonts", "/usr/local/share/fonts", "~/.fonts"
)

#' Make the bundled Inter faces available to every drawing backend.
#'
#' The cover is typeset in Inter, which is not installed inside webR and is
#' not guaranteed on a contributor's machine either, so the two faces the
#' artwork uses are vendored under `www/fonts/`. Falls back silently to the
#' platform sans-serif when the files are missing: rendering still works, with
#' different metrics, rather than failing outright.
#'
#' Two backends have to be told separately. `svglite` and `ragg` read the
#' systemfonts registry, so registering there covers SVG and PNG.
#' `cairo_pdf()` does not read it — it goes through fontconfig, and left to
#' itself finds no family called Inter and quietly substitutes another sans,
#' which is how PDF export came to be set in Bitstream Vera Sans. So the same
#' directory is handed to fontconfig as well.
#'
#' Do not "fix" a missing Inter by installing it into the system font library
#' instead: `register_font()` refuses any name that collides with an installed
#' family, and the whole thing stops working. See Gotchas in AGENTS.md.
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
  configure_fontconfig(dir)
  TRUE
}

#' Write a fontconfig configuration that can see the vendored faces.
#'
#' fontconfig reads its configuration once, the first time anything uses it,
#' so this has to run before a cairo device is ever opened — which is why
#' [register_cover_fonts()] calls it at startup rather than `cover_save()`
#' calling it per file. An `FONTCONFIG_FILE` the caller set themselves is
#' left alone.
#'
#' @param dir Directory holding the Inter faces.
#' @returns The path written, invisibly, or `NULL` if the environment already
#'   named a configuration.
configure_fontconfig <- function(dir) {
  if (nzchar(Sys.getenv("FONTCONFIG_FILE"))) {
    return(invisible(NULL))
  }
  cache <- file.path(tempdir(), "fontconfig-cache")
  dir.create(cache, showWarnings = FALSE, recursive = TRUE)
  path <- file.path(tempdir(), "cover-fonts.conf")
  writeLines(
    c(
      '<?xml version="1.0"?>',
      '<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">',
      "<fontconfig>",
      paste0("  <dir>", xml_text(normalizePath(dir)), "</dir>"),
      paste0("  <dir>", xml_text(SYSTEM_FONT_DIRS), "</dir>"),
      paste0("  <cachedir>", xml_text(cache), "</cachedir>"),
      # The registry puts weight 500 in the bold slot, which is why the title
      # asks for "bold"; fontconfig has to agree, or cairo matches Regular and
      # fakes the weight instead of using Medium.
      '  <match target="scan">',
      '    <test name="family"><string>Inter</string></test>',
      '    <test name="style"><string>Medium</string></test>',
      '    <edit name="weight" mode="assign"><const>bold</const></edit>',
      "  </match>",
      "</fontconfig>"
    ),
    path
  )
  Sys.setenv(FONTCONFIG_FILE = path)
  invisible(path)
}

#' Escape a string for use as XML character data.
xml_text <- function(x) {
  x <- gsub("&", "&amp;", x, fixed = TRUE)
  x <- gsub("<", "&lt;", x, fixed = TRUE)
  gsub(">", "&gt;", x, fixed = TRUE)
}
