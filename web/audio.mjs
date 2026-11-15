// Small synthesized cues, plus Symphony No. 29 when the bridge can see the
// recording. The first gesture unlocks the audio context and starts the piece.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let master = null;
  let musicGain = null;
  let song = null;
  let songState = "wait";
  let nextBeat = 0;

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
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = muted ? 0 : 0.35;
    musicGain.connect(ctx.destination);
    return ctx;
  }

  function ensureSong() {
    if (song || songState === "soft" || !ctx) return;
    const el = new Audio("/symphony.mp4");
    el.loop = true;
    el.preload = "metadata";
    try {
      ctx.createMediaElementSource(el).connect(musicGain);
    } catch {
      songState = "soft";
      mark("soft");
      return;
    }
    el.addEventListener("error", () => {
      song = null;
      songState = "soft";
      mark("soft");
    });
    song = el;
  }

  function startSong() {
    const c = ensure();
    if (!c || muted) return;
    if (c.state === "suspended") c.resume();
    ensureSong();
    if (!song || !song.paused) return;
    song.play().then(() => {
      songState = "play";
      mark("play", song.currentTime);
    }).catch(() => {});
  }

  function unlock() {
    startSong();
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

  function music(reduced) {
    if (!ctx || muted) return;
    if (song) {
      if (song.paused && ctx.state === "running") startSong();
      if (!song.paused) mark("play", song.currentTime);
      return;
    }
    if (songState !== "soft" || reduced) return;
    if (ctx.currentTime < nextBeat) return;
    const scale = [262, 294, 330, 392, 440];
    const f = scale[Math.floor(ctx.currentTime * 2) % scale.length];
    tone(f / 2, 0.35, "sine", 0.12);
    nextBeat = ctx.currentTime + 0.5;
    mark("soft");
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.value = v ? 0 : 0.18;
    if (musicGain) musicGain.gain.value = v ? 0 : 0.35;
    if (v) {
      if (song && !song.paused) song.pause();
      mark("mute", song ? song.currentTime : 0);
      return;
    }
    startSong();
  }

  return { unlock, jump, slide, coin, pickup, cheer, rise, nice, spring, die, keep, land, near, pop, music, setMuted, get muted() { return muted; } };
}
