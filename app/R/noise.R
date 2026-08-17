# Deterministic pseudo-randomness for the cohort ridge.
#
# Reproducibility of the artwork rests entirely on this file. A Lehmer LCG
# supplies the stream; the *order* in which that stream is consumed is part of
# the contract, because every lattice takes a variable number of draws and
# inserting one anywhere shifts everything after it. The multiplier/modulus
# pair is the classic MINSTD, chosen because every intermediate product stays
# exactly representable in a double.

LCG_MULTIPLIER <- 16807
LCG_MODULUS <- 2147483647

#' Draw a fixed-length Lehmer pseudo-random stream.
#'
#' @param seed Seed value. Non-integers are floored.
#' @param n Number of draws to return.
#' @returns Numeric vector of length `n` with values in (0, 1).
lcg_stream <- function(seed, n) {
  if (n < 1) {
    return(numeric(0))
  }
  # R's %% already returns a non-negative result for a positive modulus, so
  # the defensive double modulo of the JavaScript original is not needed.
  start <- floor(seed) %% (LCG_MODULUS - 1) + 1
  states <- accumulate(
    seq_len(n),
    \(state, step) (state * LCG_MULTIPLIER) %% LCG_MODULUS,
    .init = start
  )
  states[-1] / LCG_MODULUS
}

#' Number of draws a lattice of a given wavelength consumes.
#'
#' @param width Width of the canvas in mm.
#' @param wavelength Distance in mm between lattice nodes.
#' @returns Number of lattice nodes.
lattice_size <- function(width, wavelength) {
  ceiling(width / wavelength) + 3
}

#' Sample smoothed value noise from a slice of the stream.
#'
#' Vectorised over `x`, which matters: the ridge evaluates this once per
#' vertex per line, up to roughly 55,000 times for a dense cover.
#'
#' @param values Numeric draws in (0, 1), one per lattice node.
#' @param wavelength Distance in mm between nodes.
#' @param x Numeric vector of positions in mm.
#' @returns Numeric vector of noise values in [-1, 1].
noise_at <- function(values, wavelength, x) {
  u <- x / wavelength
  node <- pmax(0, floor(u))
  frac <- u - node
  n <- length(values)
  lo <- values[pmin(node + 1, n)]
  hi <- values[pmin(node + 2, n)]
  (lo + (hi - lo) * frac * frac * (3 - 2 * frac) - 0.5) * 2
}

#' Hermite smoothstep between two edges.
#'
#' @param edge_lo,edge_hi Numeric scalars bounding the transition.
#' @param x Numeric vector of positions.
#' @returns Numeric vector in [0, 1].
smoothstep <- function(edge_lo, edge_hi, x) {
  t <- pmin(1, pmax(0, (x - edge_lo) / (edge_hi - edge_lo)))
  t * t * (3 - 2 * t)
}

#' Unnormalised Gaussian bump.
#'
#' @param x Numeric vector of positions.
#' @param centre Centre of the bump.
#' @param width Characteristic width; the bump falls to exp(-3) at
#'   `centre +- width`.
#' @returns Numeric vector in (0, 1].
gaussian_bump <- function(x, centre, width) {
  exp(-3 * ((x - centre) / width)^2)
}
