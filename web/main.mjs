import { DT, bodyLane, makePlayer, pressJump, pressLane, pressSlide, rulesOf, scoreNow, step } from "./sim.mjs";
import { createRenderer } from "./render.mjs";
import { createInput } from "./input.mjs";
import { createAudio } from "./audio.mjs";

const canvas = document.getElementById("view");
const scoreEl = document.getElementById("score");
const replayEl = document.getElementById("replay");
const statsEl = document.getElementById("stats");
const motionBtn = document.getElementById("motion");
const muteBtn = document.getElementById("mute");
const benchEl = document.getElementById("bench");
const saidEl = document.getElementById("said");
const toastEl = document.getElementById("toast");
const flashEl = document.getElementById("flash");
const comboEl = document.getElementById("combo");
const badgeEl = document.getElementById("badge");
const notesEl = document.getElementById("notes");
const noteList = document.getElementById("note-list");
const modelBtn = document.getElementById("model");
const markEl = document.getElementById("mark");

const params = new URLSearchParams(location.search);
const reducedPref = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let reduced = localStorage.getItem("lumen-motion") === "reduce" || (localStorage.getItem("lumen-motion") !== "full" && reducedPref);
let showStats = params.has("stats");
const benchMode = params.has("bench");

const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = createAudio();
if (!renderer) {
  document.getElementById("nogpu").hidden = false;
}

const player = makePlayer(1.2);
let rules = rulesOf(32, 11.2, 5, 0.48, 0.12, 0.12);
let pieces = [];
let hue = 0;
const sceneTarget = {
  sky: [0.55, 0.72, 0.95],
  ground: [0.42, 0.68, 0.38],
  flower: "daisy",
  density: 0.45,
  light: 0.82,
  fog: 0.22,
};
const sceneView = {
  sky: sceneTarget.sky.slice(),
  ground: sceneTarget.ground.slice(),
  flower: "daisy",
  density: 0.45,
  light: 0.82,
  fog: 0.22,
};
let pals = [
  { kind: "kitten", name: "mochi", r: 0.95, g: 0.62, b: 0.35, motion: "hop", plan: "kitten" },
  { kind: "car", name: "beep", r: 0.3, g: 0.55, b: 0.95, motion: "pace", plan: "car" },
];
let hero = { kind: "keeper", plan: "keeper", r: 0.95, g: 0.72, b: 0.45 };
let bend = 0.38;
let loot = "coin";
const LOOTS = new Set(["coin", "star", "gem", "blossom", "apple"]);
let provider = "";
let modelName = "";
let providers = [];
let stumble = 0;
let lastCue = "";
let lastCueAt = 0;
let alive = true;
let seed = 1;
let serverScore = 0;
let seenChunks = new Set();
const frames = new Float32Array(240);
let frameN = 0;
let lastNow = performance.now();
let acc = 0;
let sendAcc = 0;
let jumpQ = 0;
let slideQ = 0;
let laneQ = 0;
let inputAt = 0;
let latency = 0;
let lastShown = "0";
let spark = "";
let nearSpark = false;
let rejectSpark = false;
let combo = 0;
let comboUntil = 0;
const nearSeen = new Set();
const toastQ = [];
let toastUntil = 0;
const gardenNotes = [];
const saidRows = [];
let ws;
let connected = false;
let booted = false;

function num(v, fallback) {
  return typeof v === "number" ? v : fallback;
}

function takeColor(v, fallback) {
  if (!Array.isArray(v) || v.length < 3) return fallback;
  return [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])];
}

function applyScene(msg) {
  if (Array.isArray(msg.sky)) sceneTarget.sky = takeColor(msg.sky, sceneTarget.sky);
  if (Array.isArray(msg.ground)) sceneTarget.ground = takeColor(msg.ground, sceneTarget.ground);
  if (typeof msg.flower === "string" && msg.flower) sceneTarget.flower = msg.flower;
  if (typeof msg.density === "number") sceneTarget.density = msg.density;
  if (typeof msg.light === "number") sceneTarget.light = msg.light;
  if (typeof msg.fog === "number") sceneTarget.fog = Math.min(0.38, Math.max(0, msg.fog));
}

