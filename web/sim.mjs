// Twin of lib/phys.aura. Fixed step. The hot path mutates the player
// Float64Array. A coin flips its kind to 0 in place, matching the
// server's spent-piece mark.

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
  const p = new Float64Array(15);
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
  return { g, jump, speed, slide, coyote, forgive, ph: 1.05, pw: 0.56, sh: 0.46 };
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
    p[1] = 0;
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
function nudgeFlyers(pieces, dt) {
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 8) continue;
    const spd = q.length > 7 ? q[7] : 0;
    if (spd) q[1] -= spd * dt;
  }
}

export function step(p, pieces, rules, dt) {
  if (p[5] <= 0) return "dead";
  nudgeFlyers(pieces, dt);
  const g = rules.g;
  const jump = rules.jump;
  const speed = runSpeed(rules.speed, p);
  const slideDur = rules.slide;
  const coyoteMax = rules.coyote;
  tickTimers(p, dt);
  if (p[7] > 0) p[7] = Math.max(0, p[7] - dt);
  if (p[8] > 0) p[8] = Math.max(0, p[8] - dt);
  const grounded = p[1] <= 0.0001 && !overGap(p[0], bodyLane(p), pieces);
  if (grounded) p[4] = coyoteMax;
  else p[4] = Math.max(0, p[4] - dt);
  const canJump = grounded || p[4] > 0;
  const jumped = p[7] > 0 && canJump;
  if (jumped) {
    p[2] = 0;
    p[4] = 0;
    p[7] = 0;
    p[3] = 0;
    p[14] = TAKEOFF_S;
    if (p[1] < 0) p[1] = 0;
  }
  if (p[8] > 0 && grounded && !jumped) {
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
  let ev = "ok";
  if (p[1] <= 0 && overGap(p[0], bodyLane(p), pieces)) {
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
  } else {
    if (p[1] <= 0) {
      p[1] = 0;
      p[2] = 0;
      p[14] = 0;
    }
    ev = collide(p, pieces, rules);
  }
  easeLane(p, dt);
  return ev;
}

function collide(p, pieces, rules) {
  const forgive = rules.forgive;
  const h = p[3] > 0 ? rules.sh : rules.ph;
  const left = p[0] - rules.pw / 2 + forgive;
  const right = p[0] + rules.pw / 2 - forgive;
  const bottom = p[1] + forgive;
  const top = p[1] + h - forgive;
  const lane = bodyLane(p);
  let event = "ok";
  for (let i = 0; i < pieces.length; i++) {
    if (p[5] <= 0) return "dead";
    const q = pieces[i];
    const k = q[0];
    const x1 = q[1];
    const y1 = q[4];
    const x2 = x1 + q[2];
    const y2 = y1 + q[3];
    const hit = hitsLane(q, lane) && overlap(left, bottom, right, top, x1, y1, x2, y2);
    if (hit && (k === 3 || k === 4 || k === 7 || k === 8)) {
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
      q[0] = 0;
      p[6] += 25;
      event = "coin";
    } else if (hit && k === 6 && p[1] <= 0.05 && p[2] <= 0) {
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
