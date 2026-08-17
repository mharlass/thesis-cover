// Geometry of the cover. A port of app/R/geometry.R. Nothing here draws.
//
// All units are millimetres in SVG orientation: x runs left to right across
// the wrap (back | spine | front) and y runs top to bottom.

import { gaussianBump, latticeSize, lcgStream, noiseAt, smoothstep } from "./noise";
import { NOCTURNE, cohortColour, strataColour } from "./palette";
import { type CoverParams, validateCoverParams } from "./params";

export const TRIM_WIDTH = 170;
export const TRIM_HEIGHT = 240;
export const BLEED = 3;
/** Sampling interval along the wrap, in mm. */
export const X_STEP = 2;

export interface CoverDims {
  spine: number;
  bleed: number;
  trimWidth: number;
  trimHeight: number;
  width: number;
  height: number;
  frontX: number;
}

export interface CoverLine {
  lineId: number;
  /** y at each x in the shared `xs` array. */
  ys: Float64Array;
  colour: string;
  linewidth: number;
  alpha: number;
  isStrata: boolean;
}

export interface CoverTextItem {
  label: string;
  x: number;
  y: number;
  size: number;
  colour: string;
  face: "bold" | "plain";
  angle: number;
  /**
   * Extra advance after each glyph, in mm.
   *
   * The original generator set this on every run of type and the ggplot
   * rewrite had to drop it, because ggplot has no tracking control — which is
   * why AGENTS.md lists tighter type as a known difference. SVG, Canvas and
   * PDF can all express it, so the original values are carried here and the
   * type sets as it was designed to. The R pipeline has no matching field;
   * the parity fixture checks the other seven, which are the ones that place
   * the text.
   */
  tracking: number;
}

export interface CoverGeometry {
  params: CoverParams;
  dims: CoverDims;
  /** Shared x sample positions; every line has one y per entry. */
  xs: Float64Array;
  lines: CoverLine[];
  text: CoverTextItem[];
}

/**
 * Page geometry for a given spine width.
 *
 * @param spineMm Spine width in mm, from the printer's page-count calculation.
 * @returns Dimensions in mm; `frontX` is the front panel's left trim edge,
 *   which anchors the title block and the ridge crest.
 */
export function coverDims(spineMm: number): CoverDims {
  return {
    spine: spineMm,
    bleed: BLEED,
    trimWidth: TRIM_WIDTH,
    trimHeight: TRIM_HEIGHT,
    width: 2 * BLEED + 2 * TRIM_WIDTH + spineMm,
    height: TRIM_HEIGHT + 2 * BLEED,
    frontX: BLEED + TRIM_WIDTH + spineMm,
  };
}

/** The x positions the ridge is sampled at, matching R's `seq(0, width, 2)`. */
function sampleX(width: number, step: number): Float64Array {
  const n = Math.floor(width / step) + 1;
  const extra = (n - 1) * step < width ? 1 : 0;
  const xs = new Float64Array(n + extra);
  for (let i = 0; i < n; i++) xs[i] = i * step;
  if (extra) xs[n] = width;
  return xs;
}

export interface GeometryOptions {
  /**
   * Sampling interval along the wrap, in mm. Defaults to the 2 mm grid the R
   * pipeline and the original generator both used, which is what the
   * regression fixtures pin.
   *
   * Every lattice is sized from the page width alone, so refining this draws
   * more samples from the same random stream rather than a different one: the
   * ridge is the same continuous curve, read at more places. Only the tests
   * use it, to measure the smoothed path against the underlying function.
   */
  xStep?: number;
}

/**
 * Build every coordinate the cover needs.
 *
 * The stream is consumed in a fixed order: three ridge lattices, then one
 * offset draw plus one lattice for each line. Change the order and the
 * artwork changes.
 */
