// Deterministic pseudo-randomness for the cohort ridge.
//
// A direct port of app/R/noise.R. Reproducibility of the artwork rests
// entirely on this file, and on the *order* in which the stream is consumed:
// every lattice takes a variable number of draws, so inserting one anywhere
// shifts everything after it. The multiplier/modulus pair is the classic
// MINSTD, chosen because every intermediate product stays exactly
// representable in a double — which is as true of JavaScript numbers as it is
// of R's, so the two implementations agree bit for bit.

const LCG_MULTIPLIER = 16807;
const LCG_MODULUS = 2147483647;

/**
 * Draw a fixed-length Lehmer pseudo-random stream.
 *
 * @param seed Seed value. Non-integers are floored.
 * @param n Number of draws to return.
 * @returns `n` values in (0, 1).
 */
export function lcgStream(seed: number, n: number): Float64Array {
  if (n < 1) return new Float64Array(0);
  // R's %% returns a non-negative result for a positive modulus; JavaScript's
  // % keeps the sign of the dividend, so a negative seed needs correcting.
  const wrapped = Math.floor(seed) % (LCG_MODULUS - 1);
  let state = (wrapped < 0 ? wrapped + LCG_MODULUS - 1 : wrapped) + 1;

  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    state = (state * LCG_MULTIPLIER) % LCG_MODULUS;
    out[i] = state / LCG_MODULUS;
  }
  return out;
}

/**
 * Number of draws a lattice of a given wavelength consumes.
 *
 * @param width Width of the canvas in mm.
 * @param wavelength Distance in mm between lattice nodes.
 */
export function latticeSize(width: number, wavelength: number): number {
  return Math.ceil(width / wavelength) + 3;
}

/**
 * Sample smoothed value noise from a slice of the stream.
 *
 * @param values Draws in (0, 1), one per lattice node.
 * @param wavelength Distance in mm between nodes.
 * @param x Position in mm.
 * @returns A value in [-1, 1].
 */
export function noiseAt(
  values: ArrayLike<number>,
  wavelength: number,
  x: number,
): number {
  const u = x / wavelength;
  const node = Math.max(0, Math.floor(u));
  const frac = u - node;
  const n = values.length;
  const lo = values[Math.min(node, n - 1)];
  const hi = values[Math.min(node + 1, n - 1)];
  return (lo + (hi - lo) * frac * frac * (3 - 2 * frac) - 0.5) * 2;
}

/**
 * Hermite smoothstep between two edges.
 */
export function smoothstep(edgeLo: number, edgeHi: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edgeLo) / (edgeHi - edgeLo)));
  return t * t * (3 - 2 * t);
}

/**
 * Unnormalised Gaussian bump, falling to exp(-3) at `centre ± width`.
 */
export function gaussianBump(x: number, centre: number, width: number): number {
  const t = (x - centre) / width;
  return Math.exp(-3 * t * t);
}
