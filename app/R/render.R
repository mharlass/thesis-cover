# Drawing the cover with ggplot2.
#
# The plot works directly in millimetres: one data unit is one millimetre, and
# the device is sized to match, so every coordinate from cover_geometry() maps
# 1:1 onto the printed page.

# SVG places text on its baseline, ggplot centres it on the bounding box. The
# offset between the two is a fixed fraction of the font size, measured by
# rendering text at a known position and reading the emitted baseline back;
# tests/testthat/test-render.R re-measures it and fails if it drifts.
TEXT_BASELINE_RATIO <- 0.359

# Width of the fade to background at each end of the wrap.
FADE_WIDTH <- 22

# Stand-in for the SVG Gaussian blur the old generator used on strata lines:
# progressively wider, fainter copies of the same path underneath it.
GLOW_HALOS <- tibble(
  width_mult = c(3.4, 2.5, 1.8),
  alpha_mult = c(0.07, 0.11, 0.17)
)

#' Draw the cover.
#'
#' @param geometry Output of [cover_geometry()].
#' @param view `"wrap"` for the full back-spine-front sheet including bleed,
#'   `"front"` for the trimmed front panel only.
#' @returns A ggplot object sized in millimetres.
cover_ggplot <- function(geometry, view = c("wrap", "front")) {
  view <- match.arg(view)
  dims <- geometry$dims
  window <- view_window(dims, view)
  rows <- ridge_rows(geometry$lines)

  ggplot() +
    background_layers(dims) +
    geom_path(
      data = rows,
      aes(x, y, group = group, colour = colour, linewidth = linewidth, alpha = alpha),
      lineend = "butt", linejoin = "round"
    ) +
    fade_layers(dims) +
    fold_layer(dims) +
    text_layers(geometry$text) +
    guide_layers(dims, geometry$params$show_guides) +
    scale_colour_identity() +
    scale_linewidth_identity() +
    scale_alpha_identity() +
    scale_y_reverse() +
    coord_fixed(xlim = window$x, ylim = window$y, expand = FALSE) +
    theme_void() +
    theme(plot.margin = margin(0, 0, 0, 0), legend.position = "none")
}

#' The visible rectangle, in data coordinates.
view_window <- function(dims, view) {
  if (view == "front") {
    list(x = dims$front_x + c(0, dims$trim_width), y = c(dims$height - BLEED, BLEED))
  } else {
    list(x = c(0, dims$width), y = c(dims$height, 0))
  }
}

#' Physical size of a view, in millimetres.
view_size <- function(dims, view = "wrap") {
  if (view == "front") {
    list(width = dims$trim_width, height = dims$trim_height)
  } else {
    list(width = dims$width, height = dims$height)
  }
}

#' Every path the ridge draws, in back-to-front order.
#'
#' Cohort lines first, then each stratum's halo and the stratum itself, which
#' is the layering the old generator produced.
ridge_rows <- function(lines) {
  cohort <- lines %>%
    filter(!is_strata) %>%
    mutate(group = paste0("cohort-", line_id))
  strata <- lines %>%
    filter(is_strata) %>%
    mutate(group = paste0("strata-", line_id))
  halo <- strata %>%
    cross_join(GLOW_HALOS) %>%
    mutate(
      linewidth = linewidth * width_mult,
      alpha = alpha * alpha_mult,
      group = paste0(group, "-halo-", width_mult)
    )
  bind_rows(cohort, halo, strata)
}

#' Fade the ridge into the background at both ends of the wrap.
#'
#' The old generator masked the whole ridge group, which fades the lines after
#' they have been composited together. Fading each line's own opacity instead
#' is a different sum and comes out visibly brighter, so the background is
#' simply painted back over the outer 22 mm.
fade_layers <- function(dims) {
  wash <- function(alphas) {
    rectGrob(gp = gpar(col = NA, fill = linearGradient(
      colours = alpha(NOCTURNE[["bg"]], alphas), stops = c(0, 1),
      x1 = unit(0, "npc"), y1 = unit(0.5, "npc"),
      x2 = unit(1, "npc"), y2 = unit(0.5, "npc")
    )))
  }
  list(
    annotation_custom(wash(c(1, 0)),
      xmin = 0, xmax = FADE_WIDTH, ymin = 0, ymax = dims$height
    ),
    annotation_custom(wash(c(0, 1)),
      xmin = dims$width - FADE_WIDTH, xmax = dims$width, ymin = 0, ymax = dims$height
    )
  )
}

