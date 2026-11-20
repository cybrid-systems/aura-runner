import { DT, bodyLane, makePlayer, praiseClear, pressJump, pressLane, pressSlide, rulesOf, step } from "./sim.mjs";
import { awardPickup, dropGrade, gradeLabel, lootWorth, praise } from "./score.mjs";
import { createRenderer } from "./render.mjs";
import { createInput } from "./input.mjs";
import { createAudio } from "./audio.mjs";
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
const againBtn = document.getElementById("again");

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
let rules = rulesOf(32, 11.2, 8, 0.48, 0.12, 0.12);
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
let rejectSpark = false;
let combo = 0;
let comboUntil = 0;
let grade = 1;
let gradeBank = 0;
let gainText = "";
let gainUntil = 0;
let comboText = "";
let feltSpeed = 8;
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
  if (msg.ask) showSaid(cue);
  if (msg.mark) showMark(msg.mark);
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

function resetLocal() {
  const p = makePlayer(1.2);
  player.set(p);
  pieces = [];
  seenChunks = new Set();
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
}

function reconcile(st) {
  if (typeof st.g === "number") applyRules(st);
  alive = true;
  player[5] = 1;
  // A late server pose, a few metres ahead after a hole the body already
  // cleared, must not drag the runner into that hole. Only a real split snaps.
  if (st.alive !== false && typeof st.x === "number") {
    const lead = player[0] - st.x;
    if (lead < -12 || lead > 12) player[0] = st.x;
  }
  if (typeof st.hue === "number") hue = st.hue;
  applyLevel(st);
}

function applyLevel(msg) {
  if (typeof msg.level === "number") levelN = msg.level;
  if (typeof msg.goal === "number") levelGoal = msg.goal;
  if (typeof msg.level0 === "number") levelStart = msg.level0;
  if (typeof msg.pace === "number") formN = Math.max(0, Math.min(4, Math.round(msg.pace)));
  noteCardGrants();
}