function applyPals(msg) {
  if (!Array.isArray(msg.pals)) return;
  const next = [];
  for (const row of msg.pals) {
    if (!row || typeof row.kind !== "string" || typeof row.name !== "string") continue;
    const r = Number(row.r);
    const g = Number(row.g);
    const b = Number(row.b);
    if (![r, g, b].every((n) => Number.isFinite(n))) continue;
    next.push({
      kind: row.kind,
      name: row.name,
      r, g, b,
      motion: typeof row.motion === "string" ? row.motion : "pace",
      plan: typeof row.plan === "string" ? row.plan : row.kind,
    });
    if (next.length >= 6) break;
  }
  pals = next;
}

const HERO_PLANS = new Set(["keeper", "kitten", "car", "bunny", "bird", "butterfly", "frog", "duck", "friend"]);

function applyHero(msg) {
  const row = msg.hero;
  if (!row || typeof row !== "object") return;
  const kind = typeof row.kind === "string" ? row.kind.toLowerCase() : "keeper";
  const plan = typeof row.plan === "string" ? row.plan.toLowerCase() : kind;
  const r = Number(row.r);
  const g = Number(row.g);
  const b = Number(row.b);
  hero = {
    kind,
    plan: HERO_PLANS.has(plan) ? plan : "friend",
    r: Number.isFinite(r) ? r : 0.95,
    g: Number.isFinite(g) ? g : 0.72,
    b: Number.isFinite(b) ? b : 0.45,
  };
}

function paintModel() {
  const label = provider === "minimax" ? "MiniMax" : provider === "deepseek" ? "DeepSeek" : "";
  modelBtn.hidden = providers.length < 2 || !label;
  modelBtn.textContent = label || "Model";
  const which = modelName || label;
  modelBtn.setAttribute("aria-label", which ? `Switch model, now ${which}` : "Switch model");
}

function applyProvider(msg) {
  if (typeof msg.provider === "string") provider = msg.provider;
  if (typeof msg.model === "string") modelName = msg.model;
  if (Array.isArray(msg.providers)) {
    providers = msg.providers.filter((name) => name === "deepseek" || name === "minimax");
  }
  paintModel();
}

function applyLook(msg) {
  if (typeof msg.bend === "number" && msg.bend >= 0.05 && msg.bend <= 0.75) bend = msg.bend;
  if (typeof msg.loot === "string" && LOOTS.has(msg.loot)) loot = msg.loot;
}

function applyRules(msg) {
  const slide = typeof msg["slide-dur"] === "number" ? msg["slide-dur"] : msg.slide;
  rules = rulesOf(
    num(msg.g, rules.g),
    num(msg.jump, rules.jump),
    num(msg.speed, rules.speed),
    num(slide, rules.slide),
    num(msg.coyote, rules.coyote),
    num(msg.forgive, rules.forgive),
  );
  if (typeof msg.hue === "number") hue = msg.hue;
  applyScene(msg);
  applyLook(msg);
  applyPals(msg);
  applyHero(msg);
  applyProvider(msg);
}

function lerpScene(dt) {
  const k = 1 - Math.exp(-Math.max(0, dt) * 3.2);
  for (let i = 0; i < 3; i++) {
    sceneView.sky[i] += (sceneTarget.sky[i] - sceneView.sky[i]) * k;
    sceneView.ground[i] += (sceneTarget.ground[i] - sceneView.ground[i]) * k;
  }
  sceneView.density += (sceneTarget.density - sceneView.density) * k;
  sceneView.light += (sceneTarget.light - sceneView.light) * k;
  sceneView.fog += (sceneTarget.fog - sceneView.fog) * k;
  if (Math.abs(sceneTarget.density - sceneView.density) < 0.04) sceneView.flower = sceneTarget.flower;
}

function paintNotes() {
  noteList.replaceChildren();
  for (const row of gardenNotes) {
    const li = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = row.cue;
    li.append(title);
    if (row.why) {
      const sub = document.createElement("span");
      sub.textContent = row.why;
      li.append(sub);
    }
    noteList.append(li);
  }
}

function showSaid(text) {
  const clean = String(text || "").trim();
  if (!clean || !saidEl) return;
  if (saidRows[0] === clean) return;
  saidRows.unshift(clean);
  if (saidRows.length > 6) saidRows.pop();
  saidEl.hidden = false;
  saidEl.textContent = clean;
}

function showCue(text) {
  if (!text) return;
  const now = performance.now();
  if (text === lastCue && now - lastCueAt < 1200) return;
  lastCue = text;
  lastCueAt = now;
  toastQ.push(text);
}

