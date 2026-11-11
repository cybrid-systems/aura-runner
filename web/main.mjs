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
if (localStorage.getItem("lumen-hint") === "off") hintEl.hidden = true;
let ws;
let connected = false;

function applyRules(msg) {
  rules = rulesOf(msg.g, msg.jump, msg.speed, msg.slide, msg.coyote, msg.forgive);
  if (typeof msg.hue === "number") hue = msg.hue;
}

function addChunk(msg) {
  if (seenChunks.has(msg.id)) return;
  seenChunks.add(msg.id);
  for (const q of msg.pieces) pieces.push(q.slice());
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
  deadEl.hidden = true;
}

function reconcile(st) {
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
    } else if (msg.op === "decision" && msg.kind === "KEEP" && msg.arm === "motif") {
      audio.keep();
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
      const ev = step(player, pieces, rules, DT);
      if (inputAt && before <= 0 && player[2] > 0) {
        latency = now - inputAt;
        inputAt = 0;
      }
      if (ev === "coin") { audio.coin(); spark = "coin"; }
      if (ev === "spring") { audio.spring(); spark = "spring"; }
      if (inp.lane) spark = "lane";
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
      slide: player[3], hue, time: now / 1000, reduced, pieces, event: spark,
    });
    spark = "";
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
