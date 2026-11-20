// Picture quality. Tiers and budgets only. This module does not import
// the sim and must not scale the fixed 1/60 step.
//
// POLICY_TEXT is the same form as lib/quality.aura. The page uses this
// copy because the static server does not publish lib/. check-quality
// fails if the two copies drift. The form is data. It is not an
// evo:trial, and a tier change is not KEEP or ROLLBACK.

export const QUALITY_KEY = "lumen-quality";
export const MODES = ["auto", "low", "medium", "high"];
export const TIERS = ["low", "medium", "high"];

export const POLICY_TEXT = `(quality lumen
  (target-hz 60)
  (window 90)
  (min-samples 36)
  (promote-windows 4)
  (demote-windows 1)
  (promote-p95 0.55)
  (demote-p95 0.92)
  (cooldown-ms 4500)
  (promote-cooldown-ms 8000)
  (repromote-ms 60000)
  (gap-slack 1.5)
  (start low)
  (software-cap low)
  (reduced-auto low)
  (dpr-medium 2)
  (dpr-high 2)
  (shadow-medium 1024)
  (shadow-high 2048)
  (bloom-medium 0.18)
  (bloom-high 0.26)
  (pcf-medium 4)
  (pcf-high 9)
  (fov-medium 0.045)
  (fov-high 0.07)
  (shake-medium 0.04)
  (shake-high 0.06)
  (exposure-medium 1)
  (exposure-high 1.02)
  (grade-medium 0.4)
  (grade-high 0.58)
  (fxaa-medium 1)
  (fxaa-high 1)
  (blur-medium 0)
  (blur-high 0.88)
  (shaft-medium 0)
  (shaft-high 0.22)
  (ssao-medium 0)
  (ssao-high 0.8)
  (sky-medium 0.55)
  (sky-high 1)
  (trail-medium 4)
  (trail-high 7)
  (dust-medium 18)
  (dust-high 28)
  (spark-medium 42)
  (spark-high 56)
  (keep-pulse 0.62)
  (rollback-cue 0.34)
  (reflect-medium 0)
  (reflect-high 0.62)
  (mote-medium 0)
  (mote-high 36)
  (streak-medium 0)
  (streak-high 8)
  (whoosh-medium 0)
  (whoosh-high 0.2)
  (aerial-medium 0)
  (aerial-high 0.62)
  (penumbra-medium 0)
  (penumbra-high 8))`;

const POLICY_KEYS = {
  "target-hz": "targetHz",
  window: "window",
  "min-samples": "minSamples",
  "promote-windows": "promoteWindows",
  "demote-windows": "demoteWindows",
  "promote-p95": "promoteP95",
  "demote-p95": "demoteP95",
  "cooldown-ms": "cooldownMs",
  "promote-cooldown-ms": "promoteCooldownMs",
  "repromote-ms": "repromoteMs",
  "gap-slack": "gapSlack",
  start: "start",
  "software-cap": "softwareCap",
  "reduced-auto": "reducedAuto",
  "dpr-medium": "dprMedium",
  "dpr-high": "dprHigh",
  "shadow-medium": "shadowMedium",
  "shadow-high": "shadowHigh",
  "bloom-medium": "bloomMedium",
  "bloom-high": "bloomHigh",
  "pcf-medium": "pcfMedium",
  "pcf-high": "pcfHigh",
  "fov-medium": "fovMedium",
  "fov-high": "fovHigh",
  "shake-medium": "shakeMedium",
  "shake-high": "shakeHigh",
  "exposure-medium": "exposureMedium",
  "exposure-high": "exposureHigh",
  "grade-medium": "gradeMedium",
  "grade-high": "gradeHigh",
  "fxaa-medium": "fxaaMedium",
  "fxaa-high": "fxaaHigh",
  "blur-medium": "blurMedium",
  "blur-high": "blurHigh",
  "shaft-medium": "shaftMedium",
  "shaft-high": "shaftHigh",
  "ssao-medium": "ssaoMedium",
  "ssao-high": "ssaoHigh",
  "sky-medium": "skyMedium",
  "sky-high": "skyHigh",
  "trail-medium": "trailMedium",
  "trail-high": "trailHigh",
  "dust-medium": "dustMedium",
  "dust-high": "dustHigh",
  "spark-medium": "sparkMedium",
  "spark-high": "sparkHigh",
  "keep-pulse": "keepPulse",
  "rollback-cue": "rollbackCue",
  "reflect-medium": "reflectMedium",
  "reflect-high": "reflectHigh",
  "mote-medium": "moteMedium",
  "mote-high": "moteHigh",
  "streak-medium": "streakMedium",
  "streak-high": "streakHigh",
  "whoosh-medium": "whooshMedium",
  "whoosh-high": "whooshHigh",
  "aerial-medium": "aerialMedium",
  "aerial-high": "aerialHigh",
  "penumbra-medium": "penumbraMedium",
  "penumbra-high": "penumbraHigh",
};

