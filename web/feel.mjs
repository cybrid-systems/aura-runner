// Picture feel for Medium and High. Pure numbers, no GL and no sim.
// Low keeps the camera and the shaders it already has. These helpers
// are presentation only: they do not move the runner, the rival, or a hit box.

const GRADE = {
  // Higher tiers mix this in. Saturation stays above 1 so the grade
  // does not grey the picture the way a filmic shoulder can.
  garden: { sat: 1.18, contrast: 1.1, lift: [0.004, 0.002, 0.0], gain: [1.04, 1.03, 0.98] },
  city: { sat: 1.32, contrast: 1.04, lift: [0.0, 0.0, 0.0], gain: [1.0, 1.01, 0.97] },
  // Warm dust stays warm, but the gain does not pile more yellow on the sky.
  beijing: { sat: 1.06, contrast: 1.14, lift: [0.0, 0.0, 0.008], gain: [0.94, 0.98, 1.04] },
  space: { sat: 1.24, contrast: 1.16, lift: [0.004, 0.008, 0.02], gain: [0.92, 0.98, 1.12] },
  coast: { sat: 1.16, contrast: 1.08, lift: [0.002, 0.008, 0.006], gain: [1.02, 1.04, 1.0] },
  ice: { sat: 1.02, contrast: 1.08, lift: [0.008, 0.016, 0.024], gain: [0.88, 1.0, 1.08] },
};

function clampGain(g) {
  return Math.max(0.55, Math.min(1.45, g));
}

// Colour grade for the post pass. Built-in venues have a family. An evolved
// palette (any sky the trial kept) tints the gain, so a new world does not
// wear the garden grade unchanged. Aurora ice is its own cool family.
export function sceneGrade(pal) {
  const src = pal || {};
  const biome = typeof src.biome === "string" ? src.biome : "garden";
  const ice = biome === "aurora-ice"
    || src.surface === "ice"
    || src.particles === "snow"
    || src.body === "aurora";
  const family = ice ? GRADE.ice : (GRADE[biome] || GRADE.garden);
  const sky = Array.isArray(src.sky) ? src.sky : [0.55, 0.72, 0.95];
  const fog = Array.isArray(src.fog) ? src.fog : sky;
  const gain = [0, 1, 2].map((i) => {
    const channel = sky[i] >= 0 && sky[i] <= 1 ? sky[i] : 0.5;
    return clampGain(family.gain[i] * (0.84 + 0.28 * channel));
  });
  const shaft = [0, 1, 2].map((i) => {
    const c = fog[i] >= 0 && fog[i] <= 1 ? fog[i] : 0.8;
    return c;
  });
  return {
    sat: family.sat,
    contrast: family.contrast,
    lift: family.lift.slice(),
    gain,
    shaft,
    family: ice ? "ice" : (GRADE[biome] ? biome : "garden"),
  };
}

// Extra field of view above the speed the low camera already uses.
// Nothing until 8 m/s, full budget at 16 m/s.
export function fovKick(speed, amount) {
  const a = amount > 0 ? amount : 0;
  if (!(a > 0)) return 0;
  const t = Math.min(1, Math.max(0, (Number(speed) || 0) - 8) / 8);
  return a * t;
}

// Critically damped lane follow. One step must not snap to the target.
export function laneEase(lat, vel, target, dt, tier) {
  const step = dt > 0 ? Math.min(0.05, dt) : 1 / 60;
  const omega = tier === "high" ? 10 : 8;
  const zeta = 0.9;
  let v = Number.isFinite(vel) ? vel : 0;
  let x = Number.isFinite(lat) ? lat : target;
  const goal = Number.isFinite(target) ? target : 0;
  const acc = (goal - x) * omega * omega - 2 * zeta * omega * v;
  v += acc * step;
  x += v * step;
  if (Math.abs(goal - x) > 2.2) {
    x = goal + Math.sign(x - goal) * 2.2;
    v = 0;
  }
  return { lat: x, vel: v };
}

export function shakeOffset(amp, time) {
  const a = amp > 0 ? amp : 0;
  if (!(a > 0)) return [0, 0, 0];
  const t = Number(time) || 0;
  return [
    Math.sin(t * 61.7) * a,
    Math.cos(t * 47.3) * a * 0.4,
    Math.cos(t * 53.1) * a,
  ];
}