function showMark(word) {
  const clean = String(word).toLowerCase().replace(/[^a-z]/g, "").slice(0, 12);
  if (!clean || !markEl) return;
  markEl.hidden = false;
  markEl.textContent = clean;
  markEl.animate(
    [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
    { duration: 180, easing: "ease-out", fill: "both" },
  );
}

function remember(msg) {
  const cue = msg.cue || "";
  if (!cue) return;
  gardenNotes.unshift({ cue, why: msg.why || "", ask: msg.ask || "" });
  if (gardenNotes.length > 6) gardenNotes.pop();
  if (!notesEl.hidden) paintNotes();
  // The corner keeps the model's sentence. A dream's canned line and
  // the stumble toasts stay off that line.
  if (msg.ask) showSaid(cue);
  if (msg.mark) showMark(msg.mark);
  else showCue(cue);
}

function addChunk(msg) {
  if (seenChunks.has(msg.id)) return;
  seenChunks.add(msg.id);
  const born = msg.origin === "motif" ? performance.now() : 0;
  for (const q of msg.pieces) {
    const copy = q.slice();
    if (born) copy.born = born;
    pieces.push(copy);
  }
}

function prune() {
  const z = player[0] - 12;
  if (pieces.length < 400) {
    let w = 0;
    for (let i = 0; i < pieces.length; i++) {
      const q = pieces[i];
      if (q[0] !== 0 && q[1] + q[2] >= z) pieces[w++] = q;
    }
    pieces.length = w;
    return;
  }
  const next = [];
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 0 && q[1] + q[2] >= z) next.push(q);
  }
  pieces = next;
}

function resetLocal() {
  const p = makePlayer(1.2);
  player.set(p);
  pieces = [];
  seenChunks = new Set();
  alive = true;
  acc = 0;
  combo = 0;
  comboEl.hidden = true;
  nearSeen.clear();
  stumble = 0;
  flashEl.hidden = true;
  flashEl.classList.remove("on");
}

function reconcile(st) {
  if (typeof st.g === "number") applyRules(st);
  serverScore = st.score;
  alive = true;
  player[5] = 1;
  if (typeof st.grace === "number" && st.grace > 0) stumble = Math.max(stumble, st.grace * 1000);
  if (st.alive !== false) {
    const lead = player[0] - st.x;
    if (lead < -0.4) player[0] += (-lead) * 0.35;
    else if (lead > 3.5) player[0] = st.x;
    const lane = st.lane;
    if (typeof lane === "number" && Math.abs(player[9] - lane) > 1.5) player[9] = lane;
    if (typeof st.lx === "number" && Math.abs(player[10] - st.lx) > 2.2) player[10] = st.lx;
  }
  if (typeof st.hue === "number") hue = st.hue;
}

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    connected = true;
    if (booted) {
      // The local list has already been pruned. Ask the server for the
      // chunks it still has instead of inventing an empty road.
      pieces = [];
      seenChunks = new Set();
      ws.send(JSON.stringify({ op: "resync" }));
    } else {
      const seedParam = params.get("seed");
      ws.send(JSON.stringify({ op: "hello", seed: seedParam ? Number(seedParam) : 42 }));
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.op === "welcome") {
      resetLocal();
      booted = true;
      seed = msg.seed;
      applyRules(msg);
      replayEl.textContent = msg.replay;
    } else if (msg.op === "resync") {
      pieces = [];
      seenChunks = new Set();
      booted = true;
    } else if (msg.op === "rules") {
      applyRules(msg);
      window.__lumen = Object.assign(window.__lumen || {}, {
        motif: msg.motif || "",
        scene: msg.scene || "",
        via: msg.via || "",
        flower: msg.flower,
        sky: msg.sky,
      });
    } else if (msg.op === "chunk") {
      addChunk(msg);
    } else if (msg.op === "state") {
      reconcile(msg);
      applyScene(msg);
      applyLook(msg);
      window.__lumen = Object.assign(window.__lumen || {}, {
        chunks: msg.chunks,
        motif: msg.motif || (window.__lumen && window.__lumen.motif),
        scene: msg.scene || (window.__lumen && window.__lumen.scene),
        alive: true,
      });
    } else if (msg.op === "decision") {
      remember(msg);
      if (msg.kind === "KEEP" && (msg.arm === "motif" || msg.arm === "scene" || msg.arm === "pals")) audio.keep();
      if (msg.kind === "ROLLBACK") rejectSpark = true;
      if (msg.kind === "BUMP") stumble = Math.max(stumble, 1500);
    }
  };
  ws.onclose = () => {
    connected = false;
    setTimeout(connect, 600);
  };
}

