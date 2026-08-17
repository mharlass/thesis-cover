#!/usr/bin/env Rscript
# Compile the Shiny app to WebAssembly for GitHub Pages.
#
#   Rscript scripts/build_site.R [destination]
#
# Everything under app/ is copied into the browser's virtual filesystem, so the
# app must only use packages available as wasm builds from repo.r-wasm.org.

dest <- commandArgs(trailingOnly = TRUE)[1]
if (is.na(dest)) {
  dest <- "_site"
}

shinylive::export("app", dest)

# GitHub Pages would otherwise hide shinylive's underscore-prefixed directories.
invisible(file.create(file.path(dest, ".nojekyll")))

size <- sum(file.size(list.files(dest, recursive = TRUE, all.files = TRUE, full.names = TRUE)))
cat(sprintf(
  "wrote %s - %d files, %.0f MB\n",
  dest, length(list.files(dest, recursive = TRUE)), size / 1024^2
))