function clampInt(v, lo, hi, fallback) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function blankRecord() {
  return { level: 1, form: 0, points: 0, grade: 1, bank: 0, bestLevel: 1, bestPoints: 0 };
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
  return { level, form, points, grade, bank, bestLevel, bestPoints };
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

function paintRecord() {
  if (!recordEl) return;
  const show = record.bestLevel > 1 || record.bestPoints > 0;
  recordEl.hidden = !show;
  recordEl.textContent = show ? ("Best L" + record.bestLevel + " · " + record.bestPoints) : "";
}

function sameRecord(a, b) {
  return a.level === b.level && a.form === b.form && a.points === b.points
    && a.grade === b.grade && a.bank === b.bank
    && a.bestLevel === b.bestLevel && a.bestPoints === b.bestPoints;
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
      const hello = { op: "hello", seed: seedParam ? Number(seedParam) : 42 };
      if (record.level > 1 || record.form > 0 || record.points > 0) {
        hello.resume = { level: record.level, form: record.form, points: record.points };
        carry = { grade: record.grade, bank: record.bank, level: record.level };
      }
      ws.send(JSON.stringify(hello));
    }
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (freshRun && msg.op !== "welcome" && msg.op !== "resync") return;
    if (msg.op === "welcome") {
      freshRun = false;
      resetLocal();
      booted = true;
      seed = msg.seed;
      applyRules(msg);
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
      const next = adoptDecision(worldline, msg);
      if (next !== worldline) {
        worldline = next;
        saveWorld(localStorage, worldline);
      }
      remember(msg);
      if (msg.arm === "cards") applyCardDecision(msg);
      if (msg.arm === "rule") endPrimerWait();
      if (window.__lumenOnDecision) window.__lumenOnDecision(msg);
      if (msg.kind === "KEEP" && (msg.arm === "motif" || msg.arm === "scene" || msg.arm === "pals")) audio.keep();
      if (msg.kind === "ROLLBACK") rejectSpark = true;
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

// Headless Chrome pauses requestAnimationFrame while a test is only
// reading the page. The socket still has to move, and the probe has to
// publish, or a kept garden never shows up. A live frame updates
// lastPump; the test calls __lumenPump itself.
function pumpNet(now) {
  const dt = Math.min(0.1, Math.max(0.016, (now - lastPump) / 1000));
  lastPump = now;
  sendTick();
  lerpScene(dt);
  publishProbe();
}

window.__lumenPump = () => pumpNet(performance.now());

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
  if (connected && ws && ws.readyState === 1) {
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
  root.dataset.points = String(Math.max(0, Math.floor(player[6])));
  root.dataset.grade = gradeLabel(grade).split(" ")[0];
  root.dataset.bank = String(gradeBank);
  root.dataset.speed = String(rules.speed);
  root.dataset.level = String(levelN);
  root.dataset.goal = Number.isFinite(levelGoal) ? levelGoal.toFixed(1) : "";
  root.dataset.props = props.join(",");
  root.dataset.sun = sunHide ? "off" : props.includes("sun") ? "on" : "soft";
  root.dataset.shown = shownToys.map((toy) => toy.name).join(",");
  root.dataset.ward = wardReady ? "1" : "0";
  root.dataset.gear = String(gearTier());
  root.dataset.best = String(record.bestLevel);
  root.dataset.bend = bend.toFixed(2);
  root.dataset.mark = markEl && !markEl.hidden ? markEl.textContent : "";
  root.dataset.g = String(rules.g);
  root.dataset.air = String(rules.air || 0);
  root.dataset.magnet = String(rules.magnet || 0);
  root.dataset.cards = cardBook.equipped.join(",");
  root.dataset.owned = CARD_ORDER.filter((id) => cardBook.owned.has(id)).join(",");
  root.dataset.chat = saidRows.join(" | ");
  root.dataset.said = saidEl && !saidEl.hidden ? saidEl.textContent : "";
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
}

let stepping = false;

function frame(now) {
  if (!stepping) requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  frames[frameN % frames.length] = dt * 1000;
  frameN++;
  const inp = input.consume();
  if (inp.jump || inp.slide || inp.lane) {
    audio.unlock();
    inputAt = now;
  }
  if (alive && inp.restart) {
    audio.unlock();
    restart();
  } else if (alive) {
    if (inp.jump) { pressJump(player); jumpQ = 1; audio.jump(); }
    if (inp.slide) { pressSlide(player); slideQ = 1; audio.slide(); }
    if (inp.lane) { pressLane(player, inp.lane); laneQ = inp.lane; }
    acc += dt;
    let guard = 0;
    while (acc >= DT && guard < 4) {
      const before = player[2];
      const wasY = player[1];
      const scoreBefore = player[6];
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
        const got = awardPickup(rules.worth, combo, comboUntil, now, grade, gradeBank);
        combo = got.combo;
        comboUntil = got.comboUntil;
        player[6] += got.extra;
        const rose = got.grade > grade;
        grade = got.grade;
        gradeBank = got.bank;
        comboText = got.text;
        showGain(got.text, got.combo >= 3);
        if (rose) celebrateGrade();
      }
      if (!ward.held && ev !== "bump" && ev !== "oops" && scanPraise()) {
        const got = praise(grade, gradeBank);
        player[6] += got.points;
        const rose = got.grade > grade;
        grade = got.grade;
        gradeBank = got.bank;
        showGain(got.text, false);
        audio.nice();
        nearSpark = true;
        if (rose) celebrateGrade();
      }
      if (ev === "spring") { audio.spring(); spark = "spring"; }
      if (ev === "bump" || ev === "oops") {
        stumble = 1500;
        player[5] = 1;
        showCue(ev === "oops" ? "Back on the path" : "Oops! Keep going");
        audio.near();
        if (ev === "bump") {
          grade = dropGrade(grade);
          gradeBank = 0;
          combo = 0;
          comboUntil = 0;
        }
      }
      if (wasY > 0.2 && player[1] <= 0.001 && player[5] > 0) audio.land();
      if (hearPoppers(pieces)) audio.pop();
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
    lastPump = now;
  }
  stumble = Math.max(0, stumble - dt * 1000);
  if (!flashEl.hidden) {
    flashEl.hidden = true;
    flashEl.classList.remove("on");
  }
  lerpScene(dt);
  publishProbe();
  audio.music(reduced);
  if (renderer) {
    try {
      renderer.resize();
      renderer.frame({
        x: player[0], y: player[1], vy: player[2], lx: player[10],
        slide: player[3], hue, time: now / 1000, now, reduced, pieces,
        event: spark, alive: true, speed: rules.speed, g: rules.g,
        near: nearSpark, reject: rejectSpark,
        scene: sceneView, stumble: stumble / 1500, pals, hero, bend, loot,
        goal: levelGoal,
        props,
        sunHide,
        shown: shownToys,
        thingChunks,
        gear: gearTier(),
        ward: wardReady ? 1 : Math.max(0, (WARD_WAIT - wardLeft) / WARD_WAIT),
      });
    } catch (err) {
      console.error(err);
    }
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
  if (benchMode && frameN === 180) finishBench();
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
if (againBtn) {
  againBtn.addEventListener("click", () => {
    audio.unlock();
    restart();
  });
}
window.addEventListener("pagehide", () => syncRecord());
paintRecord();
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
connect();
requestAnimationFrame(frame);
