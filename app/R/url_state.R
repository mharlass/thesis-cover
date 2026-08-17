# Carrying a parameter set in the page's query string.
#
# The point is a link that can be pasted into an email, so only parameters
# that differ from the defaults are written out and the encoding stays
# readable: ?seed=43&lines=100&palette=viridis

#' Encode a parameter set as a query string.
#'
#' @param params A parameter set from [cover_params()].
#' @returns A string beginning with `?`, or `"?"` when nothing differs from
#'   the defaults.
cover_query <- function(params) {
  defaults <- cover_params()
  changed <- keep(names(defaults), \(name) !identical(params[[name]], defaults[[name]]))
  if (length(changed) == 0) {
    return("?")
  }
  paste0("?", paste0(changed, "=", map_chr(params[changed], encode_value), collapse = "&"))
}

encode_value <- function(value) {
  URLencode(paste(as.character(value), collapse = "|"), reserved = TRUE)
}

#' Read a parameter set back out of a query string.
#'
#' Anything unrecognised or out of range falls back to the defaults rather
#' than erroring, because the input is a link somebody may have edited by hand.
#'
#' @param query A query string, with or without its leading `?`.
#' @returns A parameter set from [cover_params()].
cover_params_from_query <- function(query) {
  pairs <- sub("^\\?", "", query) %>%
    strsplit("&", fixed = TRUE) %>%
    pluck(1) %>%
    keep(\(pair) grepl("=", pair, fixed = TRUE))
  if (length(pairs) == 0) {
    return(cover_params())
  }
  # Split on the first "=" only, so an encoded value may contain one.
  names <- sub("=.*$", "", pairs)
  values <- sub("^[^=]*=", "", pairs)
  known <- intersect(names, PARAM_SPEC$name)
  overrides <- values[match(known, names)] %>%
    set_names(known) %>%
    imap(\(text, name) decode_value(URLdecode(text), name))

  tryCatch(do.call(cover_params, overrides), error = \(e) cover_params())
}

decode_value <- function(text, name) {
  switch(PARAM_SPEC$editor[PARAM_SPEC$name == name],
    boolean = as.logical(text),
    enum = text,
    text = strsplit(text, "|", fixed = TRUE)[[1]],
    suppressWarnings(as.numeric(text))
  )
}
