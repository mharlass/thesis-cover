# The gate on the rewrite.
#
# The base-R generator this code replaces wrote every vertex into the SVG at
# two decimal places. Reproducing those coordinates from the tidy pipeline is
# what guarantees that switching to ggplot changed the rendering and nothing
# else. It replaces the R/JavaScript diff the project used to rely on.

read_group <- function(file, group) {
  svg <- paste(readLines(file, warn = FALSE), collapse = "\n")
  str_match(svg, str_c('<g id="', group, '">(.*?)</g>'))[, 2]
}

read_paths <- function(file, group) {
  str_match_all(read_group(file, group), 'd="([^"]+)"')[[1]][, 2]
}

path_points <- function(d) {
  values <- d %>%
    str_replace_all("[ML]", " ") %>%
    str_split(" +") %>%
    pluck(1) %>%
    keep(nzchar) %>%
    as.numeric()
  tibble(x = values[c(TRUE, FALSE)], y = values[c(FALSE, TRUE)])
}

#' Check that `params` reproduces a cover the old generator wrote.
#'
#' The old generator walked the stack once, appending each line to whichever
#' layer it belonged to, so both layers are in ascending line order. Strata
#' lines were emitted twice, once blurred and once crisp.
expect_reproduces <- function(file, params) {
  geometry <- cover_geometry(params)
  ids <- geometry$lines %>%
    distinct(line_id, is_strata) %>%
    arrange(line_id)
  cohort <- read_paths(file, "cohort-lines")
  strata <- read_paths(file, "strata-lines")

  expect_equal(length(cohort), sum(!ids$is_strata))
  expect_equal(length(strata), 2 * sum(ids$is_strata))

  legacy <- c(cohort, strata[c(TRUE, FALSE)]) %>%
    set_names(c(ids$line_id[!ids$is_strata], ids$line_id[ids$is_strata])) %>%
    map(path_points) %>%
    list_rbind(names_to = "line_id") %>%
    mutate(line_id = as.numeric(line_id))

  compared <- geometry$lines %>%
    select(line_id, x, y) %>%
    inner_join(legacy, by = c("line_id", "x"), suffix = c("_new", "_legacy"))

  expect_equal(nrow(compared), nrow(legacy))
  expect_lt(max(abs(compared$y_new - compared$y_legacy)), 0.01)

  # Strata colours are close but not identical: the old generator interpolated
  # between eight hard-coded stops per colormap, this one samples viridisLite
  # directly. The largest disagreement is in the blue channel at the yellow end
  # of viridis, where both read as the same colour.
  legacy_colours <- str_match_all(read_group(file, "strata-lines"), 'stroke="(#[0-9a-f]{6})"')[[1]][, 2]
  drift <- abs(
    decode_colour(geometry$strata$colour) -
      decode_colour(legacy_colours[c(TRUE, FALSE)])
  )
  expect_lt(max(drift), 25)
}

test_that("the default cover reproduces the checked-in v3 SVG", {
  file <- file.path(repo_dir, "PhD Thesis Cover Design_v3", "thesis-cover.svg")
  skip_if_not(file.exists(file))
  expect_reproduces(file, cover_params())
})

test_that("the candidate_v31 preset reproduces the downloaded v3.1 SVG", {
  file <- file.path(repo_dir, "candidates", "thesis-cover_v3.1.svg")
  skip_if_not(file.exists(file))
  expect_reproduces(file, cover_params(preset = "candidate_v31"))
})
