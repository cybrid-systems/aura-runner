import { roadGrade, roadHeight } from "./road.mjs";
import { drawThing, growOf, animOf, showBox } from "./thing.mjs";
import { DEPTH_FS, highFragment, highSky, litFragment, litSky } from "./lit.mjs";
import { POST_SOURCES, createPost, probeFloat, shaderCompiler } from "./post.mjs";
import { blurAmount, fovKick, glossFor, groundId, heroShape, laneEase, sceneGrade, shakeOffset, sunScreen, whooshNudge } from "./feel.mjs";
import { skimmed } from "./score.mjs";
import {
  DEFAULT_POLICY, bindContextLoss, contextPlan, createQuality, noteFbo,
  noteReduced, noteRefresh, noteVisibility, observe, probeCaps, resolutionScale, setMode,
  softwareFromRenderer, tierProfile,
} from "./quality.mjs";

// Third-person WebGL2 view of the Lumen garden. One instanced draw of
// unit cubes, shaded as beveled toys, spheres and seeds. The sim's
// forward axis is Z and its lane offset is X.
//
// The camera looks down +Z, so world +X is screen-left. The sim stores
// lane 0 (left) at negative X, and the renderer negates lateral positions.
// Input still sends lane -1 for Left.

const MAX = 1200;
const STRIDE = 16;

function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function laneHash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function mul(rgb, s) {
  return [rgb[0] * s, rgb[1] * s, rgb[2] * s];
}

// Push a colour away from grey without changing its luma much.
function punch(rgb, k) {
  const y = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const t = k > 0 ? k : 0;
  return [
    Math.max(0, Math.min(1, y + (rgb[0] - y) * t)),
    Math.max(0, Math.min(1, y + (rgb[1] - y) * t)),
    Math.max(0, Math.min(1, y + (rgb[2] - y) * t)),
  ];
}

// A per-instance value shift. Keeps a row of one kind from reading as
// one repeated mesh, without adding a second colour attribute.
function tint(rgb, k) {
  return [Math.min(1, rgb[0] * k), Math.min(1, rgb[1] * k), Math.min(1, rgb[2] * k)];
}

const FLOWERS = {
  daisy: [[0.98, 0.98, 0.94], [1.0, 0.86, 0.42]],
  tulip: [[0.93, 0.28, 0.42], [0.98, 0.55, 0.68]],
  blossom: [[0.98, 0.62, 0.78], [0.74, 0.46, 0.86]],
  buttercup: [[1.0, 0.88, 0.22], [0.98, 0.7, 0.28]],
};

function flowerPair(kind) {
  return FLOWERS[kind] || FLOWERS.daisy;
}

// Sky, ground, flowers and light come from the kept garden phrase.
// Hue still warms the hills a little when an obstacle phrase is kept.
// Obstacle colors stay put so a hurdle, a gate and a pot stay readable.
export function palette(h, scene) {
  const t = Math.max(0, Math.min(1, (h || 0) / 5));
  const sky = (scene && scene.sky) || [0.55, 0.72, 0.95];
  const ground = (scene && scene.ground) || [0.42, 0.68, 0.38];
  const light = scene && typeof scene.light === "number" ? scene.light : 0.82;
  const bloom = flowerPair(scene && scene.flower);
  const skyLift = 0.86 + 0.14 * light;
  const lawn = punch(ground, 1.32);
  return {
    sky,
    sky0: mul(sky, skyLift),
    sky1: mix3(mul(sky, skyLift), [1.0, 0.78, 0.52], 0.18),
    fog: mix3(mix3(mul(sky, 0.96), [1, 1, 1], 0.1), [1.0, 0.9, 0.76], 0.06),
    fogAmt: scene && typeof scene.fog === "number" ? scene.fog : 0.22,
    hill: mix3([0.42, 0.66, 0.44], [0.34, 0.32, 0.58], t),
    hill2: mix3([0.28, 0.52, 0.38], [0.24, 0.22, 0.42], t),
    soil: mix3([0.45, 0.32, 0.22], [0.28, 0.20, 0.22], t),
    grass: lawn,
    grassL: punch(mix3(ground, [0.75, 0.95, 0.55], 0.1), 1.22),
    grassR: punch(mix3(ground, [0.08, 0.16, 0.05], 0.12), 1.18),
    path: mix3([0.93, 0.78, 0.52], [0.62, 0.46, 0.40], t),
    hedge: mix3([0.22, 0.46, 0.28], [0.14, 0.32, 0.26], t),
    water: [0.18, 0.55, 0.62],
    lily: [0.55, 0.78, 0.42],
    hurdle: [0.28, 0.62, 0.98],
    hurdleTop: [0.72, 0.90, 1.0],
    gate: [1.0, 0.72, 0.18],
    coin: [1.0, 0.84, 0.32],
    spring: [0.92, 0.42, 0.62],
    pot: [0.98, 0.48, 0.16],
    potRim: [1.0, 0.86, 0.55],
    trunk: [0.46, 0.32, 0.22],
    leaf: [0.30, 0.66, 0.40],
    leaf2: [0.42, 0.74, 0.46],
    flower: bloom[0],
    flower2: bloom[1],
    lightAmt: light,
    density: scene && typeof scene.density === "number" ? scene.density : 0.45,
    body: [0.95, 0.48, 0.42],
    bodyDeep: [0.78, 0.32, 0.38],
    head: [1.0, 0.90, 0.78],
    cape: [1.0, 0.78, 0.38],
    sun: mix3(mul(sky, skyLift), [1.0, 0.92, 0.72], 0.35),
    sunUv: [0.74 - t * 0.08, 0.78 - t * 0.22],
  };
}

const BIOME_NAMES = ["garden", "city", "space", "coast"];
const MOOD_NAMES = ["day", "night", "sunset", "neon"];

function knownName(name, list, fallback) {
  return list.includes(name) ? name : fallback;
}

export const PROP_KINDS = new Set(["tree", "tower", "arch", "crystal", "rock", "coral", "ring",
  "pagoda", "palace-gate", "pearl-tower", "spire", "bridge-tower", "eiffel-tower",
  "clock-tower", "colonnade", "bamboo", "palm", "stone-bridge", "battlement", "willow", "cypress", "sakura",
  "pine", "bush", "fern", "mushroom", "cactus", "reed"]);
const PROP_CUBES = {
  tree: 4, tower: 5, arch: 4, crystal: 3, rock: 3, coral: 4, ring: 4,
  pagoda: 8, "palace-gate": 6, "pearl-tower": 6, spire: 5, "bridge-tower": 6,
  "eiffel-tower": 7, "clock-tower": 5, colonnade: 6, bamboo: 5, palm: 6,
  "stone-bridge": 5, battlement: 5, willow: 4, cypress: 2, sakura: 4,
  pine: 4, bush: 3, fern: 5, mushroom: 4, cactus: 4, reed: 4,
};

// Fifteen named cities, plus the plain city venue. Each street picks three
// silhouettes and its own colours. A landmark still appears, but only rarely,
// so the road is not one repeated tower. Plants stay on the prop list.
export const CITY_FACES = ["block", "eave", "gate", "hall", "step", "row", "pier", "lantern", "wall"];
export const NAMED_CITIES = [
  "beijing", "shanghai", "hangzhou", "chengdu", "xian", "chongqing", "hongkong",
  "newyork", "sanfrancisco", "losangeles", "paris", "london", "rome", "venice", "tokyo",
];
const CITY_ARCH = new Set([
  "pagoda", "palace-gate", "pearl-tower", "spire", "bridge-tower", "eiffel-tower",
  "clock-tower", "colonnade", "stone-bridge", "battlement", "tower",
]);
export const CITY_STYLES = {
  city: { wall: [0.3, 0.34, 0.48], vary: [0.58, 0.38, 0.4], roof: [0.18, 0.2, 0.26], trim: [1, 0.86, 0.42], faces: ["block", "step", "row"], glow: 0.2 },
  beijing: { wall: [0.78, 0.16, 0.12], roof: [0.14, 0.09, 0.07], trim: [0.95, 0.78, 0.32], faces: ["eave", "gate", "hall"], mark: "pagoda" },
  shanghai: { wall: [0.14, 0.2, 0.42], roof: [0.45, 0.88, 1], trim: [0.7, 0.95, 1], faces: ["step", "lantern", "block"], mark: "pearl-tower", glow: 0.5 },
  hangzhou: { wall: [0.92, 0.9, 0.84], roof: [0.22, 0.24, 0.26], trim: [0.45, 0.62, 0.38], faces: ["eave", "hall", "pier"], mark: "stone-bridge" },
  chengdu: { wall: [0.62, 0.4, 0.22], roof: [0.16, 0.42, 0.24], trim: [0.86, 0.72, 0.38], faces: ["hall", "eave", "lantern"], mark: "pagoda" },
  xian: { wall: [0.62, 0.36, 0.18], roof: [0.4, 0.16, 0.12], trim: [0.78, 0.52, 0.22], faces: ["wall", "gate", "hall"], mark: "battlement" },
  chongqing: { wall: [0.42, 0.16, 0.14], roof: [0.16, 0.12, 0.14], trim: [0.95, 0.5, 0.18], faces: ["step", "pier", "lantern"], mark: "bridge-tower", glow: 0.4 },
  hongkong: { wall: [0.1, 0.14, 0.24], roof: [0.08, 0.78, 0.7], trim: [0.98, 0.32, 0.52], faces: ["step", "lantern", "pier"], mark: "spire", glow: 0.6 },
  newyork: { wall: [0.55, 0.46, 0.36], roof: [0.24, 0.28, 0.38], trim: [0.95, 0.74, 0.32], faces: ["step", "block", "row"], mark: "spire" },
  sanfrancisco: { wall: [0.78, 0.8, 0.84], roof: [0.75, 0.22, 0.16], trim: [0.9, 0.45, 0.22], faces: ["pier", "row", "block"], mark: "bridge-tower" },
  losangeles: { wall: [0.96, 0.74, 0.55], roof: [0.9, 0.42, 0.32], trim: [0.98, 0.84, 0.4], faces: ["row", "hall", "block"], mark: "palm" },
  paris: { wall: [0.88, 0.78, 0.64], roof: [0.38, 0.36, 0.4], trim: [0.62, 0.7, 0.78], faces: ["row", "block", "lantern"], mark: "eiffel-tower" },
  london: { wall: [0.58, 0.58, 0.56], roof: [0.26, 0.2, 0.18], trim: [0.9, 0.76, 0.38], faces: ["row", "block", "gate"], mark: "clock-tower" },
  rome: { wall: [0.86, 0.66, 0.42], roof: [0.72, 0.3, 0.18], trim: [0.94, 0.88, 0.72], faces: ["row", "gate", "hall"], mark: "colonnade" },
  venice: { wall: [0.92, 0.7, 0.66], roof: [0.55, 0.26, 0.3], trim: [0.7, 0.82, 0.9], faces: ["row", "hall", "pier"], mark: "stone-bridge" },
  tokyo: { wall: [0.92, 0.9, 0.88], roof: [0.78, 0.16, 0.24], trim: [0.98, 0.5, 0.68], faces: ["lantern", "block", "eave"], mark: "spire", glow: 0.45 },
  "visit-high": { wall: [0.93, 0.9, 0.84], roof: [0.72, 0.16, 0.14], trim: [0.9, 0.72, 0.28], faces: ["hall", "wall", "eave"], mark: "pagoda" },
  "visit-lake": { wall: [0.94, 0.93, 0.9], roof: [0.32, 0.38, 0.44], trim: [0.32, 0.58, 0.82], faces: ["pier", "eave", "hall"], mark: "stone-bridge" },
  "visit-china": { wall: [0.9, 0.88, 0.78], roof: [0.18, 0.34, 0.22], trim: [0.5, 0.7, 0.42], faces: ["pier", "hall", "eave"], mark: "stone-bridge" },
  "visit-canal": { wall: [0.62, 0.26, 0.18], roof: [0.16, 0.18, 0.22], trim: [0.86, 0.78, 0.52], faces: ["row", "pier", "hall"], mark: "stone-bridge" },
  "visit-stone": { wall: [0.7, 0.62, 0.5], roof: [0.32, 0.16, 0.14], trim: [0.78, 0.7, 0.52], faces: ["row", "lantern", "gate"], mark: "clock-tower" },
  "visit-us": { wall: [0.22, 0.3, 0.4], roof: [0.55, 0.64, 0.74], trim: [0.7, 0.84, 0.98], faces: ["block", "step", "pier"], mark: "spire", glow: 0.28 },
  "visit-asia": { wall: [0.16, 0.2, 0.34], roof: [0.15, 0.7, 0.66], trim: [0.96, 0.42, 0.3], faces: ["step", "lantern", "eave"], mark: "spire", glow: 0.42 },
  "visit-palm": { wall: [0.96, 0.86, 0.68], roof: [0.82, 0.52, 0.32], trim: [0.28, 0.62, 0.5], faces: ["hall", "row", "lantern"], mark: "palm" },
};
const SPEC_BODIES = new Set(["sun", "moon", "stars", "aurora", "none"]);

function color3(v) {
  return Array.isArray(v) && v.length >= 3 && v.slice(0, 3).every((n) => typeof n === "number" && n >= 0 && n <= 1);
}

// A synced Biome EDSL object. Densities and scales are clamped so a bad
// payload cannot inflate the instance list. The Aura gate is stricter.
export function acceptSpec(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.id !== "string" || !/^[a-z][a-z0-9-]{1,23}$/.test(raw.id)) return null;
  if (!color3(raw.sky) || !color3(raw.horizon) || !color3(raw.road) || !color3(raw.ground) || !color3(raw.curb)) return null;
  const recipe = raw.recipe === "mix" || BIOME_NAMES.includes(raw.recipe) ? raw.recipe : "mix";
  const props = [];
  const list = Array.isArray(raw.props) ? raw.props.slice(0, 4) : [];
  for (const row of list) {
    if (!row || !PROP_KINDS.has(row.kind)) continue;
    props.push({
      kind: row.kind,
      density: Math.max(0.05, Math.min(0.55, Number(row.density) || 0.2)),
      scale: Math.max(0.55, Math.min(1.45, Number(row.scale) || 1)),
    });
  }
  if (!props.length) props.push({ kind: "rock", density: 0.2, scale: 1 });
  return {
    id: raw.id,
    label: typeof raw.label === "string" && raw.label ? raw.label.slice(0, 32) : raw.id,
    recipe,
    sky: raw.sky.slice(0, 3),
    horizon: raw.horizon.slice(0, 3),
    fog: color3(raw.fog) ? raw.fog.slice(0, 3) : raw.horizon.slice(0, 3),
    fogAmt: Math.max(0, Math.min(0.38, Number(raw.fogAmt) || 0.18)),
    body: SPEC_BODIES.has(raw.body) ? raw.body : "sun",
    road: raw.road.slice(0, 3),
    curb: raw.curb.slice(0, 3),
    ground: raw.ground.slice(0, 3),
    surface: typeof raw.surface === "string" ? raw.surface : "stone",
    light: Math.max(0.5, Math.min(1, Number(raw.light) || 0.8)),
    mood: Math.max(0, Math.min(1, Number(raw.mood) || 0.5)),
    particles: typeof raw.particles === "string" ? raw.particles : "none",
    particleAmt: Math.max(0, Math.min(0.55, Number(raw.particleAmt) || 0)),
    props,
    form: typeof raw.form === "string" && raw.form.length <= 800 && !/["\\\n]/.test(raw.form) ? raw.form : "",
  };
}

// Built-in garden, city, space, and coast win over a leftover mix.
// The mix stays only when this same message accepted one whose id is
// that venue. A mood tick, with no biome and no spec, leaves both.
export function takeVenue(prev, msg) {
  const prior = prev && typeof prev === "object" ? prev : {};
  let spec = prior.spec && prior.spec.recipe === "mix" && prior.spec.id ? prior.spec : null;
  let name = typeof prior.name === "string" && prior.name ? prior.name : "garden";
  const body = msg && typeof msg === "object" ? msg : {};
  if ("spec" in body) {
    if (body.spec && typeof body.spec === "object") {
      const next = acceptSpec(body.spec);
      spec = next && next.recipe === "mix" ? next : null;
      if (spec) name = spec.id;
    } else spec = null;
  }
  const venue = typeof body.biome === "string" && /^[a-z][a-z0-9-]{1,23}$/.test(body.biome) ? body.biome : "";
  const builtin = BIOME_NAMES.includes(venue);
  // A built-in venue wins over a leftover mix. A custom id keeps its spec.
  if (builtin && !(spec && spec.id === venue)) {
    spec = null;
    name = venue;
  } else if (spec) name = spec.id;
  else if (venue) name = venue;
  return { name, spec };
}

// The prop plan for one world at one tier. Meshes stay in world space and
// are rebuilt every frame, because the road moves. This cache is the plan.
const PLAN_CACHE = new Map();
const PLAN_CAP = 12;

function specKey(spec, tier) {
  const props = (Array.isArray(spec.props) ? spec.props : [])
    .map((p) => `${p && p.kind}:${p && p.density}:${p && p.scale}`)
    .join(",");
  const sky = Array.isArray(spec.sky) ? spec.sky.join(",") : "";
  return [spec.id, tier, spec.surface || "", spec.particles || "", props, sky].join("|");
}

export function worldPlan(spec, tier) {
  if (!spec || spec.recipe !== "mix" || !spec.id) return null;
  const name = tier === "low" || tier === "medium" || tier === "high" ? tier : "low";
  const key = specKey(spec, name);
  const hit = PLAN_CACHE.get(key);
  if (hit) {
    PLAN_CACHE.delete(key);
    PLAN_CACHE.set(key, hit);
    return hit;
  }
  const scale = name === "low" ? 0.45 : name === "medium" ? 0.72 : 1;
  const props = (Array.isArray(spec.props) ? spec.props : []).map((p) => ({
    kind: p.kind,
    density: Math.max(0.05, Math.min(0.55, (Number(p.density) || 0.2) * scale)),
    scale: Math.max(0.55, Math.min(1.45, Number(p.scale) || 1)),
  }));
  let amt = Number(spec.particleAmt) || 0;
  if (name === "low") amt = Math.min(0.1, amt * 0.35);
  else if (name === "medium") amt *= 0.72;
  const plan = { id: spec.id, props, particleAmt: amt, tier: name };
  PLAN_CACHE.set(key, plan);
  while (PLAN_CACHE.size > PLAN_CAP) {
    const oldest = PLAN_CACHE.keys().next().value;
    PLAN_CACHE.delete(oldest);
  }
  return plan;
}

// Shoulder flag. Sand and dust share the stone band. Reef is its own.
// A custom surface with no band stays 0. A built-in venue stays 4.
export function surfaceBand(pal) {
  if (!pal || !pal.custom) return 4;
  const s = pal.surface;
  if (s === "sand" || s === "dust" || s === "stone" || s === "plank" || s === "lava") return 3;
  if (s === "reef") return 2;
  if (s === "ice" || s === "cloud") return 5;
  return 0;
}

export function specInstances(spec) {
  if (!spec) return 0;
  let n = (Number(spec.particleAmt) || 0) * 22;
  const props = Array.isArray(spec.props) ? spec.props : [];
  for (const row of props) n += 28 * (Number(row.density) || 0) * (PROP_CUBES[row.kind] || 4);
  return n;
}

function applyMix(pal, spec) {
  const sky = spec.sky;
  const horizon = spec.horizon;
  const ground = spec.ground;
  pal.sky0 = sky.slice();
  pal.sky1 = horizon.slice();
  pal.sky = mix3(sky, horizon, 0.35);
  pal.fog = spec.fog.slice();
  pal.fogAmt = spec.fogAmt;
  pal.hill = mix3(ground, sky, 0.25);
  pal.hill2 = mix3(ground, [0.08, 0.08, 0.1], 0.35);
  pal.path = spec.road.slice();
  pal.grass = ground.slice();
  pal.grassL = mix3(ground, [1, 1, 1], 0.16);
  pal.grassR = mix3(ground, [0.06, 0.07, 0.08], 0.18);
  pal.soil = spec.curb.slice();
  pal.hedge = mix3(ground, spec.road, 0.35);
  pal.leaf = mix3(ground, [0.45, 0.75, 0.4], 0.45);
  pal.leaf2 = mix3(spec.road, [1, 1, 1], 0.25);
  pal.trunk = mix3(spec.curb, [0.2, 0.14, 0.1], 0.35);
  pal.flower = mix3(spec.road, [1, 0.9, 0.55], 0.35);
  pal.flower2 = mix3(sky, [1, 1, 1], 0.35);
  pal.sun = spec.body === "moon" || spec.body === "stars" ? [0.82, 0.9, 1] : mix3(horizon, [1, 0.9, 0.6], 0.4);
  pal.lightAmt = spec.light;
  pal.surface = spec.surface;
  pal.particles = spec.particles;
  pal.particleAmt = spec.particleAmt;
  pal.props = spec.props;
  pal.custom = 1;
  if (spec.body === "stars") {
    pal.stars = 1;
    pal.nebula = mix3(sky, [0.35, 0.2, 0.6], 0.45);
    pal.disc = 0.15;
  } else if (spec.body === "aurora") {
    pal.stars = 0.45;
    pal.nebula = [0.35, 0.9, 0.62];
    pal.disc = 0.35;
  } else if (spec.body === "moon") {
    pal.stars = 0.7;
    pal.nebula = mix3(sky, [0.15, 0.18, 0.32], 0.4);
    pal.disc = 0.45;
  } else if (spec.body === "none") {
    pal.stars = 0;
    pal.disc = 0;
  }
}

// A bright fog (Beijing's yellow, a pale sunset) used to cover the road.
// Keep a tint at the horizon and leave the near picture alone.
function settleFog(pal) {
  const fog = pal.fog || [0, 0, 0];
  const luma = fog[0] * 0.2126 + fog[1] * 0.7152 + fog[2] * 0.0722;
  if (luma > 0.62) {
    const cap = 0.055 + (1 - luma) * 0.16;
    if (pal.fogAmt > cap) pal.fogAmt = cap;
  }
  return pal;
}

// Garden in daylight is the palette above, unchanged. Other venues replace
// sky, ground, and road colours. A mix recipe is painted from its EDSL spec.
// The kinds the per-instance prop loop actually draws. A venue's pool
// stays inside it, so the step never rotates in a shape the view skips.
export const VENUE_PROP_KINDS = new Set(["tree", "pine", "bush", "fern", "mushroom",
  "cactus", "reed", "crystal", "rock", "coral", "ring"]);

// Props a built-in venue shows while no painted world is up. The core's
// level step rotates the pool, so the garden's trees, the space rocks,
// and the coast's reeds are not the same on every level. The city leaves
// towers and arches to its street, so its shoulder is park and rubble.
export const BIOME_PROPS = {
  garden: [
    { kind: "tree", density: 0.3, scale: 1.0 },
    { kind: "bush", density: 0.18, scale: 0.95 },
    { kind: "fern", density: 0.14, scale: 0.85 },
    { kind: "mushroom", density: 0.08, scale: 0.75 },
  ],
  city: [
    { kind: "rock", density: 0.16, scale: 0.9 },
    { kind: "bush", density: 0.14, scale: 0.9 },
    { kind: "fern", density: 0.1, scale: 0.8 },
  ],
  space: [
    { kind: "crystal", density: 0.22, scale: 1.0 },
    { kind: "ring", density: 0.16, scale: 0.95 },
    { kind: "rock", density: 0.12, scale: 1.1 },
  ],
  coast: [
    { kind: "coral", density: 0.24, scale: 1.0 },
    { kind: "reed", density: 0.12, scale: 0.85 },
    { kind: "rock", density: 0.1, scale: 0.9 },
  ],
};

// Start the venue's pool at the step's shift and walk it once.
export function propOrder(biome, shift) {
  const pool = BIOME_PROPS[biome] || BIOME_PROPS.garden;
  const k = Number.isInteger(shift) ? ((shift % pool.length) + pool.length) % pool.length : 0;
  const out = [];
  for (let i = 0; i < pool.length; i++) out.push(pool[(i + k) % pool.length]);
  return out;
}

// The level step's look, for a venue with no painted world. A painted
// world owns its own body, sun and props, so this does nothing there.
function applySky(pal, sky, custom) {
  if (!sky || custom) return;
  const body = typeof sky.body === "string" ? sky.body : "";
  if (body === "moon") {
    pal.sun = [0.82, 0.9, 1];
    pal.stars = Math.max(pal.stars, 0.7);
    pal.disc = 0.5;
  } else if (body === "stars") {
    pal.sun = [0.82, 0.9, 1];
    pal.stars = 1;
    pal.disc = 0.18;
    pal.nebula = [0.22, 0.18, 0.38];
  } else if (body === "aurora") {
    pal.sun = [0.72, 0.96, 0.9];
    pal.stars = Math.max(pal.stars, 0.5);
    pal.nebula = [0.3, 0.85, 0.62];
    pal.disc = 0.35;
  } else if (body === "none") {
    pal.disc = 0;
  }
  const uv = sky.uv;
  if (Array.isArray(uv) && uv.length === 2
      && uv.every((n) => typeof n === "number" && n >= 0 && n <= 1)) {
    pal.sunUv = [uv[0], uv[1]];
  }
  if (Number.isInteger(sky.shift)) pal.props = propOrder(pal.biome, sky.shift);
}

// Hurdles, gates, coins, and pots stay put so every biome stays readable.
export function dressPalette(base, biome, mood, spec, sky) {
  const custom = !!(spec && spec.recipe === "mix" && spec.id);
  const name = custom ? spec.id : knownName(biome, BIOME_NAMES, "garden");
  const tone = knownName(mood, MOOD_NAMES, "day");
  const pal = Object.assign({}, base, {
    biome: name,
    mood: tone,
    stars: 0,
    nebula: [0, 0, 0],
    disc: 1,
    sunUv: base.sunUv.slice(),
    custom: 0,
    props: null,
    particles: "none",
    particleAmt: 0,
    surface: "grass",
  });
  // The spec already chose this sky. A named mood must not pull it back.
  if (custom) {
    applyMix(pal, spec);
    return settleFog(pal);
  }
  if (name === "city") {
    pal.sky0 = [0.42, 0.52, 0.82];
    pal.sky1 = [0.98, 0.58, 0.34];
    pal.sky = [0.55, 0.48, 0.72];
    pal.fog = [0.96, 0.72, 0.52];
    pal.fogAmt = Math.min(0.28, pal.fogAmt);
    pal.hill = [0.18, 0.2, 0.32];
    pal.hill2 = [0.28, 0.24, 0.38];
    pal.path = [0.22, 0.24, 0.28];
    pal.grass = [0.52, 0.54, 0.58];
    pal.grassL = [0.62, 0.64, 0.66];
    pal.grassR = [0.46, 0.48, 0.52];
    pal.hedge = [0.32, 0.36, 0.48];
    pal.soil = [0.2, 0.18, 0.16];
    pal.leaf = [0.28, 0.55, 0.38];
    pal.leaf2 = [0.42, 0.68, 0.46];
    pal.trunk = [0.28, 0.3, 0.34];
    pal.water = [0.16, 0.38, 0.58];
    pal.flower = [1, 0.78, 0.32];
    pal.flower2 = [0.45, 0.82, 1];
    pal.sun = [1, 0.72, 0.38];
    pal.lightAmt = Math.max(0.72, pal.lightAmt);
  } else if (name === "space") {
    pal.sky0 = [0.05, 0.06, 0.16];
    pal.sky1 = [0.22, 0.12, 0.36];
    pal.sky = [0.1, 0.1, 0.22];
    pal.fog = [0.08, 0.07, 0.16];
    pal.fogAmt = Math.min(0.16, pal.fogAmt);
    pal.hill = [0.08, 0.07, 0.14];
    pal.hill2 = [0.12, 0.08, 0.2];
    pal.path = [0.2, 0.26, 0.42];
    pal.grass = [0.12, 0.14, 0.24];
    pal.grassL = [0.16, 0.18, 0.32];
    pal.grassR = [0.14, 0.16, 0.28];
    pal.hedge = [0.2, 0.28, 0.48];
    pal.soil = [0.16, 0.14, 0.18];
    pal.leaf = [0.35, 0.55, 0.9];
    pal.leaf2 = [0.55, 0.85, 1];
    pal.trunk = [0.35, 0.32, 0.38];
    pal.water = [0.15, 0.35, 0.7];
    pal.flower = [0.65, 0.9, 1];
    pal.flower2 = [0.85, 0.55, 1];
    pal.sun = [0.82, 0.9, 1];
    pal.lightAmt = Math.max(0.84, pal.lightAmt);
    pal.stars = 1;
    pal.nebula = [0.35, 0.18, 0.55];
    pal.sunUv = [0.78, 0.84];
  } else if (name === "coast") {
    pal.sky0 = [0.42, 0.7, 0.95];
    pal.sky1 = [0.96, 0.78, 0.52];
    pal.sky = [0.55, 0.74, 0.9];
    pal.fog = [0.78, 0.88, 0.95];
    pal.fogAmt = Math.min(0.22, pal.fogAmt);
    pal.hill = [0.28, 0.52, 0.64];
    pal.hill2 = [0.18, 0.42, 0.58];
    pal.path = [0.93, 0.82, 0.52];
    pal.grass = [0.22, 0.58, 0.68];
    pal.grassL = [0.3, 0.66, 0.74];
    pal.grassR = [0.16, 0.48, 0.6];
    pal.hedge = [0.18, 0.5, 0.4];
    pal.soil = [0.72, 0.58, 0.32];
    pal.leaf = [0.18, 0.58, 0.34];
    pal.leaf2 = [0.32, 0.72, 0.4];
    pal.trunk = [0.5, 0.34, 0.2];
    pal.water = [0.12, 0.48, 0.62];
    pal.lily = [0.85, 0.92, 0.78];
    pal.flower = [1, 0.62, 0.55];
    pal.flower2 = [1, 0.86, 0.45];
    pal.sun = [1, 0.9, 0.62];
    pal.lightAmt = Math.max(0.78, pal.lightAmt);
  }
  if (name === "garden" && tone === "day") {
    applySky(pal, sky, custom);
    return pal;
  }
  if (tone === "night") {
    pal.sky0 = mix3(pal.sky0, [0.06, 0.08, 0.16], 0.72);
    pal.sky1 = mix3(pal.sky1, [0.14, 0.16, 0.28], 0.62);
    pal.sky = mix3(pal.sky, [0.1, 0.12, 0.22], 0.55);
    pal.fog = mix3(pal.fog, [0.16, 0.18, 0.28], 0.45);
    pal.fogAmt = Math.min(0.26, pal.fogAmt);
    pal.hill = mix3(pal.hill, [0.06, 0.07, 0.12], 0.5);
    pal.hill2 = mix3(pal.hill2, [0.04, 0.05, 0.1], 0.5);
    pal.sun = [0.82, 0.88, 1];
    pal.lightAmt = Math.max(0.62, pal.lightAmt * 0.82);
    pal.stars = Math.max(pal.stars, 0.9);
    pal.nebula = name === "space" ? pal.nebula : [0.12, 0.16, 0.32];
    pal.disc = 0.5;
    pal.sunUv = [pal.sunUv[0], Math.min(0.9, pal.sunUv[1] + 0.06)];
  } else if (tone === "sunset") {
    pal.sky0 = mix3(pal.sky0, [0.55, 0.38, 0.62], 0.45);
    pal.sky1 = mix3(pal.sky1, [1, 0.48, 0.28], 0.55);
    pal.fog = mix3(pal.fog, [1, 0.62, 0.4], 0.35);
    pal.fogAmt = Math.min(0.28, Math.max(pal.fogAmt, 0.16));
    pal.sun = [1, 0.64, 0.32];
    pal.stars = Math.max(pal.stars, 0.18);
    pal.nebula = [0.85, 0.4, 0.28];
    pal.lightAmt = Math.max(0.74, pal.lightAmt);
  } else if (tone === "neon") {
    pal.sky0 = mix3(pal.sky0, [0.08, 0.06, 0.2], 0.62);
    pal.sky1 = mix3(pal.sky1, [0.9, 0.22, 0.62], 0.58);
    pal.sky = mix3(pal.sky, [0.2, 0.1, 0.32], 0.4);
    pal.fog = mix3(pal.fog, [0.45, 0.18, 0.48], 0.4);
    pal.fogAmt = Math.min(0.26, Math.max(0.12, pal.fogAmt));
    pal.sun = [0.45, 0.95, 1];
    pal.stars = Math.max(pal.stars, 0.45);
    pal.nebula = [0.15, 0.85, 0.95];
    pal.lightAmt = Math.max(0.88, pal.lightAmt);
    pal.flower = [0.2, 0.95, 0.9];
    pal.flower2 = [1, 0.35, 0.75];
  }
  applySky(pal, sky, custom);
  return settleFog(pal);
}

