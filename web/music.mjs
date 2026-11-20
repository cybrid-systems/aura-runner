// Bounded tune model. The same limits live in lib/music.aura and are
// kept or rolled back by evo:trial. Nothing here touches the audio graph,
// so the checks can run without a browser.
//
// A phrase is one bar of 4/4. Playback tempo and density follow the run,
// and every reaction lands on the eighth-note grid.

export const HOME =
  "(tune garden-day (key C major) (tempo 96) (chords I V vi IV) (motif 0 2 4 7 4 2 0 4) (tone triangle 880 0.02 0.22) (pad sine 620 0.04 0.30) (kick 1 0 0 0 1 0 0 0) (snare 0 0 1 0 0 0 1 0) (hat 1 0 1 0 1 0 1 0) (swing 0.06) (layers 2) (gain 0.12))";

export const KEYS = Object.freeze(["C", "D", "E", "F", "G", "A", "Bb"]);
export const MODES = Object.freeze(["major", "minor", "dorian", "mixolydian", "pentatonic"]);
export const CHORDS = Object.freeze(["I", "ii", "iii", "IV", "V", "vi"]);
export const OSCS = Object.freeze(["sine", "triangle", "square"]);
export const MAX_VOICES = 8;

// A missing localStorage key is null, and Number(null) is 0. That must not
// become the opening level: a fresh profile stays audible after the gesture.
export const DEFAULT_VOLUME = 0.8;
export const CUE_BUS = 0.18;

export function volumeFromStore(raw) {
  if (typeof raw !== "string") return DEFAULT_VOLUME;
  const text = raw.trim();
  if (!text) return DEFAULT_VOLUME;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_VOLUME;
  return n;
}

// Cue-bus and music-bed gains once a gesture has started the context.
// Mute, or an explicit saved zero, stays silent. Anything else is above it.
export function audibleAfterGesture(stored, muted = false) {
  const volume = volumeFromStore(stored);
  if (muted || volume <= 0) return { volume, cue: 0, bed: 0, audible: false };
  return { volume, cue: CUE_BUS * volume, bed: volume, audible: true };
}

export const LIMITS = Object.freeze({
  tempo: [76, 126],
  playTempo: [72, 156],
  swing: [0, 0.14],
  layers: [1, 4],
  gain: [0.05, 0.18],
  toneCut: [400, 1600],
  padCut: [280, 1100],
  attack: [0.01, 0.06],
  release: [0.12, 0.4],
  squareCut: 900,
  kickMax: 3,
  snareMax: 2,
  hatMax: 5,
  drumMax: 9,
  voices: MAX_VOICES,
});

const HEADS = new Set(["key", "tempo", "chords", "motif", "tone", "pad", "kick", "snare", "hat", "swing", "layers", "gain"]);
const KEY_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, Bb: 10 };
const SCALE = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
};
const CHORD_DEGREE = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5 };

