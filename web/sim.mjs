// Twin of lib/phys.aura. Fixed step. The hot path mutates the player
// Float64Array. A coin flips its kind to 0 in place, matching the
// server's spent-piece mark.
// Pot, toy and gate footprints match the mesh (web/render.mjs).

import { FLY_HALF, FLY_REACH, POT_HALF, POT_REACH, POT_TOP, gateBarDepth } from "./render.mjs";
import { paceOnGrade, roadGrade, roadHeight } from "./road.mjs";

export { roadGrade, roadHeight };

export const DT = 1 / 60;
// Twin of TAKEOFF-S / LANE-A / LANE-V in lib/phys.aura.
const TAKEOFF_S = 1 / 20;
const LANE_A = 160;
const LANE_V = 16;

const GRACE_S = 1.5;
const DRAG_S = 1.15;
const DRAG_SCALE = 0.45;
const BUMP_COST = 15;

export function makePlayer(x) {
  // Field 15 is air-left. It stays 0 unless rules.air asks for one more jump.
  const p = new Float64Array(16);
  p[0] = x;
  p[4] = 0.12;
  p[5] = 1;
  p[9] = 1;
  return p;
}

export function pressJump(p) {
  p[7] = 0.14;
}

export function pressSlide(p) {
  p[8] = 0.14;
}

export function pressLane(p, dir) {
  const d = dir < 0 ? -1 : 1;
  p[9] = Math.max(0, Math.min(2, p[9] + d));
}

const LANE_W = 1.8;

function pieceLane(q) {
  return q.length > 5 ? q[5] : -1;
}

export function bodyLane(p) {
  const lx = p[10];
  if (lx < -0.9) return 0;
  if (lx > 0.9) return 2;
  return 1;
}

// Half the body that still overlaps a bar, plus one short step, so the
// prize lands after the bar rather than on the way in.
const GATE_PAST = 0.24;

// A slide that has cleared a bar, or a blast left in the next lane or
// jumped, pays once. Grace after a hit does not.
export function praiseClear(p, q) {
  if (p[11] > 0) return false;
  const k = q[0];
  if (k !== 4 && k !== 9) return false;
  const x = p[0];
  const y = p[1];
  const lane = bodyLane(p);
  const x1 = q[1];
  const x2 = x1 + q[2];
  const pl = q.length > 5 ? q[5] : -1;
  if (k === 4) {
    const mid = (x1 + x2) * 0.5;
    const past = mid + gateBarDepth(q[2]) * 0.5 + GATE_PAST;
    return x > past && x < mid + 1.2 && (pl < 0 || pl === lane) && p[3] > 0;
  }
  if (!(q[6] > 0.5)) return false;
  const mid = (x1 + x2) * 0.5;
  const beside = pl >= 0 && Math.abs(pl - lane) === 1;
  const cleared = (pl < 0 || pl === lane) && y > q[4] + q[3] - 0.05;
  return Math.abs(x - mid) < 2.2 && (beside || cleared);
}

function hitsLane(q, lane) {
  const pl = pieceLane(q);
  return pl < -0.5 || pl === lane;
}

function easeLane(p, dt) {
  const target = (p[9] - 1) * LANE_W;
  const lx = p[10];
  const lv = p[13];
  const delta = target - lx;
  const ad = delta < 0 ? -delta : delta;
  let want = delta * 9;
  if (want > LANE_V) want = LANE_V;
  else if (want < -LANE_V) want = -LANE_V;
  const room = LANE_A * dt;
  let dv = want - lv;
  if (dv > room) dv = room;
  else if (dv < -room) dv = -room;
  const nv = lv + dv;
  const nx = lx + nv * dt;
  if (ad < 0.0008 || (delta >= 0 && nx >= target) || (delta < 0 && nx <= target)) {
    p[10] = target;
    p[13] = 0;
  } else {
    p[10] = nx;
    p[13] = nv;
  }
}

export function rulesOf(g, jump, speed, slide, coyote, forgive) {
  return {
    g, jump, speed, slide, coyote, forgive,
    ph: 1.05, pw: 0.56, sh: 0.46, worth: 25, air: 0, magnet: 0,
  };
}

const MAGNET_V = 8;

function rulesAir(rules) {
  return rules.air >= 1 ? 1 : 0;
}

function rulesMagnet(rules) {
  return rules.magnet > 0 ? rules.magnet : 0;
}