function cube() {
  const faces = [
    { n: [1, 0, 0], p: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
    { n: [-1, 0, 0], p: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
    { n: [0, 1, 0], p: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
    { n: [0, -1, 0], p: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
    { n: [0, 0, 1], p: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
    { n: [0, 0, -1], p: [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]] },
  ];
  const out = [];
  const order = [0, 1, 2, 0, 2, 3];
  for (const f of faces) {
    for (const i of order) out.push(f.p[i][0], f.p[i][1], f.p[i][2], f.n[0], f.n[1], f.n[2]);
  }
  return new Float32Array(out);
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
  return s;
}

function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link");
  return p;
}

function perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
  out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
  return out;
}

function lookAt(out, eye, at, up) {
  let z0 = eye[0] - at[0];
  let z1 = eye[1] - at[1];
  let z2 = eye[2] - at[2];
  let len = Math.hypot(z0, z1, z2) || 1;
  z0 /= len; z1 /= len; z2 /= len;
  let x0 = up[1] * z2 - up[2] * z1;
  let x1 = up[2] * z0 - up[0] * z2;
  let x2 = up[0] * z1 - up[1] * z0;
  len = Math.hypot(x0, x1, x2);
  if (!len) { x0 = 0; x1 = 0; x2 = 0; }
  else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;
  out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
  out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
  out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
  out[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
  out[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
  out[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
  out[15] = 1;
  return out;
}

function ortho(out, left, right, bottom, top, near, far) {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
  out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
  out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
  out[12] = (left + right) * lr;
  out[13] = (top + bottom) * bt;
  out[14] = (far + near) * nf;
  out[15] = 1;
  return out;
}

function mulMat(out, a, b) {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function laneX(lane) {
  return lane < 0 ? 0 : (lane - 1) * 1.8;
}

// Solid gate bar. lib/phys.aura gate-span and web/sim.mjs use this thickness.
export function gateBarDepth(w) {
  const depth = Math.max(0.45, w);
  return Math.max(0.22, depth * 0.35);
}

// A world switch crossfades for about half a second. New props appear
// past this arc first, then the wave walks back toward the runner so
// scenery already beside the camera is not swapped in one frame.
export const WORLD_BLEND_S = 0.52;
export function propWave(heroS, t) {
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  const s = Number.isFinite(heroS) ? heroS : 0;
  return s + 34 - u * 40;
}

function paletteId(p) {
  if (!p) return "";
  const sky = Array.isArray(p.sky0) ? p.sky0.map((n) => Number(n).toFixed(2)).join(",") : "";
  return [p.biome || "", p.mood || "", p.custom ? 1 : 0, sky].join("|");
}

export function mixPalette(a, b, t) {
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  const left = a || {};
  const right = b || {};
  const out = {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const k of keys) {
    const av = left[k];
    const bv = right[k];
    if (Array.isArray(av) && Array.isArray(bv) && av.length === bv.length && av.every((n) => typeof n === "number") && bv.every((n) => typeof n === "number")) {
      out[k] = av.map((n, i) => n + (bv[i] - n) * u);
    } else if (typeof av === "number" && typeof bv === "number") {
      out[k] = av + (bv - av) * u;
    } else {
      out[k] = u < 0.5 ? (av !== undefined ? av : bv) : (bv !== undefined ? bv : av);
    }
  }
  return out;
}

// A gate bar that has already passed the runner sits in the camera's
// near field and can cover the body. Ahead of the runner it stays put,
// so the slide gap is still readable. Hit size is unchanged.
export function barBlocksHero(back) {
  return back > 0.9 && back < 6;
}

// A pot's hit is about 1.05 across and stops near 1.12. The picture
// reads taller than the body. The hit does not grow with that picture.
// A toy is smaller than the lane it flies in. Twins: lib/phys.aura, web/sim.mjs.
export const POT_REACH = 0.84;
export const POT_TOP = 1.12;
export const POT_HALF = 0.56;
export const FLY_REACH = 0.62;
export const FLY_HALF = 0.22;

// Kind-2 holes overlapping [s0, s1] on one lane. A piece lane below 0
// covers every lane. The tile centre used to paint the whole slab, so a
// hole that missed that centre stayed grass while the body still fell in.
export function gapSpans(pieces, s0, s1, lane) {
  if (!pieces || !(s1 > s0)) return [];
  const raw = [];
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (!q || q[0] !== 2) continue;
    const pl = q.length > 5 ? q[5] : -1;
    if (pl >= 0 && pl !== lane) continue;
    const a = Math.max(s0, q[1]);
    const b = Math.min(s1, q[1] + q[2]);
    if (b > a) raw.push([a, b]);
  }
  raw.sort((u, v) => u[0] - v[0]);
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const span = raw[i];
    const last = out[out.length - 1];
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]);
    else out.push([span[0], span[1]]);
  }
  return out;
}

export const FOG_CAP = 0.38;

// Same curve as the mesh shader: haze tops out at 0.38, and emissive
// obstacles keep most of their colour instead of dissolving into it.
export function fogStrength(dist, requested = 0.22) {
  const cap = Math.min(FOG_CAP, Math.max(0, Number(requested) || 0));
  const base = 1 - Math.exp(-Math.max(0, dist) * 0.0055);
  return Math.max(0, Math.min(cap, base));
}

export function obstacleFog(dist, requested, emit) {
  const punch = Math.max(0, Math.min(1, emit));
  return fogStrength(dist, requested) * (1 - 0.82 * punch);
}

export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function worldX(simX) {
  return -simX;
}

// One road frame for the mesh, the camera, and screenX.
// Sim forward s is arc length. Heading starts at 0 (world +Z) and integrates
// curvature bend / ROAD_RADIUS. A later bend continues from the pose already
// run; it does not rebuild the path from the origin.
// A jump in s (a rescue, a server snap, a new run) keeps the world pose and
// adopts the new parameter, so the view does not rewind to the opening.
// Forward T = (sin ψ, 0, cos ψ). Road-right (sim +lateral, screen-right) is
// T × up = (-cos ψ, 0, sin ψ). At ψ = 0 that is world -X, matching worldX.
export const ROAD_RADIUS = 42;
export const DEFAULT_BEND = 0.38;

export function clampBend(bend) {
  const n = Number(bend);
  if (!Number.isFinite(n)) return 0;
  return Math.max(-0.7, Math.min(0.7, n));
}

// Road tangent (sin ψ, cos ψ) and road-right (-cos ψ, sin ψ).
export function roadAxes(psi) {
  const p = Number.isFinite(psi) ? psi : 0;
  return {
    tx: Math.sin(p),
    tz: Math.cos(p),
    rx: -Math.cos(p),
    rz: Math.sin(p),
  };
}

// World XZ of one burst spoke. ψ = 0 keeps (cos a, sin a). On a bend the
// spoke stays in the road plane instead of the world axes.
export function burstDir(psi, a) {
  const ax = roadAxes(psi);
  const along = Math.sin(a);
  const side = -Math.cos(a);
  return {
    x: ax.tx * along + ax.rx * side,
    z: ax.tz * along + ax.rz * side,
  };
}

function advance(x, z, psi, kappa, ds) {
  if (Math.abs(kappa) < 1e-8) {
    return { x: x + Math.sin(psi) * ds, z: z + Math.cos(psi) * ds, psi };
  }
  const psi1 = psi + kappa * ds;
  return {
    x: x + (Math.cos(psi) - Math.cos(psi1)) / kappa,
    z: z + (Math.sin(psi1) - Math.sin(psi)) / kappa,
    psi: psi1,
  };
}

function withTangent(pose) {
  return { x: pose.x, z: pose.z, psi: pose.psi, tx: Math.sin(pose.psi), tz: Math.cos(pose.psi) };
}

// keys are { s, bend }, ascending. Bend on a key holds until the next.
// s may be negative: that continues the first key backward, so tiles behind
// a rebased runner still lie on the same curve.
export function integrateRoad(keys, s) {
  const at = Number.isFinite(Number(s)) ? Number(s) : 0;
  const list = keys && keys.length ? keys : [{ s: 0, bend: 0 }];
  if (at <= 0) return withTangent(advance(0, 0, 0, clampBend(list[0].bend) / ROAD_RADIUS, at));
  let x = 0;
  let z = 0;
  let psi = 0;
  let cursor = 0;
  for (let i = 0; i < list.length; i++) {
    const end = i + 1 < list.length ? list[i + 1].s : at;
    const s1 = Math.min(at, end);
    if (s1 > cursor) {
      const step = advance(x, z, psi, clampBend(list[i].bend) / ROAD_RADIUS, s1 - cursor);
      x = step.x;
      z = step.z;
      psi = step.psi;
      cursor = s1;
    }
    if (cursor >= at - 1e-9) break;
  }
  return withTangent({ x, z, psi });
}

// Place the arc-length curve into the world. The anchor is the pose at anchor.s.
export function poseOnRoad(anchor, keys, s) {
  const origin = anchor && Number.isFinite(anchor.psi) ? anchor : { s: 0, x: 0, z: 0, psi: 0 };
  const originS = Number.isFinite(origin.s) ? origin.s : 0;
  const shifted = (keys && keys.length ? keys : [{ s: originS, bend: 0 }]).map((k) => ({
    s: k.s - originS,
    bend: k.bend,
  }));
  const rel = integrateRoad(shifted, (Number(s) || 0) - originS);
  const ap = origin.psi || 0;
  const c = Math.cos(ap);
  const sn = Math.sin(ap);
  const psi = ap + rel.psi;
  return withTangent({
    x: (origin.x || 0) + c * rel.x + sn * rel.z,
    z: (origin.z || 0) - sn * rel.x + c * rel.z,
    psi,
  });
}

// Keep the world pose at fromS, and call that pose toS. Later distance turns
// from there. Used when arc length jumps, so the camera does not fly back
// along the old curve to the opening view.
export function rebaseAnchor(anchor, keys, fromS, toS, bend) {
  const kept = poseOnRoad(anchor, keys, fromS);
  const at = Number.isFinite(Number(toS)) ? Number(toS) : 0;
  return {
    anchor: { s: at, x: kept.x, z: kept.z, psi: kept.psi },
    keys: [{ s: at, bend: clampBend(bend) }],
  };
}

// Fold the road keys behind `cut` into the anchor, keeping only the keys at
// or after it. The world pose at `cut` becomes the new anchor, so every
// later sample is unchanged (poseOnRoad continues the first key backward for
// s < anchor.s). Without this, roadKeys grows once per bend change for the
// whole run — only a gap-rescue rebase ever dropped them — and integrateRoad
// walks every key behind the runner on each of the ~230 sample() calls a
// frame makes, so the client frame cost climbed linearly with distance run
// (the "stutters after a while" symptom). The camera samples no farther back
// than pz - 8, so keys behind the runner by more than the margin are dead
// weight. Returns the same anchor/keys when nothing is behind the cut.
export function trimRoadKeys(anchor, keys, cut) {
  if (!Array.isArray(keys) || keys.length < 2) return { anchor, keys };
  let firstKept = 0;
  while (firstKept < keys.length && keys[firstKept].s < cut) firstKept++;
  if (firstKept === 0) return { anchor, keys };
  const pose = poseOnRoad(anchor, keys, cut);
  const bend = keys[firstKept - 1].bend;
  const kept = [{ s: cut, bend: clampBend(bend) }];
  for (let i = firstKept; i < keys.length; i++) kept.push(keys[i]);
  return {
    anchor: { s: cut, x: pose.x, z: pose.z, psi: pose.psi },
    keys: kept,
  };
}

// A gap recovery teleports arc length by about the width of the hole.
// Taking the whole jump in one frame pops the runner ahead of the camera.
// Glide across it. A correction past 8 m still rebases, so the view does
// not rewind to the opening.
export function glideS(shown, next, speed, dt) {
  const s0 = Number.isFinite(shown) ? shown : 0;
  const s1 = Number.isFinite(next) ? next : s0;
  const jump = s1 - s0;
  const stepDt = Number.isFinite(dt) && dt > 0 ? Math.min(0.05, dt) : 1 / 60;
  const pace = Math.max(0.5, Number.isFinite(speed) ? speed : 5);
  const normal = Math.max(pace * stepDt * 1.35, 0.02);
  if (Math.abs(jump) > 8) return { s: s1, rebase: true };
  if (Math.abs(jump) <= normal) return { s: s1, rebase: false };
  const cap = Math.max(normal, 7 * stepDt);
  const step = Math.sign(jump) * Math.min(Math.abs(jump), cap);
  return { s: s0 + step, rebase: false };
}

export function drawsKeeper(hero) {
  const plan = hero && typeof hero.plan === "string" ? hero.plan : "keeper";
  return plan === "keeper";
}

function projectLateral(pose, lateral) {
  const lat = lateral || 0;
  const c = Math.cos(pose.psi);
  const sn = Math.sin(pose.psi);
  return {
    x: pose.x + lat * -c,
    z: pose.z + lat * sn,
    psi: pose.psi,
    tx: sn,
    tz: c,
  };
}

export function roadPoint(s, lateral, bend = 0) {
  return projectLateral(integrateRoad([{ s: 0, bend }], s), lateral);
}

// Third-person frame shared by the view and by screenX. The eye sits
// high and close, the look point is low and near, and the field is
// narrow, so the sky is a thin band and the runner reads large.
const CAM_EYE_Y = 3.55;
const CAM_BACK = 4.55;
const CAM_LOOK_Y = 0.42;
const CAM_AHEAD = 3.9;
const CAM_FOV = 0.7;

export function cameraPose(simLx, simY, simZ, fovy = CAM_FOV, bend = 0) {
  const centre = roadPoint(simZ, 0, bend);
  const body = roadPoint(simZ, simLx, bend);
  const psi = centre.psi;
  const ox = body.x - centre.x;
  const oz = body.z - centre.z;
  return {
    eye: [centre.x + ox * 0.55 - Math.sin(psi) * CAM_BACK, CAM_EYE_Y, centre.z + oz * 0.55 - Math.cos(psi) * CAM_BACK],
    at: [centre.x + ox * 0.2 + Math.sin(psi) * CAM_AHEAD, CAM_LOOK_Y + simY * 0.15, centre.z + oz * 0.2 + Math.cos(psi) * CAM_AHEAD],
    fovy,
    psi,
  };
}

export function invertMat(out, a) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

function mulMatPoint(m, p) {
  const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12] * p[3];
  const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13] * p[3];
  const z = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14] * p[3];
  const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15] * p[3];
  return [x, y, z, w];
}

// Project a sim position with a camera fixed on the centre lane. Screen x
// grows to the right. After a Left press, this value must fall.
// The point and the camera both come from roadPoint, including when the road bends.
export function screenX(simLx, simY, simZ, width, height, bend = 0) {
  const pose = cameraPose(0, 0, simZ, CAM_FOV, bend);
  const proj = new Float32Array(16);
  const viewM = new Float32Array(16);
  perspective(proj, pose.fovy, width / height, 0.08, 80);
  lookAt(viewM, pose.eye, pose.at, [0, 1, 0]);
  const at = roadPoint(simZ, simLx, bend);
  const viewP = mulMatPoint(viewM, [at.x, 0.8 + simY, at.z, 1]);
  const clip = mulMatPoint(proj, viewP);
  const ndcX = clip[0] / clip[3];
  return (ndcX * 0.5 + 0.5) * width;
}

const SKY_VS = `#version 300 es
layout(location=0) in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
uniform vec3 uSky0; uniform vec3 uSky1; uniform vec3 uHill; uniform vec3 uHill2;
uniform vec3 uSunCol; uniform vec2 uSun; uniform vec2 uRes;
uniform float uTime; uniform float uCamZ; uniform float uYaw; uniform float uFov;
uniform float uSunAmt;
uniform float uStars;
uniform vec3 uNebula;
uniform float uFlash;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float horizon = smoothstep(0.04, 0.48, uv.y);
  vec3 c = mix(uSky1, uSky0, horizon);
  float haze = exp(-max(uv.y - 0.42, 0.0) * 5.4);
  c = mix(c, uSky1, haze * 0.1);
  // Hills and the sun are world-fixed. uYaw is the road heading, so a turn
  // carries the opening sky off to the side instead of leaving it on screen.
  float span = max(uFov * uRes.x / max(uRes.y, 1.0), 0.3);
  float x = uv.x - uYaw / span;
  float parallax = uCamZ * 0.004;
  float h1 = 0.16 + 0.03 * sin(x * 7.0 + parallax);
  float h2 = 0.10 + 0.022 * sin(x * 15.0 + 1.4 + parallax * 1.7);
  if (uv.y < h1) c = mix(c, uHill, smoothstep(h1, h1 - 0.08, uv.y));
  if (uv.y < h2) c = mix(c, uHill2, 0.9);
  // Two slow sine sheets. uTime is seconds; no FBM, just a drift.
  float drift = uTime * 0.08;
  float cloudA = sin(x * 5.0 + parallax + drift);
  float cloudB = sin(x * 10.5 - drift * 1.5 + 1.4);
  float cloudC = sin(x * 2.3 + drift * 0.45 + uv.y * 3.2);
  float band = smoothstep(0.4, 0.75, uv.y);
  float puff = smoothstep(0.2, 0.9, cloudA) * 0.62 + smoothstep(0.3, 0.92, cloudB) * 0.38;
  c = mix(c, vec3(1.0, 0.97, 0.92), puff * band * 0.1);
  c = mix(c, vec3(1.0, 0.98, 0.95), smoothstep(0.5, 0.98, cloudC) * smoothstep(0.62, 0.9, uv.y) * 0.05);
  vec2 sun = vec2(x, uv.y) - uSun;
  // UV is 0..1 on both axes, so a circle there is 16:9 wide on screen.
  sun.x *= uRes.x / max(uRes.y, 1.0);
  float sd = length(sun);
  float sunAmt = max(uSunAmt, 0.0);
  c += uSunCol * smoothstep(0.14, 0.0, sd) * 0.5 * sunAmt;
  c += vec3(1.0, 0.97, 0.9) * smoothstep(0.035, 0.0, sd) * sunAmt;
  // Pinpoints, not cells. A lit cell used to fill a wide dash.
  if (uStars > 0.01) {
    vec2 cell = vec2(floor((x + 8.0) * 110.0), floor(uv.y * 160.0));
    vec2 fuv = vec2(fract((x + 8.0) * 110.0), fract(uv.y * 160.0));
    float h1 = fract(sin(cell.x * 127.1 + cell.y * 311.7) * 43758.5);
    float h2 = fract(sin(cell.y * 269.5 + cell.x * 183.3) * 12543.3);
    float d = length(fuv - vec2(h1, h2));
    float star = smoothstep(0.07, 0.0, d) * step(0.84, h1) * step(0.34, uv.y);
    float tw = 0.7 + 0.3 * sin(uTime * 2.2 + h2 * 24.0);
    c += vec3(0.96, 0.98, 1.0) * star * tw * uStars;
    c = mix(c, uNebula, uStars * 0.18 * smoothstep(0.25, 0.85, uv.y));
  }
  // A short portal sweep when the venue changes. One extra uniform on
  // the sky pass; the mesh draw stays the same instanced call.
  if (uFlash > 0.001) {
    float sweep = smoothstep(0.16, 0.0, abs(uv.y - mix(0.78, 0.34, uFlash)));
    c += vec3(1.0, 0.98, 0.92) * uFlash * (0.38 + sweep * 0.85);
  }
  // Highlight shoulder only. Below 0.9 the sky is unchanged, so the blue
  // stays blue; the sun core rolls toward white instead of clipping flat.
  vec3 over = max(c - vec3(0.9), vec3(0.0));
  c = min(max(c, vec3(0.0)), vec3(0.9)) + over / (vec3(1.0) + over * 10.0);
  o = vec4(c, 1.0);
}`;

const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 iPos;
layout(location=3) in vec4 iSize;
layout(location=4) in vec4 iColor;
layout(location=5) in vec4 iYaw;
uniform mat4 uProj;
uniform mat4 uView;
out vec3 vN;
out vec3 vW;
out vec3 vC;
out vec3 vL;
flat out vec3 vCenter;
flat out vec3 vHalf;
flat out float vShape;
flat out float vRough;
flat out float vEmit;
flat out float vYaw;
flat out float vMetal;
flat out float vSheen;
flat out float vKind;
void main() {
  // Yaw is roadPoint psi. Local +Z becomes the road tangent (sin ψ, 0, cos ψ).
  // A thin wide deck stores its grade in sheen. Positive grade raises the
  // front of the slab (local +Z). Zero leaves every other mesh unchanged.
  float c = cos(iYaw.x);
  float s = sin(iYaw.x);
  vec3 local = aPos * iSize.xyz;
  float grade = 0.0;
  if (iPos.w < 0.5 && iSize.y < 0.2 && iSize.x > 1.15 && abs(iYaw.z) < 0.22) grade = iYaw.z;
  local.y += local.z * grade;
  vec3 spun = vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
  vec3 world = spun + iPos.xyz;
  vec3 nrm = vec3(aNrm.x, aNrm.y, aNrm.z - aNrm.y * grade);
  vL = aPos;
  vN = vec3(c * nrm.x + s * nrm.z, nrm.y, -s * nrm.x + c * nrm.z);
  vW = world;
  vC = iColor.rgb;
  vCenter = iPos.xyz;
  vHalf = iSize.xyz * 0.5;
  vShape = iPos.w;
  vRough = iSize.w;
  vEmit = iColor.a;
  vYaw = iYaw.x;
  vMetal = iYaw.y;
  vSheen = grade != 0.0 ? 0.0 : iYaw.z;
  vKind = iYaw.w;
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const MESH_FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec3 vC; in vec3 vL;
flat in vec3 vCenter; flat in vec3 vHalf; flat in float vShape;
flat in float vRough; flat in float vEmit; flat in float vYaw;
flat in float vMetal; flat in float vSheen; flat in float vKind;
uniform vec3 uEye; uniform vec3 uFog; uniform float uFogAmt;
uniform vec3 uLight; uniform float uLightAmt; uniform vec3 uSkyAmb; uniform vec3 uSoil; uniform float uTime;
out vec4 o;
// Cylinder, cone and torus live in the unit box of the instance and are
// marched in that box, so any part a generated thing names is drawn by
// the same instanced cube.
float unitSdf(vec3 p, float shape) {
  float rr = length(p.xz);
  if (shape < 3.5) return max(rr - 0.5, abs(p.y) - 0.5);
  if (shape < 4.5) return max((rr - 0.5 * (0.5 - p.y)) * 0.894, abs(p.y) - 0.5);
  return length(vec2(rr - 0.32, p.y * 0.36)) - 0.18;
}
vec3 softKnee(vec3 c) {
  vec3 over = max(c - vec3(0.9), vec3(0.0));
  return min(max(c, vec3(0.0)), vec3(0.9)) + over / (vec3(1.0) + over * 10.0);
}
void main() {
  vec3 n = normalize(vN);
  vec3 rd = normalize(vW - uEye);
  float cov = 1.0;
  float eyeD = length(vCenter - uEye);
  bool asBox = vShape < 0.5;
  if (vShape > 2.5 && eyeD > 32.0) {
    // Very far: the bounding cube is enough. Skip the march.
    asBox = true;
    float edge = min(min(0.5 - abs(vL.x), 0.5 - abs(vL.y)), 0.5 - abs(vL.z));
    n = normalize(vN + vL * smoothstep(0.16, 0.0, edge) * 0.85);
  } else if (vShape > 2.5) {
    int budget = 32;
    float minStep = 0.005;
    if (eyeD > 18.0) { budget = 8; minStep = 0.02; }
    else if (eyeD > 12.0) { budget = 14; minStep = 0.011; }
    float cy = cos(vYaw);
    float sy = sin(vYaw);
    vec3 size = max(vHalf * 2.0, vec3(1e-3));
    vec3 rl = vec3(cy * rd.x - sy * rd.z, rd.y, sy * rd.x + cy * rd.z) / size;
    rl = normalize(rl);
    vec3 p0 = vL;
    float t = 0.0;
    float closest = 1e3;
    vec3 cq = p0;
    bool hit = false;
    for (int i = 0; i < 40; i++) {
      if (i >= budget) break;
      vec3 q = p0 + rl * t;
      float d = unitSdf(q, vShape);
      if (d < closest) { closest = d; cq = q; }
      if (d < 0.01) { hit = true; break; }
      t += max(d * 0.88, minStep);
      if (t > 1.8) break;
    }
    if (!hit) {
      float w = max(fwidth(closest), 0.004);
      cov = smoothstep(w, -w, closest);
      if (cov < 0.04) discard;
    }
    vec3 q = cq;
    vec2 e = vec2(0.003, 0.0);
    vec3 g = vec3(unitSdf(q + e.xyy, vShape) - unitSdf(q - e.xyy, vShape),
                  unitSdf(q + e.yxy, vShape) - unitSdf(q - e.yxy, vShape),
                  unitSdf(q + e.yyx, vShape) - unitSdf(q - e.yyx, vShape)) / size;
    g = normalize(g);
    n = normalize(vec3(cy * g.x + sy * g.z, g.y, -sy * g.x + cy * g.z));
  } else if (vShape > 0.5 && vShape < 1.5) {
    float r = min(min(vHalf.x, vHalf.y), vHalf.z);
    vec3 oc = uEye - vCenter;
    float b = dot(oc, rd);
    float h = b * b - (dot(oc, oc) - r * r);
    float w = max(fwidth(h), 1e-4);
    cov = smoothstep(-w, w, h);
    if (cov < 0.02) discard;
    vec3 hit = uEye + rd * (-b - sqrt(max(h, 0.0)));
    n = normalize(hit - vCenter);
  } else if (vShape > 1.5 && vShape < 2.5) {
    float d = abs(vL.x) + abs(vL.y) + abs(vL.z) - 0.82;
    float w = max(fwidth(d), 1e-4);
    cov = smoothstep(w, -w, d);
    if (cov < 0.02) discard;
    vec3 sn = vec3(sign(vL.x), sign(vL.y), sign(vL.z));
    n = normalize(sn + vec3(0.0001));
  } else if (asBox) {
    float edge = min(min(0.5 - abs(vL.x), 0.5 - abs(vL.y)), 0.5 - abs(vL.z));
    // A wide deck tile is one face of a run. Bending by local position
    // put a separate highlight pillow on every slab.
    bool deck = vHalf.y < 0.12 && vHalf.x > 0.7;
    n = normalize(deck ? vN : vN + vL * smoothstep(0.16, 0.0, edge) * 0.85);
  }
  vec3 viewDir = normalize(uEye - vW);
  vec3 L = normalize(uLight);
  float ndl = max(dot(n, L), 0.0);
  float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  float wrap = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  float metal = clamp(vMetal, 0.0, 1.0);
  float sheen = clamp(vSheen, 0.0, 1.0);
  float rough = clamp(vRough, 0.0, 1.0);
  vec3 ambient = mix(vec3(0.46, 0.54, 0.68), uSkyAmb, 0.16);
  vec3 col = vC * (ambient + 0.18 * hemi + uLightAmt * ndl + 0.08 * wrap);
  col *= mix(vec3(0.82, 0.90, 1.06), vec3(1.08, 0.97, 0.84), clamp(ndl, 0.0, 1.0));
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2);
  col += vec3(1.0, 0.93, 0.82) * rim * (0.16 + vEmit * 0.22);
  float specPow = mix(48.0, 12.0, rough);
  float spec = pow(max(dot(n, normalize(L + viewDir)), 0.0), specPow);
  vec3 specCol = mix(vec3(1.0, 0.96, 0.88), vC, metal);
  col += specCol * spec * mix(0.45, 0.06, rough) * (1.0 + sheen);
  if (asBox) {
    // A deck is one run of slabs. Darkening local Z put a black lip on
    // every join, and the post sharpen turned that lip into a seam.
    bool deck = vHalf.y < 0.12 && vHalf.x > 0.7;
    float edge = min(0.5 - abs(vL.x), 0.5 - abs(vL.y));
    if (!deck) edge = min(edge, 0.5 - abs(vL.z));
    if (!deck) col *= 0.76 + 0.24 * smoothstep(0.0, 0.16, edge);
    if (vHalf.y < 0.12 && vHalf.x < 1.2) col *= 1.0 - 0.22 * smoothstep(0.32, 0.48, abs(vL.x));
    // Path slabs are the wide, mid-rough tiles. Curbs and the dashed
    // centre line reuse those pixels instead of extra instances.
    if (vHalf.y < 0.1 && vHalf.x > 0.7 && rough > 0.4 && rough < 0.7 && vKind < 0.5) {
      float side = abs(vL.x);
      if (side > 0.39) {
        vec3 soilLit = uSoil * (0.55 + 0.45 * ndl + 0.2 * hemi);
        col = mix(col, soilLit, smoothstep(0.39, 0.44, side));
      } else if (side < 0.04 && abs(vL.z) < 0.22) {
        col = mix(col, vec3(0.99, 0.97, 0.86), 0.92);
      }
    }
  }
  float under = smoothstep(-0.15, -0.48, vL.y);
  col *= 1.0 - 0.32 * under * (1.0 - vEmit);
  if (vKind > 0.5 && vKind < 1.5) {
    float rip = sin(vW.x * 5.4 + uTime * 1.6) * sin(vW.z * 4.1 - uTime * 1.2);
    col += vec3(0.35, 0.58, 0.6) * rip * 0.16;
  }
  float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vCenter.z);
  col += vC * vEmit * pulse;
  float dist = length(vW - uEye);
  float cap = min(max(uFogAmt, 0.0), 0.38);
  float fog = 1.0 - exp(-dist * 0.0055);
  fog = clamp(fog, 0.0, cap);
  fog *= (1.0 - 0.82 * clamp(vEmit, 0.0, 1.0));
  o = vec4(softKnee(mix(col, uFog, fog)), cov);
}`;

// Boxes are most of the pixels. This twin has no raymarch and no fwidth,
// so a software rasterizer does not pay for those on the road and hedges.
const MESH_FS_BOX = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec3 vC; in vec3 vL;
flat in vec3 vCenter; flat in vec3 vHalf; flat in float vShape;
flat in float vRough; flat in float vEmit; flat in float vYaw;
flat in float vMetal; flat in float vSheen; flat in float vKind;
uniform vec3 uEye; uniform vec3 uFog; uniform float uFogAmt;
uniform vec3 uLight; uniform float uLightAmt; uniform vec3 uSkyAmb; uniform vec3 uSoil; uniform float uTime;
out vec4 o;
vec3 softKnee(vec3 c) {
  vec3 over = max(c - vec3(0.9), vec3(0.0));
  return min(max(c, vec3(0.0)), vec3(0.9)) + over / (vec3(1.0) + over * 10.0);
}
void main() {
  // A deck is one run of slabs. Darkening local Z put a black lip on
  // every join, and the post sharpen turned that lip into a seam.
  bool deck = vHalf.y < 0.12 && vHalf.x > 0.7;
  float edge = min(0.5 - abs(vL.x), 0.5 - abs(vL.y));
  if (!deck) edge = min(edge, 0.5 - abs(vL.z));
  // A wide deck tile is one face of a run. Bending by local position
  // put a separate highlight pillow on every slab.
  vec3 n = normalize(deck ? vN : vN + vL * smoothstep(0.16, 0.0, edge) * 0.85);
  vec3 L = normalize(uLight);
  float ndl = max(dot(n, L), 0.0);
  float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  float wrap = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  float rough = clamp(vRough, 0.0, 1.0);
  vec3 ambient = mix(vec3(0.46, 0.54, 0.68), uSkyAmb, 0.16);
  vec3 col = vC * (ambient + 0.18 * hemi + uLightAmt * ndl + 0.08 * wrap);
  col *= mix(vec3(0.82, 0.90, 1.06), vec3(1.08, 0.97, 0.84), clamp(ndl, 0.0, 1.0));
  // Grass and hedges are most of the pixels: skip the pows there.
  if (vEmit > 0.05 || rough < 0.72) {
    vec3 viewDir = normalize(uEye - vW);
    if (vEmit > 0.05) {
      float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2);
      col += vec3(1.0, 0.93, 0.82) * rim * (0.16 + vEmit * 0.22);
    }
    if (rough < 0.72) {
      float specPow = mix(48.0, 12.0, rough);
      float spec = pow(max(dot(n, normalize(L + viewDir)), 0.0), specPow);
      col += vec3(1.0, 0.96, 0.88) * spec * mix(0.42, 0.08, rough);
    }
  }
  if (!deck) col *= 0.76 + 0.24 * smoothstep(0.0, 0.16, edge);
  if (vHalf.y < 0.12 && vHalf.x < 1.2) col *= 1.0 - 0.22 * smoothstep(0.32, 0.48, abs(vL.x));
  if (vHalf.y < 0.1 && vHalf.x > 0.7 && rough > 0.4 && rough < 0.7 && vKind < 0.5) {
    float side = abs(vL.x);
    if (side > 0.39) {
      vec3 soilLit = uSoil * (0.55 + 0.45 * ndl + 0.2 * hemi);
      col = mix(col, soilLit, smoothstep(0.39, 0.44, side));
    } else if (side < 0.04 && abs(vL.z) < 0.22) {
      col = mix(col, vec3(0.99, 0.97, 0.86), 0.92);
    }
  }
  float under = smoothstep(-0.15, -0.48, vL.y);
  col *= 1.0 - 0.32 * under * (1.0 - vEmit);
  if (vKind > 0.5 && vKind < 1.5) {
    float rip = sin(vW.x * 5.4 + uTime * 1.6) * sin(vW.z * 4.1 - uTime * 1.2);
    col += vec3(0.35, 0.58, 0.6) * rip * 0.16;
  }
  float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vCenter.z);
  col += vC * vEmit * pulse;
  float dist = length(vW - uEye);
  float cap = min(max(uFogAmt, 0.0), 0.38);
  float fog = 1.0 - exp(-dist * 0.0055);
  fog = clamp(fog, 0.0, cap);
  fog *= (1.0 - 0.82 * clamp(vEmit, 0.0, 1.0));
  o = vec4(softKnee(mix(col, uFog, fog)), 1.0);
}`;

