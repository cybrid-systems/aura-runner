// Replay the Aura physics golden with web/sim.js. The two runtimes must
// agree on the jump trace to the millimetre and on the pass/fail cases.
import { readFileSync } from "node:fs";
import { DT, bodyLane, makePlayer, mm, praiseClear, pressJump, pressLane, pressSlide, rulesOf, step } from "../web/sim.mjs";

const rules = rulesOf(32, 11.2, 5, 0.48, 0.12, 0.12);
const lines = [];
function show(tag, p) {
  lines.push(`${tag} ${mm(p[0])}.0 ${mm(p[1])}.0 ${mm(p[2])}.0 ${p[5] > 0 ? 1 : 0}`);
}

const open = [[1, 0, 80, 0.45, 0]];
const jumper = makePlayer(1);
pressJump(jumper);
for (let ti = 0; ti < 70; ti++) {
  if (ti === 0 || ti === 10 || ti === 22 || ti === 40 || ti === 55) show(String(ti), jumper);
  step(jumper, open, rules, DT);
}
const alive = jumper[5] > 0 && jumper[1] <= 0.001 ? 1 : 0;

const gap = [[1, 0, 8, 0.45, 0], [2, 8, 1.2, 1.2, -1.2], [1, 9.2, 12, 0.45, 0]];
const gp = makePlayer(1);
let crossed = 0;
for (let i = 0; i < 400 && gp[5] > 0; i++) {
  const dx = 8 - gp[0];
  if (dx >= 0.2 && dx <= 0.7) pressJump(gp);
  step(gp, gap, rules, DT);
  if (gp[5] > 0 && gp[0] > 10.5) crossed = 1;
}

const wide = [[1, 0, 6, 0.45, 0], [2, 6, 6, 1.2, -1.2]];
const wp = makePlayer(1);
for (let i = 0; i < 400 && wp[5] > 0; i++) {
  const dx = 6 - wp[0];
  if (dx >= 0.15 && dx <= 0.8) pressJump(wp);
  step(wp, wide, rules, DT);
}

const gated = [[1, 0, 30, 0.45, 0], [4, 8, 0.7, 0.34, 0.66]];
const sp = makePlayer(1);
const spieces = gated.map((q) => q.slice());
for (let i = 0; i < 300 && sp[5] > 0 && sp[0] <= 10; i++) {
  const dx = 8 - sp[0];
  if (dx >= 0.3 && dx <= 1) pressSlide(sp);
  step(sp, spieces, rules, DT);
}
const stand = makePlayer(1);
const standPieces = gated.map((q) => q.slice());
for (let i = 0; i < 300 && stand[5] > 0; i++) step(stand, standPieces, rules, DT);

const coined = [[1, 0, 20, 0.45, 0], [5, 3, 0.42, 0.42, 0.4]];
const cp = makePlayer(1);
for (let i = 0; i < 80; i++) step(cp, coined, rules, DT);
const starRules = rulesOf(32, 11.2, 5, 0.48, 0.12, 0.12);
starRules.worth = 80;
const spick = makePlayer(1);
const starred = [[1, 0, 20, 0.45, 0], [5, 3, 0.42, 0.42, 0.4]];
for (let i = 0; i < 80; i++) step(spick, starred, starRules, DT);

const hurdled = [[1, 0, 30, 0.45, 0], [5, 2.2, 0.42, 0.42, 0.4], [3, 4.2, 0.7, 0.55, 0]];
const hp = makePlayer(1);
let bumpGrace = 0;
let sawBump = 0;
for (let i = 0; i < 220; i++) {
  const ev = step(hp, hurdled, rules, DT);
  if (ev === "bump") {
    sawBump = 1;
    bumpGrace = hp[11];
  }
}
const potPs = [[7, 4.9, 1.1, 1.65, 0, 1]];
function potEvent(p) {
  return step(p, potPs.map((q) => q.slice()), rules, DT);
}
function edgePlayer() {
  const p = makePlayer(5);
  p[10] = 0.88;
  return p;
}
function clearPlayer() {
  const p = makePlayer(5);
  p[1] = 1.05;
  return p;
}
const flyPs = [[8, 4.8, 0.72, 0.5, 0.7, 1, 0, 0]];
function flyEvent(p) {
  return step(p, flyPs.map((q) => q.slice()), rules, DT);
}
function gateRun(slider) {
  const p = makePlayer(7.6);
  const ps = [[4, 8, 0.7, 0.34, 0.66]];
  if (slider) pressSlide(p);
  let bumped = 0;
  for (let i = 0; i < 90; i++) {
    if (step(p, ps, rules, DT) === "bump") bumped = 1;
  }
  return { bumped, x: p[0] };
}