function tokenize(text) {
  const src = String(text || "").replace(/;[^\n]*/g, " ");
  return src.match(/[()]|[^()\s]+/g) || [];
}

function readForm(tokens, i) {
  if (tokens[i] !== "(") return null;
  const list = [];
  let k = i + 1;
  while (k < tokens.length && tokens[k] !== ")") {
    if (tokens[k] === "(") {
      const nested = readForm(tokens, k);
      if (!nested) return null;
      list.push(nested.value);
      k = nested.next;
    } else {
      const raw = tokens[k];
      const n = Number(raw);
      list.push(Number.isFinite(n) && raw !== "" ? n : raw);
      k++;
    }
  }
  if (tokens[k] !== ")") return null;
  return { value: list, next: k + 1 };
}

export function parsePolicy(text) {
  const tokens = tokenize(text);
  const form = readForm(tokens, tokens.indexOf("("));
  if (!form || !Array.isArray(form.value) || form.value[0] !== "quality") {
    throw new Error("quality form missing");
  }
  const out = { id: String(form.value[1] || "lumen") };
  for (let i = 2; i < form.value.length; i++) {
    const row = form.value[i];
    if (!Array.isArray(row) || row.length < 2) throw new Error("quality row");
    const key = POLICY_KEYS[row[0]];
    if (!key) throw new Error("unknown quality key " + row[0]);
    out[key] = row[1];
  }
  for (const key of Object.values(POLICY_KEYS)) {
    if (out[key] == null || out[key] === "") throw new Error("quality missing " + key);
  }
  return out;
}

export const DEFAULT_POLICY = parsePolicy(POLICY_TEXT);

export function tierRank(tier) {
  const i = TIERS.indexOf(tier);
  return i < 0 ? 0 : i;
}

export function clampTier(tier, ceiling) {
  const cap = tierRank(ceiling || "high");
  const rank = tierRank(tier);
  return TIERS[Math.min(rank, cap)];
}

export function percentile(values, q) {
  if (!values || !values.length) return 0;
  const copy = values.slice().sort((a, b) => a - b);
  const i = Math.min(copy.length - 1, Math.max(0, Math.floor(q * (copy.length - 1))));
  return copy[i];
}

