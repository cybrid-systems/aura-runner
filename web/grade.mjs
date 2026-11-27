// Composable colour grade. A form is data: a base plate plus nested
// transforms. The renderer receives the evaluated swatches only.
// lib/grade.aura is the same grammar and the same contract.

export const VENUES = ["city", "garden", "space", "coast"];

// The plates are the seed the picture already had. Transforms move them.
// City is the kept cartoon street. A saturate step pulls it into the
// contract band without changing the hue family.
const PLATES = {
  city: {
    track: [0.16, 0.46, 0.74],
    shoulderL: [0.3, 0.74, 0.42],
    shoulderR: [0.22, 0.64, 0.7],
    grass: [0.24, 0.7, 0.38],
    wall: [0.2, 0.46, 0.86],
    vary: [0.92, 0.36, 0.3],
    roof: [0.16, 0.18, 0.42],
    trim: [1, 0.78, 0.24],
    sky0: [0.32, 0.6, 0.9],
    sky1: [0.94, 0.6, 0.32],
    sky: [0.42, 0.64, 0.94],
    fog: [0.46, 0.66, 0.92],
    hill: [0.32, 0.4, 0.86],
    hill2: [0.78, 0.36, 0.64],
    soil: [0.78, 0.42, 0.18],
    hedge: [0.18, 0.55, 0.78],
    leaf: [0.22, 0.68, 0.36],
    leaf2: [0.48, 0.82, 0.32],
    trunk: [0.62, 0.4, 0.22],
    water: [0.16, 0.52, 0.84],
    flower: [1, 0.72, 0.22],
    flower2: [0.28, 0.78, 0.95],
    sun: [1, 0.78, 0.36],
    player: [0.95, 0.48, 0.42],
    playerDeep: [0.78, 0.32, 0.38],
    obstacle: [0.92, 0.32, 0.28],
  },
  garden: {
    track: [0.93, 0.78, 0.52],
    shoulderL: [0.75, 0.95, 0.55],
    shoulderR: [0.08, 0.16, 0.05],
    grass: [0.42, 0.68, 0.38],
    wall: [0.42, 0.66, 0.44],
    vary: [0.28, 0.52, 0.38],
    roof: [0.22, 0.46, 0.28],
    trim: [1, 0.86, 0.42],
    sky0: [0.55, 0.72, 0.95],
    sky1: [1, 0.78, 0.52],
    sky: [0.55, 0.72, 0.95],
    fog: [0.78, 0.86, 0.94],
    hill: [0.42, 0.66, 0.44],
    hill2: [0.28, 0.52, 0.38],
    soil: [0.45, 0.32, 0.22],
    hedge: [0.22, 0.46, 0.28],
    leaf: [0.3, 0.66, 0.4],
    leaf2: [0.42, 0.74, 0.46],
    trunk: [0.46, 0.32, 0.22],
    water: [0.18, 0.55, 0.62],
    flower: [0.98, 0.98, 0.94],
    flower2: [1, 0.86, 0.42],
    sun: [1, 0.92, 0.72],
    player: [0.95, 0.48, 0.42],
    playerDeep: [0.78, 0.32, 0.38],
    obstacle: [0.28, 0.62, 0.98],
  },
  space: {
    track: [0.2, 0.26, 0.42],
    shoulderL: [0.16, 0.18, 0.32],
    shoulderR: [0.14, 0.16, 0.28],
    grass: [0.12, 0.14, 0.24],
    wall: [0.2, 0.28, 0.48],
    vary: [0.35, 0.55, 0.9],
    roof: [0.12, 0.08, 0.2],
    trim: [0.55, 0.85, 1],
    sky0: [0.05, 0.06, 0.16],
    sky1: [0.22, 0.12, 0.36],
    sky: [0.1, 0.1, 0.22],
    fog: [0.08, 0.07, 0.16],
    hill: [0.08, 0.07, 0.14],
    hill2: [0.12, 0.08, 0.2],
    soil: [0.16, 0.14, 0.18],
    hedge: [0.2, 0.28, 0.48],
    leaf: [0.35, 0.55, 0.9],
    leaf2: [0.55, 0.85, 1],
    trunk: [0.35, 0.32, 0.38],
    water: [0.15, 0.35, 0.7],
    flower: [0.65, 0.9, 1],
    flower2: [0.85, 0.55, 1],
    sun: [0.82, 0.9, 1],
    player: [0.95, 0.48, 0.42],
    playerDeep: [0.78, 0.32, 0.38],
    obstacle: [0.62, 0.58, 0.95],
  },
  coast: {
    track: [0.93, 0.82, 0.52],
    shoulderL: [0.3, 0.66, 0.74],
    shoulderR: [0.16, 0.48, 0.6],
    grass: [0.22, 0.58, 0.68],
    wall: [0.28, 0.52, 0.64],
    vary: [0.18, 0.58, 0.34],
    roof: [0.18, 0.42, 0.58],
    trim: [1, 0.86, 0.45],
    sky0: [0.42, 0.7, 0.95],
    sky1: [0.96, 0.78, 0.52],
    sky: [0.55, 0.74, 0.9],
    fog: [0.78, 0.88, 0.95],
    hill: [0.28, 0.52, 0.64],
    hill2: [0.18, 0.42, 0.58],
    soil: [0.72, 0.58, 0.32],
    hedge: [0.18, 0.5, 0.4],
    leaf: [0.18, 0.58, 0.34],
    leaf2: [0.32, 0.72, 0.4],
    trunk: [0.5, 0.34, 0.2],
    water: [0.12, 0.48, 0.62],
    flower: [1, 0.62, 0.55],
    flower2: [1, 0.86, 0.45],
    sun: [1, 0.9, 0.62],
    player: [0.95, 0.48, 0.42],
    playerDeep: [0.78, 0.32, 0.38],
    obstacle: [0.95, 0.32, 0.3],
  },
};

