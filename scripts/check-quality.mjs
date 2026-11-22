// Quality tiers, hysteresis, fallbacks, and a fixed sim step.
// The picture policy must not change how fast the runner moves.
import { readFileSync } from "node:fs";
import { DT, makePlayer, rulesOf, step } from "../web/sim.mjs";
import { highFragment, highSky, litAnchorsOk, litFragment, litSky, LIGHT_LINE } from "../web/lit.mjs";
import { invertMat, meshSources } from "../web/render.mjs";
import { BLUR_TAP_PX, blurAmount, blurTapPx, fovKick, glossFor, groundId, heroShape, laneEase, sceneGrade, shakeOffset, sunScreen, whooshNudge } from "../web/feel.mjs";
import {
  DEFAULT_POLICY,
  POLICY_TEXT,
  bindContextLoss,
  clampTier,
  contextPlan,
  createQuality,
  frameBudget,
  frameWork,
  gapLimit,
  noteFbo,
  resolutionScale,
  noteReduced,
  noteRefresh,
  noteVisibility,
  observe,
  parsePolicy,
  probeCaps,
  readQualityMode,
  setMode,
  softwareFromRenderer,
  tierProfile,
  tierRank,
  writeQualityMode,
} from "../web/quality.mjs";

function fail(msg) {
  throw new Error(msg);
}

function assert(cond, msg) {
  if (!cond) fail(msg);
}

const aura = readFileSync(new URL("../lib/quality.aura", import.meta.url), "utf8");
const form = aura.slice(aura.indexOf("(quality"));
assert(form.trim() === POLICY_TEXT.trim(), "lib/quality.aura drifted from POLICY_TEXT");
const parsed = parsePolicy(aura);
assert(parsed.targetHz === 60, "target hz");
assert(parsed.start === "low", "auto must start low");
assert(parsed.softwareCap === "low", "software cap");
assert(parsed.promoteP95 < parsed.demoteP95, "hysteresis band");
assert(parsed.promoteWindows > parsed.demoteWindows, "promote is slower than demote");
assert(parsed.promoteCooldownMs > parsed.cooldownMs, "promote cooldown is longer");
assert(parsed.demoteWindows === 1, "demote on one bad window");
assert(DEFAULT_POLICY.window === parsed.window, "policy twin");
assert(!("simScale" in DEFAULT_POLICY), "policy has no sim scale");

assert(softwareFromRenderer("") === false, "blank renderer is not software");
assert(softwareFromRenderer("ANGLE (NVIDIA, GeForce)") === false, "a named gpu is not software");
assert(softwareFromRenderer("Google SwiftShader") === true, "swiftshader");
assert(softwareFromRenderer("llvmpipe") === true, "llvmpipe");
assert(softwareFromRenderer("ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)") === true, "warp basic render");
assert(softwareFromRenderer("WARP") === true, "warp");
assert(DEFAULT_POLICY.gapSlack >= 1.5, "a miss is a dropped refresh");
assert(DEFAULT_POLICY.repromoteMs >= 60000, "a dropped tier stays down");
assert(DEFAULT_POLICY.dprMedium >= 2 && DEFAULT_POLICY.dprHigh >= DEFAULT_POLICY.dprMedium, "policy dpr is monotonic");
assert(10.3 < gapLimit(DEFAULT_POLICY, 120), "120 Hz jitter is inside the budget");
assert(16.7 >= gapLimit(DEFAULT_POLICY, 120), "a missed 120 Hz vsync is outside the budget");

const gpuCaps = probeCaps({ webgl2: true, maxTex: 8192, software: false, softwareKnown: false, floatFb: true, fboOk: true, gpu: "" });
assert(gpuCaps.ceiling === "high" && gpuCaps.software === false, "unknown gpu can reach high");
const soft = probeCaps({ webgl2: true, maxTex: 8192, software: true, softwareKnown: true, floatFb: true });
assert(soft.software === true && soft.ceiling === "high", "manual high stays available on software");
const tiny = probeCaps({ webgl2: true, maxTex: 512, floatFb: true });
assert(tiny.ceiling === "low", "tiny textures stay low");
const midTex = probeCaps({ webgl2: true, maxTex: 1024, floatFb: false });
assert(midTex.ceiling === "medium" && midTex.floatFb === false, "1024 without float is medium");
const noFbo = probeCaps({ webgl2: true, maxTex: 8192, floatFb: true, fboOk: false });
assert(noFbo.ceiling === "low", "fbo failure locks low");
const noGl = probeCaps({ webgl2: false });
assert(noGl.ceiling === "low" && noGl.webgl2 === false, "no webgl2");

