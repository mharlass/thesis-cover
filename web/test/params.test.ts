// Parameter validation and portable URL-state regression checks.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PARAMS,
  PARAM_SECTIONS,
  PARAM_SPEC,
  PRESETS,
  PRESET_LABELS,
  coverParams,
} from "../src/cover/params";
import { coverParamsFromQuery, coverQuery } from "../src/cover/url-state";

describe("parameters", () => {
  it("defaults cover every parameter in the spec", () => {
    expect(Object.keys(DEFAULT_PARAMS).sort()).toEqual(PARAM_SPEC.map((s) => s.name).sort());
    expect([...new Set(PARAM_SPEC.map((s) => s.section))].sort()).toEqual(
      [...PARAM_SECTIONS].sort(),
    );
  });

  it("has a valid, labelled preset for every name", () => {
    for (const name of Object.keys(PRESETS)) {
      expect(() => coverParams({}, name)).not.toThrow();
    }
    expect(Object.keys(PRESETS).sort()).toEqual(Object.keys(PRESET_LABELS).sort());
  });

  it("lets overrides win over presets", () => {
    expect(coverParams({ seed: 7 }, "candidate_v31").seed).toBe(7);
    expect(coverParams({}, "candidate_v31").lines).toBe(100);
  });

  it("refuses out-of-range values, naming value and expectation", () => {
    expect(() => coverParams({ strata: 9 })).toThrow("`strata` must lie in [0, 6], not 9");
    expect(() => coverParams({ line_alpha: 0 })).toThrow(
      "`line_alpha` must lie in [0.05, 1], not 0",
    );
    expect(() => coverParams({ seed: 1.5 })).toThrow("`seed` must be a whole number, not 1.5");
    expect(() => coverParams({ palette: "rainbow" as never })).toThrow(/must be one of accent/);
    expect(() => coverParams({ show_guides: "yes" as never })).toThrow(
      "`show_guides` must be TRUE or FALSE",
    );
    expect(() => coverParams({ name: 42 as never })).toThrow("`name` must be a string");
  });

  it("reports all problems at once", () => {
    expect(() => coverParams({ strata: 9, palette: "rainbow" as never })).toThrow(
      /Invalid cover parameters:\n\* .*\n\* /s,
    );
  });

  it("refuses unknown parameters", () => {
    expect(() => coverParams({ colour: "red" } as never)).toThrow(
      "Unknown cover parameter(s): colour",
    );
    expect(() => coverParams({}, "nope")).toThrow("`preset` must be one of default");
  });
});

describe("URL state", () => {
  it("writes an empty query for the defaults", () => {
    expect(coverQuery(coverParams())).toBe("?");
  });

  it("writes out only what changed, readably and in spec order", () => {
    expect(coverQuery(coverParams({ seed: 43, lines: 100, palette: "viridis" }))).toBe(
      "?lines=100&seed=43&palette=viridis",
    );
  });

  it("uses stable uppercase booleans while accepting either case", () => {
    expect(coverQuery(coverParams({ show_guides: true }))).toBe("?show_guides=TRUE");
    expect(coverParamsFromQuery("?show_guides=TRUE").show_guides).toBe(true);
    expect(coverParamsFromQuery("?show_guides=true").show_guides).toBe(true);
  });

  it("round-trips every preset", () => {
    for (const name of Object.keys(PRESETS)) {
      const params = coverParams({}, name);
      expect(coverParamsFromQuery(coverQuery(params))).toEqual(params);
    }
  });

  it("round-trips an edited title and author", () => {
    const params = coverParams({
      title: ["One line", "Two & three"],
      name: "Ada Lovelace",
    });
    expect(coverParamsFromQuery(coverQuery(params))).toEqual(params);
  });

  it("treats the leading question mark as optional", () => {
    expect(coverParamsFromQuery("seed=7").seed).toBe(7);
    expect(coverParamsFromQuery("?seed=7").seed).toBe(7);
  });

  it("falls back to defaults on unknown, malformed and out-of-range keys", () => {
    const defaults = coverParams();
    expect(coverParamsFromQuery("")).toEqual(defaults);
    expect(coverParamsFromQuery("?colour=red").seed).toBe(defaults.seed);
    expect(coverParamsFromQuery("?seed=banana")).toEqual(defaults);
    expect(coverParamsFromQuery("?strata=99")).toEqual(defaults);
    expect(coverParamsFromQuery("?seed=7&strata=99")).toEqual(defaults);
  });
});