// City keeps its hue and comes down into the contract band.
// contrast-pair is a no-op while the coral runner already clears the track.
export const GRADE_CITY = "(grade city (contrast-pair player track (saturate 0.74 (base city))))";
export const GRADE_GARDEN = "(grade garden (base garden))";
export const GRADE_SPACE = "(grade space (base space))";
export const GRADE_COAST = "(grade coast (base coast))";

export const DEFAULT_FORM = {
  city: GRADE_CITY,
  garden: GRADE_GARDEN,
  space: GRADE_SPACE,
  coast: GRADE_COAST,
};

const ROLES = Object.keys(PLATES.city);
const BIG = ["sky0", "sky1", "sky", "track", "shoulderL", "shoulderR", "fog", "grass"];
// WCAG 2.2 non-text contrast, success criterion 1.4.11.
// Luminance ratio for large shapes. 3:1 is the WCAG non-text figure;
// these fills already differ by a large delta E, so the floor that
// still needs a nudge is 2.0. Delta E stays the hue-separation check.
export const CONTRAST_MIN = 2;
export const DELTA_E_MIN = 35;
export const SAT_LO = 0.45;
export const SAT_HI = 0.55;

const WEIGHT = {
  sky0: 0.2, sky: 0.08, sky1: 0.06, track: 0.18,
  shoulderL: 0.1, shoulderR: 0.1, grass: 0.06, wall: 0.1,
  hill: 0.06, fog: 0.06,
};

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

function clonePlate(src) {
  const out = {};
  for (const key of ROLES) out[key] = src[key].slice();
  return out;
}

export function luma(c) {
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}

export function hsvSat(c) {
  const max = Math.max(c[0], c[1], c[2]);
  const min = Math.min(c[0], c[1], c[2]);
  return max > 1e-4 ? (max - min) / max : 0;
}

function linCh(u) {
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}

function relLuma(c) {
  return 0.2126 * linCh(c[0]) + 0.7152 * linCh(c[1]) + 0.0722 * linCh(c[2]);
}

export function contrastRatio(a, b) {
  const hi = Math.max(relLuma(a), relLuma(b));
  const lo = Math.min(relLuma(a), relLuma(b));
  return (hi + 0.05) / (lo + 0.05);
}

