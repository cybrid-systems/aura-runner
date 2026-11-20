// SwiftShader frames of two gated Biome EDSL worlds. The combo and the
// run position stay put when the picture changes.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const port = Number(process.env.AURA_RUNNER_PORT || 18981);
const webPort = Number(process.env.AURA_RUNNER_WEB || 18191);
const dbg = Number(process.env.SHOT_DBG || 9351);
const outDir = process.env.SHOT_DIR || "/opt/cursor/artifacts";

const LAVA = {
  id: "lava-canyon", label: "Lava Canyon", recipe: "mix",
  sky: [0.42, 0.16, 0.18], horizon: [0.86, 0.4, 0.22],
  fog: [0.55, 0.28, 0.22], fogAmt: 0.18, body: "sun",
  road: [0.7, 0.42, 0.28], curb: [0.42, 0.24, 0.16], ground: [0.22, 0.16, 0.16],
  surface: "lava", light: 0.78, mood: 0.84,
  particles: "embers", particleAmt: 0.36,
  props: [{ kind: "rock", density: 0.32, scale: 1.05 }, { kind: "arch", density: 0.18, scale: 0.95 }],
};
const ICE = {
  id: "aurora-ice", label: "Aurora Ice", recipe: "mix",
  sky: [0.16, 0.28, 0.48], horizon: [0.62, 0.86, 0.78],
  fog: [0.7, 0.86, 0.92], fogAmt: 0.16, body: "aurora",
  road: [0.72, 0.84, 0.92], curb: [0.55, 0.72, 0.84], ground: [0.28, 0.42, 0.62],
  surface: "ice", light: 0.78, mood: 0.28,
  particles: "snow", particleAmt: 0.3,
  props: [{ kind: "crystal", density: 0.3, scale: 1.15 }, { kind: "ring", density: 0.12, scale: 0.85 }],
};

function chromeBin() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  for (const name of ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    if (fs.existsSync(name)) return name;
  }
  return "";
}

function waitJson(url) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url).then((r) => r.json()).then(resolve).catch(() => {
        if (Date.now() - t0 > 20000) reject(new Error("chrome debug " + url));
        else setTimeout(tick, 80);
      });
    };
    tick();
  });
}

function cdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("cdp socket")));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return {
    async call(method, params) {
      await ready;
      const n = ++id;
      ws.send(JSON.stringify({ id: n, method, params }));
      return new Promise((resolve, reject) => pending.set(n, { resolve, reject }));
    },
    close() { ws.close(); },
  };
}

async function evalJson(cdp, expression) {
  const value = await cdp.call("Runtime.evaluate", {
    expression, awaitPromise: true, returnByValue: true,
  });
  if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails).slice(0, 500));
  return value.result && value.result.value;
}

async function capture(cdp, file) {
  const shot = await cdp.call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
}

const bin = chromeBin();
if (!bin) {
  console.error("no chrome");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(root, "out"), { recursive: true });

const coreLog = [];
const child = spawn(aura, ["--quiet", "--preset", "dev", "--grant", "network", "core/main.aura"], {
  cwd: root,
  env: { ...process.env, AURA_SANDBOX: "off", AURA_RUNNER_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (c) => coreLog.push(c.toString()));
child.stderr.on("data", (c) => coreLog.push(c.toString()));
const bridge = spawn(process.execPath, ["bridge/server.mjs"], {
  cwd: root,
  env: { ...process.env, AURA_RUNNER_PORT: String(port), AURA_RUNNER_WEB: String(webPort) },
  stdio: "ignore",
});

let chrome;
let cdp;
try {
  const t0 = Date.now();
  while (!coreLog.join("").includes("PORT ")) {
    if (Date.now() - t0 > 40000) throw new Error("aura timeout\n" + coreLog.join("").slice(-400));
    await new Promise((r) => setTimeout(r, 40));
  }
  await new Promise((r) => setTimeout(r, 250));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-evolved-"));
  chrome = spawn(bin, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--window-size=1280,720", "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${dbg}`, `--user-data-dir=${dir}`,
    "--no-first-run", "--no-default-browser-check", "about:blank",
  ], { stdio: "ignore" });
  const list = await waitJson(`http://127.0.0.1:${dbg}/json`);
  const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!page) throw new Error("no chrome page");
  cdp = cdpClient(page.webSocketDebuggerUrl);
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
  });
  await cdp.call("Page.navigate", { url: `http://127.0.0.1:${webPort}/?seed=42&stats=1` });
  const ready = await evalJson(cdp, `new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const chunks = window.__lumen && window.__lumen.chunks;
      if (typeof chunks === "number") resolve(chunks);
      else if (Date.now() - t0 > 20000) resolve(-1);
      else setTimeout(tick, 50);
    };
    tick();
  })`);
  if (!(ready >= 0)) throw new Error("page never heard the core");

  async function show(spec, file) {
    const probe = await evalJson(cdp, `(() => {
      window.__lumenSetCombo(4);
      const before = Number(document.documentElement.dataset.x || 0);
      window.__forceSpec = ${JSON.stringify(spec)};
      const el = document.getElementById("evo");
      if (el) {
        el.hidden = false;
        el.textContent = ${JSON.stringify("A new world: " + spec.label)};
        el.classList.add("show");
      }
      const parts = [];
      for (let i = 0; i < 3; i++) parts.push(window.__lumenTimeFrames(40));
      const last = parts[parts.length - 1];
      const after = Number(document.documentElement.dataset.x || 0);
      return {
        before, after,
        combo: document.documentElement.dataset.combo || "",
        biome: document.documentElement.dataset.biome || "",
        label: document.documentElement.dataset.biomeLabel || "",
        p50: last.p50, p95: last.p95,
        frames: parts.reduce((n, p) => n + p.n, 0),
        instances: last.instances,
        err: window.__lumenErr || "",
      };
    })()`);
    if (probe.err) throw new Error(probe.err);
    if (probe.biome !== spec.id) throw new Error("biome " + JSON.stringify(probe));
    if (probe.combo !== "4") throw new Error("combo reset " + JSON.stringify(probe));
    if (!(probe.after >= probe.before - 0.05)) throw new Error("run rewound " + JSON.stringify(probe));
    await capture(cdp, file);
    fs.copyFileSync(file, path.join(root, "out", path.basename(file)));
    console.log(`${spec.id} p50 ${probe.p50.toFixed(2)} ms p95 ${probe.p95.toFixed(2)} ms instances ${probe.instances} frames ${probe.frames} x ${probe.before} -> ${probe.after}`);
    return probe;
  }

  const gpu = await evalJson(cdp, `(() => {
    const gl = document.getElementById("view").getContext("webgl2");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
  })()`);
  const lava = await show(LAVA, path.join(outDir, "evolved-biome-1.png"));
  const ice = await show(ICE, path.join(outDir, "evolved-biome-2.png"));
  const summary = { gpu, lava, ice, width: 1280, height: 720 };
  fs.writeFileSync(path.join(outDir, "evolved-frame-times.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(root, "out", "evolved-frame-times.json"), JSON.stringify(summary, null, 2));
  console.log("gpu", gpu);
} finally {
  if (cdp) cdp.close();
  if (chrome) chrome.kill("SIGTERM");
  bridge.kill("SIGTERM");
  child.kill("SIGTERM");
}