function sendTick() {
  if (!connected || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ op: "tick", jump: jumpQ, slide: slideQ, lane: laneQ }));
  jumpQ = 0;
  slideQ = 0;
  laneQ = 0;
}

function restart() {
  resetLocal();
  if (connected && ws.readyState === 1) {
    ws.send(JSON.stringify({ op: "restart", seed }));
  }
}

function publishProbe() {
  const root = document.documentElement;
  root.dataset.sky = sceneView.sky.map((n) => n.toFixed(2)).join(",");
  root.dataset.flower = sceneView.flower;
  root.dataset.alive = "1";
  root.dataset.light = sceneView.light.toFixed(2);
  window.__lumen = {
    sky: sceneTarget.sky.slice(),
    ground: sceneTarget.ground.slice(),
    flower: sceneTarget.flower,
    density: sceneTarget.density,
    light: sceneTarget.light,
    viewSky: sceneView.sky.slice(),
    alive: true,
    motif: window.__lumen && window.__lumen.motif,
    scene: window.__lumen && window.__lumen.scene,
    via: window.__lumen && window.__lumen.via,
    chunks: window.__lumen && window.__lumen.chunks,
    cues: gardenNotes.map((row) => row.cue),
    pals: pals.map((row) => row.name),
    hero: hero.plan,
    provider,
    model: modelName,
  };
  root.dataset.pals = pals.map((row) => row.name).join(",");
  root.dataset.hero = hero.plan || "keeper";
  root.dataset.provider = provider;
  root.dataset.loot = loot;
  root.dataset.bend = bend.toFixed(2);
  root.dataset.mark = markEl && !markEl.hidden ? markEl.textContent : "";
  root.dataset.chat = saidRows.join(" | ");
  root.dataset.said = saidEl && !saidEl.hidden ? saidEl.textContent : "";
  root.dataset.flyers = String(pieces.reduce((n, q) => n + (q[0] === 8 ? 1 : 0), 0));
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  frames[frameN % frames.length] = dt * 1000;
  frameN++;
  const inp = input.consume();
  if (inp.jump || inp.slide || inp.lane) {
    audio.unlock();
    inputAt = now;
  }
  if (alive) {
    if (inp.jump) { pressJump(player); jumpQ = 1; audio.jump(); }
    if (inp.slide) { pressSlide(player); slideQ = 1; audio.slide(); }
    if (inp.lane) { pressLane(player, inp.lane); laneQ = inp.lane; }
    acc += dt;
    let guard = 0;
    while (acc >= DT && guard < 4) {
      const before = player[2];
      const wasY = player[1];
      const ev = step(player, pieces, rules, DT);
      if (inputAt && before <= 0 && player[2] > 0) {
        latency = now - inputAt;
        inputAt = 0;
      }
      if (ev === "coin") {
        audio.coin();
        spark = "coin";
        combo = now < comboUntil ? combo + 1 : 1;
        comboUntil = now + 2200;
      }
      if (ev === "spring") { audio.spring(); spark = "spring"; }
      if (ev === "bump" || ev === "oops") {
        stumble = 1500;
        player[5] = 1;
        showCue(ev === "oops" ? "Back on the path" : "Oops! Keep going");
        audio.near();
      }
      if (wasY > 0.2 && player[1] <= 0.001 && player[5] > 0) audio.land();
      if (scanNear(now)) { nearSpark = true; audio.near(); }
      player[5] = 1;
      acc -= DT;
      guard++;
    }
    prune();
  }
  sendAcc += dt;
  if (sendAcc >= 0.05) {
    sendTick();
    sendAcc = 0;
  }
  stumble = Math.max(0, stumble - dt * 1000);
  if (stumble > 0) {
    flashEl.hidden = false;
    if (!flashEl.classList.contains("on")) flashEl.classList.add("on");
  } else if (!flashEl.hidden) {
    flashEl.hidden = true;
    flashEl.classList.remove("on");
  }
  lerpScene(dt);
  publishProbe();
  audio.music(reduced);
  if (renderer) {
    renderer.resize();
    renderer.frame({
      x: player[0], y: player[1], vy: player[2], lx: player[10],
      slide: player[3], hue, time: now / 1000, now, reduced, pieces,
      event: spark, alive: true, speed: rules.speed, g: rules.g,
      near: nearSpark, reject: rejectSpark,
      scene: sceneView, stumble: stumble / 1500, pals, hero, bend, loot,
    });
    spark = "";
    nearSpark = false;
    rejectSpark = false;
  }
  if (toastQ.length && now >= toastUntil) {
    toastEl.hidden = false;
    toastEl.textContent = toastQ.shift();
    toastEl.classList.remove("show");
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    toastUntil = now + 1700;
  } else if (!toastQ.length && toastUntil && now > toastUntil + 200) {
    toastEl.hidden = true;
    toastUntil = 0;
  }
  if (combo > 1 && now < comboUntil) {
    comboEl.hidden = false;
    comboEl.textContent = "×" + combo;
  } else if (comboEl.textContent) {
    comboEl.hidden = true;
  }
  const shown = Math.max(0, Math.floor(scoreNow(player)), serverScore | 0);
  if (scoreEl.textContent !== String(shown)) {
    scoreEl.textContent = String(shown);
    scoreEl.classList.remove("pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("pop");
    lastShown = String(shown);
  }
  if (showStats && frameN % 20 === 0) paintStats();
  if (benchMode && frameN === 180) finishBench();
  requestAnimationFrame(frame);
}

function scanNear(nowMs) {
  const x = player[0];
  const y = player[1];
  const lane = bodyLane(player);
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    const k = q[0];
    if (k !== 3 && k !== 7) continue;
    const end = q[1] + q[2];
    if (x < end - 0.05 || x > end + 0.35) continue;
    const key = q[1].toFixed(2) + ":" + k + ":" + (q[5] ?? -1);
    if (nearSeen.has(key)) continue;
    const pl = q.length > 5 ? q[5] : -1;
    const skimPot = k === 7 && pl >= 0 && Math.abs(pl - lane) === 1;
    const skimHurdle = k === 3 && (pl < 0 || pl === lane) && y > q[3] && y < q[3] + 0.55;
    if (skimPot || skimHurdle) {
      nearSeen.add(key);
      if (nearSeen.size > 80) nearSeen.clear();
      void nowMs;
      return true;
    }
  }
  return false;
}

