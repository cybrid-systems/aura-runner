import { DT, bodyLane, makePlayer, praiseClear, pressJump, pressLane, pressSlide, rulesOf, step } from "./sim.mjs";
import { awardPickup, challengeFor, challengeMet, dropGrade, gradeLabel, lootWorth, nearMiss, overtake, praise, skimmed, trackOvertake } from "./score.mjs";
import { clampMult } from "./runstate.mjs";
import { COMBO_HEART, HEART_IFRAME, HEARTS_MAX, heartsBlank, heartsHit, heartsRecover, heartsTick } from "./hearts.mjs";
import { raceGate, raceRead } from "./race.mjs";
import { acceptSpec, createRenderer } from "./render.mjs";
import { createFallback } from "./fallback.mjs";
import { readQualityMode, writeQualityMode } from "./quality.mjs";
import { createInput } from "./input.mjs";
import { createAudio } from "./audio.mjs";
import { volumeFromStore } from "./music.mjs";
import { installWish } from "./wish.mjs";
import { validThing } from "./thing.mjs";
import { installThingHud } from "./thinghud.mjs";
import { adoptDecision, loadWorld, paintWorld, saveWorld } from "./world.mjs";

const canvas = document.getElementById("view");
const scoreEl = document.getElementById("score");
const gradeEl = document.getElementById("grade");
const paceEl = document.getElementById("pace");
const goalEl = document.getElementById("goal");
const goalFill = document.getElementById("goal-fill");
const replayEl = document.getElementById("replay");
const statsEl = document.getElementById("stats");
const motionBtn = document.getElementById("motion");
const muteBtn = document.getElementById("mute");
const benchEl = document.getElementById("bench");
const saidEl = document.getElementById("said");
const toastEl = document.getElementById("toast");
const flashEl = document.getElementById("flash");
const comboEl = document.getElementById("combo");
const multEl = document.getElementById("mult");
const evoEl = document.getElementById("evo");
const gainEl = document.getElementById("gain");
const meterEl = document.getElementById("meter");
const meterFill = document.getElementById("meter-fill");
const badgeEl = document.getElementById("badge");
const notesEl = document.getElementById("notes");
const noteList = document.getElementById("note-list");
const modelBtn = document.getElementById("model");
const markEl = document.getElementById("mark");
const wardEl = document.getElementById("ward");
const recordEl = document.getElementById("record");
const challengeEl = document.getElementById("challenge");
const againBtn = document.getElementById("again");
const heartsEl = document.getElementById("hearts");
const raceEl = document.getElementById("race");
const overEl = document.getElementById("over");
const overScoreEl = document.getElementById("over-score");
const overLevelEl = document.getElementById("over-level");
const overMultEl = document.getElementById("over-mult");
const overRaceEl = document.getElementById("over-race");
const overBestEl = document.getElementById("over-best");
const playAgainBtn = document.getElementById("play-again");

const params = new URLSearchParams(location.search);
const reducedPref = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let reduced = localStorage.getItem("lumen-motion") === "reduce" || (localStorage.getItem("lumen-motion") !== "full" && reducedPref);
let showStats = params.has("stats");
const benchMode = params.has("bench");

const gpuNote = document.getElementById("nogpu");
const bootEl = document.getElementById("boot");
const bootStep = document.getElementById("boot-step");
const bootBar = document.getElementById("boot-bar");
const renderer = createRenderer(canvas, {
  onStatus(ev) {
    if (!gpuNote) return;
    if (ev.type === "restored") {
      gpuNote.hidden = true;
      return;
    }
    if (ev.type === "lost" || ev.type === "failed" || ev.type === "fallback") {
      gpuNote.hidden = false;
      gpuNote.textContent = ev.message || "The picture was interrupted. Bringing it back…";
    }
  },
}) || createFallback(canvas);
const input = createInput(canvas);
const audio = createAudio();
if (!renderer || renderer.kind === "canvas2d") {
  if (gpuNote) {
    gpuNote.hidden = false;
    gpuNote.textContent = "This browser has no WebGL2. The garden is drawn flat so the run can continue.";
  }
}

const player = makePlayer(1.2);
let rules = rulesOf(32, 11.2, 8, 0.48, 0.12, 0.12);
const paceParam = Number(params.get("pace"));
if (paceParam >= 6 && paceParam <= 16) {
  rules = rulesOf(rules.g, rules.jump, paceParam, rules.slide, rules.coyote, rules.forgive);
}
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
  { kind: "van", name: "nori", r: 0.98, g: 0.78, b: 0.32, motion: "pace", plan: "van" },
  { kind: "racer", name: "vroom", r: 0.96, g: 0.45, b: 0.32, motion: "follow", plan: "racer" },
];
let hero = { kind: "keeper", plan: "keeper", r: 0.95, g: 0.72, b: 0.45 };
let bend = 0.38;
let loot = "coin";
let levelN = 1;
let runMult = 1;
let biomeName = "garden";
let biomeSpec = null;
let moodName = "day";
let bannerId = 0;
let bannerUntil = 0;
let levelGoal = 0;
let props = [];
let sunHide = false;
let shownToys = [];
let levelStart = 0;
let formN = 0;
const WARD_WAIT = 9;
let wardReady = true;
let wardLeft = 0;
const RECORD_KEY = "lumen-record";
const LOOTS = new Set(["coin", "star", "gem", "blossom", "apple"]);
let provider = "";
let modelName = "";
let providers = [];
let stumble = 0;
let lastCue = "";
let lastCueAt = 0;
let alive = true;
let seed = 1;
let seenChunks = new Set();
const frames = new Float32Array(240);
let frameN = 0;
let lastNow = performance.now();
let lastPump = performance.now();
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
let musicHit = false;
let musicShield = false;
let evoCue = "";
let rejectSpark = false;
let combo = 0;
let comboUntil = 0;
let grade = 1;
let gradeBank = 0;
let gainText = "";
let gainUntil = 0;
let comboText = "";
let feltSpeed = 8;
let skillBank = 0;
let levelMaxCombo = 0;
let levelNear = 0;
let levelOvertakes = 0;
let levelBumps = 0;
let challengeDone = false;
let rewardUntil = 0;
let hearts = heartsBlank();
let heartsShown = -1;
let hurtUntil = 0;
let runOver = false;
let runBestCombo = 1;
let levelComboHeart = false;
let playerWins = 0;
let rivalWins = 0;
let winStreak = 0;
let lastPlace = 0;
let duel = "";
let poseHold = false;
let bestAtStart = { points: 0, level: 1, combo: 0 };
const nearSeen = new Set();
const toastQ = [];
let toastUntil = 0;
const gardenNotes = [];
let worldline = loadWorld(localStorage);
const saidRows = [];
let ws;
let connected = false;
const thingHud = installThingHud();
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
  // An empty Aura list is JSON null. Leave the roster alone when the key is absent.
  if (msg.pals === null) {
    pals = [];
    return;
  }
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

// Same bodies drawBody knows, and the same kinds plan-of keeps.
const HERO_PLANS = new Set([
  "keeper", "kitten", "car", "van", "racer", "taxi", "wagon",
  "bunny", "bird", "butterfly", "frog", "duck",
  "puppy", "fox", "turtle", "bee", "friend",
]);

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

function applyProps(msg) {
  // An empty Aura list is JSON null. A missing key does not clear the sky.
  if (msg.props === null) props = [];
  else if (Array.isArray(msg.props)) {
    const next = [];
    for (const name of msg.props) {
      if ((name === "sun" || name === "moon" || name === "plane") && !next.includes(name)) next.push(name);
      if (next.length >= 3) break;
    }
    props = next;
  }
  if (typeof msg["sun-hide"] === "boolean") sunHide = msg["sun-hide"];
}

function applyShown(msg) {
  if (msg.shown === null) {
    shownToys = [];
    return;
  }
  if (!Array.isArray(msg.shown)) return;
  const next = [];
  for (const raw of msg.shown) {
    const t = validThing(raw);
    if (t) next.push(t);
    if (next.length >= 4) break;
  }
  shownToys = next;
}

function applyLook(msg) {
  if (typeof msg.bend === "number" && msg.bend >= 0.05 && msg.bend <= 0.75) bend = msg.bend;
  if (typeof msg.loot === "string" && LOOTS.has(msg.loot)) loot = msg.loot;
  const named = lootWorth(loot);
  rules.worth = typeof msg.worth === "number" && msg.worth > 0 ? msg.worth : named;
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
  rules.air = num(msg.air, rules.air || 0);
  rules.magnet = num(msg.magnet, rules.magnet || 0);
  if (typeof msg.hue === "number") hue = msg.hue;
  applyScene(msg);
  applyLook(msg);
  applyPals(msg);
  applyHero(msg);
  applyProvider(msg);
  applyLevel(msg);
  applyProps(msg);
  applyShown(msg);
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

function requestRewind(node) {
  if (!node || node.kind !== "KEEP" || !node.snap) return;
  if (!connected || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ op: "rewind", id: node.id, kind: "KEEP", snap: node.snap }));
}