const lowProfile = tierProfile("low", DEFAULT_POLICY, gpuCaps);
assert(lowProfile.shadow === false && lowProfile.bloom === false && lowProfile.chain === "none", "low has no extra passes");
const med = tierProfile("medium", DEFAULT_POLICY, { ...gpuCaps, floatFb: false });
assert(med.shadow && med.bloom && med.hdr === false && med.chain === "quarter" && med.shadowSize === 1024 && med.pcf === 4, "medium profile");
const high = tierProfile("high", DEFAULT_POLICY, gpuCaps);
assert(high.chain === "half" && high.shadowSize === 2048 && high.pcf === 9 && high.hdr === true, "high profile");
assert(tierProfile("high", DEFAULT_POLICY, noFbo).tier === "low", "profile follows fbo failure");
assert(lowProfile.fxaa === false && lowProfile.ssao === 0 && lowProfile.blur === 0 && lowProfile.shaft === 0, "low skips the new passes");
assert(lowProfile.reflect === 0 && lowProfile.mote === 0 && lowProfile.streak === 0 && lowProfile.whoosh === 0 && lowProfile.aerial === 0 && lowProfile.penumbra === 0, "low has no high-only budgets");
assert(lowProfile.trail === 0 && lowProfile.dust === 12 && lowProfile.spark === 36 && lowProfile.fovKick === 0, "low keeps the old particle budget");
assert(lowProfile.grade === 0 && lowProfile.sky === 0 && lowProfile.keep === 0 && lowProfile.back === 0, "low has no grade or evolution cue");
assert(med.fxaa === true && med.blur === 0 && med.shaft === 0 && med.ssao === 0 && med.hdr === false, "medium is grade and fxaa, not the heavy passes");
assert(med.reflect === 0 && med.mote === 0 && med.streak === 0 && med.whoosh === 0 && med.aerial === 0 && med.penumbra === 0, "medium does not take the high passes");
assert(med.fovKick === 0.045 && med.dust === 18 && med.spark === 42 && med.trail === 4 && med.grade === 0.4, "medium budgets");
assert(high.fxaa === true && high.blur === 0.88 && high.shaft === 0.22 && high.ssao === 0.8, "high atmosphere budgets");
assert(high.reflect === 0.62 && high.mote === 36 && high.streak === 8 && high.whoosh === 0.2 && high.aerial === 0.62 && high.penumbra === 8, "high presentation budgets");
assert(high.dust === 28 && high.spark === 56 && high.trail === 7 && high.sky === 1 && high.exposure === 1.02, "high counts");
assert(high.keep === 0.62 && high.back === 0.34, "evolution cue budgets");
assert(fovKick(8, 0.07) === 0 && Math.abs(fovKick(16, 0.07) - 0.07) < 1e-9, "fov kick waits for speed");
assert(Math.abs(fovKick(12, 0.07) - 0.035) < 1e-9, "fov kick is half at 12 m/s");
const eased = laneEase(0, 0, 1.8, 1 / 60, "high");
assert(eased.lat > 0 && eased.lat < 0.5, "a lane ease does not snap, " + eased.lat);
let lat = 0;
let vel = 0;
for (let i = 0; i < 48; i++) {
  const step = laneEase(lat, vel, 1.8, 1 / 60, "medium");
  lat = step.lat;
  vel = step.vel;
}
assert(Math.abs(lat - 1.8) < 0.08, "lane ease arrives, " + lat);
assert(shakeOffset(0, 1).every((v) => v === 0), "no shake without an amplitude");
const kick = shakeOffset(0.04, 0.2);
assert(kick.some((v) => Math.abs(v) > 0) && kick.every((v) => Math.abs(v) <= 0.04), "shake stays inside its budget");
assert(blurTapPx(0.45, 0.88, 2560) === BLUR_TAP_PX, "a fast edge stays inside the tap cap");
assert(blurTapPx(0.45, 0.88, 1280) <= BLUR_TAP_PX, "1280-wide taps cannot reprint an edge");
const blur12px = blurTapPx(0.25, blurAmount(12, 0.88), 1280);
assert(blur12px > 0 && blur12px <= BLUR_TAP_PX, "12 m/s still steps, inside the cap, " + blur12px);
assert(blurAmount(8, 0.88) === 0 && blurAmount(9, 0.88) === 0, "blur stays quiet through 9 m/s");
const blur12 = blurAmount(12, 0.88);
assert(blur12 > 0.2 && blur12 < 0.28, "12 m/s is already a readable streak, " + blur12);
assert(Math.abs(blurAmount(18, 0.88) - 0.88) < 1e-9, "blur is full at 18 m/s");
assert(whooshNudge(0, 0) === 0 && whooshNudge(0.2, 1) === 0, "whoosh is quiet at rest");
assert(Math.abs(whooshNudge(0.2, 0) - 0.2) < 1e-9 && whooshNudge(0.2, 0.5) < 0.06, "whoosh eases out");
const shapeLow = heroShape(false, 0.5, 1, "medium");
assert(Math.abs(shapeLow.squash - (1 - 0.5 * 0.16)) < 1e-9 && Math.abs(shapeLow.widen - (1 + 0.5 * 0.12)) < 1e-9 && Math.abs(shapeLow.lean - -0.35) < 1e-9, "medium hero shape is unchanged");
const shapeAir = heroShape(true, 0, 0, "low");
assert(shapeAir.squash === 1.14 && shapeAir.widen === 0.9, "low jump stretch is unchanged");
const shapeHigh = heroShape(true, 0, 1, "high");
assert(shapeHigh.squash === 1.28 && shapeHigh.widen === 0.82 && Math.abs(shapeHigh.lean - -0.62) < 1e-9, "high leans and stretches");
assert(glossFor({ biome: "garden" }) === 0 && glossFor({ biome: "space" }) === 0, "garden and space stay matte");
assert(glossFor({ biome: "city" }) === 0.85 && glossFor({ biome: "aurora-ice", surface: "ice" }) === 1, "city and ice take the sheen");
const sunAt = sunScreen(0, 0.95, 16 / 9, [0.74, 0.78]);
assert(sunAt[0] >= 0 && sunAt[0] <= 1 && sunAt[1] >= 0 && sunAt[1] <= 1, "sun stays on screen");
const gardenGrade = sceneGrade({ biome: "garden", sky: [0.55, 0.72, 0.95], fog: [0.9, 0.85, 0.75] });
const spaceGrade = sceneGrade({ biome: "space", sky: [0.1, 0.1, 0.22], fog: [0.08, 0.07, 0.16] });
const iceGrade = sceneGrade({ biome: "aurora-ice", sky: [0.16, 0.28, 0.48], fog: [0.7, 0.86, 0.92], surface: "ice", particles: "snow" });
const evolved = sceneGrade({ biome: "candy", sky: [0.95, 0.4, 0.7], fog: [1, 0.6, 0.8] });
assert(gardenGrade.family === "garden" && spaceGrade.family === "space" && iceGrade.family === "ice", "grade families");
const ratio = (g) => g.gain[2] / g.gain[0];
assert(ratio(spaceGrade) > ratio(gardenGrade), "space keeps a cooler blue gain");
assert(iceGrade.sat < gardenGrade.sat, "ice is less saturated");
assert(evolved.family === "garden" && Math.abs(evolved.gain[0] - gardenGrade.gain[0]) > 0.02, "an evolved sky tints the grade");
const renderText = readFileSync(new URL("../web/render.mjs", import.meta.url), "utf8");
const skySrc = renderText.slice(renderText.indexOf("const SKY_FS"), renderText.indexOf("const MESH_VS"));
assert(skySrc.includes("SKY_FS") && !skySrc.includes("uSkyAnim"), "the low sky source has no animated-sky uniform");

