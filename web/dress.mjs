// Roadside sculptures. A form is nested primitives and transforms.
// The renderer draws the expanded cubes with the existing instanced mesh.
// lib/dress.aura is the same grammar and the same contract.
//
// (dress city
//   (mirror
//     (place 1 0
//       (float 0.55
//         (spin 0.4
//           (stack 3 0.5
//             (shard 0.8 trim)))))))

export const DRESS_CITY = "(dress city (mirror (place 1 0 (float 0.55 (spin 0.4 (stack 3 0.5 (shard 0.8 trim)))))))";

export const DRESS_CAP = 16;
export const DRESS_LANE = 4.6;
export const DRESS_ANCHOR = 6.5;
export const DRESS_HEIGHT = 5.6;
const MIN_SIZE = 0.1;

const VENUES = ["city", "garden", "space", "coast"];
const ROLES = ["wall", "vary", "roof", "trim", "flower", "flower2", "leaf", "water", "sun", "hedge"];
export const PRIM_NAMES = ["box", "rod", "slab", "arch", "shard", "ring", "spire", "lantern", "disc", "bloom"];
const PRIMS = new Set(PRIM_NAMES);

function num(v, lo, hi) {
  return typeof v === "number" && v >= lo && v <= hi;
}

function cube(x, y, z, sx, sy, sz, role, shape = 0) {
  return { x, y, z, sx, sy, sz, role, shape, spin: 0, float: 0 };
}

function emitPrim(expr) {
  const op = expr[0];
  const role = expr[expr.length - 1];
  if (!ROLES.includes(role)) return null;
  if (op === "box" && expr.length === 5 && num(expr[1], 0.1, 2) && num(expr[2], 0.1, 2) && num(expr[3], 0.1, 2)) {
    return [cube(0, expr[2] / 2, 0, expr[1], expr[2], expr[3], role)];
  }
  if (op === "rod" && expr.length === 3 && num(expr[1], 0.4, 2.4)) {
    return [cube(0, expr[1] / 2, 0, 0.14, expr[1], 0.14, role)];
  }
  if (op === "slab" && expr.length === 4 && num(expr[1], 0.3, 2) && num(expr[2], 0.3, 2)) {
    return [cube(0, 0.07, 0, expr[1], 0.14, expr[2], role)];
  }
  if (op === "arch" && expr.length === 4 && num(expr[1], 0.6, 2.2) && num(expr[2], 0.6, 2.2)) {
    const w = expr[1];
    const h = expr[2];
    const post = w / 2 - 0.1;
    return [
      cube(-post, h / 2, 0, 0.18, h, 0.18, role),
      cube(post, h / 2, 0, 0.18, h, 0.18, role),
      cube(0, h, 0, w, 0.16, 0.22, role),
    ];
  }
  if (op === "shard" && expr.length === 3 && num(expr[1], 0.4, 2)) {
    return [cube(0, expr[1] / 2, 0, 0.22, expr[1], 0.5, role)];
  }
  if (op === "ring" && expr.length === 3 && num(expr[1], 0.3, 1.2)) {
    const r = expr[1];
    const y = r * 0.35;
    return [
      cube(-r, y, 0, 0.22, 0.22, 0.22, role),
      cube(r, y, 0, 0.22, 0.22, 0.22, role),
      cube(0, y, -r, 0.22, 0.22, 0.22, role),
      cube(0, y, r, 0.22, 0.22, 0.22, role),
    ];
  }
  if (op === "spire" && expr.length === 3 && num(expr[1], 0.8, 2.4)) {
    const h = expr[1];
    const a = h * 0.46;
    const b = h * 0.32;
    const c = h * 0.22;
    return [
      cube(0, a / 2, 0, 0.55, a, 0.55, role),
      cube(0, a + b / 2, 0, 0.36, b, 0.36, role),
      cube(0, a + b + c / 2, 0, 0.18, c, 0.18, role),
    ];
  }
  if (op === "lantern" && expr.length === 2) {
    return [
      cube(0, 0.55, 0, 0.1, 1.1, 0.1, role),
      cube(0, 1.25, 0, 0.28, 0.28, 0.28, role, 1),
    ];
  }
  if (op === "disc" && expr.length === 3 && num(expr[1], 0.3, 1.4)) {
    return [cube(0, 0.05, 0, expr[1] * 2, 0.1, expr[1] * 2, role)];
  }
  if (op === "bloom" && expr.length === 2) {
    return [
      cube(0, 0.28, 0, 0.5, 0.5, 0.5, role, 1),
      cube(-0.16, 0.34, 0.06, 0.18, 0.18, 0.18, role, 1),
      cube(0.14, 0.32, -0.06, 0.16, 0.16, 0.16, role, 1),
    ];
  }
  return null;
}

