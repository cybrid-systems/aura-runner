// Left on the keyboard is lane -1 (sim x negative). The camera looks down +Z,
// where world +X is screen-left, so the renderer negates lateral x. After a
// Left press the runner's screen x, under a camera that stays on the centre
// lane, must decrease.
import { DT, makePlayer, pressLane, rulesOf, step } from "../web/sim.mjs";
import { screenX } from "../web/render.mjs";

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
console.log(`lanes ok  left ${side.toFixed(1)}  centre ${mid.toFixed(1)}  right ${east.toFixed(1)}`);
