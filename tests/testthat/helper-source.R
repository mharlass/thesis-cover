library(testthat)
# The app itself no longer attaches stringr — it costs a 13 MB stringi
# download in the WebAssembly build — but the tests parse SVG with it, and
# they only ever run on a real R installation.
library(stringr)

app_dir <- normalizePath(file.path("..", "..", "app"), mustWork = TRUE)
repo_dir <- dirname(app_dir)

for (f in sort(list.files(file.path(app_dir, "R"), full.names = TRUE))) {
  source(f)
}