function groupTop(cubes) {
  let top = 0;
  for (const c of cubes) top = Math.max(top, c.y + c.sy / 2);
  return top;
}

function evalExpr(expr, depth) {
  if (!Array.isArray(expr) || !expr.length || depth > 8) return null;
  if (PRIMS.has(expr[0])) return emitPrim(expr);
  if (expr[0] === "join" && expr.length === 3) {
    const left = evalExpr(expr[1], depth + 1);
    const right = evalExpr(expr[2], depth + 1);
    if (!left || !right) return null;
    return left.concat(right);
  }
  const inner = evalExpr(expr[expr.length - 1], depth + 1);
  if (!inner) return null;
  const op = expr[0];
  if (op === "move" && expr.length === 5 && num(expr[1], -4, 4) && num(expr[2], -0.2, 3) && num(expr[3], -4, 4)) {
    return inner.map((c) => ({ ...c, x: c.x + expr[1], y: c.y + expr[2], z: c.z + expr[3] }));
  }
  if (op === "yaw" && expr.length === 3 && num(expr[1], -0.5, 0.5)) {
    const t = expr[1] * Math.PI * 2;
    const co = Math.cos(t);
    const si = Math.sin(t);
    return inner.map((c) => ({ ...c, x: c.x * co - c.z * si, z: c.x * si + c.z * co }));
  }
  if (op === "scale" && expr.length === 3 && num(expr[1], 0.4, 1.6)) {
    const k = expr[1];
    return inner.map((c) => ({
      ...c,
      x: c.x * k, y: c.y * k, z: c.z * k,
      sx: c.sx * k, sy: c.sy * k, sz: c.sz * k,
    }));
  }
  if (op === "float" && expr.length === 3 && num(expr[1], 0, 1.2)) {
    return inner.map((c) => ({ ...c, float: expr[1] }));
  }
  if (op === "spin" && expr.length === 3 && num(expr[1], 0, 1.5)) {
    return inner.map((c) => ({ ...c, spin: expr[1] }));
  }
  if (op === "stack" && expr.length === 4 && num(expr[1], 1, 4) && num(expr[2], 0.15, 1.2)) {
    const n = Math.round(expr[1]);
    const gap = expr[2];
    const step = groupTop(inner) + gap;
    const out = [];
    for (let i = 0; i < n; i++) {
      const dy = i * step;
      for (const c of inner) out.push({ ...c, y: c.y + dy });
    }
    return out;
  }
  if (op === "recur" && expr.length === 4 && num(expr[1], 2, 3) && num(expr[2], 0.5, 0.8)) {
    const n = Math.round(expr[1]);
    const shrink = expr[2];
    const out = [];
    let lift = 0;
    let k = 1;
    for (let i = 0; i < n; i++) {
      const layer = inner.map((c) => ({
        ...c,
        x: c.x * k, y: c.y * k + lift, z: c.z * k,
        sx: c.sx * k, sy: c.sy * k, sz: c.sz * k,
      }));
      out.push(...layer);
      lift = groupTop(layer);
      k *= shrink;
    }
    return out;
  }
  return null;
}

