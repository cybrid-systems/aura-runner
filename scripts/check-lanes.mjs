// Left on the keyboard is lane -1 (sim x negative). The camera looks down +Z,
// where world +X is screen-left, so the renderer negates lateral x. After a
// Left press the runner's screen x, under a camera that stays on the centre
// lane, must decrease.
import { DT, makePlayer, pressJump, pressLane, rulesOf, step } from "../web/sim.mjs";
import { DEFAULT_BEND, roadPoint, screenX } from "../web/render.mjs";

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
console.log(`lanes ok  left ${side.toFixed(1)}  centre ${mid.toFixed(1)}  right ${east.toFixed(1)}  bend ${DEFAULT_BEND}`);
