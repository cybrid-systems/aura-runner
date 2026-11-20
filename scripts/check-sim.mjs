// Replay the Aura physics golden with web/sim.js. The two runtimes must
// agree on the jump trace to the millimetre and on the pass/fail cases.
import { readFileSync } from "node:fs";
import { DT, bodyLane, makePlayer, mm, praiseClear, pressJump, pressLane, pressSlide, rulesOf, step } from "../web/sim.mjs";
import { NEAR_POINTS, NICE_POINTS, OVERTAKE_POINTS, challengeFor, challengeMet, nearMiss, overtake, skimmed, trackOvertake } from "../web/score.mjs";
import { COMBO_HEART, HEART_IFRAME, HEARTS_MAX, heartsBlank, heartsHit, heartsRecover, heartsTick } from "../web/hearts.mjs";
import { gateLine, raceGate, raceRead } from "../web/race.mjs";

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
function pressureBand(n) {
  if (typeof n !== "number") return 1;
  if (n < 0.5) return 0;
  if (n < 1.5) return 1;
  if (n < 2.5) return 2;
  if (n < 3.5) return 3;
  return 4;
}
// Twin of popper-for. Pressure 1 is the shipped toss, including the
// opening id at 62 m before the span clamps it.
function popperFor(id, x0, span, pressure) {
  const band = pressure === undefined ? 1 : pressureBand(pressure);
  if (span < (band <= 0 ? 16 : 12)) return null;
  if (id > 0 && ((band <= 2 && id % 5 === 0) || (band <= 0 && id % 4 === 0))) return null;
  const base = id === 0 ? 62 : 10 + ((id + 2) % 9);
  const want = band <= 0 ? base + 8 : band >= 3 ? base * 0.75 : base;
  const along = Math.min(want, span - 3);
  if (along < 6) return null;
  return { x: x0 + along, lane: id === 0 ? 1 : id % 3 };
}
const opened = popperFor(0, 0, 40);
const laneA = popperFor(1, 0, 40);
const laneB = popperFor(2, 0, 40);
const popOpen = opened && opened.lane === 1 && opened.x > 36 && opened.x < 38 ? 1 : 0;
const popSkip = !popperFor(5, 0, 40) && !popperFor(1, 0, 8) ? 1 : 0;
const popLanes = laneA && laneB && laneA.lane !== laneB.lane ? 1 : 0;

const airRules = rulesOf(32, 11.2, 5, 0.48, 0.12, 0.12);
airRules.worth = 25;
airRules.air = 1;
airRules.magnet = 0;
const aground = [[1, 0, 80, 0.45, 0]];
const aj = makePlayer(1);
pressJump(aj);
step(aj, aground, airRules, DT);
const airBank = aj[1] > 0 && aj[15] === 1 ? 1 : 0;
for (let i = 0; i < 12; i++) step(aj, aground, airRules, DT);
const airUp = aj[1] > 0.3 && aj[15] === 1 && aj[7] <= 0 ? 1 : 0;
pressJump(aj);
step(aj, aground, airRules, DT);
const airSecond = aj[1] > 0.3 && aj[15] === 0 && aj[14] > 0 ? 1 : 0;
const thrustAfter = aj[14];
pressJump(aj);
step(aj, aground, airRules, DT);
const airThird = aj[1] > 0.2 && aj[15] === 0 && aj[14] < thrustAfter ? 1 : 0;

