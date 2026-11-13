// Offline end-to-end: a local OpenAI-compatible server answers llm:chat.
// A kept obstacle phrase and a kept garden are rebound into the live
// rules. No real API key is used. When Chrome is installed, two
// headless frames show the sky actually changing.
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const port = 18766;
const webPort = 18081;
const MOTIF = "(seq (ground 6) (block 0 1) (hurdle 0.4 0.7) (ground 4) (gap 1.1) (ground 5))";
const SCENE = "(garden (sky 0.95 0.45 0.55) (ground 0.35 0.72 0.32) (flower tulip 0.85) (light 0.9))";

function connect(p) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: "127.0.0.1", port: p }, () => resolve(s));
    s.on("error", reject);
  });
}

function session(sock) {
  let buf = "";
  const waiters = [];
  sock._queue = [];
  sock.on("data", (c) => {
    buf += c.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      const w = waiters.shift();
      if (w) w(msg);
      else sock._queue.push(msg);
    }
  });
  return {
    send(obj) { sock.write(JSON.stringify(obj) + "\n"); },
    next() {
      if (sock._queue.length) return Promise.resolve(sock._queue.shift());
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}

async function readUntil(io, pred, limit = 30) {
  const got = [];
  for (let i = 0; i < limit; i++) {
    const m = await io.next();
    got.push(m);
    if (pred(m, got)) return got;
  }
  throw new Error("no match " + JSON.stringify(got.map((m) => m.op)));
}

function startMock() {
  const hits = { motif: 0, scene: 0, other: 0 };
  const server = http.createServer((req, res) => {
    if (req.method !== "POST") {
      res.writeHead(404);
      res.end();
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const scene = body.includes("(flower KIND") || body.includes("Suggest a different bright garden");
      const content = scene ? SCENE : MOTIF;
      if (scene) hits.scene += 1;
      else if (body.includes("obstacle") || body.includes("hurdle")) hits.motif += 1;
      else hits.other += 1;
      const payload = JSON.stringify({
        id: "mock",
        choices: [{ finish_reason: "stop", message: { role: "assistant", content } }],
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(payload);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, hits, base: `http://127.0.0.1:${addr.port}/v1` });
    });
  });
}

function startAura(log, base) {
  const child = spawn(aura, ["--quiet", "--preset", "dev", "--grant", "network", "core/main.aura"], {
    cwd: root,
    env: {
      ...process.env,
      AURA_RUNNER_PORT: String(port),
      AURA_EVO_LOG: path.join(root, "out", "evo.jsonl"),
      LLM_API_KEY: "mock-key",
      LLM_BASE_URL: base,
      LLM_MODEL: "mock-garden",
      LLM_TIMEOUT: "30",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let text = "";
  child.stdout.on("data", (c) => { text += c.toString(); });
  child.stderr.on("data", (c) => { text += c.toString(); });
  const ready = new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (text.includes("PORT ")) resolve(text);
      else if (child.exitCode !== null) reject(new Error("aura exited\n" + text));
      else if (Date.now() - t0 > 8000) reject(new Error("aura timeout\n" + text));
      else setTimeout(tick, 40);
    };
    tick();
  });
  return { child, ready, log: () => text };
}

async function drive() {
  const mock = await startMock();
  fs.mkdirSync(path.join(root, "out"), { recursive: true });
  const core = startAura(path.join(root, "out", "mock-llm.log"), mock.base);
  let sock;
  try {
    await core.ready;
    sock = await connect(port);
    const io = session(sock);
    io.send({ op: "hello", seed: 42 });
    let batch = await readUntil(io, (m) => m.op === "state");
    const welcome = batch.find((m) => m.op === "welcome");
    if (!welcome || welcome.flower !== "daisy") {
      throw new Error("welcome garden " + JSON.stringify(welcome));
    }
    if (welcome.alive === false) throw new Error("welcome already ended");
    let sawMotif = false;
    let sawScene = false;
    let sawCue = false;
    let maxChunks = 0;
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline && !(sawMotif && sawScene && sawCue)) {
      io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
      batch = await readUntil(io, (m) => m.op === "state", 40);
      for (const m of batch) {
        if (m.op === "state") {
          if (m.alive === false) throw new Error("run ended " + JSON.stringify(m));
          if (typeof m.chunks === "number") maxChunks = Math.max(maxChunks, m.chunks);
          if (m.motif === MOTIF) sawMotif = true;
          if (typeof m.scene === "string" && m.scene.includes("tulip")) sawScene = true;
          if (Array.isArray(m.sky) && m.sky[0] > 0.9 && m.sky[1] < 0.6) sawScene = true;
        }
        if (m.op === "rules") {
          if (m.via !== "rebind") throw new Error("rules via " + m.via);
          if (m.motif === MOTIF) sawMotif = true;
          if (typeof m.scene === "string" && m.scene.includes("tulip")) sawScene = true;
        }
        if (m.op === "decision" && m.kind === "KEEP" && m.arm === "scene" && m.cue) sawCue = true;
        if (JSON.stringify(m).includes("The light rested")) throw new Error("end card leaked into the protocol");
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    if (!sawMotif) throw new Error("obstacle phrase was not rebound; mock " + JSON.stringify(mock.hits) + "\n" + core.log());
    if (!sawScene) throw new Error("garden was not rebound; mock " + JSON.stringify(mock.hits) + "\n" + core.log());
    if (!sawCue) throw new Error("scene KEEP had no cue");
    if (mock.hits.motif < 1 || mock.hits.scene < 1) {
      throw new Error("mock did not see both prompts " + JSON.stringify(mock.hits));
    }
    if (maxChunks > 16) throw new Error("chunks grew to " + maxChunks);
    io.send({ op: "bye" });
    sock.end();
    sock = null;
    console.log(`mock llm rebind ok (chunks ${maxChunks}, prompts ${JSON.stringify(mock.hits)})`);
  } finally {
    if (sock) sock.destroy();
    core.child.kill("SIGTERM");
    await new Promise((r) => core.child.on("exit", r));
    await new Promise((r) => mock.server.close(r));
  }
}

function chromeBin() {
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    const p = "/usr/bin/" + name;
    if (fs.existsSync(p)) return p;
    if (name === "google-chrome" && fs.existsSync("/usr/local/bin/google-chrome")) return "/usr/local/bin/google-chrome";
  }
  return "";
}