// Kind 5 only. Radius 0 leaves every piece where it is.
function pullPickups(pieces, p, dt, radius) {
  if (!(radius > 0)) return;
  const px = p[0];
  const bl = bodyLane(p);
  const r2 = radius * radius;
  const cap = MAGNET_V * dt;
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 5) continue;
    const w = q[2];
    const cx = q[1] + w * 0.5;
    const pl = q.length > 5 ? q[5] : -1;
    const lat = pl < -0.5 ? 0 : (pl - bl) * LANE_W;
    const dx = px - cx;
    if (dx * dx + lat * lat > r2) continue;
    const adx = dx < 0 ? -dx : dx;
    const step = adx > cap ? cap : adx;
    const sign = dx < 0 ? -1 : 1;
    q[1] = q[1] + sign * step;
    if (pl >= 0) q[5] = bl;
  }
}

function pickupWorth(rules) {
  const n = rules.worth;
  return Number.isFinite(n) && n > 0 ? n : 25;
}

// Field 6 is this coin's own worth. Missing or zero keeps the loot base.
function pieceWorth(q, rules) {
  const w = q.length > 6 ? q[6] : 0;
  return Number.isFinite(w) && w > 0 ? w : pickupWorth(rules);
}

function tickTimers(p, dt) {
  p[11] = Math.max(0, p[11] - dt);
  p[12] = Math.max(0, p[12] - dt);
}

function payBump(p) {
  p[11] = GRACE_S;
  p[12] = DRAG_S;
  p[6] = Math.max(0, p[6] - BUMP_COST);
}

function runSpeed(speed, p) {
  return p[12] > 0 ? speed * DRAG_SCALE : speed;
}

function gapFarEdge(x, lane, pieces) {
  let edge = null;
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 2 || !hitsLane(q, lane)) continue;
    const x1 = q[1];
    const x2 = x1 + q[2];
    if (x < x2 + 0.02 && x >= x1 - 0.02) {
      if (edge === null || x2 > edge) edge = x2;
    }
  }
  return edge;
}

function liftOut(p, pieces) {
  for (let n = 0; n < 4; n++) {
    const edge = gapFarEdge(p[0], bodyLane(p), pieces);
    if (edge === null) return;
    p[0] = edge + 0.08;
    p[1] = roadHeight(p[0], pieces);
    p[2] = 0;
    p[14] = 0;
  }
}

function overGap(x, lane, pieces) {
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] === 2 && hitsLane(q, lane) && x >= q[1] && x < q[1] + q[2]) return true;
  }
  return false;
}

function overlap(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
  return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
}

// Kind 8 stores a visual code at [6] and a speed at [7]. It flies toward
// the runner, so x decreases. Missing speed stays put.
const RIVAL_REACH = 0.62;
const RIVAL_HALF = 0.28;
const RIVAL_COMMIT = 7.5;
const RIVAL_COOL = 0.42;

// Kind 10 runs toward the hero. Look, speed, aim lane, and cool sit at
// [6] [7] [8] [9]. Field 10 is the pause after a lane step. Field 11 is
// the distance where it locks. Missing numbers keep the defaults.
function stepRivals(pieces, p, dt) {
  const px = p[0];
  const want = p[9];
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 10) continue;
    const spd = q.length > 7 ? q[7] : 2.2;
    const coolMax = q.length > 10 && q[10] > 0 ? q[10] : RIVAL_COOL;
    const commit = q.length > 11 && q[11] > 0 ? q[11] : RIVAL_COMMIT;
    const lane = q.length > 5 ? q[5] : 1;
    const aim = q.length > 8 ? q[8] : lane;
    let cool = Math.max(0, (q.length > 9 ? q[9] : 0) - dt);
    q[1] -= spd * dt;
    const ahead = q[1] - px;
    q[10] = coolMax;
    q[11] = commit;
    if (ahead < commit) {
      q[9] = cool;
      continue;
    }
    if (cool > 0) {
      q[9] = cool;
      continue;
    }
    const aim1 = want;
    const next = lane === aim1 ? lane : lane < aim1 ? lane + 1 : lane - 1;
    q[5] = next;
    q[8] = aim1;
    q[9] = next === lane ? 0 : coolMax;
  }
}

function nudgeFlyers(pieces, dt) {
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 8) continue;
    const spd = q.length > 7 ? q[7] : 0;
    if (spd) q[1] -= spd * dt;
  }
}

