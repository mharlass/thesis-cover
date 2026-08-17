library(testthat)

app_dir <- normalizePath(file.path("..", "..", "app"), mustWork = TRUE)
repo_dir <- dirname(app_dir)

for (f in sort(list.files(file.path(app_dir, "R"), full.names = TRUE))) {
  source(f)
}
