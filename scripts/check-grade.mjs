// Grade forms: nested transforms, the contract, and a safe fallback.
import { dressPalette, palette } from "../web/render.mjs";
import {
  CONTRAST_MIN, DELTA_E_MIN, GRADE_CITY, SAT_HI, SAT_LO,
  activeGrade, deltaE, evalGrade, gradeMutate, renderedRatio, setActiveGrade,
} from "../web/grade.mjs";

function fail(msg) {
  throw new Error(msg);
}

const kept = evalGrade(GRADE_CITY);
if (!kept.ok) fail("default rolled back " + kept.why);
if (kept.report.sat < 0.46 || kept.report.sat > 0.52) fail("render sat " + kept.report.sat);
if (kept.report.sat < SAT_LO || kept.report.sat > SAT_HI) fail("sat " + kept.report.sat);
if (kept.report.player < CONTRAST_MIN) fail("player contrast " + kept.report.player);
for (const tier of ["low", "medium", "high"]) {
  const ratio = renderedRatio(kept.colors, tier);
  if (ratio < CONTRAST_MIN) fail(tier + " rendered contrast " + ratio.toFixed(2));
}
if (kept.report.playerE < DELTA_E_MIN || kept.report.obstacleE < DELTA_E_MIN) fail("delta E");
if (kept.report.blue !== 0) fail("blue clip");
if (kept.colors.player.join(",") === kept.colors.track.join(",")) fail("player became the track");

const nested = evalGrade("(grade city (hue-shift 0.02 (saturate 0.7 (base city))))");
if (!nested.colors) fail("nest did not evaluate");
if (nested.colors.track.join(",") === kept.colors.track.join(",")) fail("hue-shift was a no-op");

const lifted = evalGrade("(grade city (lift 0.04 -0.02 0.0 (saturate 0.74 (base city))))");
if (!lifted.colors) fail("lift missing");
if (lifted.colors.track[0] <= kept.colors.track[0]) fail("lift did not raise red");

const curved = evalGrade("(grade city (gamma 1.4 (base city)))");
if (!curved.colors) fail("gamma missing");
if (curved.colors.track[2] <= kept.colors.track[2]) fail("gamma did not lift the track");

const flipped = evalGrade("(grade city (complement (base city)))");
if (!flipped.colors) fail("complement missing");
if (flipped.colors.track[2] > kept.colors.track[2]) fail("complement did not move blue");

const dull = evalGrade("(grade city (saturate 0.2 (base city)))");
if (dull.ok) fail("a grey street was kept");
if (dull.why !== "sat") fail("dull why " + dull.why);

const before = activeGrade();
const bad = setActiveGrade("(grade city (nope (base city)))");
if (bad.ok) fail("illegal form applied");
if (bad.why !== "shape") fail("illegal why " + bad.why);
if (activeGrade() !== before) fail("illegal form replaced the seed");

const same = setActiveGrade("(grade nope (base city))");
if (same.ok || activeGrade() !== before) fail("unknown venue applied");

for (const seed of [1, 2, 3, 4, 8]) {
  const form = gradeMutate(GRADE_CITY, seed);
  const ev = evalGrade(form);
  if (!ev.ok) fail("mutate left the contract " + seed + " " + ev.why);
  if (Math.abs(ev.report.sat - kept.report.sat) > 0.08) fail("mutate jumped the hue family " + ev.report.sat);
}

const city = dressPalette(palette(0, null), "city", "day");
if (city.path.join(",") !== kept.colors.track.join(",")) fail("the view ignored the grade");
const space = dressPalette(palette(0, null), "space", "day");
if (!(space.stars === 1 && space.path[2] > space.path[0])) fail("space plate moved");

console.log(
  `grade ok sat ${kept.report.sat.toFixed(3)} contrast ${kept.report.player.toFixed(2)} dE ${kept.report.playerE.toFixed(1)}`,
);