function paintNotes() {
  paintWorld(noteList, worldline, requestRewind);
}

function trialLabel(kind) {
  if (kind === "ROLLBACK") return "evo trial ROLLBACK";
  if (kind === "KEEP") return "evo trial KEEP";
  return "";
}

function showSaid(text, kind) {
  const clean = String(text || "").trim();
  if (!clean || !saidEl) return;
  if (saidRows[0] === clean) return;
  saidRows.unshift(clean);
  if (saidRows.length > 6) saidRows.pop();
  const body = document.getElementById("said-body");
  const kicker = document.getElementById("said-kicker");
  if (body) body.textContent = clean;
  else saidEl.textContent = clean;
  if (kicker) kicker.textContent = trialLabel(kind);
  saidEl.dataset.verdict = kind === "ROLLBACK" ? "ROLLBACK" : kind === "KEEP" ? "KEEP" : "";
  saidEl.hidden = false;
}

function showCue(text) {
  if (!text) return;
  const now = performance.now();
  if (text === lastCue && now - lastCueAt < 1200) return;
  lastCue = text;
  lastCueAt = now;
  toastQ.push(text);
}

function showMark(word, kind) {
  const clean = String(word).toLowerCase().replace(/[^a-z]/g, "").slice(0, 12);
  if (!clean || !markEl) return;
  const wordEl = document.getElementById("mark-word");
  const kicker = document.getElementById("mark-kicker");
  if (wordEl) wordEl.textContent = clean;
  else markEl.textContent = clean;
  if (kicker) kicker.textContent = trialLabel(kind);
  markEl.dataset.verdict = kind === "ROLLBACK" ? "ROLLBACK" : "KEEP";
  markEl.hidden = false;
  markEl.animate(
    [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }],
    { duration: 180, easing: "ease-out", fill: "both" },
  );
}

function remember(msg) {
  // The server's stumble is a late sim. The picture toasts only when
  // the body on screen meets a hole or an obstacle.
  if (msg.kind === "BUMP") return;
  const cue = msg.cue || "";
  if (!cue) return;
  gardenNotes.unshift({ cue, why: msg.why || "", ask: msg.ask || "" });
  if (gardenNotes.length > 6) gardenNotes.pop();
  if (!notesEl.hidden) paintNotes();
  // The corner keeps the model's sentence. A dream's canned line and
  // the stumble toasts stay off that line.
  const verdict = msg.kind === "ROLLBACK" || msg.kind === "KEEP" ? msg.kind : "";
  if (msg.ask) showSaid(cue, verdict);
  if (msg.mark) showMark(msg.mark, verdict);
  else showCue(cue);
}

// A chunk may carry a generated thing. It is checked here once; a thing
// this page cannot draw is reported so the core puts the previous one back.
let thingChunks = [];
const thingSeen = new Map();
function chunkThing(raw) {
  if (!raw) return null;
  const key = raw.id;
  if (thingSeen.has(key)) return thingSeen.get(key);
  const t = validThing(raw);
  thingSeen.set(key, t);
  if (thingSeen.size > 16) thingSeen.delete(thingSeen.keys().next().value);
  if (!t && connected && ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ op: "thing-bad", gen: key }));
  }
  return t;
}

function addChunk(msg) {
  if (typeof msg.x1 === "number" && msg.x1 > roadEnd) roadEnd = msg.x1;
  if (seenChunks.has(msg.id)) return;
  seenChunks.add(msg.id);
  const born = msg.origin === "motif" ? performance.now() : 0;
  const thing = chunkThing(msg.thing);
  if (thing) {
    thingChunks.push({ id: msg.id, x0: msg.x0, x1: msg.x1, thing });
    if (thingChunks.length > 12) thingChunks.shift();
  }
  for (const q of msg.pieces) {
    const copy = q.slice();
    if (born) copy.born = born;
    if (thing) copy.thing = thing;
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

// Last server run clock, in ms. A stall leaves it where it was. reset-run!
// and a fresh process put it back near zero.
let serverRun = -1;
// Far end of the road the server has actually sent. The picture must not
// run past it: a stalled tick used to leave the runner in empty air.
let roadEnd = 0;

function resetLocal() {
  const p = makePlayer(1.2);
  player.set(p);
  pieces = [];
  seenChunks = new Set();
  roadEnd = 0;
  thingChunks = [];
  alive = true;
  acc = 0;
  combo = 0;
  comboUntil = 0;
  grade = 1;
  gradeBank = 0;
  gainText = "";
  gainUntil = 0;
  comboText = "";
  skillBank = 0;
  levelMaxCombo = 0;
  levelNear = 0;
  levelOvertakes = 0;
  levelBumps = 0;
  challengeDone = false;
  rewardUntil = 0;
  hearts = heartsBlank();
  heartsShown = -1;
  musicHit = false;
  musicShield = false;
  audio.resetTune();
  hurtUntil = 0;
  runOver = false;
  runBestCombo = 1;
  levelComboHeart = false;
  playerWins = 0;
  rivalWins = 0;
  winStreak = 0;
  lastPlace = 0;
  duel = "";
  if (overEl) overEl.hidden = true;
  document.documentElement.dataset.reward = "0";
  if (wardEl) wardEl.classList.remove("boost");
  runMult = 1;
  biomeName = params.get("venue") && VENUES.has(params.get("venue")) ? params.get("venue") : "garden";
  biomeSpec = null;
  moodName = params.get("mood") && MOODS.has(params.get("mood")) ? params.get("mood") : "day";
  bannerId = 0;
  bannerUntil = 0;
  if (multEl) multEl.textContent = "×1";
  if (evoEl) {
    evoEl.hidden = true;
    evoEl.textContent = "";
    evoEl.classList.remove("show");
  }
  feltSpeed = rules.speed;
  comboEl.hidden = true;
  comboEl.classList.remove("hot");
  if (gainEl) gainEl.hidden = true;
  if (gradeEl) gradeEl.textContent = gradeLabel(1);
  if (paceEl) paceEl.textContent = "Level 1 · Speed 8";
  levelN = 1;
  levelGoal = 0;
  levelStart = 0;
  formN = 0;
  props = [];
  sunHide = false;
  shownToys = [];
  wardReady = true;
  wardLeft = 0;
  if (goalFill) goalFill.style.width = "0%";
  paintMeter();
  nearSeen.clear();
  stumble = 0;
  flashEl.hidden = true;
  flashEl.classList.remove("on");
  serverRun = -1;
}

function reconcile(st) {
  if (typeof st.g === "number") applyRules(st);
  alive = true;
  player[5] = 1;
  // lead > 0 means the prediction is ahead of this pose. A slow tick or a
  // stalled server is behind on the same run; yanking the body back there
  // rewinds the road, because the view is drawn from arc length. Leave the
  // prediction alone and let the server catch up. Pieces stay on the arc
  // the body is already on, so a later pose that has caught up does not
  // have to teleport anyone. A pose more than 12 m ahead is a real split:
  // snap forward so the body meets the obstacles that are actually there.
  // A new run rewinds the server clock (reset-run!, restart, a process
  // that is back at the opening). That one still snaps to the start.
  if (st.over === true && !runOver) settleOver();
  if (!runOver && st.alive !== false && typeof st.x === "number") {
    const lead = player[0] - st.x;
    const run = typeof st.run === "number" ? st.run : null;
    const restarted = run !== null && serverRun >= 0 && run + 800 < serverRun;
    if (lead < -12 || (lead > 12 && restarted)) player[0] = st.x;
    if (run !== null && (serverRun < 0 || restarted || run >= serverRun)) serverRun = run;
  }
  if (typeof st.hue === "number") hue = st.hue;
  applyLevel(st);
}

function grantReward(ch) {
  challengeDone = true;
  record.crests = (record.crests | 0) + 1;
  wardReady = true;
  wardLeft = 0;
  rewardUntil = performance.now() + 6500;
  document.documentElement.dataset.reward = "1";
  if (wardEl) wardEl.classList.add("boost");
  showCue(ch.text + " · Shield bright");
  showGain("Trail lit", true);
  writeRecord();
  paintRecord();
}

function maybeClearChallenge() {
  if (challengeDone) return;
  const ch = challengeFor(levelN);
  if (ch.id === "clean") return;
  if (!challengeMet(ch.id, { bumps: levelBumps, combo: levelMaxCombo, overtakes: levelOvertakes })) return;
  grantReward(ch);
  paintChallenge();
}

function noteRace(goal) {
  const q = nearestRival();
  const race = q ? raceGate(player[0], q[1] + q[2] * 0.5, goal) : "";
  if (race === "player") {
    playerWins += 1;
    winStreak = winStreak > 0 ? winStreak + 1 : 1;
    record.playerWins = (record.playerWins | 0) + 1;
  } else if (race === "rival") {
    rivalWins += 1;
    winStreak = winStreak < 0 ? winStreak - 1 : -1;
    record.rivalWins = (record.rivalWins | 0) + 1;
  }
  if (winStreak > (record.bestStreak | 0)) record.bestStreak = winStreak;
  lastPlace = 0;
}

function onLevelChange(prev, goal) {
  const ch = challengeFor(prev);
  noteRace(goal);
  if (levelBumps === 0) {
    record.cleanRuns = (record.cleanRuns | 0) + 1;
    const healed = heartsRecover(hearts, "clean");
    if (healed.recovered) {
      hearts = healed;
      pulseHearts();
      showCue("Heart back");
      audio.rise();
    }
  }
  if (levelMaxCombo > (record.bestCombo | 0)) record.bestCombo = levelMaxCombo;
  if (levelMaxCombo > runBestCombo) runBestCombo = levelMaxCombo;
  if (!challengeDone && ch.id === "clean" && challengeMet("clean", { bumps: 0 })) grantReward(ch);
  levelBumps = 0;
  levelMaxCombo = 0;
  levelNear = 0;
  levelOvertakes = 0;
  levelComboHeart = false;
  challengeDone = false;
  writeRecord();
  paintRecord();
}

function applyLevel(msg) {
  // A gate updates the level. The combo and the distance stay.
  const prev = levelN;
  const prevGoal = levelGoal;
  if (typeof msg.level === "number") levelN = msg.level;
  if (typeof msg.goal === "number") levelGoal = msg.goal;
  if (typeof msg.level0 === "number") levelStart = msg.level0;
  if (typeof msg.pace === "number") formN = Math.max(0, Math.min(4, Math.round(msg.pace)));
  if (typeof msg.level === "number" && levelN > prev && serverRun >= 0 && !runOver) onLevelChange(prev, prevGoal);
  noteCardGrants();
  paintChallenge();
}

const VENUES = new Set(["garden", "city", "space", "coast"]);
const MOODS = new Set(["day", "night", "sunset", "neon"]);

function showEvo(text) {
  if (!evoEl || !text) return;
  evoEl.hidden = false;
  evoEl.textContent = text;
  evoEl.classList.remove("show");
  void evoEl.offsetWidth;
  evoEl.classList.add("show");
  bannerUntil = performance.now() + 1700;
}

function applyVenue(msg) {
  if (typeof msg.mult === "number") runMult = clampMult(msg.mult);
  if ("spec" in msg) {
    if (msg.spec && typeof msg.spec === "object") {
      const next = acceptSpec(msg.spec);
      biomeSpec = next && next.recipe === "mix" ? next : null;
      if (biomeSpec) biomeName = biomeSpec.id;
    } else biomeSpec = null;
  }
  if (!biomeSpec && typeof msg.biome === "string" && VENUES.has(msg.biome)) biomeName = msg.biome;
  if (typeof msg.mood === "string" && MOODS.has(msg.mood)) moodName = msg.mood;
  const id = msg["banner-id"];
  if (typeof id === "number" && id !== bannerId && typeof msg.banner === "string" && msg.banner) {
    bannerId = id;
    showEvo(msg.banner);
  }
}

function clampInt(v, lo, hi, fallback) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function blankRecord() {
  return {
    level: 1, form: 0, points: 0, grade: 1, bank: 0, bestLevel: 1, bestPoints: 0,
    bestCombo: 0, cleanRuns: 0, crests: 0, mult: 1, biome: "garden", mood: "day",
    playerWins: 0, rivalWins: 0, bestStreak: 0,
  };
}

function sanitizeRecord(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return blankRecord();
  const level = clampInt(raw.level, 1, 40, 1);
  const form = clampInt(raw.form, 0, 4, 0);
  const points = clampInt(raw.points, 0, 500000, 0);
  const grade = clampInt(raw.grade, 1, 5, 1);
  const bank = clampInt(raw.bank, 0, 99, 0);
  const bestLevel = Math.max(clampInt(raw.bestLevel, 1, 40, 1), level);
  const bestPoints = Math.max(clampInt(raw.bestPoints, 0, 500000, 0), points);
  const bestCombo = clampInt(raw.bestCombo, 0, 99, 0);
  const cleanRuns = clampInt(raw.cleanRuns, 0, 9999, 0);
  const crests = clampInt(raw.crests, 0, 9999, 0);
  const mult = clampInt(raw.mult, 1, 8, Math.max(1, Math.min(8, level)));
  const biome = typeof raw.biome === "string" && VENUES.has(raw.biome) ? raw.biome : "garden";
  const mood = typeof raw.mood === "string" && MOODS.has(raw.mood) ? raw.mood : "day";
  const playerWinsN = clampInt(raw.playerWins, 0, 9999, 0);
  const rivalWinsN = clampInt(raw.rivalWins, 0, 9999, 0);
  const bestStreak = clampInt(raw.bestStreak, 0, 999, 0);
  return {
    level, form, points, grade, bank, bestLevel, bestPoints, bestCombo, cleanRuns, crests,
    mult, biome, mood, playerWins: playerWinsN, rivalWins: rivalWinsN, bestStreak,
  };
}

function readRecord() {
  try {
    return sanitizeRecord(JSON.parse(localStorage.getItem(RECORD_KEY) || "null"));
  } catch {
    return blankRecord();
  }
}

let record = readRecord();
let carry = null;
// Stale ticks from the run we just left must not write over a restart.
let freshRun = false;

function writeRecord() {
  if (!booted) return;
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(record));
  } catch {
    /* a private window can refuse the record */
  }
}

