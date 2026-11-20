// Flat garden for a browser with no WebGL2. The run stays on the page.
// Hit boxes stay in the sim; this only places readable marks.

import { palette, dressPalette } from "./render.mjs";
import { createQuality, probeCaps, setMode, noteReduced, DEFAULT_POLICY } from "./quality.mjs";

function css(rgb) {
  const c = rgb || [0, 0, 0];
  const n = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return `rgb(${n(c[0])},${n(c[1])},${n(c[2])})`;
}

export function createFallback(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const quality = createQuality(DEFAULT_POLICY, probeCaps({ webgl2: false, maxTex: 0, fboOk: false }));
  let w = 1;
  let h = 1;

  function resize() {
    const dpr = 1;
    w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.dataset.dpr = "1";
    canvas.dataset.renderer = "canvas2d";
  }

  function frame(st) {
    const view = st || {};
    const pal = dressPalette(palette(view.hue || 0, view.scene), view.biome, view.mood, view.spec);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, css(pal.sky0));
    sky.addColorStop(0.55, css(pal.sky));
    sky.addColorStop(1, css(pal.sky1));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = css(pal.grass);
    ctx.fillRect(0, h * 0.58, w, h * 0.42);
    ctx.fillStyle = css(pal.path);
    ctx.beginPath();
    const lane = view.lx || 0;
    const shift = -lane * w * 0.06;
    ctx.moveTo(w * 0.5 + shift - w * 0.05, h * 0.62);
    ctx.lineTo(w * 0.5 + shift + w * 0.05, h * 0.62);
    ctx.lineTo(w * 0.5 + shift * 0.2 + w * 0.28, h);
    ctx.lineTo(w * 0.5 + shift * 0.2 - w * 0.28, h);
    ctx.closePath();
    ctx.fill();
    const pz = Number.isFinite(view.x) ? view.x : 0;
    const pieces = Array.isArray(view.pieces) ? view.pieces : [];
    for (let i = 0; i < pieces.length; i++) {
      const q = pieces[i];
      const k = q[0];
      if (k === 0 || k === 1 || k === 2) continue;
      const z = q[1] - pz;
      if (z < -3 || z > 42) continue;
      const u = Math.max(0, Math.min(1, (z + 3) / 45));
      const scale = 1 - u * 0.72;
      const y = h * (0.78 - u * 0.34);
      const lat = q.length > 5 ? q[5] : 1;
      const laneOff = (lat < 0 ? 0 : (lat - 1)) * w * 0.12 * scale;
      const x = w * 0.5 + shift * (0.35 + scale * 0.4) + laneOff;
      const bw = Math.max(6, (k === 4 ? 70 : 28) * scale);
      const bh = Math.max(8, (k === 4 ? 18 : k === 10 ? 36 : 32) * scale);
      ctx.fillStyle = k === 5 ? css(pal.coin)
        : k === 10 ? css([0.95, 0.48, 0.22])
        : k === 4 ? css(pal.gate)
        : k === 7 ? css(pal.pot)
        : css(pal.hurdle);
      ctx.fillRect(x - bw * 0.5, y - bh, bw, bh);
    }
    const hy = h * 0.7 + (view.y || 0) * -18;
    ctx.fillStyle = "rgba(36, 18, 8, 0.28)";
    ctx.beginPath();
    ctx.ellipse(w * 0.5 + shift * 0.15, h * 0.78, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(pal.body);
    ctx.beginPath();
    ctx.arc(w * 0.5 + shift * 0.15, hy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = css(pal.head);
    ctx.beginPath();
    ctx.arc(w * 0.5 + shift * 0.15, hy - 18, 10, 0, Math.PI * 2);
    ctx.fill();
    canvas.dataset.instances = String(pieces.length);
    canvas.dataset.tier = quality.tier;
    canvas.dataset.quality = quality.mode;
    canvas.dataset.renderer = "canvas2d";
    canvas.dataset.shadow = "0";
    canvas.dataset.bloom = "0";
    return pieces.length;
  }

  return {
    gl: null,
    kind: "canvas2d",
    resize,
    frame,
    noteFrameTime() {},
    setQualityMode(mode) { setMode(quality, mode, performance.now()); },
    setReduced(v) { noteReduced(quality, v, performance.now()); },
    setVisible() {},
    qualitySnapshot() {
      return {
        mode: quality.mode,
        tier: quality.tier,
        renderer: "canvas2d",
        ceiling: "low",
        floatFb: false,
        software: false,
      };
    },
  };
}