const pop0 = [[9, 20, 0.64, 0.64, 1.85, 1, 0, 3.6, 2.8, 1.05]];
step(makePlayer(1), pop0, rules, DT);
const popX = mm(pop0[0][1]);
const popY = mm(pop0[0][4]);
const pop1 = [[9, 16, 0.64, 0.64, 1.85, 1, 0, 3.6, 2.8, 0.01]];
step(makePlayer(10), pop1, rules, DT);
const popped = pop1[0];
const popBlast = popped[0] === 9 && popped[6] > 0.5 && popped[3] > 1 ? 1 : 0;
const blast = [[9, 4.5, 1.7, 1.25, 0, 1, 1, 0, 0, 0.3]];
function popEvent(p) {
  return step(p, blast.map((q) => q.slice()), rules, DT);
}
function sidePop() {
  const p = makePlayer(5.2);
  p[9] = 0;
  p[10] = -1.8;
  return p;
}
function jumpPop() {
  const p = makePlayer(5.2);
  p[1] = 1.4;
  return p;
}
function slidePop() {
  const p = makePlayer(5.2);
  pressSlide(p);
  return p;
}
function popperFor(id, x0, span) {
  if (span < 12) return null;
  if (id > 0 && id % 5 === 0) return null;
  const want = id === 0 ? 18 : 10 + ((id + 2) % 9);
  const along = Math.min(want, span - 3);
  if (along < 6) return null;
  return { x: x0 + along, lane: id === 0 ? 1 : id % 3 };
}
const opened = popperFor(0, 0, 40);
const laneA = popperFor(1, 0, 40);
const laneB = popperFor(2, 0, 40);
const popOpen = opened && opened.lane === 1 && opened.x > 17 && opened.x < 19 ? 1 : 0;
const popSkip = !popperFor(5, 0, 40) && !popperFor(1, 0, 8) ? 1 : 0;
const popLanes = laneA && laneB && laneA.lane !== laneB.lane ? 1 : 0;

const pit = [[1, 0, 4, 0.45, 0], [2, 4, 5, 1.2, -1.2], [1, 9, 20, 0.45, 0]];
const pp = makePlayer(1);
let pitGrace = 0;
let sawOops = 0;
for (let i = 0; i < 220; i++) {
  const ev = step(pp, pit, rules, DT);
  if (ev === "oops") {
    sawOops = 1;
    pitGrace = pp[11];
  }
}

const golden = readFileSync(new URL("../tests/phys_test.golden", import.meta.url), "utf8").trim().split("\n");
const got = [
  ...lines,
  `alive ${alive}`,
  `gap-clear ${crossed} ${gp[5] > 0 ? 1 : 0}`,
  `wide-alive ${wp[5] > 0 ? 1 : 0}`,
  `slide-alive ${sp[5] > 0 && sp[0] > 9.2 ? 1 : 0}`,
  `stand-alive ${stand[5] > 0 ? 1 : 0}`,
  `coins ${cp[6].toFixed(1)}`,
  `star ${spick[6].toFixed(1)}`,
  `bump-alive ${sawBump === 1 && hp[5] > 0 && hp[0] > 6 ? 1 : 0}`,
  `bump-score ${hp[6].toFixed(1)}`,
  `bump-grace ${bumpGrace > 1 ? 1 : 0}`,
  `pit-alive ${sawOops === 1 && pp[5] > 0 && pp[0] > 12 && pp[1] <= 0.001 ? 1 : 0}`,
  `pit-grace ${pitGrace > 1 ? 1 : 0}`,
  `pot-centre ${potEvent(makePlayer(5)) === "bump" ? 1 : 0}`,
  `pot-edge ${potEvent(edgePlayer()) === "ok" ? 1 : 0}`,
  `pot-clear ${potEvent(clearPlayer()) === "ok" ? 1 : 0}`,
  `fly-centre ${flyEvent(makePlayer(5)) === "bump" ? 1 : 0}`,
  `fly-edge ${flyEvent(edgePlayer()) === "ok" ? 1 : 0}`,
  `gate-stand ${gateRun(false).bumped}`,
  `gate-slide ${gateRun(true).bumped === 0 && gateRun(true).x > 9 ? 1 : 0}`,
  `pop-step ${popX}.0 ${popY}.0`,
  `pop-blast ${popBlast}`,
  `pop-hit ${popEvent(makePlayer(5.2)) === "bump" ? 1 : 0}`,
  `pop-side ${popEvent(sidePop()) === "ok" ? 1 : 0}`,
  `pop-jump ${popEvent(jumpPop()) === "ok" ? 1 : 0}`,
  `pop-slide ${popEvent(slidePop()) === "bump" ? 1 : 0}`,
  `pop-open ${popOpen}`,
  `pop-skip ${popSkip}`,
  `pop-lanes ${popLanes}`,
];
// apex/air are analytic and already in the golden; compare the sim lines.
const simGolden = golden.filter((l) => !l.startsWith("apex ") && !l.startsWith("air "));
if (simGolden.length !== got.length) {
  console.error(`line count aura ${simGolden.length} js ${got.length}`);
  process.exit(1);
}
let bad = 0;
for (let i = 0; i < simGolden.length; i++) {
  if (simGolden[i] !== got[i]) {
    console.error(`mismatch line ${i}\n  aura ${simGolden[i]}\n  js   ${got[i]}`);
    bad++;
  }
}
if (bad) {
  console.error(`${bad} mismatches`);
  process.exit(1);
}
const fly = [[8, 10, 0.72, 0.5, 0.7, 1, 0, 2.6]];
step(makePlayer(1), fly, rules, DT);
const fx = fly[0][1];
if (!(fx < 9.97 && fx > 9.94)) {
  console.error(`flyer did not close ${fx}`);
  process.exit(1);
}