export function readQualityMode(storage) {
  try {
    const v = storage && storage.getItem(QUALITY_KEY);
    return MODES.includes(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

export function writeQualityMode(storage, mode) {
  if (!MODES.includes(mode) || !storage) return false;
  try {
    storage.setItem(QUALITY_KEY, mode);
    return true;
  } catch {
    return false;
  }
}

// One detector for the 1× cap and for Auto. WARP shows up as Basic Render.
export function softwareFromRenderer(name) {
  if (!name) return false;
  return /swiftshader|llvmpipe|softpipe|software|basic render|\bwarp\b/i.test(String(name));
}

// Caps the picture can actually build. A missing debug extension leaves
// software false: absence is not a software renderer. fboOk false locks
// the ceiling at low so a failed framebuffer becomes the single pass.
export function probeCaps(info) {
  const src = info || {};
  const maxTex = src.maxTex | 0;
  let ceiling = "high";
  if (!src.webgl2) ceiling = "low";
  else if (maxTex > 0 && maxTex < 1024) ceiling = "low";
  else if (maxTex > 0 && maxTex < 2048) ceiling = "medium";
  if (src.fboOk === false) ceiling = "low";
  return {
    webgl2: !!src.webgl2,
    maxTex,
    software: !!src.software,
    softwareKnown: src.softwareKnown === true || !!src.software,
    floatFb: !!src.floatFb,
    fboOk: src.fboOk !== false,
    gpu: src.gpu || "",
    ceiling,
  };
}

export function frameBudget(policy, refreshHz) {
  const target = (policy && policy.targetHz) || 60;
  const hz = Math.max(target, refreshHz || 0);
  return 1000 / hz;
}

// A late frame is a dropped refresh, not vsync jitter. 1.5× the interval
// sits above the 6.5–10.3 ms scatter of a healthy 120 Hz panel and below
// a missed vsync (about 2×).
export function gapLimit(policy, refreshHz) {
  const slack = (policy && policy.gapSlack) || 1.5;
  const hz = refreshHz > 0 ? refreshHz : ((policy && policy.targetHz) || 60);
  return (1000 / hz) * slack;
}

// Low's cap is the floor. Medium and High may match it or go higher, and
// a software or slow-frame cap still applies to every tier.
export function resolutionScale(tier, deviceDpr, baseCap, policy) {
  const use = policy || DEFAULT_POLICY;
  const device = deviceDpr > 0 ? deviceDpr : 1;
  const base = baseCap > 0 ? baseCap : device;
  const low = Math.min(device, base);
  const want = tier === "high" ? use.dprHigh : tier === "medium" ? use.dprMedium : low;
  const raised = Math.max(low, Number(want) || low);
  return Math.min(device, base, raised);
}

function autoCap(state) {
  let cap = (state.caps && state.caps.ceiling) || "high";
  if (state.caps && state.caps.software) cap = clampTier(state.policy.softwareCap || "low", cap);
  if (state.reduced) cap = clampTier(state.policy.reducedAuto || "low", cap);
  return cap;
}

export function createQuality(policy, caps, now = 0) {
  const use = policy || DEFAULT_POLICY;
  const probed = caps && caps.ceiling ? caps : probeCaps(caps || {});
  const state = {
    policy: use,
    caps: probed,
    mode: "auto",
    tier: "low",
    samples: [],
    pending: 0,
    good: 0,
    bad: 0,
    cooldownUntil: 0,
    hidden: false,
    reduced: false,
    refreshHz: use.targetHz || 60,
    refreshGuess: 0,
    refreshStreak: 0,
    blockedUntil: { medium: 0, high: 0 },
    changes: [],
    now,
  };
  state.tier = clampTier(probed.software ? (use.softwareCap || "low") : (use.start || "low"), probed.ceiling);
  return state;
}

function remember(state, now, why) {
  state.changes.push({ t: now || 0, tier: state.tier, why });
  if (state.changes.length > 24) state.changes.shift();
}

export function setMode(state, mode, now = 0) {
  if (!state || !MODES.includes(mode)) return state ? state.tier : "low";
  state.mode = mode;
  state.good = 0;
  state.bad = 0;
  state.samples = [];
  state.pending = 0;
  state.blockedUntil = { medium: 0, high: 0 };
  if (mode === "auto") {
    const start = state.caps.software ? (state.policy.softwareCap || "low") : (state.policy.start || "low");
    state.tier = clampTier(start, autoCap(state));
  } else {
    state.tier = clampTier(mode, state.caps.ceiling || "high");
  }
  remember(state, now, "mode");
  return state.tier;
}

export function noteVisibility(state, visible, now = 0) {
  if (!state) return;
  const hidden = !visible;
  if (hidden === state.hidden) return;
  state.hidden = hidden;
  state.samples = [];
  state.pending = 0;
  state.good = 0;
  state.bad = 0;
  if (!hidden) state.cooldownUntil = Math.max(state.cooldownUntil, now + state.policy.cooldownMs);
}

export function noteReduced(state, reduced, now = 0) {
  if (!state) return state && state.tier;
  state.reduced = !!reduced;
  if (state.mode === "auto") {
    const cap = autoCap(state);
    if (tierRank(state.tier) > tierRank(cap)) {
      state.tier = cap;
      state.samples = [];
      state.pending = 0;
      state.good = 0;
      state.bad = 0;
      remember(state, now, "reduced");
    }
  }
  return state.tier;
}

export function noteFbo(state, ok, now = 0) {
  if (!state) return "low";
  if (ok) return state.tier;
  state.caps = { ...state.caps, fboOk: false, ceiling: "low" };
  if (state.tier !== "low") {
    state.tier = "low";
    state.samples = [];
    state.pending = 0;
    state.good = 0;
    state.bad = 0;
    remember(state, now, "fbo");
  }
  return state.tier;
}

export function guessRefresh(gapMs) {
  if (!(gapMs > 4 && gapMs < 40)) return 0;
  const hz = 1000 / gapMs;
  const marks = [30, 60, 90, 120, 144, 165, 240];
  let best = 0;
  let err = 1e9;
  for (const mark of marks) {
    const d = Math.abs(hz - mark);
    if (d < err) {
      err = d;
      best = mark;
    }
  }
  return err <= 4 ? best : 0;
}

export function noteRefresh(state, gapMs) {
  if (!state) return 60;
  const guess = guessRefresh(gapMs);
  if (!guess) {
    state.refreshStreak = 0;
    return state.refreshHz;
  }
  if (guess === state.refreshGuess) state.refreshStreak++;
  else {
    state.refreshGuess = guess;
    state.refreshStreak = 1;
  }
  if (state.refreshStreak >= 8) state.refreshHz = guess;
  return state.refreshHz;
}

function snapshot(state, extra) {
  return {
    mode: state.mode,
    tier: state.tier,
    refreshHz: state.refreshHz,
    hidden: state.hidden,
    reduced: state.reduced,
    ceiling: state.caps.ceiling,
    software: !!state.caps.software,
    floatFb: !!state.caps.floatFb,
    cooldownUntil: state.cooldownUntil,
    changes: state.changes.length,
    ...(extra || {}),
  };
}

// Chrome's performance.now is quantised to 0.1 ms without isolation, so a
// sub-quantum render is reported as 0. That is free headroom, not a miss.
// Non-finite and negative readings are dropped. A multi-hundred-ms reading
// is a real stall and keeps its ratio.
export function frameWork(workMs, budget) {
  if (!(budget > 0) || !Number.isFinite(workMs) || workMs < 0) return null;
  return workMs / budget;
}

// One sample is one drawn frame. Promotion needs several quiet windows.
// A p95 of real dropped refreshes demotes on the next window. The tier
// that was just left stays blocked for repromoteMs, so a miss does not
// climb straight back.
export function observe(state, sample) {
  if (!state) return null;
  const now = (sample && sample.now) || 0;
  if (sample && sample.refreshHz > 0) state.refreshHz = sample.refreshHz;
  if (state.hidden || (sample && sample.visible === false)) {
    if (!state.hidden) noteVisibility(state, false, now);
    return snapshot(state);
  }
  if (state.mode !== "auto") return snapshot(state);
  const workMs = sample && sample.workMs;
  const gapMs = sample && sample.gapMs;
  if (gapMs > 250) {
    state.samples = [];
    state.pending = 0;
    return snapshot(state);
  }
  const budget = frameBudget(state.policy, state.refreshHz);
  const limit = gapLimit(state.policy, state.refreshHz);
  const load = frameWork(workMs, budget);
  const gapOk = Number.isFinite(gapMs) && gapMs > 0 && gapMs < 250;
  if (load == null && !gapOk) return snapshot(state);
  const gapOver = gapOk && gapMs >= limit;
  // Invalid work does not invent headroom. A real 0 ms reading does.
  const workRatio = load == null ? (gapOver ? gapMs / budget : null) : load;
  if (workRatio == null) return snapshot(state);
  const missRatio = Math.max(workRatio, gapOver ? gapMs / budget : 0);
  state.samples.push({ work: workRatio, miss: missRatio, gap: gapOk ? gapMs : 0 });
  if (state.samples.length > state.policy.window) state.samples.shift();
  state.pending++;
  if (state.pending < state.policy.minSamples || state.samples.length < state.policy.minSamples) {
    return snapshot(state);
  }
  state.pending = 0;
  const p95work = percentile(state.samples.map((s) => s.work), 0.95);
  const p95miss = percentile(state.samples.map((s) => s.miss), 0.95);
  const p95gap = percentile(state.samples.map((s) => s.gap), 0.95);
  if (now < state.cooldownUntil) return snapshot(state, { p95work, p95miss, budget });
  const cap = autoCap(state);
  if (p95miss >= state.policy.demoteP95) {
    state.bad++;
    state.good = 0;
    if (state.bad >= state.policy.demoteWindows && tierRank(state.tier) > 0) {
      const left = state.tier;
      state.tier = TIERS[tierRank(state.tier) - 1];
      state.bad = 0;
      state.good = 0;
      state.samples = [];
      state.cooldownUntil = now + state.policy.cooldownMs;
      if (!state.blockedUntil) state.blockedUntil = { medium: 0, high: 0 };
      state.blockedUntil[left] = now + (state.policy.repromoteMs || 60000);
      remember(state, now, "demote");
    }
  } else if (p95work <= state.policy.promoteP95 && p95gap < limit && tierRank(state.tier) < tierRank(cap)) {
    const next = TIERS[tierRank(state.tier) + 1];
    const blocked = state.blockedUntil && state.blockedUntil[next] > now;
    if (blocked) {
      state.good = 0;
      state.bad = 0;
    } else {
      state.good++;
      state.bad = 0;
      if (state.good >= state.policy.promoteWindows) {
        state.tier = next;
        state.good = 0;
        state.bad = 0;
        state.samples = [];
        state.cooldownUntil = now + state.policy.promoteCooldownMs;
        remember(state, now, "promote");
      }
    }
  } else {
    state.good = 0;
    state.bad = 0;
  }
  return snapshot(state, { p95work, p95miss, budget });
}

export function tierProfile(tier, policy, caps) {
  const use = policy || DEFAULT_POLICY;
  const probed = caps || {};
  if (!tier || tier === "low" || probed.fboOk === false || probed.webgl2 === false) {
    return {
      tier: "low", shadow: false, bloom: false, hdr: false, dpr: 0,
      pcf: 0, shadowSize: 0, bloomAmt: 0, chain: "none",
      fovKick: 0, shake: 0, exposure: 1, grade: 0, fxaa: false,
      blur: 0, shaft: 0, ssao: 0, sky: 0, trail: 0, dust: 12, spark: 36,
      keep: 0, back: 0, reflect: 0, mote: 0, streak: 0, whoosh: 0, aerial: 0, penumbra: 0,
    };
  }
  const high = tier === "high";
  const maxTex = probed.maxTex > 0 ? probed.maxTex : 4096;
  let shadowSize = high ? use.shadowHigh : use.shadowMedium;
  if (shadowSize > maxTex) shadowSize = maxTex;
  return {
    tier: high ? "high" : "medium",
    shadow: shadowSize >= 256,
    bloom: true,
    hdr: !!probed.floatFb,
    dpr: high ? use.dprHigh : use.dprMedium,
    pcf: high ? use.pcfHigh : use.pcfMedium,
    shadowSize,
    bloomAmt: high ? use.bloomHigh : use.bloomMedium,
    chain: high ? "half" : "quarter",
    fovKick: high ? use.fovHigh : use.fovMedium,
    shake: high ? use.shakeHigh : use.shakeMedium,
    exposure: high ? use.exposureHigh : use.exposureMedium,
    grade: high ? use.gradeHigh : use.gradeMedium,
    fxaa: (high ? use.fxaaHigh : use.fxaaMedium) >= 1,
    blur: high ? use.blurHigh : use.blurMedium,
    reflect: high ? use.reflectHigh : use.reflectMedium,
    mote: high ? use.moteHigh : use.moteMedium,
    streak: high ? use.streakHigh : use.streakMedium,
    whoosh: high ? use.whooshHigh : use.whooshMedium,
    aerial: high ? use.aerialHigh : use.aerialMedium,
    penumbra: high ? use.penumbraHigh : use.penumbraMedium,
    shaft: high ? use.shaftHigh : use.shaftMedium,
    ssao: high ? use.ssaoHigh : use.ssaoMedium,
    sky: high ? use.skyHigh : use.skyMedium,
    trail: high ? use.trailHigh : use.trailMedium,
    dust: high ? use.dustHigh : use.dustMedium,
    spark: high ? use.sparkHigh : use.sparkMedium,
    keep: use.keepPulse,
    back: use.rollbackCue,
  };
}

export function contextPlan(kind) {
  if (kind === "lost") {
    return { preventDefault: true, drawing: false, rebuild: false, message: "" };
  }
  if (kind === "restored") {
    return { preventDefault: false, drawing: true, rebuild: true, message: "" };
  }
  return {
    preventDefault: false,
    drawing: false,
    rebuild: false,
    message: "The picture stopped. Reload the page to draw the garden again.",
  };
}

export function bindContextLoss(target, handlers) {
  const onLost = (event) => {
    const plan = contextPlan("lost");
    if (plan.preventDefault && event && event.preventDefault) event.preventDefault();
    if (handlers && handlers.onLost) handlers.onLost(plan);
  };
  const onRestored = () => {
    try {
      if (handlers && handlers.rebuild) handlers.rebuild();
      if (handlers && handlers.onRestored) handlers.onRestored(contextPlan("restored"));
    } catch {
      if (handlers && handlers.onFailed) handlers.onFailed(contextPlan("restore-failed"));
    }
  };
  target.addEventListener("webglcontextlost", onLost);
  target.addEventListener("webglcontextrestored", onRestored);
  return { onLost, onRestored };
}