function evalGroup(expr, depth) {
  if (!Array.isArray(expr) || depth > 4) return null;
  if (expr[0] === "mirror" && expr.length === 2) {
    const inner = evalGroup(expr[1], depth + 1);
    if (!inner) return null;
    const flipped = inner.map((s) => ({ side: -s.side, along: s.along, cubes: s.cubes }));
    const sites = inner.concat(flipped);
    return sites.length <= 4 ? sites : null;
  }
  if (expr[0] === "place" && expr.length === 4 && (expr[1] === 1 || expr[1] === -1) && num(expr[2], -1, 4)) {
    const cubes = evalExpr(expr[3], 0);
    if (!cubes || !cubes.length) return null;
    return [{ side: expr[1], along: expr[2], cubes }];
  }
  const cubes = evalExpr(expr, 0);
  if (!cubes || !cubes.length) return null;
  return [
    { side: 1, along: 0, cubes },
    { side: -1, along: 0, cubes },
  ];
}

function behaviorOf(sites) {
  let motion = 0;
  for (const site of sites) {
    for (const c of site.cubes) {
      if (c.float > 0) motion |= 1;
      if (c.spin > 0) motion |= 2;
    }
  }
  return { motion, depth: 0 };
}

function annotate(sites, expr) {
  const walk = (node) => {
    if (!Array.isArray(node)) return { stack: 0, recur: 0 };
    let stack = 0;
    let recur = 0;
    if (node[0] === "stack" && typeof node[1] === "number") stack += Math.round(node[1]);
    if (node[0] === "recur" && typeof node[1] === "number") recur += Math.round(node[1]);
    for (const child of node) {
      if (Array.isArray(child)) {
        const sub = walk(child);
        stack += sub.stack;
        recur += sub.recur;
      }
    }
    return { stack, recur };
  };
  const found = walk(expr);
  const beh = behaviorOf(sites);
  beh.depth = Math.min(6, found.stack + found.recur);
  return beh;
}

function judge(sites) {
  let count = 0;
  let readable = false;
  for (const site of sites) {
    for (const c of site.cubes) {
      count += 1;
      if (count > DRESS_CAP) return { ok: false, why: "budget", count };
      const lat = site.side * DRESS_ANCHOR + c.x;
      const reach = Math.hypot(c.sx, c.sz) / 2;
      if (Math.abs(lat) - reach < DRESS_LANE) return { ok: false, why: "clearance", count };
      if (c.y + c.sy / 2 + c.float > DRESS_HEIGHT) return { ok: false, why: "sight", count };
      if (Math.min(c.sx, c.sy, c.sz) < MIN_SIZE) return { ok: false, why: "read", count };
      if (Math.max(c.sx, c.sy, c.sz) >= 0.45) readable = true;
    }
  }
  if (!count) return { ok: false, why: "shape", count: 0 };
  if (!readable) return { ok: false, why: "read", count };
  return { ok: true, why: "fair", count };
}

function tokenize(text) {
  return String(text || "").replace(/;[^\n]*/g, " ").match(/[()]|-?\d*\.\d+|-?\d+|[A-Za-z][A-Za-z0-9-]*/g) || [];
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
      list.push(Number.isFinite(n) && /^-?\d/.test(raw) ? n : raw);
      k++;
    }
  }
  if (tokens[k] !== ")") return null;
  return { value: list, next: k + 1 };
}

export function expandDress(text) {
  const tokens = tokenize(text);
  const form = readForm(tokens, 0);
  const empty = { ok: false, why: "shape", form: "", venue: "", sites: [], count: 0, motion: 0, depth: 0 };
  if (!form || tokens.length !== form.next) return empty;
  const root = form.value;
  if (!Array.isArray(root) || root[0] !== "dress" || root.length !== 3 || !VENUES.includes(root[1])) return empty;
  const sites = evalGroup(root[2], 0);
  if (!sites) return { ...empty, venue: root[1] };
  const verdict = judge(sites);
  const beh = annotate(sites, root[2]);
  return {
    ok: verdict.ok,
    why: verdict.why,
    form: String(text || "").trim(),
    venue: root[1],
    sites,
    count: verdict.count,
    motion: beh.motion,
    depth: beh.depth,
  };
}

