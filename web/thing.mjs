// A generated thing arrives as numbers (lib/thing.aura). Nothing here
// knows what a cake or a castle is: every thing is drawn from its parts,
// fitted into the hit box of its role, so the picture is never bigger or
// smaller than what the runner meets.

export const ROLES = ["pickup", "jump", "slide", "decor", "pal"];
export const SHAPES = ["box", "sphere", "cylinder", "cone", "torus", "gem"];
// Shader shape codes: 0 box, 1 sphere, 2 gem, 3 cylinder, 4 cone, 5 torus.
const SHADER = [0, 1, 3, 4, 5, 2];
const MAX_PARTS = 8;
const SIZE_RANGE = {
  pickup: [0.8, 1.6],
  jump: [0.3, 0.6],
  slide: [0.62, 0.9],
  decor: [0.6, 2.0],
  pal: [0.5, 1.0],
};
const ANIMS = ["none", "spin", "bob", "hop", "float"];

function num(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function inRange(v, lo, hi) {
  return num(v) && v >= lo && v <= hi;
}

// The same caps the Aura checker applies. A thing that fails here is
// not drawn, and the page tells the core so it can roll back.
export function validThing(t) {
  if (!t || typeof t !== "object") return null;
  if (!ROLES.includes(t.role)) return null;
  const range = SIZE_RANGE[t.role];
  if (!inRange(t.size, range[0], range[1])) return null;
  const anim = Array.isArray(t.anim) ? t.anim : ["none", 0, 0];
  const kind = ANIMS.includes(anim[0]) ? anim[0] : null;
  if (!kind || !inRange(anim[1], 0, 0.3) || !inRange(anim[2], 0, 3)) return null;
  if ((t.role === "jump" || t.role === "slide")
      && !(kind === "none" || kind === "spin" || (kind === "bob" && anim[1] <= 0.05))) return null;
  if (!Array.isArray(t.parts) || t.parts.length < 1 || t.parts.length > MAX_PARTS) return null;
  const parts = [];
  for (const p of t.parts) {
    if (!Array.isArray(p) || p.length !== 11 || !p.every(num)) return null;
    const [code, x, y, z, sx, sy, sz, r, g, b, glow] = p;
    if (!Number.isInteger(code) && Math.abs(code - Math.round(code)) > 1e-6) return null;
    const ci = Math.round(code);
    if (ci < 0 || ci >= SHAPES.length) return null;
    if (![sx, sy, sz].every((s) => s >= 0.05 && s <= 1)) return null;
    if (Math.abs(x) + sx / 2 > 0.52 || Math.abs(z) + sz / 2 > 0.52) return null;
    if (y - sy / 2 < -0.02 || y + sy / 2 > 1.02) return null;
    if (![r, g, b].every((c) => c >= 0.1 && c <= 1)) return null;
    if (0.25 * r + 0.5 * g + 0.25 * b < 0.3) return null;
    if (!inRange(glow, 0, 0.6)) return null;
    parts.push({ shape: SHADER[ci], x, y, z, sx, sy, sz, rgb: [r, g, b], glow });
  }
  return {
    id: t.id,
    role: t.role,
    size: t.size,
    name: typeof t.name === "string" ? t.name.slice(0, 16) : "",
    anim: { kind, amp: anim[1], rate: anim[2] },
    parts,
  };
}

// Where a spoken toy stands beside the runner. Lateral ±3.6 is off the
// road, so this box is a picture only and not a hit volume. ahead is
// metres in front of the runner; the road frame is onRoad's.
export function showBox(thing, i) {
  const n = Number.isFinite(i) ? i : 0;
  const side = n % 2 === 0 ? -1 : 1;
  const ahead = 5.5 + n * 3;
  const lat = side * 3.6;
  const role = thing && thing.role;
  const size = thing && Number.isFinite(thing.size) ? thing.size : 1;
  if (role === "jump") return { ahead, lat, y: 0, w: 1.1, h: size, d: 0.7 };
  if (role === "slide") return { ahead, lat, y: 0, w: 1.4, h: 1.15, d: 0.6 };
  const h = 1.35 * size;
  return { ahead, lat, y: 0, w: size, h, d: size };
}

const arrived = new Map();

// 0..1 grow-in the first time a thing is drawn.
export function growOf(id, now, reduced) {
  if (reduced) return 1;
  let t0 = arrived.get(id);
  if (t0 === undefined) {
    t0 = now;
    arrived.set(id, t0);
    if (arrived.size > 32) arrived.delete(arrived.keys().next().value);
  }
  const k = Math.min(1, Math.max(0, (now - t0) / 700));
  return 1 - Math.pow(1 - k, 3);
}

// Animation offset for the whole thing: [yaw, lift] in envelope units.
export function animOf(thing, time, phase, reduced) {
  const a = thing.anim;
  if (reduced || a.kind === "none" || a.rate <= 0) return [0, 0];
  const w = time * a.rate * Math.PI * 2 + phase;
  if (a.kind === "spin") return [w * 0.25, 0];
  if (a.kind === "bob") return [0, Math.sin(w) * a.amp];
  if (a.kind === "hop") return [0, Math.abs(Math.sin(w)) * a.amp];
  return [Math.sin(w * 0.5) * 0.3, (Math.sin(w) * 0.5 + 0.5) * a.amp];
}

// box: { x, y, z, psi, w, h, d } with y the bottom of the hit box and
// w, h, d its world size across the road, up, and along the road.
// push(x, y, z, sx, sy, sz, shape, rgb, rough, emit, yaw)
export function drawThing(push, thing, box, opts = {}) {
  const grow = opts.grow === undefined ? 1 : opts.grow;
  const [spinYaw, lift] = opts.anim || [0, 0];
  const yaw = box.psi + spinYaw;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const glowBoost = opts.glow || 0;
  let drawn = 0;
  for (const p of thing.parts) {
    // Grow from the centre of the base so a hurdle rises out of the road.
    const lx = p.x * box.w * grow;
    const lz = p.z * box.d * grow;
    const ly = (p.y + lift) * box.h * grow;
    const wx = box.x + c * lx + s * lz;
    const wz = box.z - s * lx + c * lz;
    push(wx, box.y + ly, wz,
      Math.max(0.01, p.sx * box.w * grow),
      Math.max(0.01, p.sy * box.h * grow),
      Math.max(0.01, p.sz * box.d * grow),
      p.shape, p.rgb, 0.42, Math.min(0.95, p.glow + glowBoost), yaw);
    drawn++;
  }
  return drawn;
}