export function coverGeometry(
  params: CoverParams,
  options: GeometryOptions = {},
): CoverGeometry {
  validateCoverParams(params);
  const dims = coverDims(params.spine_mm);
  const width = dims.width;
  const n = params.lines;

  const nBroad = latticeSize(width, 26);
  const nJag = latticeSize(width, 8);
  const nBase = latticeSize(width, 40);
  const nLine = latticeSize(width, 9);
  const draws = lcgStream(params.seed, nBroad + nJag + nBase + n * (1 + nLine));

  const broad = draws.subarray(0, nBroad);
  const jag = draws.subarray(nBroad, nBroad + nJag);
  const base = draws.subarray(nBroad + nJag, nBroad + nJag + nBase);

  // What is left reshapes into one column per line: the offset draw on top,
  // that line's lattice underneath. R's matrix() fills column-wise, so each
  // line's block is contiguous.
  const perLineStart = nBroad + nJag + nBase;
  const blockSize = 1 + nLine;
  const offsets = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    offsets[i] = (draws[perLineStart + i * blockSize] - 0.5) * 1.4;
  }

  // Weave runs on its own stream, so the slider morphs the art instead of
  // rescrambling the main seed.
  const nWeave = latticeSize(width, 80);
  const weaveDraws = lcgStream(params.seed + 101, n * nWeave);

  const xs = sampleX(width, options.xStep ?? X_STEP);
  const nx = xs.length;
  const frontX = dims.frontX;

  // The ridge is three scalar profiles of x: crest height, baseline drift and
  // fan-out toward the front panel.
  const crest = new Float64Array(nx);
  const bottom = new Float64Array(nx);
  const spread = new Float64Array(nx);
  for (let k = 0; k < nx; k++) {
    const x = xs[k];
    crest[k] = Math.min(
      1,
      Math.max(
        0.03,
        0.2 +
          0.28 * smoothstep(4, frontX - 40, x) +
          0.44 * gaussianBump(x, frontX + 100, 70) +
          0.12 * gaussianBump(x, frontX + 40, 42) +
          0.1 * gaussianBump(x, 100, 80) -
          0.1 * smoothstep(frontX + 140, width - 6, x) +
          0.05 * noiseAt(broad, 26, x) +
          0.02 * noiseAt(jag, 8, x),
      ),
    );
    bottom[k] = 235.5 - 3 * smoothstep(frontX + 20, width, x) + 1.6 * noiseAt(base, 40, x);
    spread[k] = 0.24 + 0.76 * smoothstep(6, frontX + 70, x);
  }

  const style = cohortStyle(params, n);
  const lines: CoverLine[] = [];
  for (let i = 0; i < n; i++) {
    const rise = Math.pow(i / (n - 1), 1.18);
    const lattice = draws.subarray(
      perLineStart + i * blockSize + 1,
      perLineStart + (i + 1) * blockSize,
    );
    const weave = weaveDraws.subarray(i * nWeave, (i + 1) * nWeave);
    const ys = new Float64Array(nx);
    for (let k = 0; k < nx; k++) {
      const x = xs[k];
      ys[k] =
        bottom[k] -
        crest[k] * 94 * spread[k] * (0.06 + 0.94 * rise) -
        0.9 * params.dispersion * noiseAt(lattice, 9, x) +
        offsets[i] * params.dispersion -
        params.weave * 7 * noiseAt(weave, 80, x);
    }
    lines.push({ lineId: i, ys, ...style[i] });
  }

  return { params, dims, xs, lines, text: coverText(params, dims) };
}

interface LineStyle {
  colour: string;
  linewidth: number;
  alpha: number;
  isStrata: boolean;
}

/**
 * Stroke, colour and opacity for every line in the stack, by zero-based index.
 */
export function cohortStyle(params: CoverParams, n: number): LineStyle[] {
  const strata = new Map(strataLines(params, n).map((s) => [s.lineId, s.colour]));
  return Array.from({ length: n }, (_, lineId) => {
    const rank = lineId / (n - 1);
    const strataColourHere = strata.get(lineId);
    const isStrata = strataColourHere !== undefined;
    // The newest cohort reads as the crest, unless it is already a stratum.
    const isCrest = lineId === n - 1 && !isStrata;
    return {
      colour: isStrata ? strataColourHere! : isCrest ? NOCTURNE.text : cohortColour(rank),
      linewidth: isStrata ? params.strata_width : isCrest ? 0.5 : 0.32,
      alpha: isStrata ? 1 : params.line_alpha,
      isStrata,
    };
  });
}