// Matte props (grass, hedges, trunks) are most of the pixels. They draw
// with this short shader so a closer camera does not pay the road's
// lighting, and so Medium and High do not run shadow taps on the lawn.
const MESH_FS_FAST = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec3 vC; in vec3 vL;
flat in vec3 vCenter; flat in vec3 vHalf; flat in float vShape;
flat in float vRough; flat in float vEmit; flat in float vYaw;
flat in float vMetal; flat in float vSheen; flat in float vKind;
uniform vec3 uEye; uniform vec3 uFog; uniform float uFogAmt;
out vec4 o;
void main() {
  float nd = clamp(vN.y * 0.45 + 0.55, 0.22, 1.0);
  vec3 col = vC * (0.72 + 0.36 * nd);
  col *= mix(vec3(0.86, 0.93, 1.04), vec3(1.06, 0.98, 0.86), nd);
  float dist = abs(vW.x - uEye.x) + abs(vW.z - uEye.z);
  float fog = min(dist * 0.0032, min(max(uFogAmt, 0.0), 0.22));
  o = vec4(mix(col, uFog, fog), 1.0);
}`;

// One pattern each, so a grass tile does not also run the wood and metal
// math. The road stays on MESH_FS_BOX. Kind selects the program.
function boxPat(line) {
  const withLine = MESH_FS_BOX.replace(
    "float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vCenter.z);",
    `${line}
  float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vCenter.z);`,
  );
  return withLine;
}
// Contact discs only. The discard stays out of the lawn and the road,
// so those passes can keep early depth rejection.
const MESH_FS_SHADOW = `#version 300 es
precision highp float;
in vec3 vL; in vec3 vW;
uniform vec3 uEye; uniform vec3 uFog;
out vec4 o;
void main() {
  float rr = length(vL.xz);
  if (rr > 0.46) discard;
  float feather = smoothstep(0.46, 0.12, rr);
  vec3 shade = mix(vec3(0.46, 0.40, 0.30), vec3(0.24, 0.20, 0.14), feather);
  float dist = abs(vW.x - uEye.x) + abs(vW.z - uEye.z);
  o = vec4(mix(shade, uFog, min(dist * 0.004, 0.28)), 1.0);
}`;

// Gates and thin coins. Eye depth is per fragment: a wide bar can cross
// the near plane while its centre is still metres away. An octagon cut
// turns the coin face into a disc. Other patterned boxes do not see this.
const MESH_FS_NEAR = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec3 vC; in vec3 vL;
flat in float vEmit; flat in float vKind;
out vec4 o;
void main() {
  bool disc = vKind < 6.0;
  if (disc) {
    vec2 face = abs(vL.xy);
    if (face.x + face.y > 0.707) discard;
  }
  float ndc = gl_FragCoord.z * 2.0 - 1.0;
  float eyeZ = 15.36 / max(96.08 - ndc * 95.92, 1e-4);
  if (eyeZ < 1.65) {
    float h = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    if (h < smoothstep(1.65, 0.2, eyeZ)) discard;
  }
  float nd = clamp(vN.y * 0.35 + 0.62, 0.35, 1.0);
  vec3 col = vC * (0.42 + 0.5 * nd + vEmit * 0.7);
  if (disc) col += vec3(1.0, 0.96, 0.72) * (1.0 - smoothstep(0.02, 0.12, abs(vL.y))) * 0.4;
  o = vec4(min(col, vec3(1.0)), 1.0);
}`;

const MESH_FS_BOX_PAT = boxPat(`if (vKind > 5.5 && vKind < 6.5) {
    float side = max(abs(vL.x), abs(vL.z));
    float face = smoothstep(0.32, 0.46, side);
    float row = abs(fract(vL.y * 6.0) - 0.5);
    float colu = abs(fract(vL.x * 3.0 + vL.z * 3.0) - 0.5);
    float pane = (1.0 - smoothstep(0.06, 0.2, row)) * (1.0 - smoothstep(0.07, 0.2, colu));
    float band = 1.0 - smoothstep(0.03, 0.11, row);
    float warm = step(0.5, fract(floor(vL.y * 6.0) * 0.37 + vCenter.x));
    vec3 glow = mix(vec3(0.42, 0.74, 1.0), vec3(1.0, 0.7, 0.3), warm);
    col += glow * face * max(pane, band * 0.45) * 0.72;
  } else if (vKind < 3.5) col *= 0.94 + 0.1 * fract(vL.y * 12.0);
  else if (vKind < 4.5) col *= 0.97 + 0.06 * fract(vL.x * 17.0 + vL.z * 11.0);
  else col += vec3(1.0, 0.97, 0.86) * (1.0 - step(0.07, abs(vL.y + 0.04))) * (0.18 + clamp(vSheen, 0.0, 1.0) * 0.22);`);