let activeForm = "";
let cacheKey = "";
let cacheValue = null;

export function activeDress() {
  return activeForm || DRESS_CITY;
}

export function dressView() {
  const form = activeDress();
  if (cacheKey !== form) {
    cacheKey = form;
    cacheValue = expandDress(form);
  }
  return cacheValue;
}

export function setActiveDress(text) {
  const ev = expandDress(text);
  if (!ev.ok) return ev;
  activeForm = ev.form;
  cacheKey = activeForm;
  cacheValue = ev;
  return ev;
}

function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s;
  };
}

function span(rng, lo, hi) {
  return Math.round((lo + ((hi - lo) * rng()) / 4294967296) * 100) / 100;
}

function say(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function emit(node) {
  if (typeof node === "number") return say(node);
  if (typeof node === "string") return node;
  return `(${node.map(emit).join(" ")})`;
}

function onePrim(rng) {
  const role = ROLES[rng() % ROLES.length];
  const kind = PRIM_NAMES[rng() % PRIM_NAMES.length];
  if (kind === "box") return ["box", span(rng, 0.35, 1.3), span(rng, 0.4, 1.5), span(rng, 0.35, 1.3), role];
  if (kind === "rod") return ["rod", span(rng, 0.6, 1.8), role];
  if (kind === "slab") return ["slab", span(rng, 0.4, 1.6), span(rng, 0.4, 1.6), role];
  if (kind === "arch") return ["arch", span(rng, 0.8, 1.8), span(rng, 0.7, 1.6), role];
  if (kind === "shard") return ["shard", span(rng, 0.6, 1.6), role];
  if (kind === "ring") return ["ring", span(rng, 0.35, 0.9), role];
  if (kind === "spire") return ["spire", span(rng, 0.9, 1.8), role];
  if (kind === "lantern") return ["lantern", role];
  if (kind === "disc") return ["disc", span(rng, 0.35, 0.9), role];
  return ["bloom", role];
}

function wrap(rng, expr) {
  const roll = rng() % 8;
  if (roll === 0) return ["float", span(rng, 0.2, 0.9), expr];
  if (roll === 1) return ["spin", span(rng, 0.25, 1.2), expr];
  if (roll === 2) return ["stack", 2 + (rng() % 2), span(rng, 0.25, 0.7), expr];
  if (roll === 3) return ["recur", 2, span(rng, 0.55, 0.72), expr];
  if (roll === 4) return ["yaw", span(rng, -0.2, 0.2), expr];
  if (roll === 5) return ["scale", span(rng, 0.6, 1.3), expr];
  if (roll === 6) return ["join", expr, onePrim(rng)];
  return ["move", span(rng, -0.35, 0.35), span(rng, 0, 0.4), span(rng, -0.35, 0.35), expr];
}

// A new tree from the seed. Numbers, primitive, colour role, motion and
// layout all move. A candidate that breaks the contract is discarded.
export function dressMutate(text, seed) {
  const n = Math.abs(Math.round(Number(seed) || 1));
  const rng = lcg(n * 97 + 13);
  const fallback = text && expandDress(text).ok ? String(text) : DRESS_CITY;
  for (let attempt = 0; attempt < 24; attempt++) {
    let expr = onePrim(rng);
    const wraps = 1 + (rng() % 3);
    for (let i = 0; i < wraps; i++) expr = wrap(rng, expr);
    const side = (rng() % 2) === 0 ? 1 : -1;
    let group = ["place", side, span(rng, 0, 1.5), expr];
    if ((rng() % 2) === 0) group = ["mirror", group];
    const form = `(dress city ${emit(group)})`;
    if (expandDress(form).ok) return form;
  }
  return fallback;
}

export function dressHash(form) {
  let h = 2166136261;
  const src = String(form || "");
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
