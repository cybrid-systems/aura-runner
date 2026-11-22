// Biome EDSL end to end. A voice ask with no key is gated offline and
// entered without rewinding the run. With a mock model, the voice ask
// KEEP's a spec. A world is not dreamed on a clock.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const AURA_START_MS = Number(process.env.AURA_START_MS || 30000);
const LAVA = "(biome lava-canyon (label Lava-Canyon) (sky 0.42 0.16 0.18 0.86 0.40 0.22) (fog 0.55 0.28 0.22 0.18) (body sun) (road 0.70 0.42 0.28) (curb 0.42 0.24 0.16) (ground 0.22 0.16 0.16) (surface lava) (light 0.78) (mood 0.84) (particles embers 0.36) (props (rock 0.32 1.05) (arch 0.18 0.95)) (recipe mix))";

function cleanEnv(env) {
  delete env.LUMEN_DEEPSEEK_KEY;
  delete env.LUMEN_MINIMAX_KEY;
  delete env.LUMEN_LLM;
  delete env.LLM_API_KEY;
  delete env.LLM_BASE_URL;
  delete env.LLM_MODEL;
  return env;
}

function connect(port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: "127.0.0.1", port }, () => resolve(sock));
    sock.on("error", reject);
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
    next(ms = 25000) {
      if (sock._queue.length) return Promise.resolve(sock._queue.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("read timeout")), ms);
        waiters.push((msg) => { clearTimeout(timer); resolve(msg); });
      });
    },
  };
}

async function readUntil(io, pred, limit = 40) {
  const got = [];
  for (let i = 0; i < limit; i++) {
    const msg = await io.next();
    got.push(msg);
    if (pred(msg, got)) return got;
  }
  throw new Error("no match " + JSON.stringify(got.slice(-6).map((m) => m.op + ":" + (m.arm || m.biome || ""))));
}

function startAura(port, env) {
  const child = spawn(aura, ["--quiet", "--preset", "dev", "--grant", "network", "core/main.aura"], {
    cwd: root,
    env: { ...env, AURA_RUNNER_PORT: String(port), AURA_SANDBOX: "off" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let text = "";
  child.stdout.on("data", (c) => { text += c.toString(); });
  child.stderr.on("data", (c) => { text += c.toString(); });
  try { fs.unlinkSync(path.join(root, "out", "aura.port")); } catch { /* fresh */ }
  const ready = new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      let filed = "";
      try { filed = fs.readFileSync(path.join(root, "out", "aura.port"), "utf8"); } catch { filed = ""; }
      if (text.includes("PORT ") || filed.trim() === String(port)) {
        console.log("aura ready", port, JSON.stringify(filed));
        resolve(text || filed);
      }
      else if (child.exitCode !== null) reject(new Error("aura exited\n" + text));
      else if (Date.now() - t0 > AURA_START_MS) reject(new Error("aura timeout\n" + text));
      else setTimeout(tick, 40);
    };
    tick();
  });
  return { child, ready, log: () => text };
}

async function drive(io, ticks) {
  const states = [];
  for (let i = 0; i < ticks; i++) {
    io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
    const batch = await readUntil(io, (m) => m.op === "state", 30);
    const state = batch.find((m) => m.op === "state");
    if (state) states.push(state);
  }
  return states;
}

function stop(child) {
  if (child && child.exitCode === null) child.kill("SIGTERM");
}

async function wishCity(io, text, biome) {
  io.send({ op: "wish", text, lang: "zh-CN", source: "voice" });
  let state = null;
  for (let i = 0; i < 8 && !state; i++) {
    io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
    const got = await readUntil(io, (m) => m.op === "state", 30);
    const hit = got.find((m) => m.op === "state" && m.biome === biome && m.spec && m.spec.id === biome);
    if (hit) state = hit;
  }
  if (!state) throw new Error("next city " + JSON.stringify(text) + " did not reach " + biome);
  return state;
}