function feed(state, n, workMs, gapMs, t0) {
  let snap = null;
  for (let i = 0; i < n; i++) {
    snap = observe(state, { workMs, gapMs, now: t0 + i * gapMs });
  }
  return snap;
}

const fast = createQuality(DEFAULT_POLICY, gpuCaps, 0);
assert(fast.mode === "auto" && fast.tier === "low", "auto starts low");
let clock = 0;
let snap = feed(fast, 36 * 3, 4, 16.7, clock);
clock += 36 * 3 * 16.7;
assert(snap.tier === "low", "three fast windows are not enough to promote");
snap = feed(fast, 36, 4, 16.7, clock);
clock += 36 * 16.7;
assert(snap.tier === "medium", "fourth quiet window promotes to medium");
const promotedAt = clock;
snap = feed(fast, 36, 20, 16.7, clock);
assert(snap.tier === "medium", "cooldown blocks an immediate demote");
clock = promotedAt + DEFAULT_POLICY.promoteCooldownMs + 10;
snap = feed(fast, 36, 20, 16.7, clock);
assert(snap.tier === "low", "one bad window after cooldown demotes");
const demotedAt = clock + 36 * 16.7;
snap = feed(fast, 36 * 4, 4, 16.7, demotedAt);
assert(snap.tier === "low", "demote cooldown blocks an immediate re-promote");

