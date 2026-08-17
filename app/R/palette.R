# Colour for the cover.
#
# Cohort lines run along the Nocturne neutral ramp, oldest (dim) to newest
# (light); highlighted risk strata take either the Nocturne accent or a sample
# of one viridis-family colormap.
#
# NOCTURNE is a deliberate copy of the design tokens in
# "PhD Thesis Cover Design_v3/_ds/nocturne-.../styles.css". Keep the two in
# step if that design system is ever updated.

NOCTURNE <- c(
  bg = "#161826",
  surface = "#232532",
  text = "#e9e9ed",
  accent = "#9184d9",
  n200 = "#e4e7f5",
  n300 = "#cfd3e5",
  n400 = "#b2b6ca",
  n500 = "#9397ab",
  n600 = "#75798c",
  n700 = "#595d6c",
  n800 = "#3f424d",
  a900 = "#2b2741"
)

STRATA_PALETTES <- c(
  "accent", "viridis", "magma", "cividis", "turbo", "plasma", "inferno"
)

#' Interpolate between two colours in sRGB.
#'
#' Deliberately sRGB rather than the perceptually uniform Lab space that
#' `scales::colour_ramp()` uses, because the published covers were built with
#' a straight channel-wise mix and switching spaces would shift every line.
#'
#' @param from,to Hex colour strings.
#' @param t Numeric vector of mixing fractions in [0, 1].
#' @returns Character vector of hex colours, one per element of `t`.
blend_srgb <- function(from, to, t) {
  ends <- decode_colour(c(from, to))
  mixed <- cbind(
    ends[1, 1] + (ends[2, 1] - ends[1, 1]) * t,
    ends[1, 2] + (ends[2, 2] - ends[1, 2]) * t,
    ends[1, 3] + (ends[2, 3] - ends[1, 3]) * t
  )
  tolower(encode_colour(mixed))
}

#' Colour a cohort line by its rank within the stack.
#'
#' @param rank Numeric vector in [0, 1]; 0 is the oldest cohort, 1 the newest.
#' @returns Character vector of hex colours.
cohort_colour <- function(rank) {
  if_else(
    rank <= 0.55,
    blend_srgb(NOCTURNE[["n800"]], NOCTURNE[["n600"]], pmin(1, rank / 0.55)),
    blend_srgb(NOCTURNE[["n600"]], NOCTURNE[["n200"]], pmax(0, (rank - 0.55) / 0.45))
  )
}

#' Sample a viridis-family colormap.
#'
#' @param palette One of [STRATA_PALETTES]. `"accent"` ignores `t` and returns
#'   the Nocturne accent.
#' @param t Numeric vector of positions along the colormap in [0, 1].
#' @returns Character vector of hex colours, one per element of `t`.
strata_colour <- function(palette, t) {
  if (!palette %in% STRATA_PALETTES) {
    stop(
      "`palette` must be one of ", paste(STRATA_PALETTES, collapse = ", "),
      ", not \"", palette, "\".",
      call. = FALSE
    )
  }
  if (palette == "accent") {
    return(rep(NOCTURNE[["accent"]], length(t)))
  }
  ramp <- viridis(256, option = palette)
  tolower(substr(ramp[round(pmin(1, pmax(0, t)) * 255) + 1], 1, 7))
}
