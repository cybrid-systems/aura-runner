// Tune bounds, KEEP/ROLLBACK, tempo, and the missing-file bed.
// The page plays these phrases; this check never opens an audio device.
import {
  HOME, LIMITS, MAX_VOICES,
  acceptPhrase, advancePlaylist, arrangeTracks, audibleAfterGesture, atBar, check, chooseBed, createBook, effectFor, emit, evolve,
  freshPlaylist, layersFor, liftKey, offerKeep, offerRollback, pickNextIndex, quantize, recoverTime, rolesAt,
  stepTime, tempoFor, volumeFromStore,
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

// localStorage.getItem returns null when the key was never written, and
// Number(null) is 0. A fresh profile must still be audible after a gesture.
const fresh = audibleAfterGesture(null, false);
checkOk("fresh-audible", fresh.audible && fresh.volume === 0.8 && fresh.cue > 0.1 && fresh.bed === 0.8);
checkOk("fresh-empty", audibleAfterGesture(undefined).audible && audibleAfterGesture("").volume === 0.8);
checkOk("saved-level", volumeFromStore("0.4") === 0.4 && audibleAfterGesture("0.4").audible);
checkOk("saved-zero", volumeFromStore("0") === 0 && !audibleAfterGesture("0").audible);
checkOk("bad-volume", volumeFromStore("nope") === 0.8 && volumeFromStore("2") === 0.8 && volumeFromStore("-1") === 0.8);
checkOk("muted-silent", !audibleAfterGesture(null, true).audible);

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

const ordered = freshPlaylist(["a.mp3", "b.ogg", "c.wav"], "ordered");
checkOk("playlist-order", ordered.action === "play" && ordered.tracks.join() === "a.mp3,b.ogg,c.wav" && ordered.index === 0);
const stepped = advancePlaylist(ordered, "end");
checkOk("playlist-next", stepped.index === 1 && stepped.tracks[0] === "a.mp3" && stepped.action === "play");
const wrapped = advancePlaylist({ order: "ordered", tracks: ordered.tracks, index: 2, failed: 0 }, "end");
checkOk("playlist-wrap", wrapped.index === 0 && wrapped.tracks.join() === "a.mp3,b.ogg,c.wav");
const shuffled = arrangeTracks(["a", "b", "c", "d"], "shuffle", () => 0);
checkOk("playlist-shuffle", shuffled.join() === "b,c,d,a");
const openedLow = freshPlaylist(["a", "b", "c", "d"], "shuffle", () => 0);
checkOk("playlist-open-low", openedLow.action === "play" && openedLow.index === 0 && openedLow.tracks.join() === "b,c,d,a");
const openedHigh = freshPlaylist(["a", "b", "c", "d"], "shuffle", () => 0.99);
checkOk("playlist-open-high", openedHigh.action === "play" && openedHigh.index === 3 && openedHigh.tracks.join() === "a,b,c,d");
const afterOpen = advancePlaylist(openedHigh, "end", () => 0);
checkOk("playlist-open-next", afterOpen.index === 0 && afterOpen.index !== openedHigh.index && afterOpen.tracks.join() === "a,b,c,d");
const randomNext = advancePlaylist({ order: "shuffle", tracks: ["a", "b", "c", "d"], index: 2, failed: 0 }, "end", () => 0);
checkOk("playlist-random-next", randomNext.action === "play" && randomNext.index === 0 && randomNext.tracks.join() === "a,b,c,d");
const randomHigh = advancePlaylist({ order: "shuffle", tracks: ["a", "b", "c", "d"], index: 0, failed: 0 }, "end", () => 0.999);
checkOk("playlist-random-high", randomHigh.index === 3 && randomHigh.tracks[0] === "a");
checkOk("playlist-random-skip", pickNextIndex(4, 1, () => 0) === 0 && pickNextIndex(4, 1, () => 0.999) === 3);
let stayed = false;
for (let i = 0; i < 4; i += 1) {
  for (let u = 0; u < 8; u += 1) {
    if (pickNextIndex(4, i, () => u / 8) === i) stayed = true;
  }
}
checkOk("playlist-no-repeat", !stayed);
let skipped = freshPlaylist(["a", "b"], "ordered");
skipped = advancePlaylist(skipped, "error");
checkOk("playlist-skip", skipped.action === "play" && skipped.index === 1 && skipped.failed === 1);
skipped = advancePlaylist(skipped, "error");
checkOk("playlist-give-up", skipped.action === "synth" && skipped.failed === 2);
const single = advancePlaylist(freshPlaylist(["only.mp3"], "shuffle", () => 0), "end");
checkOk("playlist-one", single.action === "play" && single.index === 0 && single.tracks[0] === "only.mp3");
checkOk("playlist-empty", freshPlaylist([], "shuffle").action === "synth");

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("music ok");