function magPack(radius) {
  const p = makePlayer(1);
  const ps = [
    [5, 2.2, 0.42, 0.42, 0.4, 0],
    [3, 2.2, 0.7, 0.55, 0, 0],
    [10, 2.2, 0.72, 0.95, 0, 0, 0, 2.2, 0, 0.2],
    [2, 30, 1.2, 1.2, -1.2],
  ];
  const magRules = rulesOf(32, 11.2, 5, 0.48, 0.12, 0.12);
  magRules.worth = 25;
  magRules.air = 0;
  magRules.magnet = radius;
  step(p, ps, magRules, DT);
  return ps;
}
function kindX(ps, k) {
  const q = ps.find((row) => row[0] === k);
  return q ? q[1] : -1;
}
function kindLane(ps, k) {
  const q = ps.find((row) => row[0] === k);
  return q && q.length > 5 ? q[5] : -1;
}
const magOn = magPack(2.4);
const magOff = magPack(0);
const magPull = kindX(magOn, 5) < 2.2 && kindLane(magOn, 5) === 1 ? 1 : 0;
const magStill = kindX(magOn, 3) === kindX(magOff, 3)
  && kindX(magOn, 10) === kindX(magOff, 10)
  && kindX(magOn, 2) === kindX(magOff, 2)
  && kindX(magOff, 5) === 2.2 ? 1 : 0;
const richPieces = [[1, 0, 20, 0.45, 0], [5, 3, 0.42, 0.42, 0.4, 1, 40]];
const richRunner = makePlayer(1);
for (let i = 0; i < 80; i++) step(richRunner, richPieces, rules, DT);
const richScore = richRunner[6].toFixed(1);
const worthCoin = [[5, 2.2, 0.42, 0.42, 0.4, 0, 40]];
const worthRules = rulesOf(32, 11.2, 5, 0.48, 0.12, 0.12);
worthRules.worth = 25;
worthRules.air = 0;
worthRules.magnet = 2.4;
step(makePlayer(1), worthCoin, worthRules, DT);
const magWorth = worthCoin[0][6] === 40 ? 1 : 0;

const held = magPack(2.4);
const x1 = kindX(held, 5);
const offRules = rulesOf(32, 11.2, 5, 0.48, 0.12, 0.12);
offRules.air = 0;
offRules.magnet = 0;
step(makePlayer(1), held, offRules, DT);
const magStopped = kindX(held, 5) === x1 ? 1 : 0;

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
  `air-bank ${airBank}`,
  `air-up ${airUp}`,
  `air-second ${airSecond}`,
  `air-third ${airThird}`,
  `mag-pull ${magPull}`,
  `mag-still ${magStill}`,
  `mag-off ${magStopped}`,
  `rich ${richScore}`,
  `mag-worth ${magWorth}`,
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

