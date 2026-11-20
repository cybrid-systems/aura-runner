// Small synthesized cues, plus Symphony No. 29 when the bridge can see the
// recording. play() has to run inside the key, pointer, or touch listener.
// A later animation frame is no longer a user gesture, and the browser drops it.
// The piece goes straight to the speakers. Routing it through a media-element
// source leaves it silent while that context is still suspended.
//
// The soft line is one voice for the whole session. Pitch used to follow the
// clock, so the fallback hopped to a new note every beat. It stays on this
// voice until the player mutes; unmuting keeps the same one.

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

export function createAudio() {
  let ctx = null;
  let muted = false;
  let master = null;
  let song = null;
  let songState = "wait";
  let nextBeat = 0;
  const SONG_VOL = 0.8;

  function mark(state, time) {
    const root = document.documentElement;
    root.dataset.music = state;
    if (typeof time === "number") root.dataset.musicTime = time.toFixed(2);
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.18;
    master.connect(ctx.destination);
    return ctx;
  }

  function ensureSong() {
    if (song || songState === "soft") return;
    const el = document.createElement("audio");
    el.src = "/symphony.mp4";
    el.loop = true;
    el.playsInline = true;
    el.preload = "metadata";
    el.volume = SONG_VOL;
    el.setAttribute("playsinline", "");
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none";
    el.addEventListener("error", () => {
      song = null;
      songState = "soft";
      mark("soft");
    });
    document.body.appendChild(el);
    song = el;
  }

  function startSong(fromUser) {
    if (muted) return;
    if (fromUser) {
      const c = ensure();
      if (c && c.state === "suspended") c.resume();
      ensureSong();
    }
    if (!song || !song.paused) {
      if (song && !song.paused) mark("play", song.currentTime);
      return;
    }
    const pending = song.play();
    if (pending && typeof pending.then === "function") {
      pending.then(() => {
        if (!song || song.paused) return;
        songState = "play";
        delete document.documentElement.dataset.musicError;
        mark("play", song.currentTime);
      }).catch((err) => {
        document.documentElement.dataset.musicError = (err && err.name) || "play";
      });
    }
  }

  function fromMute(e) {
    const t = e.target;
    return !!(t && t.closest && t.closest("#mute"));
  }

  function onGesture(e) {
    if (e.repeat || muted || fromMute(e)) return;
    startSong(true);
  }

  window.addEventListener("keydown", onGesture, true);
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("touchstart", onGesture, { capture: true, passive: true });

  function unlock() {
    startSong(false);
  }

  function tone(freq, dur, type, gain) {
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
    if (song && !song.paused) {
      songState = "play";
      mark("play", song.currentTime);
      return;
    }
    if (songState !== "soft" || reduced || !ctx) return;
    if (ctx.currentTime < nextBeat) return;
    const voice = voiceForBeat(Math.floor(ctx.currentTime));
    tone(voice.freq, 0.35, voice.type, 0.12);
    nextBeat = ctx.currentTime + 0.5;
    mark("soft");
    noteVoice();
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.value = v ? 0 : 0.18;
    if (song) song.volume = v ? 0 : SONG_VOL;
    if (v) {
      if (song && !song.paused) song.pause();
      mark("mute", song ? song.currentTime : 0);
      return;
    }
    startSong(true);
  }

  return { unlock, jump, slide, coin, pickup, cheer, rise, nice, spring, die, keep, land, near, pop, ward, music, setMuted, get muted() { return muted; } };
}
