register_cover_fonts(file.path(app_dir, "www", "fonts"))

# svglite writes user units of 1/72 inch.
pt_to_mm <- function(pt) pt / 72 * 25.4

#' Baseline position and size of every <text> element svglite wrote.
#'
#' Straight text carries x/y attributes, rotated text a translate().
svg_text <- function(file) {
  lines <- str_subset(readLines(file, warn = FALSE), "<text")
  placement <- str_match(lines, "translate\\(([0-9.-]+)[, ]([0-9.-]+)\\)")
  tibble(
    x = coalesce(as.numeric(placement[, 2]), as.numeric(str_match(lines, "x='([0-9.-]+)'")[, 2])),
    y = coalesce(as.numeric(placement[, 3]), as.numeric(str_match(lines, "y='([0-9.-]+)'")[, 2])),
    size = as.numeric(str_match(lines, "font-size: ([0-9.]+)px")[, 2])
  ) %>%
    mutate(across(everything(), pt_to_mm))
}

test_that("every preset builds without warning, in both views", {
  walk(names(PRESETS), \(preset) {
    geometry <- cover_geometry(cover_params(preset = preset))
    expect_no_warning(ggplot_build(cover_ggplot(geometry, "wrap")))
    expect_no_warning(ggplot_build(cover_ggplot(geometry, "front")))
  })
})

test_that("saved files are the printer's physical size", {
  file <- withr::local_tempfile(fileext = ".svg")
  cover_save(cover_params(), file)
  header <- str_subset(readLines(file, warn = FALSE), "<svg")[1]

  expect_equal(pt_to_mm(as.numeric(str_match(header, "width='([0-9.]+)pt'")[, 2])), 358, tolerance = 1e-3)
  expect_equal(pt_to_mm(as.numeric(str_match(header, "height='([0-9.]+)pt'")[, 2])), 246, tolerance = 1e-3)
})

test_that("the front view is the trimmed panel", {
  file <- withr::local_tempfile(fileext = ".svg")
  cover_save(cover_params(), file, view = "front")
  header <- str_subset(readLines(file, warn = FALSE), "<svg")[1]

  expect_equal(pt_to_mm(as.numeric(str_match(header, "width='([0-9.]+)pt'")[, 2])), 170, tolerance = 1e-3)
  expect_equal(pt_to_mm(as.numeric(str_match(header, "height='([0-9.]+)pt'")[, 2])), 240, tolerance = 1e-3)
})

test_that("text lands on the baselines cover_text() asked for", {
  # This is what keeps TEXT_BASELINE_RATIO honest: ggplot centres text on its
  # bounding box, the geometry is written in SVG baselines, and the constant
  # bridging them is measured rather than derived. If Inter or ggplot2 changes
  # its metrics, this fails instead of the cover quietly shifting.
  file <- withr::local_tempfile(fileext = ".svg")
  cover_save(cover_params(), file)
  drawn <- svg_text(file)
  intended <- cover_geometry(cover_params())$text

  expect_equal(nrow(drawn), nrow(intended))
  expect_lt(max(abs(drawn$x - intended$x)), 0.1)
  expect_lt(max(abs(drawn$y - intended$y)), 0.1)
  expect_lt(max(abs(drawn$size - intended$size)), 0.05)
})

test_that("the default title fits inside the front panel's safe area", {
  expect_lt(title_overflow(cover_params()), 0)
  expect_lt(title_overflow(cover_params(preset = "candidate_v31")), 0)
})

test_that("title_overflow() catches a title scaled off the panel", {
  # The slider reaches 1.6; this title stops fitting just past 1.20.
  expect_gt(title_overflow(cover_params(title_scale = 1.6)), 0)
  expect_gt(title_overflow(cover_params(title_scale = 1.25)), 0)
  expect_lt(title_overflow(cover_params(title_scale = 1.20)), 0)
})

test_that("PNG and PDF devices both produce a file", {
  png <- withr::local_tempfile(fileext = ".png")
  pdf <- withr::local_tempfile(fileext = ".pdf")
  cover_save(cover_params(lines = 8), png, dpi = 72)
  cover_save(cover_params(lines = 8), pdf)

  expect_gt(file.size(png), 1000)
  expect_gt(file.size(pdf), 1000)
})

test_that("an unsupported format is refused by name", {
  expect_error(cover_save(cover_params(), "cover.jpeg"), '`format` must be svg, pdf or png, not "jpeg"')
})

test_that("format can be given explicitly, as Shiny downloads need", {
  file <- withr::local_tempfile()
  cover_save(cover_params(lines = 8), file, format = "svg")
  expect_match(readLines(file, n = 2)[2], "<svg")
})

test_that("guides are drawn only when asked for", {
  layers <- \(show) length(cover_ggplot(cover_geometry(cover_params(show_guides = show)))$layers)
  expect_gt(layers(TRUE), layers(FALSE))
})
