test_that("defaults cover every parameter in the spec", {
  params <- cover_params()
  expect_setequal(names(params), PARAM_SPEC$name)
  expect_setequal(PARAM_SPEC$section, PARAM_SECTIONS)
})

test_that("every preset is valid and known to the labels", {
  walk(names(PRESETS), \(p) expect_no_error(cover_params(preset = p)))
  expect_setequal(names(PRESETS), names(PRESET_LABELS))
})

test_that("overrides win over presets", {
  expect_equal(cover_params(preset = "candidate_v31", seed = 7)$seed, 7)
  expect_equal(cover_params(preset = "candidate_v31")$lines, 100)
})

test_that("out-of-range values are refused, naming value and expectation", {
  expect_error(cover_params(strata = 9), "`strata` must lie in \\[0, 6\\], not 9")
  expect_error(cover_params(line_alpha = 0), "`line_alpha` must lie in \\[0.05, 1\\], not 0")
  expect_error(cover_params(seed = 1.5), "`seed` must be a whole number, not 1.5")
  expect_error(cover_params(palette = "rainbow"), "must be one of accent.*not \"rainbow\"")
  expect_error(cover_params(show_guides = "yes"), "`show_guides` must be TRUE or FALSE")
  expect_error(cover_params(name = 42), "`name` must be a character vector")
})

test_that("all problems are reported at once", {
  expect_error(
    cover_params(strata = 9, palette = "rainbow"),
    "Invalid cover parameters:\n\\* .*\n\\* "
  )
})

test_that("unknown parameters are refused", {
  expect_error(cover_params(colour = "red"), "Unknown cover parameter\\(s\\): colour")
  expect_error(cover_params(preset = "nope"), "`preset` must be one of default")
})
