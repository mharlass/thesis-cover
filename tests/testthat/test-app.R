library(shiny)

# testServer does not evaluate the UI, so inputs start empty and have to be
# supplied. The params reactive is debounced, so the clock has to run too.
set_controls <- function(session, params = cover_params()) {
  controls <- PARAM_SPEC %>%
    filter(editor != "text") %>%
    pull(name) %>%
    set_names() %>%
    map(\(name) params[[name]])
  titles <- c(params$title, rep("", TITLE_LINES)) %>%
    head(TITLE_LINES) %>%
    as.list() %>%
    set_names(str_c("title", seq_len(TITLE_LINES)))
  do.call(session$setInputs, c(controls, titles, list(name = params$name)))
  session$elapse(500)
}

test_that("controls assemble into the parameter set they describe", {
  testServer(app_dir, {
    set_controls(session)
    expect_equal(params(), cover_params())
  })
})

test_that("moving a control changes only that parameter", {
  testServer(app_dir, {
    set_controls(session)
    session$setInputs(lines = 120, palette = "magma")
    session$elapse(500)

    expect_equal(params()$lines, 120)
    expect_equal(params()$palette, "magma")
    expect_equal(params()$seed, cover_params()$seed)
  })
})

test_that("a preset's values drive the cover once they reach the controls", {
  testServer(app_dir, {
    set_controls(session, cover_params(preset = "candidate_v31"))
    expect_equal(params(), cover_params(preset = "candidate_v31"))
  })
})

test_that("edited title lines are used, and blank ones dropped", {
  testServer(app_dir, {
    set_controls(session)
    session$setInputs(title1 = "Only line", title2 = "", title3 = "", title4 = "", title5 = "")
    session$elapse(500)

    expect_equal(params()$title, "Only line")
  })
})

test_that("nothing is drawn until the controls exist", {
  testServer(app_dir, {
    expect_error(params(), class = "shiny.silent.error")
  })
})

test_that("the address bar follows the current cover", {
  testServer(app_dir, {
    set_controls(session, cover_params(seed = 43, lines = 100))
    expect_equal(cover_query(params()), "?lines=100&seed=43")
  })
})

test_that("an overflowing title is reported, a fitting one is not", {
  testServer(app_dir, {
    set_controls(session)
    expect_null(output$fit)

    session$setInputs(title_scale = 1.6)
    session$elapse(500)
    expect_match(output$fit$html, "past the front panel")
  })
})

test_that("all three downloads produce a real file", {
  testServer(app_dir, {
    set_controls(session, cover_params(lines = 8))
    walk(c("svg", "pdf", "png"), \(format) expect_gt(file.size(output[[format]]), 1000))
  })
})