export interface StratumLine {
  lineId: number;
  fraction: number;
  colour: string;
}

/**
 * Which lines are highlighted risk strata, and in what colour.
 *
 * The crest comes first, then the stack is walked downward in steps set by
 * `strata_spread` and perturbed by `strata_jitter`. Steps accumulate on the
 * unclamped fraction, so a stratum pushed past the bottom does not drag the
 * ones below it along.
 */
export function strataLines(params: CoverParams, n: number): StratumLine[] {
  if (params.strata < 1) return [];
  const jitter = lcgStream(params.seed + 202, params.strata - 1);

  const fractions: number[] = [];
  let cumulative = 0;
  for (let i = 0; i <= jitter.length; i++) {
    if (i > 0) {
      cumulative +=
        0.14 * params.strata_spread * (1 + params.strata_jitter * (jitter[i - 1] * 2 - 1) * 0.9);
    }
    fractions.push(Math.min(1, Math.max(0.05, 1 - cumulative)));
  }

  // distinct(line_id, .keep_all = TRUE) keeps the first row of each line_id.
  const kept: { lineId: number; fraction: number }[] = [];
  const seen = new Set<number>();
  for (const fraction of fractions) {
    const lineId = Math.floor(fraction * (n - 1) + 0.5);
    if (seen.has(lineId)) continue;
    seen.add(lineId);
    kept.push({ lineId, fraction });
  }

  const positions = palettePosition(kept.map((k) => k.fraction));
  return kept.map((k, i) => ({
    ...k,
    colour: strataColour(params.palette, positions[i]),
  }));
}

/**
 * Position each stratum along its colormap, brightest at the top of the stack.
 *
 * Mirrors R's `rank(fraction, ties.method = "first")`: ascending, ties broken
 * by order of appearance.
 */
export function palettePosition(fraction: number[]): number[] {
  if (fraction.length === 1) return [0.75];
  const order = fraction
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  const ranks = new Array<number>(fraction.length);
  order.forEach((entry, i) => {
    ranks[entry.index] = i;
  });
  return ranks.map((r) => 0.3 + (0.65 * r) / (fraction.length - 1));
}

/**
 * Front-panel and spine typesetting.
 *
 * `x` and `y` are text baseline anchors in SVG orientation, matching the
 * coordinates the original generator emitted.
 */
export function coverText(params: CoverParams, dims: CoverDims): CoverTextItem[] {
  const scale = params.title_scale;
  const title = params.title;
  const nTitle = title.length;
  const frontX = dims.frontX + 18;
  const firstLineY = 33.5 + 8.5 * scale;
  const spineX = BLEED + TRIM_WIDTH + dims.spine / 2 + 1.2;
  // The spine title starts below the name; 0.55 em is Inter's mean advance.
  const spineTitleY = 12 + params.name.length * 0.55 * 3 + 5;

  const items: CoverTextItem[] = title.map((label, i) => ({
    label,
    x: frontX,
    y: firstLineY + i * 11 * scale,
    size: 8.5 * scale,
    colour: NOCTURNE.text,
    face: "bold" as const,
    angle: 0,
    tracking: 0.05,
  }));

  items.push({
    label: params.name,
    x: frontX,
    y: firstLineY + nTitle * 11 * scale + 4.5,
    size: 4.9 * scale,
    colour: NOCTURNE.n300,
    face: "plain",
    angle: 0,
    tracking: 0.5,
  });
  items.push({
    label: params.name,
    x: spineX,
    y: 12,
    size: 3,
    colour: NOCTURNE.n400,
    face: "plain",
    angle: -90,
    tracking: 0.04,
  });
  items.push({
    label: title.join(" "),
    x: spineX,
    y: spineTitleY,
    size: 3.4,
    colour: NOCTURNE.text,
    face: "bold",
    angle: -90,
    tracking: 0.04,
  });
  return items;
}
