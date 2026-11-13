import { DT, bodyLane, makePlayer, pressJump, pressLane, pressSlide, rulesOf, scoreNow, step } from "./sim.mjs";
import { createRenderer } from "./render.mjs";
import { createInput } from "./input.mjs";
import { createAudio } from "./audio.mjs";

const canvas = document.getElementById("view");
const scoreEl = document.getElementById("score");
const replayEl = document.getElementById("replay");
const deadEl = document.getElementById("dead");
const statsEl = document.getElementById("stats");
const motionBtn = document.getElementById("motion");
const muteBtn = document.getElementById("mute");
const benchEl = document.getElementById("bench");
const hintEl = document.getElementById("hint");
const toastEl = document.getElementById("toast");
const comboEl = document.getElementById("combo");
const badgeEl = document.getElementById("badge");
const notesEl = document.getElementById("notes");
const noteList = document.getElementById("note-list");

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
if (localStorage.getItem("lumen-hint") === "off") hintEl.hidden = true;
let ws;
let connected = false;

function num(v, fallback) {
  return typeof v === "number" ? v : fallback;
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

function showCue(text) {
  if (!text) return;
  toastQ.push(text);
}

function remember(msg) {
  const cue = msg.cue || "";
  if (!cue) return;
  gardenNotes.unshift({ cue, why: msg.why || "" });
  if (gardenNotes.length > 6) gardenNotes.pop();
  if (!notesEl.hidden) paintNotes();
  showCue(cue);
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
  deadEl.hidden = true;
}

function reconcile(st) {
  if (typeof st.g === "number") applyRules(st);
  serverScore = st.score;
  if (!st.alive && alive) {
    alive = false;
    player[5] = 0;
    audio.die();
    deadEl.hidden = false;
    replayEl.textContent = "LUMEN-" + Math.floor(seed);
  }
  if (st.alive && alive) {
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
    const seedParam = params.get("seed");
    ws.send(JSON.stringify({ op: "hello", seed: seedParam ? Number(seedParam) : 42 }));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.op === "welcome") {
      resetLocal();
      seed = msg.seed;
      applyRules(msg);
      replayEl.textContent = msg.replay;
    } else if (msg.op === "rules") {
      applyRules(msg);
    } else if (msg.op === "chunk") {
      addChunk(msg);
    } else if (msg.op === "state") {
      reconcile(msg);
    } else if (msg.op === "decision") {
      remember(msg);
      if (msg.kind === "KEEP" && msg.arm === "motif") audio.keep();
      if (msg.kind === "ROLLBACK") rejectSpark = true;
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

function frame(now) {
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  frames[frameN % frames.length] = dt * 1000;
  frameN++;
  const inp = input.consume();
  if (inp.jump || inp.slide || inp.lane) {
    audio.unlock();
    inputAt = now;
    if (!hintEl.hidden) {
      hintEl.hidden = true;
      localStorage.setItem("lumen-hint", "off");
    }
  }
  if (!alive && (inp.jump || inp.restart || inp.slide)) restart();
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
      if (wasY > 0.2 && player[1] <= 0.001 && player[5] > 0) audio.land();
      if (scanNear(now)) { nearSpark = true; audio.near(); }
      if (ev === "dead" || player[5] <= 0) {
        alive = false;
        audio.die();
        deadEl.hidden = false;
        replayEl.textContent = "LUMEN-" + Math.floor(seed);
      }
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
  audio.music(reduced);
  if (renderer) {
    renderer.resize();
    renderer.frame({
      x: player[0], y: player[1], vy: player[2], lx: player[10],
      slide: player[3], hue, time: now / 1000, now, reduced, pieces,
      event: spark, alive, speed: rules.speed, g: rules.g,
      near: nearSpark, reject: rejectSpark,
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
deadEl.addEventListener("click", restart);
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