// Spheres and gems only. No raymarch, so a tree canopy does not carry the loop.
const MESH_FS_BALL = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vW; in vec3 vC; in vec3 vL;
flat in vec3 vCenter; flat in vec3 vHalf; flat in float vShape;
flat in float vRough; flat in float vEmit; flat in float vYaw;
flat in float vMetal; flat in float vSheen; flat in float vKind;
uniform vec3 uEye; uniform vec3 uFog; uniform float uFogAmt;
uniform vec3 uLight; uniform float uLightAmt; uniform vec3 uSkyAmb; uniform vec3 uSoil; uniform float uTime;
out vec4 o;
vec3 softKnee(vec3 c) {
  vec3 over = max(c - vec3(0.9), vec3(0.0));
  return min(max(c, vec3(0.0)), vec3(0.9)) + over / (vec3(1.0) + over * 10.0);
}
void main() {
  vec3 rd = normalize(vW - uEye);
  vec3 n;
  float cov;
  if (vShape < 1.5) {
    float r = min(min(vHalf.x, vHalf.y), vHalf.z);
    vec3 oc = uEye - vCenter;
    float b = dot(oc, rd);
    float h = b * b - (dot(oc, oc) - r * r);
    if (h < 0.0) discard;
    cov = 1.0;
    n = normalize(uEye + rd * (-b - sqrt(h)) - vCenter);
  } else {
    if (abs(vL.x) + abs(vL.y) + abs(vL.z) > 0.82) discard;
    cov = 1.0;
    n = normalize(vec3(sign(vL.x), sign(vL.y), sign(vL.z)) + 0.0001);
  }
  vec3 viewDir = normalize(uEye - vW);
  vec3 L = normalize(uLight);
  float ndl = max(dot(n, L), 0.0);
  float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  float wrap = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  float metal = clamp(vMetal, 0.0, 1.0);
  float sheen = clamp(vSheen, 0.0, 1.0);
  float rough = clamp(vRough, 0.0, 1.0);
  vec3 ambient = mix(vec3(0.46, 0.54, 0.68), uSkyAmb, 0.16);
  vec3 col = vC * (ambient + 0.18 * hemi + uLightAmt * ndl + 0.08 * wrap);
  col *= mix(vec3(0.82, 0.90, 1.06), vec3(1.08, 0.97, 0.84), clamp(ndl, 0.0, 1.0));
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2);
  col += vec3(1.0, 0.93, 0.82) * rim * (0.16 + vEmit * 0.22);
  float specPow = mix(48.0, 12.0, rough);
  float spec = pow(max(dot(n, normalize(L + viewDir)), 0.0), specPow);
  col += mix(vec3(1.0, 0.96, 0.88), vC, metal) * spec * mix(0.45, 0.06, rough) * (1.0 + sheen);
  float under = smoothstep(-0.15, -0.48, vL.y);
  col *= 1.0 - 0.32 * under * (1.0 - vEmit);
  // Coins are the only kind-5 gems. Leaves stay on kind 0 and skip this.
  if (vKind > 4.5 && vKind < 5.5) {
    vec3 eyeV = vCenter - uEye;
    if (dot(eyeV, eyeV) < 256.0) {
      float stripe = 1.0 - smoothstep(0.02, 0.11, abs(vL.y));
      col += vec3(1.0, 0.97, 0.82) * stripe * (0.22 + clamp(vSheen, 0.0, 1.0) * 0.4);
    }
  }
  float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vCenter.z);
  col += vC * vEmit * pulse;
  float dist = length(vW - uEye);
  float fog = clamp(1.0 - exp(-dist * 0.0055), 0.0, min(max(uFogAmt, 0.0), 0.38));
  fog *= (1.0 - 0.82 * clamp(vEmit, 0.0, 1.0));
  o = vec4(softKnee(mix(col, uFog, fog)), cov);
}`;

export function meshSources() {
  return [MESH_FS, MESH_FS_BOX, MESH_FS_BOX_PAT, MESH_FS_BALL];
}

export const SKY_KINDS = ["sun", "moon", "plane"];

// Which sky bodies to draw, and how strong the shader disc is.
// 0 hides the disc, 1 is the soft opening sun, 1.7 is a spoken sun.
export function visibleSky(props, sunHide) {
  const list = [];
  const raw = Array.isArray(props) ? props : [];
  for (const name of raw) {
    if (SKY_KINDS.includes(name) && !list.includes(name)) list.push(name);
    if (list.length >= 3) break;
  }
  const sun = list.includes("sun");
  return {
    sun,
    moon: list.includes("moon"),
    plane: list.includes("plane"),
    shader: sunHide && !sun ? 0 : sun ? 1.7 : 1,
  };
}

// World direction of the sky disc. sunUv lives in the yaw-shifted sky, so
// the screen ray includes psi and the road basis rotates by psi too. Those
// cancel: the key light stays on the same world ray as the disc while the
// road bends. Y stays a high garden key; uLightAmt carries intensity.
function sunAim(psi, fov, aspect, sunUv, pitch) {
  const span = Math.max(fov * Math.max(aspect, 0.3), 0.3);
  const hAng = ((sunUv && sunUv[0]) || 0.74) - 0.5;
  const ang = hAng * span + psi;
  const elev = pitch + (((sunUv && sunUv[1]) || 0.78) - 0.5) * fov;
  const ce = Math.cos(elev);
  const lx = Math.sin(psi) * Math.cos(ang) * ce - Math.cos(psi) * Math.sin(ang) * ce;
  const lz = Math.cos(psi) * Math.cos(ang) * ce + Math.sin(psi) * Math.sin(ang) * ce;
  const h = Math.hypot(lx, lz) || 1;
  return [lx / h * 0.48, 0.78, lz / h * 0.48];
}

export function createRenderer(canvas, hooks) {
  let gl;
  try {
    gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    powerPreference: "high-performance",
  });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  let sky, mesh, meshBox, meshFast, meshShadow, meshNear, meshPat, meshBall, tri, cubeBuf, inst, vao, u, um, ub, uFast, uShadow, uNear, up, uBall, castBuf, rimBuf;
  const rimData = new Float32Array(3 * STRIDE);
  const data = new Float32Array(MAX * STRIDE);
  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const CAST_MAX = 480;
  const castData = new Float32Array(CAST_MAX * STRIDE);
  function meshLocs(prog) {
    return {
      proj: gl.getUniformLocation(prog, "uProj"),
      view: gl.getUniformLocation(prog, "uView"),
      eye: gl.getUniformLocation(prog, "uEye"),
      fog: gl.getUniformLocation(prog, "uFog"),
      fogAmt: gl.getUniformLocation(prog, "uFogAmt"),
      light: gl.getUniformLocation(prog, "uLight"),
      lightAmt: gl.getUniformLocation(prog, "uLightAmt"),
      skyAmb: gl.getUniformLocation(prog, "uSkyAmb"),
      soil: gl.getUniformLocation(prog, "uSoil"),
      mtime: gl.getUniformLocation(prog, "uTime"),
      pat: gl.getUniformLocation(prog, "uPat"),
      shadowMap: gl.getUniformLocation(prog, "uShadowMap"),
      shadowMat: gl.getUniformLocation(prog, "uShadowMat"),
      shadowOn: gl.getUniformLocation(prog, "uShadowOn"),
      pcf: gl.getUniformLocation(prog, "uPcf"),
      penumbra: gl.getUniformLocation(prog, "uPenumbra"),
      aerial: gl.getUniformLocation(prog, "uAerial"),
      gloss: gl.getUniformLocation(prog, "uGloss"),
      ground: gl.getUniformLocation(prog, "uGround"),
      haze: gl.getUniformLocation(prog, "uHaze"),
    };
  }
  function bootGL() {
    sky = link(gl, SKY_VS, SKY_FS);
    mesh = link(gl, MESH_VS, MESH_FS);
    meshBox = link(gl, MESH_VS, MESH_FS_BOX);
    meshFast = link(gl, MESH_VS, MESH_FS_FAST);
    meshShadow = link(gl, MESH_VS, MESH_FS_SHADOW);
    meshNear = link(gl, MESH_VS, MESH_FS_NEAR);
    meshPat = link(gl, MESH_VS, MESH_FS_BOX_PAT);
    meshBall = link(gl, MESH_VS, MESH_FS_BALL);
    tri = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    cubeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, cube(), gl.STATIC_DRAW);
    inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, MAX * STRIDE * 4, gl.DYNAMIC_DRAW);
    castBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, castBuf);
    gl.bufferData(gl.ARRAY_BUFFER, CAST_MAX * STRIDE * 4, gl.DYNAMIC_DRAW);
    rimBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, rimBuf);
    gl.bufferData(gl.ARRAY_BUFFER, rimData.byteLength, gl.DYNAMIC_DRAW);
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(2 + i);
      gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(2 + i, 1);
    }
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    u = skyLocs(sky);
    um = meshLocs(mesh);
    ub = meshLocs(meshBox);
    uFast = meshLocs(meshFast);
    uShadow = meshLocs(meshShadow);
    uNear = meshLocs(meshNear);
    up = meshLocs(meshPat);
    uBall = meshLocs(meshBall);
  }
  const gpuInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpuName = gpuInfo
    ? `${gl.getParameter(gpuInfo.UNMASKED_VENDOR_WEBGL) || ""} ${gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) || ""}`
    : "";
  const software = softwareFromRenderer(gpuName);
  let dprCap = software ? 1 : 2;
  let dprDrops = 0;
  let dprCalm = 0;
  const msaa = gl.getParameter(gl.SAMPLES) || 0;
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0;
  let floatFb = false;
  try { floatFb = probeFloat(gl); } catch { floatFb = false; }
  const quality = createQuality(DEFAULT_POLICY, probeCaps({
    webgl2: true,
    maxTex,
    software,
    softwareKnown: !!gpuInfo,
    floatFb,
    fboOk: true,
    gpu: gpuName,
  }));
  let lost = false;
  let wantShadow = false;
  let casting = false;
  let usePost = false;
  let wasPost = false;
  let post = null;
  let litSkyProg = null;
  let litMesh = null;
  let litBox = null;
  let litPat = null;
  let litBall = null;
  let highSkyProg = null;
  let highMesh = null;
  let highBox = null;
  let highPat = null;
  let highBall = null;
  let depthProg = null;
  let uLitSky = null;
  let uHighSky = null;
  let ulm = null;
  let ulb = null;
  let ulp = null;
  let ulBall = null;
  let uhm = null;
  let uhb = null;
  let uhp = null;
  let uhBall = null;
  let depthLoc = null;
  let meshWarm = null;
  let postWarm = null;
  let warmFrames = 0;
  let highReady = false;
  let castN = 0;
  const lightProj = new Float32Array(16);
  const lightView = new Float32Array(16);
  const shadowMat = new Float32Array(16);
  let activeProfile = tierProfile("low", DEFAULT_POLICY, quality.caps);

  function skyLocs(prog) {
    return {
      sky0: gl.getUniformLocation(prog, "uSky0"),
      sky1: gl.getUniformLocation(prog, "uSky1"),
      hill: gl.getUniformLocation(prog, "uHill"),
      hill2: gl.getUniformLocation(prog, "uHill2"),
      sunCol: gl.getUniformLocation(prog, "uSunCol"),
      sun: gl.getUniformLocation(prog, "uSun"),
      res: gl.getUniformLocation(prog, "uRes"),
      time: gl.getUniformLocation(prog, "uTime"),
      camZ: gl.getUniformLocation(prog, "uCamZ"),
      yaw: gl.getUniformLocation(prog, "uYaw"),
      fov: gl.getUniformLocation(prog, "uFov"),
      sunAmt: gl.getUniformLocation(prog, "uSunAmt"),
      rush: gl.getUniformLocation(prog, "uRush"),
      stars: gl.getUniformLocation(prog, "uStars"),
      nebula: gl.getUniformLocation(prog, "uNebula"),
      flash: gl.getUniformLocation(prog, "uFlash"),
      skyAnim: gl.getUniformLocation(prog, "uSkyAnim"),
    };
  }
  let timerExt = null;
  try { timerExt = gl.getExtension("EXT_disjoint_timer_query_webgl2"); } catch { timerExt = null; }
  let gpuQuery = null;
  let gpuOpen = false;
  let gpuMs = -1;
  const gpuSamples = [];
  let lastWork = 0;
  function pollGpu() {
    if (!timerExt || !gpuQuery || gpuOpen) return;
    let available = false;
    try { available = !!gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT_AVAILABLE); }
    catch { return; }
    if (!available) return;
    let disjoint = false;
    try { disjoint = !!gl.getParameter(timerExt.GPU_DISJOINT_EXT); } catch { disjoint = true; }
    if (!disjoint) {
      const ns = gl.getQueryParameter(gpuQuery, gl.QUERY_RESULT);
      if (ns > 0) {
        gpuMs = ns / 1e6;
        gpuSamples.push(gpuMs);
        if (gpuSamples.length > 64) gpuSamples.shift();
      }
    }
    gl.deleteQuery(gpuQuery);
    gpuQuery = null;
  }
  function beginGpu() {
    const forced = typeof window !== "undefined" && window.__lumenGpuTimer;
    if ((software && !forced) || !timerExt || gpuQuery || gpuOpen) return;
    const q = gl.createQuery();
    if (!q) return;
    gpuQuery = q;
    gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
    gpuOpen = true;
  }
  function endGpu() {
    if (!gpuOpen) return;
    gpuOpen = false;
    try { gl.endQuery(timerExt.TIME_ELAPSED_EXT); } catch { /* context already gone */ }
  }
  const passQueries = [];
  const passMs = {};
  let spanOpen = false;
  let spanQuery = null;
  let spanName = "";
  function pollSpans() {
    if (!timerExt) return;
    let i = 0;
    while (i < passQueries.length) {
      const item = passQueries[i];
      let available = false;
      try { available = !!gl.getQueryParameter(item.q, gl.QUERY_RESULT_AVAILABLE); }
      catch { i++; continue; }
      if (!available) { i++; continue; }
      let disjoint = false;
      try { disjoint = !!gl.getParameter(timerExt.GPU_DISJOINT_EXT); } catch { disjoint = true; }
      if (!disjoint) {
        const ns = gl.getQueryParameter(item.q, gl.QUERY_RESULT);
        if (ns > 0) passMs[item.name] = ns / 1e6;
      }
      gl.deleteQuery(item.q);
      passQueries.splice(i, 1);
    }
  }
  function endSpan() {
    if (!spanOpen) return;
    spanOpen = false;
    try { gl.endQuery(timerExt.TIME_ELAPSED_EXT); } catch { /* already closed */ }
    if (spanQuery) passQueries.push({ q: spanQuery, name: spanName });
    spanQuery = null;
  }
  function beginSpan(name) {
    const forced = typeof window !== "undefined" && !!window.__lumenPassTimers;
    if (!timerExt || (software && !forced)) return;
    endSpan();
    const q = gl.createQuery();
    if (!q) return;
    spanQuery = q;
    spanName = name;
    gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
    spanOpen = true;
  }
  bootGL();

  function dropLit() {
    litSkyProg = litMesh = litBox = litPat = litBall = depthProg = null;
    highSkyProg = highMesh = highBox = highPat = highBall = null;
    uLitSky = ulm = ulb = ulp = ulBall = depthLoc = null;
    uHighSky = uhm = uhb = uhp = uhBall = null;
    highReady = false;
    meshWarm = null;
    postWarm = null;
    warmFrames = 0;
    if (post) {
      try { post.release(); } catch { /* context already gone */ }
      post = null;
    }
  }

  let linkBudget = 1;
  function kickWarm() {
    if (quality.mode === "low" || meshWarm) return;
    meshWarm = shaderCompiler(gl);
    const jobs = [
      ["litSky", SKY_VS, litSky(SKY_FS)],
      ["highSky", SKY_VS, highSky(SKY_FS)],
      ["litMesh", MESH_VS, litFragment(MESH_FS)],
      ["litBox", MESH_VS, litFragment(MESH_FS_BOX)],
      ["litPat", MESH_VS, litFragment(MESH_FS_BOX_PAT)],
      ["litBall", MESH_VS, litFragment(MESH_FS_BALL)],
      ["highMesh", MESH_VS, highFragment(MESH_FS)],
      ["highBox", MESH_VS, highFragment(MESH_FS_BOX)],
      ["highPat", MESH_VS, highFragment(MESH_FS_BOX_PAT)],
      ["highBall", MESH_VS, highFragment(MESH_FS_BALL)],
      ["depth", MESH_VS, DEPTH_FS],
    ];
    for (let i = 0; i < jobs.length; i++) meshWarm.add(jobs[i][0], jobs[i][1], jobs[i][2]);
    postWarm = shaderCompiler(gl);
    const names = Object.keys(POST_SOURCES);
    for (let i = 0; i < names.length; i++) {
      const pair = POST_SOURCES[names[i]];
      postWarm.add(names[i], pair[0], pair[1]);
    }
  }

  function pumpWarm() {
    warmFrames++;
    linkBudget = 1;
    if (meshWarm) meshWarm.poll();
    if (postWarm) {
      postWarm.linkedThisFrame = false;
      postWarm.patient = !!(postWarm.ext && warmFrames < 24);
      postWarm.poll();
    }
  }

  function takeMesh(name, vs, fs) {
    if (meshWarm) {
      meshWarm.add(name, vs, fs);
      const ready = meshWarm.program(name);
      if (ready) return ready;
      if (meshWarm.ext && warmFrames < 24) return null;
      // Without the parallel extension, linking every variant in one
      // frame is a multi-second stall on a scene change. One program
      // a frame, then the high path adopts them as they land.
      if (!meshWarm.ext) {
        if (linkBudget <= 0) return null;
        linkBudget -= 1;
      }
      const linked = meshWarm.linkNow(name);
      if (linked) return linked;
    }
    return link(gl, vs, fs);
  }

  function adoptLit() {
    litSkyProg = litSkyProg || takeMesh("litSky", SKY_VS, litSky(SKY_FS));
    litMesh = litMesh || takeMesh("litMesh", MESH_VS, litFragment(MESH_FS));
    litBox = litBox || takeMesh("litBox", MESH_VS, litFragment(MESH_FS_BOX));
    litPat = litPat || takeMesh("litPat", MESH_VS, litFragment(MESH_FS_BOX_PAT));
    litBall = litBall || takeMesh("litBall", MESH_VS, litFragment(MESH_FS_BALL));
    depthProg = depthProg || takeMesh("depth", MESH_VS, DEPTH_FS);
    if (!(litSkyProg && litMesh && litBox && litPat && litBall && depthProg)) return false;
    if (!uLitSky) {
      uLitSky = skyLocs(litSkyProg);
      ulm = meshLocs(litMesh);
      ulb = meshLocs(litBox);
      ulp = meshLocs(litPat);
      ulBall = meshLocs(litBall);
      depthLoc = {
        proj: gl.getUniformLocation(depthProg, "uProj"),
        view: gl.getUniformLocation(depthProg, "uView"),
      };
    }
    return true;
  }

  function adoptHigh() {
    if (highReady) return true;
    highSkyProg = highSkyProg || takeMesh("highSky", SKY_VS, highSky(SKY_FS));
    highMesh = highMesh || takeMesh("highMesh", MESH_VS, highFragment(MESH_FS));
    highBox = highBox || takeMesh("highBox", MESH_VS, highFragment(MESH_FS_BOX));
    highPat = highPat || takeMesh("highPat", MESH_VS, highFragment(MESH_FS_BOX_PAT));
    highBall = highBall || takeMesh("highBall", MESH_VS, highFragment(MESH_FS_BALL));
    if (!(highSkyProg && highMesh && highBox && highPat && highBall)) return false;
    if (!uHighSky) {
      uHighSky = skyLocs(highSkyProg);
      uhm = meshLocs(highMesh);
      uhb = meshLocs(highBox);
      uhp = meshLocs(highPat);
      uhBall = meshLocs(highBall);
    }
    highReady = true;
    return true;
  }

  function ensureLit() {
    if (litMesh && depthProg) return true;
    try {
      if (!adoptLit()) return false;
      return true;
    } catch (err) {
      dropLit();
      console.error(err);
      noteFbo(quality, false, performance.now());
      if (hooks && hooks.onStatus) hooks.onStatus({ type: "fallback", message: "Extra picture passes are off." });
      return false;
    }
  }

  function ensurePasses(profile) {
    if (!ensureLit()) return false;
    if (profile && profile.tier === "high") {
      try { adoptHigh(); } catch (err) { console.error(err); }
    }
    if (!post) {
      try { post = createPost(gl, postWarm); }
      catch (err) {
        post = null;
        if (err && String(err.message || err).includes("pending")) return false;
        return false;
      }
    }
    let ok = false;
    try { ok = post.ensure(w, h, profile); }
    catch { ok = false; }
    if (!ok || post.failed()) {
      noteFbo(quality, false, performance.now());
      return false;
    }
    return true;
  }

  function tell(kind, extra) {
    if (hooks && hooks.onStatus) hooks.onStatus(Object.assign({ type: kind }, extra || {}));
  }

  bindContextLoss(canvas, {
    onLost() {
      lost = true;
      tell("lost", { message: "The picture was interrupted. Bringing it back…" });
    },
    rebuild() {
      dropLit();
      bootGL();
      floatFb = false;
      try { floatFb = probeFloat(gl); } catch { floatFb = false; }
      quality.caps = probeCaps({
        webgl2: true,
        maxTex,
        software,
        softwareKnown: !!gpuInfo,
        floatFb,
        fboOk: true,
        gpu: gpuName,
      });
      if (quality.mode === "auto") setMode(quality, "auto", performance.now());
      else setMode(quality, quality.mode, performance.now());
    },
    onRestored() {
      lost = false;
      wasPost = false;
      tell("restored");
    },
    onFailed(plan) {
      lost = true;
      tell("failed", { message: plan.message || contextPlan("restore-failed").message });
    },
  });
  let w = 1;
  let h = 1;
  let camS = 0;
  let camLat = 0;
  let runS = 0;
  let shownS = 0;
  let shownAt = 0;
  let shownSeen = false;
  let blendFrom = null;
  let blendTo = null;
  let blendT = 1;
  let worldFlash = 0;
  // World pose at anchor.s. A jump in arc length moves this anchor instead
  // of rewinding the curve back to the opening heading.
  let anchor = { s: 0, x: 0, z: 0, psi: 0 };
  // Bend changes append a key at the runner. The path already run is kept.
  let roadKeys = [{ s: 0, bend: DEFAULT_BEND }];
  function sample(s, lateral) {
    return projectLateral(poseOnRoad(anchor, roadKeys, s), lateral);
  }
  function noteBend(s, bend) {
    const amp = clampBend(bend);
    const last = roadKeys[roadKeys.length - 1];
    if (Math.abs(last.bend - amp) < 0.002) return;
    const at = Math.max(0, s);
    if (roadKeys.length === 1 && at < 8) {
      last.bend = amp;
      return;
    }
    if (at <= last.s + 0.5) {
      last.bend = amp;
      return;
    }
    roadKeys.push({ s: at, bend: amp });
  }
  let camY = CAM_EYE_Y;
  // Eye height follows the road under the camera. Look height follows the
  // road ahead, so the view pitches by the hill itself. Flat ground keeps
  // both at 0, which is the old camera.
  let camFloor = 0;
  let camLook = 0;
  let camFloorSeen = false;
  let camFov = CAM_FOV;
  let camLatVel = 0;
  let shakeAmp = 0;
  let hitStop = 0;
  let whooshT = 1;
  let whooshSide = 0;
  let rimFlash = null;
  let heldHit = false;
  let keepT = 0;
  let backT = 0;
  let drawFov = CAM_FOV;
  let prevY = 0;
  let prevLx = 0;
  let lean = 0;
  let land = 0;
  let pulse = 0;
  let prevSpeed = 5;
  let prevG = 32;
  let reject = 0;
  // Low keeps the original 36 sparks and 12 puffs. Medium and High may
  // fill the extra slots; the low loops never walk them.
  const SPARK_BASE = 36;
  const SPARK_MAX = 64;
  const DUST_BASE = 12;
  const DUST_MAX = 32;
  const sparks = new Float32Array(SPARK_MAX * 8);
  const dust = new Float32Array(DUST_MAX * 8);
  const MOTE_MAX = 40;
  const motes = new Float32Array(MOTE_MAX * 8);
  const COIN_MAX = 12;
  const coinTrail = new Float32Array(COIN_MAX * 4);
  let prevSparkLim = SPARK_BASE;
  let prevDustLim = DUST_BASE;
  let dustStep = 0;

  function resize() {
    const dpr = resolutionScale(quality.tier, window.devicePixelRatio || 1, dprCap, quality.policy);
    w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    canvas.dataset.dpr = String(dpr);
  }

  // Same ring the page already keeps for the fps readout. Drop to 1x
  // only when the typical frame is late, not on one hitch. A quiet 1x
  // window may give 2x back once; a second drop stays down.
  function noteFrameTime(buf, count) {
    if (software || !buf) return;
    const n = Math.min(count | 0, buf.length);
    if (n < 120) return;
    const copy = [];
    for (let i = 0; i < n; i++) {
      const v = buf[i];
      if (v > 0.4 && v < 250) copy.push(v);
    }
    if (copy.length < 80) return;
    copy.sort((a, b) => a - b);
    const p50 = copy[Math.floor(0.5 * (copy.length - 1))];
    const p95 = copy[Math.min(copy.length - 1, Math.floor(0.95 * (copy.length - 1)))];
    if (dprCap > 1) {
      if (p50 > 18 && p95 > 22) {
        dprCap = 1;
        dprDrops++;
        dprCalm = 0;
      }
      return;
    }
    if (dprDrops >= 2) return;
    if (p95 < 8 && p50 < 6) dprCalm++;
    else dprCalm = 0;
    if (dprCalm >= 2) {
      dprCap = 2;
      dprCalm = 0;
    }
  }

  let n = 0;
  // Added to a push while an authored obstacle is drawn, so its mesh
  // sits on the local road. Flat pieces leave this at 0.
  let deckLift = 0;
  // Default yaw for a group (the runner, a companion). Explicit yaw wins.
  let spin = 0;
  function push(x, y, z, sx, sy, sz, shape, rgb, rough = 0.62, emit = 0, yaw = spin, metal = 0, sheen = 0, kind = 0) {
    if (n >= MAX) return;
    const o = n * STRIDE;
    data[o] = x; data[o + 1] = y + deckLift; data[o + 2] = z; data[o + 3] = shape;
    data[o + 4] = sx; data[o + 5] = sy; data[o + 6] = sz; data[o + 7] = rough;
    data[o + 8] = rgb[0]; data[o + 9] = rgb[1]; data[o + 10] = rgb[2]; data[o + 11] = emit;
    data[o + 12] = yaw; data[o + 13] = metal; data[o + 14] = sheen; data[o + 15] = kind;
    if (casting && castN < CAST_MAX && !(kind > 1.5 && kind < 2.5)) {
      const c = castN * STRIDE;
      for (let k = 0; k < STRIDE; k++) castData[c + k] = data[o + k];
      castN++;
    }
    n++;
  }

  // Round disc, same height falloff as the popper, a little smaller.
  // Kind 2 tells the box shader to cut the square into a circle. The road
  // slab tops out near y 0.08. Off the grass deck there is nothing to sit on.
  const DECK = 2.85;
  let shadeX = 0;
  let shadeZ = 0;
  function contactShadow(x, z, yaw, height, radius) {
    if (n >= MAX - 64) return;
    const dx = x - shadeX;
    const dz = z - shadeZ;
    if (dx * dx + dz * dz > 324) return;
    const s = Math.max(0.16, radius) * 0.78 / (1 + Math.max(0, height) * 0.55);
    push(x, 0.09, z, s, 0.012, s, 0, [0.34, 0.28, 0.2], 0.95, 0, yaw, 0, 0, 2);
  }

  function placeThing(thing, box, opts) {
    const drawn = drawThing(push, thing, box, opts || {});
    if (opts && opts.deck === false) return drawn;
    const grow = !opts || opts.grow === undefined ? 1 : opts.grow;
    const span = Math.max(box.w || 0, box.d || 0) * (grow || 0);
    contactShadow(box.x, box.z, box.psi || 0, box.y || 0, Math.min(0.72, Math.max(0.16, span * 0.34)));
    return drawn;
  }

  function sparkLimit() {
    if (!usePost) return SPARK_BASE;
    const n = activeProfile.spark | 0;
    if (n <= SPARK_BASE) return SPARK_BASE;
    return n > SPARK_MAX ? SPARK_MAX : n;
  }
  function dustLimit() {
    if (!usePost) return DUST_BASE;
    const n = activeProfile.dust | 0;
    if (n <= DUST_BASE) return DUST_BASE;
    return n > DUST_MAX ? DUST_MAX : n;
  }

  // tint 0 keeps the garden mix. 1 blossom, 2 apple, 3 star, 4 gem.
  function burst(x, y, z, rgb, count, lift, tint = 0, psi = 0) {
    const slots = sparkLimit();
    let left = count;
    if (usePost && slots > SPARK_BASE) {
      left = Math.min(slots, Math.max(count, Math.round(count * (slots / SPARK_BASE))));
    }
    for (let i = 0; i < slots && left > 0; i++) {
      const o = i * 8;
      if (sparks[o + 6] > 0) continue;
      const a = (i / 36) * Math.PI * 2;
      const dir = burstDir(psi, a);
      sparks[o] = x;
      sparks[o + 1] = y;
      sparks[o + 2] = z;
      sparks[o + 3] = dir.x;
      sparks[o + 4] = dir.z;
      sparks[o + 5] = lift;
      sparks[o + 6] = 0.55;
      sparks[o + 7] = i + tint * 100;
      left--;
    }
    void rgb;
  }

  // Puffs drift back along the tangent and a little to either side.
  function puffDust(x, y, z, psi, count, kick) {
    if (n >= MAX - 48) return;
    const ax = roadAxes(psi);
    const slots = dustLimit();
    let left = count;
    if (usePost && slots > DUST_BASE) {
      left = Math.min(slots, Math.max(count, Math.round(count * (slots / DUST_BASE))));
    }
    for (let i = 0; i < slots && left > 0; i++) {
      const o = i * 8;
      if (dust[o + 6] > 0) continue;
      const side = ((i % 5) - 2) * 0.22;
      const back = 0.45 + (i % 3) * 0.18;
      dust[o] = x + ax.rx * side * 0.15;
      dust[o + 1] = y;
      dust[o + 2] = z + ax.rz * side * 0.15;
      dust[o + 3] = -ax.tx * back + ax.rx * side;
      dust[o + 4] = kick;
      dust[o + 5] = -ax.tz * back + ax.rz * side;
      dust[o + 6] = 0.4;
      dust[o + 7] = i;
      left--;
    }
  }

  function shade(rgb, s) {
    return [Math.min(1, rgb[0] * s), Math.min(1, rgb[1] * s), Math.min(1, rgb[2] * s)];
  }

  function palRgb(pal) {
    const r = Number(pal.r);
    const g = Number(pal.g);
    const b = Number(pal.b);
    if (![r, g, b].every((n) => n >= 0 && n <= 1)) return [0.95, 0.72, 0.45];
    return [r, g, b];
  }

  function eyes(x, y, z) {
    const ink = [0.22, 0.16, 0.12];
    push(x - 0.07, y, z + 0.02, 0.07, 0.07, 0.05, 1, ink, 0.2, 0.15);
    push(x + 0.07, y, z + 0.02, 0.07, 0.07, 0.05, 1, ink, 0.2, 0.15);
  }

  function drawKitten(x, y, z, rgb) {
    push(x, y + 0.28, z, 0.46, 0.32, 0.58, 1, rgb, 0.35, 0.05);
    push(x, y + 0.56, z + 0.1, 0.34, 0.3, 0.32, 1, shade(rgb, 1.08), 0.25, 0.08);
    push(x - 0.11, y + 0.76, z + 0.1, 0.1, 0.16, 0.08, 0, shade(rgb, 0.85), 0.4, 0);
    push(x + 0.11, y + 0.76, z + 0.1, 0.1, 0.16, 0.08, 0, shade(rgb, 0.85), 0.4, 0);
    push(x, y + 0.32, z - 0.32, 0.1, 0.1, 0.22, 1, shade(rgb, 0.8), 0.4, 0);
    eyes(x, y + 0.58, z + 0.22);
  }

  const CAR_LOOKS = ["car", "van", "racer", "taxi", "wagon"];

  function axles(x, y, z, front, back, wide) {
    const wheel = [0.16, 0.14, 0.14];
    const w = wide || 0.28;
    push(x - w, y + 0.12, z + front, 0.22, 0.22, 0.22, 1, wheel, 0.55, 0);
    push(x + w, y + 0.12, z + front, 0.22, 0.22, 0.22, 1, wheel, 0.55, 0);
    push(x - w, y + 0.12, z + back, 0.22, 0.22, 0.22, 1, wheel, 0.55, 0);
    push(x + w, y + 0.12, z + back, 0.22, 0.22, 0.22, 1, wheel, 0.55, 0);
  }

  function lamps(x, y, z) {
    push(x - 0.16, y, z, 0.08, 0.08, 0.06, 1, [1, 0.95, 0.7], 0.2, 0.85);
    push(x + 0.16, y, z, 0.08, 0.08, 0.06, 1, [1, 0.95, 0.7], 0.2, 0.85);
  }

  function drawCar(x, y, z, rgb) {
    push(x, y + 0.28, z, 0.72, 0.28, 1.05, 0, rgb, 0.32, 0.06, spin, 0.62, 0.5, 5);
    push(x, y + 0.5, z - 0.02, 0.48, 0.26, 0.48, 0, shade(rgb, 1.12), 0.22, 0.1, spin, 0.28, 0.35, 5);
    axles(x, y, z, 0.32, -0.32);
    lamps(x, y + 0.3, z + 0.54);
  }

  function drawVan(x, y, z, rgb) {
    const glass = [0.78, 0.9, 0.98];
    push(x, y + 0.42, z, 0.78, 0.52, 1.2, 0, rgb, 0.34, 0.05, spin, 0.58, 0.46, 5);
    push(x, y + 0.58, z + 0.12, 0.62, 0.28, 0.46, 0, glass, 0.15, 0.12);
    axles(x, y, z, 0.38, -0.38, 0.32);
    lamps(x, y + 0.28, z + 0.62);
  }

  function drawRacer(x, y, z, rgb) {
    push(x, y + 0.2, z, 0.66, 0.16, 1.4, 0, rgb, 0.28, 0.08, spin, 0.7, 0.55, 5);
    push(x, y + 0.34, z - 0.05, 0.36, 0.16, 0.42, 0, shade(rgb, 1.08), 0.2, 0.1);
    push(x, y + 0.36, z - 0.58, 0.5, 0.08, 0.12, 0, shade(rgb, 0.75), 0.3, 0.05);
    axles(x, y, z, 0.42, -0.42);
    lamps(x, y + 0.2, z + 0.7);
  }

  function drawTaxi(x, y, z, rgb) {
    drawCar(x, y, z, rgb);
    push(x, y + 0.7, z, 0.22, 0.1, 0.16, 0, [0.98, 0.9, 0.35], 0.25, 0.45);
  }

  function drawWagon(x, y, z, rgb) {
    push(x, y + 0.32, z + 0.08, 0.8, 0.36, 0.9, 1, rgb, 0.32, 0.06, spin, 0.55, 0.42, 5);
    push(x, y + 0.34, z - 0.48, 0.62, 0.32, 0.4, 0, shade(rgb, 0.86), 0.34, 0.04);
    push(x, y + 0.52, z + 0.1, 0.5, 0.22, 0.4, 0, shade(rgb, 1.1), 0.2, 0.08);
    axles(x, y, z, 0.28, -0.46, 0.3);
    lamps(x, y + 0.32, z + 0.52);
  }

  // A car keeps its colour and steps through the fleet. Reduced motion
  // stays on the body it arrived with.
  function carLook(plan, t, i, reduced) {
    const home = CAR_LOOKS.indexOf(plan);
    if (home < 0) return plan;
    if (reduced) return CAR_LOOKS[home];
    const step = Math.floor((t || 0) / 3.2 + i * 0.7);
    return CAR_LOOKS[(home + step) % CAR_LOOKS.length];
  }

  function drawBunny(x, y, z, rgb) {
    push(x, y + 0.3, z, 0.42, 0.36, 0.48, 1, rgb, 0.3, 0.05);
    push(x, y + 0.58, z + 0.08, 0.32, 0.28, 0.3, 1, shade(rgb, 1.05), 0.25, 0.06);
    push(x - 0.08, y + 0.86, z + 0.06, 0.08, 0.28, 0.08, 0, shade(rgb, 0.9), 0.35, 0);
    push(x + 0.08, y + 0.86, z + 0.06, 0.08, 0.28, 0.08, 0, shade(rgb, 0.9), 0.35, 0);
    push(x, y + 0.34, z - 0.26, 0.12, 0.12, 0.12, 1, [0.98, 0.96, 0.92], 0.3, 0.1);
    eyes(x, y + 0.6, z + 0.2);
  }

  function drawBird(x, y, z, rgb, t, reduced) {
    const flap = reduced ? 0.12 : 0.12 + Math.abs(Math.sin(t * 9)) * 0.16;
    push(x, y + 0.42, z, 0.32, 0.26, 0.4, 1, rgb, 0.3, 0.08);
    push(x, y + 0.58, z + 0.16, 0.2, 0.18, 0.2, 1, shade(rgb, 1.05), 0.25, 0.1);
    push(x, y + 0.56, z + 0.28, 0.1, 0.08, 0.14, 0, [0.95, 0.62, 0.28], 0.3, 0.05);
    push(x - 0.22, y + 0.46 + flap, z, 0.28, 0.06, 0.18, 0, shade(rgb, 0.85), 0.35, 0.05);
    push(x + 0.22, y + 0.46 + flap, z, 0.28, 0.06, 0.18, 0, shade(rgb, 0.85), 0.35, 0.05);
    eyes(x, y + 0.62, z + 0.22);
  }

  function drawButterfly(x, y, z, rgb, t, reduced) {
    const wing = reduced ? 0.22 : 0.18 + Math.abs(Math.sin(t * 8)) * 0.12;
    push(x, y + 0.46, z, 0.08, 0.08, 0.28, 1, shade(rgb, 0.75), 0.3, 0.1);
    push(x - 0.18, y + 0.5, z, wing, 0.28, 0.2, 0, rgb, 0.25, 0.2);
    push(x + 0.18, y + 0.5, z, wing, 0.28, 0.2, 0, shade(rgb, 1.1), 0.25, 0.2);
  }

  function drawFrog(x, y, z, rgb) {
    push(x, y + 0.22, z, 0.5, 0.26, 0.46, 1, rgb, 0.35, 0.05);
    push(x - 0.12, y + 0.4, z + 0.1, 0.14, 0.14, 0.14, 1, shade(rgb, 1.1), 0.25, 0.1);
    push(x + 0.12, y + 0.4, z + 0.1, 0.14, 0.14, 0.14, 1, shade(rgb, 1.1), 0.25, 0.1);
    eyes(x, y + 0.44, z + 0.16);
  }

  function drawDuck(x, y, z, rgb) {
    push(x, y + 0.28, z, 0.42, 0.3, 0.52, 1, rgb, 0.3, 0.06);
    push(x, y + 0.5, z + 0.16, 0.26, 0.22, 0.24, 1, shade(rgb, 1.05), 0.25, 0.08);
    push(x, y + 0.48, z + 0.3, 0.14, 0.08, 0.16, 0, [0.98, 0.62, 0.22], 0.3, 0.05);
    push(x - 0.08, y + 0.08, z + 0.08, 0.12, 0.06, 0.16, 0, [0.98, 0.62, 0.22], 0.4, 0);
    push(x + 0.08, y + 0.08, z + 0.08, 0.12, 0.06, 0.16, 0, [0.98, 0.62, 0.22], 0.4, 0);
    eyes(x, y + 0.54, z + 0.24);
  }

  function drawPuppy(x, y, z, rgb) {
    push(x, y + 0.26, z, 0.52, 0.3, 0.64, 1, rgb, 0.35, 0.05);
    push(x, y + 0.5, z + 0.22, 0.34, 0.28, 0.32, 1, shade(rgb, 1.06), 0.25, 0.08);
    push(x - 0.12, y + 0.7, z + 0.16, 0.14, 0.2, 0.08, 0, shade(rgb, 0.78), 0.4, 0);
    push(x + 0.12, y + 0.7, z + 0.16, 0.14, 0.2, 0.08, 0, shade(rgb, 0.78), 0.4, 0);
    push(x, y + 0.46, z + 0.38, 0.12, 0.08, 0.12, 1, [0.98, 0.72, 0.64], 0.3, 0.06);
    push(x, y + 0.32, z - 0.4, 0.16, 0.16, 0.22, 1, shade(rgb, 0.72), 0.4, 0);
    eyes(x, y + 0.54, z + 0.34);
  }

  function drawFox(x, y, z, rgb) {
    const chest = [0.98, 0.94, 0.88];
    push(x, y + 0.3, z, 0.34, 0.26, 0.56, 1, rgb, 0.32, 0.06);
    push(x, y + 0.32, z + 0.06, 0.2, 0.14, 0.22, 1, chest, 0.3, 0.05);
    push(x, y + 0.54, z + 0.2, 0.26, 0.22, 0.26, 1, rgb, 0.28, 0.08);
    push(x - 0.08, y + 0.76, z + 0.18, 0.08, 0.18, 0.06, 0, shade(rgb, 0.8), 0.35, 0);
    push(x + 0.08, y + 0.76, z + 0.18, 0.08, 0.18, 0.06, 0, shade(rgb, 0.8), 0.35, 0);
    push(x, y + 0.4, z - 0.42, 0.24, 0.22, 0.3, 1, shade(rgb, 1.08), 0.3, 0.05);
    eyes(x, y + 0.58, z + 0.3);
  }

  function drawTurtle(x, y, z, rgb) {
    push(x, y + 0.12, z, 0.5, 0.12, 0.56, 1, [0.9, 0.74, 0.48], 0.4, 0.05);
    push(x, y + 0.32, z, 0.48, 0.24, 0.52, 1, shade(rgb, 0.7), 0.45, 0.08);
    push(x, y + 0.44, z, 0.24, 0.08, 0.26, 1, [0.72, 0.9, 0.48], 0.35, 0.12);
    push(x, y + 0.22, z + 0.38, 0.2, 0.16, 0.2, 1, shade(rgb, 1.15), 0.3, 0.08);
    eyes(x, y + 0.28, z + 0.46);
  }

  function drawBee(x, y, z, rgb, t, reduced) {
    const wing = reduced ? 0.16 : 0.1 + Math.abs(Math.sin((t || 0) * 14)) * 0.1;
    push(x, y + 0.4, z, 0.26, 0.22, 0.38, 1, rgb, 0.3, 0.12);
    push(x, y + 0.4, z, 0.28, 0.08, 0.1, 0, [0.22, 0.16, 0.12], 0.4, 0.05);
    push(x - 0.16, y + 0.54, z, wing, 0.06, 0.18, 0, [0.86, 0.93, 1], 0.15, 0.3);
    push(x + 0.16, y + 0.54, z, wing, 0.06, 0.18, 0, [0.86, 0.93, 1], 0.15, 0.3);
    eyes(x, y + 0.46, z + 0.16);
  }

  function drawPenguin(x, y, z, rgb) {
    const belly = [0.96, 0.97, 1];
    const orange = [0.98, 0.62, 0.2];
    push(x, y + 0.34, z, 0.42, 0.54, 0.4, 1, rgb, 0.3, 0.04);
    push(x, y + 0.32, z + 0.08, 0.3, 0.42, 0.3, 1, belly, 0.28, 0.06);
    push(x, y + 0.72, z + 0.04, 0.3, 0.28, 0.3, 1, shade(rgb, 1.04), 0.26, 0.08);
    push(x - 0.24, y + 0.38, z, 0.08, 0.34, 0.18, 0, shade(rgb, 0.82), 0.4, 0.02);
    push(x + 0.24, y + 0.38, z, 0.08, 0.34, 0.18, 0, shade(rgb, 0.82), 0.4, 0.02);
    push(x - 0.1, y + 0.06, z + 0.1, 0.16, 0.06, 0.22, 0, orange, 0.35, 0.02);
    push(x + 0.1, y + 0.06, z + 0.1, 0.16, 0.06, 0.22, 0, orange, 0.35, 0.02);
    push(x, y + 0.68, z + 0.3, 0.1, 0.08, 0.16, 3, orange, 0.3, 0.05);
    eyes(x, y + 0.74, z + 0.28);
  }

  function drawPanda(x, y, z, rgb) {
    const white = [0.97, 0.96, 0.93];
    const ink = [0.12, 0.11, 0.12];
    push(x, y + 0.32, z, 0.48, 0.44, 0.42, 1, white, 0.35, 0.03);
    push(x, y + 0.62, z + 0.08, 0.4, 0.34, 0.36, 1, white, 0.3, 0.06);
    push(x - 0.17, y + 0.84, z + 0.06, 0.14, 0.14, 0.1, 1, ink, 0.4, 0);
    push(x + 0.17, y + 0.84, z + 0.06, 0.14, 0.14, 0.1, 1, ink, 0.4, 0);
    push(x - 0.1, y + 0.7, z + 0.26, 0.11, 0.12, 0.06, 1, ink, 0.3, 0.02);
    push(x + 0.1, y + 0.7, z + 0.26, 0.11, 0.12, 0.06, 1, ink, 0.3, 0.02);
    push(x - 0.24, y + 0.35, z + 0.02, 0.12, 0.3, 0.14, 0, ink, 0.4, 0);
    push(x + 0.24, y + 0.35, z + 0.02, 0.12, 0.3, 0.14, 0, ink, 0.4, 0);
    push(x - 0.16, y + 0.08, z + 0.06, 0.16, 0.12, 0.22, 0, ink, 0.4, 0);
    push(x + 0.16, y + 0.08, z + 0.06, 0.16, 0.12, 0.22, 0, ink, 0.4, 0);
    push(x - 0.1, y + 0.72, z + 0.31, 0.035, 0.05, 0.03, 1, [1, 1, 1], 0.2, 0.1);
    push(x + 0.1, y + 0.72, z + 0.31, 0.035, 0.05, 0.03, 1, [1, 1, 1], 0.2, 0.1);
  }

  function drawDragon(x, y, z, rgb) {
    const wing = shade(rgb, 1.12);
    const belly = mix3(rgb, [1, 0.94, 0.78], 0.55);
    const horn = [0.98, 0.9, 0.66];
    push(x, y + 0.36, z, 0.54, 0.36, 0.64, 1, rgb, 0.32, 0.05);
    push(x, y + 0.42, z + 0.12, 0.34, 0.2, 0.4, 1, belly, 0.3, 0.05);
    push(x, y + 0.62, z + 0.34, 0.34, 0.3, 0.32, 1, rgb, 0.28, 0.08);
    push(x, y + 0.58, z + 0.52, 0.2, 0.14, 0.22, 0, belly, 0.3, 0.05);
    push(x - 0.12, y + 0.84, z + 0.3, 0.08, 0.24, 0.08, 3, horn, 0.25, 0.3);
    push(x + 0.12, y + 0.84, z + 0.3, 0.08, 0.24, 0.08, 3, horn, 0.25, 0.3);
    push(x - 0.42, y + 0.6, z - 0.06, 0.5, 0.06, 0.42, 0, wing, 0.4, 0.04);
    push(x + 0.42, y + 0.6, z - 0.06, 0.5, 0.06, 0.42, 0, wing, 0.4, 0.04);
    push(x - 0.24, y + 0.34, z - 0.18, 0.38, 0.1, 0.3, 0, shade(rgb, 0.82), 0.4, 0.02);
    push(x + 0.24, y + 0.34, z - 0.18, 0.38, 0.1, 0.3, 0, shade(rgb, 0.82), 0.4, 0.02);
    push(x, y + 0.22, z - 0.4, 0.16, 0.16, 0.3, 0, shade(rgb, 0.8), 0.4, 0.02);
    push(x, y + 0.46, z - 0.3, 0.12, 0.12, 0.12, 3, horn, 0.3, 0.2);
    eyes(x, y + 0.66, z + 0.5);
  }

  function drawFriend(x, y, z, rgb) {
    push(x, y + 0.36, z, 0.4, 0.4, 0.4, 1, rgb, 0.28, 0.08);
    push(x, y + 0.66, z + 0.04, 0.28, 0.26, 0.26, 1, shade(rgb, 1.12), 0.22, 0.12);
    push(x, y + 0.84, z, 0.06, 0.14, 0.06, 0, shade(rgb, 1.2), 0.3, 0.2);
    eyes(x, y + 0.68, z + 0.14);
  }

  function drawBody(plan, x, y, z, rgb, t, reduced) {
    if (plan === "kitten") drawKitten(x, y, z, rgb);
    else if (plan === "car") drawCar(x, y, z, rgb);
    else if (plan === "van") drawVan(x, y, z, rgb);
    else if (plan === "racer") drawRacer(x, y, z, rgb);
    else if (plan === "taxi") drawTaxi(x, y, z, rgb);
    else if (plan === "wagon") drawWagon(x, y, z, rgb);
    else if (plan === "bunny") drawBunny(x, y, z, rgb);
    else if (plan === "bird") drawBird(x, y, z, rgb, t, reduced);
    else if (plan === "butterfly") drawButterfly(x, y, z, rgb, t, reduced);
    else if (plan === "frog") drawFrog(x, y, z, rgb);
    else if (plan === "duck") drawDuck(x, y, z, rgb);
    else if (plan === "puppy") drawPuppy(x, y, z, rgb);
    else if (plan === "fox") drawFox(x, y, z, rgb);
    else if (plan === "turtle") drawTurtle(x, y, z, rgb);
    else if (plan === "bee") drawBee(x, y, z, rgb, t, reduced);
    else if (plan === "penguin") drawPenguin(x, y, z, rgb);
    else if (plan === "panda") drawPanda(x, y, z, rgb);
    else if (plan === "dragon") drawDragon(x, y, z, rgb);
    else drawFriend(x, y, z, rgb);
  }

  function drawPals(list, pz, t, reduced) {
    if (!Array.isArray(list)) return;
    const nPals = Math.min(6, list.length);
    const looks = [];
    for (let i = 0; i < nPals; i++) {
      const pal = list[i];
      const side = i % 2 === 0 ? 1 : -1;
      const file = i % 3;
      const motion = pal.motion || "pace";
      let hop = 0;
      let ahead = 0;
      if (motion === "float") hop = reduced ? 0.85 : 0.78 + Math.sin(t * 2.2 + i) * 0.22;
      else if (motion === "cheer") hop = reduced ? 0.35 : 0.25 + Math.abs(Math.sin(t * 7 + i)) * 0.72;
      else if (!reduced && motion === "hop") hop = Math.abs(Math.sin(t * 6 + i)) * 0.55;
      else if (!reduced && motion === "follow") hop = Math.abs(Math.sin(t * 5 + i)) * 0.16;
      else if (!reduced) hop = Math.abs(Math.sin(t * 4 + i)) * 0.08;
      if (motion === "pace-ahead") ahead = 3.1;
      const weave = !reduced && (motion === "side" || motion === "cheer")
        ? Math.sin(t * 1.4 + i) * (motion === "cheer" ? 0.22 : 0.4)
        : 0;
      // Beside the lanes, spread along the road so six friends read as a crowd.
      // near tucks in but stays outside the body, so the picture never becomes a hit.
      const baseLat = motion === "near" ? 2.12 : 2.25;
      const lat = -(side * (baseLat + file * 0.22) + weave);
      const z = pz - 0.8 + ahead + i * 1.45 + (reduced ? 0 : Math.sin(t * 0.8 + i) * 0.25);
      const at = sample(z, lat);
      spin = at.psi;
      const plan = pal.plan || pal.kind;
      const look = carLook(plan, t, i, reduced);
      const blob = CAR_LOOKS.includes(look) ? 0.62 : 0.38;
      if (Math.abs(lat) <= DECK + 1.2) contactShadow(at.x, at.z, at.psi, hop, blob);
      looks.push(look);
      drawBody(look, at.x, hop, at.z, palRgb(pal), t, reduced);
      spin = 0;
    }
    // Names the body each friend is wearing, so a probe can see a car change.
    canvas.dataset.fleet = looks.join(",");
  }

  // Cloth, clasp, and circlet in the road frame. Negative ds trails
  // behind the runner, toward the camera. spot() is the only placement.
  function drawGear(spot, py, leanLat, sliding, t, reduced, gear, wardAmt, pal, stride, cloak) {
    const rose = [0.86, 0.28, 0.32];
    const gold = pal.cape;
    const segs = reduced ? 2 : 3;
    const neckY = py + (sliding ? 0.42 : 0.74);
    const sway = reduced ? 0 : Math.sin(t * 2.4) * 0.04 + stride * 0.02;
    // The cloak, clasp, and circlet belong to the light-keeper.
    // An animal or a vehicle keeps the shield beads and the speed trail.
    if (cloak !== false) {
      for (let i = 0; i < segs; i++) {
        const tip = reduced ? 0 : Math.sin(t * 2.4 + 0.5) * 0.02 * i;
        const at = spot(-0.18 - i * 0.14, leanLat * 0.2 + sway + tip);
        const cloth = i === 0 ? gold : rose;
        const tall = Math.max(0.16, (sliding ? 0.22 : 0.42) - i * 0.05);
        push(at.x, neckY - 0.04 - i * 0.05, at.z, 0.46 - i * 0.08, tall, 0.14, 0, cloth, 0.48, i === 0 ? 0.18 : 0.05);
      }
      if (gear >= 2) {
        const clasp = spot(-0.2, leanLat + sway);
        push(clasp.x, neckY + 0.12, clasp.z, 0.14, 0.14, 0.1, 1, gold, 0.16, 0.95);
      }
      if (gear >= 3 && !sliding) {
        const hy = py + 1.08;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const at = spot(-0.08 + Math.sin(a) * 0.04, leanLat + Math.cos(a) * 0.28);
          push(at.x, hy, at.z, 0.07, 0.045, 0.07, 0, gold, 0.18, 0.75);
        }
      }
    }
    const beads = Math.max(0, Math.min(5, Math.round((Number(wardAmt) || 0) * 5)));
    if (beads > 0) {
      const blue = [0.72, 0.9, 1];
      for (let i = 0; i < beads; i++) {
        const a = (i / 5) * Math.PI * 2 + (reduced ? 0 : t * 0.6);
        const at = spot(Math.sin(a) * 0.28, leanLat + Math.cos(a) * 0.42);
        push(at.x, py + 0.62, at.z, 0.11, 0.11, 0.11, 0, blue, 0.12, 0.85);
      }
    }
  }

  function sproutOf(q, pz) {
    if (!q.born) return 1;
    const dist = q[1] - pz;
    if (dist <= 9) return 1;
    if (dist >= 24) return 0.18;
    const t = (24 - dist) / 15;
    return 0.18 + 0.82 * (t * t * (3 - 2 * t));
  }

  function flyPlus(nx, ny) {
    if (typeof document === "undefined") return;
    const score = document.getElementById("score");
    if (!score || !document.body) return;
    const rect = canvas.getBoundingClientRect();
    const sr = score.getBoundingClientRect();
    const el = document.createElement("span");
    el.className = "plus-one";
    el.textContent = "+1";
    const x = rect.left + nx * rect.width;
    const y = rect.top + (1 - ny) * rect.height;
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.setProperty("--dx", ((sr.left + sr.width * 0.35) - x).toFixed(1) + "px");
    el.style.setProperty("--dy", ((sr.top + sr.height * 0.45) - y).toFixed(1) + "px");
    document.body.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 720);
  }

  function frame(st) {
    const t0 = performance.now();
    if (lost || (gl.isContextLost && gl.isContextLost())) {
      lost = true;
      return 0;
    }
    try {
    pollGpu();
    pollSpans();
    const splitPass = typeof window !== "undefined" && !!window.__lumenPassTimers && quality.tier === "high" && !!timerExt;
    if (!splitPass) beginGpu();
    if (quality.mode !== "low") kickWarm();
    pumpWarm();
    const pace = typeof window !== "undefined" ? Number(window.__lumenPace) : 0;
    const arrived = dressPalette(
      palette(st.hue || 0, st.scene),
      st.biome,
      st.mood,
      st.spec,
      { body: st.skybody, uv: st.sunuv, shift: st.propshift },
    );
    const px = st.lx || 0;
    const py = st.y || 0;
    const pz = Number.isFinite(st.x) ? st.x : runS;
    const speed = pace > 0 ? pace : (st.speed || 5);
    const grav = st.g || 32;
    const alive = st.alive !== false;
    const bend = Number.isFinite(st.bend) ? st.bend : DEFAULT_BEND;
    const nowMs = Number.isFinite(st.now) ? st.now : 0;
    const frameDt = shownAt > 0 ? Math.min(0.05, Math.max(0.001, (nowMs - shownAt) / 1000)) : 1 / 60;
    if (nowMs > 0) shownAt = nowMs;
    const arrivedId = paletteId(arrived);
    if (!blendTo) {
      blendTo = arrived;
      blendT = 1;
    } else if (arrivedId !== paletteId(blendTo)) {
      blendFrom = blendT < 1 && blendFrom ? mixPalette(blendFrom, blendTo, blendT * blendT * (3 - 2 * blendT)) : blendTo;
      blendTo = arrived;
      blendT = 0;
      worldFlash = 1;
    }
    if (st.reduced) {
      blendT = 1;
      worldFlash = 0;
      blendFrom = null;
    } else if (blendT < 1) {
      blendT = Math.min(1, blendT + frameDt / WORLD_BLEND_S);
      if (blendT >= 1) blendFrom = null;
    }
    if (worldFlash > 0) worldFlash = Math.max(0, worldFlash - frameDt / 0.45);
    const blendU = blendT * blendT * (3 - 2 * blendT);
    let pal = blendFrom && blendT < 1 ? mixPalette(blendFrom, blendTo, blendU) : blendTo;
    if (!shownSeen) {
      shownS = pz;
      shownSeen = true;
    }
    // A gap recovery jumps s by the hole. Glide the drawn arc so the
    // runner and the camera stay on the road already in view. A much
    // larger correction keeps the world pose instead of rewinding.
    const glide = glideS(shownS, pz, speed, frameDt);
    if (glide.rebase) {
      const kept = rebaseAnchor(anchor, roadKeys, shownS, glide.s, bend);
      anchor = kept.anchor;
      roadKeys = kept.keys;
      shownS = glide.s;
      camS = shownS;
      camLat = px;
      camLatVel = 0;
    } else {
      shownS = glide.s;
      noteBend(shownS, bend);
    }
    // Drop the keys behind the camera window so a long run does not pay for
    // the whole road history on every sample. 16 m covers the farthest-back
    // sample (pz - 8) with margin; the fold keeps the world pose exact.
    {
      const trimmed = trimRoadKeys(anchor, roadKeys, shownS - 16);
      anchor = trimmed.anchor;
      roadKeys = trimmed.keys;
    }
    runS = shownS;
    const drawS = shownS;
    const feet = sample(drawS, px);
    const rx = feet.x;
    const rz = feet.z;
    shadeX = rx;
    shadeZ = rz;
    const reduced = !!st.reduced;
    if (Math.abs(speed - prevSpeed) > 0.05 || Math.abs(grav - prevG) > 0.05) pulse = 1;
    prevSpeed = speed;
    prevG = grav;
    const roadPieces = st.pieces;
    const floorDraw = roadHeight(drawS, roadPieces);
    const rel = py - floorDraw;
    const justLanded = rel <= 0.02 && prevY > 0.18;
    if (justLanded) land = 1;
    prevY = rel;
    const lxDelta = px - prevLx;
    prevLx = px;
    lean += ((reduced ? 0 : -lxDelta * 6) - lean) * (reduced ? 1 : 0.2);
    land = Math.max(0, land - (reduced ? 1 : 0.08));
    pulse = Math.max(0, pulse - (reduced ? 1 : 0.015));
    if (st.reject) reject = 1;
    reject = Math.max(0, reject - 0.01);
    activeProfile = tierProfile(quality.tier, quality.policy, quality.caps);
    usePost = false;
    wantShadow = false;
    if (activeProfile.tier !== "low" && w > 2 && h > 2) {
      if (ensurePasses(activeProfile)) {
        usePost = true;
        wantShadow = !!(activeProfile.shadow && post && post.shadowFb());
      } else {
        activeProfile = tierProfile(quality.tier, quality.policy, quality.caps);
      }
    }
    const gpuFeel = usePost && !reduced;
    const followL = reduced ? 1 : 0.12;
    const followS = reduced ? 1 : 0.18;
    if (gpuFeel) {
      const eased = laneEase(camLat, camLatVel, px, frameDt, activeProfile.tier);
      camLat = eased.lat;
      camLatVel = eased.vel;
      const struck = (st.stumble || 0) > 0.92;
      if (st.near || (struck && !heldHit)) {
        shakeAmp = Math.max(shakeAmp, activeProfile.shake || 0);
        hitStop = 0.07;
        if (activeProfile.tier === "high" && (st.near || st.nearCue)) {
          const cue = st.nearCue;
          const lane = px < -0.9 ? 0 : px > 0.9 ? 2 : 1;
          let side = cue && Number.isFinite(cue.side) ? cue.side : 0;
          let mark = null;
          const list = st.pieces;
          if (!cue && list) {
            for (let i = 0; i < list.length; i++) {
              const q = list[i];
              if (!skimmed(pz, py, lane, q)) continue;
              const pl = q.length > 5 ? q[5] : lane;
              side = (pl >= 0 ? pl : lane) - lane;
              mark = q;
              break;
            }
          }
          whooshT = 0;
          whooshSide = side;
          if (mark) {
            const mid = mark[1] + mark[2] * 0.5;
            const at = sample(mid, laneX(mark.length > 5 && mark[5] >= 0 ? mark[5] : lane));
            rimFlash = { x: at.x, y: 0.7, z: at.z, psi: at.psi, life: 0.22, side };
          } else if (cue) {
            const at = sample(pz + (Number(cue.ahead) || 1.4), px + side * 1.8);
            rimFlash = { x: at.x, y: 0.7, z: at.z, psi: at.psi, life: 0.22, side };
          }
        }
      }
      heldHit = struck;
      if (st.evo === "keep") keepT = 1;
      if (st.evo === "rollback") backT = 1;
    } else {
      camLat += (px - camLat) * followL;
      camLatVel = 0;
      shakeAmp = 0;
      hitStop = 0;
      whooshT = 1;
      rimFlash = null;
      heldHit = false;
      keepT = 0;
      backT = 0;
    }
    shakeAmp = Math.max(0, shakeAmp - frameDt * 1.8);
    hitStop = Math.max(0, hitStop - frameDt);
    if (whooshT < 1) whooshT = Math.min(1, whooshT + frameDt / 0.26);
    if (rimFlash && rimFlash.life > 0) rimFlash.life -= frameDt;
    keepT = Math.max(0, keepT - frameDt / 0.7);
    backT = Math.max(0, backT - frameDt / 0.55);
    camS += (drawS - camS) * followS;
    const floorCam = roadHeight(camS, roadPieces);
    const lookAhead = CAM_AHEAD + Math.min(0.7, Math.max(0, speed - 5) * 0.05);
    const floorLook = roadHeight(drawS + lookAhead, roadPieces);
    // A head follows the path. The same ease on both heights keeps the
    // pitch equal to the slope between them.
    const followH = reduced ? 1 : 0.16;
    if (!camFloorSeen) {
      camFloor = floorCam;
      camLook = floorLook;
      camFloorSeen = true;
    } else {
      camFloor += (floorCam - camFloor) * followH;
      camLook += (floorLook - camLook) * followH;
    }
    const floaty = Math.max(0, (32 - grav) * 0.03);
    const wantY = CAM_EYE_Y + floaty * 0.45 + (rel > 0.4 ? 0.1 : 0) - land * 0.1;
    camY += (wantY - camY) * (reduced ? 1 : 0.08);
    const wantFov = (rel > 0.35 ? CAM_FOV + 0.06 : CAM_FOV) + Math.min(0.04, Math.max(0, speed - 5) * 0.005) + pulse * 0.02
      + (gpuFeel ? fovKick(speed, activeProfile.fovKick) : 0);
    camFov += (wantFov - camFov) * (reduced ? 1 : 0.08);
    const bob = reduced || !alive ? 0 : Math.sin(st.time * (8 + speed * 0.25)) * 0.02;
    const basis = sample(camS, 0);
    const followed = sample(camS, camLat);
    const psi = basis.psi;
    const ox = followed.x - basis.x;
    const oz = followed.z - basis.z;
    const leanWorld = lean * 0.15;
    const eye = [
      basis.x + ox * 0.62 - Math.sin(psi) * CAM_BACK + leanWorld * Math.cos(psi),
      camY + bob + camFloor,
      basis.z + oz * 0.62 - Math.cos(psi) * CAM_BACK - leanWorld * Math.sin(psi),
    ];
    if (shakeAmp > 0) {
      const off = shakeOffset(shakeAmp, st.time || 0);
      eye[0] += off[0];
      eye[1] += off[1];
      eye[2] += off[2];
    }
    if (activeProfile.tier === "high" && whooshT < 1) {
      const nudge = whooshNudge(activeProfile.whoosh || 0, whooshT);
      const right = roadAxes(psi);
      const away = whooshSide > 0 ? -1 : whooshSide < 0 ? 1 : 0;
      eye[0] += right.rx * away * nudge;
      eye[2] += right.rz * away * nudge;
      eye[1] += nudge * (whooshSide === 0 ? 0.7 : 0.28);
    }
    drawFov = camFov - (hitStop > 0 ? (activeProfile.shake || 0.04) * (hitStop / 0.07) * 1.4 : 0);
    // The look point stays close and low, so the sky is a thin band and
    // the runner stays large. The eye is CAM_BACK behind, and a bend
    // still rebases only past 8 m. The look height is the road there,
    // so an uphill tips the view by that grade.
    const at = [
      basis.x + ox * 0.22 + Math.sin(psi) * lookAhead,
      CAM_LOOK_Y + Math.max(0, rel) * 0.12 + floaty * 0.25 + camLook,
      basis.z + oz * 0.22 + Math.cos(psi) * lookAhead,
    ];
    perspective(proj, drawFov, w / h, 0.08, 96);
    lookAt(view, eye, at, [0, 1, 0]);
    const invProj = new Float32Array(16);
    if (!invertMat(invProj, proj)) invProj.set(proj);
    const heroClip = mulMatPoint(proj, mulMatPoint(view, [rx, py + 0.7, rz, 1]));
    const heroUv = heroClip[3] ? [heroClip[0] / heroClip[3] * 0.5 + 0.5, heroClip[1] / heroClip[3] * 0.5 + 0.5] : [0.5, 0.42];

    function paintSky(prog, locs) {
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.disable(gl.BLEND);
      gl.useProgram(prog);
      gl.uniform3fv(locs.sky0, pal.sky0);
      gl.uniform3fv(locs.sky1, pal.sky1);
      gl.uniform3fv(locs.hill, pal.hill);
      gl.uniform3fv(locs.hill2, pal.hill2);
      gl.uniform3fv(locs.sunCol, pal.sun);
      gl.uniform2f(locs.sun, pal.sunUv[0], pal.sunUv[1]);
      gl.uniform1f(locs.time, st.time || 0);
      gl.uniform1f(locs.camZ, camS);
      gl.uniform1f(locs.yaw, psi);
      gl.uniform1f(locs.fov, drawFov);
      const skyShow = visibleSky(st.props, st.sunHide);
      gl.uniform1f(locs.sunAmt, skyShow.shader * (pal.disc == null ? 1 : pal.disc));
      // Fast frames used to paint white bars on the side of the picture.
      // The road itself carries the speed. The flag stays for the probe.
      const rush = !reduced && speed >= 12 && !software ? 1 : 0;
      if (locs.rush) gl.uniform1f(locs.rush, rush);
      gl.uniform1f(locs.stars, pal.stars || 0);
      gl.uniform3fv(locs.nebula, pal.nebula || [0, 0, 0]);
      const highPic = usePost && activeProfile.tier === "high" && highReady;
      gl.uniform1f(locs.flash, highPic ? 0 : (worldFlash || 0));
      if (locs.skyAnim) gl.uniform1f(locs.skyAnim, usePost && !reduced ? (activeProfile.sky || 0) : 0);
      gl.uniform2f(locs.res, w, h);
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, tri);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.depthMask(true);
      gl.enable(gl.DEPTH_TEST);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      return rush;
    }
    let rush = 0;
    if (!usePost) {
      if (wasPost) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.colorMask(true, true, true, true);
        gl.disable(gl.BLEND);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.cullFace(gl.BACK);
        wasPost = false;
      }
      rush = paintSky(sky, u);
    }

    n = 0;
    castN = 0;
    casting = false;
    spin = 0;
    const pieces = st.pieces;
    const z0 = pz - 8;
    const z1 = pz + 42;
    const onRoad = (s, lateral) => sample(s, lateral);
    function nextCoin(list, q) {
      const lane = q.length > 5 ? q[5] : -1;
      let best = null;
      let bestDx = 3.6;
      for (let j = 0; j < list.length; j++) {
        const o = list[j];
        if (o === q || o[0] !== 5) continue;
        const ol = o.length > 5 ? o[5] : -1;
        if (lane >= 0 && ol >= 0 && Math.abs(ol - lane) > 0.1) continue;
        if (lane < 0 && ol >= 0) continue;
        const dx = o[1] - q[1];
        if (dx > 0.35 && dx < bestDx) {
          bestDx = dx;
          best = o;
        }
      }
      return best;
    }
    // Five roadside shapes, picked from the arc so the row does not repeat
    // one lollipop. Scale, offset and side stay stable as the camera moves.
    function drawTree(along, lat, kind, scale, near, sway, tintK = 1) {
      const at = onRoad(along, lat);
      const savedLift = deckLift;
      deckLift = roadHeight(along, pieces);
      const swayX = sway * Math.cos(at.psi);
      const swayZ = -sway * Math.sin(at.psi);
      const leaf = tint(mix3(pal.leaf, pal.leaf2, kind === 2 ? 0.2 : 0.62), tintK);
      const trunk = tint(mix3(pal.trunk, [0.32, 0.2, 0.13], kind === 1 ? 0.15 : 0.4), tintK);
      const wood = near ? 3 : 0;
      const top = [at.x + swayX, at.z + swayZ];
      if (usePost || Math.abs(lat) <= 3.05) contactShadow(at.x, at.z, at.psi, 0, 0.55 * scale);
      if (kind === 1) {
        push(at.x, 0.72 * scale, at.z, 0.11 * scale, 1.45 * scale, 0.11 * scale, 0, trunk, 0.8, 0, at.psi, 0, 0, wood);
        push(top[0], 1.62 * scale, top[1], 0.38 * scale, 1.2 * scale, 0.38 * scale, 1, leaf, 0.7, 0.02, at.psi);
      } else if (kind === 2) {
        const pine = mul(leaf, 0.82);
        push(at.x, 0.32 * scale, at.z, 0.12 * scale, 0.64 * scale, 0.12 * scale, 0, trunk, 0.78, 0, at.psi, 0, 0, wood);
        push(at.x + swayX * 0.25, 0.82 * scale, at.z + swayZ * 0.25, 0.92 * scale, 0.5 * scale, 0.92 * scale, 1, pine, 0.72, 0.02, at.psi);
        push(at.x + swayX * 0.55, 1.28 * scale, at.z + swayZ * 0.55, 0.66 * scale, 0.46 * scale, 0.66 * scale, 1, leaf, 0.7, 0.03, at.psi);
        push(top[0], 1.68 * scale, top[1], 0.34 * scale, 0.4 * scale, 0.34 * scale, 1, mix3(leaf, [0.72, 0.84, 0.58], 0.4), 0.68, 0.04, at.psi);
      } else if (kind === 3) {
        push(at.x, 0.46 * scale, at.z, 0.22 * scale, 0.92 * scale, 0.22 * scale, 0, trunk, 0.82, 0, at.psi, 0, 0, wood);
        push(top[0], 1.12 * scale, top[1], 1.28 * scale, 0.52 * scale, 1.15 * scale, 1, leaf, 0.7, 0.02, at.psi);
        push(at.x + swayX * 0.4, 1.5 * scale, at.z + swayZ * 0.4, 0.78 * scale, 0.46 * scale, 0.78 * scale, 1, pal.leaf2, 0.68, 0.03, at.psi);
      } else if (kind === 4) {
        push(at.x, 0.38 * scale, at.z, 0.11 * scale, 0.76 * scale, 0.11 * scale, 0, trunk, 0.78, 0, at.psi, 0, 0, wood);
        push(top[0], 1.12 * scale, top[1], 0.9 * scale, 0.66 * scale, 0.9 * scale, 1, pal.flower, 0.42, 0.08, at.psi);
        push(top[0] + 0.18 * scale, 1.32 * scale, top[1], 0.42 * scale, 0.36 * scale, 0.42 * scale, 1, pal.flower2, 0.38, 0.12, at.psi);
      } else {
        push(at.x, 0.4 * scale, at.z, 0.15 * scale, 0.8 * scale, 0.15 * scale, 0, trunk, 0.8, 0, at.psi, 0, 0, wood);
        push(top[0], 1.12 * scale, top[1], 0.98 * scale, 0.88 * scale, 0.98 * scale, near ? 1 : 0, leaf, 0.72, 0.02, at.psi);
        if (near) push(top[0] + 0.16, 1.22 * scale, top[1], 0.11, 0.11, 0.11, 1, [0.95, 0.34, 0.3], 0.32, 0.16, at.psi);
      }
      deckLift = savedLift;
    }
    function drawCityMark(at, kind, scale, pal) {
      if (usePost) contactShadow(at.x, at.z, at.psi, 0, 0.72 * scale);
      const s = scale;
      const red = [0.78, 0.14, 0.12];
      const roof = [0.16, 0.1, 0.08];
      const gold = [0.95, 0.78, 0.32];
      const iron = [0.28, 0.24, 0.22];
      const psi = at.psi;
      const x = at.x;
      const z = at.z;
      if (kind === "pagoda") {
        push(x, 0.55 * s, z, 1.05 * s, 1.1 * s, 1.05 * s, 0, red, 0.48, 0.04, psi);
        push(x, 1.15 * s, z, 1.55 * s, 0.1 * s, 1.55 * s, 0, roof, 0.4, 0.06, psi);
        push(x, 1.7 * s, z, 0.78 * s, 0.9 * s, 0.78 * s, 0, red, 0.46, 0.05, psi);
        push(x, 2.2 * s, z, 1.15 * s, 0.09 * s, 1.15 * s, 0, roof, 0.4, 0.07, psi);
        push(x, 2.65 * s, z, 0.5 * s, 0.72 * s, 0.5 * s, 0, red, 0.44, 0.06, psi);
        push(x, 3.05 * s, z, 0.8 * s, 0.08 * s, 0.8 * s, 0, roof, 0.38, 0.1, psi);
        push(x, 3.4 * s, z, 0.07 * s, 0.55 * s, 0.07 * s, 0, gold, 0.25, 0.5, psi);
        push(x + 0.55 * s, 0.9 * s, z, 0.12 * s, 0.18 * s, 0.12 * s, 1, [0.95, 0.22, 0.14], 0.2, 0.9, psi);
      } else if (kind === "palace-gate") {
        push(x - 0.7 * s, 1.05 * s, z, 0.28 * s, 2.1 * s, 0.28 * s, 0, red, 0.45, 0.04, psi);
        push(x + 0.7 * s, 1.05 * s, z, 0.28 * s, 2.1 * s, 0.28 * s, 0, red, 0.45, 0.04, psi);
        push(x, 2.2 * s, z, 1.8 * s, 0.22 * s, 0.4 * s, 0, gold, 0.35, 0.16, psi);
        push(x, 2.45 * s, z, 2.1 * s, 0.14 * s, 0.62 * s, 0, roof, 0.4, 0.05, psi);
        push(x - 0.95 * s, 2.58 * s, z, 0.22 * s, 0.16 * s, 0.22 * s, 0, gold, 0.3, 0.3, psi);
        push(x, 1.4 * s, z, 0.12 * s, 0.16 * s, 0.12 * s, 1, [0.95, 0.22, 0.14], 0.2, 0.9, psi);
      } else if (kind === "pearl-tower") {
        const glow = [0.55, 0.9, 1];
        push(x, 1.8 * s, z, 0.32 * s, 3.6 * s, 0.32 * s, 0, [0.15, 0.22, 0.4], 0.32, 0.12, psi);
        push(x, 1.2 * s, z, 0.9 * s, 0.9 * s, 0.9 * s, 1, glow, 0.18, 0.7, psi);
        push(x, 2.3 * s, z, 0.62 * s, 0.62 * s, 0.62 * s, 1, glow, 0.16, 0.8, psi);
        push(x, 3.15 * s, z, 0.4 * s, 0.4 * s, 0.4 * s, 1, [0.8, 0.95, 1], 0.14, 0.9, psi);
        push(x, 3.7 * s, z, 0.07 * s, 0.7 * s, 0.07 * s, 0, glow, 0.2, 0.65, psi);
        push(x, 2.3 * s, z, 1.05 * s, 0.05 * s, 1.05 * s, 1, glow, 0.2, 0.75, psi);
      } else if (kind === "spire") {
        const shaft = mix3(pal.trunk, pal.flower, 0.35);
        const cap = mix3(pal.flower2, [1, 1, 1], 0.25);
        push(x, 1.0 * s, z, 0.75 * s, 2.0 * s, 0.75 * s, 0, shaft, 0.4, 0.08, psi, 0, 0, 6);
        push(x, 2.3 * s, z, 0.5 * s, 1.15 * s, 0.5 * s, 0, cap, 0.34, 0.18, psi);
        push(x, 3.15 * s, z, 0.28 * s, 0.8 * s, 0.28 * s, 0, shaft, 0.32, 0.25, psi);
        push(x, 3.75 * s, z, 0.07 * s, 0.55 * s, 0.07 * s, 0, cap, 0.24, 0.6, psi);
        push(x, 1.85 * s, z, 0.82 * s, 0.1 * s, 0.82 * s, 0, cap, 0.2, 0.75, psi);
      } else if (kind === "bridge-tower") {
        const vermilion = [0.8, 0.16, 0.1];
        push(x - 0.7 * s, 1.5 * s, z, 0.26 * s, 3.0 * s, 0.26 * s, 0, vermilion, 0.4, 0.05, psi);
        push(x + 0.7 * s, 1.5 * s, z, 0.26 * s, 3.0 * s, 0.26 * s, 0, vermilion, 0.4, 0.05, psi);
        push(x, 2.9 * s, z, 1.7 * s, 0.14 * s, 0.2 * s, 0, vermilion, 0.35, 0.1, psi);
        push(x, 2.1 * s, z, 1.4 * s, 0.04 * s, 0.04 * s, 0, [0.16, 0.15, 0.18], 0.3, 0.04, psi);
        push(x, 1.2 * s, z, 1.4 * s, 0.04 * s, 0.04 * s, 0, [0.16, 0.15, 0.18], 0.3, 0.04, psi);
        push(x, 3.15 * s, z, 0.14 * s, 0.14 * s, 0.14 * s, 1, [1, 0.86, 0.42], 0.2, 0.9, psi);
      } else if (kind === "eiffel-tower") {
        push(x - 0.85 * s, 1.0 * s, z, 0.16 * s, 2.0 * s, 0.16 * s, 0, iron, 0.42, 0.04, psi);
        push(x + 0.85 * s, 1.0 * s, z, 0.16 * s, 2.0 * s, 0.16 * s, 0, iron, 0.42, 0.04, psi);
        push(x - 0.32 * s, 1.15 * s, z, 0.12 * s, 1.8 * s, 0.12 * s, 0, iron, 0.42, 0.04, psi);
        push(x + 0.32 * s, 1.15 * s, z, 0.12 * s, 1.8 * s, 0.12 * s, 0, iron, 0.42, 0.04, psi);
        push(x, 2.05 * s, z, 1.9 * s, 0.12 * s, 0.45 * s, 0, iron, 0.4, 0.08, psi);
        push(x, 2.75 * s, z, 0.28 * s, 1.15 * s, 0.28 * s, 0, iron, 0.35, 0.1, psi);
        push(x, 3.45 * s, z, 0.07 * s, 0.5 * s, 0.07 * s, 0, [0.62, 0.5, 0.32], 0.25, 0.45, psi);
      } else if (kind === "clock-tower") {
        const stone = mix3(pal.trunk, [0.75, 0.7, 0.62], 0.55);
        push(x, 1.5 * s, z, 0.62 * s, 3.0 * s, 0.62 * s, 0, stone, 0.5, 0.03, psi);
        push(x, 3.15 * s, z, 0.72 * s, 0.5 * s, 0.72 * s, 0, mix3(stone, [0.3, 0.22, 0.16], 0.3), 0.42, 0.05, psi);
        push(x, 2.1 * s, z, 0.32 * s, 0.32 * s, 0.08 * s, 1, [0.96, 0.9, 0.62], 0.2, 0.45, psi);
        push(x, 3.5 * s, z, 0.8 * s, 0.18 * s, 0.8 * s, 0, stone, 0.4, 0.06, psi);
        push(x, 3.85 * s, z, 0.07 * s, 0.55 * s, 0.07 * s, 0, [0.35, 0.32, 0.3], 0.3, 0.15, psi);
      } else if (kind === "colonnade") {
        const stone = mix3(pal.flower, [0.9, 0.84, 0.7], 0.45);
        push(x - 0.7 * s, 0.75 * s, z, 0.14 * s, 1.5 * s, 0.14 * s, 0, stone, 0.45, 0.03, psi);
        push(x - 0.23 * s, 0.75 * s, z, 0.14 * s, 1.5 * s, 0.14 * s, 0, stone, 0.45, 0.03, psi);
        push(x + 0.23 * s, 0.75 * s, z, 0.14 * s, 1.5 * s, 0.14 * s, 0, stone, 0.45, 0.03, psi);
        push(x + 0.7 * s, 0.75 * s, z, 0.14 * s, 1.5 * s, 0.14 * s, 0, stone, 0.45, 0.03, psi);
        push(x, 1.58 * s, z, 1.7 * s, 0.14 * s, 0.32 * s, 0, stone, 0.42, 0.04, psi);
        push(x, 1.78 * s, z, 1.15 * s, 0.22 * s, 0.22 * s, 0, mix3(stone, [0.55, 0.4, 0.28], 0.25), 0.4, 0.05, psi);
      } else if (kind === "bamboo") {
        const g = [0.22, 0.62, 0.32];
        const g2 = [0.45, 0.78, 0.42];
        push(x - 0.12 * s, 1.05 * s, z, 0.07 * s, 2.1 * s, 0.07 * s, 0, g, 0.4, 0.03, psi);
        push(x + 0.1 * s, 1.25 * s, z, 0.06 * s, 2.5 * s, 0.06 * s, 0, g2, 0.4, 0.04, psi);
        push(x, 0.9 * s, z, 0.06 * s, 1.8 * s, 0.06 * s, 0, g, 0.4, 0.03, psi);
        push(x + 0.1 * s, 2.15 * s, z, 0.4 * s, 0.22 * s, 0.4 * s, 1, g2, 0.35, 0.05, psi);
        push(x - 0.08 * s, 1.6 * s, z, 0.3 * s, 0.18 * s, 0.3 * s, 1, g, 0.35, 0.04, psi);
      } else if (kind === "palm") {
        const trunk = [0.55, 0.38, 0.2];
        const leaf = [0.16, 0.55, 0.26];
        push(x, 0.65 * s, z, 0.16 * s, 1.3 * s, 0.16 * s, 0, trunk, 0.55, 0, psi);
        push(x + 0.08 * s, 1.45 * s, z, 0.12 * s, 1.1 * s, 0.12 * s, 0, trunk, 0.5, 0, psi);
        push(x + 0.4 * s, 2.0 * s, z, 0.7 * s, 0.07 * s, 0.14 * s, 0, leaf, 0.4, 0.05, psi);
        push(x - 0.38 * s, 1.95 * s, z, 0.62 * s, 0.07 * s, 0.14 * s, 0, leaf, 0.4, 0.05, psi);
        push(x, 2.05 * s, z, 0.14 * s, 0.07 * s, 0.62 * s, 0, leaf, 0.4, 0.05, psi);
        push(x + 0.05 * s, 2.02 * s, z, 0.14 * s, 0.07 * s, 0.55 * s, 0, leaf, 0.4, 0.06, psi);
      } else if (kind === "stone-bridge") {
        const stone = [0.66, 0.64, 0.6];
        push(x - 0.7 * s, 0.4 * s, z, 0.3 * s, 0.8 * s, 0.45 * s, 0, stone, 0.55, 0.02, psi);
        push(x + 0.7 * s, 0.4 * s, z, 0.3 * s, 0.8 * s, 0.45 * s, 0, stone, 0.55, 0.02, psi);
        push(x, 0.78 * s, z, 1.5 * s, 0.14 * s, 0.5 * s, 0, stone, 0.5, 0.03, psi);
        push(x - 0.4 * s, 0.95 * s, z, 0.7 * s, 0.07 * s, 0.08 * s, 0, [0.4, 0.38, 0.36], 0.45, 0, psi);
        push(x + 0.4 * s, 0.95 * s, z, 0.7 * s, 0.07 * s, 0.08 * s, 0, [0.4, 0.38, 0.36], 0.45, 0, psi);
      } else if (kind === "battlement") {
        const wall = mix3(pal.trunk, [0.55, 0.32, 0.18], 0.4);
        push(x, 0.6 * s, z, 2.0 * s, 1.2 * s, 0.4 * s, 0, wall, 0.55, 0.03, psi);
        push(x - 0.7 * s, 1.3 * s, z, 0.26 * s, 0.28 * s, 0.4 * s, 0, wall, 0.5, 0.03, psi);
        push(x - 0.2 * s, 1.3 * s, z, 0.26 * s, 0.28 * s, 0.4 * s, 0, wall, 0.5, 0.03, psi);
        push(x + 0.25 * s, 1.3 * s, z, 0.26 * s, 0.28 * s, 0.4 * s, 0, wall, 0.5, 0.03, psi);
        push(x + 0.7 * s, 1.3 * s, z, 0.26 * s, 0.28 * s, 0.4 * s, 0, wall, 0.5, 0.03, psi);
      } else if (kind === "willow") {
        const leaf = [0.32, 0.62, 0.32];
        push(x, 0.55 * s, z, 0.12 * s, 1.1 * s, 0.12 * s, 0, [0.42, 0.3, 0.18], 0.55, 0, psi);
        push(x + 0.12 * s, 1.2 * s, z, 0.08 * s, 0.7 * s, 0.45 * s, 0, leaf, 0.4, 0.04, psi);
        push(x - 0.14 * s, 1.1 * s, z, 0.08 * s, 0.75 * s, 0.4 * s, 0, leaf, 0.4, 0.04, psi);
        push(x, 0.95 * s, z, 0.42 * s, 0.08 * s, 0.08 * s, 0, leaf, 0.4, 0.05, psi);
      } else if (kind === "cypress") {
        push(x, 0.25 * s, z, 0.1 * s, 0.5 * s, 0.1 * s, 0, [0.32, 0.22, 0.14], 0.55, 0, psi);
        push(x, 1.35 * s, z, 0.32 * s, 2.0 * s, 0.32 * s, 0, [0.1, 0.28, 0.16], 0.45, 0.03, psi);
      } else if (kind === "sakura") {
        const pink = [0.98, 0.62, 0.74];
        push(x, 0.45 * s, z, 0.12 * s, 0.9 * s, 0.12 * s, 0, [0.4, 0.28, 0.2], 0.55, 0, psi);
        push(x, 1.15 * s, z, 0.62 * s, 0.45 * s, 0.62 * s, 1, pink, 0.3, 0.1, psi);
        push(x + 0.22 * s, 1.4 * s, z, 0.34 * s, 0.28 * s, 0.34 * s, 1, [1, 0.8, 0.86], 0.28, 0.12, psi);
        push(x - 0.18 * s, 1.0 * s, z, 0.3 * s, 0.26 * s, 0.3 * s, 1, pink, 0.28, 0.1, psi);
      }
    }
    // One oversized natural silhouette every eighteen chunks. A tree,
    // boulder, crystal, coral, or mushroom becomes the local hero shot;
    // it is still made from the same instanced parts, so the draw count
    // stays flat. The ring above ties it to the current world colour.
    function drawNaturalMark(along, lat, kind, s, tintK) {
      const at = onRoad(along, lat);
      const x = at.x;
      const z = at.z;
      const psi = at.psi;
      if (kind === "crystal") {
        const ice = mix3(pal.sky, [0.8, 0.95, 1], 0.45);
        push(x, 1.2 * s, z, 0.5 * s, 2.6 * s, 0.5 * s, 2, ice, 0.15, 0.55, psi);
        push(x, 0.35 * s, z, 1.05 * s, 0.7 * s, 1.05 * s, 1, mix3(ice, pal.flower2, 0.3), 0.18, 0.35, psi);
        push(x, 2.75 * s, z, 0.2 * s, 0.55 * s, 0.2 * s, 5, tint(ice, 1.1), 0.2, 0.7, psi);
      } else if (kind === "rock") {
        const rock = mix3(pal.soil, [0.15, 0.08, 0.06], 0.25);
        push(x, 0.55 * s, z, 1.5 * s, 1.1 * s, 1.2 * s, 1, rock, 0.78, 0.03, psi);
        push(x + 0.3 * s, 1.0 * s, z, 0.8 * s, 0.6 * s, 0.7 * s, 1, tint(rock, 1.08), 0.7, 0.06, psi);
      } else if (kind === "coral") {
        const coral = mix3(pal.flower, [1, 0.45, 0.55], 0.4);
        push(x, 0.55 * s, z, 0.35 * s, 1.1 * s, 0.35 * s, 0, pal.trunk, 0.6, 0.02, psi);
        push(x, 1.35 * s, z, 0.9 * s, 0.9 * s, 0.9 * s, 1, coral, 0.32, 0.2, psi);
        push(x + 0.4 * s, 1.85 * s, z, 0.5 * s, 0.5 * s, 0.5 * s, 1, pal.flower2, 0.3, 0.35, psi);
      } else if (kind === "mushroom") {
        push(x, 0.5 * s, z, 0.3 * s, 1.0 * s, 0.3 * s, 2, [0.94, 0.88, 0.76], 0.6, 0.02, psi);
        push(x, 1.15 * s, z, 1.25 * s, 0.55 * s, 1.25 * s, 1, tint(pal.flower, tintK), 0.4, 0.14, psi);
      } else {
        drawTree(along, lat, 1 + (Math.abs(Math.floor(along)) % 4), s, true, 0, tintK);
      }
      const ringY = kind === "rock" ? 1.75 * s : kind === "crystal" ? 3.35 * s : 2.55 * s;
      push(x, ringY, z, 1.35 * s, 0.06 * s, 1.35 * s, 4, tint(pal.flower2, 1.05), 0.2, 0.5, psi);
    }

    function drawFace(at, face, scale, style) {
      if (n >= MAX - 10) return;
      if (usePost) contactShadow(at.x, at.z, at.psi, 0, 0.7 * scale);
      const s = scale;
      const x = at.x;
      const z = at.z;
      const psi = at.psi;
      const wall = style.wall;
      const roof = style.roof;
      const trim = style.trim;
      const glow = style.glow || 0.08;
      if (face === "eave") {
        push(x, 0.65 * s, z, 1.05 * s, 1.3 * s, 0.85 * s, 0, wall, 0.48, 0.03, psi, 0, 0, 6);
        push(x, 1.38 * s, z, 1.65 * s, 0.12 * s, 1.3 * s, 0, roof, 0.42, 0.04, psi);
        push(x, 1.9 * s, z, 0.62 * s, 0.78 * s, 0.55 * s, 0, wall, 0.46, glow * 0.35, psi, 0, 0, 6);
        push(x, 2.36 * s, z, 1.0 * s, 0.1 * s, 0.85 * s, 0, roof, 0.4, glow * 0.5, psi);
      } else if (face === "gate") {
        push(x - 0.55 * s, 0.85 * s, z, 0.22 * s, 1.7 * s, 0.22 * s, 0, wall, 0.45, 0.03, psi);
        push(x + 0.55 * s, 0.85 * s, z, 0.22 * s, 1.7 * s, 0.22 * s, 0, wall, 0.45, 0.03, psi);
        push(x, 1.78 * s, z, 1.5 * s, 0.16 * s, 0.36 * s, 0, trim, 0.35, glow, psi);
        push(x, 2.0 * s, z, 1.75 * s, 0.12 * s, 0.5 * s, 0, roof, 0.4, 0.05, psi);
      } else if (face === "hall") {
        push(x, 0.55 * s, z, 1.7 * s, 1.1 * s, 0.9 * s, 0, wall, 0.5, 0.03, psi, 0, 0, 6);
        push(x, 1.18 * s, z, 2.05 * s, 0.14 * s, 1.2 * s, 0, roof, 0.42, 0.04, psi);
        push(x, 1.4 * s, z, 0.7 * s, 0.16 * s, 0.16 * s, 0, trim, 0.35, glow * 0.6, psi);
      } else if (face === "step") {
        push(x, 0.9 * s, z, 1.05 * s, 1.8 * s, 0.8 * s, 0, wall, 0.42, glow * 0.25, psi, 0, 0, 6);
        push(x, 2.05 * s, z, 0.72 * s, 0.9 * s, 0.58 * s, 0, wall, 0.4, glow * 0.4, psi, 0, 0, 6);
        push(x, 2.7 * s, z, 0.4 * s, 0.55 * s, 0.36 * s, 0, trim, 0.32, glow, psi);
        push(x, 3.1 * s, z, 0.06 * s, 0.4 * s, 0.06 * s, 0, roof, 0.3, glow, psi);
      } else if (face === "row") {
        push(x, 0.85 * s, z, 1.85 * s, 1.7 * s, 0.7 * s, 0, wall, 0.48, 0.04, psi, 0, 0, 6);
        push(x, 1.85 * s, z, 1.95 * s, 0.28 * s, 0.85 * s, 0, roof, 0.45, 0.03, psi);
        push(x + 0.55 * s, 2.1 * s, z, 0.16 * s, 0.28 * s, 0.16 * s, 0, trim, 0.4, glow * 0.4, psi);
      } else if (face === "pier") {
        push(x - 0.55 * s, 1.15 * s, z, 0.22 * s, 2.3 * s, 0.22 * s, 0, wall, 0.4, glow * 0.3, psi);
        push(x + 0.55 * s, 1.15 * s, z, 0.22 * s, 2.3 * s, 0.22 * s, 0, wall, 0.4, glow * 0.3, psi);
        push(x, 2.15 * s, z, 1.45 * s, 0.12 * s, 0.16 * s, 0, roof, 0.35, glow * 0.5, psi);
        push(x, 2.45 * s, z, 0.12 * s, 0.12 * s, 0.12 * s, 1, trim, 0.2, Math.max(glow, 0.45), psi);
      } else if (face === "lantern") {
        push(x, 1.15 * s, z, 0.42 * s, 2.3 * s, 0.42 * s, 0, wall, 0.38, glow * 0.35, psi, 0, 0, 6);
        push(x, 2.15 * s, z, 0.7 * s, 0.16 * s, 0.16 * s, 0, trim, 0.25, Math.max(0.55, glow), psi);
        push(x, 2.55 * s, z, 0.28 * s, 0.28 * s, 0.28 * s, 1, trim, 0.18, Math.max(0.7, glow), psi);
      } else if (face === "wall") {
        push(x, 0.7 * s, z, 2.1 * s, 1.4 * s, 0.42 * s, 0, wall, 0.55, 0.02, psi);
        push(x - 0.7 * s, 1.5 * s, z, 0.28 * s, 0.28 * s, 0.42 * s, 0, roof, 0.5, 0.03, psi);
        push(x, 1.5 * s, z, 0.28 * s, 0.28 * s, 0.42 * s, 0, roof, 0.5, 0.03, psi);
        push(x + 0.7 * s, 1.5 * s, z, 0.28 * s, 0.28 * s, 0.42 * s, 0, roof, 0.5, 0.03, psi);
      } else {
        const h = 1.7 + scale * 1.15;
        push(x, h * 0.5, z, 0.95 * s, h, 0.72 * s, 0, wall, 0.48, glow * 0.2, psi, 0, 0, 6);
        push(x, h + 0.08 * s, z, 1.05 * s, 0.14 * s, 0.8 * s, 0, roof, 0.4, 0.04, psi);
        push(x, h * 0.72, z, 0.22 * s, 0.14 * s, 0.76 * s, 0, trim, 0.25, Math.max(glow, 0.35), psi);
      }
    }
    function drawCityStreet(cz) {
      const style = CITY_STYLES[pal.biome];
      if (!style || n >= MAX - 24) return;
      if (((((cz - 1) / 2) | 0) % 4) !== 0) return;
      for (const side of [-1, 1]) {
        if (n >= MAX - 12) return;
        const pick = laneHash(cz * 0.37 + side * 4.1);
        const face = style.faces[(pick * style.faces.length) | 0] || "block";
        const scale = 0.84 + laneHash(cz * 0.19 + side) * 0.38;
        const lat = side * (4.8 + laneHash(cz * 0.11 + side * 2) * 0.55);
        const at = onRoad(cz, lat);
        const look = style.vary
          ? Object.assign({}, style, { wall: mix3(style.wall, style.vary, pick) })
          : style;
        const rare = style.mark && laneHash(cz * 0.07 + side * 8.2) > 0.84;
        if (rare) drawCityMark(at, style.mark, Math.min(1.25, scale + 0.15), pal);
        else drawFace(at, face, scale, look);
      }
    }
    function drawMix(cz, dist) {
      drawCityStreet(cz);
      const plan = worldPlan(st.spec, activeProfile.tier);
      const usePlan = !!(plan && plan.id === pal.biome);
      const props = usePlan ? plan.props : (Array.isArray(pal.props) ? pal.props : []);
      // A painted world already scales its plan by tier; a venue's pool
      // is scaled here so Low keeps the same instance budget.
      const densityScale = usePlan ? 1
        : activeProfile.tier === "low" ? 0.45
        : activeProfile.tier === "medium" ? 0.72 : 1;
      const sway = reduced ? 0 : Math.sin((st.time || 0) * 1.1 + cz * 0.13) * 0.05;
      if (!CITY_STYLES[pal.biome] && props.length && ((cz - 1) % 18 === 0) && n < MAX - 90) {
        const slot = Math.abs(Math.floor(cz / 18)) % props.length;
        const mark = props[slot];
        const side = (Math.abs(Math.floor(cz / 18)) % 2 === 0) ? -1 : 1;
        const lat = side * (8.2 + laneHash(cz * 0.37) * 1.0);
        const s = 1.55 + laneHash(cz * 0.71) * 0.45;
        drawNaturalMark(cz + 1.2, lat, mark.kind, s, 1.0);
      }
      for (let p = 0; p < props.length && n < MAX - 70; p++) {
        const prop = props[p];
        if (CITY_STYLES[pal.biome] && CITY_ARCH.has(prop.kind)) continue;
        const density = Math.max(0.05, Math.min(0.55, (Number(prop.density) || 0.2) * densityScale));
        const baseScale = Math.max(0.55, Math.min(1.45, Number(prop.scale) || 1));
        for (const side of [-1, 1]) {
          if (n >= MAX - 70) return;
          if (laneHash(cz * 0.17 + side * (3 + p) + prop.kind.length) > density + 0.2) continue;
          const shoulder = CITY_STYLES[pal.biome] ? 6.35 : 4.65;
          const lat = side * (shoulder + laneHash(cz * 0.29 + side + p) * 0.9);
          const along = cz + (laneHash(cz * 0.41 + side * 2) - 0.5) * 1.1;
          const at = onRoad(along, lat);
          const jitterK = 0.9 + laneHash(cz * 0.53 + side * 1.7 + p) * 0.2;
          const scale = baseScale * (0.88 + laneHash(cz * 0.61 + side * 2.3 + p) * 0.24);
          if (prop.kind !== "tree" && (usePost || Math.abs(lat) <= 3.05)) contactShadow(at.x, at.z, at.psi, 0, 0.5 * scale);
          const glow = tint(pal.flower, jitterK);
          const body = tint(mix3(pal.trunk, pal.hedge, 0.4), jitterK);
          if (prop.kind === "tree") {
            drawTree(along, lat, 1 + (p % 4), scale, dist < 16, sway, jitterK);
          } else if (prop.kind === "pine") {
            const h = 1.9 * scale;
            const dark = tint(pal.leaf, jitterK * 0.86);
            push(at.x, 0.3 * scale, at.z, 0.13 * scale, 0.6 * scale, 0.13 * scale, 2, body, 0.55, 0, at.psi);
            push(at.x, 0.88 * scale, at.z, 0.9 * scale, 0.56 * scale, 0.9 * scale, 3, dark, 0.62, 0.02, at.psi);
            push(at.x + sway * 0.2, 1.38 * scale, at.z, 0.7 * scale, 0.52 * scale, 0.7 * scale, 3, tint(pal.leaf2, jitterK * 0.92), 0.6, 0.02, at.psi);
            push(at.x + sway * 0.35, h - 0.08 * scale, at.z, 0.46 * scale, 0.48 * scale, 0.46 * scale, 3, tint(pal.leaf, jitterK), 0.58, 0.03, at.psi);
          } else if (prop.kind === "bush") {
            push(at.x, 0.18 * scale, at.z, 0.6 * scale, 0.4 * scale, 0.52 * scale, 1, tint(pal.leaf, jitterK * 0.9), 0.72, 0.01, at.psi);
            push(at.x + 0.22 * scale, 0.3 * scale, at.z + 0.08 * scale, 0.38 * scale, 0.36 * scale, 0.36 * scale, 1, tint(pal.leaf, jitterK), 0.68, 0.02, at.psi);
            push(at.x - 0.2 * scale, 0.26 * scale, at.z - 0.06 * scale, 0.32 * scale, 0.3 * scale, 0.32 * scale, 1, tint(pal.leaf2, jitterK), 0.66, 0.02, at.psi);
          } else if (prop.kind === "fern") {
            const frond = tint(pal.leaf, jitterK);
            push(at.x, 0.12 * scale, at.z, 0.16 * scale, 0.24 * scale, 0.16 * scale, 1, body, 0.7, 0.01, at.psi);
            push(at.x, 0.62 * scale, at.z, 0.08 * scale, 1.0 * scale, 0.08 * scale, 2, frond, 0.58, 0.02, at.psi);
            push(at.x - 0.28 * scale, 0.5 * scale, at.z, 0.06 * scale, 0.7 * scale, 0.06 * scale, 3, tint(pal.leaf2, jitterK), 0.6, 0.02, at.psi - 0.5);
            push(at.x + 0.28 * scale, 0.5 * scale, at.z, 0.06 * scale, 0.7 * scale, 0.06 * scale, 3, tint(pal.leaf2, jitterK), 0.6, 0.02, at.psi + 0.5);
            push(at.x, 0.42 * scale, at.z + 0.26 * scale, 0.06 * scale, 0.6 * scale, 0.06 * scale, 3, frond, 0.62, 0.02, at.psi);
          } else if (prop.kind === "mushroom") {
            const cap = tint(pal.flower, jitterK);
            push(at.x, 0.28 * scale, at.z, 0.16 * scale, 0.56 * scale, 0.16 * scale, 2, [0.94, 0.88, 0.76], 0.6, 0.02, at.psi);
            push(at.x, 0.62 * scale, at.z, 0.66 * scale, 0.3 * scale, 0.66 * scale, 1, cap, 0.42, 0.12, at.psi);
            push(at.x - 0.18 * scale, 0.7 * scale, at.z + 0.08 * scale, 0.12 * scale, 0.1 * scale, 0.12 * scale, 1, [1, 0.96, 0.86], 0.3, 0.28, at.psi);
            push(at.x + 0.16 * scale, 0.68 * scale, at.z - 0.1 * scale, 0.1 * scale, 0.09 * scale, 0.1 * scale, 1, [1, 0.96, 0.86], 0.3, 0.28, at.psi);
          } else if (prop.kind === "cactus") {
            const green = tint([0.22, 0.56, 0.3], jitterK);
            push(at.x, 0.65 * scale, at.z, 0.22 * scale, 1.3 * scale, 0.22 * scale, 2, green, 0.58, 0.02, at.psi);
            push(at.x - 0.3 * scale, 0.82 * scale, at.z, 0.13 * scale, 0.5 * scale, 0.13 * scale, 2, green, 0.58, 0.02, at.psi);
            push(at.x + 0.3 * scale, 0.95 * scale, at.z, 0.13 * scale, 0.55 * scale, 0.13 * scale, 2, green, 0.58, 0.02, at.psi);
            push(at.x, 1.34 * scale, at.z, 0.13 * scale, 0.13 * scale, 0.13 * scale, 1, tint(pal.flower2, jitterK), 0.3, 0.4, at.psi);
          } else if (prop.kind === "reed") {
            const stem = tint(pal.leaf, jitterK);
            push(at.x - 0.16 * scale, 0.65 * scale, at.z, 0.045 * scale, 1.3 * scale, 0.045 * scale, 2, stem, 0.55, 0.02, at.psi);
            push(at.x, 0.8 * scale, at.z, 0.045 * scale, 1.6 * scale, 0.045 * scale, 2, tint(pal.leaf2, jitterK), 0.55, 0.02, at.psi);
            push(at.x + 0.17 * scale, 0.62 * scale, at.z, 0.045 * scale, 1.24 * scale, 0.045 * scale, 2, stem, 0.55, 0.02, at.psi);
            push(at.x + 0.02 * scale, 1.52 * scale, at.z, 0.09 * scale, 0.28 * scale, 0.09 * scale, 3, tint(pal.flower2, jitterK), 0.45, 0.05, at.psi);
          } else if (prop.kind === "tower") {
            const h = 2.1 * scale;
            push(at.x, h * 0.42, at.z, 0.55 * scale, h * 0.84, 0.46 * scale, 0, body, 0.45, 0.04, at.psi, 0.15, 0.05, 0);
            push(at.x, h * 0.55, at.z, 0.18 * scale, 0.28 * scale, 0.5 * scale, 0, glow, 0.2, 0.8, at.psi);
            push(at.x, h * 0.92, at.z, 0.22 * scale, 0.16 * scale, 0.22 * scale, 0, mix3(body, [1, 1, 1], 0.2), 0.3, 0.2, at.psi);
          } else if (prop.kind === "arch") {
            const h = 1.7 * scale;
            const span = 1.35 * scale;
            const left = onRoad(along, lat - span * 0.35);
            const right = onRoad(along, lat + span * 0.35);
            const mid = onRoad(along, lat);
            push(left.x, h * 0.45, left.z, 0.16 * scale, h * 0.9, 0.16 * scale, 0, body, 0.4, 0.05, left.psi);
            push(right.x, h * 0.45, right.z, 0.16 * scale, h * 0.9, 0.16 * scale, 0, body, 0.4, 0.05, right.psi);
            push(mid.x, h * 0.92, mid.z, span, 0.16 * scale, 0.18 * scale, 0, glow, 0.25, 0.55, mid.psi);
          } else if (prop.kind === "crystal") {
            const h = 1.6 * scale;
            const ice = mix3(pal.sky, [0.8, 0.95, 1], 0.45);
            push(at.x, h * 0.45, at.z, 0.28 * scale, h, 0.28 * scale, 2, ice, 0.15, 0.55, at.psi);
            push(at.x, h * 0.2, at.z, 0.5 * scale, 0.35 * scale, 0.5 * scale, 2, mix3(ice, pal.flower2, 0.3), 0.18, 0.35, at.psi);
          } else if (prop.kind === "rock") {
            const rock = mix3(pal.soil, [0.15, 0.08, 0.06], 0.25);
            push(at.x, 0.28 * scale, at.z, 0.85 * scale, 0.48 * scale, 0.7 * scale, 1, rock, 0.75, 0.04, at.psi);
            push(at.x + sway, 0.52 * scale, at.z, 0.48 * scale, 0.36 * scale, 0.42 * scale, 1, mix3(rock, glow, 0.25), 0.6, 0.12, at.psi);
          } else if (prop.kind === "coral") {
            const coral = mix3(pal.flower, [1, 0.45, 0.55], 0.4);
            push(at.x, 0.35 * scale, at.z, 0.22 * scale, 0.7 * scale, 0.22 * scale, 0, pal.trunk, 0.6, 0.02, at.psi);
            push(at.x, 0.85 * scale, at.z, 0.55 * scale, 0.55 * scale, 0.55 * scale, 1, coral, 0.35, 0.2, at.psi);
            push(at.x + 0.2 * scale, 1.15 * scale, at.z, 0.32 * scale, 0.32 * scale, 0.32 * scale, 1, pal.flower2, 0.3, 0.35, at.psi);
          } else if (prop.kind === "ring") {
            const y = 1.55 * scale;
            const ring = mix3(pal.flower2, [1, 1, 1], 0.2);
            push(at.x, y, at.z, 0.95 * scale, 0.08 * scale, 0.95 * scale, 1, ring, 0.2, 0.65, at.psi);
            push(at.x, y, at.z, 0.28 * scale, 0.28 * scale, 0.28 * scale, 1, glow, 0.2, 0.8, at.psi);
          } else {
            drawCityMark(at, prop.kind, scale, pal);
          }
        }
      }
      const kind = pal.particles;
      const amt = usePlan ? plan.particleAmt : (Number(pal.particleAmt) || 0);
      if (!kind || kind === "none" || amt < 0.05 || reduced || n >= MAX - 24) return;
      if (((cz / 2) | 0) % 2 !== 0) return;
      const count = Math.min(2, Math.max(1, Math.round(amt * 3)));
      for (let i = 0; i < count && n < MAX - 16; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const at = onRoad(cz + i * 0.4, side * (3.1 + (i % 3) * 0.4));
        const bob = Math.sin((st.time || 0) * 1.5 + cz + i) * 0.15;
        let y = 1.05 + (i % 3) * 0.35 + bob;
        let rgb = pal.flower;
        let shape = 1;
        let sy = 0.06;
        if (kind === "snow") { y = 1.6 + bob; rgb = [0.95, 0.97, 1]; }
        else if (kind === "embers") { y = 0.45 + (i % 3) * 0.4; rgb = [1, 0.42, 0.12]; }
        else if (kind === "rain") { y = 1.7; rgb = [0.7, 0.84, 0.98]; shape = 0; sy = 0.28; }
        else if (kind === "stardust") { y = 1.9 + bob; rgb = [0.85, 0.92, 1]; }
        else if (kind === "sparkles") { rgb = i % 2 ? [1, 0.7, 0.9] : [1, 0.95, 0.55]; }
        else { rgb = [0.85, 1, 0.5]; }
        push(at.x, y, at.z, 0.07, sy, 0.07, shape, rgb, 0.2, 0.82, at.psi);
      }
    }
    for (let z = Math.floor(z0 / 2) * 2; z < z1; z += 2) {
      const cz = z + 1;
      const s0 = cz - 1;
      const s1 = cz + 1;
      const dist = cz - pz;
      for (let lane = 0; lane < 3; lane++) {
        const lat = laneX(lane);
        const spans = gapSpans(pieces, s0, s1, lane);
        const baseTop = lane === 1 ? pal.path : lane === 0 ? pal.grassL : pal.grassR;
        let cursor = s0;
        for (let i = 0; i <= spans.length; i++) {
          const end = i < spans.length ? spans[i][0] : s1;
          if (end - cursor > 0.04) {
            const yA = roadHeight(cursor, pieces);
            const yB = roadHeight(end, pieces);
            const span = end - cursor;
            // A steady grade is one ramp. A crest, where the grade changes,
            // breaks into shorter slabs so the ends still meet.
            const gradeSplit = Math.abs(roadGrade(cursor, pieces) - roadGrade(Math.max(cursor, end - 0.05), pieces)) > 0.015;
            const step = Math.abs(yB - yA) > 0.02 && gradeSplit ? 1 : span;
            const grass = 0;
            for (let s = cursor; s < end - 0.001; s += step) {
              const e = Math.min(end, s + step);
              const mid = (s + e) * 0.5;
              // Outer grass grows away from the road. Near the camera it
              // reaches the bottom corners; farther out it sits under buildings.
              const side = lane === 0 ? -1 : lane === 2 ? 1 : 0;
              // Low keeps the original grass width. Medium and High extend
              // it so the corners and the buildings have ground under them.
              const extra = side === 0 || !usePost ? 0 : (dist < 7 ? 5.5 : 3.6);
              const tile = onRoad(mid, lat + side * extra * 0.5);
              const slabW = 1.74 + extra;
              // A tenth of a step made each 2 m slab a different flat colour.
              const deck = roadHeight(mid, pieces);
              const grade = roadGrade(mid, pieces);
              // A ramp is one surface. The flat patchwork stays, and a slope
              // overlaps less so the tilted ends do not flicker.
              // One colour along the run. A per-slab tint was a stripe every 2 m.
              const top = baseTop;
              const lip = Math.abs(grade) > 0.001 ? 0.004 : 0.02;
              push(tile.x, deck + 0.02, tile.z, slabW, 0.12, e - s + lip, 0, top, lane === 1 ? 0.55 : 0.8, pal.custom && lane === 1 ? 0.08 : 0, tile.psi, 0, grade, grass);
            }
          }
          if (i < spans.length) cursor = spans[i][1];
        }
        for (let i = 0; i < spans.length; i++) {
          const a = spans[i][0];
          const b = spans[i][1];
          const mid = (a + b) / 2;
          const tile = onRoad(mid, lat);
          const lip = roadHeight(mid, pieces);
          const waterY = lip > 0.001 ? lip - 0.08 : -0.06;
          push(tile.x, waterY, tile.z, 1.72, 0.1, b - a + 0.04, 0, pal.water, 0.12, 0.1, tile.psi, 0, 0, 1);
          const spanLen = b - a;
          if (spanLen > 0.8 && laneHash(mid * 0.27 + lane * 5.1) > 0.38 && n < MAX - 160) {
            const off = (laneHash(mid * 0.53 + lane) - 0.5) * 0.7;
            const along = mid + (laneHash(mid * 0.91) - 0.5) * Math.min(0.6, spanLen * 0.3);
            const lily = onRoad(along, lat + off);
            const pad = 0.22 + laneHash(mid * 1.3 + lane) * 0.14;
            push(lily.x, (lip > 0.001 ? lip : 0) + 0.03, lily.z, pad, 0.04, pad * 0.86, 0, pal.lily, 0.5, 0.06, lily.psi);
            if (laneHash(mid * 1.7 + 3) > 0.62) {
              push(lily.x, (lip > 0.001 ? lip : 0) + 0.07, lily.z, 0.08, 0.08, 0.08, 1, pal.flower, 0.3, 0.35, lily.psi);
            }
          }
        }
      }
      deckLift = roadHeight(cz, pieces);
      const heldPal = pal;
      if (blendFrom && blendT < 1) pal = cz > propWave(pz, blendT) ? blendTo : blendFrom;
      const sceneGarden = !pal.custom && pal.biome === "garden";
      if (pal.custom) {
        if (dist < 36 && n < MAX - 80) drawMix(cz, dist);
      } else if (sceneGarden) {
      if (dist < 36 && ((z / 2) | 0) % 2 === 0) {
        const hv = laneHash(z * 0.19 + 4.2);
        const hedgeH = 0.30 + hv * 0.22;
        const hedgeW = 0.56 + hv * 0.22;
        const hedgeD = 3.5 + laneHash(z * 0.07) * 0.7;
        const tint = mix3(pal.hedge, hv > 0.5 ? pal.leaf : [0.08, 0.12, 0.06], Math.abs(hv - 0.5) * 0.35);
        const hedgeL = onRoad(cz, -3.35);
        const hedgeR = onRoad(cz, 3.35);
        if (usePost) contactShadow(hedgeL.x, hedgeL.z, hedgeL.psi, 0, 0.48);
        push(hedgeL.x, hedgeH * 0.5, hedgeL.z, hedgeW, hedgeH, hedgeD, 0, tint, 0.8, 0, hedgeL.psi);
        if (usePost) contactShadow(hedgeR.x, hedgeR.z, hedgeR.psi, 0, 0.48);
        push(hedgeR.x, hedgeH * 0.5, hedgeR.z, hedgeW, hedgeH, hedgeD, 0, tint, 0.8, 0, hedgeR.psi);
      }
      if (dist < 34) {
        const sway = reduced ? 0 : Math.sin(st.time * 1.15 + z * 0.17) * 0.06;
        for (const side of [-1, 1]) {
          if (laneHash(z * 0.17 + side * 13.0) > 0.62) continue;
          const kind = Math.floor(laneHash(z * 0.09 + side * 3.7) * 5);
          const scale = 0.78 + laneHash(z * 0.23 + side * 5.1) * 0.5;
          const lat = side * (4.85 + laneHash(z * 0.31 + 2.2) * 1.35);
          const along = cz + (laneHash(z * 0.47 + side * 8.0) - 0.5) * 1.6;
          drawTree(along, lat, kind, scale, dist < 16, sway);
        }
      }
      const stride = pal.density >= 0.75 ? 2 : pal.density >= 0.4 ? 4 : 8;
      if (dist < 24 && ((z / 2) | 0) % stride === 0) {
        const bloom = ((z / 2) | 0) % 4 === 0 ? pal.flower : pal.flower2;
        const side = ((z / 2) | 0) % 8 === 0 ? -1 : 1;
        const flower = onRoad(cz, side * 2.55);
        const stemH = 0.2 + laneHash(cz * 0.41 + side * 2.2) * 0.32;
        const stem = mix3(pal.leaf, pal.soil, 0.42);
        push(flower.x, stemH * 0.5, flower.z, 0.045, stemH, 0.045, 0, stem, 0.78, 0, flower.psi);
        push(flower.x, stemH + 0.1, flower.z, 0.2, 0.2, 0.2, 1, bloom, 0.35, 0.35, flower.psi);
        if (pal.density >= 0.75) {
          const extra = onRoad(cz + 0.4, -side * 2.15);
          const stem2 = 0.16 + laneHash(cz * 0.63 - side) * 0.2;
          push(extra.x, stem2 * 0.5, extra.z, 0.04, stem2, 0.04, 0, stem, 0.78, 0, extra.psi);
          push(extra.x, stem2 + 0.08, extra.z, 0.16, 0.16, 0.16, 1, pal.flower2, 0.3, 0.4, extra.psi);
        }
      }
      } else if (dist < 40 && n < MAX - 80) {
        const step8 = ((z / 2) | 0) % 4 === 0;
        const step4 = ((z / 2) | 0) % 2 === 0;
        if (pal.biome === "city") {
          if (step4) {
            const dash = onRoad(cz, 0);
            push(dash.x, 0.07, dash.z, 0.1, 0.02, 0.55, 0, [0.98, 0.9, 0.45], 0.3, 0.4, dash.psi);
          }
          if (step8) {
            drawCityStreet(cz);
            for (const side of [-1, 1]) {
              const lamp = onRoad(cz, side * 3.15);
              push(lamp.x, 0.9, lamp.z, 0.08, 1.8, 0.08, 0, [0.24, 0.26, 0.3], 0.45, 0.05, lamp.psi);
              push(lamp.x, 1.86, lamp.z, 0.2, 0.12, 0.2, 1, [1, 0.9, 0.55], 0.2, 0.9, lamp.psi);
            }
          }
        } else if (pal.biome === "space") {
          if (step4) {
            for (const side of [-1, 1]) {
              const rail = onRoad(cz, side * 0.92);
              push(rail.x, 0.08, rail.z, 0.07, 0.05, 1.5, 0, [0.45, 0.9, 1], 0.2, 0.85, rail.psi);
            }
          }
          if (step8) {
            const railCol = [0.55, 0.88, 1];
            for (const side of [-1, 1]) {
              const kind = laneHash(z * 0.37 + side * 4);
              if (kind > 0.62) {
                const at = onRoad(cz, side * (5.15 + laneHash(z * 0.2 + side) * 0.5));
                const r = 0.62 + laneHash(z + side) * 0.28;
                const body = laneHash(z * 0.4 + side) > 0.5 ? [0.62, 0.58, 0.95] : [0.78, 0.55, 0.42];
                contactShadow(at.x, at.z, at.psi, 0, r * 0.9);
                push(at.x, r, at.z, r * 2, r * 2, r * 2, 1, body, 0.42, 0.06, at.psi);
                push(at.x, r, at.z, r * 3.1, r * 0.1, r * 3.1, 1, [0.82, 0.9, 1], 0.22, 0.35, at.psi);
              } else if (kind > 0.28) {
                const at = onRoad(cz, side * (5.05 + laneHash(z + side) * 0.7));
                contactShadow(at.x, at.z, at.psi, 0, 0.4);
                push(at.x, 0.28, at.z, 0.72, 0.5, 0.62, 1, [0.62, 0.56, 0.5], 0.62, 0.05, at.psi);
              } else {
                const inner = side * 4.2;
                const outer = side * 6.05;
                const a = onRoad(cz, inner);
                const b = onRoad(cz, outer);
                const mid = onRoad(cz, (inner + outer) * 0.5);
                const h = 2.4;
                push(a.x, h * 0.5, a.z, 0.1, h, 0.1, 0, railCol, 0.25, 0.55, a.psi);
                push(b.x, h * 0.5, b.z, 0.1, h, 0.1, 0, railCol, 0.25, 0.55, b.psi);
                if (!barBlocksHero(pz - cz) && !nearCamera(mid.x, h, mid.z)) {
                  push(mid.x, h, mid.z, Math.abs(outer - inner), 0.09, 0.1, 0, railCol, 0.2, 0.75, mid.psi, 0, 0, 8);
                }
              }
            }
          }
        } else {
          if (step4) {
            const foam = onRoad(cz, 1.65);
            push(foam.x, 0.05, foam.z, 0.28, 0.02, 0.7, 0, [0.95, 0.98, 1], 0.3, 0.28, foam.psi);
          }
          if (step8) {
            for (const side of [-1, 1]) {
              const at = onRoad(cz, side * (4.6 + laneHash(z + side) * 0.4));
              if (usePost) contactShadow(at.x, at.z, at.psi, 0, 0.55);
              push(at.x, 0.9, at.z, 0.12, 1.8, 0.12, 0, [0.52, 0.36, 0.2], 0.7, 0, at.psi);
              push(at.x, 1.85, at.z, 0.85, 0.12, 0.28, 0, pal.leaf, 0.5, 0.06, at.psi);
              push(at.x, 1.9, at.z, 0.28, 0.1, 0.85, 0, pal.leaf2, 0.5, 0.06, at.psi);
              if (laneHash(z * 1.7 + side) > 0.55) {
                const buoy = onRoad(cz + 0.8, side * 3.15);
                push(buoy.x, 0.32, buoy.z, 0.26, 0.26, 0.26, 1, [0.95, 0.32, 0.3], 0.3, 0.25, buoy.psi);
              }
            }
          }
        }
      }
      pal = heldPal;
      deckLift = 0;
    }
    if (!pal.custom && !(pal.biome === "garden" && pal.mood === "day") && n < MAX - 12) {
      const motes = reduced ? 3 : 6;
      const moteRgb = pal.biome === "space" ? [0.7, 0.9, 1]
        : pal.biome === "city" ? [1, 0.72, 0.38]
        : pal.biome === "coast" ? [0.75, 0.95, 1]
        : [1, 0.88, 0.55];
      for (let i = 0; i < motes; i++) {
        const along = pz + 3 + i * 4.2;
        const lat = (i % 2 ? 1 : -1) * (3.3 + (i % 3) * 0.35);
        const at = onRoad(along, lat);
        const bob = reduced ? 0 : Math.sin((st.time || 0) * 1.4 + i) * 0.18;
        push(at.x, 1.1 + (i % 4) * 0.28 + bob, at.z, 0.06, 0.06, 0.06, 1, moteRgb, 0.2, 0.85, at.psi);
      }
    }

    function drawLoot(at, y, s, kind) {
      contactShadow(at.x, at.z, at.psi || spin, Math.max(0, y - s * 0.45), Math.max(0.28, s * 1.35));
      const yaw = (at.psi || spin) + (reduced ? 0 : (st.time || 0) * 3.2);
      if (kind === "star") {
        push(at.x, y, at.z, s * 1.35, s * 0.16, s * 1.35, 0, [1, 0.86, 0.28], 0.14, 0.9, yaw, 0.7, 0.6, 5);
        push(at.x, y, at.z, s * 0.5, s * 0.2, s * 0.5, 0, [1, 0.96, 0.6], 0.12, 0.95, yaw, 0.3, 0.8, 5);
      } else if (kind === "gem") {
        push(at.x, y, at.z, s * 0.9, s * 1.35, s * 0.28, 0, [0.45, 0.82, 1], 0.12, 0.9, yaw, 0.55, 0.7, 5);
      } else if (kind === "blossom") {
        push(at.x, y, at.z, s * 1.25, s * 0.16, s * 1.25, 0, [1, 0.55, 0.75], 0.22, 0.7, yaw, 0.2, 0.4, 5);
        push(at.x, y, at.z, s * 0.4, s * 0.2, s * 0.4, 0, [1, 0.92, 0.45], 0.16, 0.9, yaw, 0.2, 0.5, 5);
      } else if (kind === "apple") {
        push(at.x, y, at.z, s * 1.15, s * 1.2, s * 0.28, 0, [0.95, 0.32, 0.38], 0.28, 0.55, yaw, 0.15, 0.3, 5);
        push(at.x, y + s * 0.55, at.z, 0.06, 0.16, 0.06, 0, [0.35, 0.62, 0.28], 0.4, 0.1, yaw);
      } else {
        // A thin box yawed about Y. A marched coin was too heavy on SwiftShader.
        const diam = Math.max(0.62, s * 2.15);
        const thick = Math.max(0.055, s * 0.2);
        push(at.x, y, at.z, diam, diam, thick, 0, [1.0, 0.8, 0.2], 0.16, 0.72, yaw, 0.82, 0.85, 5);
      }
    }
    // Look is field 6. A stored look is kept. A phrase that left the word
    // out stays the first mesh until it blooms; a bloomed one changes
    // along the road. The hit stays put. A block reads taller than the
    // standing body and stays one lane wide. A hurdle stays low. A gate
    // keeps daylight under the bar.
    function variedLook(q, k) {
      const raw = q.length > 6 ? q[6] | 0 : 0;
      if (raw > 0 || !q.born) return raw;
      return 1 + (Math.floor(Math.abs(q[1]) * 0.37 + k) % 4);
    }

    function drawHurdle(q, zc, lane, sc, glow) {
      const look = variedLook(q, 3);
      const shadowAt = onRoad(zc, lane < 0 ? 0 : laneX(lane));
      contactShadow(shadowAt.x, shadowAt.z, shadowAt.psi, 0, lane < 0 ? 1.1 : 0.55);
      const hh = q[3] * sc;
      const wide = lane < 0;
      const lat0 = wide ? 0 : laneX(lane);
      const bar = onRoad(zc, lat0);
      const span = (wide ? 5.15 : 1.28) * (wide ? 1 : sc);
      const thick = Math.max(0.45, q[2]);
      if (look === 1) {
        const bodyH = Math.max(0.16, hh * 0.78);
        const cy = hh * 0.42;
        push(bar.x, cy, bar.z, span * 0.9, bodyH, thick * 0.7, 0, [0.58, 0.38, 0.22], 0.55, 0.06, bar.psi);
        const cap = Math.min(0.42, bodyH * 1.08);
        for (const side of [-1, 1]) {
          const tip = onRoad(zc, lat0 + side * span * 0.46);
          push(tip.x, cy, tip.z, cap, cap, cap, 1, [0.74, 0.52, 0.32], 0.4, 0.05, tip.psi);
        }
      } else if (look === 2) {
        const posts = wide ? [-2.15, -1.05, 0, 1.05, 2.15] : [lat0 - 0.42, lat0, lat0 + 0.42];
        const rail = wide ? span * 0.92 : span * 0.86;
        const railT = Math.max(0.06, hh * 0.16);
        push(bar.x, hh * 0.72, bar.z, rail, railT, 0.1, 0, pal.hurdle, 0.35, 0.2 + glow, bar.psi);
        push(bar.x, Math.max(0.08, hh * 0.28), bar.z, rail, railT, 0.1, 0, pal.hurdleTop, 0.35, 0.12, bar.psi);
        for (let i = 0; i < posts.length; i++) {
          const post = onRoad(zc, posts[i]);
          push(post.x, hh * 0.5, post.z, 0.12, Math.max(0.16, hh), 0.12, 0, [0.96, 0.94, 0.88], 0.45, 0.08, post.psi);
        }
      } else if (look === 3) {
        const hedgeH = Math.max(0.14, hh * 0.62);
        push(bar.x, hedgeH * 0.5, bar.z, span * 0.9, hedgeH, thick * 0.8, 0, pal.leaf, 0.6, 0.06, bar.psi);
        const blooms = wide ? [-1.7, -0.85, 0, 0.85, 1.7] : [lat0 - 0.32, lat0, lat0 + 0.32];
        const bulb = Math.max(0.12, Math.min(0.2, hh * 0.38));
        for (let i = 0; i < blooms.length; i++) {
          const flower = onRoad(zc, blooms[i]);
          const fy = Math.min(hedgeH + bulb * 0.2, Math.max(bulb * 0.5, hh - bulb * 0.45));
          push(flower.x, fy, flower.z, bulb, bulb, bulb, 1, i % 2 ? pal.flower : pal.flower2, 0.3, 0.35, flower.psi);
        }
      } else if (look === 4) {
        const spots = wide ? [-1.8, 0, 1.8] : [lat0];
        const drumH = Math.max(0.16, hh * 0.8);
        const drumW = Math.min(0.46, Math.max(0.26, drumH * 0.72));
        for (let i = 0; i < spots.length; i++) {
          const drum = onRoad(zc, spots[i]);
          push(drum.x, drumH * 0.5, drum.z, drumW, drumH, drumW, 0, [0.86, 0.22, 0.32], 0.4, 0.1, drum.psi);
          push(drum.x, drumH * 0.92, drum.z, drumW * 1.12, 0.07, drumW * 1.12, 0, [1, 0.86, 0.32], 0.3, 0.25, drum.psi);
        }
      } else {
        push(bar.x, hh * 0.42, bar.z, (wide ? span : 1.22 * sc) * 1.14, hh * 1.18, thick * sc * 1.1, 0, [1, 0.98, 0.9], 0.2, 0.92, bar.psi);
        push(bar.x, hh * 0.42, bar.z, wide ? span : 1.22 * sc, hh, thick * sc, 0, pal.hurdle, 0.4, 0.42 + glow, bar.psi);
        push(bar.x, hh * 0.92, bar.z, (wide ? span * 0.98 : 1.28 * sc), Math.max(0.12, hh * 0.22), thick * 0.9 * sc, 0, pal.hurdleTop, 0.35, 0.28 + glow, bar.psi);
      }
    }

    // Coarse skip once the closest point of the bar is through the eye.
    // A wide bar whose centre is still ahead fades in the shader instead,
    // so one end can cross the near plane without covering the picture.
    function nearestAhead(x, y, z, sx, sy, sz, yaw) {
      const dx = eye[0] - x;
      const dy = eye[1] - y;
      const dz = eye[2] - z;
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      const lx = c * dx - s * dz;
      const ly = dy;
      const lz = s * dx + c * dz;
      const hx = Math.abs(sx) * 0.5;
      const hy = Math.abs(sy) * 0.5;
      const hz = Math.abs(sz) * 0.5;
      const qx = Math.max(-hx, Math.min(hx, lx));
      const qy = Math.max(-hy, Math.min(hy, ly));
      const qz = Math.max(-hz, Math.min(hz, lz));
      const wx = c * qx + s * qz;
      const wz = -s * qx + c * qz;
      const fx = Math.sin(psi);
      const fz = Math.cos(psi);
      return (x + wx - eye[0]) * fx + (z + wz - eye[2]) * fz;
    }
    function nearCamera(x, y, z, sx, sy, sz, yaw) {
      if (sx > 0) return nearestAhead(x, y, z, sx, sy, sz, yaw) < 0.25;
      const dx = x - eye[0];
      const dy = y - eye[1];
      const dz = z - eye[2];
      const ahead = dx * Math.sin(psi) + dz * Math.cos(psi);
      return ahead < 0.35 || dx * dx + dy * dy + dz * dz < 0.5;
    }
    function gateBar(x, y, z, sx, sy, sz, rgb, rough, emit, yaw) {
      if (nearCamera(x, y, z, sx, sy, sz, yaw)) return;
      push(x, y, z, sx, sy, sz, 0, rgb, rough, emit, yaw, 0, 0, 8);
    }
    function drawGate(q, zc, sc, glow) {
      const look = variedLook(q, 4);
      const bottom = q[4];
      const barH = q[3];
      const gate = onRoad(zc, 0);
      const postL = onRoad(zc, -2.35);
      const postR = onRoad(zc, 2.35);
      const gy = (bottom + barH * 0.5) * sc + (1 - sc) * 0.2;
      const solid = gateBarDepth(q[2]);
      const span = 5.2 * sc;
      const postRgb = look === 2 ? pal.trunk : look === 1 ? [1, 0.82, 0.38] : look === 4 ? [0.95, 0.55, 0.62] : pal.gate;
      contactShadow(gate.x, gate.z, gate.psi, 0, 0.7);
      if (!nearCamera(postL.x, bottom * 0.5 * sc, postL.z)) {
        push(postL.x, bottom * 0.5 * sc, postL.z, 0.28, bottom * sc, 0.28, 0, postRgb, 0.4, 0.12, postL.psi);
        push(postR.x, bottom * 0.5 * sc, postR.z, 0.28, bottom * sc, 0.28, 0, postRgb, 0.4, 0.12, postR.psi);
      }
      if (barBlocksHero(pz - zc)) return;
      if (look === 1) {
        gateBar(gate.x, gy, gate.z, span, barH * sc * 0.62, solid * 0.85, [1, 0.55, 0.72], 0.25, 0.35 + glow, gate.psi);
        gateBar(gate.x, gy, gate.z, span, Math.max(0.05, barH * sc * 0.2), solid * 0.55, [1, 0.82, 0.38], 0.2, 0.45, gate.psi);
        const bow = 0.3 * sc;
        if (!nearCamera(gate.x, gy, gate.z)) push(gate.x, gy + barH * sc * 0.28, gate.z, bow, bow, bow, 1, [1, 0.42, 0.58], 0.22, 0.4, gate.psi);
      } else if (look === 2) {
        gateBar(gate.x, gy, gate.z, span, barH * sc, solid, pal.leaf, 0.45, 0.12 + glow, gate.psi);
        const leaves = [-1.6, -0.8, 0, 0.8, 1.6];
        const bulb = 0.18 * sc;
        for (let i = 0; i < leaves.length; i++) {
          const leaf = onRoad(zc, leaves[i]);
          push(leaf.x, gy + barH * sc * 0.22, leaf.z, bulb, bulb, bulb, 1, i % 2 ? pal.leaf2 : pal.leaf, 0.4, 0.1, leaf.psi);
        }
      } else if (look === 3) {
        gateBar(gate.x, gy, gate.z, span, Math.max(0.05, barH * sc * 0.22), solid * 0.7, [0.42, 0.32, 0.2], 0.4, 0.08, gate.psi);
        const bulbs = [-1.8, -0.9, 0, 0.9, 1.8];
        const bulb = 0.18 * sc;
        for (let i = 0; i < bulbs.length; i++) {
          const lamp = onRoad(zc, bulbs[i]);
          push(lamp.x, gy, lamp.z, bulb, bulb, bulb, 1, [1, 0.92, 0.55], 0.15, 0.9, lamp.psi);
        }
      } else if (look === 4) {
        const a = onRoad(zc - 0.04, 0);
        const b = onRoad(zc + 0.05, 0);
        gateBar(a.x, gy, a.z, span * 0.98, barH * sc * 0.7, solid * 0.72, [0.95, 0.42, 0.55], 0.3, 0.22 + glow, a.psi);
        gateBar(b.x, gy, b.z, span, barH * sc * 0.42, solid * 0.55, [0.98, 0.82, 0.55], 0.28, 0.18, b.psi);
      } else {
        const thick = Math.max(0.45, q[2]);
        gateBar(gate.x, gy, gate.z, 5.45 * sc, barH * sc * 1.45, Math.max(0.28, thick * 0.5), [1, 0.97, 0.86], 0.18, 0.95, gate.psi);
        gateBar(gate.x, gy, gate.z, span, barH * sc, solid, pal.gate, 0.28, 0.78 + glow, gate.psi);
      }
    }

    // Pale quads along one lane, sampled so a bend stays under the stripe.
    // This is a read, not a hit box.
    function laneStripe(fromS, toS, lat, rgb) {
      const a = Math.min(fromS, toS);
      const b = Math.max(fromS, toS);
      const len = b - a;
      if (len < 0.5) return;
      const nSeg = Math.min(12, Math.max(1, Math.ceil(len / 1.7)));
      const step = len / nSeg;
      for (let i = 0; i < nSeg; i++) {
        const s = a + (i + 0.5) * step;
        const at = onRoad(s, lat);
        const savedLift = deckLift;
        deckLift = 0;
        push(at.x, roadHeight(s, pieces) + 0.05, at.z, 1.2, 0.022, step * 0.92, 0, rgb, 0.35, 0.55, at.psi, 0, roadGrade(s, pieces));
        deckLift = savedLift;
      }
    }

    function paintLane(q, lat, rgb, reachOverride) {
      const reach = reachOverride || Math.max(14, speed * 1.3);
      const ahead = q[1] - pz;
      if (ahead < reach && q[1] + (q[2] || 0) > pz - 1) {
        laneStripe(Math.max(pz - 0.3, q[1] - reach), q[1] + 0.2, lat, rgb);
      }
    }

    // Round body on one lane. The stripe runs the lane from the moment
    // the toy is in view, and the burst stays the small one.
    function drawPopper(q, here) {
      const yaw = here.psi;
      const phase = q.length > 6 ? q[6] : 0;
      if (phase > 0.5) {
        const fuse = q.length > 9 ? q[9] : 0;
        const life = Math.max(0, Math.min(1, fuse / 0.45));
        const grow = (reduced ? 0.85 : 0.35 + (1 - life) * 1.15);
        const y = 0.55 * grow;
        push(here.x, y, here.z, 1.15 * grow, 1.15 * grow, 1.15 * grow, 1, [1, 0.72, 0.28], 0.2, 0.85, yaw);
        push(here.x, y * 0.72, here.z, 0.7 * grow, 0.7 * grow, 0.7 * grow, 1, [1, 0.95, 0.75], 0.15, 0.95, yaw);
        if (!q.puffed) {
          q.puffed = 1;
          burst(here.x, 0.6, here.z, [1, 0.78, 0.3], 10, 0.12, 0, yaw);
        }
        return;
      }
      const popLane = q.length > 5 && q[5] >= 0 ? q[5] : 1;
      paintLane(q, laneX(popLane), [1, 0.55, 0.12]);
      const cy = q[4] + q[3] * 0.5;
      const rad = 0.32;
      contactShadow(here.x, here.z, yaw, cy, 0.42);
      push(here.x, cy, here.z, rad * 2, rad * 2, rad * 2, 1, [0.95, 0.42, 0.16], 0.3, 0.22, yaw);
      push(here.x, cy, here.z, rad * 2.05, 0.08, rad * 2.05, 0, [1, 0.86, 0.42], 0.25, 0.35, yaw);
      push(here.x, cy + rad + 0.08, here.z, 0.05, 0.16, 0.05, 0, [0.35, 0.22, 0.12], 0.5, 0.05, yaw);
      const spark = reduced || Math.sin((st.time || 0) * 16 + q[1]) > 0 ? 0.95 : 0.25;
      push(here.x, cy + rad + 0.18, here.z, 0.08, 0.08, 0.08, 1, [1, 0.95, 0.55], 0.1, spark, yaw);
    }

    // Kind 10 runs the lane toward the hero. The warm stripe is the
    // lane it is hunting. A jump or another lane misses it.
    // Look 0 fox, 1 bird, 2 beetle drawn as a bee. The hit half-width
    // stays in the sim; this only picks a body.
    const RIVAL_PLANS = ["fox", "bird", "bee"];
    function rivalPlan(code) {
      const n = Math.round(Number(code) || 0);
      const i = ((n % RIVAL_PLANS.length) + RIVAL_PLANS.length) % RIVAL_PLANS.length;
      return RIVAL_PLANS[i];
    }
    function rivalTint(plan) {
      if (plan === "bird") return [0.55, 0.78, 0.95];
      if (plan === "bee") return [0.98, 0.82, 0.28];
      return [0.95, 0.48, 0.22];
    }
    function drawRival(q, here) {
      const look = Math.round(q.length > 6 ? q[6] : 0);
      const lane = q.length > 5 && q[5] >= 0 ? q[5] : 1;
      const face = here.psi + Math.PI;
      const lat = laneX(lane);
      const plan = rivalPlan(look);
      const toX = -Math.sin(here.psi);
      const toZ = -Math.cos(here.psi);
      const at = (ahead, y) => [here.x + toX * ahead, y, here.z + toZ * ahead];
      paintLane(q, lat, [1, 0.38, 0.22], 22);
      contactShadow(here.x, here.z, here.psi, 0, 0.4);
      const tint = rivalTint(plan);
      push(here.x, 0.11, here.z, 0.86, 0.035, 0.86, 2, tint, 0.25, reduced ? 0.2 : 0.42, face);
      if (!reduced) {
        for (let i = 1; i <= 3; i++) {
          const bead = at(-0.38 * i, 0.48 + Math.sin((st.time || 0) * 7 + i) * 0.06);
          const s = 0.18 - i * 0.035;
          push(bead[0], bead[1], bead[2], s, s, s, 1, tint, 0.18, 0.45 + (3 - i) * 0.12, face);
        }
      }
      spin = face;
      const bob = reduced ? 0 : Math.sin((st.time || 0) * 8) * 0.04;
      drawBody(plan, here.x, bob, here.z, tint, st.time || 0, reduced);
      spin = 0;
      const mark = at(0.1, 1.05 + bob);
      push(mark[0], mark[1], mark[2], 0.16, 0.08, 0.08, 0, [0.9, 0.18, 0.14], 0.3, 0.55, face);
      if (q.flare) {
        const kind = q.flare;
        q.flare = "";
        const sparkAt = at(0.05, 0.85);
        const rgb = kind === "coin" ? [1, 0.86, 0.35]
          : kind === "clear" ? [0.55, 0.92, 1]
          : [1, 0.45, 0.22];
        burst(sparkAt[0], sparkAt[1], sparkAt[2], rgb, 8, 0.07, kind === "coin" ? 3 : 0, face);
      }
    }

    // The level ends at this arc. Two posts and a ribbon, only while
    // the line is in view. It is not a piece, so a pattern stays fair.
    function drawFinish(goal) {
      if (!(goal > 24)) return;
      if (goal < pz - 6 || goal > pz + 46) return;
      const left = onRoad(goal, -2.35);
      const right = onRoad(goal, 2.35);
      const mid = onRoad(goal, 0);
      push(left.x, 1.15, left.z, 0.18, 2.3, 0.18, 0, [0.98, 0.95, 0.88], 0.35, 0.1, left.psi);
      push(right.x, 1.15, right.z, 0.18, 2.3, 0.18, 0, [0.98, 0.95, 0.88], 0.35, 0.1, right.psi);
      push(mid.x, 2.22, mid.z, 4.9, 0.16, 0.12, 0, [0.93, 0.34, 0.38], 0.25, 0.4, mid.psi);
      push(mid.x, 2.08, mid.z, 4.5, 0.08, 0.08, 0, [1, 0.84, 0.38], 0.22, 0.35, mid.psi);
      push(mid.x, 2.52, mid.z, 0.36, 0.28, 0.06, 0, [1, 0.84, 0.38], 0.25, 0.45, mid.psi);
    }

    function drawBlock(q, zc, lane, sc, glow) {
      const look = variedLook(q, 7);
      const lat = laneX(lane < 0 ? 1 : lane);
      const here = onRoad(zc, lat);
      const yaw = here.psi;
      contactShadow(here.x, here.z, yaw, 0, 0.55 * sc);
      if (look === 1) {
        push(here.x, 0.62 * sc, here.z, 0.78 * sc, 1.24 * sc, 0.78 * sc, 0, [0.52, 0.34, 0.2], 0.6, 0.05, yaw, 0, 0, 3);
        push(here.x, 1.3 * sc, here.z, 0.98 * sc, 0.18 * sc, 0.98 * sc, 0, [0.7, 0.5, 0.32], 0.45, 0.08, yaw, 0, 0, 3);
        push(here.x, 1.46 * sc, here.z, 0.66 * sc, 0.14 * sc, 0.66 * sc, 0, [0.62, 0.42, 0.26], 0.5, 0.06, yaw, 0, 0, 3);
      } else if (look === 2) {
        push(here.x, 0.48 * sc, here.z, 0.38 * sc, 0.96 * sc, 0.38 * sc, 0, [0.96, 0.9, 0.78], 0.4, 0.06, yaw);
        push(here.x, 1.12 * sc, here.z, 1.05 * sc, 0.36 * sc, 1.05 * sc, 0, [0.9, 0.24, 0.3], 0.35, 0.1, yaw);
        push(here.x, 1.32 * sc, here.z, 0.52 * sc, 0.4 * sc, 0.52 * sc, 1, [0.92, 0.28, 0.32], 0.3, 0.12, yaw);
        const spots = [[-0.22, 0.04], [0.2, -0.08], [0.02, 0.16]];
        for (let i = 0; i < spots.length; i++) {
          const spot = onRoad(zc + spots[i][1], lat + spots[i][0]);
          push(spot.x, 1.2 * sc, spot.z, 0.14 * sc, 0.14 * sc, 0.14 * sc, 1, [1, 0.97, 0.92], 0.2, 0.25, spot.psi);
        }
      } else if (look === 3) {
        push(here.x, 0.68 * sc, here.z, 0.92 * sc, 1.36 * sc, 0.92 * sc, 0, [0.76, 0.52, 0.28], 0.5, 0.06, yaw);
        push(here.x, 0.72 * sc, here.z, 0.98 * sc, 0.08 * sc, 0.98 * sc, 0, [0.5, 0.32, 0.16], 0.45, 0.04, yaw);
        push(here.x, 1.46 * sc, here.z, 0.26 * sc, 0.26 * sc, 0.26 * sc, 1, [0.95, 0.32, 0.38], 0.3, 0.2, yaw);
        push(here.x, 1.62 * sc, here.z, 0.05 * sc, 0.1 * sc, 0.05 * sc, 0, pal.leaf, 0.4, 0.08, yaw);
      } else if (look === 4) {
        const blobs = [[0, 0.5, 0.7, pal.leaf], [-0.22, 0.62, 0.52, pal.leaf2], [0.22, 0.58, 0.52, pal.leaf], [0, 1.05, 0.58, pal.leaf2], [0.02, 1.34, 0.4, pal.leaf]];
        for (let i = 0; i < blobs.length; i++) {
          const blob = blobs[i];
          const at = onRoad(zc, lat + blob[0]);
          push(at.x, blob[1] * sc, at.z, blob[2] * sc, blob[2] * sc, blob[2] * sc, 1, blob[3], 0.45, 0.08, at.psi);
        }
        const bloom = onRoad(zc, lat + 0.05);
        push(bloom.x, 1.52 * sc, bloom.z, 0.18 * sc, 0.18 * sc, 0.18 * sc, 1, pal.flower, 0.3, 0.45, bloom.psi);
      } else {
        const pot = 0.98 * sc;
        push(here.x, 0.46 * sc, here.z, pot * 1.08, 0.92 * sc, pot * 1.08, 0, [1, 0.96, 0.84], 0.2, 0.9, yaw);
        push(here.x, 0.46 * sc, here.z, pot, 0.84 * sc, pot, 0, pal.pot, 0.38, 0.48 + glow, yaw);
        push(here.x, 0.98 * sc, here.z, pot * 1.1, 0.16 * sc, pot * 1.1, 0, pal.potRim, 0.35, 0.05, yaw);
        push(here.x, 1.28 * sc, here.z, 0.62 * sc, 0.5 * sc, 0.62 * sc, 1, pal.leaf, 0.55, 0.08, yaw);
      }
    }

    // A generated thing on its stretch. The hit box comes from the piece;
    // the thing only decides how that box looks.
    const tTime = st.time || 0;
    function thingAnim(th, phase) {
      // Obstacles keep their box: no spin, only the small bob the checker allows.
      if (th.role === "jump" || th.role === "slide") {
        return th.anim.kind === "bob" ? [0, animOf(th, tTime, phase, reduced)[1]] : [0, 0];
      }
      return animOf(th, tTime, phase, reduced);
    }
    function thingHurdle(q, th, zc, lane, sc) {
      const hh = q[3] * sc;
      const wide = lane < 0;
      const tiles = wide ? 4 : 1;
      const span = wide ? 5.15 : 1.28 * sc;
      const tw = span / tiles;
      const thick = Math.max(0.45, q[2]) * sc;
      const grow = growOf(th.id, nowMs, reduced);
      for (let t = 0; t < tiles; t++) {
        const lat = wide ? -span / 2 + tw * (t + 0.5) : laneX(lane);
        const at = onRoad(zc, lat);
        placeThing(th, { x: at.x, y: 0, z: at.z, psi: at.psi, w: tw * 0.96, h: hh, d: thick },
          { grow, anim: thingAnim(th, q[1] + t) });
      }
    }
    function thingGate(q, th, zc, sc) {
      const bottom = q[4] * sc;
      const barH = q[3] * sc;
      const postL = onRoad(zc, -2.35);
      const postR = onRoad(zc, 2.35);
      if (!nearCamera(postL.x, bottom * 0.5, postL.z)) {
        push(postL.x, bottom * 0.5, postL.z, 0.28, bottom, 0.28, 0, pal.gate, 0.4, 0.12, postL.psi);
        push(postR.x, bottom * 0.5, postR.z, 0.28, bottom, 0.28, 0, pal.gate, 0.4, 0.12, postR.psi);
      }
      // Daylight under the bar stays: the tiles start at the bar's bottom
      // and only grow upward.
      const tiles = 4;
      const span = 5.2 * sc;
      const tw = span / tiles;
      const th2 = Math.max(barH, 0.9 * sc);
      const depth = gateBarDepth(q[2]) * 1.4;
      const grow = growOf(th.id, nowMs, reduced);
      const midBar = onRoad(zc, 0);
      if (nearCamera(midBar.x, bottom + th2 * 0.5, midBar.z)) return;
      for (let t = 0; t < tiles; t++) {
        const at = onRoad(zc, -span / 2 + tw * (t + 0.5));
        placeThing(th, { x: at.x, y: bottom, z: at.z, psi: at.psi, w: tw * 0.96, h: th2, d: depth },
          { grow, anim: thingAnim(th, t) });
      }
    }
    function thingPickup(q, th, here, sc) {
      const box = 0.72 * sc;
      const grow = growOf(th.id, nowMs, reduced);
      placeThing(th, { x: here.x, y: q[4] * sc - box * 0.5, z: here.z, psi: here.psi, w: box, h: box, d: box },
        { grow, anim: thingAnim(th, q[1] * 1.7), glow: 0.1 });
    }
    const thingChunks = Array.isArray(st.thingChunks) ? st.thingChunks : [];
    for (const tc of thingChunks) {
      const th = tc.thing;
      if (!th || tc.x1 < z0 || tc.x0 > z1) continue;
      if (th.role === "decor") {
        const grow = growOf(th.id, nowMs, reduced);
        const sz = th.size;
        const spots = [tc.x0 + 3, tc.x0 + (tc.x1 - tc.x0) * 0.55];
        for (let j = 0; j < spots.length; j++) {
          if (spots[j] < z0 || spots[j] > z1) continue;
          const side = (j + Math.floor(tc.x0)) % 2 ? 1 : -1;
          const at = onRoad(spots[j], side * 3.9);
          placeThing(th, { x: at.x, y: 0, z: at.z, psi: at.psi, w: 1.3 * sz, h: 1.7 * sz, d: 1.3 * sz },
            { grow, anim: thingAnim(th, spots[j]), deck: Math.abs(side * 3.9) <= DECK });
        }
      } else if (th.role === "pal" && pz >= tc.x0 && pz < tc.x1) {
        const grow = growOf(th.id, nowMs, reduced);
        const sz = th.size;
        const at = onRoad(pz + 1.6, 2.7);
        placeThing(th, { x: at.x, y: 0.05, z: at.z, psi: at.psi, w: 0.9 * sz, h: 0.9 * sz, d: 0.9 * sz },
          { grow, anim: thingAnim(th, 0) });
      }
    }

    for (let i = 0; i < pieces.length; i++) {
      const q = pieces[i];
      const k = q[0];
      if (k === 0 || k === 1 || k === 2) continue;
      const zc = q[1] + q[2] * 0.5;
      if (zc < z0 || zc > z1) continue;
      const lane = q.length > 5 ? q[5] : -1;
      const sc = sproutOf(q, pz);
      // Piece y on these kinds is relative to the road. A popper already
      // stores a world height. Flat roads add nothing.
      deckLift = (k === 3 || k === 4 || k === 5 || k === 6 || k === 7 || k === 8 || k === 10)
        ? roadHeight(zc, pieces) : 0;
      const glow = q.born ? 0.16 : 0;
      const lootKind = typeof st.loot === "string" ? st.loot : "coin";
      const here = onRoad(zc, laneX(lane < 0 ? 1 : lane));
      const th = q.thing;
      if (k === 3 && th && th.role === "jump") {
        casting = wantShadow;
        thingHurdle(q, th, zc, lane, sc);
        casting = false;
      } else if (k === 4 && th && th.role === "slide") {
        casting = wantShadow;
        thingGate(q, th, zc, sc);
        casting = false;
      } else if (k === 5 && th && th.role === "pickup") {
        thingPickup(q, th, here, sc);
      } else if (k === 3) {
        casting = wantShadow;
        drawHurdle(q, zc, lane, sc, glow);
        casting = false;
      } else if (k === 4) {
        casting = wantShadow;
        drawGate(q, zc, sc, glow);
        casting = false;
      } else if (k === 5) {
        const bobc = reduced ? 0 : Math.sin(st.time * 4.6 - q[1] * 1.7) * 0.1;
        const ripple = reduced ? 1 : 1 + Math.sin(st.time * 4.6 - q[1] * 1.7) * 0.08;
        const s = 0.34 * sc * ripple;
        spin = here.psi;
        drawLoot(here, (q[4] + bobc) * sc, s, lootKind);
        const mate = nextCoin(pieces, q);
        if (mate) {
          const mateS = mate[1] + mate[2] * 0.5;
          const midS = (zc + mateS) / 2;
          const midY = (q[4] + bobc + mate[4]) * 0.5;
          const bead = onRoad(midS, laneX(lane < 0 ? 1 : lane));
          drawLoot(bead, midY * sc, s * 0.42, lootKind);
        }
        spin = 0;
      } else if (k === 6) {
        push(here.x, 0.06, here.z, Math.max(0.7, q[2]) * sc, 0.1, 0.72 * sc, 0, pal.spring, 0.35, 0.2, here.psi);
        push(here.x, 0.28 * sc, here.z, 0.32 * sc, 0.32 * sc, 0.32 * sc, 1, pal.spring, 0.3, 0.55, here.psi);
      } else if (k === 7) {
        casting = wantShadow;
        drawBlock(q, zc, lane, sc, glow);
        casting = false;
      } else if (k === 8) {
        paintLane(q, laneX(lane < 0 ? 1 : lane), [0.7, 0.9, 1]);
        const vis = q.length > 6 ? q[6] : 0;
        const bob = reduced ? 0 : Math.sin((st.time || 0) * 5 + q[1]) * 0.08;
        const fy = (q[4] + q[3] * 0.5 + bob) * sc;
        const yaw = here.psi;
        if (vis === 1) {
          push(here.x, fy, here.z, 0.42 * sc, 0.42 * sc, 0.42 * sc, 1, [0.72, 0.9, 1], 0.08, 0.35, yaw);
          push(here.x, fy + 0.1, here.z, 0.14 * sc, 0.14 * sc, 0.14 * sc, 1, [1, 1, 1], 0.05, 0.7, yaw);
        } else if (vis === 2) {
          push(here.x, fy, here.z, 0.28 * sc, 0.38 * sc, 0.28 * sc, 0, [1, 0.72, 0.28], 0.3, 0.55, yaw);
          push(here.x, fy + 0.26 * sc, here.z, 0.16 * sc, 0.1 * sc, 0.16 * sc, 0, [0.55, 0.32, 0.16], 0.4, 0.1, yaw);
        } else if (vis === 3) {
          push(here.x, fy, here.z, 0.58 * sc, 0.08 * sc, 0.28 * sc, 0, [0.42, 0.75, 0.32], 0.45, 0.12, yaw);
        } else if (vis === 4) {
          push(here.x, fy, here.z, 0.36 * sc, 0.36 * sc, 0.36 * sc, 1, [1, 0.45, 0.55], 0.25, 0.2, yaw);
        } else {
          push(here.x, fy, here.z, 0.64 * sc, 0.06 * sc, 0.22 * sc, 0, [0.94, 0.97, 1], 0.3, 0.18, yaw);
          push(here.x, fy, here.z, 0.16 * sc, 0.08 * sc, 0.48 * sc, 0, [0.45, 0.72, 0.95], 0.28, 0.12, yaw);
        }
      } else if (k === 9) {
        casting = wantShadow;
        drawPopper(q, here);
        casting = false;
      } else if (k === 10) {
        casting = wantShadow;
        drawRival(q, here);
        casting = false;
      }
    }
    deckLift = 0;

    // Spoken toys stand beside the road, in the same frame as the runner.
    // They are pictures only: the lateral offset keeps them off the lanes.
    const roster = Array.isArray(st.shown) ? st.shown : [];
    for (let i = 0; i < roster.length && i < 4; i++) {
      const toy = roster[i];
      if (!toy || !toy.parts) continue;
      const box = showBox(toy, i);
      const at = onRoad(pz + box.ahead, box.lat);
      placeThing(toy, {
        x: at.x, y: box.y, z: at.z, psi: at.psi,
        w: box.w, h: box.h, d: box.d,
      }, {
        grow: growOf(toy.id, nowMs, reduced),
        anim: thingAnim(toy, i * 0.7),
        deck: Math.abs(box.lat) <= DECK,
      });
    }

    // Spoken sun, moon and plane sit in the view. The camera looks slightly
    // down, so these heights stay inside the frame instead of above it.
    const skyNow = visibleSky(st.props, st.sunHide);
    if (skyNow.sun) {
      const at = onRoad(pz + 7, -5.2);
      const y = 5.0;
      push(at.x, y, at.z, 2.2, 2.2, 2.2, 1, [1, 0.86, 0.32], 0.18, 0.95, at.psi);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + (reduced ? 0 : tTime * 0.3);
        const ray = onRoad(pz + 7 + Math.cos(a) * 0.15, -5.2 + Math.sin(a) * 1.7);
        push(ray.x, y + Math.sin(a) * 1.45, ray.z, 0.16, 0.55, 0.16, 0, [1, 0.93, 0.55], 0.3, 0.75, at.psi);
      }
    }
    if (skyNow.moon) {
      const at = onRoad(pz + 9, 5.8);
      const y = 5.3;
      push(at.x, y, at.z, 1.7, 1.7, 1.7, 1, [0.93, 0.95, 1], 0.22, 0.62, at.psi);
      const crater = onRoad(pz + 9.1, 6.15);
      push(crater.x, y + 0.2, crater.z, 0.36, 0.36, 0.36, 1, [0.75, 0.8, 0.95], 0.4, 0.2, at.psi);
    }
    if (skyNow.plane) {
      const sway = reduced ? 0 : Math.sin(tTime * 0.7) * 2.4;
      const bob = reduced ? 0 : Math.sin(tTime * 1.5) * 0.25;
      const at = onRoad(pz + 16, sway);
      const y = 3.8 + bob;
      const yaw = at.psi;
      push(at.x, y, at.z, 0.34, 0.26, 1.45, 0, [0.96, 0.98, 1], 0.32, 0.22, yaw);
      push(at.x, y, at.z, 2.15, 0.08, 0.38, 0, [0.55, 0.78, 0.98], 0.32, 0.16, yaw);
      const tail = onRoad(pz + 15.35, sway);
      push(tail.x, y + 0.26, tail.z, 0.08, 0.4, 0.26, 0, [0.98, 0.55, 0.42], 0.32, 0.14, yaw);
      const nose = onRoad(pz + 16.7, sway);
      push(nose.x, y, nose.z, 0.2, 0.2, 0.2, 1, [1, 0.74, 0.38], 0.28, 0.28, yaw);
    }
    deckLift = roadHeight(Number(st.goal) || 0, roadPieces);
    drawFinish(st.goal);
    deckLift = 0;

    const heading = feet.psi;
    const ax = roadAxes(heading);
    if (st.event === "ward") burst(rx, py + 0.7, rz, [0.72, 0.9, 1], 8, 0.04, 4, heading);
    if (st.event === "coin") {
      const kind = typeof st.loot === "string" ? st.loot : "coin";
      const rich = kind === "gem" ? [18, 0.11, 4]
        : kind === "star" ? [14, 0.09, 3]
        : kind === "apple" ? [10, 0.07, 2]
        : kind === "blossom" ? [10, 0.07, 1]
        : [8, 0.05, 0];
      burst(rx, py + 0.9, rz, pal.coin, rich[0], rich[1], rich[2], heading);
      if (!reduced) {
        const plus = mulMatPoint(proj, mulMatPoint(view, [rx, py + 0.9, rz, 1]));
        if (plus[3] > 0.05) flyPlus(plus[0] / plus[3] * 0.5 + 0.5, plus[1] / plus[3] * 0.5 + 0.5);
      }
    }
    if (st.event === "spring") burst(rx, py + 0.4, rz, pal.spring, 8, 0.08, 0, heading);
    if (st.near) burst(rx + ax.tx * 0.4, py + 0.7, rz + ax.tz * 0.4, pal.sun, 6, 0.02, 0, heading);
    if (st.duel === "pass" || st.duel === "ahead") {
      const passed = st.duel === "pass";
      burst(rx + ax.tx * (passed ? 1.1 : -0.4), py + 0.8, rz + ax.tz * (passed ? 1.1 : -0.4),
        passed ? [1, 0.84, 0.35] : [1, 0.45, 0.38], 10, 0.08, passed ? 3 : 2, heading);
    }
    if (land > 0.85) burst(rx, floorDraw + 0.15, rz, pal.path, 4, 0.01, 0, heading);
    if (st.reject) burst(rx + ax.tx * 2, 1.6, rz + ax.tz * 2, pal.flower, 10, 0.06, 0, heading);
    if (!reduced && alive && rel <= 0.06) {
      if (justLanded) puffDust(rx, floorDraw + 0.06, rz, heading, 5, 0.7);
      else if (speed >= 8) {
        dustStep++;
        const every = speed >= 12 ? 3 : 6;
        if (dustStep >= every) {
          dustStep = 0;
          const side = Math.sin((st.time || 0) * 9) > 0 ? 0.14 : -0.14;
          const foot = sample(drawS, px + side);
          puffDust(foot.x, floorDraw + 0.05, foot.z, foot.psi, 1, 0.32);
        }
      }
    }

    drawPals(st.pals, drawS, st.time || 0, reduced);

    const air = rel > 0.08;
    const sliding = st.slide > 0;
    const freq = reduced || !alive ? 0 : (9.2 + speed * 0.35);
    const swing = Math.sin((st.time || 0) * freq);
    const stride = Math.cos((st.time || 0) * freq);
    const shaped = heroShape(air, land, reduced ? 0 : lean, activeProfile.tier);
    const squash = !alive ? 1 : shaped.squash;
    const widen = !alive ? 1 : shaped.widen;
    const leanLat = reduced ? 0 : shaped.lean;
    // Uphill leans the body forward, downhill leans it back. The feet stay
    // on the road. Flat grade leaves the pose where it was.
    const posture = air || sliding || reduced ? 0 : Math.max(-0.14, Math.min(0.14, roadGrade(drawS, roadPieces) * 1.05));
    const spot = (ds, dlat) => sample(drawS + ds, px + dlat);
    const hero = st.hero || {};
    const heroPlan = hero.plan || "keeper";
    const dressed = !drawsKeeper(hero);
    spin = feet.psi;
    const blinkOff = !!(st.blink && Math.floor((st.time || 0) * 8) % 2 === 0);
    if (alive) {
      if (!wantShadow) {
        const shadow = spot(0, 0);
        push(shadow.x, floorDraw + 0.02, shadow.z, sliding ? 0.95 : 0.62, 0.025, sliding ? 0.9 : 0.5, 0, [0.18, 0.12, 0.08], 1, 0);
      }
      if (!blinkOff) {
      casting = wantShadow;
      if ((st.g || 32) < 26) {
        const glow = [0.78, 0.92, 1];
        const bob = reduced ? 0 : Math.sin((st.time || 0) * 3) * 0.02;
        const footL = spot(0.02, leanLat - 0.16);
        const footR = spot(0.02, leanLat + 0.16);
        push(footL.x, floorDraw + 0.05 + bob, footL.z, 0.18, 0.04, 0.18, 1, glow, 0.25, reduced ? 0.2 : 0.45);
        push(footR.x, floorDraw + 0.05 + bob, footR.z, 0.18, 0.04, 0.18, 1, glow, 0.25, reduced ? 0.2 : 0.45);
      }
      if (dressed) {
        const at = spot(sliding ? 0.12 : 0, leanLat);
        drawBody(heroPlan, at.x, py + (sliding ? -0.22 : 0), at.z, palRgb(hero), st.time || 0, reduced);
      } else {
        if (!sliding) {
          const leg = air ? -0.12 : swing * 0.32;
          const legL = spot(leg, -0.16 + leanLat);
          const legR = spot(-leg, 0.16 + leanLat);
          push(legL.x, py + 0.22, legL.z, 0.14, 0.4, 0.15, 0, pal.bodyDeep, 0.45, 0.02);
          push(legR.x, py + 0.22, legR.z, 0.14, 0.4, 0.15, 0, pal.bodyDeep, 0.45, 0.02);
        }
        const torsoY = py + (sliding ? 0.3 : 0.5 * squash) - posture * 0.12;
        const torso = sliding ? 0.52 : 0.46 * widen;
        const hip = spot(posture * 0.4, leanLat);
        push(hip.x, torsoY, hip.z, torso, sliding ? 0.3 : 0.42 * squash, sliding ? 0.62 : 0.4, 0, pal.body, 0.35, 0.14);
        const hy = torsoY + (sliding ? 0.16 : 0.34 * squash) - posture * 0.2;
        const head = spot(sliding ? 0.16 : posture, leanLat * 0.2);
        push(head.x, hy, head.z, sliding ? 0.32 : 0.44, sliding ? 0.26 : 0.4, sliding ? 0.3 : 0.4, 1, pal.head, 0.2, 0.28);
        if (!sliding) {
          const flame = reduced ? 0 : Math.sin(st.time * 11) * 0.035;
          const tuft = spot(-0.02, leanLat * 0.15);
          push(tuft.x, hy + 0.32 + flame + pulse * 0.05, tuft.z, 0.13, 0.3, 0.13, 1, pal.cape, 0.12, 1);
        }
      }
      drawGear(spot, py, leanLat, sliding, st.time || 0, reduced, st.gear || 1, st.ward == null ? 1 : st.ward, pal, reduced ? 0 : stride, !dressed);
      // Two pale bodies beside the runner while a fork is on screen.
      // They are not pieces, so they never collide, and they leave with the cue.
      const fork = typeof st.fork === "number" ? st.fork : 0;
      if (fork > 0) {
        const pale = mix3(pal.body, [0.86, 0.91, 0.96], 0.72);
        const ghost = mix3(pale, [0.93, 0.95, 0.98], 1 - fork);
        for (const side of [-0.72, 0.72]) {
          const at = spot(0.15, leanLat + side);
          push(at.x, py + 0.48, at.z, 0.32, 0.46 * fork, 0.3, 1, ghost, 0.08, 0.16 * fork);
        }
      }
      casting = false;
      const trailN = reduced ? 0 : Math.min(6, 3 + Math.floor(Math.max(0, speed - 5)));
      for (let t = 1; t <= trailN; t++) {
        const fade = 1 - t / (trailN + 1);
        const s = 0.12 * fade;
        const puff = spot(-0.45 - t * (0.28 + speed * 0.02), lean * 0.1 * t);
        push(puff.x, floorDraw + 0.35 + fade * 0.15, puff.z, s, s, s, 2, pal.cape, 0.15, 0.35 + fade * 0.5);
      }
      if (usePost && !reduced) {
        const extra = activeProfile.trail | 0;
        const highTrail = activeProfile.tier === "high";
        const combo = highTrail ? Math.max(0, Math.min(8, st.combo || 0)) : 0;
        const speedK = highTrail ? Math.min(1, Math.max(0, (speed - 6) / 12)) : 0;
        for (let t = 1; t <= extra; t++) {
          const fade = 1 - t / (extra + 1);
          const step = highTrail ? 0.24 * (1 + speedK * 0.65) : 0.24;
          const ribbon = spot(-0.7 - t * step, leanLat * 0.15);
          const emit = highTrail ? (0.55 + fade * 0.4) * (0.8 + speedK * 0.85 + combo * 0.06) : 0.55 + fade * 0.4;
          const depth = highTrail ? (0.34 * fade + 0.12) * (1 + speedK * 0.7) : 0.34 * fade + 0.12;
          push(ribbon.x, floorDraw + 0.28 + fade * 0.22, ribbon.z, 0.05, 0.04 + fade * 0.06, depth, 0, pal.cape, 0.18, emit, feet.psi);
        }
      }
      }
    } else if (!alive) {
      const rest = 0.22 + (reduced ? 0 : Math.sin(st.time * 2) * 0.03);
      push(rx, 0.04, rz, 0.7, 0.03, 0.55, 0, [0.15, 0.1, 0.08], 1, 0);
      push(rx, rest, rz, 0.36, 0.36, 0.36, 1, pal.cape, 0.2, 0.9);
      push(rx, rest + 0.28, rz, 0.14, 0.22, 0.14, 1, pal.sun, 0.15, 1);
    }
    spin = 0;

    const sparkSlots = sparkLimit();
    if (sparkSlots !== prevSparkLim) {
      for (let i = sparkSlots; i < SPARK_MAX; i++) sparks[i * 8 + 6] = 0;
      prevSparkLim = sparkSlots;
    }
    for (let i = 0; i < sparkSlots; i++) {
      const o = i * 8;
      const life = sparks[o + 6];
      if (life <= 0) continue;
      sparks[o] += sparks[o + 3] * 0.045;
      sparks[o + 1] += sparks[o + 5] + 0.012;
      sparks[o + 2] += sparks[o + 4] * 0.045;
      sparks[o + 5] *= 0.96;
      sparks[o + 6] = life - 0.014;
      const code = sparks[o + 7];
      const tintId = Math.floor(code / 100);
      const s = 0.08 + life * (tintId >= 3 ? 0.12 : 0.08);
      const tint = tintId === 4 ? [0.62, 0.88, 1]
        : tintId === 3 ? [1, 0.92, 0.45]
        : tintId === 2 ? [1, 0.45, 0.42]
        : tintId === 1 ? [1, 0.62, 0.78]
        : (code % 2) ? pal.coin : pal.flower;
      push(sparks[o], sparks[o + 1], sparks[o + 2], s, s, s, 1, tint, 0.2, tintId >= 3 ? 0.9 : 0.7);
    }
    let dustN = 0;
    const dustSlots = dustLimit();
    if (dustSlots !== prevDustLim) {
      for (let i = dustSlots; i < DUST_MAX; i++) dust[i * 8 + 6] = 0;
      prevDustLim = dustSlots;
    }
    for (let i = 0; i < dustSlots; i++) {
      const o = i * 8;
      const life = dust[o + 6];
      if (life <= 0) continue;
      dust[o] += dust[o + 3] * 0.055;
      dust[o + 1] += dust[o + 4] * 0.05;
      dust[o + 2] += dust[o + 5] * 0.055;
      dust[o + 4] -= 0.014;
      dust[o + 6] = life - (reduced ? 0.2 : 0.02);
      if (dust[o + 6] <= 0 || n >= MAX - 8) continue;
      const puff = 0.1 + (0.4 - life) * 0.28;
      push(dust[o], Math.max(0.08, dust[o + 1]), dust[o + 2], puff, puff * 0.55, puff, 1, [0.92, 0.78, 0.52], 0.8, 0.14);
      dustN++;
    }
    if (activeProfile.tier === "high" && !reduced && n < MAX - 8) {
      if (st.event === "coin") {
        for (let i = 0; i < 5 && i < COIN_MAX; i++) {
          const slot = i * 4;
          const at = sample(drawS - 0.25 - i * 0.22, px + ((i % 2) ? 0.12 : -0.12));
          coinTrail[slot] = at.x;
          coinTrail[slot + 1] = py + 0.7 + i * 0.05;
          coinTrail[slot + 2] = at.z;
          coinTrail[slot + 3] = 0.45 - i * 0.04;
        }
      }
      for (let i = 0; i < COIN_MAX && n < MAX - 4; i++) {
        const slot = i * 4;
        const life = coinTrail[slot + 3];
        if (life <= 0) continue;
        coinTrail[slot + 3] = life - frameDt;
        const s = 0.06 + life * 0.08;
        push(coinTrail[slot], coinTrail[slot + 1], coinTrail[slot + 2], s, s, s * 1.8, 1, [1, 0.9, 0.45], 0.12, 0.7 + life, 0);
      }
      const moteN = Math.min(MOTE_MAX, activeProfile.mote | 0);
      const moteKind = pal.surface === "ice" || pal.biome === "aurora-ice" || pal.particles === "snow" ? "snow"
        : pal.biome === "space" || pal.particles === "stardust" ? "star"
        : pal.biome === "city" ? "dust"
        : "petal";
      for (let i = 0; i < moteN && n < MAX - 4; i++) {
        const o = i * 8;
        let life = motes[o + 6];
        if (life <= 0) {
          const h = laneHash(i * 1.7 + 4);
          const side = (h - 0.5) * 7;
          const ahead = laneHash(i * 2.3 + 1) * 16 - 2;
          const at = sample(drawS + ahead, side);
          motes[o] = at.x;
          motes[o + 1] = moteKind === "star" ? 2.2 + h * 2.2 : moteKind === "snow" ? 1.4 + h * 2.4 : 0.5 + h * 1.6;
          motes[o + 2] = at.z;
          motes[o + 3] = (laneHash(i * 3.1) - 0.5) * 0.6;
          motes[o + 4] = moteKind === "snow" ? -0.35 - h * 0.4 : (laneHash(i + 9) - 0.4) * 0.25;
          motes[o + 5] = (laneHash(i * 5.2) - 0.5) * 0.6;
          motes[o + 6] = 0.8 + h * 1.4;
          motes[o + 7] = i + 1;
          life = motes[o + 6];
        }
        motes[o] += motes[o + 3] * frameDt * 2.2;
        motes[o + 1] += motes[o + 4] * frameDt * 2.2;
        motes[o + 2] += motes[o + 5] * frameDt * 2.2;
        motes[o + 6] = life - frameDt * 0.35;
        const tw = 0.55 + 0.45 * Math.sin((st.time || 0) * 3 + i);
        const rgb = moteKind === "snow" ? [0.95, 0.97, 1]
          : moteKind === "star" ? [0.75, 0.86, 1]
          : moteKind === "dust" ? [0.85, 0.72, 0.48]
          : (i % 2 ? [1, 0.72, 0.78] : [1, 0.9, 0.95]);
        const sz = moteKind === "star" ? 0.035 : moteKind === "snow" ? 0.05 : 0.07;
        const emit = moteKind === "star" ? 0.85 * tw : moteKind === "petal" ? 0.35 : 0.22;
        push(motes[o], motes[o + 1], motes[o + 2], sz, moteKind === "petal" ? sz * 0.45 : sz, sz, moteKind === "petal" ? 0 : 1, rgb, 0.25, emit, feet.psi);
      }
    }
    if (reject > 0.2 && !reduced && (n < MAX - 4)) {
      const petal = Math.sin(st.time * 3) * 0.4;
      const petalA = sample(pz + 1.5, px - petal);
      const petalB = sample(pz + 2.2, px + petal);
      push(petalA.x, 1.8 + reject, petalA.z, 0.12, 0.08, 0.12, 1, pal.flower, 0.3, 0.4);
      push(petalB.x, 2.1 + reject * 0.5, petalB.z, 0.1, 0.07, 0.1, 1, pal.flower2, 0.3, 0.35);
    }

    const lift = floaty + pulse * 0.15;
    const ahead = Math.hypot(at[0] - eye[0], at[2] - eye[2]) || 1;
    const pitch = Math.atan2(at[1] - eye[1], ahead);
    const aim = sunAim(psi, camFov, w / Math.max(1, h), pal.sunUv, pitch);
    const lightAmt = Math.min(0.9, Math.max(0.8, 0.74 + 0.16 * pal.lightAmt + lift * 0.015 + pulse * 0.015));
    const swapInst = (i, j) => {
      if (i === j) return;
      const a = i * STRIDE;
      const b = j * STRIDE;
      for (let k = 0; k < STRIDE; k++) {
        const tmp = data[a + k];
        data[a + k] = data[b + k];
        data[b + k] = tmp;
      }
    };
    // 0 box, 1 sphere/gem, 2 marched shape.
    let lo = 0;
    let mid = 0;
    let hi = n - 1;
    while (mid <= hi) {
      const shape = data[mid * STRIDE + 3];
      if (shape < 0.5) {
        swapInst(lo, mid);
        lo++;
        mid++;
      } else if (shape < 2.5) {
        mid++;
      } else {
        swapInst(mid, hi);
        hi--;
      }
    }
    // Patterned surfaces (kind >= mark) draw on their own, with uPat.
    // One mixed draw would make SwiftShader run the hash on every box.
    const splitKind = (start, end, mark) => {
      let a = start;
      let b = end - 1;
      while (a <= b) {
        if (data[a * STRIDE + 15] < mark) a++;
        else {
          swapInst(a, b);
          b--;
        }
      }
      return a;
    };
    const boxPat = splitKind(0, lo, 2.5);
    // Matte boxes (rough >= 0.72) draw with the short shader. The road
    // and the hero stay on the full one.
    const splitMatte = (start, end) => {
      let a = start;
      let b = end - 1;
      while (a <= b) {
        if (data[a * STRIDE + 7] >= 0.72) a++;
        else {
          swapInst(a, b);
          b--;
        }
      }
      return a;
    };
    const matteEnd = splitMatte(0, boxPat);
    const splitFront = (start, end, pred) => {
      let a = start;
      let b = end - 1;
      while (a <= b) {
        if (pred(a)) a++;
        else {
          swapInst(a, b);
          b--;
        }
      }
      return a;
    };
    const shadowEnd = splitFront(0, matteEnd, (i) => {
      const k = data[i * STRIDE + 15];
      return k > 1.5 && k < 2.5;
    });
    const nearEnd = splitFront(boxPat, lo, (i) => {
      const base = i * STRIDE;
      const k = data[base + 15];
      if (k > 7.5 && k < 8.5) return true;
      if (!(k > 4.5 && k < 5.5)) return false;
      const sx = data[base + 4];
      const sy = data[base + 5];
      const sz = data[base + 6];
      return sz < sx * 0.45 && sz < sy * 0.45;
    });
    if (usePost && wantShadow && castN > 0 && depthProg) {
      if (splitPass) beginSpan("shadow");
      const len = Math.hypot(aim[0], aim[1], aim[2]) || 1;
      const dir = [aim[0] / len, aim[1] / len, aim[2] / len];
      const tx = Math.round((rx + Math.sin(psi) * 7) * 2) / 2;
      const tz = Math.round((rz + Math.cos(psi) * 7) * 2) / 2;
      const target = [tx, 0.5, tz];
      const eyeL = [target[0] + dir[0] * 18, target[1] + dir[1] * 18, target[2] + dir[2] * 18];
      lookAt(lightView, eyeL, target, Math.abs(dir[1]) > 0.92 ? [0, 0, 1] : [0, 1, 0]);
      ortho(lightProj, -12, 12, -12, 12, 0.4, 42);
      mulMat(shadowMat, lightProj, lightView);
      gl.bindFramebuffer(gl.FRAMEBUFFER, post.shadowFb());
      gl.viewport(0, 0, post.shadowSize(), post.shadowSize());
      gl.colorMask(false, false, false, false);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.6, 2.4);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, castBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, castData.subarray(0, castN * STRIDE));
      for (let i = 0; i < 4; i++) {
        gl.enableVertexAttribArray(2 + i);
        gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
        gl.vertexAttribDivisor(2 + i, 1);
      }
      gl.useProgram(depthProg);
      gl.uniformMatrix4fv(depthLoc.proj, false, lightProj);
      gl.uniformMatrix4fv(depthLoc.view, false, lightView);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, castN);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.colorMask(true, true, true, true);
    }
    if (usePost) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, post.sceneFb());
      gl.viewport(0, 0, w, h);
      gl.colorMask(true, true, true, true);
      const skyProg = activeProfile.tier === "high" && highSkyProg ? highSkyProg : (litSkyProg || sky);
      const skyLoc = activeProfile.tier === "high" && uHighSky ? uHighSky : (uLitSky || u);
      if (splitPass) beginSpan("scene");
      rush = paintSky(skyProg, skyLoc);
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, n * STRIDE));
    const bindMesh = (prog, locs) => {
      gl.useProgram(prog);
      gl.uniformMatrix4fv(locs.proj, false, proj);
      gl.uniformMatrix4fv(locs.view, false, view);
      gl.uniform3f(locs.eye, eye[0], eye[1], eye[2]);
      gl.uniform3fv(locs.fog, pal.fog);
      gl.uniform1f(locs.fogAmt, pal.fogAmt);
      gl.uniform3f(locs.light, aim[0], aim[1], aim[2]);
      gl.uniform1f(locs.lightAmt, lightAmt);
      gl.uniform3fv(locs.skyAmb, pal.sky);
      gl.uniform3fv(locs.soil, pal.soil);
      gl.uniform1f(locs.mtime, st.time || 0);
      if (locs.shadowOn) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, post && post.shadowTex());
        gl.uniform1i(locs.shadowMap, 0);
        gl.uniformMatrix4fv(locs.shadowMat, false, shadowMat);
        gl.uniform1f(locs.shadowOn, wantShadow && castN > 0 ? 1 : 0);
        gl.uniform1f(locs.pcf, activeProfile.pcf || 4);
      }
      if (locs.gloss) {
        gl.uniform1f(locs.penumbra, activeProfile.penumbra || 0);
        gl.uniform1f(locs.aerial, activeProfile.aerial || 0);
        const gloss = activeProfile.tier === "high" ? glossFor(pal) : 0;
        gl.uniform1f(locs.gloss, gloss);
        if (locs.ground) gl.uniform1f(locs.ground, groundId(pal));
        const haze = pal.sky || pal.fog || [0.7, 0.8, 0.9];
        gl.uniform3f(locs.haze, haze[0] || 0, haze[1] || 0, haze[2] || 0);
      }
    };
    const drawSpan = (prog, locs, first, count, coverage, pat) => {
      if (!count) return;
      bindMesh(prog, locs);
      if (locs.pat) gl.uniform1f(locs.pat, pat);
      const base = first * STRIDE * 4;
      for (let i = 0; i < 4; i++) {
        gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, STRIDE * 4, base + i * 16);
      }
      if (coverage && msaa > 1) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      else gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, count);
    };
    const useHigh = usePost && activeProfile.tier === "high" && highReady;
    const boxProg = useHigh && highBox ? highBox : usePost && litBox ? litBox : meshBox;
    const patProg = useHigh && highPat ? highPat : usePost && litPat ? litPat : meshPat;
    const ballProg = useHigh && highBall ? highBall : usePost && litBall ? litBall : meshBall;
    const marchProg = useHigh && highMesh ? highMesh : usePost && litMesh ? litMesh : mesh;
    const boxLoc = useHigh && uhb ? uhb : usePost && ulb ? ulb : ub;
    const patLoc = useHigh && uhp ? uhp : usePost && ulp ? ulp : up;
    const ballLoc = useHigh && uhBall ? uhBall : usePost && ulBall ? ulBall : uBall;
    const marchLoc = useHigh && uhm ? uhm : usePost && ulm ? ulm : um;
    drawSpan(meshFast, uFast, shadowEnd, matteEnd - shadowEnd, false, 0);
    drawSpan(boxProg, boxLoc, matteEnd, boxPat - matteEnd, false, 0);
    drawSpan(meshShadow, uShadow, 0, shadowEnd, false, 0);
    drawSpan(patProg, patLoc, nearEnd, lo - nearEnd, false, 0);
    drawSpan(meshNear, uNear, boxPat, nearEnd - boxPat, false, 0);
    drawSpan(ballProg, ballLoc, lo, mid - lo, false, 0);
    drawSpan(marchProg, marchLoc, mid, n - mid, !usePost, 0);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    if (useHigh && rimFlash && rimFlash.life > 0 && rimBuf) {
      const k = Math.max(0, Math.min(1, rimFlash.life / 0.22));
      const ax = roadAxes(rimFlash.psi || 0);
      const face = -(rimFlash.side || 1);
      const ex = rimFlash.x + ax.rx * face * 0.46;
      const ez = rimFlash.z + ax.rz * face * 0.46;
      const emit = 0.45 + k * 1.15;
      const warm = [1, 0.93, 0.72];
      const put = (i, x, y, z, sx, sy, sz, e) => {
        const o = i * STRIDE;
        rimData[o] = x; rimData[o + 1] = y; rimData[o + 2] = z; rimData[o + 3] = 0;
        rimData[o + 4] = sx; rimData[o + 5] = sy; rimData[o + 6] = sz; rimData[o + 7] = 0.18;
        rimData[o + 8] = warm[0]; rimData[o + 9] = warm[1]; rimData[o + 10] = warm[2]; rimData[o + 11] = e;
        rimData[o + 12] = rimFlash.psi || 0; rimData[o + 13] = 0; rimData[o + 14] = 0.35; rimData[o + 15] = 0;
      };
      put(0, ex, rimFlash.y, ez, 0.035, 1.02 * (0.45 + 0.55 * k), 0.035, emit);
      put(1, ex, rimFlash.y + 0.5 * k, ez, 0.62 * (0.4 + 0.6 * k), 0.028, 0.04, emit * 0.85);
      put(2, ex - ax.tx * 0.18, rimFlash.y + 0.2, ez - ax.tz * 0.18, 0.03, 0.03, 0.55 * (0.35 + 0.65 * k), emit * 0.7);
      gl.bindBuffer(gl.ARRAY_BUFFER, rimBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, rimData);
      for (let i = 0; i < 4; i++) {
        gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      }
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false);
      bindMesh(boxProg, boxLoc);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, 3);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      gl.blendFunc(gl.ONE, gl.ZERO);
    }
    if (usePost && post) {
      const graded = sceneGrade(pal);
      post.present(w, h, activeProfile, {
        exposure: activeProfile.exposure || 1,
        grade: activeProfile.grade || 0,
        sat: graded.sat,
        contrast: graded.contrast,
        lift: graded.lift,
        gain: graded.gain,
        shaftCol: graded.shaft,
        sun: sunScreen(psi, drawFov, w / Math.max(1, h), pal.sunUv),
        shaft: activeProfile.shaft || 0,
        ao: activeProfile.ssao || 0,
        keep: keepT * (activeProfile.keep || 0),
        back: backT * (activeProfile.back || 0),
        hit: hitStop > 0 ? hitStop / 0.07 : 0,
        blur: reduced ? 0 : blurAmount(speed, activeProfile.blur || 0),
        reflect: activeProfile.tier === "high" ? (activeProfile.reflect || 0) * glossFor(pal) : 0,
        reveal: activeProfile.tier === "high" ? (worldFlash || 0) : 0,
        revealCol: (blendTo && blendTo.sky0) || pal.sky0 || pal.sky || [0.7, 0.8, 0.9],
        sky: pal.sky0 || pal.sky || [0.6, 0.75, 0.95],
        hero: heroUv,
        invProj,
        proj,
        time: st.time || 0,
        span: splitPass ? beginSpan : null,
      });
      wasPost = true;
    }
    if (splitPass) endSpan();
    else endGpu();
    const work = performance.now() - t0;
    lastWork = work;
    const stamp = nowMs || performance.now();
    if (st.visible === false) noteVisibility(quality, false, stamp);
    else {
      if (quality.hidden) noteVisibility(quality, true, stamp);
      if (st.gapMs) noteRefresh(quality, st.gapMs);
      observe(quality, { workMs: work, gapMs: st.gapMs || 0, now: stamp });
    }
    canvas.dataset.instances = String(n);
    canvas.dataset.dust = String(dustN);
    canvas.dataset.rush = rush ? "1" : "0";
    canvas.dataset.biome = pal.biome || "garden";
    canvas.dataset.mood = pal.mood || "day";
    canvas.dataset.tier = quality.tier;
    canvas.dataset.quality = quality.mode;
    canvas.dataset.shadow = usePost && wantShadow ? "1" : "0";
    canvas.dataset.bloom = usePost ? "1" : "0";
    canvas.dataset.hdr = usePost && activeProfile.hdr ? "1" : "0";
    canvas.dataset.fxaa = usePost && activeProfile.fxaa ? "1" : "0";
    canvas.dataset.ao = usePost && post && post.aoOn && post.aoOn() ? "1" : "0";
    canvas.dataset.grade = usePost && activeProfile.grade > 0 ? "1" : "0";
    canvas.dataset.blur = usePost && activeProfile.blur > 0 ? "1" : "0";
    canvas.dataset.shade = useHigh ? "high" : usePost ? "lit" : "low";
    canvas.dataset.reflect = useHigh && post && post.reflectOn && post.reflectOn() ? "1" : "0";
    canvas.dataset.work = lastWork.toFixed(2);
    canvas.dataset.gpu = gpuMs >= 0 ? gpuMs.toFixed(2) : "";
    canvas.dataset.gpuExt = timerExt ? "1" : "0";
    canvas.dataset.renderer = "webgl2";
    return n;
    } catch (err) {
      try { endSpan(); endGpu(); } catch { /* query already closed */ }
      if (lost || (gl.isContextLost && gl.isContextLost())) {
        lost = true;
        tell("failed", { message: contextPlan("restore-failed").message });
        return 0;
      }
      throw err;
    }
  }

  function timing() {
    pollGpu();
    const copy = gpuSamples.slice().sort((a, b) => a - b);
    const at = (q) => (copy.length ? copy[Math.min(copy.length - 1, Math.floor(q * (copy.length - 1)))] : -1);
    return {
      work: lastWork,
      gpu: gpuMs,
      gpuP50: at(0.5),
      gpuP95: at(0.95),
      gpuN: copy.length,
      passes: Object.assign({}, passMs),
      tier: quality.tier,
      ext: !!timerExt,
      software: !!software,
    };
  }

  function qualitySnapshot() {
    return {
      mode: quality.mode,
      tier: quality.tier,
      refreshHz: quality.refreshHz,
      ceiling: quality.caps.ceiling,
      software: !!quality.caps.software,
      floatFb: !!quality.caps.floatFb,
      gpu: quality.caps.gpu || "",
      renderer: "webgl2",
      lost,
    };
  }

  return {
    gl,
    resize,
    frame,
    timing,
    noteFrameTime,
    setQualityMode(mode) { setMode(quality, mode, performance.now()); },
    setReduced(v) { noteReduced(quality, v, performance.now()); },
    setVisible(v) { noteVisibility(quality, v, performance.now()); },
    qualitySnapshot,
  };
}
