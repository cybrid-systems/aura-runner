// Small synthesized cues, plus a folder of the player's own tracks when
// one is configured. A single recording at LUMEN_MUSIC is the fallback
// when that folder is unset. play() has to run inside the key, pointer,
// or touch listener.
// A later animation frame is no longer a user gesture, and the browser drops it.
// The piece goes straight to the speakers. Routing it through a media-element
// source leaves it silent while that context is still suspended.
//
// The soft line is one voice for the whole session. Pitch used to follow the
// clock, so the fallback hopped to a new note every beat. It stays on this
// voice until the player mutes; unmuting keeps the same one.
//
// When the recording is missing, a bounded tune plays instead. Its bus is
// separate from the cues, ducks while the soft voice or a cue is sounding,
// and schedules a few eighths ahead so a throttled tab does not burst.

import {
  CUE_BUS, DEFAULT_VOLUME, HOME, MAX_VOICES,
  acceptPhrase, advancePlaylist, atBar, check, chooseBed, chordRoot, createBook, effectFor,
  freshPlaylist, hzFor, layersFor, liftKey, offerKeep, offerRollback, rolesAt, stepTime, tempoFor,
} from "./music.mjs";

export const SESSION_VOICE = Object.freeze({
  name: "lumen-soft",
  type: "sine",
  freq: 196,
  pitch: 1,
});

// beat is ignored. A long run asks for the same voice it started with.
export function voiceForBeat(_beat) {
  return SESSION_VOICE;
}

const NOTE_GAIN = {
  melody: 0.032,
  bass: 0.027,
  pad: 0.013,
  kick: 0.028,
  snare: 0.016,
  hat: 0.01,
  fill: 0.024,
  stinger: 0.03,
};