function mod(n, m) {
  return ((n % m) + m) % m;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function inside(n, lo, hi) {
  return Number.isFinite(n) && n >= lo - 0.001 && n <= hi + 0.001;
}

function ones(xs) {
  let n = 0;
  for (const v of xs) if (v >= 0.5) n += 1;
  return n;
}

function idOk(s) {
  return typeof s === "string" && /^[a-z][a-z0-9-]{1,23}$/.test(s);
}

function parseForm(text) {
  if (typeof text !== "string" || text.length === 0 || text.length > 700) return null;
  let i = 0;
  function skip() {
    while (i < text.length && " \t\n\r".includes(text[i])) i += 1;
  }
  function parseOne() {
    skip();
    if (i >= text.length) return undefined;
    const c = text[i];
    if (c === "(") {
      i += 1;
      const xs = [];
      for (;;) {
        skip();
        if (i >= text.length) return undefined;
        if (text[i] === ")") {
          i += 1;
          return xs;
        }
        const one = parseOne();
        if (one === undefined) return undefined;
        xs.push(one);
      }
    }
    if ((c >= "0" && c <= "9") || (c === "-" && text[i + 1] >= "0" && text[i + 1] <= "9")) {
      const start = i;
      if (text[i] === "-") i += 1;
      let dot = false;
      let digits = 0;
      while (i < text.length) {
        const d = text[i];
        if (d >= "0" && d <= "9") {
          digits += 1;
          i += 1;
        } else if (d === "." && !dot) {
          dot = true;
          i += 1;
        } else break;
      }
      if (!digits) return undefined;
      const n = Number(text.slice(start, i));
      return Number.isFinite(n) ? n : undefined;
    }
    if ((c >= "A" && c <= "Z") || (c >= "a" && c <= "z")) {
      const start = i;
      while (i < text.length) {
        const d = text[i];
        if ((d >= "A" && d <= "Z") || (d >= "a" && d <= "z") || (d >= "0" && d <= "9") || d === "-") i += 1;
        else break;
      }
      return text.slice(start, i);
    }
    return undefined;
  }
  const form = parseOne();
  skip();
  if (!Array.isArray(form) || i !== text.length) return null;
  return form;
}

function clause(form, name) {
  for (let i = 2; i < form.length; i += 1) {
    const sp = form[i];
    if (Array.isArray(sp) && sp[0] === name) return sp;
  }
  return null;
}

function asBits(sp) {
  if (!sp || sp.length !== 9) return null;
  const xs = [];
  for (let i = 1; i < sp.length; i += 1) {
    const n = Number(sp[i]);
    if (!Number.isFinite(n) || (Math.abs(n) > 0.001 && Math.abs(n - 1) > 0.001)) return null;
    xs.push(n >= 0.5 ? 1 : 0);
  }
  return xs;
}

function asDegrees(sp) {
  if (!sp || sp.length < 5 || sp.length > 9) return null;
  const xs = [];
  for (let i = 1; i < sp.length; i += 1) {
    const n = Number(sp[i]);
    if (!Number.isFinite(n)) return null;
    xs.push(Math.round(n));
  }
  return xs;
}

function asChords(sp) {
  if (!sp || sp.length < 3 || sp.length > 5) return null;
  const xs = [];
  for (let i = 1; i < sp.length; i += 1) {
    if (typeof sp[i] !== "string") return null;
    xs.push(sp[i]);
  }
  return xs;
}

function readPhrase(text) {
  const form = parseForm(text);
  if (!form || form[0] !== "tune" || typeof form[1] !== "string") return { why: "shape" };
  const seen = new Set();
  for (let i = 2; i < form.length; i += 1) {
    const sp = form[i];
    if (!Array.isArray(sp) || typeof sp[0] !== "string" || !HEADS.has(sp[0]) || seen.has(sp[0])) {
      return { why: "shape" };
    }
    seen.add(sp[0]);
  }
  for (const name of HEADS) {
    if (!seen.has(name)) return { why: "shape" };
  }
  const key = clause(form, "key");
  const tempo = clause(form, "tempo");
  const tone = clause(form, "tone");
  const pad = clause(form, "pad");
  const swing = clause(form, "swing");
  const layers = clause(form, "layers");
  const gain = clause(form, "gain");
  if (!key || key.length !== 3 || typeof key[1] !== "string" || typeof key[2] !== "string") return { why: "shape" };
  if (!tempo || tempo.length !== 2 || !Number.isFinite(Number(tempo[1]))) return { why: "shape" };
  if (!tone || tone.length !== 5 || typeof tone[1] !== "string") return { why: "shape" };
  if (!pad || pad.length !== 5 || typeof pad[1] !== "string") return { why: "shape" };
  if (!swing || swing.length !== 2 || !layers || layers.length !== 2 || !gain || gain.length !== 2) return { why: "shape" };
  const chords = asChords(clause(form, "chords"));
  const motif = asDegrees(clause(form, "motif"));
  const kick = asBits(clause(form, "kick"));
  const snare = asBits(clause(form, "snare"));
  const hat = asBits(clause(form, "hat"));
  if (!chords || !motif || !kick || !snare || !hat) return { why: "shape" };
  return {
    phrase: {
      id: form[1],
      key: key[1],
      mode: key[2],
      tempo: Math.round(Number(tempo[1])),
      chords,
      motif,
      tone: tone[1],
      cutoff: Number(tone[2]),
      attack: Number(tone[3]),
      release: Number(tone[4]),
      pad: pad[1],
      padCut: Number(pad[2]),
      padAtk: Number(pad[3]),
      padRel: Number(pad[4]),
      kick,
      snare,
      hat,
      swing: Number(swing[1]),
      layers: Math.round(Number(layers[1])),
      gain: Number(gain[1]),
    },
  };
}

function problem(p) {
  if (!p) return "shape";
  if (!idOk(p.id)) return "id";
  if (!KEYS.includes(p.key) || !MODES.includes(p.mode)) return !KEYS.includes(p.key) ? "key" : "mode";
  if (!inside(p.tempo, LIMITS.tempo[0], LIMITS.tempo[1])) return "tempo";
  if (p.chords.length < 2 || p.chords.length > 4 || p.chords.some((c) => !CHORDS.includes(c))) return "chords";
  if (p.motif.length < 4 || p.motif.length > 8 || p.motif.some((n) => n < 0 || n > 7)) return "motif";
  if (!OSCS.includes(p.tone) || !OSCS.includes(p.pad)) return "tone";
  if (!inside(p.cutoff, LIMITS.toneCut[0], LIMITS.toneCut[1])) return "cutoff";
  if (!inside(p.padCut, LIMITS.padCut[0], LIMITS.padCut[1])) return "cutoff";
  if ((p.tone === "square" && p.cutoff > LIMITS.squareCut + 0.001)
    || (p.pad === "square" && p.padCut > LIMITS.squareCut + 0.001)) return "cutoff";
  if (!inside(p.attack, LIMITS.attack[0], LIMITS.attack[1])
    || !inside(p.padAtk, LIMITS.attack[0], LIMITS.attack[1])) return "envelope";
  if (!inside(p.release, LIMITS.release[0], LIMITS.release[1])
    || !inside(p.padRel, LIMITS.release[0], LIMITS.release[1])) return "envelope";
  const kickN = ones(p.kick);
  const snareN = ones(p.snare);
  const hatN = ones(p.hat);
  if (kickN < 1 || kickN > LIMITS.kickMax || snareN > LIMITS.snareMax || hatN > LIMITS.hatMax) return "drums";
  if (kickN + snareN + hatN > LIMITS.drumMax) return "drums";
  if (!inside(p.swing, LIMITS.swing[0], LIMITS.swing[1])) return "swing";
  if (!inside(p.layers, LIMITS.layers[0], LIMITS.layers[1])) return "layers";
  if (!inside(p.gain, LIMITS.gain[0], LIMITS.gain[1])) return "gain";
  return "";
}

function freeze(p) {
  return Object.freeze({
    ...p,
    chords: Object.freeze(p.chords.slice()),
    motif: Object.freeze(p.motif.slice()),
    kick: Object.freeze(p.kick.slice()),
    snare: Object.freeze(p.snare.slice()),
    hat: Object.freeze(p.hat.slice()),
  });
}

export function check(text) {
  const read = readPhrase(text);
  if (!read.phrase) return { ok: false, why: read.why || "shape", phrase: null };
  const why = problem(read.phrase);
  if (why) return { ok: false, why, phrase: null };
  return { ok: true, why: "fair", phrase: freeze(read.phrase) };
}

export function acceptPhrase(raw) {
  if (!raw || typeof raw !== "object") return null;
  const bits = (xs) => {
    if (!Array.isArray(xs) || xs.length !== 8) return null;
    const out = [];
    for (const v of xs) {
      const n = Number(v);
      if (!Number.isFinite(n) || (Math.abs(n) > 0.001 && Math.abs(n - 1) > 0.001)) return null;
      out.push(n >= 0.5 ? 1 : 0);
    }
    return out;
  };
  const degs = Array.isArray(raw.motif) ? raw.motif.map((n) => Math.round(Number(n))) : null;
  const chords = Array.isArray(raw.chords) ? raw.chords.map((c) => String(c)) : null;
  const phrase = {
    id: String(raw.id || ""),
    key: raw.key,
    mode: raw.mode,
    tempo: Math.round(Number(raw.tempo)),
    chords,
    motif: degs,
    tone: raw.tone,
    cutoff: Number(raw.cutoff),
    attack: Number(raw.attack),
    release: Number(raw.release),
    pad: raw.pad,
    padCut: Number(raw.padCut),
    padAtk: Number(raw.padAtk),
    padRel: Number(raw.padRel),
    kick: bits(raw.kick),
    snare: bits(raw.snare),
    hat: bits(raw.hat),
    swing: Number(raw.swing),
    layers: Math.round(Number(raw.layers)),
    gain: Number(raw.gain),
  };
  if (!phrase.chords || !phrase.motif || !phrase.kick || !phrase.snare || !phrase.hat) return null;
  if (problem(phrase)) return null;
  return freeze(phrase);
}

export function emit(p) {
  const ints = (xs) => xs.map((n) => String(Math.round(n))).join(" ");
  const n2 = (n) => round2(n).toFixed(2);
  return `(tune ${p.id} (key ${p.key} ${p.mode}) (tempo ${Math.round(p.tempo)}) (chords ${p.chords.join(" ")}) (motif ${ints(p.motif)}) (tone ${p.tone} ${Math.round(p.cutoff)} ${n2(p.attack)} ${n2(p.release)}) (pad ${p.pad} ${Math.round(p.padCut)} ${n2(p.padAtk)} ${n2(p.padRel)}) (kick ${ints(p.kick)}) (snare ${ints(p.snare)}) (hat ${ints(p.hat)}) (swing ${n2(p.swing)}) (layers ${Math.round(p.layers)}) (gain ${n2(p.gain)}))`;
}

function homePhrase() {
  return check(HOME).phrase;
}

export function evolve(form, seed) {
  const found = check(form);
  const base = found.ok ? found.phrase : homePhrase();
  const sid = mod(Math.floor(Number(seed) || 0), 9000);
  const kind = mod(sid, 8);
  const next = {
    ...base,
    id: `evo-${sid}`,
    chords: base.chords.slice(),
    motif: base.motif.slice(),
    kick: base.kick.slice(),
    snare: base.snare.slice(),
    hat: base.hat.slice(),
  };
  if (kind === 0) {
    next.tempo = clamp(base.tempo + (mod(sid, 5) - 2) * 4, LIMITS.tempo[0], LIMITS.tempo[1]);
  } else if (kind === 1) {
    const k = mod(sid, next.chords.length) || 1;
    next.chords = next.chords.slice(k).concat(next.chords.slice(0, k));
  } else if (kind === 2) {
    const add = mod(sid, 3) + 1;
    next.motif = base.motif.map((d) => mod(d + add, 8));
  } else if (kind === 3) {
    next.mode = MODES[(MODES.indexOf(base.mode) + 1) % MODES.length];
  } else if (kind === 4) {
    next.key = KEYS[(KEYS.indexOf(base.key) + 1) % KEYS.length];
  } else if (kind === 5) {
    const delta = mod(sid, 3) - 1;
    next.layers = clamp(base.layers + delta, LIMITS.layers[0], LIMITS.layers[1]);
    next.swing = round2(clamp(base.swing + delta * 0.02, LIMITS.swing[0], LIMITS.swing[1]));
    next.gain = round2(clamp(base.gain + delta * 0.01, LIMITS.gain[0], LIMITS.gain[1]));
  } else if (kind === 6) {
    const i = mod(sid, 8);
    const hat = base.hat.slice();
    hat[i] = hat[i] ? 0 : 1;
    if (ones(hat) <= LIMITS.hatMax && ones(base.kick) + ones(base.snare) + ones(hat) <= LIMITS.drumMax) next.hat = hat;
    else next.swing = round2(clamp(base.swing + 0.02, LIMITS.swing[0], LIMITS.swing[1]));
  } else {
    const tone = OSCS[(OSCS.indexOf(base.tone) + 1) % OSCS.length];
    let cut = clamp(base.cutoff + (mod(sid, 5) - 2) * 40, LIMITS.toneCut[0], LIMITS.toneCut[1]);
    if (tone === "square" && cut > LIMITS.squareCut) cut = LIMITS.squareCut;
    next.tone = tone;
    next.cutoff = Math.round(cut);
    next.attack = round2(clamp(base.attack + (mod(sid, 3) - 1) * 0.01, LIMITS.attack[0], LIMITS.attack[1]));
    next.release = round2(clamp(base.release + (mod(sid, 3) - 1) * 0.02, LIMITS.release[0], LIMITS.release[1]));
    next.pad = base.pad === "sine" ? "triangle" : "sine";
    next.padCut = clamp(Math.round(base.padCut + (mod(sid, 5) - 2) * 30), LIMITS.padCut[0], LIMITS.padCut[1]);
  }
  const again = check(emit(next));
  return again.ok ? emit(next) : HOME;
}

export function createBook(phrase) {
  const current = phrase || homePhrase();
  return { current, previous: current, pending: null };
}

export function offerKeep(book, value) {
  const phrase = typeof value === "string" ? check(value).phrase : acceptPhrase(value);
  if (!phrase) return { book, verdict: "ROLLBACK", why: "bounds" };
  return {
    book: { current: book.current, previous: book.previous, pending: { op: "keep", phrase } },
    verdict: "KEEP",
    why: "fair",
  };
}

export function offerRollback(book) {
  if (book.pending && book.pending.op === "keep") {
    return { book: { current: book.current, previous: book.previous, pending: null }, verdict: "ROLLBACK", why: "cancel" };
  }
  return {
    book: {
      current: book.current,
      previous: book.previous,
      pending: { op: "restore", phrase: book.previous },
    },
    verdict: "ROLLBACK",
    why: "restore",
  };
}

export function atBar(book) {
  if (!book.pending) return book;
  if (book.pending.op === "restore") {
    const phrase = book.pending.phrase;
    return { current: phrase, previous: phrase, pending: null };
  }
  return { current: book.pending.phrase, previous: book.current, pending: null };
}

export function liftKey(phrase) {
  const key = KEYS[(KEYS.indexOf(phrase.key) + 1) % KEYS.length];
  const next = { ...phrase, key, id: `lift-${key.toLowerCase()}` };
  const again = check(emit(next));
  return again.ok ? again.phrase : phrase;
}

// Playback tempo. Speed 8 and level 1 sit on the phrase tempo. Both inputs
// raise it, and the result stays inside the play cap.
export function tempoFor(base, speed, level) {
  const b = Number.isFinite(base) ? base : 96;
  const sp = Number.isFinite(speed) ? speed : 8;
  const lv = Number.isFinite(level) && level >= 1 ? level : 1;
  const shaped = b * (0.92 + Math.max(0, sp - 6) * 0.035) * (1 + (lv - 1) * 0.028);
  return clamp(shaped, LIMITS.playTempo[0], LIMITS.playTempo[1]);
}

// Layer count. Higher speed and level add a part. Reduced motion keeps one.
export function layersFor(base, speed, level, reduced) {
  let n = Number.isFinite(base) ? base : 2;
  const sp = Number.isFinite(speed) ? speed : 8;
  const lv = Number.isFinite(level) && level >= 1 ? level : 1;
  if (lv >= 3) n += 1;
  if (lv >= 7) n += 1;
  if (sp >= 11) n += 1;
  n = clamp(Math.round(n), LIMITS.layers[0], LIMITS.layers[1]);
  return reduced ? 1 : n;
}

export function stepTime(barStart, step, bpm, swing) {
  const safe = clamp(Number.isFinite(bpm) ? bpm : 96, LIMITS.playTempo[0], LIMITS.playTempo[1]);
  const eighth = 30 / safe;
  const s = mod(step, 8);
  const sw = clamp(Number.isFinite(swing) ? swing : 0, LIMITS.swing[0], LIMITS.swing[1]);
  let t = barStart + s * eighth;
  if (s % 2 === 1) t += sw * eighth;
  return t;
}

export function quantize(time, bpm, swing) {
  const safeBpm = clamp(Number.isFinite(bpm) ? bpm : 96, LIMITS.playTempo[0], LIMITS.playTempo[1]);
  const eighth = 30 / safeBpm;
  const sw = clamp(Number.isFinite(swing) ? swing : 0, LIMITS.swing[0], LIMITS.swing[1]);
  const safe = Math.max(0, Number(time) || 0);
  let n = Math.max(0, Math.floor(safe / eighth) - 1);
  for (let guard = 0; guard < 64; guard += 1) {
    let t = n * eighth;
    if (n % 2 === 1) t += sw * eighth;
    if (t + 1e-6 >= safe) return t;
    n += 1;
  }
  return safe;
}

export function chooseBed(status, playable) {
  if (status === 200 && playable !== false) return "file";
  return "synth";
}

export function effectFor(kind) {
  if (kind === "hit") return { kind, filter: 0.62, bend: 0.985, beats: 1, stinger: true, fill: false, lift: false };
  if (kind === "shield") return { kind, filter: 1.06, bend: 1.02, beats: 1, stinger: true, fill: false, lift: false };
  if (kind === "combo" || kind === "near") return { kind, filter: 1, bend: 1, beats: 0, stinger: false, fill: true, lift: false };
  if (kind === "level") return { kind, filter: 1, bend: 1, beats: 0, stinger: true, fill: false, lift: true };
  if (kind === "rollback") return { kind, filter: 1, bend: 1, beats: 0, stinger: true, fill: false, lift: false };
  return null;
}

export function recoverTime(start, bpm, beats) {
  const safe = clamp(Number.isFinite(bpm) ? bpm : 96, LIMITS.playTempo[0], LIMITS.playTempo[1]);
  return start + beats * (60 / safe);
}

// Priority order: a full bar stays inside the voice cap, and hats are the
// first thing dropped when a fill or a stinger needs the last slot.
export function rolesAt(phrase, step, layers, extras) {
  const s = mod(step, 8);
  const roles = ["melody"];
  if (s % 4 === 0) roles.push("bass");
  if (phrase.kick[s]) roles.push("kick");
  if (layers >= 4 && phrase.snare[s]) roles.push("snare");
  if (layers >= 2 && phrase.hat[s]) roles.push("hat");
  if (layers >= 3 && s % 2 === 0) roles.push("pad");
  if (extras && extras.fill) roles.push("fill");
  if (extras && extras.stinger) roles.push("stinger");
  return roles.slice(0, MAX_VOICES);
}

export function hzFor(phrase, degree, octave) {
  const scale = SCALE[phrase.mode] || SCALE.major;
  const d = mod(Math.round(degree), scale.length);
  const midi = 12 * (octave + 1) + (KEY_PC[phrase.key] || 0) + scale[d];
  return 440 * 2 ** ((midi - 69) / 12);
}

export function chordRoot(phrase, step) {
  const per = Math.max(1, Math.floor(8 / phrase.chords.length));
  const name = phrase.chords[Math.min(phrase.chords.length - 1, Math.floor(mod(step, 8) / per))];
  return CHORD_DEGREE[name] || 0;
}