const bounce = createQuality(DEFAULT_POLICY, gpuCaps, 0);
clock = 0;
for (let round = 0; round < 8; round++) {
  const work = round % 2 === 0 ? 4 : 18;
  snap = feed(bounce, 36, work, 16.7, clock);
  clock += 36 * 16.7 + 20;
}
assert(bounce.tier === "low", "alternating windows do not climb");

const hidden = createQuality(DEFAULT_POLICY, gpuCaps, 0);
noteVisibility(hidden, false, 0);
snap = feed(hidden, 80, 40, 80, 1000);
assert(hidden.tier === "low" && hidden.samples.length === 0, "a hidden tab does not demote or sample");
noteVisibility(hidden, true, 5000);
assert(hidden.cooldownUntil >= 5000 + DEFAULT_POLICY.cooldownMs, "showing the tab starts a cooldown");

const reduced = createQuality(DEFAULT_POLICY, gpuCaps, 0);
noteReduced(reduced, true, 0);
snap = feed(reduced, 36 * 6, 3, 16.7, 20000);
assert(reduced.tier === "low", "reduced motion keeps auto on low");
setMode(reduced, "high", 30000);
assert(reduced.mode === "high" && reduced.tier === "high", "a manual high still applies under reduced motion");

const softState = createQuality(DEFAULT_POLICY, soft, 0);
assert(softState.tier === "low", "known software starts low");
snap = feed(softState, 36 * 6, 2, 16.7, 0);
assert(softState.tier === "low", "known software does not auto-promote");
setMode(softState, "high", 10);
assert(softState.tier === "high", "manual high is allowed on software");

const broken = createQuality(DEFAULT_POLICY, gpuCaps, 0);
setMode(broken, "high", 0);
assert(noteFbo(broken, false, 50) === "low", "fbo failure drops the tier");
assert(broken.caps.ceiling === "low", "fbo failure lowers the ceiling");
setMode(broken, "high", 80);
assert(broken.mode === "high" && broken.tier === "low", "the choice is kept, the picture stays single-pass");

const manual = createQuality(DEFAULT_POLICY, gpuCaps, 0);
setMode(manual, "medium", 0);
snap = feed(manual, 36 * 4, 30, 40, 0);
assert(manual.tier === "medium", "manual medium ignores frame time");

