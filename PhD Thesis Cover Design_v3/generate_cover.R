# Thesis cover generator - "cohort ridge" line art (Nocturne palette).
# Base-R, no packages. Mirrors cover-generator.js 1:1 (same PRNG, same draw
# order, same constants) so both produce the same SVG (coords match to +-0.01mm).
#
# Usage:  Rscript generate_cover.R          -> writes thesis-cover.svg
# Tune `params` below. All dimensions in mm.

params <- list(
  seed        = 42,
  spine_mm    = 12,     # set final width from the printer's page-count calc
  lines       = 64,     # cohort trajectories
  strata      = 3,      # highlighted "risk strata" lines (0-6), topmost = crest
  strata_width  = 0.6,  # stroke width of strata lines (mm)
  strata_spread = 1,    # spacing of strata lines down the stack
  strata_jitter = 0,    # 0-1: randomness of the gaps between strata
  dispersion  = 1,      # 0-4: how far lines wander from each other
  weave       = 0,      # 0-1: long-wave rank variation; 0 = parallel ranks, 1 = lines cross and drift
  line_alpha  = 0.9,    # opacity of non-strata lines
  title_scale = 1,      # multiplies title + name font size
  palette     = "accent",  # strata color: accent | viridis | magma | cividis | turbo | plasma | inferno
  show_guides = FALSE,  # trim/fold/safe-area guides layer
  title = c("Enhancing", "Microsimulation Models", "for Risk-Stratified",
            "and Equitable", "Colorectal Cancer Prevention"),
  name  = "Matthias Florian Harla\u00df",
  out   = "thesis-cover.svg"
)

# Nocturne tokens (styles.css)
COL <- list(bg = "#161826", text = "#e9e9ed", accent = "#9184d9",
            n200 = "#e4e7f5", n300 = "#cfd3e5", n400 = "#b2b6ca",
            n500 = "#9397ab", n600 = "#75798c", n800 = "#3f424d",
            a900 = "#2b2741")
TRIM_W <- 170; TRIM_H <- 240; BLEED <- 3

make_lcg <- function(seed) {           # Lehmer LCG, exact in doubles
  s <- ((floor(seed) %% 2147483646) + 2147483646) %% 2147483646 + 1
  function() { s <<- (s * 16807) %% 2147483647; s / 2147483647 }
}
make_lattice <- function(rng, W, L) {
  K <- ceiling(W / L) + 3
  list(v = vapply(seq_len(K), function(i) rng(), numeric(1)), L = L)
}
noise_at <- function(lat, x) {         # smoothed value noise in [-1,1]
  u <- x / lat$L; k <- floor(u); if (k < 0) k <- 0
  n <- length(lat$v)
  a <- lat$v[min(k + 1, n)]; b <- lat$v[min(k + 2, n)]
  f <- u - k; sm <- f * f * (3 - 2 * f)
  (a + (b - a) * sm - 0.5) * 2
}
sstep <- function(a, b, x) { t <- min(1, max(0, (x - a) / (b - a))); t * t * (3 - 2 * t) }
gauss <- function(x, c, w) exp(-3 * ((x - c) / w)^2)
lerp_hex <- function(h1, h2, t) {
  a <- strtoi(c(substr(h1, 2, 3), substr(h1, 4, 5), substr(h1, 6, 7)), 16L)
  b <- strtoi(c(substr(h2, 2, 3), substr(h2, 4, 5), substr(h2, 6, 7)), 16L)
  v <- round(a + (b - a) * t)
  sprintf("#%02x%02x%02x", v[1], v[2], v[3])
}
line_color <- function(f) {            # oldest (dim) -> newest (light)
  if (f <= 0.55) lerp_hex(COL$n800, COL$n600, f / 0.55)
  else lerp_hex(COL$n600, COL$n200, (f - 0.55) / 0.45)
}
# viridis-family anchors (R viridisLite), sampled only for strata lines
PALETTES <- list(
  viridis = c("#440154", "#46327e", "#365c8d", "#277f8e", "#1fa187", "#4ac16d", "#a0da39", "#fde725"),
  magma   = c("#000004", "#1d1147", "#51127c", "#822681", "#b73779", "#e75263", "#fc8961", "#fcfdbf"),
  cividis = c("#00204d", "#31446b", "#575d6d", "#707173", "#8a8779", "#a69d75", "#c4b56c", "#ffea46"),
  turbo   = c("#30123b", "#4458cb", "#3e9bfe", "#18d6cb", "#46f884", "#a2fc3c", "#e1dd37", "#f98e09", "#d23105", "#7a0403"),
  plasma  = c("#0d0887", "#5601a4", "#9c179e", "#cc4778", "#ed7953", "#fdb32f", "#f0f921"),
  inferno = c("#000004", "#320a5e", "#781c6d", "#bb3754", "#ed6925", "#fcb519", "#fcffa4"))