// Kind 9 is a popper. Twin of step-poppers in lib/phys.aura.
// phase, approach speed, vy, fuse sit at [6] [7] [8] [9].
const POP_G = 16;
const POP_BOUNCE = 0.7;
const POP_MIN = 2.4;
const POP_BLAST = 0.45;
const POP_ARM = 14;
const POP_BW = 1.7;
const POP_BH = 1.25;

function stepPoppers(pieces, p, dt) {
  const px = p[0];
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 9) continue;
    const phase = q.length > 6 ? q[6] : 0;
    const fuse = q.length > 9 ? q[9] : 0;
    if (phase > 0.5) {
      const left = fuse - dt;
      if (left <= 0) q[0] = 0;
      else q[9] = left;
      continue;
    }
    const vx = q.length > 7 ? q[7] : 0;
    const vy0 = q.length > 8 ? q[8] : 0;
    const x = q[1] - vx * dt;
    const vy = vy0 - POP_G * dt;
    let y = q[4] + vy * dt;
    let vy1 = vy;
    const floor = roadHeight(x, pieces);
    if (y < floor) {
      y = floor;
      vy1 = Math.max(POP_MIN, -vy * POP_BOUNCE);
    }
    const ahead = x - px;
    const close = ahead <= POP_ARM && x + q[2] > px - 1;
    const fuse1 = close ? fuse - dt : fuse;
    if (fuse1 <= 0) {
      const mid = x + q[2] * 0.5;
      q[1] = mid - POP_BW * 0.5;
      q[2] = POP_BW;
      q[3] = POP_BH;
      q[4] = roadHeight(x, pieces);
      q[6] = 1;
      q[7] = 0;
      q[8] = 0;
      q[9] = POP_BLAST;
    } else {
      q[1] = x;
      q[4] = y;
      q[6] = 0;
      q[7] = vx;
      q[8] = vy1;
      q[9] = fuse1;
    }
  }
}

export function step(p, pieces, rules, dt) {
  if (p[5] <= 0) return "dead";
  nudgeFlyers(pieces, dt);
  stepRivals(pieces, p, dt);
  stepPoppers(pieces, p, dt);
  pullPickups(pieces, p, dt, rulesMagnet(rules));
  const g = rules.g;
  const jump = rules.jump;
  const air = rulesAir(rules);
  const floor0 = roadHeight(p[0], pieces);
  const grade = roadGrade(p[0], pieces);
  const speed = paceOnGrade(runSpeed(rules.speed, p), grade);
  const slideDur = rules.slide;
  const coyoteMax = rules.coyote;
  tickTimers(p, dt);
  if (p[7] > 0) p[7] = Math.max(0, p[7] - dt);
  if (p[8] > 0) p[8] = Math.max(0, p[8] - dt);
  const grounded = p[1] <= floor0 + 0.0001 && !overGap(p[0], bodyLane(p), pieces);
  if (grounded) p[4] = coyoteMax;
  else p[4] = Math.max(0, p[4] - dt);
  // Ground jump uses jump. One air jump while p[15] is 1. A third press
  // before landing does not launch.
  const canGround = grounded || p[4] > 0;
  const buffered = p[7] > 0;
  const bank = air < 1 ? 0 : (grounded ? 1 : p[15]);
  const groundJump = buffered && canGround;
  const airJump = buffered && !groundJump && bank >= 1;
  if (groundJump || airJump) {
    p[2] = 0;
    p[4] = 0;
    p[7] = 0;
    p[3] = 0;
    p[14] = TAKEOFF_S;
    if (p[1] < floor0) p[1] = floor0;
    p[15] = groundJump && air >= 1 ? 1 : 0;
  } else if (air >= 1 && grounded) {
    p[15] = 1;
  }
  if (p[8] > 0 && grounded && !groundJump && !airJump) {
    p[3] = slideDur;
    p[8] = 0;
  }
  if (p[3] > 0) p[3] = Math.max(0, p[3] - dt);
  // Dust after three frames must not buy another full boost.
  if (p[14] > 1e-7) {
    const slice = Math.min(p[14], dt);
    p[2] = p[2] + (jump / TAKEOFF_S) * slice;
    const rest = dt - slice;
    if (rest > 1e-7) p[2] = p[2] - g * rest;
    const left = p[14] - slice;
    p[14] = left >= 1e-7 ? left : 0;
  } else {
    p[14] = 0;
    p[2] = p[2] - g * dt;
  }
  p[1] = p[1] + p[2] * dt;
  p[0] = p[0] + speed * dt;
  // Downhill drops faster than one frame of gravity. Stay on the new
  // floor unless this step is a jump. Grade 0 keeps the floor at 0.
  const floor1 = roadHeight(p[0], pieces);
  if (grounded && p[2] <= 0 && p[14] <= 0 && !overGap(p[0], bodyLane(p), pieces)) {
    p[1] = floor1;
    p[2] = 0;
  }
  let ev = "ok";
  if (p[1] <= floor1 && overGap(p[0], bodyLane(p), pieces)) {
    if (rules.strict) {
      p[5] = 0;
      easeLane(p, dt);
      return "dead";
    }
    const fresh = p[11] <= 0;
    liftOut(p, pieces);
    if (fresh) payBump(p);
    ev = collide(p, pieces, rules);
    if (ev !== "bump" && fresh) ev = "oops";
    // A gap recovery keeps the pace. An obstacle still slows the run.
    if (ev === "oops") p[12] = 0;
  } else {
    if (p[1] <= floor1) {
      p[1] = floor1;
      p[2] = 0;
      p[14] = 0;
    }
    ev = collide(p, pieces, rules);
  }
  easeLane(p, dt);
  return ev;
}

