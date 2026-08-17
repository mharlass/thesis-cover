// Thesis cover generator — "cohort ridge" line art on the Nocturne palette.
// Deterministic: same params -> same SVG. Mirrored 1:1 by generate_cover.R.
export const DEFAULTS = {
  seed: 42,
  spineMm: 12,          // spine width; set from printer's page-count calc
  lines: 64,            // cohort trajectories
  strata: 3,            // accent-highlighted "risk strata" lines (0-6)
  showGuides: false,    // trim/fold/safe-area guides layer
  title: ["Enhancing", "Microsimulation Models", "for Risk-Stratified", "and Equitable", "Colorectal Cancer Prevention"],
  name: "Matthias Florian Harla\u00df",
};
// Nocturne tokens (styles.css)
const C = {
  bg: "#161826", text: "#e9e9ed", accent: "#9184d9",
  n200: "#e4e7f5", n300: "#cfd3e5", n400: "#b2b6ca", n500: "#9397ab",
  n600: "#75798c", n800: "#3f424d", a900: "#2b2741",
};
const TRIM_W = 170, TRIM_H = 240, BLEED = 3;

function lcg(seed) { // Lehmer LCG — exact in doubles, portable to R
  let s = ((Math.floor(seed) % 2147483646) + 2147483646) % 2147483646 + 1;
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
}
function makeLattice(rng, W, L) {
  const K = Math.ceil(W / L) + 3, v = [];
  for (let k = 0; k < K; k++) v.push(rng());
  return { v, L };
}
function noiseAt(lat, x) { // smoothed value noise in [-1,1]
  const u = x / lat.L; let k = Math.floor(u); if (k < 0) k = 0;
  const f = u - k, i2 = lat.v.length - 1;
  const a = lat.v[Math.min(k, i2)], b = lat.v[Math.min(k + 1, i2)];
  const s = f * f * (3 - 2 * f);
  return (a + (b - a) * s - 0.5) * 2;
}
function sstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function gauss(x, c, w) { const d = (x - c) / w; return Math.exp(-3 * d * d); }
function hex2rgb(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); }
function lerpHex(h1, h2, t) {
  const a = hex2rgb(h1), b = hex2rgb(h2);
  return "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function lineColor(f) { // oldest (dim) -> newest (light), Nocturne neutral ramp
  return f <= 0.55 ? lerpHex(C.n800, C.n600, f / 0.55) : lerpHex(C.n600, C.n200, (f - 0.55) / 0.45);
}
const fmt = n => (Math.round(n * 100) / 100).toFixed(2);
function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export function buildCoverSVG(opts) {
  const p = { ...DEFAULTS, ...opts };
  const S = p.spineMm, W = 2 * BLEED + 2 * TRIM_W + S, H = TRIM_H + 2 * BLEED;
  const FX = BLEED + TRIM_W + S;            // front-panel trim left edge
  const rng = lcg(p.seed);
  const latA = makeLattice(rng, W, 26);      // ridge, broad
  const latB = makeLattice(rng, W, 8);       // ridge, fine jag
  const latC = makeLattice(rng, W, 40);      // baseline drift
  const N = p.lines;
  const offs = [], lats = [];
  for (let i = 0; i < N; i++) { offs.push((rng() - 0.5) * 1.4); lats.push(makeLattice(rng, W, 9)); }

  const hAt = x => Math.min(1, Math.max(0.03,
    0.20 + 0.28 * sstep(4, FX - 40, x) + 0.44 * gauss(x, FX + 100, 70) + 0.12 * gauss(x, FX + 40, 42)
    + 0.10 * gauss(x, 100, 80) - 0.10 * sstep(FX + 140, W - 6, x) + 0.05 * noiseAt(latA, x) + 0.02 * noiseAt(latB, x)));
  const bottomAt = x => 235.5 - 3 * sstep(FX + 20, W, x) + 1.6 * noiseAt(latC, x);
  const spreadAt = x => 0.24 + 0.76 * sstep(6, FX + 70, x);

  const step = 2, xs = [];
  for (let x = 0; x <= W; x += step) xs.push(x);
  if (xs[xs.length - 1] < W) xs.push(W);

  // strata membership: fixed fractions of the stack, first p.strata used
  const fr = [0.86, 0.7, 0.55, 0.78, 0.62, 0.47].slice(0, Math.max(0, Math.min(6, p.strata)));
  const strataIdx = fr.map(f => Math.round(f * (N - 1)));

  const pathFor = i => {
    const f = i / (N - 1), e = Math.pow(f, 1.18);
    let d = "";
    for (let k = 0; k < xs.length; k++) {
      const x = xs[k];
      const y = bottomAt(x) - hAt(x) * 94 * spreadAt(x) * (0.06 + 0.94 * e) - 0.9 * noiseAt(lats[i], x) + offs[i];
      d += (k ? "L" : "M") + fmt(x) + " " + fmt(y);
    }
    return d;
  };

  let base = "", strata = "";
  for (let i = 0; i < N; i++) {
    const d = pathFor(i), f = i / (N - 1);
    if (strataIdx.includes(i)) {
      strata += `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="0.6" filter="url(#glow)" opacity="0.6"/>`;
      strata += `<path d="${d}" fill="none" stroke="${C.accent}" stroke-width="0.6"/>`;
    } else {
      const top = i === N - 1;
      base += `<path d="${d}" fill="none" stroke="${top ? C.text : lineColor(f)}" stroke-width="${top ? "0.5" : "0.32"}" opacity="${top ? "1" : "0.9"}"/>`;
    }
  }

  // front text
  const tx = FX + 18;
  let front = `<rect x="${fmt(tx)}" y="30.2" width="13" height="1.15" fill="${C.accent}"/>`;
  p.title.forEach((line, i) => {
    front += `<text x="${fmt(tx)}" y="${fmt(42 + i * 11)}" font-size="8.5" font-weight="500" fill="${C.text}" letter-spacing="0.05">${esc(line)}</text>`;
  });
  front += `<text x="${fmt(tx)}" y="101.5" font-size="4.9" font-weight="400" fill="${C.n300}" letter-spacing="0.5">${esc(p.name)}</text>`;

  // spine text (rotated, reads top->bottom)
  const scx = BLEED + TRIM_W + S / 2, fullTitle = p.title.join(" ");
  const nameLen = p.name.length * 0.55 * 3.0;
  const spine =
    `<text transform="translate(${fmt(scx + 1.2)} 12) rotate(90)" font-size="3" font-weight="400" fill="${C.n400}" letter-spacing="0.04">${esc(p.name)}</text>` +
    `<text transform="translate(${fmt(scx + 1.2)} ${fmt(12 + nameLen + 5)}) rotate(90)" font-size="3.4" font-weight="500" fill="${C.text}" letter-spacing="0.04">${esc(fullTitle)}</text>`;

  // guides
  const g = (x1, y1, x2, y2, st, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${st}" stroke-width="0.25"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const lbl = (x, y, t) => `<text x="${x}" y="${y}" font-size="2.8" fill="${C.n500}">${t}</text>`;
  const guides =
    `<g id="guides" display="${p.showGuides ? "inline" : "none"}">` +
    `<rect x="${BLEED}" y="${BLEED}" width="${2 * TRIM_W + S}" height="${TRIM_H}" fill="none" stroke="${C.n500}" stroke-width="0.25" stroke-dasharray="2 1.5"/>` +
    g(BLEED + TRIM_W, 0, BLEED + TRIM_W, H, C.accent) + g(FX, 0, FX, H, C.accent) +
    `<rect x="${BLEED + 10}" y="${BLEED + 10}" width="${TRIM_W - 20}" height="${TRIM_H - 20}" fill="none" stroke="${C.n600}" stroke-width="0.2" stroke-dasharray="0.8 1.2"/>` +
    `<rect x="${FX + 10}" y="${BLEED + 10}" width="${TRIM_W - 20}" height="${TRIM_H - 20}" fill="none" stroke="${C.n600}" stroke-width="0.2" stroke-dasharray="0.8 1.2"/>` +
    lbl(BLEED + 4, 8.5, "back") + lbl(BLEED + TRIM_W + 1.2, 8.5, `spine ${S} mm`) + lbl(FX + 4, 8.5, "front") +
    lbl(BLEED + 4, H - 4.5, `trim 170 \u00d7 240 mm \u00b7 bleed ${BLEED} mm \u00b7 total ${W} \u00d7 ${H} mm`) +
    `</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="Inter, sans-serif">
<title>Thesis cover wrap \u2014 ${esc(fullTitle)}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500&amp;display=swap');text{font-family:'Inter',sans-serif;}</style>
<defs>
<linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1e30"/><stop offset="0.55" stop-color="${C.bg}"/><stop offset="1" stop-color="#111320"/></linearGradient>
<radialGradient id="peakGlow"><stop offset="0" stop-color="${C.a900}" stop-opacity="0.85"/><stop offset="1" stop-color="${C.a900}" stop-opacity="0"/></radialGradient>
<linearGradient id="edgeFade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" stop-color="#000"/><stop offset="${fmt(22 / W)}" stop-color="#fff"/><stop offset="${fmt(1 - 22 / W)}" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<linearGradient id="foldShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0e101a" stop-opacity="0"/><stop offset="0.5" stop-color="#0e101a" stop-opacity="0.55"/><stop offset="1" stop-color="#0e101a" stop-opacity="0"/></linearGradient>
<mask id="fadeMask"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#edgeFade)"/></mask>
<filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1"/></filter>
</defs>
<g id="background"><rect width="${W}" height="${H}" fill="url(#bgGrad)"/><ellipse cx="${fmt(FX + 100)}" cy="185" rx="150" ry="88" fill="url(#peakGlow)"/></g>
<g id="ridge" mask="url(#fadeMask)"><g id="cohort-lines">${base}</g><g id="strata-lines">${strata}</g></g>
<g id="fold-shading"><rect x="${fmt(BLEED + TRIM_W - 4)}" y="0" width="${fmt(S + 8)}" height="${H}" fill="url(#foldShade)"/></g>
<g id="spine-text">${spine}</g>
<g id="front-text">${front}</g>
${guides}
</svg>`;
}