#' Background wash and the glow behind the ridge crest.
background_layers <- function(dims) {
  wash <- linearGradient(
    colours = c("#1b1e30", NOCTURNE[["bg"]], "#111320"),
    stops = c(0, 0.55, 1),
    x1 = unit(0.5, "npc"), y1 = unit(1, "npc"),
    x2 = unit(0.5, "npc"), y2 = unit(0, "npc")
  )
  glow <- radialGradient(
    colours = alpha(NOCTURNE[["a900"]], c(0.85, 0)),
    stops = c(0, 1)
  )
  list(
    annotation_custom(rectGrob(gp = gpar(fill = wash, col = NA)),
      xmin = 0, xmax = dims$width, ymin = 0, ymax = dims$height
    ),
    annotation_custom(rectGrob(gp = gpar(fill = glow, col = NA)),
      xmin = dims$front_x + 100 - 150, xmax = dims$front_x + 100 + 150,
      ymin = 185 - 88, ymax = 185 + 88
    )
  )
}

#' The shadow that reads as the fold between back and spine.
fold_layer <- function(dims) {
  shade <- linearGradient(
    colours = alpha("#0e101a", c(0, 0.55, 0)),
    stops = c(0, 0.5, 1),
    x1 = unit(0, "npc"), y1 = unit(0.5, "npc"),
    x2 = unit(1, "npc"), y2 = unit(0.5, "npc")
  )
  annotation_custom(rectGrob(gp = gpar(fill = shade, col = NA)),
    xmin = BLEED + TRIM_WIDTH - 4, xmax = BLEED + TRIM_WIDTH + dims$spine + 4,
    ymin = 0, ymax = dims$height
  )
}

#' Front-panel and spine type, plus the accent tick above the title.
text_layers <- function(text) {
  anchored <- text %>%
    mutate(
      shift = TEXT_BASELINE_RATIO * size,
      x = if_else(angle == 0, x, x + shift),
      y = if_else(angle == 0, y - shift, y)
    )
  list(
    annotate("rect",
      xmin = first(text$x), xmax = first(text$x) + 13,
      ymin = 30.2, ymax = 31.35, fill = NOCTURNE[["accent"]]
    ),
    geom_text(
      data = anchored,
      aes(x, y, label = label, size = size, colour = colour, fontface = face, angle = angle),
      family = "Inter", hjust = 0, vjust = 0.5, size.unit = "mm"
    ),
    scale_size_identity()
  )
}