function hitSpan(q) {
  const k = q[0];
  const x = q[1];
  const w = q[2];
  const mid = x + w * 0.5;
  if (k === 4) {
    const half = gateBarDepth(w) * 0.5;
    return [mid - half, mid + half];
  }
  if (k === 8) return [mid - FLY_HALF, mid + FLY_HALF];
  if (k === 10) return [mid - RIVAL_HALF, mid + RIVAL_HALF];
  if (k === 7) {
    const half = Math.min(w * 0.5, POT_HALF);
    return [mid - half, mid + half];
  }
  return [x, x + w];
}

function meetsSide(lx, lane, reach) {
  if (lane < -0.5) return true;
  const d = lx - (lane - 1) * LANE_W;
  return (d < 0 ? -d : d) < reach;
}

function collide(p, pieces, rules) {
  const forgive = rules.forgive;
  const h = p[3] > 0 ? rules.sh : rules.ph;
  const left = p[0] - rules.pw / 2 + forgive;
  const right = p[0] + rules.pw / 2 - forgive;
  const bottom = p[1] + forgive;
  const top = p[1] + h - forgive;
  const lane = bodyLane(p);
  const floor = roadHeight(p[0], pieces);
  let event = "ok";
  for (let i = 0; i < pieces.length; i++) {
    if (p[5] <= 0) return "dead";
    const q = pieces[i];
    const k = q[0];
    const span = hitSpan(q);
    const x1 = span[0];
    const x2 = span[1];
    const deck = k === 0 || k === 1 || k === 2 || k === 9 ? 0 : roadHeight(q[1] + q[2] * 0.5, pieces);
    const y1 = q[4] + deck;
    const y2 = k === 7 ? Math.min(y1 + q[3], POT_TOP) : y1 + q[3];
    const side = k === 7 || k === 8 || k === 10
      ? meetsSide(p[10], pieceLane(q), k === 7 ? POT_REACH : RIVAL_REACH)
      : hitsLane(q, lane);
    const hit = side && overlap(left, bottom, right, top, x1, y1, x2, y2);
    if (hit && (k === 3 || k === 4 || k === 7 || k === 8 || k === 9 || k === 10)) {
      if (rules.strict) {
        p[5] = 0;
        return "dead";
      }
      if (p[11] > 0) continue;
      payBump(p);
      event = "bump";
      continue;
    }
    if (hit && k === 5) {
      const worth = pieceWorth(q, rules);
      q.paid = worth;
      q[0] = 0;
      p[6] += worth;
      event = "coin";
    } else if (hit && k === 6 && p[1] <= floor + 0.05 && p[2] <= 0) {
      p[2] = rules.jump * 1.28;
      p[3] = 0;
      p[14] = 0;
      event = "spring";
    }
  }
  return event;
}

export function scoreNow(p) {
  return p[6] + Math.max(0, p[0] - 1.2);
}

export function mm(x) {
  const v = x * 1000;
  if (v >= 0) return Math.floor(v + 0.5);
  return -Math.floor(-v + 0.5);
}