function gearTier() {
  if (record.bestLevel >= 3) return 3;
  if (record.bestLevel >= 2) return 2;
  return 1;
}

function noteGear(prev, next) {
  if (prev < 2 && next >= 2) showCue("A clasp on the cape");
  if (prev < 3 && next >= 3) showCue("A circlet");
}

function recordLine(rec) {
  let text = "Best L" + rec.bestLevel + " · " + rec.bestPoints;
  if (rec.bestCombo > 1) text += " · ×" + rec.bestCombo;
  if (rec.cleanRuns > 0) text += " · " + rec.cleanRuns + " clean";
  if (rec.crests > 0) text += " · crest " + rec.crests;
  if ((rec.playerWins | 0) + (rec.rivalWins | 0) > 0) {
    text += " · you " + (rec.playerWins | 0) + "–" + (rec.rivalWins | 0);
  }
  return text;
}

function paintRecord() {
  if (!recordEl) return;
  const show = record.bestLevel > 1 || record.bestPoints > 0 || record.bestCombo > 1
    || record.cleanRuns > 0 || record.crests > 0
    || (record.playerWins | 0) + (record.rivalWins | 0) > 0;
  recordEl.hidden = !show;
  recordEl.textContent = show ? recordLine(record) : "";
}

function paintChallenge() {
  if (!challengeEl) return;
  const ch = challengeFor(levelN);
  challengeEl.hidden = false;
  const missed = ch.id === "clean" && levelBumps > 0 && !challengeDone;
  challengeEl.classList.toggle("done", challengeDone);
  challengeEl.classList.toggle("miss", missed);
  challengeEl.textContent = (challengeDone ? "Done · " : missed ? "Miss · " : "Try · ") + ch.text;
}

function sameRecord(a, b) {
  return a.level === b.level && a.form === b.form && a.points === b.points
    && a.grade === b.grade && a.bank === b.bank
    && a.bestLevel === b.bestLevel && a.bestPoints === b.bestPoints
    && a.bestCombo === b.bestCombo && a.cleanRuns === b.cleanRuns && a.crests === b.crests
    && a.mult === b.mult && a.biome === b.biome && a.mood === b.mood
    && a.playerWins === b.playerWins && a.rivalWins === b.rivalWins && a.bestStreak === b.bestStreak;
}

function syncRecord() {
  if (!booted || freshRun) return;
  const points = Math.max(0, Math.floor(player[6]));
  const prevBest = record.bestLevel;
  const next = {
    level: clampInt(levelN, 1, 40, 1),
    form: clampInt(formN, 0, 4, 0),
    points,
    grade: clampInt(grade, 1, 5, 1),
    bank: clampInt(gradeBank, 0, 99, 0),
    bestLevel: Math.max(record.bestLevel, clampInt(levelN, 1, 40, 1)),
    bestPoints: Math.max(record.bestPoints, points),
    bestCombo: Math.max(record.bestCombo | 0, levelMaxCombo | 0),
    cleanRuns: record.cleanRuns | 0,
    crests: record.crests | 0,
    mult: clampInt(runMult, 1, 8, 1),
    biome: biomeName,
    mood: moodName,
    playerWins: record.playerWins | 0,
    rivalWins: record.rivalWins | 0,
    bestStreak: Math.max(record.bestStreak | 0, winStreak > 0 ? winStreak : 0),
  };
  if (sameRecord(record, next)) return;
  record = next;
  noteGear(prevBest, record.bestLevel);
  writeRecord();
  paintRecord();
}

function paintWard() {
  if (!wardEl) return;
  wardEl.textContent = "Shield";
  wardEl.classList.toggle("down", !wardReady);
}