if (NEAR_POINTS >= NICE_POINTS || nearMiss(1, 0).points !== NEAR_POINTS || nearMiss(1, 10).text !== "Close! +15") {
  console.error("near-miss bonus should sit under Nice");
  process.exit(1);
}
if (OVERTAKE_POINTS <= NICE_POINTS || overtake(1, 0).points !== OVERTAKE_POINTS) {
  console.error("overtake bonus should read above Nice");
  process.exit(1);
}
const hurdle = [3, 4, 0.7, 0.55, 0, -1];
if (!skimmed(4.7, 0.7, 1, hurdle) || skimmed(4.7, 0.2, 1, hurdle) || skimmed(8, 0.7, 1, hurdle)) {
  console.error("near-miss window drifted from the spark");
  process.exit(1);
}
const pot = [7, 4, 1.1, 1.2, 0, 1];
if (!skimmed(5.1, 0, 0, pot) || skimmed(5.1, 0, 1, pot)) {
  console.error("a block skim is the next lane");
  process.exit(1);
}
let mark = trackOvertake(null, 2, 6);
mark = trackOvertake(mark, 4, 6);
if (mark.award || !mark.behind) {
  console.error("still behind the rival");
  process.exit(1);
}
mark = trackOvertake(mark, 6.5, 6);
if (!mark.award || !mark.done) {
  console.error("overtake should pay once when pulling ahead");
  process.exit(1);
}
mark = trackOvertake(mark, 8, 6);
if (mark.award) {
  console.error("overtake is once per rival");
  process.exit(1);
}
const ahead = trackOvertake(trackOvertake(null, 8, 6), 9, 6);
if (ahead.award) {
  console.error("starting ahead of a rival is not an overtake");
  process.exit(1);
}
if (challengeFor(1).id !== "clean" || challengeFor(2).text !== "Reach ×3 combo" || challengeFor(3).id !== "overtake") {
  console.error("challenge rotation");
  process.exit(1);
}
if (!challengeMet("clean", { bumps: 0 }) || challengeMet("clean", { bumps: 1 })
  || !challengeMet("combo", { combo: 3 }) || challengeMet("combo", { combo: 2 })
  || !challengeMet("overtake", { overtakes: 1 }) || challengeMet("overtake", { overtakes: 0 })) {
  console.error("challenge completion");
  process.exit(1);
}
const early = popperFor(1, 0, 80, 4);
const plainPop = popperFor(1, 0, 80, 1);
const late = popperFor(1, 0, 80, 0);
if (popperFor(5, 0, 40) || !popperFor(5, 0, 40, 4) || popperFor(4, 0, 40, 0) || popperFor(1, 0, 14, 0) || !popperFor(1, 0, 14, 1)) {
  console.error("adaptive popper gating");
  process.exit(1);
}
if (!early || !plainPop || !late || !(early.x < plainPop.x) || !(late.x > plainPop.x) || early.x < 6 || late.lane < 0 || late.lane > 2) {
  console.error(`popper pressure ${JSON.stringify({ early, plainPop, late })}`);
  process.exit(1);
}
let life = heartsBlank();
if (life.hearts !== HEARTS_MAX || life.over || HEARTS_MAX !== 3 || COMBO_HEART !== 5) {
  console.error("a run starts with 3 hearts");
  process.exit(1);
}
const shielded = heartsHit(life, true);
if (shielded.hearts !== 3 || shielded.heart || !shielded.coins || shielded.comboReset) {
  console.error("a shield absorbs the hit and keeps the heart and the combo");
  process.exit(1);
}
life = heartsHit(life, false);
if (life.hearts !== 2 || !life.heart || !life.coins || !life.comboReset || !life.cleanFail || Math.abs(life.iframe - HEART_IFRAME) > 1e-9 || Math.abs(HEART_IFRAME - 1.2) > 1e-9) {
  console.error("an unshielded bump costs one heart and opens the window");
  process.exit(1);
}
const clustered = heartsHit(life, false);
if (clustered.hearts !== 2 || clustered.heart) {
  console.error("the invulnerability window blocks a second heart");
  process.exit(1);
}
life = heartsHit(heartsTick(life, 1.2), false);
if (life.hearts !== 1) {
  console.error("a hit after the window costs the next heart");
  process.exit(1);
}
const healed = heartsRecover(life, "combo");
if (!healed.recovered || healed.hearts !== 2) {
  console.error("a high combo gives one heart back");
  process.exit(1);
}
const clean = heartsRecover(healed, "clean");
if (!clean.recovered || clean.hearts !== 3) {
  console.error("a clean level gives one heart back");
  process.exit(1);
}
if (heartsRecover(clean, "clean").hearts !== 3) {
  console.error("hearts stop at 3");
  process.exit(1);
}
let gone = heartsBlank();
gone = heartsHit(gone, false);
gone = heartsHit(heartsTick(gone, HEART_IFRAME), false);
gone = heartsHit(heartsTick(gone, HEART_IFRAME), false);
const again = heartsBlank();
if (!gone.over || gone.hearts !== 0 || !gone.coins || again.hearts !== 3 || again.over || again.iframe !== 0) {
  console.error("zero hearts settles, and a fresh run clears it");
  process.exit(1);
}
const lead = raceRead(20, 15);
const trail = raceRead(10, 13);
if (lead.place !== 1 || lead.label !== "+5m" || trail.place !== 2 || trail.label !== "-3m") {
  console.error(`standing ${lead.label} ${trail.label}`);
  process.exit(1);
}
if (raceGate(128, 100, 128) !== "player" || raceGate(128, 140, 128) !== "rival" || raceGate(40, 20, 128) !== "") {
  console.error("gate winner");
  process.exit(1);
}
if (gateLine("Level clear", "player", "keen") !== "Level clear · You led · Rival trains harder") {
  console.error("level banner");
  process.exit(1);
}
console.log(`sim matches aura golden (${got.length} lines)`);
