// Tune bounds, KEEP/ROLLBACK, tempo, and the missing-file bed.
// The page plays these phrases; this check never opens an audio device.
import {
  HOME, LIMITS, MAX_VOICES,
  acceptPhrase, atBar, check, chooseBed, createBook, effectFor, emit, evolve,
  layersFor, liftKey, offerKeep, offerRollback, quantize, recoverTime, rolesAt,
  stepTime, tempoFor,
} from "../web/music.mjs";

let failed = 0;
function checkOk(name, ok) {
  if (!ok) {
    failed += 1;
    console.error("fail", name);
  } else {
    console.log("ok", name);
  }
}

const home = check(HOME);
checkOk("home", home.ok && home.phrase.id === "garden-day" && home.phrase.tempo === 96);

const round = check(emit(home.phrase));
checkOk("roundtrip", round.ok && round.phrase.id === home.phrase.id && round.phrase.swing === home.phrase.swing);

let bounds = true;
let changed = false;
for (let i = 0; i < 24; i += 1) {
  const form = evolve(HOME, i);
  const got = check(form);
  if (!got.ok) bounds = false;
  const p = got.phrase;
  if (!p) {
    bounds = false;
    continue;
  }
  if (p.id !== "garden-day") changed = true;
  if (p.tempo < LIMITS.tempo[0] || p.tempo > LIMITS.tempo[1]) bounds = false;
  if (p.swing < LIMITS.swing[0] - 0.001 || p.swing > LIMITS.swing[1] + 0.001) bounds = false;
  if (p.layers < 1 || p.layers > 4) bounds = false;
  if (p.gain < LIMITS.gain[0] - 0.001 || p.gain > LIMITS.gain[1] + 0.001) bounds = false;
  if (p.cutoff < LIMITS.toneCut[0] || p.cutoff > LIMITS.toneCut[1]) bounds = false;
  if (p.tone === "square" && p.cutoff > LIMITS.squareCut) bounds = false;
  if (!["major", "minor", "dorian", "mixolydian", "pentatonic"].includes(p.mode)) bounds = false;
  if (!["C", "D", "E", "F", "G", "A", "Bb"].includes(p.key)) bounds = false;
}
checkOk("evolve-bounds", bounds);
let chained = HOME;
let chainOk = true;
for (let i = 0; i < 24; i += 1) {
  chained = evolve(chained, i + 8);
  if (!check(chained).ok) chainOk = false;
}
checkOk("evolve-chain", chainOk);
checkOk("evolve-changes", changed);
checkOk("evolve-id", check(evolve(HOME, 0)).phrase.id === "evo-0");

const harsh = HOME.replace("(tempo 96)", "(tempo 200)");
const badMode = HOME.replace("(key C major)", "(key C chromatic)");
const packed = HOME.replace("(hat 1 0 1 0 1 0 1 0)", "(hat 1 1 1 1 1 1 1 1)");
checkOk("harsh", !check(harsh).ok && check(harsh).why === "tempo");
checkOk("mode", !check(badMode).ok);
checkOk("drums", check(packed).why === "drums");
checkOk("from-harsh", check(evolve(harsh, 3)).ok);

let book = createBook();
const evolved = check(evolve(HOME, 0)).phrase;
const held = offerKeep(book, emit(evolved));
checkOk("keep-holds", held.verdict === "KEEP"
  && held.book.current.id === "garden-day"
  && held.book.pending && held.book.pending.phrase.id === "evo-0");
const swapped = atBar(held.book);
checkOk("bar-swap", swapped.current.id === "evo-0" && swapped.previous.id === "garden-day" && !swapped.pending);
const cancelled = offerRollback(held.book);
checkOk("rollback-cancel", cancelled.verdict === "ROLLBACK"
  && cancelled.book.current.id === "garden-day"
  && !cancelled.book.pending);
const queued = offerRollback(swapped);
checkOk("rollback-queues", queued.book.current.id === "evo-0"
  && queued.book.pending && queued.book.pending.op === "restore");
const restored = atBar(queued.book);
checkOk("rollback-restore", restored.current.id === "garden-day");

const refused = offerKeep(book, harsh);
checkOk("offer-harsh", refused.verdict === "ROLLBACK"
  && refused.book.current.id === "garden-day"
  && !refused.book.pending);

const wire = acceptPhrase({ ...evolved });
checkOk("accept", wire && wire.id === "evo-0");
checkOk("accept-harsh", acceptPhrase({ ...home.phrase, tempo: 400 }) === null);

const slow = tempoFor(96, 8, 1);
const fast = tempoFor(96, 12, 1);
const faster = tempoFor(96, 18, 1);
checkOk("tempo-speed", slow < fast && fast < faster);
const early = tempoFor(96, 8, 1);
const mid = tempoFor(96, 8, 4);
const late = tempoFor(96, 8, 9);
checkOk("tempo-level", early < mid && mid < late);
const capped = tempoFor(96, 80, 40);
checkOk("tempo-cap", capped <= LIMITS.playTempo[1] && capped >= LIMITS.playTempo[0] && slow >= LIMITS.playTempo[0]);

checkOk("layers-speed", layersFor(1, 8, 1) < layersFor(1, 12, 1));
checkOk("layers-level", layersFor(1, 8, 1) < layersFor(1, 8, 4));
checkOk("layers-cap", layersFor(4, 20, 20) === 4 && layersFor(4, 20, 20, true) === 1);

checkOk("fallback-missing", chooseBed(204, true) === "synth" && chooseBed(404, true) === "synth" && chooseBed(0, false) === "synth");
checkOk("fallback-file", chooseBed(200, true) === "file");
checkOk("fallback-unplayable", chooseBed(200, false) === "synth");

const lifted = liftKey(home.phrase);
checkOk("lift", lifted.key === "D" && check(emit(lifted)).ok && lifted.key !== home.phrase.key);

const grid = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => stepTime(0, s, 120, 0.1));
let gridOk = grid[0] === 0 && grid[2] === 0.5 && grid[1] > 0.25 && grid[1] < grid[2];
for (let s = 1; s < grid.length; s += 1) if (!(grid[s] > grid[s - 1])) gridOk = false;
checkOk("grid", gridOk);
checkOk("quantize", quantize(0, 120, 0) === 0
  && Math.abs(quantize(0.01, 120, 0) - 0.25) < 1e-9
  && Math.abs(quantize(0.01, 120, 0.1) - 0.275) < 1e-9
  && Math.abs(quantize(0.3, 120, 0.1) - 0.5) < 1e-9);

const hit = effectFor("hit");
const shield = effectFor("shield");
checkOk("hit-duck", hit && hit.filter < 1 && hit.bend < 1 && hit.beats === 1 && hit.stinger);
checkOk("shield-stinger", shield && shield.stinger && shield.beats === 1 && shield.bend > 1 && shield.bend < 1.05);
checkOk("combo-fill", effectFor("combo").fill && effectFor("near").fill && !effectFor("combo").stinger);
checkOk("level-lift", effectFor("level").lift && effectFor("level").stinger);
checkOk("recover", Math.abs(recoverTime(1, 120, 1) - 1.5) < 1e-9);

let voices = true;
for (let s = 0; s < 8; s += 1) {
  const n = rolesAt(home.phrase, s, 4, { fill: true, stinger: true }).length;
  if (n < 1 || n > MAX_VOICES) voices = false;
}
checkOk("voices", voices && LIMITS.voices === MAX_VOICES);

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("music ok");
