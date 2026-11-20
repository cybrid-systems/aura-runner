// SwiftShader shots and frame times for Garden, City, and Space.
// Headless Chrome pauses animation frames, so the page is stepped by hand.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const port = Number(process.env.AURA_RUNNER_PORT || 18971);
const webPort = Number(process.env.AURA_RUNNER_WEB || 18181);
const dbg = Number(process.env.SHOT_DBG || 9341);
const outDir = process.env.SHOT_DIR || "/opt/cursor/artifacts";

function chromeBin() {
  if (process.env.CHROME_BIN && fs.existsSync(process.env.CHROME_BIN)) return process.env.CHROME_BIN;
  for (const name of ["/usr/bin/google-chrome", "/usr/local/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]) {
    if (fs.existsSync(name)) return name;
  }
  return "";
}

function waitFor(get, pred, ms, label) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let value;
      try { value = get(); } catch (err) { value = null; }
      if (pred(value)) resolve(value);
      else if (Date.now() - t0 > ms) reject(new Error("timeout " + label + " " + JSON.stringify(value)));
      else setTimeout(tick, 40);
    };
    tick();
  });
}

function waitJson(url) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url).then((r) => r.json()).then(resolve).catch(() => {
        if (Date.now() - t0 > 15000) reject(new Error("chrome debug " + url));
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
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return value.result && value.result.value;
}

async function capture(cdp, file) {
  const shot = await cdp.call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
}

async function pump(cdp, n) {
  await evalJson(cdp, `(() => {
    const count = ${n | 0};
    if (window.__lumenFrames) window.__lumenFrames(count);
    else if (window.__lumenPump) window.__lumenPump();
    return count;
  })()`);
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
  env: { ...process.env, AURA_SANDBOX: "off", AURA_RUNNER_PORT: String(port), AURA_EVO_LOG: path.join(root, "out", "shot-evo.jsonl") },
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
  await waitFor(() => coreLog.join(""), (t) => t.includes("PORT "), 40000, "aura");
  await new Promise((r) => setTimeout(r, 250));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-shot-"));
  chrome = spawn(bin, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--window-size=1280,720",
    `--remote-debugging-port=${dbg}`,
    `--user-data-dir=${dir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
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

  async function openGame(query) {
    await cdp.call("Page.navigate", { url: `http://127.0.0.1:${webPort}/?seed=42&${query}` });
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
    for (let i = 0; i < 20; i++) await pump(cdp, 4);
  }

  async function sayAndShoot(word, lang, biome, file) {
    let sent = false;
    for (let i = 0; i < 20 && !sent; i++) {
      sent = await evalJson(cdp, `window.__lumenSay(${JSON.stringify(word)}, ${JSON.stringify(lang)})`);
      if (!sent) await pump(cdp, 2);
    }
    if (!sent) throw new Error("wish did not send " + word);
    let probe = {};
    for (let i = 0; i < 40; i++) {
      await pump(cdp, 2);
      probe = await evalJson(cdp, `({
        biome: document.documentElement.dataset.biome || "",
        mood: document.documentElement.dataset.mood || "",
        banner: document.documentElement.dataset.banner || "",
        evo: (document.getElementById("evo") && document.getElementById("evo").textContent) || "",
        mult: document.documentElement.dataset.mult || "",
        instances: document.getElementById("view").dataset.instances || "",
        level: document.documentElement.dataset.level || "",
        gpu: document.getElementById("view").dataset.dpr || ""
      })`);
      if (probe && probe.biome === biome && probe.banner) break;
    }
    if (!probe || probe.biome !== biome || !probe.banner) {
      throw new Error("banner missing " + biome + " " + JSON.stringify(probe));
    }
    await evalJson(cdp, `(() => {
      window.__lumenHoldBanner = true;
      const el = document.getElementById("evo");
      if (el && el.textContent) {
        el.hidden = false;
        el.classList.add("show");
      }
      if (window.__lumenFrames) window.__lumenFrames(2);
      return el ? el.textContent : "";
    })()`);
    await capture(cdp, file);
    console.log(`shot ${biome} ${file} ${JSON.stringify(probe)}`);
  }

  if (process.env.SHOT_SKIP !== "1") {
    await openGame("shot=1");
    await sayAndShoot("花园", "zh", "garden", path.join(outDir, "garden.png"));
    await sayAndShoot("城市", "zh", "city", path.join(outDir, "city.png"));
    await sayAndShoot("太空", "zh", "space", path.join(outDir, "space.png"));
    if (process.env.SHOT_CITIES !== "0") {
      await sayAndShoot("北京", "zh", "beijing", path.join(outDir, "beijing.png"));
      await sayAndShoot("旧金山", "zh", "sanfrancisco", path.join(outDir, "sanfrancisco.png"));
      await sayAndShoot("巴黎", "zh", "paris", path.join(outDir, "paris.png"));
    }
  }

  async function bench(venue) {
    await openGame(`venue=${venue}`);
    const row = await evalJson(cdp, `(() => {
      const parts = [];
      for (let i = 0; i < 4; i++) parts.push(window.__lumenTimeFrames(45));
      const samples = parts.flatMap((p) => [p.p50, p.p95]);
      const last = parts[parts.length - 1];
      return { frames: parts.reduce((n, p) => n + p.n, 0), p50: last.p50, p95: last.p95, instances: last.instances, biome: last.biome, parts };
    })()`);
    const gpu = await evalJson(cdp, `(() => {
      const gl = document.getElementById("view").getContext("webgl2");
      const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
    })()`);
    row.gpu = gpu;
    console.log(`bench ${venue} p50 ${row.p50.toFixed(2)} ms p95 ${row.p95.toFixed(2)} ms instances ${row.instances} frames ${row.frames} gpu ${gpu}`);
    return row;
  }

  if (process.env.BENCH_SKIP !== "1") {
    const rows = {};
    const venues = ["garden", "city", "space"];
    if (process.env.SHOT_CITIES !== "0") venues.push("beijing", "sanfrancisco", "paris");
    for (const venue of venues) rows[venue] = await bench(venue);
    fs.writeFileSync(path.join(outDir, "frame-times.json"), JSON.stringify(rows, null, 2));
    console.log("frame-times", JSON.stringify(rows));
  }
} finally {
  if (cdp) cdp.close();
  if (chrome) chrome.kill("SIGTERM");
  bridge.kill("SIGTERM");
  child.kill("SIGTERM");
}