export function createAudio() {
  let ctx = null;
  let muted = false;
  let userVolume = DEFAULT_VOLUME;
  let master = null;
  let song = null;
  let bed = "wait";
  let fileTried = false;
  let unlocked = false;
  let playState = null;
  let playGen = 0;
  let failGen = -1;
  let bedPlan = "pending";
  let catalogPromise = null;
  let nextBeat = 0;
  const SONG_VOL = 0.8;
  let book = createBook();
  let bpm = tempoFor(book.current.tempo, 8, 1);
  let layers = book.current.layers;
  let swing = book.current.swing;
  let step = 0;
  let nextTime = 0;
  let barStart = 0;
  let timer = null;
  let active = 0;
  let busFilter = null;
  let bedGain = null;
  let duckGain = null;
  let bendMul = 1;
  let bendUntil = 0;
  let fxKind = "";
  let fileTimer = 0;
  const live = { speed: 8, level: 1, reduced: false };
  const want = [];
  let seenLevel = -1;
  let lastCombo = 0;
  let levelQueued = false;
  let liftedThisBar = false;
  let bedKnown = false;

  function mark(state, time) {
    const root = document.documentElement;
    root.dataset.music = state;
    if (typeof time === "number") root.dataset.musicTime = time.toFixed(2);
  }

  function publish() {
    const root = document.documentElement;
    const phrase = book.current;
    root.dataset.musicBed = bed;
    root.dataset.musicPhrase = phrase.id;
    root.dataset.musicKey = phrase.key + " " + phrase.mode;
    root.dataset.musicBpm = bpm.toFixed(1);
    root.dataset.musicLayers = String(layers);
    root.dataset.musicPending = book.pending ? book.pending.op : "";
    root.dataset.musicEffect = fxKind;
  }

  function musicState() {
    return {
      bed,
      muted,
      volume: userVolume,
      bpm: Math.round(bpm * 10) / 10,
      layers,
      id: book.current.id,
      key: book.current.key,
      mode: book.current.mode,
      pending: book.pending ? book.pending.op : "",
      pendingId: book.pending ? book.pending.phrase.id : "",
      track: document.documentElement.dataset.musicTrack || "",
      previous: book.previous.id,
      effect: fxKind,
      tempo: book.current.tempo,
      swing: book.current.swing,
      gain: book.current.gain,
    };
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : CUE_BUS * userVolume;
    master.connect(ctx.destination);
    busFilter = ctx.createBiquadFilter();
    busFilter.type = "lowpass";
    busFilter.frequency.value = 1200;
    busFilter.Q.value = 0.7;
    bedGain = ctx.createGain();
    bedGain.gain.value = muted ? 0 : userVolume;
    duckGain = ctx.createGain();
    duckGain.gain.value = 1;
    busFilter.connect(bedGain);
    bedGain.connect(duckGain);
    duckGain.connect(ctx.destination);
    return ctx;
  }

  function applyGains() {
    const hear = muted ? 0 : userVolume;
    if (master) master.gain.value = hear ? CUE_BUS * hear : 0;
    if (song) song.volume = hear ? SONG_VOL * hear : 0;
    if (bedGain && ctx) {
      const target = hear ? (bed === "file" ? 0.55 : 1) * hear : 0;
      bedGain.gain.cancelScheduledValues(ctx.currentTime);
      bedGain.gain.setValueAtTime(target, ctx.currentTime);
    }
  }

  function bedTarget() {
    if (muted) return 0;
    return (bed === "file" ? 0.55 : 1) * userVolume;
  }

  function crossfade() {
    if (!bedGain || !ctx || muted) return;
    const t = ctx.currentTime;
    const target = bedTarget();
    const now = Math.max(0.0001, bedGain.gain.value || target);
    bedGain.gain.cancelScheduledValues(t);
    bedGain.gain.setValueAtTime(now, t);
    bedGain.gain.linearRampToValueAtTime(Math.max(0.0001, target * 0.65), t + 0.03);
    bedGain.gain.linearRampToValueAtTime(target, t + 0.09);
  }

  function ensureSong() {
    if (song) return;
    const el = document.createElement("audio");
    el.loop = false;
    el.playsInline = true;
    el.preload = "auto";
    el.volume = muted ? 0 : SONG_VOL * userVolume;
    el.setAttribute("playsinline", "");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none";
    document.body.appendChild(el);
    song = el;
  }

  function noteMusic(text) {
    const root = document.documentElement;
    if (!text) {
      delete root.dataset.musicNote;
      return;
    }
    root.dataset.musicNote = text;
    try {
      window.dispatchEvent(new CustomEvent("lumen-music-note", { detail: text }));
    } catch { /* the page may not be listening yet */ }
  }

  function useSynth() {
    playGen += 1;
    playState = null;
    if (song && !song.paused) {
      try { song.pause(); } catch { /* already stopped */ }
    }
    bedKnown = true;
    bed = unlocked ? "synth" : "wait";
    delete document.documentElement.dataset.musicTrack;
    if (unlocked) {
      mark("synth");
      applyGains();
      armScheduler();
      publish();
    }
  }

  function markFilePlaying() {
    if (!song || song.paused || song.error) return;
    bedKnown = true;
    bed = "file";
    delete document.documentElement.dataset.musicError;
    mark("play", song.currentTime);
    applyGains();
    publish();
  }

  function playCurrent(gen) {
    if (!song || muted) return;
    const pending = song.play();
    if (pending && typeof pending.then === "function") {
      pending.then(() => {
        if (gen !== playGen) return;
        markFilePlaying();
      }).catch((err) => {
        if (gen !== playGen) return;
        document.documentElement.dataset.musicError = (err && err.name) || "play";
        if (playState) failTrack();
        else useSynth();
      });
    }
  }

  function armTrack() {
    if (!playState || !playState.tracks.length) {
      useSynth();
      return;
    }
    ensureSong();
    const track = playState.tracks[playState.index];
    if (!track || !track.url) {
      stepPlaylist("error");
      return;
    }
    const gen = ++playGen;
    const label = track.name || track.url;
    if (label) document.documentElement.dataset.musicTrack = String(label);
    song.loop = playState.tracks.length === 1;
    song.onended = () => {
      if (gen !== playGen || song.loop) return;
      stepPlaylist("end");
    };
    song.onerror = () => {
      if (gen !== playGen) return;
      failTrack();
    };
    try { song.pause(); } catch { /* swap */ }
    song.src = track.url;
    playCurrent(gen);
  }

  function stepPlaylist(event) {
    if (!playState) return;
    playState = advancePlaylist(playState, event);
    if (!playState || playState.action === "synth") useSynth();
    else armTrack();
  }

  // Same step as a track ending: shuffle avoids the song that just played,
  // ordered wraps, and one file starts again.
  let skipQueued = false;
  function skip() {
    if (bedPlan === "pending") {
      skipQueued = true;
      loadCatalog().then(() => {
        if (!skipQueued) return;
        skipQueued = false;
        skip();
      });
      return true;
    }
    if (!playState || playState.action === "synth" || !playState.tracks.length) return false;
    stepPlaylist("end");
    return true;
  }

  function failTrack() {
    if (failGen === playGen) return;
    failGen = playGen;
    stepPlaylist("error");
  }

  function playSymphony() {
    ensureSong();
    if (!song || muted) return;
    song.loop = true;
    song.onerror = () => useSynth();
    if (!song.src) song.src = "/symphony.mp4";
    if (!song.paused) {
      bed = "file";
      mark("play", song.currentTime);
      applyGains();
      return;
    }
    playCurrent(playGen);
  }

  function probeSymphony() {
    playSymphony();
    fetch("/symphony.mp4", { method: "HEAD" }).then((res) => {
      if (chooseBed(res.status, true) === "synth") useSynth();
    }).catch(() => { /* play() rejects, or the element fires error */ });
  }

  function applyCatalog(info) {
    if (info && info.message) noteMusic(info.message);
    else noteMusic("");
    if (info && info.ok && Array.isArray(info.tracks) && info.tracks.length) {
      bedPlan = "playlist";
      playState = freshPlaylist(info.tracks, info.order);
      return;
    }
    playState = null;
    bedPlan = info && info.message ? "synth" : "symphony";
  }

  function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch("/music.json")
        .then((res) => (res.ok ? res.json() : null))
        .then((info) => {
          applyCatalog(info);
          return info;
        })
        .catch(() => {
          bedPlan = "symphony";
          return null;
        });
    }
    return catalogPromise;
  }

  loadCatalog();

  function playFile() {
    if (bedPlan === "playlist" && playState) {
      if (song && !song.paused) {
        bed = "file";
        mark("play", song.currentTime);
        applyGains();
        return;
      }
      armTrack();
      return;
    }
    playSymphony();
  }

  function probeFile() {
    if (fileTried) {
      if (bed === "file") playFile();
      return;
    }
    fileTried = true;
    loadCatalog().then(() => {
      if (bedPlan === "playlist") {
        armTrack();
        return;
      }
      if (bedPlan === "synth") {
        useSynth();
        return;
      }
      probeSymphony();
    });
  }

  function begin(fromUser) {
    if (muted) return;
    if (!fromUser) return;
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
    if (!c) return;
    unlocked = true;
    if (bed === "wait") bed = "synth";
    armScheduler();
    mark(bed === "file" ? "play" : "synth");
    publish();
    probeFile();
  }

  function fromMute(e) {
    const t = e.target;
    return !!(t && t.closest && t.closest("#mute"));
  }

  function onGesture(e) {
    if (e.repeat || muted || fromMute(e)) return;
    begin(true);
  }

  window.addEventListener("keydown", onGesture, true);
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("touchstart", onGesture, { capture: true, passive: true });

  function unlock() {
    if (muted || !unlocked) return;
    if (ctx && ctx.state === "suspended") ctx.resume();
    armScheduler();
  }

  function duck(amount) {
    if (ctx && duckGain && !muted) {
      const t = ctx.currentTime;
      const now = duckGain.gain.value;
      duckGain.gain.cancelScheduledValues(t);
      duckGain.gain.setValueAtTime(now, t);
      duckGain.gain.linearRampToValueAtTime(amount, t + 0.02);
      duckGain.gain.linearRampToValueAtTime(1, t + 0.2);
    }
    if (song && bed === "file" && !muted) {
      const full = SONG_VOL * userVolume;
      song.volume = full * amount;
      if (fileTimer) clearTimeout(fileTimer);
      fileTimer = setTimeout(() => {
        if (song && !muted && bed === "file") song.volume = SONG_VOL * userVolume;
      }, 200);
    }
  }

  function tone(freq, dur, type, gain, opt) {
    if (muted || !ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
    duck(opt && opt.duck === "voice" ? 0.84 : 0.72);
  }

  function jump() { tone(520, 0.12, "triangle", 0.5); }
  function slide() { tone(180, 0.14, "sine", 0.35); }
  function coin() { tone(880, 0.08, "sine", 0.4); tone(1320, 0.12, "sine", 0.25); }
  function pickup(kind) {
    if (kind === "gem") {
      tone(660, 0.08, "sine", 0.36);
      tone(880, 0.1, "triangle", 0.4);
      tone(1320, 0.16, "sine", 0.32);
    } else if (kind === "star") {
      tone(784, 0.08, "sine", 0.38);
      tone(1176, 0.14, "triangle", 0.32);
    } else if (kind === "apple") {
      tone(620, 0.08, "sine", 0.36);
      tone(880, 0.12, "triangle", 0.26);
    } else if (kind === "blossom") {
      tone(740, 0.08, "sine", 0.34);
      tone(988, 0.12, "sine", 0.24);
    } else coin();
  }
  function cheer() {
    tone(523, 0.1, "triangle", 0.4);
    tone(659, 0.12, "triangle", 0.34);
    tone(784, 0.18, "sine", 0.3);
  }
  function rise() { tone(392, 0.08, "sine", 0.28); tone(523, 0.14, "triangle", 0.32); }
  function nice() { tone(660, 0.08, "triangle", 0.36); tone(880, 0.12, "sine", 0.28); }
  function spring() { tone(420, 0.16, "triangle", 0.4); }
  function die() { tone(392, 0.18, "sine", 0.28); tone(330, 0.28, "sine", 0.22); }
  function keep() { tone(523, 0.1, "triangle", 0.3); tone(659, 0.14, "triangle", 0.25); }
  function land() { tone(140, 0.07, "sine", 0.3); }
  function near() { tone(740, 0.06, "sine", 0.22); tone(980, 0.08, "triangle", 0.12); }
  function pop() { tone(180, 0.09, "sine", 0.4); tone(520, 0.12, "triangle", 0.28); }
  function ward() { tone(494, 0.09, "sine", 0.14); tone(740, 0.14, "triangle", 0.1); }

  function noteVoice() {
    const voice = voiceForBeat(0);
    const root = document.documentElement;
    root.dataset.voice = voice.name;
    root.dataset.pitch = String(voice.pitch);
    const log = window.__voiceLog || (window.__voiceLog = []);
    log.push({ voice: voice.name, pitch: voice.pitch, freq: voice.freq, type: voice.type });
    if (log.length > 80) log.shift();
  }

  function music(reduced) {
    if (muted) return;
    if (bed === "file" && song && !song.paused) {
      mark("play", song.currentTime);
      return;
    }
    if (bed !== "synth" || reduced || !ctx) return;
    if (ctx.currentTime < nextBeat) return;
    const voice = voiceForBeat(0);
    tone(voice.freq, 0.35, voice.type, 0.12, { duck: "voice" });
    nextBeat = ctx.currentTime + 0.5;
    mark("synth");
    noteVoice();
  }

  function pushWant(kind) {
    if (!kind) return;
    if (kind === "level") {
      for (let i = want.length - 1; i >= 0; i -= 1) if (want[i] === "level") want.splice(i, 1);
      want.push("level");
      return;
    }
    if (want.length >= 2) want.shift();
    want.push(kind);
  }

  function follow(snap) {
    if (!snap) return;
    if (Number.isFinite(snap.speed)) live.speed = snap.speed;
    if (Number.isFinite(snap.level)) live.level = snap.level;
    live.reduced = !!snap.reduced;
    const combo = snap.combo | 0;
    if (combo >= 3 && combo !== lastCombo) {
      lastCombo = combo;
      pushWant("combo");
    } else if (combo < 3) lastCombo = 0;
    if (snap.near) pushWant("near");
    if (snap.hit) pushWant("hit");
    if (snap.shield) pushWant("shield");
    const level = live.level | 0;
    if (seenLevel < 0) seenLevel = level || 1;
    else if (level > seenLevel) {
      seenLevel = level;
      pushWant("level");
    } else seenLevel = level;
  }

  function tuneKeep(spec) {
    const phrase = acceptPhrase(spec);
    if (!phrase) return musicState();
    if (book.current.id === phrase.id && !(book.pending && book.pending.op === "keep")) return musicState();
    if (book.pending && book.pending.op === "keep" && book.pending.phrase.id === phrase.id) return musicState();
    const offered = offerKeep(book, phrase);
    if (offered.verdict === "KEEP") book = offered.book;
    publish();
    return musicState();
  }

  function tuneRollback(spec) {
    // No payload is the debug hook: cancel a phrase that has not started,
    // or queue the previous one. A server rollback names the phrase that
    // remains, so a rejected proposal does not undo a phrase already playing.
    if (!spec) {
      book = offerRollback(book).book;
    } else {
      const phrase = acceptPhrase(spec);
      if (book.pending && book.pending.op === "keep") {
        book = { current: book.current, previous: book.previous, pending: null };
      } else if (phrase && phrase.id !== book.current.id) {
        book = { current: book.current, previous: book.previous, pending: { op: "restore", phrase } };
      }
    }
    pushWant("rollback");
    publish();
    return musicState();
  }

  function resetTune() {
    book = createBook(check(HOME).phrase);
    bpm = tempoFor(book.current.tempo, live.speed, live.level);
    layers = layersFor(book.current.layers, live.speed, live.level, live.reduced);
    swing = book.current.swing;
    seenLevel = -1;
    lastCombo = 0;
    want.length = 0;
    levelQueued = false;
    fxKind = "";
    bendMul = 1;
    bendUntil = 0;
    step = 0;
    if (ctx) nextTime = ctx.currentTime + 0.06;
    publish();
  }

  function peak(role, phrase) {
    let g = (NOTE_GAIN[role] || 0.02) * (phrase.gain / 0.12);
    const osc = role === "pad" ? phrase.pad : phrase.tone;
    if ((role === "melody" || role === "pad") && osc === "square") g *= 0.45;
    return Math.min(0.06, Math.max(0.004, g));
  }

  function scheduleNote(when, freq, dur, type, gain, attack, release) {
    if (!ctx || muted || active >= MAX_VOICES) return;
    if (when < ctx.currentTime - 0.02) return;
    const oscType = type === "square" || type === "triangle" || type === "sine" ? type : "sine";
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const peakGain = Math.min(0.06, Math.max(0.004, gain));
    const atk = Math.max(0.005, attack || 0.01);
    const rel = Math.max(0.03, release || dur);
    o.type = oscType;
    o.frequency.setValueAtTime(Math.max(40, freq), when);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peakGain, when + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, when + atk + rel);
    o.connect(g);
    g.connect(busFilter);
    active += 1;
    o.onended = () => {
      active = Math.max(0, active - 1);
      try { o.disconnect(); g.disconnect(); } catch { /* already gone */ }
    };
    o.start(when);
    o.stop(when + atk + rel + 0.03);
    return o;
  }

  function punchFilter(mul, recover) {
    if (!busFilter || !ctx) return;
    const t = ctx.currentTime;
    const base = Math.max(280, Math.min(1600, book.current.cutoff));
    const dipped = Math.max(180, Math.min(1800, base * mul));
    busFilter.frequency.cancelScheduledValues(t);
    busFilter.frequency.setValueAtTime(busFilter.frequency.value || base, t);
    busFilter.frequency.linearRampToValueAtTime(dipped, t + 0.03);
    busFilter.frequency.linearRampToValueAtTime(base, t + Math.max(0.18, recover));
  }

  function applyEffect(kind, when) {
    const spec = effectFor(kind);
    if (!spec) return null;
    fxKind = kind;
    if (spec.lift && !liftedThisBar) levelQueued = true;
    if (kind === "hit") {
      bendMul = spec.bend;
      bendUntil = when + 60 / bpm;
      punchFilter(spec.filter, 60 / bpm);
    } else if (kind === "shield") {
      bendMul = spec.bend;
      bendUntil = when + 60 / bpm;
      punchFilter(Math.min(spec.filter, 1.08), 60 / bpm);
    }
    return spec;
  }

  function freqFor(phrase, role, when, kind, index) {
    let hz = 440;
    if (role === "melody") hz = hzFor(phrase, phrase.motif[index % phrase.motif.length], 5);
    else if (role === "bass") hz = hzFor(phrase, chordRoot(phrase, index), 3);
    else if (role === "pad") hz = hzFor(phrase, chordRoot(phrase, index), 4);
    else if (role === "kick" || role === "fill") hz = 150;
    else if (role === "snare") hz = 220;
    else if (role === "hat") hz = 880;
    else if (role === "stinger") {
      if (kind === "rollback" || kind === "hit") hz = hzFor(phrase, 0, 4);
      else hz = hzFor(phrase, 4, 5);
    }
    if ((role === "melody" || role === "bass") && when < bendUntil) hz *= bendMul;
    return hz;
  }

  function scheduleRole(phrase, role, when, kind, index) {
    if (bed === "file" && role !== "fill" && role !== "stinger") return;
    const dur = role === "melody" ? 0.18 : role === "bass" || role === "pad" ? 0.34 : role === "stinger" ? 0.12 : 0.07;
    const type = role === "melody" ? phrase.tone
      : role === "pad" ? phrase.pad
      : role === "snare" || role === "hat" ? "triangle"
      : "sine";
    const attack = role === "melody" ? phrase.attack : role === "pad" ? phrase.padAtk : 0.005;
    const release = role === "melody" ? phrase.release : role === "pad" ? phrase.padRel : dur;
    const osc = scheduleNote(when, freqFor(phrase, role, when, kind, index), dur, type, peak(role, phrase), attack, release);
    if (osc && (role === "kick" || role === "fill")) {
      osc.frequency.setValueAtTime(150, when);
      osc.frequency.exponentialRampToValueAtTime(55, when + 0.08);
    }
  }

  function prepareBar(when) {
    barStart = when;
    liftedThisBar = false;
    const levelHere = want.includes("level");
    let changed = false;
    if (book.pending) {
      book = atBar(book);
      changed = true;
      levelQueued = false;
      if (levelHere) liftedThisBar = true;
    } else if (levelQueued || levelHere) {
      levelQueued = false;
      liftedThisBar = true;
      const lifted = liftKey(book.current);
      if (lifted.id !== book.current.id) {
        const offered = offerKeep(book, lifted);
        if (offered.verdict === "KEEP") {
          book = atBar(offered.book);
          changed = true;
        }
      }
    }
    const phrase = book.current;
    bpm = tempoFor(phrase.tempo, live.speed, live.level);
    layers = layersFor(phrase.layers, live.speed, live.level, live.reduced);
    swing = phrase.swing;
    if (busFilter) {
      const cut = Math.max(280, Math.min(1600, phrase.cutoff));
      busFilter.frequency.setValueAtTime(cut, ctx.currentTime);
    }
    if (changed) crossfade();
    publish();
  }

  function scheduleStep(when, index) {
    let extras = null;
    let kind = "";
    if (want.length) {
      kind = want.shift();
      extras = applyEffect(kind, when);
    }
    const phrase = book.current;
    const accent = bed === "file";
    const roles = rolesAt(phrase, index, accent ? 1 : layers, extras);
    for (const role of roles) {
      if (accent && role !== "fill" && role !== "stinger") continue;
      scheduleRole(phrase, role, when, kind, index);
    }
  }

  function pump() {
    if (!ctx || muted || ctx.state !== "running" || !bedKnown) return;
    if (nextTime < ctx.currentTime - 0.05) {
      nextTime = ctx.currentTime + 0.05;
      step = 0;
      return;
    }
    const horizon = ctx.currentTime + 0.12;
    let guard = 0;
    while (nextTime < horizon && guard < 4) {
      if (step === 0) prepareBar(nextTime);
      scheduleStep(nextTime, step);
      step = (step + 1) % 8;
      if (step === 0) nextTime = barStart + (240 / bpm);
      else nextTime = stepTime(barStart, step, bpm, swing);
      guard += 1;
    }
  }

  function armScheduler() {
    if (timer || !ctx) return;
    nextTime = ctx.currentTime + 0.06;
    step = 0;
    timer = setInterval(pump, 25);
  }

  function setMuted(v) {
    muted = !!v;
    applyGains();
    if (muted) {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (song && !song.paused) song.pause();
      mark("mute", song ? song.currentTime : 0);
      return;
    }
    begin(true);
  }

  function setVolume(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    userVolume = Math.max(0, Math.min(1, n));
    applyGains();
  }

  if (typeof window !== "undefined") {
    window.__musicState = () => musicState();
    window.__musicEvent = (kind) => {
      pushWant(String(kind || ""));
      return musicState();
    };
    window.__musicTrial = (form) => {
      const offered = offerKeep(book, form);
      if (offered.verdict === "KEEP") book = offered.book;
      publish();
      return { verdict: offered.verdict, why: offered.why, ...musicState() };
    };
    window.__musicRollback = () => tuneRollback(null);
  }

  publish();

  return {
    unlock, jump, slide, coin, pickup, cheer, rise, nice, spring, die, keep, land, near, pop, ward,
    music, setMuted, setVolume, follow, tuneKeep, tuneRollback, tuneHear: tuneKeep, resetTune, skip,
    get muted() { return muted; },
    get volume() { return userVolume; },
  };
}
