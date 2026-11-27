// A spoken wish must not sit inside http-post. The bridge proxy is on,
// the mock accepts a chat POST and never answers, and each tick still
// returns a state. The ask itself has thinking disabled.
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const port = Number(process.env.PROXY_PORT || 18793);
const TICK_MS = 800;

function cleanEnv(env) {
  delete env.LUMEN_DEEPSEEK_KEY;
  delete env.LUMEN_DEEPSEEK_URL;
  delete env.LUMEN_DEEPSEEK_MODEL;
  delete env.LUMEN_MINIMAX_KEY;
  delete env.LUMEN_LLM;
  delete env.LLM_API_KEY;
  delete env.LLM_BASE_URL;
  delete env.LLM_MODEL;
  return env;
}

function hangServer() {
  const hits = { n: 0 };
  const server = http.createServer((req, res) => {
    hits.n += 1;
    req.on("data", () => {});
    req.on("end", () => {});
    res.on("close", () => {});
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, hits, base: `http://127.0.0.1:${addr.port}/v1` });
    });
  });
}

function connect(p) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: "127.0.0.1", port: p }, () => resolve(sock));
    sock.on("error", reject);
  });
}

function session(sock) {
  let buf = "";
  const queue = [];
  const waiters = [];
  sock.on("data", (c) => {
    buf += c.toString("utf8");
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg = null;
      try { msg = JSON.parse(line); } catch { msg = { op: "bad" }; }
      const w = waiters.shift();
      if (w) w(msg); else queue.push(msg);
    }
  });
  return {
    send(obj) { sock.write(JSON.stringify(obj) + "\n"); },
    next(ms = TICK_MS) {
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("tick did not return")), ms);
        waiters.push((m) => { clearTimeout(t); resolve(m); });
      });
    },
  };
}

function startAura(base) {
  const env = cleanEnv({ ...process.env });
  env.AURA_RUNNER_PORT = String(port);
  env.LLM_API_KEY = "mock-key";
  env.LLM_BASE_URL = base;
  env.LLM_MODEL = "mock-garden";
  env.LLM_TIMEOUT = "30";
  env.LUMEN_MOTIF_GAP_MS = "600000";
  env.LUMEN_PALS_GAP_MS = "600000";
  env.LUMEN_SKIP_DREAM = "1";
  const child = spawn(aura, ["--quiet", "--preset", "dev", "--grant", "network", "core/main.aura"], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let text = "";
  child.stdout.on("data", (c) => { text += c.toString(); });
  child.stderr.on("data", (c) => { text += c.toString(); });
  const ready = new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (text.includes("PORT ")) resolve();
      else if (child.exitCode !== null) reject(new Error("aura exited\n" + text.slice(-1500)));
      else if (Date.now() - t0 > 30000) reject(new Error("aura timeout\n" + text.slice(-1500)));
      else setTimeout(tick, 40);
    };
    tick();
  });
  return { child, ready, log: () => text };
}

async function until(io, pred, limit = 30) {
  const got = [];
  for (let i = 0; i < limit; i++) {
    const msg = await io.next(TICK_MS);
    got.push(msg);
    if (pred(msg)) return got;
  }
  throw new Error("no match " + got.map((m) => m.op).join(","));
}

const hang = await hangServer();
const core = startAura(hang.base);
let sock;
try {
  await core.ready;
  sock = await connect(port);
  const io = session(sock);
  io.send({ op: "llm-proxy", ready: true });
  io.send({ op: "hello", seed: 7 });
  await until(io, (m) => m.op === "state");
  io.send({ op: "wish", text: "把颜色调得更暖一点", lang: "zh-CN", source: "voice" });
  io.send({ op: "tick", jump: 0, slide: 0, lane: 0, dt: 50, x: 1 });
  const first = await until(io, (m) => m.op === "state", 40);
  const asks = first.filter((m) => m.op === "llm-ask");
  if (!asks.length) {
    throw new Error("wish did not ask " + first.map((m) => m.op + (m.cue ? ":" + m.cue : "")).join(","));
  }
  for (const ask of asks) {
    const thinking = ask.thinking || {};
    if (thinking.type !== "disabled") throw new Error("thinking still on " + JSON.stringify(ask.thinking));
  }
  if (hang.hits.n !== 0) throw new Error("tick posted straight to the model " + hang.hits.n);
  for (let i = 0; i < 4; i++) {
    io.send({ op: "tick", jump: 0, slide: 0, lane: 0, dt: 50, x: 2 + i });
    await until(io, (m) => m.op === "state", 20);
  }
  if (hang.hits.n !== 0) throw new Error("a later tick posted " + hang.hits.n);
  io.send({ op: "bye" });
  console.log(`proxy wish ok asks ${asks.length} hung-posts ${hang.hits.n}`);
} finally {
  if (sock) sock.destroy();
  hang.server.close();
  if (core.child.exitCode === null && !core.child.killed) core.child.kill("SIGTERM");
}
