#!/usr/bin/env Rscript
# Render the thesis cover from the command line.
#
#   Rscript scripts/generate_cover.R
#   Rscript scripts/generate_cover.R --preset candidate_v31 --out cover.pdf
#   Rscript scripts/generate_cover.R --seed 7 --lines 120 --view front
#
# Any parameter in PARAM_SPEC can be given as --name value. The output format
# follows the file extension: .svg, .pdf or .png.

app_dir <- file.path(dirname(sub("^--file=", "", grep("^--file=", commandArgs(), value = TRUE))), "..", "app")
for (f in sort(list.files(file.path(app_dir, "R"), full.names = TRUE))) {
  source(f)
}
invisible(register_cover_fonts(file.path(app_dir, "www", "fonts")))

#' Turn `--name value` pairs into arguments for [cover_params()].
parse_args <- function(args) {
  if (length(args) == 0) {
    return(list())
  }
  if (length(args) %% 2 != 0) {
    stop("Arguments must be given as --name value pairs.", call. = FALSE)
  }
  flags <- args[seq(1, length(args), by = 2)]
  if (!all(startsWith(flags, "--"))) {
    stop("Arguments must be given as --name value pairs.", call. = FALSE)
  }
  values <- args[seq(2, length(args), by = 2)] %>%
    set_names(sub("^--", "", flags))
  known <- intersect(names(values), PARAM_SPEC$name)
  c(
    imap(values[known], \(text, name) decode_value(text, name)),
    as.list(values[setdiff(names(values), known)])
  )
}

args <- parse_args(commandArgs(trailingOnly = TRUE))
out <- args$out %||% "thesis-cover.svg"
view <- args$view %||% "wrap"
preset <- args$preset %||% "default"
params <- do.call(cover_params, c(discard(args, names(args) %in% c("out", "view", "preset")),
  preset = preset
))

overflow <- title_overflow(params)
if (overflow > 0) {
  warning(
    "The title runs ", round(overflow, 1),
    " mm past the front panel's safe area.",
    call. = FALSE
  )
}

cover_save(params, out, view = view)
cat("wrote", out, "-", round(file.size(out) / 1024), "KB\n")
