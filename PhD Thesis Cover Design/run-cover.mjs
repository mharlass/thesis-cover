// Runs cover-generator.js standalone and writes thesis-cover.svg.
// Usage: node run-cover.mjs
import { writeFileSync } from "node:fs";
import { buildCoverSVG, DEFAULTS } from "./cover-generator.js";

const svg = buildCoverSVG(DEFAULTS);
writeFileSync(new URL("./thesis-cover.svg", import.meta.url), svg);
console.log("Wrote thesis-cover.svg");