const hz = createQuality(DEFAULT_POLICY, gpuCaps, 0);
for (let i = 0; i < 8; i++) noteRefresh(hz, 1000 / 120);
assert(hz.refreshHz === 120, "eight steady gaps lock 120 Hz");
assert(Math.abs(frameBudget(DEFAULT_POLICY, 120) - 1000 / 120) < 1e-6, "high refresh tightens the work budget");
assert(gapLimit(DEFAULT_POLICY, 120) > 1000 / 120, "gap slack sits above the refresh");
assert(frameBudget(DEFAULT_POLICY, 30) === 1000 / 60, "a 30 Hz panel still targets 60");
setMode(hz, "auto", 0);
hz.tier = "medium";
hz.cooldownUntil = 0;
hz.samples = [];
hz.pending = 0;
snap = feed(hz, 36, 9, 8.33, 100000);
assert(snap.tier === "low", "9 ms of work misses a 120 Hz budget");
assert(frameWork(0, 1000 / 120) === 0, "a 0 ms reading is zero work");
assert(frameWork(-1, 16) == null && frameWork(NaN, 16) == null, "invalid work is dropped");
const quantised = createQuality(DEFAULT_POLICY, gpuCaps, 0);
setMode(quantised, "auto", 0);
quantised.tier = "high";
quantised.cooldownUntil = 0;
quantised.samples = [];
quantised.pending = 0;
quantised.blockedUntil = { medium: 0, high: 0 };
let qNow = 600000;
let qDemotes = 0;
for (let i = 0; i < 13200; i++) {
  const before = quantised.tier;
  qNow += 8.3;
  const work = i % 131 === 0 ? 0 : 1.2;
  observe(quantised, { workMs: work, gapMs: 8.3, now: qNow, refreshHz: 120 });
  if (tierRank(quantised.tier) < tierRank(before)) qDemotes++;
}
assert(qDemotes === 0 && quantised.tier === "high", "timer zeros never demote, " + quantised.tier + " " + qDemotes);
const onlyZero = createQuality(DEFAULT_POLICY, gpuCaps, 0);
setMode(onlyZero, "auto", 0);
onlyZero.tier = "high";
onlyZero.cooldownUntil = 0;
onlyZero.samples = [];
onlyZero.pending = 0;
feed(onlyZero, 36 * 4, 0, 8.3, 800000);
assert(onlyZero.tier === "high", "a window of 0 ms work is not a miss");
const held = createQuality(DEFAULT_POLICY, gpuCaps, 0);
for (let i = 0; i < 8; i++) noteRefresh(held, 1000 / 120);
held.cooldownUntil = 0;
snap = feed(held, 36 * 4, 3, 8.33, 200000);
assert(held.tier === "medium", "3 ms of work can promote at 120 Hz");

function jitterGap(i) {
  const pattern = [6.5, 7.1, 8.3, 9.4, 10.3, 8.0, 8.6, 7.8, 10.1, 6.8];
  return pattern[i % pattern.length];
}
const panel = createQuality(DEFAULT_POLICY, gpuCaps, 0);
let clock120 = 0;
let demotes = 0;
let highAt = -1;
let framei = 0;
while (clock120 < 80000) {
  const gap = jitterGap(framei++);
  const before = panel.tier;
  clock120 += gap;
  observe(panel, { workMs: 1.5, gapMs: gap, now: clock120, refreshHz: 120 });
  if (tierRank(panel.tier) < tierRank(before)) demotes++;
  if (panel.tier === "high" && highAt < 0) highAt = clock120;
}
assert(demotes === 0, "120 Hz jitter must not demote, demotes " + demotes);
assert(panel.tier === "high", "auto settles on high, got " + panel.tier);
assert(highAt > 0 && highAt < 20000, "high arrived early, at " + highAt);
assert(clock120 - highAt >= 60000, "high held for 60s");

const steady = createQuality(DEFAULT_POLICY, gpuCaps, 0);
setMode(steady, "auto", 0);
steady.tier = "high";
steady.cooldownUntil = 0;
steady.samples = [];
steady.pending = 0;
for (let i = 0; i < 36 * 6; i++) {
  observe(steady, { workMs: 1.5, gapMs: jitterGap(i), now: 300000 + i * 8.3, refreshHz: 120 });
}
assert(steady.tier === "high", "a high tier rides through jitter");

