// Quality tiers, hysteresis, fallbacks, and a fixed sim step.
// The picture policy must not change how fast the runner moves.
import { readFileSync } from "node:fs";
import { DT, makePlayer, rulesOf, step } from "../web/sim.mjs";
import { litAnchorsOk, litFragment, litSky, LIGHT_LINE } from "../web/lit.mjs";
import { meshSources } from "../web/render.mjs";
import {
  DEFAULT_POLICY,
  POLICY_TEXT,
  bindContextLoss,
  clampTier,
  contextPlan,
  createQuality,
  frameBudget,
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
assert(litAnchorsOk(meshSources()), "live mesh shaders accept the lit variant");
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
