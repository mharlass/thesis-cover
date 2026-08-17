test_that("lcg_stream() reproduces the generator it replaces", {
  # The closure-based Lehmer LCG the old script used, verbatim.
  legacy <- function(seed) {
    s <- ((floor(seed) %% 2147483646) + 2147483646) %% 2147483646 + 1
    function() {
      s <<- (s * 16807) %% 2147483647
      s / 2147483647
    }
  }
  for (seed in c(0, 1, 42, 43, 245, 99999)) {
    draw <- legacy(seed)
    expect_equal(lcg_stream(seed, 20), map_dbl(1:20, \(i) draw()))
  }
})

test_that("lcg_stream() handles degenerate lengths", {
  expect_length(lcg_stream(42, 0), 0)
  expect_length(lcg_stream(42, 1), 1)
})

test_that("noise_at() stays in range and is continuous", {
  values <- lcg_stream(42, 20)
  x <- seq(0, 100, by = 0.5)
  noise <- noise_at(values, 9, x)

  expect_true(all(noise >= -1 & noise <= 1))
  expect_lt(max(abs(diff(noise))), 0.2)
})

test_that("noise_at() clamps past the end of the lattice", {
  values <- lcg_stream(42, 5)
  expect_equal(noise_at(values, 10, 1000), (values[5] - 0.5) * 2)
})

test_that("smoothstep() and gaussian_bump() have the expected shape", {
  expect_equal(smoothstep(0, 10, c(-5, 0, 5, 10, 15)), c(0, 0, 0.5, 1, 1))
  expect_equal(gaussian_bump(5, 5, 2), 1)
  expect_equal(gaussian_bump(7, 5, 2), exp(-3))
})