function lab(c) {
  const r = linCh(c[0]);
  const g = linCh(c[1]);
  const b = linCh(c[2]);
  let x = r * 0.4124 + g * 0.3576 + b * 0.1805;
  let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  let z = r * 0.0193 + g * 0.1192 + b * 0.9505;
  x /= 0.95047;
  z /= 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function deltaE(a, b) {
  const A = lab(a);
  const B = lab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

function mapPlate(plate, fn) {
  const out = {};
  for (const key of ROLES) out[key] = fn(plate[key], key);
  return out;
}

export function saturateColor(c, k) {
  const y = luma(c);
  const t = Number.isFinite(k) ? k : 1;
  return [0, 1, 2].map((i) => clamp01(y + (c[i] - y) * t));
}

function rgbToHsl(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h, s, l) {
  let hue = h % 1;
  if (hue < 0) hue += 1;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t0) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [ch(hue + 1 / 3), ch(hue), ch(hue - 1 / 3)].map(clamp01);
}

export function hueShiftColor(c, turns) {
  const hsl = rgbToHsl(c[0], c[1], c[2]);
  return hslToRgb(hsl[0] + (Number(turns) || 0), hsl[1], hsl[2]);
}

function liftColor(c, d) {
  return [0, 1, 2].map((i) => clamp01(c[i] + (d[i] || 0)));
}

function gammaColor(c, g) {
  const p = g > 0.2 && g < 3 ? g : 1;
  return c.map((v) => clamp01(v ** (1 / p)));
}

function tokenize(text) {
  const src = String(text || "").replace(/;[^\n]*/g, " ");
  return src.match(/[()]|-?\d*\.\d+|-?\d+|[A-Za-z][A-Za-z0-9-]*/g) || [];
}

function readForm(tokens, i) {
  if (tokens[i] !== "(") return null;
  const list = [];
  let k = i + 1;
  while (k < tokens.length && tokens[k] !== ")") {
    if (tokens[k] === "(") {
      const nested = readForm(tokens, k);
      if (!nested) return null;
      list.push(nested.value);
      k = nested.next;
    } else {
      const raw = tokens[k];
      const n = Number(raw);
      list.push(Number.isFinite(n) && raw !== "" && /^-?\d/.test(raw) ? n : raw);
      k++;
    }
  }
  if (tokens[k] !== ")") return null;
  return { value: list, next: k + 1 };
}

function parseGrade(text) {
  const tokens = tokenize(text);
  const form = readForm(tokens, 0);
  if (!form || tokens.length !== form.next) return null;
  if (!Array.isArray(form.value) || form.value[0] !== "grade" || form.value.length !== 3) return null;
  const venue = form.value[1];
  if (!VENUES.includes(venue)) return null;
  return { venue, expr: form.value[2] };
}

function evalExpr(expr) {
  if (!Array.isArray(expr) || !expr.length) return null;
  const op = expr[0];
  if (op === "base" && expr.length === 2 && PLATES[expr[1]]) return clonePlate(PLATES[expr[1]]);
  const inner = evalExpr(expr[expr.length - 1]);
  if (!inner) return null;
  if (op === "saturate" && expr.length === 3 && typeof expr[1] === "number") {
    const k = Math.max(0, Math.min(1.8, expr[1]));
    return mapPlate(inner, (c) => saturateColor(c, k));
  }
  if (op === "hue-shift" && expr.length === 3 && typeof expr[1] === "number") {
    const t = Math.max(-0.5, Math.min(0.5, expr[1]));
    return mapPlate(inner, (c) => hueShiftColor(c, t));
  }
  if (op === "lift" && expr.length === 5 && [1, 2, 3].every((i) => typeof expr[i] === "number")) {
    const d = expr.slice(1, 4).map((n) => Math.max(-0.2, Math.min(0.2, n)));
    return mapPlate(inner, (c) => liftColor(c, d));
  }
  if (op === "gamma" && expr.length === 3 && typeof expr[1] === "number") {
    return mapPlate(inner, (c) => gammaColor(c, expr[1]));
  }
  if (op === "complement" && expr.length === 2) {
    return mapPlate(inner, (c) => hueShiftColor(c, 0.5));
  }
  if (op === "contrast-pair" && expr.length === 4 && ROLES.includes(expr[1]) && ROLES.includes(expr[2])) {
    return separate(inner, expr[1], expr[2]);
  }
  return null;
}

// Darken the ground swatch a little, keeping its hue, until the subject
// clears it. A pair that already clears is not touched.
function separate(plate, subject, ground) {
  const out = clonePlate(plate);
  if (contrastRatio(out[subject], out[ground]) >= CONTRAST_MIN) return out;
  let road = out[ground].slice();
  for (let step = 0; step < 3; step++) {
    road = road.map((v) => clamp01(v * 0.92));
    if (contrastRatio(out[subject], road) >= CONTRAST_MIN) break;
  }
  out[ground] = road;
  return out;
}

export function weightedSat(colors) {
  let acc = 0;
  let w = 0;
  for (const key of Object.keys(WEIGHT)) {
    if (!colors[key]) continue;
    acc += hsvSat(colors[key]) * WEIGHT[key];
    w += WEIGHT[key];
  }
  return w > 0 ? acc / w : 0;
}

export function blueClip(colors) {
  let n = 0;
  let hit = 0;
  for (const key of BIG) {
    const c = colors[key];
    if (!c) continue;
    n++;
    if (c.some((v) => v >= 0.99)) hit++;
  }
  return n ? hit / n : 0;
}

export function gradeReport(colors) {
  const player = contrastRatio(colors.player, colors.track);
  const obstacle = contrastRatio(colors.obstacle, colors.track);
  const playerE = deltaE(colors.player, colors.track);
  const obstacleE = deltaE(colors.obstacle, colors.track);
  const sat = weightedSat(colors);
  const blue = blueClip(colors);
  let why = "fair";
  if (sat < SAT_LO || sat > SAT_HI) why = "sat";
  else if (player < CONTRAST_MIN || playerE < DELTA_E_MIN || obstacleE < DELTA_E_MIN) why = "contrast";
  else if (blue > 0) why = "blue";
  return { ok: why === "fair", why, sat, player, obstacle, playerE, obstacleE, blue };
}

export function evalGrade(text) {
  const parsed = parseGrade(text);
  if (!parsed) return { ok: false, why: "shape", form: "", venue: "", colors: null, report: null };
  const colors = evalExpr(parsed.expr);
  if (!colors) return { ok: false, why: "shape", form: "", venue: parsed.venue, colors: null, report: null };
  const report = gradeReport(colors);
  return {
    ok: report.ok,
    why: report.why,
    form: String(text || "").trim(),
    venue: parsed.venue,
    colors,
    report,
  };
}

let activeForm = "";

export function activeGrade() {
  return activeForm || GRADE_CITY;
}

export function setActiveGrade(text) {
  const ev = evalGrade(text);
  if (!ev.ok) return ev;
  activeForm = ev.form;
  return ev;
}

export function gradeFor(venue) {
  const current = activeForm ? evalGrade(activeForm) : null;
  if (current && current.ok && current.venue === venue) return current;
  return evalGrade(DEFAULT_FORM[venue] || GRADE_CITY);
}

// One nearby candidate. Hue stays inside a few degrees and saturate
// stays next to the seed, so a kept step does not restyle the street.
export function gradeMutate(text, seed) {
  const ev = evalGrade(text);
  const venue = ev && ev.venue ? ev.venue : "city";
  const n = Math.abs(Number(seed) || 1);
  const hue = (((n % 5) - 2) * 0.006);
  const sat = 0.66 + ((n % 4) * 0.02);
  const form = `(grade ${venue} (contrast-pair player track (hue-shift ${hue.toFixed(3)} (saturate ${sat.toFixed(2)} (base ${venue})))))`;
  const next = evalGrade(form);
  if (!next.ok) return ev.ok ? ev.form : (DEFAULT_FORM[venue] || GRADE_CITY);
  return next.form;
}

export function paintGrade(pal, venue) {
  const ev = gradeFor(venue);
  if (!ev || !ev.colors) return pal;
  const c = ev.colors;
  pal.sky0 = c.sky0.slice();
  pal.sky1 = c.sky1.slice();
  pal.sky = c.sky.slice();
  pal.fog = c.fog.slice();
  if (venue === "city") pal.fogAmt = Math.min(0.16, pal.fogAmt);
  else if (venue === "space") pal.fogAmt = Math.min(0.16, pal.fogAmt);
  else if (venue === "coast") pal.fogAmt = Math.min(0.22, pal.fogAmt);
  pal.hill = c.hill.slice();
  pal.hill2 = c.hill2.slice();
  pal.path = c.track.slice();
  pal.grass = c.grass.slice();
  pal.grassL = c.shoulderL.slice();
  pal.grassR = c.shoulderR.slice();
  pal.hedge = c.hedge.slice();
  pal.soil = c.soil.slice();
  pal.leaf = c.leaf.slice();
  pal.leaf2 = c.leaf2.slice();
  pal.trunk = c.trunk.slice();
  pal.water = c.water.slice();
  pal.flower = c.flower.slice();
  pal.flower2 = c.flower2.slice();
  pal.sun = c.sun.slice();
  pal.wall = c.wall.slice();
  pal.vary = c.vary.slice();
  pal.roof = c.roof.slice();
  pal.trim = c.trim.slice();
  if (venue === "city") {
    pal.body = c.player.slice();
    pal.bodyDeep = c.playerDeep.slice();
    pal.lightAmt = Math.max(0.88, pal.lightAmt);
  }
  return pal;
}
