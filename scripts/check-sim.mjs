// Replay the Aura physics golden with web/sim.js. The two runtimes must
// agree on the jump trace to the millimetre and on the pass/fail cases.
import { readFileSync } from "node:fs";
import { DT, makePlayer, mm, pressJump, pressSlide, rulesOf, step } from "../web/sim.mjs";

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
  `bump-alive ${sawBump === 1 && hp[5] > 0 && hp[0] > 6 ? 1 : 0}`,
  `bump-score ${hp[6].toFixed(1)}`,
  `bump-grace ${bumpGrace > 1 ? 1 : 0}`,
  `pit-alive ${sawOops === 1 && pp[5] > 0 && pp[0] > 12 && pp[1] <= 0.001 ? 1 : 0}`,
  `pit-grace ${pitGrace > 1 ? 1 : 0}`,
];
// apex/air are analytic and already in the golden; compare the sim lines.
const simGolden = golden.filter((l) => !l.startsWith("apex ") && !l.startsWith("air "));
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
console.log(`sim matches aura golden (${got.length} lines)`);
