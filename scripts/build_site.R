#!/usr/bin/env Rscript
# Compile the Shiny app to WebAssembly.
#
#   Rscript scripts/build_site.R [destination]
#
# **This is no longer what gets published.** The site at
# <https://mharlass.github.io/thesis-cover/> is now the static build under
# web/, because the WebAssembly bundle made a first visit download about 76 MB
# and wait 30-40 s before it could draw anything. See "Startup cost" in
# AGENTS.md for where that went.
#
# Kept because it still works and is the only way to run the real R pipeline in
# a browser. The default destination is deliberately not `_site`, which now
# belongs to the Vite build; passing one is the way to use this.
#
# Everything under app/ is copied into the browser's virtual filesystem, so the
# app must only use packages available as wasm builds from repo.r-wasm.org.

dest <- commandArgs(trailingOnly = TRUE)[1]
if (is.na(dest)) {
  dest <- "_site-shinylive"
}

shinylive::export("app", dest)

# GitHub Pages would otherwise hide shinylive's underscore-prefixed directories.
invisible(file.create(file.path(dest, ".nojekyll")))

size <- sum(file.size(list.files(dest, recursive = TRUE, all.files = TRUE, full.names = TRUE)))
cat(sprintf(
  "wrote %s - %d files, %.0f MB\n",
  dest, length(list.files(dest, recursive = TRUE)), size / 1024^2
))
