// Carrying a parameter set in the page's query string.
//
// The point is a link that can be pasted into an email, so only parameters
// that differ from the defaults are written out and the encoding stays
// readable: ?seed=43&lines=100&palette=viridis

import {
  type CoverParams,
  DEFAULT_PARAMS,
  PARAM_SPEC,
  coverParams,
} from "./params";

/** Format a value compactly for a readable query string. */
function encodeValue(value: unknown): string {
  const text = Array.isArray(value)
    ? value.map(String).join("|")
    : typeof value === "boolean"
      ? value
        ? "TRUE"
        : "FALSE"
      : String(value);
  return encodeURIComponent(text);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/**
 * Encode a parameter set as a query string.
 *
 * @returns A string beginning with `?`, or `"?"` when nothing differs from the
 *   defaults.
 */
export function coverQuery(params: CoverParams): string {
  const changed = (Object.keys(DEFAULT_PARAMS) as (keyof CoverParams)[]).filter(
    (name) => !sameValue(params[name], DEFAULT_PARAMS[name]),
  );
  if (changed.length === 0) return "?";
  return "?" + changed.map((name) => `${name}=${encodeValue(params[name])}`).join("&");
}

/**
 * Read a parameter set back out of a query string.
 *
 * Anything unrecognised or out of range falls back to the defaults rather than
 * throwing, because the input is a link somebody may have edited by hand.
 */
export function coverParamsFromQuery(query: string): CoverParams {
  const pairs = query.replace(/^\?/, "").split("&").filter((p) => p.includes("="));
  if (pairs.length === 0) return coverParams();

  const overrides: Partial<CoverParams> = {};
  for (const pair of pairs) {
    // Split on the first "=" only, so an encoded value may contain one.
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq) as keyof CoverParams;
    const spec = PARAM_SPEC.find((s) => s.name === name);
    if (!spec) continue;
    let text: string;
    try {
      text = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      continue;
    }
    switch (spec.editor) {
      case "boolean":
        overrides[name] = /^(TRUE|true|T|1)$/.test(text) as never;
        break;
      case "enum":
        overrides[name] = text as never;
        break;
      case "text":
        overrides[name] = (name === "title" ? text.split("|") : text) as never;
        break;
      default:
        overrides[name] = Number(text) as never;
    }
  }

  try {
    return coverParams(overrides);
  } catch {
    return coverParams();
  }
}