#' Trim, fold and safe-area guides, shown only on request.
#'
#' The old generator shipped these hidden inside every SVG. ggplot has no
#' addressable layer to switch on afterwards, so they are drawn or they are
#' not.
guide_layers <- function(dims, show) {
  if (!show) {
    return(NULL)
  }
  safe <- tibble(x = c(BLEED, dims$front_x) + 10)
  list(
    annotate("rect",
      xmin = BLEED, xmax = BLEED + 2 * TRIM_WIDTH + dims$spine,
      ymin = BLEED, ymax = BLEED + TRIM_HEIGHT,
      fill = NA, colour = NOCTURNE[["n500"]], linewidth = 0.25, linetype = "22"
    ),
    annotate("segment",
      x = c(BLEED + TRIM_WIDTH, dims$front_x), xend = c(BLEED + TRIM_WIDTH, dims$front_x),
      y = 0, yend = dims$height, colour = NOCTURNE[["accent"]], linewidth = 0.25
    ),
    annotate("rect",
      xmin = safe$x, xmax = safe$x + TRIM_WIDTH - 20,
      ymin = BLEED + 10, ymax = BLEED + TRIM_HEIGHT - 10,
      fill = NA, colour = NOCTURNE[["n600"]], linewidth = 0.2, linetype = "12"
    ),
    annotate("text",
      x = c(BLEED, BLEED + TRIM_WIDTH, dims$front_x) + c(4, 1.2, 4), y = 8.5,
      label = c("back", glue("spine {dims$spine} mm"), "front"),
      colour = NOCTURNE[["n500"]], size = 2.8, size.unit = "mm",
      family = "Inter", hjust = 0, vjust = 0.5
    ),
    annotate("text",
      x = BLEED + 4, y = dims$height - 4.5,
      label = glue(
        "trim {TRIM_WIDTH} × {TRIM_HEIGHT} mm · bleed {BLEED} mm · ",
        "total {dims$width} × {dims$height} mm"
      ),
      colour = NOCTURNE[["n500"]], size = 2.8, size.unit = "mm",
      family = "Inter", hjust = 0, vjust = 0.5
    )
  )
}

#' How far the title runs past the front panel's safe area, in millimetres.
#'
#' Negative when it fits. The title-scale slider reaches sizes the panel
#' cannot hold, as it did in the generator this replaces, so the app checks
#' this and says so rather than silently printing a title off the edge.
#'
#' @param params A parameter set from [cover_params()].
#' @returns A single number; the overflow of the widest title line.
title_overflow <- function(params) {
  dims <- cover_dims(params$spine_mm)
  widths <- shape_string(
    params$title,
    family = "Inter", size = 8.5 * params$title_scale
  )$metrics$width
  max(widths) + 18 - (dims$trim_width - 10)
}

#' Render a cover to a file.
#'
#' @param params A parameter set from [cover_params()].
#' @param path Output path.
#' @param view `"wrap"` or `"front"`, as in [cover_ggplot()].
#' @param dpi Resolution for PNG output.
#' @param format `"svg"`, `"pdf"` or `"png"`. Taken from `path` by default,
#'   but Shiny hands download handlers a temporary path with no useful
#'   extension, so it can be given explicitly.
#' @returns `path`, invisibly.
cover_save <- function(params, path, view = "wrap", dpi = 300,
                       format = tolower(sub("^.*\\.", "", path))) {
  geometry <- cover_geometry(params)
  size <- view_size(geometry$dims, view)

  switch(format,
    # svglite::font_face is named explicitly because bslib, which the app
    # attaches, exports a font_face() of its own and would mask it.
    svg = svglite(path,
      width = size$width / 25.4, height = size$height / 25.4,
      bg = NOCTURNE[["bg"]], web_fonts = list(svglite::font_face("Inter", INTER_WOFF2))
    ),
    pdf = open_pdf(path, size$width / 25.4, size$height / 25.4),
    png = agg_png(path,
      width = size$width, height = size$height, units = "mm",
      res = dpi, background = NOCTURNE[["bg"]]
    ),
    stop(
      "`format` must be svg, pdf or png, not \"", format, "\".",
      call. = FALSE
    )
  )
  on.exit(dev.off(), add = TRUE)
  print(cover_ggplot(geometry, view))
  invisible(path)
}

# Downloaded SVGs are opened on machines that do not have Inter installed, so
# the file carries a web font reference of its own, as the old generator did.
INTER_WOFF2 <- "https://rsms.me/inter/font-files/Inter-Regular.woff2?v=4.1"

#' Open a PDF device, preferring cairo where it is available.
#'
#' webR has no cairo-backed grDevices, but ships the Cairo package.
open_pdf <- function(path, width, height) {
  if (capabilities("cairo")) {
    cairo_pdf(path, width = width, height = height, bg = NOCTURNE[["bg"]])
  } else {
    Cairo::CairoPDF(path, width = width, height = height, bg = NOCTURNE[["bg"]])
  }
}