async function shotColor(file) {
  const { execFileSync } = await import("node:child_process");
  const py = `
from PIL import Image
im = Image.open(${JSON.stringify(file)}).convert("RGB")
w, h = im.size
box = im.crop((int(w*0.25), 0, int(w*0.75), max(8, int(h*0.12))))
n = box.size[0] * box.size[1]
acc = [0, 0, 0]
for p in box.getdata():
    acc[0] += p[0]; acc[1] += p[1]; acc[2] += p[2]
r, g, b = (v / n for v in acc)
print(f"{r:.1f} {g:.1f} {b:.1f}")
`;
  return execFileSync("python3", ["-c", py], { encoding: "utf8" }).trim();
}

async function screenshots() {
  const bin = chromeBin();
  if (!bin) {
    console.log("screenshot skipped: no Chrome");
    return;
  }
  try {
    await import("node:child_process").then(({ execFileSync }) => {
      execFileSync("python3", ["-c", "import PIL"], { stdio: "ignore" });
    });
  } catch {
    const { execFileSync } = await import("node:child_process");
    execFileSync("python3", ["-m", "pip", "install", "--user", "pillow"], { stdio: "inherit" });
  }
  const mock = await startMock();
  const core = startAura("", mock.base);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-chrome-"));
  const dbg = 9333;
  let bridge;
  let chrome;
  try {
    await core.ready;
    bridge = spawn(process.execPath, ["bridge/server.mjs"], {
      cwd: root,
      env: { ...process.env, AURA_RUNNER_PORT: String(port), AURA_RUNNER_WEB: String(webPort) },
      stdio: "ignore",
    });
    await new Promise((r) => setTimeout(r, 300));
    chrome = spawn(bin, [
      "--headless=new",
      "--disable-gpu",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      `--window-size=1280,720`,
      `--remote-debugging-port=${dbg}`,
      `--user-data-dir=${dir}`,
      "--no-first-run",
      "--no-default-browser-check",
      `http://127.0.0.1:${webPort}/?seed=42`,
    ], { stdio: "ignore" });
    const list = await waitJson(`http://127.0.0.1:${dbg}/json`);
    const page = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    if (!page) throw new Error("no chrome page " + JSON.stringify(list.map((t) => t.type)));
    const cdp = await cdpClient(page.webSocketDebuggerUrl);
    await cdp.call("Page.enable");
    await cdp.call("Runtime.enable");
    const early = path.join(root, "out", "garden-before.png");
    const late = path.join(root, "out", "garden-after.png");
    await new Promise((r) => setTimeout(r, 400));
    await capture(cdp, early);
    const deadline = Date.now() + 20000;
    let sky = "";
    while (Date.now() < deadline) {
      const value = await cdp.call("Runtime.evaluate", {
        expression: "document.documentElement.dataset.sky || ''",
        returnByValue: true,
      });
      sky = value.result && value.result.value || "";
      const text = await cdp.call("Runtime.evaluate", {
        expression: "document.body.innerText",
        returnByValue: true,
      });
      const body = (text.result && text.result.value) || "";
      if (body.includes("The light rested") || body.includes("Run again")) {
        throw new Error("end card is on screen");
      }
      if (sky.startsWith("0.9") || sky.startsWith("0.8")) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    await new Promise((r) => setTimeout(r, 1200));
    await capture(cdp, late);
    const before = await shotColor(early);
    const after = await shotColor(late);
    const [br, bg, bb] = before.split(" ").map(Number);
    const [ar, ag, ab] = after.split(" ").map(Number);
    console.log(`screenshot sky before ${before} after ${after} dataset ${sky}`);
    if (!(ar > ab + 15 && ar > br + 10)) {
      throw new Error(`sky did not shift toward rose (before ${before}, after ${after}, dataset ${sky})`);
    }
    cdp.close();
  } finally {
    if (chrome) chrome.kill("SIGTERM");
    if (bridge) bridge.kill("SIGTERM");
    core.child.kill("SIGTERM");
    await new Promise((r) => core.child.on("exit", r));
    await new Promise((r) => mock.server.close(r));
  }
}

function waitJson(url) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      fetch(url).then((r) => r.json()).then(resolve).catch(() => {
        if (Date.now() - t0 > 8000) reject(new Error("chrome debug " + url));
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

async function capture(cdp, file) {
  const shot = await cdp.call("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
}

await drive();
await screenshots();