sample_palette <- function(name, t) {
  P <- PALETTES[[name]]
  if (is.null(P)) return(COL$accent)
  u <- max(0, min(1, t)) * (length(P) - 1)
  k <- min(length(P) - 2, floor(u))
  lerp_hex(P[k + 1], P[k + 2], u - k)
}
fmt <- function(n) sprintf("%.2f", round(n * 100) / 100)
esc <- function(s) gsub(">", "&gt;", gsub("<", "&lt;", gsub("&", "&amp;", s, fixed = TRUE), fixed = TRUE), fixed = TRUE)

build_cover_svg <- function(p) {
  S <- p$spine_mm; W <- 2 * BLEED + 2 * TRIM_W + S; H <- TRIM_H + 2 * BLEED
  FX <- BLEED + TRIM_W + S                       # front-panel trim left edge
  rng <- make_lcg(p$seed)
  lat_a <- make_lattice(rng, W, 26)              # ridge, broad
  lat_b <- make_lattice(rng, W, 8)               # ridge, fine jag
  lat_c <- make_lattice(rng, W, 40)              # baseline drift
  N <- p$lines
  offs <- numeric(N); lats <- vector("list", N)  # same draw order as JS
  for (i in seq_len(N)) { offs[i] <- (rng() - 0.5) * 1.4; lats[[i]] <- make_lattice(rng, W, 9) }
  # weave: long-wavelength per-line drift on a SEPARATE rng stream, so the
  # parameter morphs the art without rescrambling the main seed
  weave_rng <- make_lcg(p$seed + 101)
  wlats <- vector("list", N)
  for (i in seq_len(N)) wlats[[i]] <- make_lattice(weave_rng, W, 80)

  h_at <- function(x) min(1, max(0.03,
    0.20 + 0.28 * sstep(4, FX - 40, x) + 0.44 * gauss(x, FX + 100, 70) +
    0.12 * gauss(x, FX + 40, 42) + 0.10 * gauss(x, 100, 80) -
    0.10 * sstep(FX + 140, W - 6, x) + 0.05 * noise_at(lat_a, x) + 0.02 * noise_at(lat_b, x)))
  bottom_at <- function(x) 235.5 - 3 * sstep(FX + 20, W, x) + 1.6 * noise_at(lat_c, x)
  spread_at <- function(x) 0.24 + 0.76 * sstep(6, FX + 70, x)

  xs <- seq(0, W, by = 2)
  if (xs[length(xs)] < W) xs <- c(xs, W)

  # strata membership: crest line first, then down the stack at a spacing set
  # by strata_spread; colors from the accent or a viridis-family ramp
  # (highest stratum = bright end)
  k <- max(0, min(6, p$strata))
  strata_rng <- make_lcg(p$seed + 202)
  frk <- numeric(0)
  if (k > 0) {
    frk <- numeric(k); sf <- 1
    for (j in seq_len(k)) {
      if (j > 1) sf <- sf - 0.14 * p$strata_spread * (1 + p$strata_jitter * (strata_rng() * 2 - 1) * 0.9)
      frk[j] <- max(0.05, min(1, sf))
    }
  }
  strata_idx <- if (k > 0) floor(frk * (N - 1) + 0.5) else integer(0)
  keep <- !duplicated(strata_idx)
  strata_idx <- strata_idx[keep]; frk <- frk[keep]
  strata_col <- rep(COL$accent, length(strata_idx))
  if (p$palette != "accent" && length(strata_idx) > 0) {
    rk <- order(frk)
    for (r in seq_along(rk)) {
      t <- if (length(strata_idx) == 1) 0.75 else 0.3 + 0.65 * (r - 1) / (length(strata_idx) - 1)
      strata_col[rk[r]] <- sample_palette(p$palette, t)
    }
  }

  path_for <- function(i0) {                     # i0 is zero-based, as in JS
    f <- i0 / (N - 1); e <- f^1.18
    parts <- character(length(xs))
    for (j in seq_along(xs)) {
      x <- xs[j]
      y <- bottom_at(x) - h_at(x) * 94 * spread_at(x) * (0.06 + 0.94 * e) -
           0.9 * p$dispersion * noise_at(lats[[i0 + 1]], x) + offs[i0 + 1] * p$dispersion -
           p$weave * 7 * noise_at(wlats[[i0 + 1]], x)
      parts[j] <- paste0(if (j == 1) "M" else "L", fmt(x), " ", fmt(y))
    }
    paste0(parts, collapse = "")
  }

  base <- character(0); strata <- character(0)
  for (i0 in 0:(N - 1)) {
    d <- path_for(i0); f <- i0 / (N - 1)
    if (i0 %in% strata_idx) {
      sc <- strata_col[match(i0, strata_idx)]; sw <- fmt(p$strata_width)
      strata <- c(strata,
        sprintf('<path d="%s" fill="none" stroke="%s" stroke-width="%s" filter="url(#glow)" opacity="0.6"/>', d, sc, sw),
        sprintf('<path d="%s" fill="none" stroke="%s" stroke-width="%s"/>', d, sc, sw))
    } else {
      top <- i0 == N - 1
      base <- c(base, sprintf('<path d="%s" fill="none" stroke="%s" stroke-width="%s" opacity="%s"/>',
        d, if (top) COL$text else line_color(f), if (top) "0.5" else "0.32", p$line_alpha))
    }
  }

  # front text (title_scale multiplies fonts + leading; tick stays put)
  tx <- FX + 18; ts <- p$title_scale
  front <- sprintf('<rect x="%s" y="30.2" width="13" height="1.15" fill="%s"/>', fmt(tx), COL$accent)
  for (i in seq_along(p$title))
    front <- paste0(front, sprintf('<text x="%s" y="%s" font-size="%s" font-weight="500" fill="%s" letter-spacing="0.05">%s</text>',
      fmt(tx), fmt(33.5 + 8.5 * ts + (i - 1) * 11 * ts), fmt(8.5 * ts), COL$text, esc(p$title[i])))
  front <- paste0(front, sprintf('<text x="%s" y="%s" font-size="%s" font-weight="400" fill="%s" letter-spacing="%s">%s</text>',
    fmt(tx), fmt(33.5 + 8.5 * ts + length(p$title) * 11 * ts + 4.5), fmt(4.9 * ts), COL$n300, fmt(0.5 * ts), esc(p$name)))

  # spine text (rotated, reads top -> bottom: name, then full title)
  scx <- BLEED + TRIM_W + S / 2
  full_title <- paste(p$title, collapse = " ")
  name_len <- nchar(p$name) * 0.55 * 3.0
  spine <- paste0(
    sprintf('<text transform="translate(%s 12) rotate(90)" font-size="3" font-weight="400" fill="%s" letter-spacing="0.04">%s</text>',
      fmt(scx + 1.2), COL$n400, esc(p$name)),
    sprintf('<text transform="translate(%s %s) rotate(90)" font-size="3.4" font-weight="500" fill="%s" letter-spacing="0.04">%s</text>',
      fmt(scx + 1.2), fmt(12 + name_len + 5), COL$text, esc(full_title)))

  # guides
  gl <- function(x1, y1, x2, y2, st, dash = NULL)
    sprintf('<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="0.25"%s/>',
      x1, y1, x2, y2, st, if (is.null(dash)) "" else sprintf(' stroke-dasharray="%s"', dash))
  lbl <- function(x, y, t) sprintf('<text x="%s" y="%s" font-size="2.8" fill="%s">%s</text>', x, y, COL$n500, t)
  guides <- paste0(
    sprintf('<g id="guides" display="%s">', if (p$show_guides) "inline" else "none"),
    sprintf('<rect x="%s" y="%s" width="%s" height="%s" fill="none" stroke="%s" stroke-width="0.25" stroke-dasharray="2 1.5"/>',
      BLEED, BLEED, 2 * TRIM_W + S, TRIM_H, COL$n500),
    gl(BLEED + TRIM_W, 0, BLEED + TRIM_W, H, COL$accent), gl(FX, 0, FX, H, COL$accent),
    sprintf('<rect x="%s" y="%s" width="%s" height="%s" fill="none" stroke="%s" stroke-width="0.2" stroke-dasharray="0.8 1.2"/>',
      BLEED + 10, BLEED + 10, TRIM_W - 20, TRIM_H - 20, COL$n600),
    sprintf('<rect x="%s" y="%s" width="%s" height="%s" fill="none" stroke="%s" stroke-width="0.2" stroke-dasharray="0.8 1.2"/>',
      FX + 10, BLEED + 10, TRIM_W - 20, TRIM_H - 20, COL$n600),
    lbl(BLEED + 4, 8.5, "back"), lbl(BLEED + TRIM_W + 1.2, 8.5, sprintf("spine %s mm", S)), lbl(FX + 4, 8.5, "front"),
    lbl(BLEED + 4, H - 4.5, sprintf("trim 170 \u00d7 240 mm \u00b7 bleed %s mm \u00b7 total %s \u00d7 %s mm", BLEED, W, H)),
    "</g>")

  paste0(
'<svg xmlns="http://www.w3.org/2000/svg" width="', W, 'mm" height="', H, 'mm" viewBox="0 0 ', W, " ", H, '" font-family="Inter, sans-serif">
<title>Thesis cover wrap \u2014 ', esc(full_title), '</title>
<style>@import url(\'https://fonts.googleapis.com/css2?family=Inter:wght@400;500&amp;display=swap\');text{font-family:\'Inter\',sans-serif;}</style>
<defs>
<linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1e30"/><stop offset="0.55" stop-color="', COL$bg, '"/><stop offset="1" stop-color="#111320"/></linearGradient>
<radialGradient id="peakGlow"><stop offset="0" stop-color="', COL$a900, '" stop-opacity="0.85"/><stop offset="1" stop-color="', COL$a900, '" stop-opacity="0"/></radialGradient>
<linearGradient id="edgeFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="', W, '" y2="0"><stop offset="0" stop-color="#000"/><stop offset="', fmt(22 / W), '" stop-color="#fff"/><stop offset="', fmt(1 - 22 / W), '" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<linearGradient id="foldShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0e101a" stop-opacity="0"/><stop offset="0.5" stop-color="#0e101a" stop-opacity="0.55"/><stop offset="1" stop-color="#0e101a" stop-opacity="0"/></linearGradient>
<mask id="fadeMask"><rect x="0" y="0" width="', W, '" height="', H, '" fill="url(#edgeFade)"/></mask>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>
</defs>
<g id="background"><rect width="', W, '" height="', H, '" fill="url(#bgGrad)"/><ellipse cx="', fmt(FX + 100), '" cy="185" rx="150" ry="88" fill="url(#peakGlow)"/></g>
<g id="ridge" mask="url(#fadeMask)"><g id="cohort-lines">', paste0(base, collapse = ""), '</g><g id="strata-lines">', paste0(strata, collapse = ""), '</g></g>
<g id="fold-shading"><rect x="', fmt(BLEED + TRIM_W - 4), '" y="0" width="', fmt(S + 8), '" height="', H, '" fill="url(#foldShade)"/></g>
<g id="spine-text">', spine, '</g>
<g id="front-text">', front, '</g>
', guides, '
</svg>')
}

svg <- build_cover_svg(params)
con <- file(params$out, open = "w", encoding = "UTF-8")
writeLines(svg, con, useBytes = FALSE)
close(con)
cat("wrote", params$out, "-", nchar(svg), "chars\n")