function wardStep(ready, left, ev, dt) {
  if (ready && ev === "bump") return { ready: false, left: WARD_WAIT, held: true };
  if (ready) return { ready: true, left: 0, held: false };
  const left2 = Math.max(0, left - dt);
  return { ready: left2 <= 0, left: left2, held: false };
}

const CARD_KEY = "lumen-cards";
const CARD_INFO = { light: "轻轻的", double: "再跳一下", magnet: "吸过来" };
const CARD_ORDER = ["light", "double", "magnet"];
const cardsOpen = document.getElementById("cards-open");
const deckEl = document.getElementById("deck");
const cardBookEl = document.getElementById("card-book");
const cardShareEl = document.getElementById("card-share");
const cardsUse = document.getElementById("cards-use");
const cardsShare = document.getElementById("cards-share");

function loadCardBook() {
  const blank = { owned: new Set(), equipped: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(CARD_KEY) || "null");
    if (!raw || typeof raw !== "object") return blank;
    const owned = new Set((Array.isArray(raw.owned) ? raw.owned : []).filter((id) => CARD_INFO[id]));
    const equipped = CARD_ORDER.filter((id) => Array.isArray(raw.equipped) && raw.equipped.includes(id) && owned.has(id));
    return { owned, equipped };
  } catch {
    return blank;
  }
}

function saveCardBook() {
  localStorage.setItem(CARD_KEY, JSON.stringify({
    owned: CARD_ORDER.filter((id) => cardBook.owned.has(id)),
    equipped: cardBook.equipped,
  }));
}

function applyServerDeck(ids) {
  const next = CARD_ORDER.filter((id) => ids.includes(id));
  for (const id of next) cardBook.owned.add(id);
  cardBook.equipped = next;
  cardPick = next.slice();
  saveCardBook();
  paintCards();
}

let cardBook = loadCardBook();
const queriedCards = (params.get("cards") || "")
  .split(",")
  .map((s) => s.split(".")[0])
  .filter((id) => CARD_INFO[id])
  .slice(0, 3);
if (queriedCards.length) {
  for (const id of queriedCards) cardBook.owned.add(id);
  cardBook.equipped = CARD_ORDER.filter((id) => queriedCards.includes(id));
  saveCardBook();
}
let cardPick = cardBook.equipped.slice();

function grantCard(id) {
  if (!CARD_INFO[id] || cardBook.owned.has(id)) return;
  cardBook.owned.add(id);
  saveCardBook();
  paintCards();
  showCue(CARD_INFO[id]);
}

function noteCardGrants() {
}

function sendDeck(ids) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ op: "cards", action: "equip", ids }));
}

const primerEl = document.getElementById("primer");
const primerText = document.getElementById("primer-text");
const primerTry = document.getElementById("primer-try");
let primerCard = "";
let primerBusy = false;

function primerLine(id) {
  const n = (v) => Number(v || 0).toFixed(1);
  if (id === "light") return `(define (rule-gravity) ${n(rules.g)})`;
  if (id === "double") return `(define (rule-double-jump) ${n(rules.air)})`;
  if (id === "magnet") return `(define (rule-magnet) ${n(rules.magnet)})`;
  return "";
}

function endPrimerWait() {
  primerBusy = false;
  if (primerTry) {
    primerTry.disabled = false;
    primerTry.textContent = "试一下";
  }
  if (primerCard && primerText && primerEl && !primerEl.hidden) primerText.value = primerLine(primerCard);
}

function openPrimer(id) {
  if (!primerEl) return;
  if (primerCard === id && !primerEl.hidden) {
    primerEl.hidden = true;
    primerCard = "";
    paintCards();
    return;
  }
  primerCard = id;
  primerEl.hidden = false;
  if (primerText) primerText.value = primerLine(id);
  paintCards();
}

function paintCards() {
  if (!cardBookEl) return;
  cardBookEl.replaceChildren();
  for (const id of CARD_ORDER) {
    const row = document.createElement("div");
    row.className = "card-row";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card" + (cardPick.includes(id) ? " on" : "");
    btn.textContent = CARD_INFO[id];
    btn.disabled = !cardBook.owned.has(id);
    btn.setAttribute("aria-pressed", cardPick.includes(id) ? "true" : "false");
    btn.addEventListener("click", () => {
      if (!cardBook.owned.has(id)) return;
      if (cardPick.includes(id)) cardPick = cardPick.filter((x) => x !== id);
      else if (cardPick.length < 3) cardPick = CARD_ORDER.filter((x) => x === id || cardPick.includes(x));
      paintCards();
    });
    row.appendChild(btn);
    if (cardBook.owned.has(id)) {
      const adv = document.createElement("button");
      adv.type = "button";
      adv.className = "primer-open" + (primerCard === id && primerEl && !primerEl.hidden ? " on" : "");
      adv.textContent = "进阶";
      adv.setAttribute("aria-expanded", primerCard === id && primerEl && !primerEl.hidden ? "true" : "false");
      adv.addEventListener("click", () => openPrimer(id));
      row.appendChild(adv);
    }
    cardBookEl.appendChild(row);
  }
  if (cardsOpen) cardsOpen.textContent = cardBook.equipped.length ? `cards ${cardBook.equipped.length}` : "cards";
}

function applyCardDecision(msg) {
  if (msg.kind === "KEEP") {
    cardBook.equipped = CARD_ORDER.filter((id) => cardPick.includes(id));
    saveCardBook();
  } else if (msg.kind === "ROLLBACK") {
    cardPick = cardBook.equipped.slice();
  }
  paintCards();
}

function shareText() {
  const ids = cardBook.equipped.map((id) => `${id}.1`).join(",");
  return `${location.origin}${location.pathname}?seed=${seed}&cards=${ids}`;
}

function paintBoot(text) {
  if (!bootEl || bootEl.hidden || !text) return;
  const cut = text.indexOf(" ");
  const pct = cut > 0 ? Number(text.slice(0, cut)) : NaN;
  const label = cut > 0 ? text.slice(cut + 1).trim() : text.trim();
  if (Number.isFinite(pct) && bootBar) bootBar.style.width = Math.min(96, pct) + "%";
  if (label && bootStep) bootStep.textContent = label;
}

function pollBoot() {
  if (!bootEl || bootEl.hidden) return;
  fetch("/boot", { cache: "no-store" })
    .then((r) => (r.status === 200 ? r.text() : ""))
    .then((text) => paintBoot(text))
    .catch(() => {})
    .finally(() => {
      if (bootEl && !bootEl.hidden) setTimeout(pollBoot, 150);
    });
}

function hideBoot() {
  if (!bootEl || bootEl.hidden) return;
  if (bootBar) bootBar.style.width = "100%";
  if (bootStep) bootStep.textContent = "可以跑了";
  setTimeout(() => {
    if (bootEl) bootEl.hidden = true;
  }, 160);
}

pollBoot();

function connect() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => {
    connected = true;
    paintBoot("70 正在铺路");
    if (booted) {
      // The local list has already been pruned. Ask the server for the
      // chunks it still has instead of inventing an empty road.
      pieces = [];
      seenChunks = new Set();
      roadEnd = 0;
      ws.send(JSON.stringify({ op: "resync" }));
    } else {
      const seedParam = params.get("seed");
      const hello = { op: "hello", seed: seedParam ? Number(seedParam) : 42 };
      if (record.level > 1 || record.form > 0 || record.points > 0) {
        hello.resume = {
          level: record.level,
          form: record.form,
          points: record.points,
          mult: record.mult,
          biome: record.biome,
          mood: record.mood,
        };
        carry = { grade: record.grade, bank: record.bank, level: record.level };
      }
      if (params.get("venue")) hello.venue = params.get("venue");
      if (params.get("mood")) hello.mood = params.get("mood");
      ws.send(JSON.stringify(hello));
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (freshRun && msg.op !== "welcome" && msg.op !== "resync") return;
    if (msg.op === "welcome") {
      hideBoot();
      freshRun = false;
      resetLocal();
      booted = true;
      seed = msg.seed;
      applyRules(msg);
      applyVenue(msg);
      if (msg.tune) audio.tuneHear(msg.tune);
      feltSpeed = rules.speed;
      if (typeof msg.points === "number" && msg.points >= 0) player[6] = msg.points;
      if (carry && typeof msg.level === "number" && msg.level === carry.level) {
        grade = carry.grade;
        gradeBank = carry.bank;
        if (gradeEl) gradeEl.textContent = gradeLabel(grade);
        paintMeter();
      }
      carry = null;
      replayEl.textContent = msg.replay;
      syncRecord();
      if (typeof msg.world === "string") {
        worldline = { ...worldline, tip: msg.world };
        saveWorld(localStorage, worldline);
      }
      if (!notesEl.hidden) paintNotes();
    } else if (msg.op === "resync") {
      freshRun = false;
      pieces = [];
      seenChunks = new Set();
      roadEnd = 0;
      booted = true;
    } else if (msg.op === "rules") {
      applyRules(msg);
      applyVenue(msg);
      if (msg.tune) audio.tuneHear(msg.tune);
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
      applyVenue(msg);
      window.__lumen = Object.assign(window.__lumen || {}, {
        chunks: msg.chunks,
        motif: msg.motif || (window.__lumen && window.__lumen.motif),
        scene: msg.scene || (window.__lumen && window.__lumen.scene),
        alive: true,
      });
    } else if (msg.op === "decision") {
      const next = adoptDecision(worldline, msg);
      if (next !== worldline) {
        worldline = next;
        saveWorld(localStorage, worldline);
      }
      remember(msg);
      if (msg.arm === "cards") applyCardDecision(msg);
      if (msg.arm === "tune") {
        if (msg.kind === "KEEP") audio.tuneKeep(msg.tune);
        else if (msg.kind === "ROLLBACK") audio.tuneRollback(msg.tune);
      }
      if (msg.arm === "rule") endPrimerWait();
      if (window.__lumenOnDecision) window.__lumenOnDecision(msg);
      if (msg.kind === "KEEP" && (msg.arm === "motif" || msg.arm === "scene" || msg.arm === "pals")) audio.keep();
      if (msg.kind === "ROLLBACK") rejectSpark = true;
      if ((msg.arm === "scene" || msg.arm === "pals") && (msg.kind === "KEEP" || msg.kind === "ROLLBACK")) {
        evoCue = msg.kind === "KEEP" ? "keep" : "rollback";
      }
    } else if (msg.op === "thing") {
      thingHud.show(msg);
    } else if (msg.op === "primer" && msg.status === "same") {
      endPrimerWait();
    } else if (msg.op === "err" && msg.why === "rewind") {
      showCue("Still this world");
    }
  };
  ws.onclose = () => {
    connected = false;
    if (bootEl && !bootEl.hidden && bootStep) bootStep.textContent = "还在启动";
    setTimeout(connect, 600);
  };
}