const dropped = createQuality(DEFAULT_POLICY, gpuCaps, 0);
setMode(dropped, "auto", 0);
dropped.tier = "high";
dropped.cooldownUntil = 0;
dropped.samples = [];
dropped.pending = 0;
dropped.blockedUntil = { medium: 0, high: 0 };
let dropAt = 400000;
for (let i = 0; i < 36; i++) {
  dropAt += i % 3 === 0 ? 16.7 : 8.3;
  observe(dropped, { workMs: 1.5, gapMs: i % 3 === 0 ? 16.7 : 8.3, now: dropAt, refreshHz: 120 });
}
assert(dropped.tier === "medium", "a real drop pattern demotes, got " + dropped.tier);
assert(dropped.blockedUntil.high >= dropAt + 50000, "high stays blocked after the drop");
const heldFrom = dropAt;
for (let i = 0; i < 5500; i++) {
  dropAt += 8.3;
  observe(dropped, { workMs: 1.5, gapMs: 8.3, now: dropAt, refreshHz: 120 });
}
assert(dropped.tier === "medium", "no immediate return to the tier that failed");
assert(dropAt - heldFrom > 40000, "the backoff was actually simulated");
dropAt = dropped.blockedUntil.high + 100;
dropped.cooldownUntil = 0;
for (let i = 0; i < 36 * 4; i++) {
  dropAt += 8.3;
  observe(dropped, { workMs: 1.5, gapMs: 8.3, now: dropAt, refreshHz: 120 });
}
assert(dropped.tier === "high", "the blocked tier can return after the backoff");

function scales(device, base) {
  return ["low", "medium", "high"].map((tier) => resolutionScale(tier, device, base, DEFAULT_POLICY));
}
for (const row of [scales(1, 2), scales(2, 2), scales(3, 2), scales(2, 1)]) {
  assert(row[0] <= row[1] && row[1] <= row[2], "dpr monotonic " + row.join(","));
}
const retina = scales(2, 2);
assert(retina[0] === 2 && retina[1] === 2 && retina[2] === 2, "medium keeps the retina buffer " + retina.join(","));
assert(scales(2, 1).every((v) => v === 1), "software stays at 1x on every tier");
const renderSrc = readFileSync(new URL("../web/render.mjs", import.meta.url), "utf8");
assert(renderSrc.includes("softwareFromRenderer(gpuName)"), "render uses the shared detector");
assert(!renderSrc.includes("llvmpipe|softpipe"), "render has no private software list");
assert(renderSrc.includes("dprCalm") && renderSrc.includes("dprDrops >= 2"), "a slow pixel ratio can return once, then stay down");
assert(!renderSrc.includes("leaves it there"), "the pixel ratio is not pinned for the whole session");

const mem = {
  bag: new Map(),
  getItem(k) { return this.bag.has(k) ? this.bag.get(k) : null; },
  setItem(k, v) { this.bag.set(k, String(v)); },
};
assert(readQualityMode(mem) === "auto", "empty storage is auto");
assert(writeQualityMode(mem, "high") === true, "write");
assert(readQualityMode(mem) === "high", "persist high");
assert(writeQualityMode(mem, "nope") === false, "reject unknown");
assert(readQualityMode(mem) === "high", "unknown does not clobber");
assert(readQualityMode({ getItem() { throw new Error("denied"); } }) === "auto", "storage failure is auto");

assert(contextPlan("lost").preventDefault === true && contextPlan("lost").rebuild === false, "lost plan");
assert(contextPlan("restored").rebuild === true, "restored plan");
assert(contextPlan("restore-failed").message.includes("Reload"), "failed plan is readable");

const events = {};
let rebuilt = 0;
let failed = 0;
const fake = {
  addEventListener(name, fn) { events[name] = fn; },
};
bindContextLoss(fake, {
  rebuild() { rebuilt++; },
  onRestored() {},
  onFailed() { failed++; },
});
let prevented = 0;
events.webglcontextlost({ preventDefault() { prevented++; } });
assert(prevented === 1, "context loss is preventDefault'd");
events.webglcontextrestored();
assert(rebuilt === 1 && failed === 0, "restore rebuilds");
events.webglcontextlost({ preventDefault() {} });
fakeFail();
function fakeFail() {
  const boom = {
    addEventListener(name, fn) { events[name] = fn; },
  };
  bindContextLoss(boom, {
    rebuild() { throw new Error("link"); },
    onFailed() { failed++; },
  });
  boomEvents(boom);
}
function boomEvents() {
  events.webglcontextrestored();
}
assert(failed === 1, "a failed rebuild surfaces the message path");

