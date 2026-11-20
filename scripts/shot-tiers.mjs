// Headless Chrome frames of Garden, City, Space, and Aurora Ice at
// Low, Medium, and High. SwiftShader Low frame time is the budget that
// must stay put. GPU time is reported when the timer extension answers.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const port = Number(process.env.AURA_RUNNER_PORT || 18981);
const webPort = Number(process.env.AURA_RUNNER_WEB || 18191);
const dbg = Number(process.env.SHOT_DBG || 9352);
const outDir = process.env.SHOT_DIR || "/opt/cursor/artifacts/tiers";

const AURORA = {
  id: "aurora-ice",
  label: "Aurora Ice",
  recipe: "mix",
  sky: [0.16, 0.28, 0.48],
  horizon: [0.62, 0.86, 0.78],
  fog: [0.70, 0.86, 0.92],
  fogAmt: 0.16,
  body: "aurora",
  road: [0.72, 0.84, 0.92],
  curb: [0.55, 0.72, 0.84],
  ground: [0.28, 0.42, 0.62],
  surface: "ice",
  light: 0.78,
  mood: 0.28,
  particles: "snow",
  particleAmt: 0.30,
  props: [
    { kind: "crystal", density: 0.30, scale: 1.15 },
    { kind: "ring", density: 0.12, scale: 0.85 },
  ],
};

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
      try { value = get(); } catch { value = null; }
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

function cdpClient(wsUrl, problems) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("cdp socket")));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === "Runtime.exceptionThrown") {
      const text = msg.params && msg.params.exceptionDetails && msg.params.exceptionDetails.text;
      problems.push("exception " + (text || "unknown"));
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params && msg.params.type === "error") {
      const args = (msg.params.args || []).map((a) => a.value || a.description || "").join(" ");
      if (!/favicon/i.test(args)) problems.push("console " + args.slice(0, 240));
    } else if (msg.method === "Network.responseReceived") {
      const res = msg.params && msg.params.response;
      if (res && res.status >= 400) problems.push(res.status + " " + (res.url || ""));
    }
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
  if (value.exceptionDetails) throw new Error(JSON.stringify(value.exceptionDetails).slice(0, 400));
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
  env: { ...process.env, AURA_SANDBOX: "off", AURA_RUNNER_PORT: String(port), AURA_EVO_LOG: path.join(root, "out", "tier-evo.jsonl") },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", (c) => coreLog.push(c.toString()));
child.stderr.on("data", (c) => coreLog.push(c.toString()));
const bridge = spawn(process.execPath, ["bridge/server.mjs"], {
  cwd: root,
  env: { ...process.env, AURA_RUNNER_PORT: String(port), AURA_RUNNER_WEB: String(webPort) },
  stdio: "ignore",
});

