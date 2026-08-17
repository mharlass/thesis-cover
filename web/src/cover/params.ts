// The single definition of every cover parameter.
//
// PARAM_SPEC is the one source of truth for four consumers: the defaults in
// coverParams(), input validation, the control sidebar (built by iterating
// over it) and the URL query string. Adding a parameter means adding one row
// here.

import { STRATA_PALETTES, type StrataPalette } from "./palette";

export type Editor = "range" | "int" | "boolean" | "enum" | "text";
export type Section = "Print" | "Type" | "Line art" | "Strata";

export interface ParamSpec {
  name: keyof CoverParams;
  label: string;
  section: Section;
  editor: Editor;
  lower?: number;
  upper?: number;
  step?: number;
  unit?: string;
}

export interface CoverParams {
  spine_mm: number;
  show_guides: boolean;
  title_scale: number;
  title: string[];
  name: string;
  lines: number;
  dispersion: number;
  weave: number;
  line_alpha: number;
  contour_depth: number;
  seed: number;
  strata: number;
  palette: StrataPalette;
  strata_width: number;
  strata_spread: number;
  strata_jitter: number;
}

export const PARAM_SPEC: readonly ParamSpec[] = [
  { name: "spine_mm", label: "Spine width", section: "Print", editor: "range", lower: 6, upper: 24, step: 0.5, unit: "mm" },
  { name: "show_guides", label: "Show guides", section: "Print", editor: "boolean" },
  { name: "title_scale", label: "Title scale", section: "Type", editor: "range", lower: 0.6, upper: 1.6, step: 0.05 },
  { name: "title", label: "Title lines", section: "Type", editor: "text" },
  { name: "name", label: "Author", section: "Type", editor: "text" },
  { name: "lines", label: "Cohort lines", section: "Line art", editor: "range", lower: 8, upper: 300, step: 2 },
  { name: "dispersion", label: "Dispersion", section: "Line art", editor: "range", lower: 0, upper: 4, step: 0.1 },
  { name: "weave", label: "Weave", section: "Line art", editor: "range", lower: 0, upper: 1, step: 0.05 },
  { name: "line_alpha", label: "Line opacity", section: "Line art", editor: "range", lower: 0.05, upper: 1, step: 0.05 },
  { name: "contour_depth", label: "Contour depth", section: "Line art", editor: "range", lower: 0, upper: 1, step: 0.05 },
  { name: "seed", label: "Seed", section: "Line art", editor: "int", lower: 0, upper: 99999, step: 1 },
  { name: "strata", label: "Strata lines", section: "Strata", editor: "range", lower: 0, upper: 6, step: 1 },
  { name: "palette", label: "Strata palette", section: "Strata", editor: "enum" },
  { name: "strata_width", label: "Strata weight", section: "Strata", editor: "range", lower: 0.2, upper: 2, step: 0.05, unit: "mm" },
  { name: "strata_spread", label: "Strata spacing", section: "Strata", editor: "range", lower: 0.3, upper: 3, step: 0.1 },
  { name: "strata_jitter", label: "Strata jitter", section: "Strata", editor: "range", lower: 0, upper: 1, step: 0.05 },
];

export const PARAM_SECTIONS: readonly Section[] = ["Print", "Type", "Line art", "Strata"];

/** How many title lines the app offers to edit. Blank ones are dropped. */
export const TITLE_LINES = 5;

export const DEFAULT_PARAMS: CoverParams = {
  spine_mm: 12,
  show_guides: false,
  title_scale: 1,
  title: [
    "Enhancing",
    "Microsimulation Models",
    "for Risk-Stratified",
    "and Equitable",
    "Colorectal Cancer Prevention",
  ],
  name: "Matthias Florian Harlaß",
  lines: 64,
  dispersion: 1,
  weave: 0,
  line_alpha: 0.9,
  contour_depth: 0,
  seed: 42,
  strata: 3,
  palette: "accent",
  strata_width: 0.6,
  strata_spread: 1,
  strata_jitter: 0,
};

/**
 * Named presets covering the looks worth returning to.
 *
 * `candidate_v31` reproduces `candidates/thesis-cover_v3.1.svg` exactly. That
 * file was downloaded from the original preview app without its settings being
 * recorded; the values below were recovered from the SVG itself and are checked
 * against it by the geometry tests.
 */