function sendTick(dtMs) {
  if (!connected || ws.readyState !== 1) return;
  const dt = Math.max(0, Math.min(200, Math.round(Number(dtMs) || 0)));
  ws.send(JSON.stringify({
    op: "tick",
    jump: jumpQ,
    slide: slideQ,
    lane: laneQ,
    skill: Math.max(0, Math.floor(skillBank)),
    combo: levelMaxCombo | 0,
    near: levelNear | 0,
    overtakes: levelOvertakes | 0,
    level: levelN | 0,
    hearts: runOver ? 0 : (hearts.hearts | 0),
    dt,
    x: Number.isFinite(player[0]) ? Math.round(player[0] * 10) / 10 : 0,
  }));
  jumpQ = 0;
  slideQ = 0;
  laneQ = 0;
}

// Headless Chrome pauses requestAnimationFrame while a test is only
// reading the page. The socket still has to move, and the probe has to
// publish, or a kept garden never shows up. A live frame updates
// lastPump; the test calls __lumenPump itself.
function pumpNet(now) {
  const dt = Math.min(0.1, Math.max(0.016, (now - lastPump) / 1000));
  lastPump = now;
  sendTick(dt * 1000);
  lerpScene(dt);
  publishProbe();
}

window.__lumenPump = () => pumpNet(performance.now());
window.__lumenQuality = () => (renderer && renderer.qualitySnapshot ? renderer.qualitySnapshot() : null);
window.__lumenSetQuality = (mode) => {
  if (renderer && renderer.setQualityMode) renderer.setQualityMode(mode);
  paintQuality();
  return window.__lumenQuality();
};
window.__lumenSetCombo = (n) => {
  combo = Math.max(0, n | 0);
  comboUntil = performance.now() + 8000;
  comboText = "×" + combo;
};

// One forced near-miss for a recording. side -1 or 1 picks the nudge
// direction. The cue is consumed on the next drawn frame unless hold is set.
window.__lumenForceNear = (opts) => {
  const cue = opts || {};
  window.__lumenForceNearCue = {
    side: cue.side < 0 ? -1 : 1,
    ahead: Number.isFinite(cue.ahead) ? cue.ahead : 1.4,
    hold: !!cue.hold,
  };
  return window.__lumenForceNearCue;
};

// Headless Chrome pauses animation frames. A few calls of the live frame
// keep the picture moving while a test is the only thing reading the page.
window.__lumenFrames = (n) => {
  const count = Math.max(0, Math.min(8, n | 0));
  let t = lastNow || performance.now();
  stepping = true;
  try {
    for (let i = 0; i < count; i++) {
      t += 1000 / 60;
      frame(t);
    }
  } finally {
    stepping = false;
  }
};

// Start the 180-frame bench window after the page is ready. Frames
// recorded while headless Chrome was still on the real clock are discarded.
window.__lumenBenchMark = () => {
  frameN = 0;
  frames.fill(0);
  lastNow = performance.now();
  if (benchEl) {
    benchEl.hidden = true;
    benchEl.textContent = "";
  }
};

// Real elapsed time for one drawn frame, without the vsync gap. Headless
// Chrome does not deliver animation frames, so the bench calls this.
window.__lumenTimeFrames = (n, sync) => {
  const count = Math.max(1, Math.min(60, n | 0));
  const samples = [];
  const pix = sync ? new Uint8Array(4) : null;
  stepping = true;
  try {
    for (let i = 0; i < count; i++) {
      const t0 = performance.now();
      frame(t0);
      if (renderer && renderer.gl) {
        if (pix) renderer.gl.readPixels(0, 0, 1, 1, renderer.gl.RGBA, renderer.gl.UNSIGNED_BYTE, pix);
        else renderer.gl.finish();
      }
      samples.push(performance.now() - t0);
    }
  } finally {
    stepping = false;
  }
  samples.sort((a, b) => a - b);
  const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * (samples.length - 1)))] || 0;
  const picture = renderer && renderer.timing ? renderer.timing() : {};
  return {
    n: samples.length,
    p50: at(0.5),
    p95: at(0.95),
    instances: Number(canvas.dataset.instances || 0),
    biome: canvas.dataset.biome || biomeName,
    tier: picture.tier || (canvas.dataset.tier || ""),
    work: picture.work,
    gpu: picture.gpu,
    gpuP50: picture.gpuP50,
    gpuP95: picture.gpuP95,
    gpuN: picture.gpuN,
    passes: picture.passes || {},
    gpuExt: picture.ext ? 1 : 0,
    fxaa: canvas.dataset.fxaa || "0",
    ao: canvas.dataset.ao || "0",
    grade: canvas.dataset.grade || "0",
    blur: canvas.dataset.blur || "0",
    hdr: canvas.dataset.hdr || "0",
  };
};

window.__lumenFramePeek = () => {
  const n = Math.min(frameN, frames.length);
  if (!n) return { n: 0 };
  const copy = Array.from(frames.subarray(0, n)).sort((a, b) => a - b);
  const at = (q) => copy[Math.min(n - 1, Math.floor(q * (n - 1)))] || 0;
  return {
    n,
    p50: at(0.5),
    p95: at(0.95),
    slow: copy.filter((v) => v > 22).length,
    head: copy.slice(0, 3),
    tail: copy.slice(-5),
  };
};

