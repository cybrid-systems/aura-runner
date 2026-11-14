// Left on the keyboard is lane -1 (sim x negative). The camera looks down +Z,
// where world +X is screen-left, so the renderer negates lateral x. After a
// Left press the runner's screen x, under a camera that stays on the centre
// lane, must decrease.
import { DT, bodyLane, makePlayer, pressJump, pressLane, rulesOf, step } from "../web/sim.mjs";
import { DEFAULT_BEND, drawsKeeper, gapSpans, gateBarDepth, glideS, integrateRoad, poseOnRoad, rebaseAnchor, roadPoint, screenX } from "../web/render.mjs";

const rules = rulesOf(32, 11.2, 5, 0.48, 0.12, 0.12);
const centre = makePlayer(10);
const left = makePlayer(10);
pressLane(left, -1);
for (let i = 0; i < 90; i++) {
  step(centre, [], rules, DT);
  step(left, [], rules, DT);
}
if (!(left[9] < centre[9])) throw new Error("Left did not select a lower lane");
if (!(left[10] < centre[10])) throw new Error("Left did not move sim x negative");
const mid = screenX(centre[10], 0, 10, 1280, 720);
const side = screenX(left[10], 0, 10, 1280, 720);
if (!(side < mid - 5)) {
  throw new Error(`Left screen x ${side.toFixed(1)} is not left of centre ${mid.toFixed(1)}`);
}
const right = makePlayer(10);
pressLane(right, 1);
for (let i = 0; i < 90; i++) step(right, [], rules, DT);
const east = screenX(right[10], 0, 10, 1280, 720);
if (!(east > mid + 5)) {
  throw new Error(`Right screen x ${east.toFixed(1)} is not right of centre ${mid.toFixed(1)}`);
}
const straight = roadPoint(10, 1.8, 0);
if (Math.abs(straight.x + 1.8) > 1e-6 || Math.abs(straight.z - 10) > 1e-6) {
  throw new Error(`straight road frame drifted ${straight.x} ${straight.z}`);
}
for (const s of [10, 40, 70]) {
  const midB = screenX(0, 0, s, 1280, 720, DEFAULT_BEND);
  const leftB = screenX(-1.8, 0, s, 1280, 720, DEFAULT_BEND);
  const rightB = screenX(1.8, 0, s, 1280, 720, DEFAULT_BEND);
  if (!(leftB < midB - 5)) {
    throw new Error(`bend ${s}: left screen x ${leftB.toFixed(1)} is not left of ${midB.toFixed(1)}`);
  }
  if (!(rightB > midB + 5)) {
    throw new Error(`bend ${s}: right screen x ${rightB.toFixed(1)} is not right of ${midB.toFixed(1)}`);
  }
}
const accel = makePlayer(10);
pressLane(accel, -1);
const speeds = [];
for (let i = 0; i < 6; i++) {
  step(accel, [], rules, DT);
  speeds.push(Math.abs(accel[13]));
}
if (!(speeds[0] > 0.4 && speeds[2] > speeds[0] + 1)) {
  throw new Error(`lane change did not accelerate ${speeds.map((v) => v.toFixed(2)).join(",")}`);
}
if (!(Math.abs(accel[10] + 1.8) < 0.05 || speeds[5] > speeds[2])) {
  throw new Error("lane change stalled before the lane");
}
const jumper = makePlayer(1);
pressJump(jumper);
const ground = [[1, 0, 80, 0.45, 0]];
const vys = [];
for (let i = 0; i < 4; i++) {
  step(jumper, ground, rules, DT);
  vys.push(jumper[2]);
}
if (!(vys[0] > 2 && vys[0] < 6 && vys[2] > 10 && vys[2] < 12 && vys[3] < vys[2] - 0.2)) {
  throw new Error(`jump did not accelerate ${vys.map((v) => v.toFixed(2)).join(",")}`);
}
const kept = integrateRoad([{ s: 0, bend: 0.38 }], 50);
const changed = integrateRoad([{ s: 0, bend: 0.38 }, { s: 50, bend: 0.62 }], 50);
if (Math.hypot(kept.x - changed.x, kept.z - changed.z) > 1e-6 || Math.abs(kept.psi - changed.psi) > 1e-6) {
  throw new Error("a new bend rebuilt the road already run");
}
const onward = integrateRoad([{ s: 0, bend: 0.38 }, { s: 50, bend: 0.62 }], 90);
if (!(onward.psi > kept.psi + 0.3)) {
  throw new Error(`heading folded back after a bend ${onward.psi.toFixed(3)} from ${kept.psi.toFixed(3)}`);
}
const far = integrateRoad([{ s: 0, bend: 0.38 }], 226);
if (!(far.psi > 1.5)) throw new Error(`heading returned to the start ${far.psi.toFixed(3)}`);
const behind = integrateRoad([{ s: 0, bend: 0.38 }], -12);
if (!(behind.psi < -0.08 && behind.z < 0)) {
  throw new Error(`road behind the anchor left the curve ${behind.psi.toFixed(3)} ${behind.z.toFixed(3)}`);
}
const origin = { s: 0, x: 0, z: 0, psi: 0 };
const keys = [{ s: 0, bend: 0.38 }];
const plain = integrateRoad(keys, 40);
const wrapped = poseOnRoad(origin, keys, 40);
if (Math.hypot(plain.x - wrapped.x, plain.z - wrapped.z) > 1e-6 || Math.abs(plain.psi - wrapped.psi) > 1e-6) {
  throw new Error("poseOnRoad drifted from the road frame");
}
const held = poseOnRoad(origin, keys, 80);
const rescued = rebaseAnchor(origin, keys, 80, 4, 0.38);
const same = poseOnRoad(rescued.anchor, rescued.keys, 4);
if (Math.hypot(same.x - held.x, same.z - held.z) > 1e-4 || Math.abs(same.psi - held.psi) > 1e-4) {
  throw new Error(`a jump in distance rewound the view to ${same.psi.toFixed(3)} from ${held.psi.toFixed(3)}`);
}
const onward2 = poseOnRoad(rescued.anchor, rescued.keys, 24);
if (!(onward2.psi > same.psi + 0.1)) {
  throw new Error(`the view stopped turning after a rescue ${onward2.psi.toFixed(3)}`);
}
const rescuedGap = glideS(40, 42, 5, 1 / 60);
if (rescuedGap.rebase || rescuedGap.s < 40.05 || rescuedGap.s > 40.2) {
  throw new Error(`a gap rescue popped the view to ${rescuedGap.s}`);
}
const walked = glideS(40, 40.08, 5, 1 / 60);
if (walked.rebase || Math.abs(walked.s - 40.08) > 1e-9) {
  throw new Error(`a normal step lagged at ${walked.s}`);
}
const rewound = glideS(80, 4, 5, 1 / 60);
if (!rewound.rebase || rewound.s !== 4) {
  throw new Error("a long correction did not keep the rebase");
}
if (drawsKeeper(null) !== true || drawsKeeper({ plan: "keeper" }) !== true || drawsKeeper({ plan: "kitten" }) !== false) {
  throw new Error("the runner look did not follow the hero plan");
}
const hole = gapSpans([[2, 10, 1, 1.2, -1.2]], 10, 12, 1);
if (hole.length !== 1 || hole[0][0] !== 10 || hole[0][1] !== 11) {
  throw new Error(`a gap between tile centres disappeared ${JSON.stringify(hole)}`);
}
if (gapSpans([[2, 10, 1, 1.2, -1.2]], 12, 14, 1).length !== 0) {
  throw new Error("a gap leaked into the next tile");
}
if (gapSpans([[2, 10, 1, 1.2, -1.2, 0]], 10, 12, 1).length !== 0) {
  throw new Error("another lane's gap painted this lane");
}
if (gapSpans([[2, 10, 1, 1.2, -1.2, -1]], 10, 12, 2).length !== 1) {
  throw new Error("a full-width gap missed a lane");
}
if (Math.abs(gateBarDepth(0.7) - 0.245) > 1e-9) {
  throw new Error(`gate bar drifted from the mesh ${gateBarDepth(0.7)}`);
}
const edge = makePlayer(5);
edge[10] = 0.88;
if (bodyLane(edge) !== 1) throw new Error("the lane edge was already the next lane");
console.log(`lanes ok  left ${side.toFixed(1)}  centre ${mid.toFixed(1)}  right ${east.toFixed(1)}  bend ${DEFAULT_BEND}`);
