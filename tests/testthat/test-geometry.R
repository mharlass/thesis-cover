test_that("the wrap is the printer's size", {
  dims <- cover_dims(12)
  expect_equal(dims$width, 358)
  expect_equal(dims$height, 246)
  expect_equal(dims$front_x, 185)
  expect_equal(cover_dims(20)$width, 366)
})

test_that("geometry has one row per line per vertex", {
  geometry <- cover_geometry(cover_params(lines = 10))
  x <- distinct(geometry$lines, x)

  expect_equal(nrow(geometry$lines), 10 * nrow(x))
  expect_equal(min(x$x), 0)
  expect_equal(max(x$x), geometry$dims$width)
  expect_true(all(is.finite(geometry$lines$y)))
})

test_that("strata count is honoured and the crest comes first", {
  walk(0:6, \(k) {
    strata <- cover_geometry(cover_params(strata = k))$strata
    expect_equal(nrow(strata), k)
    if (k > 0) expect_equal(max(strata$line_id), 63)
  })
})

test_that("the crest is only styled as such when it is not a stratum", {
  plain <- cover_geometry(cover_params(strata = 0))$lines
  expect_equal(filter(plain, line_id == 63, x == 0)$linewidth, 0.5)

  highlighted <- cover_geometry(cover_params(strata = 1, strata_width = 1.3))$lines
  expect_equal(filter(highlighted, line_id == 63, x == 0)$linewidth, 1.3)
})

test_that("strata take colours from the requested palette", {
  expect_true(all(cover_geometry(cover_params())$strata$colour == NOCTURNE[["accent"]]))
  expect_false(any(cover_geometry(cover_params(palette = "magma"))$strata$colour == NOCTURNE[["accent"]]))
})

test_that("dispersion and weave move the lines but not the canvas", {
  quiet <- cover_geometry(cover_params(dispersion = 0, weave = 0))$lines
  busy <- cover_geometry(cover_params(dispersion = 3, weave = 1))$lines

  expect_equal(quiet$x, busy$x)
  expect_gt(max(abs(quiet$y - busy$y)), 5)
})

test_that("text is laid out for the front panel and the spine", {
  text <- cover_geometry(cover_params())$text

  expect_equal(nrow(text), 8)
  expect_equal(sum(text$angle == -90), 2)
  # Title lines are evenly led, and scaling the type scales the leading.
  expect_equal(diff(head(text$y, 5)), rep(11, 4))
  expect_equal(diff(head(cover_geometry(cover_params(title_scale = 1.4))$text$y, 5)), rep(15.4, 4))
})