function restart() {
  freshRun = true;
  if (booted) {
    record = {
      level: 1,
      form: 0,
      points: 0,
      grade: 1,
      bank: 0,
      bestLevel: record.bestLevel,
      bestPoints: record.bestPoints,
      bestCombo: record.bestCombo | 0,
      cleanRuns: record.cleanRuns | 0,
      crests: record.crests | 0,
      mult: 1,
      biome: params.get("venue") && VENUES.has(params.get("venue")) ? params.get("venue") : "garden",
      mood: params.get("mood") && MOODS.has(params.get("mood")) ? params.get("mood") : "day",
      playerWins: record.playerWins | 0,
      rivalWins: record.rivalWins | 0,
      bestStreak: record.bestStreak | 0,
    };
    writeRecord();
    paintRecord();
  }
  carry = null;
  toastQ.length = 0;
  lastCue = "";
  toastUntil = 0;
  showCue("From the start");
  resetLocal();
  poseHold = false;
  snapshotBest();
  paintHearts();
  if (connected && ws && ws.readyState === 1) {
    const again = { op: "restart", seed };
    if (params.get("venue")) again.venue = params.get("venue");
    if (params.get("mood")) again.mood = params.get("mood");
    ws.send(JSON.stringify(again));
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
  root.dataset.points = String(Math.max(0, Math.floor(player[6])));
  root.dataset.grade = gradeLabel(grade).split(" ")[0];
  root.dataset.bank = String(gradeBank);
  root.dataset.speed = String(rules.speed);
  root.dataset.level = String(levelN);
  root.dataset.mult = String(runMult);
  root.dataset.combo = String(combo);
  root.dataset.biomeLabel = biomeSpec && biomeSpec.label ? biomeSpec.label : biomeName;
  root.dataset.biome = biomeName;
  root.dataset.mood = moodName;
  root.dataset.banner = evoEl && !evoEl.hidden ? evoEl.textContent : "";
  root.dataset.goal = Number.isFinite(levelGoal) ? levelGoal.toFixed(1) : "";
  root.dataset.props = props.join(",");
  root.dataset.sun = sunHide ? "off" : props.includes("sun") ? "on" : "soft";
  root.dataset.shown = shownToys.map((toy) => toy.name).join(",");
  root.dataset.ward = wardReady ? "1" : "0";
  root.dataset.gear = String(gearTier());
  root.dataset.best = String(record.bestLevel);
  root.dataset.bend = bend.toFixed(2);
  const markWord = document.getElementById("mark-word");
  const saidBody = document.getElementById("said-body");
  root.dataset.mark = markEl && !markEl.hidden ? (markWord ? markWord.textContent : markEl.textContent) : "";
  root.dataset.g = String(rules.g);
  root.dataset.air = String(rules.air || 0);
  root.dataset.magnet = String(rules.magnet || 0);
  root.dataset.cards = cardBook.equipped.join(",");
  root.dataset.owned = CARD_ORDER.filter((id) => cardBook.owned.has(id)).join(",");
  root.dataset.chat = saidRows.join(" | ");
  root.dataset.said = saidEl && !saidEl.hidden ? (saidBody ? saidBody.textContent : saidEl.textContent) : "";
  root.dataset.flyers = String(pieces.reduce((n, q) => n + (q[0] === 8 ? 1 : 0), 0));
  root.dataset.poppers = String(pieces.reduce((n, q) => n + (q[0] === 9 ? 1 : 0), 0));
  root.dataset.rivals = String(pieces.reduce((n, q) => n + (q[0] === 10 ? 1 : 0), 0));
  root.dataset.x = Number.isFinite(player[0]) ? player[0].toFixed(1) : "";
  let rivalAhead = "";
  let rivalLook = "";
  let rivalDist = 1e9;
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 10) continue;
    const d = q[1] - player[0];
    if (d > -6 && d < rivalDist) {
      rivalDist = d;
      rivalAhead = q[1].toFixed(1);
      rivalLook = String(Math.round(q.length > 6 ? q[6] : 0));
    }
  }
  root.dataset.rivalx = rivalAhead;
  root.dataset.rivallook = rivalLook;
  root.dataset.hearts = String(hearts.hearts | 0);
  root.dataset.over = runOver ? "1" : "0";
  root.dataset.place = raceEl && !raceEl.hidden ? raceEl.dataset.place || "" : "";
  root.dataset.gap = raceEl && !raceEl.hidden ? raceEl.textContent : "";
  root.dataset.wins = playerWins + "-" + rivalWins;
}

let stepping = false;

function frame(now) {
  if (!stepping) requestAnimationFrame(frame);
  // A backwards stamp (a stepped probe, a hidden tab) must not dig a
  // hole in the accumulator. That hole used to freeze the runner.
  const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
  lastNow = now;
  frames[frameN % frames.length] = dt * 1000;
  frameN++;
  if (renderer && frameN > 48 && frameN % 20 === 0) {
    renderer.noteFrameTime(frames, Math.min(frameN, frames.length));
  }
  const inp = input.consume();
  if (inp.jump || inp.slide || inp.lane) {
    audio.unlock();
    inputAt = now;
  }
  if (inp.restart) {
    audio.unlock();
    restart();
  } else if (alive && !runOver && !poseHold) {
    if (inp.jump) { pressJump(player); jumpQ = 1; audio.jump(); }
    if (inp.slide) { pressSlide(player); slideQ = 1; audio.slide(); }
    if (inp.lane) { pressLane(player, inp.lane); laneQ = inp.lane; }
    acc = Math.min(0.25, Math.max(0, acc + dt));
    let guard = 0;
    // Stay on the road that has been sent. Stepping past it draws an
    // empty track, and once past the end the picture would not come back.
    const roadStop = roadEnd > 24 ? roadEnd - 10 : Infinity;
    while (acc >= DT && guard < 4 && player[0] < roadStop) {
      const before = player[2];
      const wasY = player[1];
      const scoreBefore = player[6];
      hearts = heartsTick(hearts, DT);
      const ev0 = step(player, pieces, rules, DT);
      const wasWard = wardReady;
      const ward = wardStep(wardReady, wardLeft, ev0, DT);
      wardReady = ward.ready;
      wardLeft = ward.left;
      let ev = ev0;
      if (ward.held) {
        player[6] = scoreBefore;
        player[12] = 0;
        ev = "ok";
        showCue("Shield held");
        audio.ward();
        spark = "ward";
        musicShield = true;
      } else if (!wasWard && wardReady) {
        showCue("Shield ready");
      }
      if (inputAt && before <= 0 && player[2] > 0) {
        latency = now - inputAt;
        inputAt = 0;
      }
      if (ev === "coin") {
        audio.pickup(loot);
        spark = "coin";
        const worth = takeCoinWorth(pieces) || rules.worth;
        const got = awardPickup(worth, combo, comboUntil, now, grade, gradeBank, runMult);
        combo = got.combo;
        comboUntil = got.comboUntil;
        player[6] += got.extra;
        skillBank += got.extra;
        if (got.combo > levelMaxCombo) levelMaxCombo = got.combo;
        if (got.combo > runBestCombo) runBestCombo = got.combo;
        if (got.combo > (record.bestCombo | 0)) record.bestCombo = got.combo;
        if (got.combo >= COMBO_HEART && !levelComboHeart && !hearts.over) {
          levelComboHeart = true;
          const healed = heartsRecover(hearts, "combo");
          if (healed.recovered) {
            hearts = healed;
            pulseHearts();
            showCue("Heart back");
            audio.rise();
          }
        }
        const rose = got.grade > grade;
        grade = got.grade;
        gradeBank = got.bank;
        comboText = got.text;
        showGain(got.text, got.combo >= 3);
        if (rose) celebrateGrade();
      }
      if (!ward.held && ev !== "bump" && ev !== "oops" && scanPraise()) {
        paySkill(praise(grade, gradeBank, runMult), false);
        audio.nice();
        nearSpark = true;
      }
      if (ev === "spring") { audio.spring(); spark = "spring"; }
      if (ev === "bump" || ev === "oops") {
        stumble = 1500;
        player[5] = 1;
        showCue(ev === "oops" ? "Back on the path" : "Oops! Keep going");
        audio.near();
        musicHit = true;
        if (ev === "bump") {
          const next = heartsHit(hearts, false);
          const lost = next.heart;
          hearts = next;
          levelBumps += 1;
          grade = dropGrade(grade);
          gradeBank = 0;
          combo = 0;
          comboUntil = 0;
          paintChallenge();
          if (lost) hurtUntil = now + HEART_IFRAME * 1000;
          if (hearts.over) {
            acc = 0;
            settleOver();
            break;
          }
        }
      }
      if (wasY > 0.2 && player[1] <= 0.001 && player[5] > 0) audio.land();
      if (hearPoppers(pieces)) audio.pop();
      if (scanNear(now)) {
        paySkill(nearMiss(grade, gradeBank, runMult), false);
        levelNear += 1;
        nearSpark = true;
        audio.near();
      }
      const passes = scanOvertakes();
      for (let pass = 0; pass < passes; pass++) {
        paySkill(overtake(grade, gradeBank, runMult), false);
        levelOvertakes += 1;
        audio.nice();
      }
      maybeClearChallenge();
      player[5] = 1;
      acc -= DT;
      guard++;
    }
    prune();
  }
  sendAcc += dt;
  if (sendAcc >= 0.05) {
    const sent = sendAcc;
    sendAcc = 0;
    sendTick(sent * 1000);
    lastPump = now;
  }
  stumble = Math.max(0, stumble - dt * 1000);
  if (rewardUntil && now > rewardUntil) {
    rewardUntil = 0;
    document.documentElement.dataset.reward = "0";
    if (wardEl) wardEl.classList.remove("boost");
  }
  if (!flashEl.hidden) {
    flashEl.hidden = true;
    flashEl.classList.remove("on");
  }
  if (window.__forceSpec) {
    const forced = acceptSpec(window.__forceSpec);
    if (forced && forced.recipe === "mix") {
      biomeSpec = forced;
      biomeName = forced.id;
    }
  }
  lerpScene(dt);
  publishProbe();
  audio.follow({
    speed: rules.speed,
    level: levelN,
    reduced,
    combo,
    near: nearSpark,
    hit: musicHit,
    shield: musicShield,
  });
  musicHit = false;
  musicShield = false;
  audio.music(reduced);
  markRivalMoments();
  paintHearts();
  paintRace();
  if (renderer) {
    try {
      renderer.resize();
      renderer.frame({
        x: player[0], y: player[1], vy: player[2], lx: player[10],
        slide: player[3], hue, time: now / 1000, now, reduced, pieces,
        gapMs: dt * 1000,
        visible: document.visibilityState !== "hidden",
        event: spark, alive: true, speed: rules.speed, g: rules.g,
        near: nearSpark || !!window.__lumenForceNearCue,
        nearCue: window.__lumenForceNearCue || null,
        reject: rejectSpark, evo: evoCue, combo,
        blink: now < hurtUntil ? 1 : 0,
        duel,
        scene: sceneView, stumble: stumble / 1500, pals, hero, bend, loot,
        goal: levelGoal,
        biome: biomeName,
        mood: moodName,
        spec: biomeSpec,
        props,
        sunHide,
        shown: shownToys,
        thingChunks,
        gear: gearTier(),
        ward: wardReady ? 1 : Math.max(0, (WARD_WAIT - wardLeft) / WARD_WAIT),
      });
    } catch (err) {
      window.__lumenErr = String(err && err.stack || err);
      console.error(err);
    }
    spark = "";
    nearSpark = false;
    if (window.__lumenForceNearCue && !window.__lumenForceNearCue.hold) window.__lumenForceNearCue = null;
    rejectSpark = false;
    evoCue = "";
    duel = "";
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
  if (bannerUntil && performance.now() > bannerUntil && !window.__lumenHoldBanner) {
    if (evoEl) evoEl.hidden = true;
    bannerUntil = 0;
  }
  if (multEl) {
    const multLabel = "×" + runMult;
    if (multEl.textContent !== multLabel) {
      multEl.textContent = multLabel;
      multEl.classList.remove("pop");
      void multEl.offsetWidth;
      multEl.classList.add("pop");
    }
  }
  if (combo >= 2 && now < comboUntil) {
    comboEl.hidden = false;
    comboEl.textContent = comboText || ("×" + combo);
    comboEl.classList.toggle("hot", combo >= 3);
  } else if (!comboEl.hidden) {
    comboEl.hidden = true;
    comboEl.classList.remove("hot");
  }
  if (!(gainText && now < gainUntil) && gainEl && !gainEl.hidden) {
    gainEl.hidden = true;
    gainText = "";
  }
  const shown = Math.max(0, Math.floor(player[6]));
  if (scoreEl.textContent !== String(shown)) {
    scoreEl.textContent = String(shown);
    scoreEl.classList.remove("pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("pop");
    lastShown = String(shown);
  }
  if (gradeEl) {
    const label = gradeLabel(grade);
    if (gradeEl.textContent !== label) gradeEl.textContent = label;
  }
  if (paceEl) {
    const paceN = Math.round(rules.speed);
    const paceLabel = "Level " + levelN + " · Speed " + paceN;
    const span = levelGoal - levelStart;
    const along = span > 1 ? Math.max(0, Math.min(1, (player[0] - levelStart) / span)) : 0;
    if (goalFill) goalFill.style.width = (along * 100).toFixed(1) + "%";
    if (booted && paceN > Math.round(feltSpeed)) {
      showCue("Faster!");
      audio.rise();
      paceEl.classList.remove("pop");
      void paceEl.offsetWidth;
      paceEl.classList.add("pop");
    }
    feltSpeed = rules.speed;
    if (paceEl.textContent !== paceLabel) paceEl.textContent = paceLabel;
  }
  paintWard();
  syncRecord();
  paintMeter();
  if (showStats && frameN % 20 === 0) paintStats();
  if (frameN % 30 === 0) paintQuality();
  if (benchMode && frameN === 180) finishBench();
}

function snapshotBest() {
  bestAtStart = {
    points: record.bestPoints | 0,
    level: record.bestLevel | 0,
    combo: record.bestCombo | 0,
    mult: record.mult | 1,
  };
}

function nearestRival() {
  let best = null;
  let dist = 1e9;
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 10) continue;
    const mid = q[1] + (q[2] || 0) * 0.5;
    const d = Math.abs(mid - player[0]);
    if (d < dist) {
      dist = d;
      best = q;
    }
  }
  return best;
}

