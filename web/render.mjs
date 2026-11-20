import { drawThing, growOf, animOf, showBox } from "./thing.mjs";

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
  const skyLift = 0.78 + 0.22 * light;
  return {
    sky,
    sky0: mul(sky, skyLift),
    sky1: mix3(mul(sky, skyLift), [1.0, 0.72, 0.48], 0.42),
    fog: mix3(mix3(mul(sky, 0.92), [1, 1, 1], 0.42), [1.0, 0.86, 0.72], 0.18),
    fogAmt: scene && typeof scene.fog === "number" ? scene.fog : 0.22,
    hill: mix3([0.55, 0.66, 0.74], [0.32, 0.28, 0.48], t),
    hill2: mix3([0.40, 0.55, 0.62], [0.24, 0.22, 0.38], t),
    soil: mix3([0.45, 0.32, 0.22], [0.28, 0.20, 0.22], t),
    grass: ground,
    grassL: mix3(ground, [1, 1, 1], 0.14),
    grassR: mix3(ground, [0.1, 0.15, 0.08], 0.12),
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

// Garden in daylight is the palette above, unchanged. Other venues replace
// sky, ground, and road colours. Hurdles, gates, coins, and pots stay put
// so every biome keeps the same readable obstacles.
export function dressPalette(base, biome, mood) {
  const name = knownName(biome, BIOME_NAMES, "garden");
  const tone = knownName(mood, MOOD_NAMES, "day");
  const pal = Object.assign({}, base, {
    biome: name,
    mood: tone,
    stars: 0,
    nebula: [0, 0, 0],
    disc: 1,
    sunUv: base.sunUv.slice(),
  });
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
    pal.path = [0.12, 0.16, 0.28];
    pal.grass = [0.07, 0.08, 0.14];
    pal.grassL = [0.1, 0.12, 0.2];
    pal.grassR = [0.08, 0.09, 0.16];
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
  if (name === "garden" && tone === "day") return pal;
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
  return pal;
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

function laneX(lane) {
  return lane < 0 ? 0 : (lane - 1) * 1.8;
}

// Solid gate bar. lib/phys.aura gate-span and web/sim.mjs use this thickness.
export function gateBarDepth(w) {
  const depth = Math.max(0.45, w);
  return Math.max(0.22, depth * 0.35);
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
  const base = 1 - Math.exp(-Math.max(0, dist) * 0.011);
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

export function cameraPose(simLx, simY, simZ, fovy = 0.95, bend = 0) {
  const centre = roadPoint(simZ, 0, bend);
  const body = roadPoint(simZ, simLx, bend);
  const psi = centre.psi;
  const ox = body.x - centre.x;
  const oz = body.z - centre.z;
  return {
    eye: [centre.x + ox * 0.55 - Math.sin(psi) * 4.4, 2.15, centre.z + oz * 0.55 - Math.cos(psi) * 4.4],
    at: [centre.x + ox * 0.2 + Math.sin(psi) * 8, 0.95 + simY * 0.2, centre.z + oz * 0.2 + Math.cos(psi) * 8],
    fovy,
    psi,
  };
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
  const pose = cameraPose(0, 0, simZ, 0.95, bend);
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
uniform float uSunAmt; uniform float uRush;
uniform float uStars;
uniform vec3 uNebula;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float horizon = smoothstep(0.0, 0.72, uv.y);
  vec3 c = mix(uSky1, uSky0, horizon);
  float haze = exp(-max(uv.y - 0.18, 0.0) * 3.2);
  c = mix(c, uSky1, haze * 0.35);
  // Hills and the sun are world-fixed. uYaw is the road heading, so a turn
  // carries the opening sky off to the side instead of leaving it on screen.
  float span = max(uFov * uRes.x / max(uRes.y, 1.0), 0.3);
  float x = uv.x - uYaw / span;
  float parallax = uCamZ * 0.004;
  float h1 = 0.30 + 0.045 * sin(x * 7.0 + parallax);
  float h2 = 0.22 + 0.035 * sin(x * 15.0 + 1.4 + parallax * 1.7);
  if (uv.y < h1) c = mix(c, uHill, smoothstep(h1, h1 - 0.08, uv.y));
  if (uv.y < h2) c = mix(c, uHill2, 0.9);
  // Two slow sine sheets. uTime is seconds; no FBM, just a drift.
  float drift = uTime * 0.08;
  float cloudA = sin(x * 5.0 + parallax + drift);
  float cloudB = sin(x * 10.5 - drift * 1.5 + 1.4);
  float cloudC = sin(x * 2.3 + drift * 0.45 + uv.y * 3.2);
  float band = smoothstep(0.4, 0.75, uv.y);
  float puff = smoothstep(0.2, 0.9, cloudA) * 0.62 + smoothstep(0.3, 0.92, cloudB) * 0.38;
  c = mix(c, vec3(1.0, 0.95, 0.88), puff * band * 0.24);
  c = mix(c, vec3(1.0, 0.97, 0.93), smoothstep(0.5, 0.98, cloudC) * smoothstep(0.62, 0.9, uv.y) * 0.12);
  vec2 sun = vec2(x, uv.y) - uSun;
  float sd = length(sun);
  float sunAmt = max(uSunAmt, 0.0);
  c += uSunCol * smoothstep(0.14, 0.0, sd) * 0.5 * sunAmt;
  c += vec3(1.0, 0.97, 0.9) * smoothstep(0.035, 0.0, sd) * sunAmt;
  // Speed streaks sit on the lower screen edges. uRush is 0 below 12 m/s,
  // so the centre of the sky is not touched and the branch stays off.
  if (uRush > 0.5) {
    float edge = max(smoothstep(0.12, 0.0, uv.x), smoothstep(0.88, 1.0, uv.x));
    float low = smoothstep(0.62, 0.22, uv.y);
    float streak = sin(uv.y * 36.0 - uTime * 16.0 + uv.x * 2.0);
    c += vec3(1.0, 0.98, 0.92) * edge * low * smoothstep(0.25, 0.92, streak) * 0.18;
  }
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
  float c = cos(iYaw.x);
  float s = sin(iYaw.x);
  vec3 local = aPos * iSize.xyz;
  vec3 spun = vec3(c * local.x + s * local.z, local.y, -s * local.x + c * local.z);
  vec3 world = spun + iPos.xyz;
  vL = aPos;
  vN = vec3(c * aNrm.x + s * aNrm.z, aNrm.y, -s * aNrm.x + c * aNrm.z);
  vW = world;
  vC = iColor.rgb;
  vCenter = iPos.xyz;
  vHalf = iSize.xyz * 0.5;
  vShape = iPos.w;
  vRough = iSize.w;
  vEmit = iColor.a;
  vYaw = iYaw.x;
  vMetal = iYaw.y;
  vSheen = iYaw.z;
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
    n = normalize(vN + vL * smoothstep(0.16, 0.0, edge) * 0.85);
  }
  vec3 viewDir = normalize(uEye - vW);
  vec3 L = normalize(uLight);
  float ndl = max(dot(n, L), 0.0);
  float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  float wrap = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  float metal = clamp(vMetal, 0.0, 1.0);
  float sheen = clamp(vSheen, 0.0, 1.0);
  float rough = clamp(vRough, 0.0, 1.0);
  vec3 ambient = mix(vec3(0.22), uSkyAmb, 0.10);
  vec3 col = vC * (ambient + 0.28 * hemi + uLightAmt * ndl + 0.12 * wrap);
  float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2);
  col += vec3(1.0, 0.93, 0.82) * rim * (0.16 + vEmit * 0.22);
  float specPow = mix(48.0, 12.0, rough);
  float spec = pow(max(dot(n, normalize(L + viewDir)), 0.0), specPow);
  vec3 specCol = mix(vec3(1.0, 0.96, 0.88), vC, metal);
  col += specCol * spec * mix(0.45, 0.06, rough) * (1.0 + sheen);
  if (asBox) {
    float edge = min(min(0.5 - abs(vL.x), 0.5 - abs(vL.y)), 0.5 - abs(vL.z));
    col *= 0.76 + 0.24 * smoothstep(0.0, 0.16, edge);
    if (vHalf.y < 0.12) col *= 1.0 - 0.22 * smoothstep(0.32, 0.48, abs(vL.x));
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
  float fog = 1.0 - exp(-dist * 0.011);
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
  // Kind 2 is a contact shadow: a thin square cut into a soft disc.
  if (vKind > 1.5 && vKind < 2.5) {
    float rr = length(vL.xz);
    if (rr > 0.46) discard;
    float feather = smoothstep(0.46, 0.12, rr);
    vec3 shade = mix(vec3(0.46, 0.40, 0.30), vec3(0.24, 0.20, 0.14), feather);
    float dist = length(vW - uEye);
    float fog = clamp(1.0 - exp(-dist * 0.011), 0.0, 0.38);
    o = vec4(mix(shade, uFog, fog * 0.7), 1.0);
    return;
  }
  float edge = min(min(0.5 - abs(vL.x), 0.5 - abs(vL.y)), 0.5 - abs(vL.z));
  vec3 n = normalize(vN + vL * smoothstep(0.16, 0.0, edge) * 0.85);
  vec3 L = normalize(uLight);
  float ndl = max(dot(n, L), 0.0);
  float hemi = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
  float wrap = clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
  float rough = clamp(vRough, 0.0, 1.0);
  vec3 ambient = mix(vec3(0.22), uSkyAmb, 0.10);
  vec3 col = vC * (ambient + 0.28 * hemi + uLightAmt * ndl + 0.12 * wrap);
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
  col *= 0.76 + 0.24 * smoothstep(0.0, 0.16, edge);
  if (vHalf.y < 0.12) col *= 1.0 - 0.22 * smoothstep(0.32, 0.48, abs(vL.x));
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
  float fog = 1.0 - exp(-dist * 0.011);
  fog = clamp(fog, 0.0, cap);
  fog *= (1.0 - 0.82 * clamp(vEmit, 0.0, 1.0));
  o = vec4(softKnee(mix(col, uFog, fog)), 1.0);
}`;

// One pattern each, so a grass tile does not also run the wood and metal
// math. The road stays on MESH_FS_BOX. Kind selects the program.
function boxPat(line) {
  return MESH_FS_BOX.replace(
    "float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vCenter.z);",
    `${line}
  float pulse = 0.85 + 0.15 * sin(uTime * 3.0 + vCenter.z);`,
  );
}
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
  vec3 ambient = mix(vec3(0.22), uSkyAmb, 0.10);
  vec3 col = vC * (ambient + 0.28 * hemi + uLightAmt * ndl + 0.12 * wrap);
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
  float fog = clamp(1.0 - exp(-dist * 0.011), 0.0, min(max(uFogAmt, 0.0), 0.38));
  fog *= (1.0 - 0.82 * clamp(vEmit, 0.0, 1.0));
  o = vec4(softKnee(mix(col, uFog, fog)), cov);
}`;

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

export function createRenderer(canvas) {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    depth: true,
    stencil: false,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
  const sky = link(gl, SKY_VS, SKY_FS);
  const mesh = link(gl, MESH_VS, MESH_FS);
  const meshBox = link(gl, MESH_VS, MESH_FS_BOX);
  const meshPat = link(gl, MESH_VS, MESH_FS_BOX_PAT);
  const meshBall = link(gl, MESH_VS, MESH_FS_BALL);
  const tri = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const cubeBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
  gl.bufferData(gl.ARRAY_BUFFER, cube(), gl.STATIC_DRAW);
  const inst = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, inst);
  gl.bufferData(gl.ARRAY_BUFFER, MAX * STRIDE * 4, gl.DYNAMIC_DRAW);
  const data = new Float32Array(MAX * STRIDE);
  const vao = gl.createVertexArray();
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
  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const u = {
    sky0: gl.getUniformLocation(sky, "uSky0"),
    sky1: gl.getUniformLocation(sky, "uSky1"),
    hill: gl.getUniformLocation(sky, "uHill"),
    hill2: gl.getUniformLocation(sky, "uHill2"),
    sunCol: gl.getUniformLocation(sky, "uSunCol"),
    sun: gl.getUniformLocation(sky, "uSun"),
    res: gl.getUniformLocation(sky, "uRes"),
    time: gl.getUniformLocation(sky, "uTime"),
    camZ: gl.getUniformLocation(sky, "uCamZ"),
    yaw: gl.getUniformLocation(sky, "uYaw"),
    fov: gl.getUniformLocation(sky, "uFov"),
    sunAmt: gl.getUniformLocation(sky, "uSunAmt"),
    rush: gl.getUniformLocation(sky, "uRush"),
    stars: gl.getUniformLocation(sky, "uStars"),
    nebula: gl.getUniformLocation(sky, "uNebula"),
  };
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
    };
  }
  const um = meshLocs(mesh);
  const ub = meshLocs(meshBox);
  const up = meshLocs(meshPat);
  const uBall = meshLocs(meshBall);
  const gpuInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const gpuName = gpuInfo
    ? `${gl.getParameter(gpuInfo.UNMASKED_VENDOR_WEBGL) || ""} ${gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL) || ""}`
    : "";
  let dprCap = /swiftshader|llvmpipe|softpipe|software/i.test(gpuName) ? 1 : 2;
  const msaa = gl.getParameter(gl.SAMPLES) || 0;
  let w = 1;
  let h = 1;
  let camS = 0;
  let camLat = 0;
  let runS = 0;
  let shownS = 0;
  let shownAt = 0;
  let shownSeen = false;
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
  let camY = 2.15;
  let camFov = 0.92;
  let prevY = 0;
  let prevLx = 0;
  let lean = 0;
  let land = 0;
  let pulse = 0;
  let prevSpeed = 5;
  let prevG = 32;
  let reject = 0;
  const sparks = new Float32Array(36 * 8);
  // Short-lived foot puffs. Kept apart from sparks so a coin burst cannot
  // crowd them out, and the pool stays far under the instance cap.
  const DUST_N = 12;
  const dust = new Float32Array(DUST_N * 8);
  let dustStep = 0;

  function resize() {
    const dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    canvas.dataset.dpr = String(dpr);
  }

  // Same ring the page already keeps for the fps readout. A p95 past ~20 ms
  // drops the backing store from 2x to 1x and leaves it there.
  function noteFrameTime(buf, count) {
    if (dprCap <= 1 || !buf) return;
    const n = Math.min(count | 0, buf.length);
    if (n < 48) return;
    const copy = [];
    for (let i = 0; i < n; i++) {
      const v = buf[i];
      if (v > 0.4 && v < 250) copy.push(v);
    }
    if (copy.length < 40) return;
    copy.sort((a, b) => a - b);
    const p95 = copy[Math.min(copy.length - 1, Math.floor(0.95 * (copy.length - 1)))];
    if (p95 > 20) dprCap = 1;
  }

  let n = 0;
  // Default yaw for a group (the runner, a companion). Explicit yaw wins.
  let spin = 0;
  function push(x, y, z, sx, sy, sz, shape, rgb, rough = 0.62, emit = 0, yaw = spin, metal = 0, sheen = 0, kind = 0) {
    if (n >= MAX) return;
    const o = n * STRIDE;
    data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = shape;
    data[o + 4] = sx; data[o + 5] = sy; data[o + 6] = sz; data[o + 7] = rough;
    data[o + 8] = rgb[0]; data[o + 9] = rgb[1]; data[o + 10] = rgb[2]; data[o + 11] = emit;
    data[o + 12] = yaw; data[o + 13] = metal; data[o + 14] = sheen; data[o + 15] = kind;
    n++;
  }

  // Round disc, same height falloff as the popper, a little smaller.
  // Kind 2 tells the box shader to cut the square into a circle. The road
  // slab tops out near y 0.08. Off the grass deck there is nothing to sit on.
  const DECK = 2.85;
  function contactShadow(x, z, yaw, height, radius) {
    if (n >= MAX - 96) return;
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

  // tint 0 keeps the garden mix. 1 blossom, 2 apple, 3 star, 4 gem.
  function burst(x, y, z, rgb, count, lift, tint = 0, psi = 0) {
    let left = count;
    for (let i = 0; i < 36 && left > 0; i++) {
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
    let left = count;
    for (let i = 0; i < DUST_N && left > 0; i++) {
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
      if (Math.abs(lat) <= DECK) contactShadow(at.x, at.z, at.psi, hop, 0.34);
      const plan = pal.plan || pal.kind;
      const look = carLook(plan, t, i, reduced);
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

  function frame(st) {
    const pal = dressPalette(palette(st.hue || 0, st.scene), st.biome, st.mood);
    const gardenLook = pal.biome === "garden";
    const px = st.lx || 0;
    const py = st.y || 0;
    const pz = Number.isFinite(st.x) ? st.x : runS;
    const speed = st.speed || 5;
    const grav = st.g || 32;
    const alive = st.alive !== false;
    const bend = Number.isFinite(st.bend) ? st.bend : DEFAULT_BEND;
    const nowMs = Number.isFinite(st.now) ? st.now : 0;
    const frameDt = shownAt > 0 ? Math.min(0.05, Math.max(0.001, (nowMs - shownAt) / 1000)) : 1 / 60;
    if (nowMs > 0) shownAt = nowMs;
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
    } else {
      shownS = glide.s;
      noteBend(shownS, bend);
    }
    runS = shownS;
    const drawS = shownS;
    const feet = sample(drawS, px);
    const rx = feet.x;
    const rz = feet.z;
    const reduced = !!st.reduced;
    if (Math.abs(speed - prevSpeed) > 0.05 || Math.abs(grav - prevG) > 0.05) pulse = 1;
    prevSpeed = speed;
    prevG = grav;
    const justLanded = py <= 0.02 && prevY > 0.18;
    if (justLanded) land = 1;
    prevY = py;
    const lxDelta = px - prevLx;
    prevLx = px;
    lean += ((reduced ? 0 : -lxDelta * 6) - lean) * (reduced ? 1 : 0.2);
    land = Math.max(0, land - (reduced ? 1 : 0.08));
    pulse = Math.max(0, pulse - (reduced ? 1 : 0.015));
    if (st.reject) reject = 1;
    reject = Math.max(0, reject - 0.01);
    const followL = reduced ? 1 : 0.12;
    const followS = reduced ? 1 : 0.18;
    camLat += (px - camLat) * followL;
    camS += (drawS - camS) * followS;
    const floaty = Math.max(0, (32 - grav) * 0.03);
    const wantY = 2.25 + floaty + (py > 0.4 ? 0.18 : 0) - land * 0.16;
    camY += (wantY - camY) * (reduced ? 1 : 0.08);
    const wantFov = (py > 0.35 ? 1.04 : 0.9) + Math.min(0.1, Math.max(0, speed - 5) * 0.025) + pulse * 0.04;
    camFov += (wantFov - camFov) * (reduced ? 1 : 0.08);
    const bob = reduced || !alive ? 0 : Math.sin(st.time * (8 + speed * 0.25)) * 0.02;
    const basis = sample(camS, 0);
    const followed = sample(camS, camLat);
    const psi = basis.psi;
    const ox = followed.x - basis.x;
    const oz = followed.z - basis.z;
    const leanWorld = lean * 0.15;
    const eye = [
      basis.x + ox * 0.62 - Math.sin(psi) * 4.7 + leanWorld * Math.cos(psi),
      camY + bob,
      basis.z + oz * 0.62 - Math.cos(psi) * 4.7 - leanWorld * Math.sin(psi),
    ];
    // One beat ahead, so the next move sits in the view. The eye stays
    // 4.7 m behind, and a bend still rebases only past 8 m.
    const lookAhead = speed * 1.3;
    const at = [
      basis.x + ox * 0.22 + Math.sin(psi) * lookAhead,
      0.95 + py * 0.18 + floaty * 0.4,
      basis.z + oz * 0.22 + Math.cos(psi) * lookAhead,
    ];
    perspective(proj, camFov, w / h, 0.08, 96);
    lookAt(view, eye, at, [0, 1, 0]);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(sky);
    gl.uniform3fv(u.sky0, pal.sky0);
    gl.uniform3fv(u.sky1, pal.sky1);
    gl.uniform3fv(u.hill, pal.hill);
    gl.uniform3fv(u.hill2, pal.hill2);
    gl.uniform3fv(u.sunCol, pal.sun);
    gl.uniform2f(u.sun, pal.sunUv[0], pal.sunUv[1]);
    gl.uniform1f(u.time, st.time || 0);
    gl.uniform1f(u.camZ, camS);
    gl.uniform1f(u.yaw, psi);
    gl.uniform1f(u.fov, camFov);
    const skyShow = visibleSky(st.props, st.sunHide);
    gl.uniform1f(u.sunAmt, skyShow.shader * (pal.disc == null ? 1 : pal.disc));
    // The full-screen streak is a real-GPU extra. SwiftShader keeps the
    // few road-edge quads below and skips this pass.
    const softwareGL = /swiftshader|llvmpipe|softpipe|software/i.test(gpuName);
    const rush = !reduced && speed >= 12 && !softwareGL ? 1 : 0;
    gl.uniform1f(u.rush, rush);
    gl.uniform1f(u.stars, pal.stars || 0);
    gl.uniform3fv(u.nebula, pal.nebula || [0, 0, 0]);
    gl.uniform2f(u.res, w, h);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
    gl.enable(gl.DEPTH_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    n = 0;
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
    function drawTree(along, lat, kind, scale, near, sway) {
      const at = onRoad(along, lat);
      const swayX = sway * Math.cos(at.psi);
      const swayZ = -sway * Math.sin(at.psi);
      const leaf = mix3(pal.leaf, pal.leaf2, kind === 2 ? 0.2 : 0.62);
      const trunk = mix3(pal.trunk, [0.32, 0.2, 0.13], kind === 1 ? 0.15 : 0.4);
      const wood = near ? 3 : 0;
      const top = [at.x + swayX, at.z + swayZ];
      // Roadside trees stand past the grass deck, so a ground blot would hang in the air.
      if (Math.abs(lat) <= DECK) contactShadow(at.x, at.z, at.psi, 0, 0.42 * scale);
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
            const mid = (cursor + end) / 2;
            const tile = onRoad(mid, lat);
            const vary = (laneHash(mid * 0.23 + lane * 17.2) - 0.5) * 0.09;
            const top = vary >= 0 ? mix3(baseTop, [1, 1, 1], vary) : mix3(baseTop, [0.16, 0.18, 0.1], -vary);
            const len = end - cursor;
            const grass = lane !== 1 && dist > -2 && dist < 4 ? 4 : 0;
            push(tile.x, 0.02, tile.z, 1.74, 0.12, len + 0.02, 0, top, lane === 1 ? 0.55 : 0.8, 0, tile.psi, 0, 0, grass);
          }
          if (i < spans.length) cursor = spans[i][1];
        }
        for (let i = 0; i < spans.length; i++) {
          const a = spans[i][0];
          const b = spans[i][1];
          const mid = (a + b) / 2;
          const tile = onRoad(mid, lat);
          push(tile.x, -0.06, tile.z, 1.72, 0.1, b - a + 0.04, 0, pal.water, 0.12, 0.1, tile.psi, 0, 0, 1);
          const spanLen = b - a;
          if (spanLen > 0.8 && laneHash(mid * 0.27 + lane * 5.1) > 0.38 && n < MAX - 160) {
            const off = (laneHash(mid * 0.53 + lane) - 0.5) * 0.7;
            const along = mid + (laneHash(mid * 0.91) - 0.5) * Math.min(0.6, spanLen * 0.3);
            const lily = onRoad(along, lat + off);
            const pad = 0.22 + laneHash(mid * 1.3 + lane) * 0.14;
            push(lily.x, 0.03, lily.z, pad, 0.04, pad * 0.86, 0, pal.lily, 0.5, 0.06, lily.psi);
            if (laneHash(mid * 1.7 + 3) > 0.62) {
              push(lily.x, 0.07, lily.z, 0.08, 0.08, 0.08, 1, pal.flower, 0.3, 0.35, lily.psi);
            }
          }
        }
      }
      if (gardenLook) {
      if (dist < 36 && ((z / 2) | 0) % 2 === 0) {
        const hv = laneHash(z * 0.19 + 4.2);
        const hedgeH = 0.30 + hv * 0.22;
        const hedgeW = 0.56 + hv * 0.22;
        const hedgeD = 3.5 + laneHash(z * 0.07) * 0.7;
        const tint = mix3(pal.hedge, hv > 0.5 ? pal.leaf : [0.08, 0.12, 0.06], Math.abs(hv - 0.5) * 0.35);
        const hedgeL = onRoad(cz, -3.35);
        const hedgeR = onRoad(cz, 3.35);
        push(hedgeL.x, hedgeH * 0.5, hedgeL.z, hedgeW, hedgeH, hedgeD, 0, tint, 0.8, 0, hedgeL.psi);
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
            for (const side of [-1, 1]) {
              const lat = side * (4.7 + laneHash(z + side) * 0.5);
              const at = onRoad(cz, lat);
              const h = 1.8 + laneHash(z * 0.31 + side) * 2.6;
              const bw = 1.15 + laneHash(z * 0.17 + side * 3) * 0.7;
              const body = mix3([0.28, 0.32, 0.46], [0.55, 0.36, 0.4], laneHash(z * 0.53 + side));
              push(at.x, h * 0.5, at.z, bw, h, bw * 0.75, 0, body, 0.5, 0.04, at.psi, 0, 0, 6);
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
                const y = 2.25 + laneHash(z + side) * 0.7;
                push(at.x, y, at.z, 1.1, 1.1, 1.1, 1, [0.42, 0.55, 0.9], 0.3, 0.28, at.psi);
                push(at.x, y, at.z, 1.85, 0.08, 1.85, 1, [0.7, 0.88, 1], 0.2, 0.45, at.psi);
              } else if (kind > 0.28) {
                const at = onRoad(cz, side * (5.05 + laneHash(z + side) * 0.7));
                push(at.x, 1.1, at.z, 0.68, 0.5, 0.58, 1, [0.48, 0.44, 0.42], 0.7, 0.08, at.psi);
              } else {
                const inner = side * 4.2;
                const outer = side * 6.05;
                const a = onRoad(cz, inner);
                const b = onRoad(cz, outer);
                const mid = onRoad(cz, (inner + outer) * 0.5);
                const h = 2.4;
                push(a.x, h * 0.5, a.z, 0.1, h, 0.1, 0, railCol, 0.25, 0.55, a.psi);
                push(b.x, h * 0.5, b.z, 0.1, h, 0.1, 0, railCol, 0.25, 0.55, b.psi);
                push(mid.x, h, mid.z, Math.abs(outer - inner), 0.09, 0.1, 0, railCol, 0.2, 0.75, mid.psi);
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
    }
    if (!(pal.biome === "garden" && pal.mood === "day") && n < MAX - 12) {
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
      contactShadow(at.x, at.z, spin, Math.max(0, y - s * 0.45), Math.max(0.22, s * 1.15));
      if (kind === "star") {
        push(at.x, y, at.z, s * 1.15, s * 0.42, s * 1.15, 2, [1, 0.86, 0.28], 0.12, 0.95);
        push(at.x, y, at.z, s * 0.42, s * 1.15, s * 0.42, 2, [1, 0.95, 0.55], 0.12, 0.9);
      } else if (kind === "gem") {
        push(at.x, y, at.z, s * 0.72, s * 1.25, s * 0.72, 2, [0.45, 0.78, 1], 0.1, 0.95);
      } else if (kind === "blossom") {
        push(at.x, y, at.z, s * 1.05, s * 0.38, s * 1.05, 1, [1, 0.55, 0.75], 0.25, 0.7);
        push(at.x, y, at.z, s * 0.32, s * 0.32, s * 0.32, 1, [1, 0.92, 0.45], 0.2, 0.85);
      } else if (kind === "apple") {
        push(at.x, y, at.z, s * 0.95, s * 1.05, s * 0.95, 1, [0.95, 0.32, 0.38], 0.35, 0.55);
        push(at.x, y + s * 0.62, at.z, 0.05, 0.14, 0.05, 0, [0.35, 0.62, 0.28], 0.4, 0.1);
      } else {
        push(at.x, y, at.z, s, s, s, 2, pal.coin, 0.12, 0.95, spin, 0.74, 0.58, 5);
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
      push(postL.x, bottom * 0.5 * sc, postL.z, 0.28, bottom * sc, 0.28, 0, postRgb, 0.4, 0.12, postL.psi);
      push(postR.x, bottom * 0.5 * sc, postR.z, 0.28, bottom * sc, 0.28, 0, postRgb, 0.4, 0.12, postR.psi);
      if (look === 1) {
        push(gate.x, gy, gate.z, span, barH * sc * 0.62, solid * 0.85, 0, [1, 0.55, 0.72], 0.25, 0.35 + glow, gate.psi);
        push(gate.x, gy, gate.z, span, Math.max(0.05, barH * sc * 0.2), solid * 0.55, 0, [1, 0.82, 0.38], 0.2, 0.45, gate.psi);
        const bow = 0.3 * sc;
        push(gate.x, gy + barH * sc * 0.28, gate.z, bow, bow, bow, 1, [1, 0.42, 0.58], 0.22, 0.4, gate.psi);
      } else if (look === 2) {
        push(gate.x, gy, gate.z, span, barH * sc, solid, 0, pal.leaf, 0.45, 0.12 + glow, gate.psi);
        const leaves = [-1.6, -0.8, 0, 0.8, 1.6];
        const bulb = 0.18 * sc;
        for (let i = 0; i < leaves.length; i++) {
          const leaf = onRoad(zc, leaves[i]);
          push(leaf.x, gy + barH * sc * 0.22, leaf.z, bulb, bulb, bulb, 1, i % 2 ? pal.leaf2 : pal.leaf, 0.4, 0.1, leaf.psi);
        }
      } else if (look === 3) {
        push(gate.x, gy, gate.z, span, Math.max(0.05, barH * sc * 0.22), solid * 0.7, 0, [0.42, 0.32, 0.2], 0.4, 0.08, gate.psi);
        const bulbs = [-1.8, -0.9, 0, 0.9, 1.8];
        const bulb = 0.18 * sc;
        for (let i = 0; i < bulbs.length; i++) {
          const lamp = onRoad(zc, bulbs[i]);
          push(lamp.x, gy, lamp.z, bulb, bulb, bulb, 1, [1, 0.92, 0.55], 0.15, 0.9, lamp.psi);
        }
      } else if (look === 4) {
        const a = onRoad(zc - 0.04, 0);
        const b = onRoad(zc + 0.05, 0);
        push(a.x, gy, a.z, span * 0.98, barH * sc * 0.7, solid * 0.72, 0, [0.95, 0.42, 0.55], 0.3, 0.22 + glow, a.psi);
        push(b.x, gy, b.z, span, barH * sc * 0.42, solid * 0.55, 0, [0.98, 0.82, 0.55], 0.28, 0.18, b.psi);
      } else {
        const thick = Math.max(0.45, q[2]);
        push(gate.x, gy, gate.z, 5.45 * sc, barH * sc * 1.45, Math.max(0.28, thick * 0.5), 0, [1, 0.97, 0.86], 0.18, 0.95, gate.psi);
        push(gate.x, gy, gate.z, span, barH * sc, solid, 0, pal.gate, 0.28, 0.78 + glow, gate.psi);
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
        push(at.x, 0.05, at.z, 1.2, 0.022, step * 0.92, 0, rgb, 0.35, 0.55, at.psi);
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
      spin = face;
      drawBody(plan, here.x, 0, here.z, rivalTint(plan), st.time || 0, reduced);
      spin = 0;
      const mark = at(0.1, 1.05);
      push(mark[0], mark[1], mark[2], 0.16, 0.08, 0.08, 0, [0.9, 0.18, 0.14], 0.3, 0.55, face);
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
      push(postL.x, bottom * 0.5, postL.z, 0.28, bottom, 0.28, 0, pal.gate, 0.4, 0.12, postL.psi);
      push(postR.x, bottom * 0.5, postR.z, 0.28, bottom, 0.28, 0, pal.gate, 0.4, 0.12, postR.psi);
      // Daylight under the bar stays: the tiles start at the bar's bottom
      // and only grow upward.
      const tiles = 4;
      const span = 5.2 * sc;
      const tw = span / tiles;
      const th2 = Math.max(barH, 0.9 * sc);
      const depth = gateBarDepth(q[2]) * 1.4;
      const grow = growOf(th.id, nowMs, reduced);
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
      const glow = q.born ? 0.16 : 0;
      const lootKind = typeof st.loot === "string" ? st.loot : "coin";
      const here = onRoad(zc, laneX(lane < 0 ? 1 : lane));
      const th = q.thing;
      if (k === 3 && th && th.role === "jump") {
        thingHurdle(q, th, zc, lane, sc);
      } else if (k === 4 && th && th.role === "slide") {
        thingGate(q, th, zc, sc);
      } else if (k === 5 && th && th.role === "pickup") {
        thingPickup(q, th, here, sc);
      } else if (k === 3) {
        drawHurdle(q, zc, lane, sc, glow);
      } else if (k === 4) {
        drawGate(q, zc, sc, glow);
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
        drawBlock(q, zc, lane, sc, glow);
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
        drawPopper(q, here);
      } else if (k === 10) {
        drawRival(q, here);
      }
    }

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
    drawFinish(st.goal);

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
    }
    if (st.event === "spring") burst(rx, py + 0.4, rz, pal.spring, 8, 0.08, 0, heading);
    if (st.near) burst(rx + ax.tx * 0.4, py + 0.7, rz + ax.tz * 0.4, pal.sun, 6, 0.02, 0, heading);
    if (land > 0.85) burst(rx, 0.15, rz, pal.path, 4, 0.01, 0, heading);
    if (st.reject) burst(rx + ax.tx * 2, 1.6, rz + ax.tz * 2, pal.flower, 10, 0.06, 0, heading);
    if (!reduced && alive && py <= 0.06) {
      if (justLanded) puffDust(rx, 0.06, rz, heading, 5, 0.7);
      else if (speed >= 8) {
        dustStep++;
        const every = speed >= 12 ? 3 : 6;
        if (dustStep >= every) {
          dustStep = 0;
          const side = Math.sin((st.time || 0) * 9) > 0 ? 0.14 : -0.14;
          const foot = sample(drawS, px + side);
          puffDust(foot.x, 0.05, foot.z, foot.psi, 1, 0.32);
        }
      }
    }

    drawPals(st.pals, drawS, st.time || 0, reduced);

    const air = py > 0.08;
    const sliding = st.slide > 0;
    const freq = reduced || !alive ? 0 : (9.2 + speed * 0.35);
    const swing = Math.sin((st.time || 0) * freq);
    const stride = Math.cos((st.time || 0) * freq);
    const squash = !alive ? 1 : air ? 1.14 : 1 - land * 0.16;
    const widen = !alive ? 1 : air ? 0.9 : 1 + land * 0.12;
    const leanLat = reduced ? 0 : -lean * 0.35;
    const spot = (ds, dlat) => sample(drawS + ds, px + dlat);
    const hero = st.hero || {};
    const heroPlan = hero.plan || "keeper";
    const dressed = !drawsKeeper(hero);
    spin = feet.psi;
    if (alive) {
      const shadow = spot(0, 0);
      push(shadow.x, 0.02, shadow.z, sliding ? 0.95 : 0.62, 0.025, sliding ? 0.9 : 0.5, 0, [0.18, 0.12, 0.08], 1, 0);
      if ((st.g || 32) < 26) {
        const glow = [0.78, 0.92, 1];
        const bob = reduced ? 0 : Math.sin((st.time || 0) * 3) * 0.02;
        const footL = spot(0.02, leanLat - 0.16);
        const footR = spot(0.02, leanLat + 0.16);
        push(footL.x, 0.05 + bob, footL.z, 0.18, 0.04, 0.18, 1, glow, 0.25, reduced ? 0.2 : 0.45);
        push(footR.x, 0.05 + bob, footR.z, 0.18, 0.04, 0.18, 1, glow, 0.25, reduced ? 0.2 : 0.45);
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
        const torsoY = py + (sliding ? 0.3 : 0.5 * squash);
        const torso = sliding ? 0.52 : 0.46 * widen;
        const hip = spot(0, leanLat);
        push(hip.x, torsoY, hip.z, torso, sliding ? 0.3 : 0.42 * squash, sliding ? 0.62 : 0.4, 0, pal.body, 0.35, 0.14);
        const hy = torsoY + (sliding ? 0.16 : 0.34 * squash);
        const head = spot(sliding ? 0.16 : 0, leanLat * 0.2);
        push(head.x, hy, head.z, sliding ? 0.32 : 0.44, sliding ? 0.26 : 0.4, sliding ? 0.3 : 0.4, 1, pal.head, 0.2, 0.28);
        if (!sliding) {
          const flame = reduced ? 0 : Math.sin(st.time * 11) * 0.035;
          const tuft = spot(-0.02, leanLat * 0.15);
          push(tuft.x, hy + 0.32 + flame + pulse * 0.05, tuft.z, 0.13, 0.3, 0.13, 1, pal.cape, 0.12, 1);
        }
      }
      drawGear(spot, py, leanLat, sliding, st.time || 0, reduced, st.gear || 1, st.ward == null ? 1 : st.ward, pal, reduced ? 0 : stride, !dressed);
      const trailN = reduced ? 0 : Math.min(6, 3 + Math.floor(Math.max(0, speed - 5)));
      for (let t = 1; t <= trailN; t++) {
        const fade = 1 - t / (trailN + 1);
        const s = 0.12 * fade;
        const puff = spot(-0.45 - t * (0.28 + speed * 0.02), lean * 0.1 * t);
        push(puff.x, 0.35 + fade * 0.15, puff.z, s, s, s, 2, pal.cape, 0.15, 0.35 + fade * 0.5);
      }
    } else if (!alive) {
      const rest = 0.22 + (reduced ? 0 : Math.sin(st.time * 2) * 0.03);
      push(rx, 0.04, rz, 0.7, 0.03, 0.55, 0, [0.15, 0.1, 0.08], 1, 0);
      push(rx, rest, rz, 0.36, 0.36, 0.36, 1, pal.cape, 0.2, 0.9);
      push(rx, rest + 0.28, rz, 0.14, 0.22, 0.14, 1, pal.sun, 0.15, 1);
    }
    spin = 0;

    for (let i = 0; i < 36; i++) {
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
    for (let i = 0; i < DUST_N; i++) {
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
    if (!reduced && speed >= 12 && n < MAX - 16) {
      const scroll = ((st.time || 0) * Math.min(speed, 18)) % 3.4;
      for (let s = 0; s < 3; s++) {
        for (const side of [-1, 1]) {
          const along = drawS + 0.4 + s * 3.4 - scroll;
          const at = sample(along, side * (2.35 + (s === 1 ? 0.4 : 0)));
          const h = 0.1 + (s === 2 ? 0.08 : 0);
          push(at.x, 0.42 + s * 0.28, at.z, 0.03, h, 2.5, 0, [1, 0.98, 0.9], 0.22, 0.55, at.psi);
        }
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
    const sunI = 0.55 + 0.55 * pal.lightAmt;
    const lightAmt = 0.55 * sunI * (1 + lift * 0.08 + pulse * 0.06);
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
    drawSpan(meshBox, ub, 0, boxPat, false, 0);
    drawSpan(meshPat, up, boxPat, lo - boxPat, false, 0);
    drawSpan(meshBall, uBall, lo, mid - lo, false, 0);
    drawSpan(mesh, um, mid, n - mid, true, 0);
    gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
    canvas.dataset.instances = String(n);
    canvas.dataset.dust = String(dustN);
    canvas.dataset.rush = rush ? "1" : "0";
    canvas.dataset.biome = pal.biome || "garden";
    canvas.dataset.mood = pal.mood || "day";
    return n;
  }

  return { gl, resize, frame, noteFrameTime };
}