const feel = rulesOf(32, 11.2, 8, 0.48, 0.12, 0.12);
function dodgeRun(side) {
  const p = makePlayer(1.2);
  const pieces = [
    [4, 10.2, 0.85, 0.34, 0.84, -1, 1],
    [9, 18, 0.64, 0.64, 1.85, 1, 0, 3.6, 2.8, 1.05],
  ];
  if (side) pressLane(p, 1);
  let bumps = 0;
  const seen = new Set();
  let prizes = 0;
  for (let i = 0; i < 500; i++) {
    if (p[0] > 7.2 && p[0] < 7.6) pressSlide(p);
    if (p[0] > 9.6 && p[0] < 10.0) pressSlide(p);
    const ev = step(p, pieces, feel, DT);
    if (ev === "bump" || ev === "oops") bumps++;
    if (ev === "bump" || ev === "oops") continue;
    for (const q of pieces) {
      if (!praiseClear(p, q)) continue;
      const key = q[0] + ":" + (q[5] ?? -1);
      if (seen.has(key)) continue;
      seen.add(key);
      prizes++;
    }
  }
  return { bumps, prizes, lane: bodyLane(p) };
}
const sideRun = dodgeRun(true);
const stayRun = dodgeRun(false);
const blastQ = [9, 4.5, 1.7, 1.25, 0, 1, 1, 0, 0, 0.3];
const beside = makePlayer(5.2);
beside[9] = 0;
beside[10] = -1.8;
const under = makePlayer(5.2);
under[1] = 1.4;
const gatePiece = [4, 10.2, 0.85, 0.34, 0.84, -1, 1];
const through = makePlayer(10.625);
through[3] = 0.3;
const past = makePlayer(11.3);
past[3] = 0.3;
const dropped = makePlayer(11.3);
if (sideRun.prizes !== 2 || sideRun.bumps !== 0 || sideRun.lane !== 2) {
  console.error(`side dodge ${JSON.stringify(sideRun)}`);
  process.exit(1);
}
if (stayRun.prizes !== 1 || stayRun.bumps < 1) {
  console.error(`centre still pays the bar then the burst hits ${JSON.stringify(stayRun)}`);
  process.exit(1);
}
if (!praiseClear(beside, blastQ) || !praiseClear(under, blastQ) || praiseClear(makePlayer(5.2), blastQ)) {
  console.error("blast prize missed a clear or paid a hit");
  process.exit(1);
}
if (praiseClear(through, gatePiece) || !praiseClear(past, gatePiece) || praiseClear(dropped, gatePiece)) {
  console.error("gate prize must wait until the bar is behind a slide");
  process.exit(1);
}
console.log(`sim matches aura golden (${got.length} lines)`);