function pulseHearts() {
  heartsShown = -1;
  if (!heartsEl) return;
  heartsEl.classList.remove("back");
  void heartsEl.offsetWidth;
  heartsEl.classList.add("back");
}

function paintHearts() {
  if (!heartsEl) return;
  const n = Math.max(0, Math.min(HEARTS_MAX, hearts.hearts | 0));
  if (n === heartsShown && heartsEl.childElementCount === HEARTS_MAX) return;
  heartsShown = n;
  heartsEl.setAttribute("aria-label", n + (n === 1 ? " heart" : " hearts"));
  heartsEl.replaceChildren();
  for (let i = 0; i < HEARTS_MAX; i++) {
    const bit = document.createElement("span");
    bit.textContent = i < n ? "♥" : "♡";
    if (i >= n) bit.className = "gone";
    heartsEl.appendChild(bit);
  }
}

function paintRace() {
  if (!raceEl) return;
  if (runOver) {
    raceEl.hidden = true;
    return;
  }
  const q = nearestRival();
  if (!q) {
    raceEl.hidden = true;
    lastPlace = 0;
    return;
  }
  const read = raceRead(player[0], q[1] + (q[2] || 0) * 0.5);
  raceEl.hidden = false;
  raceEl.dataset.place = String(read.place);
  const text = (read.place === 1 ? "1st" : "2nd") + "  " + read.label;
  if (raceEl.textContent !== text) raceEl.textContent = text;
  if (read.place === 2 && lastPlace !== 2) {
    showCue("Rival ahead");
    duel = "ahead";
    q.flare = "surge";
  } else if (read.place === 1 && lastPlace === 2) {
    showCue("Overtake boost");
    duel = "pass";
    q.flare = "pass";
  }
  lastPlace = read.place;
}

function markRivalMoments() {
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 10) continue;
    const lane = q.length > 5 ? q[5] : 1;
    const x = q[1];
    const prev = q._x;
    q._x = x;
    const prevLane = q._lane;
    q._lane = lane;
    let flare = "";
    if (prevLane !== undefined && prevLane !== lane) flare = "surge";
    else if ((q[7] || 0) >= 2.4 && !q._surged) {
      q._surged = 1;
      flare = "surge";
    }
    if (prev !== undefined) {
      const mid = x + (q[2] || 0) * 0.5;
      for (let j = 0; j < pieces.length; j++) {
        const o = pieces[j];
        const k = o[0];
        const ol = o.length > 5 ? o[5] : -1;
        if (ol >= 0 && ol !== lane) continue;
        const ox = o[1];
        if (k === 5 && Math.abs(ox + (o[2] || 0) * 0.5 - mid) < 0.7) {
          const key = ox.toFixed(1);
          if (q._coin !== key) {
            q._coin = key;
            flare = "coin";
          }
        }
        if ((k === 3 || k === 4 || k === 7) && prev >= ox && x < ox) flare = "clear";
      }
    }
    if (flare) q.flare = flare;
  }
}

function paintOver(best) {
  if (!overEl) return;
  const score = Math.max(0, Math.floor(player[6]));
  if (overScoreEl) overScoreEl.textContent = "Score " + score;
  if (overLevelEl) overLevelEl.textContent = "Level " + levelN;
  if (overMultEl) overMultEl.textContent = "Best ×" + Math.max(1, runMult | 0, runBestCombo | 0);
  if (overRaceEl) {
    let line = "You " + playerWins + " · Rival " + rivalWins;
    if (winStreak >= 2) line += " · streak " + winStreak;
    overRaceEl.textContent = line;
  }
  if (overBestEl) overBestEl.hidden = !best;
  overEl.hidden = false;
}

function settleOver() {
  if (runOver) return;
  runOver = true;
  hurtUntil = 0;
  player[11] = 0;
  player[12] = 0;
  audio.die();
  const score = Math.max(0, Math.floor(player[6]));
  const best = score > (bestAtStart.points | 0)
    || levelN > (bestAtStart.level | 0)
    || runBestCombo > Math.max(1, bestAtStart.combo | 0)
    || runMult > Math.max(1, bestAtStart.mult | 1);
  paintOver(best);
  if (playAgainBtn) playAgainBtn.focus();
}

function showGain(text, big) {
  gainText = text;
  gainUntil = performance.now() + 1100;
  if (!gainEl) return;
  gainEl.hidden = false;
  gainEl.textContent = text;
  gainEl.classList.toggle("big", !!big);
  gainEl.classList.remove("float");
  void gainEl.offsetWidth;
  if (!reduced) gainEl.classList.add("float");
}

function celebrateGrade() {
  showCue(gradeLabel(grade).split(" ")[0] + "!");
  audio.cheer();
  if (!gradeEl) return;
  gradeEl.classList.remove("pop");
  void gradeEl.offsetWidth;
  gradeEl.classList.add("pop");
}

function paintMeter() {
  if (!meterFill) return;
  const fill = grade >= 5 ? 100 : Math.max(0, Math.min(99, Math.round(gradeBank)));
  meterFill.style.width = fill + "%";
  if (meterEl) meterEl.classList.toggle("full", grade >= 5);
}

function hearPoppers(list) {
  let heard = false;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (q[0] === 9 && q[6] > 0.5 && !q.heard) {
      q.heard = 1;
      heard = true;
    }
  }
  return heard;
}

