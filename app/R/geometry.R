# Geometry of the cover, as tibbles. Nothing here draws anything.
#
# All units are millimetres in SVG orientation: x runs left to right across
# the wrap (back | spine | front) and y runs top to bottom.

TRIM_WIDTH <- 170
TRIM_HEIGHT <- 240
BLEED <- 3
X_STEP <- 2 # sampling interval along the wrap
FADE_WIDTH <- 22 # width of the fade to background at each end of the wrap

#' Page geometry for a given spine width.
#'
#' @param spine_mm Spine width in mm, from the printer's page-count calculation.
#' @returns A named list of dimensions in mm; `front_x` is the front panel's
#'   left trim edge, which anchors the title block and the ridge crest.
cover_dims <- function(spine_mm) {
  list(
    spine = spine_mm,
    bleed = BLEED,
    trim_width = TRIM_WIDTH,
    trim_height = TRIM_HEIGHT,
    width = 2 * BLEED + 2 * TRIM_WIDTH + spine_mm,
    height = TRIM_HEIGHT + 2 * BLEED,
    front_x = BLEED + TRIM_WIDTH + spine_mm
  )
}

#' Build every coordinate the cover needs.
#'
#' @param params A parameter set from [cover_params()].
#' @returns A list with `params`, `dims`, `lines` (one row per line per
#'   vertex), `strata` (one row per highlighted line) and `text`.
cover_geometry <- function(params) {
  params <- validate_cover_params(params)
  dims <- cover_dims(params$spine_mm)
  width <- dims$width
  n <- params$lines

  # The stream is consumed in a fixed order: three ridge lattices, then one
  # offset draw plus one lattice for each line. Change the order and the
  # artwork changes.
  n_broad <- lattice_size(width, 26)
  n_jag <- lattice_size(width, 8)
  n_base <- lattice_size(width, 40)
  n_line <- lattice_size(width, 9)
  draws <- lcg_stream(params$seed, n_broad + n_jag + n_base + n * (1 + n_line))

  broad <- draws[seq_len(n_broad)]
  jag <- draws[n_broad + seq_len(n_jag)]
  base <- draws[n_broad + n_jag + seq_len(n_base)]

  # What is left reshapes into one column per line: the offset draw on top,
  # that line's lattice underneath.
  per_line <- matrix(draws[-seq_len(n_broad + n_jag + n_base)], nrow = 1 + n_line)
  offsets <- (per_line[1, ] - 0.5) * 1.4

  # Weave runs on its own stream, so the slider morphs the art instead of
  # rescrambling the main seed.
  n_weave <- lattice_size(width, 80)
  weave <- matrix(lcg_stream(params$seed + 101, n * n_weave), nrow = n_weave)

  x <- seq(0, width, by = X_STEP)
  if (last(x) < width) {
    x <- c(x, width)
  }
  front_x <- dims$front_x

  # The ridge is three scalar profiles of x: crest height, baseline drift and
  # fan-out toward the front panel.
  crest <- pmin(1, pmax(
    0.03,
    0.20 +
      0.28 * smoothstep(4, front_x - 40, x) +
      0.44 * gaussian_bump(x, front_x + 100, 70) +
      0.12 * gaussian_bump(x, front_x + 40, 42) +
      0.10 * gaussian_bump(x, 100, 80) -
      0.10 * smoothstep(front_x + 140, width - 6, x) +
      0.05 * noise_at(broad, 26, x) +
      0.02 * noise_at(jag, 8, x)
  ))
  bottom <- 235.5 - 3 * smoothstep(front_x + 20, width, x) + 1.6 * noise_at(base, 40, x)
  spread <- 0.24 + 0.76 * smoothstep(6, front_x + 70, x)
  fade <- pmin(1, x / FADE_WIDTH) * pmin(1, (width - x) / FADE_WIDTH)

  style <- cohort_style(params, n)
  lines <- seq_len(n) %>%
    map(\(i) {
      rise <- ((i - 1) / (n - 1))^1.18
      tibble(
        line_id = i - 1,
        x = x,
        y = bottom -
          crest * 94 * spread * (0.06 + 0.94 * rise) -
          0.9 * params$dispersion * noise_at(per_line[-1, i], 9, x) +
          offsets[i] * params$dispersion -
          params$weave * 7 * noise_at(weave[, i], 80, x),
        fade = fade
      )
    }) %>%
    list_rbind() %>%
    left_join(style, by = "line_id")

  list(
    params = params,
    dims = dims,
    lines = lines,
    strata = filter(style, is_strata),
    text = cover_text(params, dims)
  )
}

