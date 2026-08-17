test_that("defaults produce an empty query", {
  expect_equal(cover_query(cover_params()), "?")
})

test_that("only changed parameters are written out, readably", {
  query <- cover_query(cover_params(seed = 43, lines = 100, palette = "viridis"))

  expect_equal(query, "?lines=100&seed=43&palette=viridis")
})

test_that("every preset survives a round trip", {
  walk(names(PRESETS), \(preset) {
    params <- cover_params(preset = preset)
    expect_equal(cover_params_from_query(cover_query(params)), params)
  })
})

test_that("edited title and author survive a round trip", {
  params <- cover_params(title = c("One line", "Two & three"), name = "Ada Lovelace")

  expect_equal(cover_params_from_query(cover_query(params)), params)
})

test_that("a leading question mark is optional", {
  expect_equal(cover_params_from_query("seed=7")$seed, 7)
  expect_equal(cover_params_from_query("?seed=7")$seed, 7)
})

test_that("unknown, malformed and out-of-range keys fall back to defaults", {
  defaults <- cover_params()

  expect_equal(cover_params_from_query(""), defaults)
  expect_equal(cover_params_from_query("?colour=red")$seed, defaults$seed)
  expect_equal(cover_params_from_query("?seed=banana"), defaults)
  expect_equal(cover_params_from_query("?strata=99"), defaults)
  expect_equal(cover_params_from_query("?seed=7&strata=99"), defaults)
})
