# The single definition of every cover parameter.
#
# PARAM_SPEC is the one source of truth for four consumers: the defaults in
# cover_params(), input validation, the Shiny sidebar (built by iterating over
# it) and the URL query string. Adding a parameter means adding one row here.

PARAM_SPEC <- tribble(
  ~name,           ~label,           ~section,   ~editor,   ~lower, ~upper, ~step, ~unit, ~default,
  "spine_mm",      "Spine width",    "Print",    "range",        6,     24,   0.5,  "mm", 12,
  "show_guides",   "Show guides",    "Print",    "boolean",     NA,     NA,    NA,    NA, FALSE,
  "title_scale",   "Title scale",    "Type",     "range",      0.6,    1.6,  0.05,    NA, 1,
  "title",         "Title lines",    "Type",     "text",        NA,     NA,    NA,    NA,
  c(
    "Enhancing", "Microsimulation Models", "for Risk-Stratified",
    "and Equitable", "Colorectal Cancer Prevention"
  ),
  "name",          "Author",         "Type",     "text",        NA,     NA,    NA,    NA,
  "Matthias Florian Harlaß",
  "lines",         "Cohort lines",   "Line art", "range",        8,    300,     2,    NA, 64,
  "dispersion",    "Dispersion",     "Line art", "range",        0,      4,   0.1,    NA, 1,
  "weave",         "Weave",          "Line art", "range",        0,      1,  0.05,    NA, 0,
  "line_alpha",    "Line opacity",   "Line art", "range",     0.05,      1,  0.05,    NA, 0.9,
  "seed",          "Seed",           "Line art", "int",          0,  99999,     1,    NA, 42,
  "strata",        "Strata lines",   "Strata",   "range",        0,      6,     1,    NA, 3,
  "palette",       "Strata palette", "Strata",   "enum",        NA,     NA,    NA,    NA, "accent",
  "strata_width",  "Strata weight",  "Strata",   "range",      0.2,      2,  0.05,  "mm", 0.6,
  "strata_spread", "Strata spacing", "Strata",   "range",      0.3,      3,   0.1,    NA, 1,
  "strata_jitter", "Strata jitter",  "Strata",   "range",        0,      1,  0.05,    NA, 0
)

PARAM_SECTIONS <- c("Print", "Type", "Line art", "Strata")

# How many title lines the app offers to edit. Blank ones are dropped.
TITLE_LINES <- 5

#' Named presets covering the looks worth returning to.
#'
#' `candidate_v31` reproduces `candidates/thesis-cover_v3.1.svg` exactly. That
#' file was downloaded from the original preview app without its settings
#' being recorded; the values below were recovered from the SVG itself and are
#' checked against it in tests/testthat/test-geometry-legacy.R.
PRESETS <- list(
  default = list(),
  candidate_v31 = list(
    seed = 43, lines = 100, dispersion = 2.2, weave = 0.6, line_alpha = 0.2,
    title_scale = 1.15, strata = 4, palette = "viridis", strata_width = 0.9,
    strata_spread = 1.4, strata_jitter = 0.25
  ),
  sparse = list(lines = 24, dispersion = 0.6, line_alpha = 1, strata = 2, strata_width = 0.8),
  woven = list(
    lines = 160, weave = 0.55, dispersion = 1.8, line_alpha = 0.55,
    strata = 5, palette = "magma", strata_spread = 1.4
  )
)

PRESET_LABELS <- c(
  default = "Default (v3)",
  candidate_v31 = "Candidate v3.1",
  sparse = "Sparse",
  woven = "Woven"
)

#' Build a validated parameter set.
#'
#' @param ... Named overrides, e.g. `seed = 7`, `palette = "viridis"`.
#' @param preset Name of an entry in [PRESETS], applied beneath `...`.
#' @returns A named list holding every parameter in [PARAM_SPEC].
cover_params <- function(..., preset = "default") {
  if (!preset %in% names(PRESETS)) {
    stop(
      "`preset` must be one of ", paste(names(PRESETS), collapse = ", "),
      ", not \"", preset, "\".",
      call. = FALSE
    )
  }
  defaults <- set_names(PARAM_SPEC$default, PARAM_SPEC$name)
  overrides <- list(...)
  unknown <- setdiff(names(overrides), names(defaults))
  if (length(unknown) > 0) {
    stop(
      "Unknown cover parameter(s): ", paste(unknown, collapse = ", "),
      ". Valid names are ", paste(names(defaults), collapse = ", "), ".",
      call. = FALSE
    )
  }
  defaults %>%
    modifyList(PRESETS[[preset]]) %>%
    modifyList(overrides) %>%
    validate_cover_params()
}

#' Check a parameter set against [PARAM_SPEC].
#'
#' Every parameter is checked before anything is reported, so a caller with
#' several bad values learns about all of them at once.
#'
#' @param params Named list of parameters.
#' @returns `params`, unchanged, if every value is admissible.
validate_cover_params <- function(params) {
  problems <- PARAM_SPEC %>%
    pmap_chr(\(name, editor, lower, upper, ...) {
      check_param(name, params[[name]], editor, lower, upper)
    }) %>%
    keep(nzchar)
  if (length(problems) > 0) {
    stop(
      "Invalid cover parameter", if (length(problems) > 1) "s" else "", ":\n",
      paste0("* ", problems, collapse = "\n"),
      call. = FALSE
    )
  }
  params
}

#' Describe what is wrong with one parameter value.
#'
#' @returns A one-line problem description, or `""` when the value is valid.
check_param <- function(name, value, editor, lower, upper) {
  switch(editor,
    boolean = check_flag(name, value),
    enum = check_enum(name, value),
    text = check_text(name, value),
    int = check_number(name, value, lower, upper, whole = TRUE),
    check_number(name, value, lower, upper)
  )
}

check_number <- function(name, value, lower, upper, whole = FALSE) {
  if (!is.numeric(value) || length(value) != 1 || !is.finite(value)) {
    return(glue("`{name}` must be a single finite number, not {describe_value(value)}."))
  }
  if (whole && value != round(value)) {
    return(glue("`{name}` must be a whole number, not {value}."))
  }
  if (value < lower || value > upper) {
    return(glue("`{name}` must lie in [{lower}, {upper}], not {value}."))
  }
  ""
}

check_flag <- function(name, value) {
  if (!is.logical(value) || length(value) != 1 || is.na(value)) {
    return(glue("`{name}` must be TRUE or FALSE, not {describe_value(value)}."))
  }
  ""
}

check_enum <- function(name, value) {
  allowed <- paste(STRATA_PALETTES, collapse = ", ")
  if (!is.character(value) || length(value) != 1 || !value %in% STRATA_PALETTES) {
    return(glue("`{name}` must be one of {allowed}, not {describe_value(value)}."))
  }
  ""
}

check_text <- function(name, value) {
  if (!is.character(value) || length(value) < 1 || anyNA(value)) {
    return(glue(
      "`{name}` must be a character vector without missing values, ",
      "not {describe_value(value)}."
    ))
  }
  ""
}

describe_value <- function(value) {
  if (is.atomic(value) && length(value) == 1 && !is.na(value)) {
    return(encodeString(as.character(value), quote = "\""))
  }
  glue("{class(value)[[1]]} of length {length(value)}")
}