async function offline() {
  console.log("offline start");
  const port = 18772;
  const core = startAura(port, cleanEnv({ ...process.env, LUMEN_TICK_MS: "200", LUMEN_SKIP_DREAM: "1" }));
  let sock;
  try {
    await core.ready;
    sock = await connect(port);
    const io = session(sock);
    io.send({ op: "hello", seed: 42 });
    await readUntil(io, (m) => m.op === "state", 40);
    const before = await drive(io, 4);
    const x0 = before[before.length - 1].x;
    const combo0 = before[before.length - 1].combo;
    io.send({ op: "wish", text: "糖果世界", lang: "zh", source: "type" });
    let state = null;
    let kept = false;
    for (let i = 0; i < 8 && !state; i++) {
      io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
      const got = await readUntil(io, (m) => m.op === "state", 30);
      if (got.some((m) => m.op === "decision" && m.kind === "KEEP" && m.arm === "biome")) kept = true;
      const hit = got.find((m) => m.op === "state" && m.biome === "candy-clouds");
      if (hit) state = hit;
    }
    if (!state || !state.spec || state.spec.recipe !== "mix") {
      throw new Error("offline spec missing " + JSON.stringify(state && state.spec));
    }
    if (!kept) throw new Error("offline gate did not KEEP");
    if (!(state.x >= x0 - 0.05)) throw new Error("run rewound " + x0 + " -> " + state.x);
    if (state.combo !== combo0) throw new Error("combo reset " + combo0 + " -> " + state.combo);
    const banner = String(state.banner || "");
    if (!banner.includes("糖果") && !banner.includes("Candy")) throw new Error("banner " + state.banner);
    console.log(`offline KEEP ${state.biome} x ${x0.toFixed(1)} -> ${state.x.toFixed(1)} combo ${state.combo}`);
    const beijing = await wishCity(io, "下一个城市", "beijing");
    if (!String(beijing.banner || "").includes("北京") && !String(beijing.banner || "").includes("Beijing")) {
      throw new Error("beijing banner " + beijing.banner);
    }
    const shanghai = await wishCity(io, "下一个程序", "shanghai");
    const hangzhou = await wishCity(io, "下一个 城市", "hangzhou");
    console.log(`tour ${beijing.biome} -> ${shanghai.biome} -> ${hangzhou.biome}`);
  } finally {
    if (sock) sock.end();
    stop(core.child);
  }
}

function startMock() {
  const hits = { biome: 0, other: 0 };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const biome = body.includes("bright place") || body.includes("(recipe mix)");
      if (biome) hits.biome += 1;
      else hits.other += 1;
      const content = biome
        ? `A warm canyon opened ahead. ${LAVA}`
        : "A paper plane drifts down the left lane. (seq (ground 6) (ground 6))";
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "mock",
        choices: [{ finish_reason: "stop", message: { role: "assistant", content } }],
      }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, hits, base: `http://127.0.0.1:${addr.port}/v1` });
    });
  });
}

async function online() {
  const port = 18773;
  const mock = await startMock();
  const env = cleanEnv({
    ...process.env,
    LUMEN_TICK_MS: "1000",
    LUMEN_BIOME_GAP_MS: "500",
  });
  env.LLM_API_KEY = "mock-key";
  env.LLM_BASE_URL = mock.base;
  env.LLM_MODEL = "mock-biome";
  env.LLM_TIMEOUT = "20";
  const core = startAura(port, env);
  let sock;
  try {
    await core.ready;
    sock = await connect(port);
    const io = session(sock);
    io.send({ op: "hello", seed: 7 });
    await readUntil(io, (m) => m.op === "state", 40);
    const spun = [];
    let idle = null;
    for (let i = 0; i < 16 && !idle; i++) {
      io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
      const more = await readUntil(io, (m) => m.op === "state", 40);
      const state = [...more].reverse().find((m) => m.op === "state");
      if (!state) continue;
      spun.push(state);
      const busy = state["llm-busy"] === true || state["motif-busy"] === true
        || state["scene-busy"] === true || state["pals-busy"] === true;
      if (!busy) idle = state;
    }
    const base = idle || spun[spun.length - 1];
    const x0 = base.x;
    const combo0 = base.combo;
    io.send({ op: "wish", text: "去火山", lang: "zh", source: "type" });
    const deadline = Date.now() + 25000;
    let state = null;
    let kept = false;
    while (Date.now() < deadline && !state) {
      io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
      const batch = await readUntil(io, (m) => m.op === "state", 20);
      if (batch.some((m) => m.op === "decision" && m.kind === "KEEP" && m.arm === "biome")) kept = true;
      const hit = batch.find((m) => m.op === "state" && m.biome === "lava-canyon");
      if (hit) state = hit;
    }
    if (!state) throw new Error("voice biome did not arrive\n" + core.log().slice(-800));
    if (!kept) throw new Error("voice biome was not KEEP");
    if (!state.spec || state.spec.id !== "lava-canyon" || state.spec.recipe !== "mix") {
      throw new Error("spec " + JSON.stringify(state.spec));
    }
    if (!(state.x >= x0 - 0.05)) throw new Error("camera run rewound " + x0 + " -> " + state.x);
    if (state.combo !== combo0) throw new Error("combo reset " + combo0 + " -> " + state.combo);
    if (idle && mock.hits.biome < 1) throw new Error("mock was not asked " + JSON.stringify(mock.hits));
    console.log(`mock KEEP ${state.biome} x ${Number(x0).toFixed(1)} -> ${Number(state.x).toFixed(1)} combo ${state.combo} hits ${mock.hits.biome}`);
  } finally {
    if (sock) sock.end();
    stop(core.child);
    mock.server.close();
  }
}

await offline();
await online();
console.log("edsl e2e ok");
