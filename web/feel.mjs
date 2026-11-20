// Picture feel for Medium and High. Pure numbers, no GL and no sim.
// Low keeps the camera and the shaders it already has. These helpers
// are presentation only: they do not move the runner, the rival, or a hit box.

const GRADE = {
  garden: { sat: 1.06, contrast: 1.04, lift: [0.012, 0.008, 0.0], gain: [1.04, 1.01, 0.94] },
  city: { sat: 1.02, contrast: 1.08, lift: [0.0, 0.004, 0.01], gain: [1.04, 0.99, 0.94] },
  space: { sat: 1.12, contrast: 1.1, lift: [0.0, 0.0, 0.02], gain: [0.88, 0.94, 1.14] },
  coast: { sat: 1.05, contrast: 1.03, lift: [0.008, 0.014, 0.012], gain: [1.0, 1.03, 0.98] },
  ice: { sat: 0.86, contrast: 1.08, lift: [0.016, 0.03, 0.04], gain: [0.84, 0.98, 1.1] },
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

// Radial blur weight. Quiet under 10 m/s so the opening is sharp.
export function blurAmount(speed, budget) {
  const b = budget > 0 ? budget : 0;
  if (!(b > 0)) return 0;
  const t = Math.min(1, Math.max(0, ((Number(speed) || 0) - 10) / 8));
  return b * t;
}

// Screen position of the sky disc. Matches the yaw shift in the sky shader.
export function sunScreen(yaw, fov, aspect, sunUv) {
  const span = Math.max((fov > 0 ? fov : 0.9) * Math.max(aspect > 0 ? aspect : 1, 0.3), 0.3);
  const uv = Array.isArray(sunUv) ? sunUv : [0.74, 0.78];
  const x = (uv[0] || 0) + (Number(yaw) || 0) / span;
  const y = uv[1] || 0;
  return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
}