export const PRESETS: Record<string, Partial<CoverParams>> = {
  default: {},
  candidate_v31: {
    seed: 43,
    lines: 100,
    dispersion: 2.2,
    weave: 0.6,
    line_alpha: 0.2,
    title_scale: 1.15,
    strata: 4,
    palette: "viridis",
    strata_width: 0.9,
    strata_spread: 1.4,
    strata_jitter: 0.25,
  },
  sparse: { lines: 24, dispersion: 0.6, line_alpha: 1, strata: 2, strata_width: 0.8 },
  relief: { contour_depth: 0.9 },
  woven: {
    lines: 160,
    weave: 0.55,
    dispersion: 1.8,
    line_alpha: 0.55,
    strata: 5,
    palette: "magma",
    strata_spread: 1.4,
  },
};

export const PRESET_LABELS: Record<string, string> = {
  default: "Default (v3)",
  candidate_v31: "Candidate v3.1",
  sparse: "Sparse",
  relief: "Contour relief",
  woven: "Woven",
};

/**
 * Build a validated parameter set.
 *
 * @param overrides Named overrides, e.g. `{ seed: 7, palette: "viridis" }`.
 * @param preset Name of an entry in PRESETS, applied beneath `overrides`.
 */
export function coverParams(
  overrides: Partial<CoverParams> = {},
  preset = "default",
): CoverParams {
  if (!(preset in PRESETS)) {
    throw new Error(
      `\`preset\` must be one of ${Object.keys(PRESETS).join(", ")}, not "${preset}".`,
    );
  }
  const unknown = Object.keys(overrides).filter((k) => !(k in DEFAULT_PARAMS));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown cover parameter(s): ${unknown.join(", ")}. ` +
        `Valid names are ${Object.keys(DEFAULT_PARAMS).join(", ")}.`,
    );
  }
  return validateCoverParams({ ...DEFAULT_PARAMS, ...PRESETS[preset], ...overrides });
}

/**
 * Check a parameter set against PARAM_SPEC.
 *
 * Every parameter is checked before anything is reported, so a caller with
 * several bad values learns about all of them at once.
 */
export function validateCoverParams(params: CoverParams): CoverParams {
  const problems = PARAM_SPEC.map((spec) =>
    checkParam(spec, params[spec.name]),
  ).filter((p) => p.length > 0);
  if (problems.length > 0) {
    throw new Error(
      `Invalid cover parameter${problems.length > 1 ? "s" : ""}:\n` +
        problems.map((p) => `* ${p}`).join("\n"),
    );
  }
  return params;
}

function checkParam(spec: ParamSpec, value: unknown): string {
  switch (spec.editor) {
    case "boolean":
      return checkFlag(spec.name, value);
    case "enum":
      return checkEnum(spec.name, value);
    case "text":
      return checkText(spec.name, value);
    case "int":
      return checkNumber(spec, value, true);
    default:
      return checkNumber(spec, value, false);
  }
}

function checkNumber(spec: ParamSpec, value: unknown, whole: boolean): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return `\`${spec.name}\` must be a single finite number, not ${describe(value)}.`;
  }
  if (whole && value !== Math.round(value)) {
    return `\`${spec.name}\` must be a whole number, not ${value}.`;
  }
  if (value < spec.lower! || value > spec.upper!) {
    return `\`${spec.name}\` must lie in [${spec.lower}, ${spec.upper}], not ${value}.`;
  }
  return "";
}

function checkFlag(name: string, value: unknown): string {
  return typeof value === "boolean"
    ? ""
    : `\`${name}\` must be TRUE or FALSE, not ${describe(value)}.`;
}

function checkEnum(name: string, value: unknown): string {
  const allowed = STRATA_PALETTES.join(", ");
  return typeof value === "string" && (STRATA_PALETTES as readonly string[]).includes(value)
    ? ""
    : `\`${name}\` must be one of ${allowed}, not ${describe(value)}.`;
}

function checkText(name: string, value: unknown): string {
  if (name === "name") {
    return typeof value === "string"
      ? ""
      : `\`${name}\` must be a string, not ${describe(value)}.`;
  }
  return Array.isArray(value) && value.length >= 1 && value.every((v) => typeof v === "string")
    ? ""
    : `\`${name}\` must be a non-empty array of strings, not ${describe(value)}.`;
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return `array of length ${value.length}`;
  return JSON.stringify(String(value));
}