// One radial sample must not jump further than this many framebuffer
// pixels. Wider jumps reprint a lamp post as a stack of copies. The
// finish pass reads a pre-blurred image whose footprint is wider, so
// neighbours overlap into one streak.
export const BLUR_TAP_PX = 8;

// Pixel step of one speed-blur sample. distUv is the distance from the
// hero in UV. The cap is what keeps 12–18 m/s a smear instead of ghosts.
export function blurTapPx(distUv, blur, width) {
  const b = blur > 0 ? blur : 0;
  const w = width > 0 ? width : 0;
  const dir = Math.abs(Number(distUv) || 0) * b * 0.085;
  const step = dir * 0.45 * w;
  return Math.min(BLUR_TAP_PX, step);
}

// Radial blur weight. Quiet through 9 m/s so the opening stays sharp.
// The curve is already a quarter of the budget at 12 m/s and full at 18,
// which is the range that should read as speed. The hero is masked in
// the high finish pass, so a stronger weight does not smear the runner.
export function blurAmount(speed, budget) {
  const b = budget > 0 ? budget : 0;
  if (!(b > 0)) return 0;
  const s = Number(speed) || 0;
  if (s <= 9) return 0;
  const t = Math.min(1, (s - 9) / 9);
  const shaped = t * t * (3 - 2 * t);
  return b * shaped;
}

// Whoosh amplitude. age 0 is the pass, age 1 has settled.
// The renderer points it away from the obstacle.
export function whooshNudge(amp, age) {
  const a = amp > 0 ? amp : 0;
  if (!(a > 0)) return 0;
  const u = Math.max(0, Math.min(1, Number(age) || 0));
  return a * (1 - u) * (1 - u);
}

// Squash, widen, and lane lean. Medium and low keep the picture they
// already had. High stretches the jump and leans harder into a lane change.
export function heroShape(air, land, lean, tier) {
  const high = tier === "high";
  const landed = Number(land) || 0;
  const side = Number(lean) || 0;
  return {
    squash: air ? (high ? 1.28 : 1.14) : 1 - landed * (high ? 0.28 : 0.16),
    widen: air ? (high ? 0.82 : 0.9) : 1 + landed * (high ? 0.22 : 0.12),
    lean: -side * (high ? 0.62 : 0.35),
  };
}

// High road pattern. 0 flagstone, 1 asphalt, 2 ice, 3 sand,
// 4 planks, 5 lava, 6 cloud. A city stays asphalt in the snow.
export function groundId(pal) {
  const src = pal || {};
  const surface = typeof src.surface === "string" ? src.surface : "";
  const biome = typeof src.biome === "string" ? src.biome : "";
  if (biome === "city") return 1;
  if (biome === "aurora-ice" || surface === "ice" || src.particles === "snow" || src.body === "aurora") return 2;
  if (surface === "sand" || surface === "dust") return 3;
  if (surface === "plank") return 4;
  if (surface === "lava") return 5;
  if (surface === "cloud") return 6;
  return 0;
}

// 1 on an icy road, 0.85 on a city road, 0 everywhere else.
// High multiplies this by the reflect budget. Medium stays at 0.
export function glossFor(pal) {
  const src = pal || {};
  const biome = typeof src.biome === "string" ? src.biome : "";
  const surface = typeof src.surface === "string" ? src.surface : "";
  if (biome === "aurora-ice" || surface === "ice" || src.particles === "snow" || src.body === "aurora") return 1;
  if (biome === "city") return 0.85;
  return 0;
}

// Screen position of the sky disc. Matches the yaw shift in the sky shader.
export function sunScreen(yaw, fov, aspect, sunUv) {
  const span = Math.max((fov > 0 ? fov : 0.9) * Math.max(aspect > 0 ? aspect : 1, 0.3), 0.3);
  const uv = Array.isArray(sunUv) ? sunUv : [0.74, 0.78];
  const x = (uv[0] || 0) + (Number(yaw) || 0) / span;
  const y = uv[1] || 0;
  return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
}
