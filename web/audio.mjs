// Small synthesized cues. Nothing loads over the network, and the first
// gesture unlocks the audio context.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let master = null;
  let nextBeat = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === "suspended") c.resume();
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
  function spring() { tone(420, 0.16, "triangle", 0.4); }
  function die() { tone(392, 0.18, "sine", 0.28); tone(330, 0.28, "sine", 0.22); }
  function keep() { tone(523, 0.1, "triangle", 0.3); tone(659, 0.14, "triangle", 0.25); }
  function land() { tone(140, 0.07, "sine", 0.3); }
  function near() { tone(740, 0.06, "sine", 0.22); tone(980, 0.08, "triangle", 0.12); }
  function pop() { tone(180, 0.09, "sine", 0.4); tone(520, 0.12, "triangle", 0.28); }

  function music(reduced) {
    if (muted || !ctx || reduced) return;
    if (ctx.currentTime < nextBeat) return;
    const scale = [262, 294, 330, 392, 440];
    const f = scale[Math.floor(ctx.currentTime * 2) % scale.length];
    tone(f / 2, 0.35, "sine", 0.12);
    nextBeat = ctx.currentTime + 0.5;
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.value = v ? 0 : 0.18;
  }

  return { unlock, jump, slide, coin, spring, die, keep, land, near, pop, music, setMuted, get muted() { return muted; } };
}