#' Stroke, colour and opacity for every line in the stack.
#'
#' @param params A parameter set from [cover_params()].
#' @param n Number of cohort lines.
#' @returns One row per line, keyed by zero-based `line_id`.
cohort_style <- function(params, n) {
  tibble(line_id = 0:(n - 1), rank = line_id / (n - 1)) %>%
    left_join(strata_lines(params, n), by = "line_id") %>%
    mutate(
      is_strata = !is.na(colour),
      # The newest cohort reads as the crest, unless it is already a stratum.
      is_crest = line_id == n - 1 & !is_strata,
      colour = case_when(
        is_strata ~ colour,
        is_crest ~ NOCTURNE[["text"]],
        .default = cohort_colour(rank)
      ),
      linewidth = case_when(
        is_strata ~ params$strata_width,
        is_crest ~ 0.5,
        .default = 0.32
      ),
      alpha = if_else(is_strata, 1, params$line_alpha)
    )
}

#' Which lines are highlighted risk strata, and in what colour.
#'
#' The crest comes first, then the stack is walked downward in steps set by
#' `strata_spread` and perturbed by `strata_jitter`. Steps accumulate on the
#' unclamped fraction, so a stratum pushed past the bottom does not drag the
#' ones below it along.
#'
#' @param params A parameter set from [cover_params()].
#' @param n Number of cohort lines.
#' @returns A tibble of `line_id`, `fraction` and `colour`, possibly empty.
strata_lines <- function(params, n) {
  if (params$strata < 1) {
    return(tibble(line_id = numeric(), fraction = numeric(), colour = character()))
  }
  jitter <- lcg_stream(params$seed + 202, params$strata - 1)
  steps <- 0.14 * params$strata_spread * (1 + params$strata_jitter * (jitter * 2 - 1) * 0.9)
  tibble(fraction = pmin(1, pmax(0.05, 1 - c(0, cumsum(steps))))) %>%
    mutate(line_id = floor(fraction * (n - 1) + 0.5)) %>%
    distinct(line_id, .keep_all = TRUE) %>%
    mutate(colour = strata_colour(params$palette, palette_position(fraction)))
}

#' Position each stratum along its colormap, brightest at the top of the stack.
palette_position <- function(fraction) {
  if (length(fraction) == 1) {
    return(0.75)
  }
  0.3 + 0.65 * (rank(fraction, ties.method = "first") - 1) / (length(fraction) - 1)
}

#' Front-panel and spine typesetting.
#'
#' `x` and `y` are the text baseline anchors in SVG orientation, matching the
#' coordinates the original generator emitted; [cover_ggplot()] converts them
#' to ggplot's bounding-box anchors.
#'
#' @param params A parameter set from [cover_params()].
#' @param dims Page geometry from [cover_dims()].
#' @returns A tibble of `label`, `x`, `y`, `size`, `colour`, `face` and `angle`.
cover_text <- function(params, dims) {
  scale <- params$title_scale
  n_title <- length(params$title)
  front_x <- dims$front_x + 18
  first_line_y <- 33.5 + 8.5 * scale
  spine_x <- BLEED + TRIM_WIDTH + dims$spine / 2 + 1.2
  # The spine title starts below the name; 0.55 em is Inter's mean advance.
  spine_title_y <- 12 + nchar(params$name) * 0.55 * 3 + 5

  tibble(
    label = c(params$title, params$name, params$name, paste(params$title, collapse = " ")),
    x = c(rep(front_x, n_title + 1), spine_x, spine_x),
    y = c(
      first_line_y + (seq_len(n_title) - 1) * 11 * scale,
      first_line_y + n_title * 11 * scale + 4.5,
      12,
      spine_title_y
    ),
    size = c(rep(8.5 * scale, n_title), 4.9 * scale, 3, 3.4),
    colour = c(
      rep(NOCTURNE[["text"]], n_title), NOCTURNE[["n300"]],
      NOCTURNE[["n400"]], NOCTURNE[["text"]]
    ),
    face = c(rep("bold", n_title), "plain", "plain", "bold"),
    angle = c(rep(0, n_title + 1), -90, -90)
  )
}