function paintStats() {
  const n = Math.min(frameN, frames.length);
  const copy = Array.from(frames.subarray(0, n)).sort((a, b) => a - b);
  const p = (q) => copy[Math.min(n - 1, Math.floor(q * (n - 1)))] || 0;
  statsEl.hidden = false;
  statsEl.textContent = `${(1000 / (p(0.5) || 16)).toFixed(0)} fps  p50 ${p(0.5).toFixed(2)} ms  p95 ${p(0.95).toFixed(2)} ms  input ${latency.toFixed(1)} ms  lane ${bodyLane(player)}`;
}

function finishBench() {
  const n = Math.min(frameN, frames.length);
  const copy = Array.from(frames.subarray(0, n)).sort((a, b) => a - b);
  const p = (q) => copy[Math.min(n - 1, Math.floor(q * (n - 1)))] || 0;
  benchEl.hidden = false;
  benchEl.textContent = JSON.stringify({
    frames: n, p50: p(0.5), p95: p(0.95), hz: 1000 / (p(0.5) || 16),
  });
}

motionBtn.setAttribute("aria-pressed", reduced ? "true" : "false");
motionBtn.addEventListener("click", () => {
  reduced = !reduced;
  localStorage.setItem("lumen-motion", reduced ? "reduce" : "full");
  motionBtn.setAttribute("aria-pressed", reduced ? "true" : "false");
});
muteBtn.addEventListener("click", () => {
  const next = !audio.muted;
  audio.setMuted(next);
  muteBtn.setAttribute("aria-pressed", next ? "true" : "false");
});
modelBtn.addEventListener("click", () => {
  if (!connected || !ws || ws.readyState !== 1 || providers.length < 2) return;
  const ix = providers.indexOf(provider);
  const next = providers[(ix + 1) % providers.length];
  ws.send(JSON.stringify({ op: "provider", name: next }));
});
badgeEl.addEventListener("click", () => {
  const open = notesEl.hidden;
  notesEl.hidden = !open;
  badgeEl.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) paintNotes();
});
window.addEventListener("keydown", (e) => {
  if (e.key === "F3") {
    showStats = !showStats;
    statsEl.hidden = !showStats;
  }
});

if (renderer) renderer.resize();
window.addEventListener("resize", () => renderer && renderer.resize());
connect();
requestAnimationFrame(frame);