const sample = `#version 300 es
uniform float uTime;
out vec4 o;
vec3 softKnee(vec3 c) { return c; }
void main() {
  vec3 ambient = vec3(0.22);
  vec3 vC = vec3(1.0);
  float hemi = 1.0;
  float uLightAmt = 1.0;
  float ndl = 1.0;
  float wrap = 1.0;
  ${LIGHT_LINE}
  vec3 uFog = vec3(1.0);
  float fog = 0.0;
  o = vec4(softKnee(mix(col, uFog, fog)), 1.0);
}`;
const lit = litFragment(sample);
assert(sample.includes(LIGHT_LINE) && !sample.includes("shadeShadow"), "source shader stays the low path");
assert(lit.includes("shadeShadow") && !lit.includes("softKnee(mix(col, uFog, fog))"), "lit shader drops the knee");
const sky = `void main() {
  vec3 over = max(c - vec3(0.9), vec3(0.0));
  c = min(max(c, vec3(0.0)), vec3(0.9)) + over / (vec3(1.0) + over * 10.0);
  o = vec4(c, 1.0);
}`;
assert(litSky(sky).includes("max(c, vec3(0.0))"), "sky lit path");
assert(sky.includes("vec3(0.9)"), "sky source stays knee'd");
const animated = litSky("uniform float uFlash;\n" + sky);
assert(animated.includes("uniform float uSkyAnim") && animated.includes("uSkyAnim > 0.01"), "lit sky animates");
assert(!sky.includes("uSkyAnim"), "the knee sample stays plain");
assert(litAnchorsOk(meshSources()), "live mesh shaders accept the lit variant");
const highBox = highFragment(meshSources()[1]);
assert(highBox.includes("uGloss") && highBox.includes("uPenumbra") && highBox.includes("highShade"), "high mesh adds gloss, penumbra, and haze");
assert(highBox.includes("surfaceDetail") && highBox.includes("uGround") && highBox.includes("smoothstep(8.0, 20.0, dist)"), "high road detail fades by 20 m");
assert(highBox.includes("vW.xz") && highBox.includes("shadeNoise"), "high road marks continue across slabs");
assert(highBox.includes("fwidth") && highBox.includes("smoothstep(2.0, 7.0, dist)"), "fine grain stays near and drops before it aliases");
assert(!highBox.includes("mortar * 0.55") && !highBox.includes("smoothstep(0.025, 0.0"), "high road marks stay soft");
assert(renderSrc.includes("deck ? vN"), "a road slab does not pillow its own highlight");
assert(renderSrc.includes("* 0.03;"), "neighbouring slabs stay within a few percent");
assert(!litFragment(meshSources()[1]).includes("uGloss"), "the medium lit shader has no gloss");
assert(!meshSources()[1].includes("uGloss"), "the low box shader has no gloss");
assert(!meshSources()[1].includes("surfaceDetail") && !litFragment(meshSources()[1]).includes("uGround"), "low and medium keep a plain road");
assert(groundId({ biome: "garden", surface: "grass" }) === 0, "garden path is flagstone");
assert(groundId({ biome: "city", surface: "stone", particles: "snow" }) === 1, "a city stays asphalt");
assert(groundId({ biome: "aurora-ice" }) === 2 && groundId({ surface: "ice" }) === 2, "ice");
assert(groundId({ surface: "sand" }) === 3 && groundId({ surface: "dust" }) === 3, "sand");
assert(groundId({ surface: "plank" }) === 4 && groundId({ surface: "lava" }) === 5 && groundId({ surface: "cloud" }) === 6, "plank lava cloud");
assert(groundId(null) === 0, "missing palette is flagstone");
const knee = `uniform float uFlash;
void main() {
  vec3 over = max(c - vec3(0.9), vec3(0.0));
  c = min(max(c, vec3(0.0)), vec3(0.9)) + over / (vec3(1.0) + over * 10.0);
  o = vec4(c, 1.0);
}`;
assert(highSky(knee).includes("vec4(max(c, vec3(0.0)), 0.0)"), "high sky keeps alpha for gloss");
assert(litSky(knee).includes("vec4(max(c, vec3(0.0)), 1.0)"), "medium sky alpha stays 1");
const id = new Float32Array(16);
const proj = new Float32Array(16);
proj[0] = 1.2; proj[5] = 1.8; proj[10] = -1.1; proj[11] = -1; proj[14] = -0.2; proj[15] = 0;
id.fill(0);
assert(invertMat(id, proj), "projection inverse");
let col = 0;
for (let c = 0; c < 4; c++) {
  for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += id[k * 4 + r] * proj[c * 4 + k];
    col += Math.abs(s - (r === c ? 1 : 0));
  }
}
assert(col < 1e-5, "inverse rounds back to identity, " + col);
const postText = readFileSync(new URL("../web/post.mjs", import.meta.url), "utf8");
assert(postText.includes("KHR_parallel_shader_compile"), "post can compile without stalling the frame");
assert(postText.includes("FINISH_FS") && !postText.slice(postText.indexOf("const FINISH_FS"), postText.indexOf("const COMPOSITE_HIGH_FS")).includes("uHero"), "medium finish does not mask a hero");
assert(postText.includes("uHero"), "high finish keeps the hero sharp");
assert(postText.includes("uSoft") && postText.includes("8.0 / span"), "speed blur steps at most 8px on the eighth-res tail");
const finishHigh = postText.slice(postText.indexOf("const FINISH_HIGH_FS"), postText.indexOf("const REFLECT_FS"));
assert(finishHigh.includes("clamp(uBlur, 0.0, 1.0) * 0.16"), "speed blur scales with uBlur");
assert(finishHigh.includes("mix(c, tail, 0.7)"), "the soft tail stays a hint of the sharp frame");
assert(!finishHigh.includes("(1.0 - sharp) * 0.42"), "speed blur is not a flat mix of the eighth-res image");
assert(!finishHigh.includes("clamp(uBlur, 0.0, 1.0) * 0.36"), "speed blur stays a light mix");
assert(finishHigh.includes("edge * 0.22 * (1.0 - body)"), "fxaa stays off the runner");
assert(postText.slice(postText.indexOf("const FINISH_FS"), postText.indexOf("const COMPOSITE_HIGH_FS")).includes("edge * 0.22"), "medium fxaa stays light");
assert(finishHigh.includes("/ 255.0"), "the finish dithers under one colour step");
assert(postText.includes("RGBA16F is filterable"), "the scene buffer samples linearly");
assert(postText.includes("DOWNSAMPLE_FS") && !postText.includes("blurPass(flat, 2 / flat.w"), "speed blur does not run four full-frame passes");
const pageText = readFileSync(new URL("../web/main.mjs", import.meta.url), "utf8");
assert(pageText.includes("window.__lumenForceNear"), "a recording can force one near miss");
assert(renderSrc.includes("softwareFromRenderer(gpuName)") && renderSrc.includes("quality.mode === \"low\""), "a forced low tier does not warm high shaders");
assert(clampTier("high", "medium") === "medium", "clamp");