const problems = [];
let chrome;
let cdp;
try {
  await waitFor(() => coreLog.join(""), (t) => t.includes("PORT "), 40000, "aura");
  await new Promise((r) => setTimeout(r, 250));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-tier-"));
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
  cdp = cdpClient(page.webSocketDebuggerUrl, problems);
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");
  await cdp.call("Network.enable");
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
    if (!(ready >= 0)) throw new Error("page never heard the core " + query);
    for (let i = 0; i < 12; i++) {
      await evalJson(cdp, `window.__lumenFrames ? window.__lumenFrames(4) : 0`);
    }
  }

  async function shoot(name, tier, file) {
    await evalJson(cdp, `window.__lumenFrames ? window.__lumenFrames(4) : 0`);
    await capture(cdp, file);
    const probe = await evalJson(cdp, `(() => {
      const view = document.getElementById("view");
      const q = window.__lumenQuality ? window.__lumenQuality() : {};
      return {
        biome: (view && view.dataset.biome) || document.documentElement.dataset.biome || "",
        tier: (view && view.dataset.tier) || "",
        mode: (view && view.dataset.quality) || "",
        fxaa: view && view.dataset.fxaa || "",
        ao: view && view.dataset.ao || "",
        grade: view && view.dataset.grade || "",
        blur: view && view.dataset.blur || "",
        shade: view && view.dataset.shade || "",
        reflect: view && view.dataset.reflect || "",
        hdr: view && view.dataset.hdr || "",
        shadow: view && view.dataset.shadow || "",
        bloom: view && view.dataset.bloom || "",
        renderer: view && view.dataset.renderer || "",
        err: window.__lumenErr || "",
        ceiling: q && q.ceiling || "",
        software: !!(q && q.software),
      };
    })()`);
    console.log(`shot ${name} ${tier} ${file} ${JSON.stringify(probe)}`);
    return probe;
  }

  const shots = [];
  const tiers = ["low", "medium", "high"];
  const venues = ["garden", "city", "space"];
  for (const tier of tiers) {
    for (const venue of venues) {
      await openGame(`quality=${tier}&venue=${venue}&shot=1`);
      const file = path.join(outDir, `${venue}-${tier}.png`);
      const probe = await shoot(venue, tier, file);
      shots.push({ scene: venue, tier, file, probe });
      if (probe.tier !== tier) throw new Error(`${venue} ${tier} drew ${probe.tier}`);
      if (probe.biome !== venue) throw new Error(`${venue} showed ${probe.biome}`);
      if (probe.err) throw new Error(probe.err);
      if (tier === "high" && probe.shade !== "high") throw new Error(venue + " high drew shade " + probe.shade);
      if (tier !== "high" && probe.shade === "high") throw new Error(venue + " " + tier + " used the high shade");
    }
    await openGame(`quality=${tier}&venue=garden&shot=1`);
    await evalJson(cdp, `window.__forceSpec = ${JSON.stringify(AURORA)}; window.__lumenFrames && window.__lumenFrames(6);`);
    const ice = path.join(outDir, `aurora-ice-${tier}.png`);
    const probe = await shoot("aurora-ice", tier, ice);
    shots.push({ scene: "aurora-ice", tier, file: ice, probe });
    if (probe.tier !== tier) throw new Error(`aurora ${tier} drew ${probe.tier}`);
    if (probe.biome !== "aurora-ice") throw new Error("aurora showed " + probe.biome);
    if (probe.err) throw new Error(probe.err);
    if (tier === "high" && probe.shade !== "high") throw new Error(name + " high drew shade " + probe.shade);
    if (tier !== "high" && probe.shade === "high") throw new Error(name + " " + tier + " used the high shade");
  }

  async function timeFrames(n) {
    await evalJson(cdp, `window.__lumenGpuTimer = true; true`);
    return evalJson(cdp, `window.__lumenTimeFrames(${n | 0}, true)`);
  }

  await openGame("quality=low&venue=garden&shot=1");
  const lowParts = [];
  for (let i = 0; i < 4; i++) lowParts.push(await timeFrames(45));
  const low = lowParts[lowParts.length - 1];
  const gpuName = await evalJson(cdp, `(() => {
    const gl = document.getElementById("view").getContext("webgl2");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || "") : "";
  })()`);
  console.log(`bench low garden p50 ${low.p50.toFixed(2)} ms p95 ${low.p95.toFixed(2)} ms work ${low.work} gpu ${low.gpu} ext ${low.gpuExt} renderer ${gpuName}`);

  const tiersTimed = { low };
  for (const tier of ["medium", "high"]) {
    await openGame(`quality=${tier}&venue=garden&shot=1`);
    const row = await timeFrames(8);
    tiersTimed[tier] = row;
    console.log(`bench ${tier} garden p50 ${row.p50.toFixed(2)} ms p95 ${row.p95.toFixed(2)} ms work ${row.work} gpu ${row.gpu} gpuN ${row.gpuN} fxaa ${row.fxaa} ao ${row.ao} grade ${row.grade} blur ${row.blur} hdr ${row.hdr}`);
  }

  await openGame("quality=high&venue=city&shot=1");
  await evalJson(cdp, `window.__lumenPassTimers = true; window.__lumenPace = 15; true`);
  const paced = await timeFrames(10);
  const paceShot = path.join(outDir, "city-high-pace.png");
  await capture(cdp, paceShot);
  console.log(`bench high city pace p50 ${paced.p50.toFixed(2)} ms p95 ${paced.p95.toFixed(2)} ms passes ${JSON.stringify(paced.passes)}`);
  shots.push({ scene: "city-pace", tier: "high", file: paceShot, passes: paced.passes, p50: paced.p50, p95: paced.p95 });
  await evalJson(cdp, `window.__lumenPace = 0; window.__lumenPassTimers = false; true`);

  const report = {
    gpu: gpuName,
    width: 1280,
    height: 720,
    shots,
    timing: tiersTimed,
    problems,
  };
  fs.writeFileSync(path.join(outDir, "tier-report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(root, "out", "tier-report.json"), JSON.stringify(report, null, 2));
  if (problems.length) {
    console.error("page problems\n" + problems.join("\n"));
    process.exitCode = 1;
  } else {
    console.log("tier shots ok, no console errors, no 4xx");
  }
} finally {
  if (cdp) cdp.close();
  if (chrome) chrome.kill("SIGTERM");
  bridge.kill("SIGTERM");
  child.kill("SIGTERM");
}