// A slide that has passed a bar, or a burst left in the next lane, pays once.
// A bump the same moment does not. Grace after a hit does not pay either.
function scanPraise() {
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    const k = q[0];
    if (k !== 4 && k !== 9) continue;
    const key = q[1].toFixed(2) + ":" + k + ":" + (q[5] ?? -1);
    if (nearSeen.has(key)) continue;
    if (!praiseClear(player, q)) continue;
    nearSeen.add(key);
    if (nearSeen.size > 80) nearSeen.clear();
    return true;
  }
  return false;
}

function takeCoinWorth(list) {
  let worth = 0;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    if (q[0] === 0 && q.paid > 0) {
      worth = q.paid;
      q.paid = 0;
    }
  }
  return worth;
}

function paySkill(got, big) {
  player[6] += got.points;
  skillBank += got.points;
  const rose = got.grade > grade;
  grade = got.grade;
  gradeBank = got.bank;
  showGain(got.text, !!big);
  if (rose) celebrateGrade();
}

function scanNear(nowMs) {
  const x = player[0];
  const y = player[1];
  const lane = bodyLane(player);
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    const k = q[0];
    if (k !== 3 && k !== 7) continue;
    const key = q[1].toFixed(2) + ":" + k + ":" + (q[5] ?? -1);
    if (nearSeen.has(key)) continue;
    if (!skimmed(x, y, lane, q)) continue;
    nearSeen.add(key);
    if (nearSeen.size > 80) nearSeen.clear();
    void nowMs;
    return true;
  }
  return false;
}

function scanOvertakes() {
  const x = player[0];
  let n = 0;
  for (let i = 0; i < pieces.length; i++) {
    const q = pieces[i];
    if (q[0] !== 10) continue;
    const mid = q[1] + q[2] * 0.5;
    const next = trackOvertake(q.chase, x, mid);
    q.chase = next;
    if (next.award && player[11] <= 0) n += 1;
  }
  return n;
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
    instances: Number(canvas.dataset.instances || 0),
    biome: canvas.dataset.biome || biomeName,
  });
}

motionBtn.setAttribute("aria-pressed", reduced ? "true" : "false");
motionBtn.addEventListener("click", () => {
  reduced = !reduced;
  localStorage.setItem("lumen-motion", reduced ? "reduce" : "full");
  motionBtn.setAttribute("aria-pressed", reduced ? "true" : "false");
  if (renderer && renderer.setReduced) renderer.setReduced(reduced);
});
const qualityBtn = document.getElementById("quality-btn");
const qualityMenu = document.getElementById("quality-menu");
const QUALITY_NAMES = { auto: "Auto", low: "Low", medium: "Medium", high: "High" };
const qualityParam = (params.get("quality") || "").toLowerCase();
let qualityMode = QUALITY_NAMES[qualityParam] ? qualityParam : readQualityMode(localStorage);
function paintQuality() {
  if (!qualityBtn || !renderer || !renderer.qualitySnapshot) return;
  const snap = renderer.qualitySnapshot();
  const label = QUALITY_NAMES[snap.mode] || "Auto";
  qualityBtn.textContent = snap.mode === "auto" ? label + " · " + (QUALITY_NAMES[snap.tier] || "Low") : label;
  qualityBtn.setAttribute("aria-pressed", snap.mode === "auto" ? "false" : "true");
}
if (renderer && renderer.setQualityMode) renderer.setQualityMode(qualityMode);
if (renderer && renderer.setReduced) renderer.setReduced(reduced);
if (renderer && renderer.setVisible) renderer.setVisible(document.visibilityState !== "hidden");
paintQuality();
document.addEventListener("visibilitychange", () => {
  if (renderer && renderer.setVisible) renderer.setVisible(document.visibilityState !== "hidden");
});
if (qualityBtn && qualityMenu) {
  qualityBtn.addEventListener("click", () => {
    const open = qualityMenu.hidden;
    qualityMenu.hidden = !open;
    qualityBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  qualityMenu.addEventListener("click", (e) => {
    const mode = e.target && e.target.dataset ? e.target.dataset.q : "";
    if (!QUALITY_NAMES[mode]) return;
    qualityMode = mode;
    writeQualityMode(localStorage, mode);
    if (renderer && renderer.setQualityMode) renderer.setQualityMode(mode);
    qualityMenu.hidden = true;
    qualityBtn.setAttribute("aria-expanded", "false");
    paintQuality();
  });
}
muteBtn.addEventListener("click", () => {
  const next = !audio.muted;
  audio.setMuted(next);
  muteBtn.setAttribute("aria-pressed", next ? "true" : "false");
});
const volumeEl = document.getElementById("volume");
const openingVolume = volumeFromStore(localStorage.getItem("lumen-volume"));
audio.setVolume(openingVolume);
if (volumeEl) {
  volumeEl.value = String(Math.round(openingVolume * 100));
  volumeEl.addEventListener("input", () => {
    const v = Number(volumeEl.value) / 100;
    audio.setVolume(v);
    localStorage.setItem("lumen-volume", String(v));
  });
}
modelBtn.addEventListener("click", () => {
  if (!connected || !ws || ws.readyState !== 1 || providers.length < 2) return;
  const ix = providers.indexOf(provider);
  const next = providers[(ix + 1) % providers.length];
  ws.send(JSON.stringify({ op: "provider", name: next }));
});
if (againBtn) {
  againBtn.addEventListener("click", () => {
    audio.unlock();
    restart();
  });
}
if (playAgainBtn) {
  playAgainBtn.addEventListener("click", () => {
    audio.unlock();
    restart();
  });
}
window.addEventListener("keydown", (e) => {
  if (!runOver) return;
  if (e.repeat) return;
  if (e.code !== "Space" && e.code !== "Enter" && e.key !== " ") return;
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  e.preventDefault();
  e.stopImmediatePropagation();
  audio.unlock();
  restart();
}, true);
window.addEventListener("pagehide", () => syncRecord());
snapshotBest();
paintHearts();
paintRecord();
paintChallenge();
window.__lumenPose = (opts) => {
  const o = opts || {};
  poseHold = o.hold !== false;
  if (typeof o.x === "number") player[0] = o.x;
  if (Array.isArray(o.pieces)) pieces = o.pieces;
  if (typeof o.hearts === "number") {
    hearts = { ...heartsBlank(), hearts: Math.max(0, Math.min(HEARTS_MAX, o.hearts | 0)) };
    heartsShown = -1;
  }
  runBestCombo = typeof o.mult === "number" ? o.mult : runBestCombo;
  playerWins = o.playerWins | 0;
  rivalWins = o.rivalWins | 0;
  winStreak = o.streak | 0;
  levelN = o.level || levelN;
  if (typeof o.place === "number") lastPlace = o.place;
  if (typeof o.score === "number") player[6] = o.score;
  if (o.over) {
    runOver = false;
    if (o.best) {
      bestAtStart = { points: 0, level: 1, combo: 0 };
    }
    settleOver();
    if (!o.best && overBestEl) overBestEl.hidden = true;
  } else {
    runOver = false;
    if (overEl) overEl.hidden = true;
  }
  paintHearts();
  paintRace();
  return {
    hearts: hearts.hearts,
    over: runOver,
    race: raceEl ? raceEl.textContent : "",
  };
};
badgeEl.addEventListener("click", () => {
  const open = notesEl.hidden;
  notesEl.hidden = !open;
  badgeEl.setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    paintNotes();
    if (deckEl) {
      deckEl.hidden = true;
      if (cardsOpen) cardsOpen.setAttribute("aria-expanded", "false");
    }
  }
});
paintCards();
if (cardsOpen && deckEl) {
  cardsOpen.addEventListener("click", () => {
    const open = deckEl.hidden;
    deckEl.hidden = !open;
    cardsOpen.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      notesEl.hidden = true;
      badgeEl.setAttribute("aria-expanded", "false");
      paintCards();
    }
  });
}
if (cardsUse) {
  cardsUse.addEventListener("click", () => {
    sendDeck(cardPick.slice());
  });
}
if (primerTry) {
  primerTry.addEventListener("click", () => {
    if (!primerCard || !primerText || primerBusy) return;
    if (!ws || ws.readyState !== 1) return;
    primerBusy = true;
    primerTry.disabled = true;
    primerTry.textContent = "在试跑";
    ws.send(JSON.stringify({ op: "primer", card: primerCard, text: primerText.value }));
  });
}
if (cardsShare && cardShareEl) {
  cardsShare.addEventListener("click", () => {
    const text = shareText();
    cardShareEl.hidden = false;
    cardShareEl.textContent = text;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  });
}
window.addEventListener("keydown", (e) => {
  if (e.key === "F3") {
    showStats = !showStats;
    statsEl.hidden = !showStats;
  }
});

if (renderer) renderer.resize();
window.addEventListener("resize", () => renderer && renderer.resize());
installWish({
  send(payload) {
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(payload));
    return true;
  },
});
window.__lumenSay = (text, lang) => {
  if (!ws || ws.readyState !== 1) return false;
  ws.send(JSON.stringify({
    op: "wish",
    text: String(text || "").slice(0, 80),
    lang: lang === "zh" ? "zh-CN" : "en",
    source: "voice",
  }));
  return true;
};
connect();
requestAnimationFrame(frame);