function present(hz, seconds) {
  const player = makePlayer(1.2);
  const rules = rulesOf(32, 11.2, 8, 0.48, 0.12, 0.12);
  const pieces = [];
  let acc = 0;
  let steps = 0;
  const frameDt = 1 / hz;
  const frames = Math.round(seconds * hz);
  for (let i = 0; i < frames; i++) {
    acc += Math.min(0.05, frameDt);
    let guard = 0;
    while (acc >= DT && guard < 4) {
      step(player, pieces, rules, DT);
      acc -= DT;
      guard++;
      steps++;
    }
  }
  return { x: player[0], y: player[1], steps };
}

assert(DT === 1 / 60, "sim step is 1/60");
const at30 = present(30, 2);
const at60 = present(60, 2);
const at120 = present(120, 2);
assert(at30.steps === at60.steps && at60.steps === at120.steps, `step count drifted ${at30.steps} ${at60.steps} ${at120.steps}`);
assert(Math.abs(at30.x - at60.x) < 1e-6 && Math.abs(at60.x - at120.x) < 1e-6, `position drifted ${at30.x} ${at60.x} ${at120.x}`);
assert(at60.steps === 120, "two seconds is 120 sim steps");

console.log(`quality ok tier-hysteresis fbo-fallback context-loss persist sim-steps ${at60.steps} x ${at60.x.toFixed(3)}`);
