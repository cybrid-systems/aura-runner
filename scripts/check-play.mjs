// Two runs. The first has no model fibers: on this Aura pin a live
// llm:chat fiber retains capture frames until a long tick loop exhausts
// the arena, so the ten minutes of road are simulated without one.
// The second run uses the mock, parks one garden call until the
// watchdog drops it, and then keeps a later garden.
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

function cleanEnv(env) {
  delete env.LUMEN_DEEPSEEK_KEY;
  delete env.LUMEN_MINIMAX_KEY;
  delete env.LUMEN_LLM;
  return env;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const port = 18770;
// Geometry already fails, so the tick does not pay for a full autopilot on
// every obstacle reply. The garden reply is the proposal that has to land.
const MOTIF = "(seq (ground 4) (gap 5.5) (ground 4))";
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
    next(ms = 90000) {
      if (sock._queue.length) return Promise.resolve(sock._queue.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("read timeout")), ms);
        waiters.push((msg) => { clearTimeout(timer); resolve(msg); });
      });
    },
  };
}

async function readUntil(io, pred, limit = 80) {
  const got = [];
  for (let i = 0; i < limit; i++) {
    const m = await io.next();
    got.push(m);
    if (pred(m, got)) return got;
  }
  throw new Error("no match " + JSON.stringify(got.slice(-8).map((m) => m.op)));
}

function startMock() {
  const hits = { motif: 0, scene: 0, pals: 0, hung: 0 };
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
      const pals = body.includes("friendly companion") || body.includes("Add one new gentle friend");
      if (scene) {
        hits.scene += 1;
        if (hits.scene === 1) {
          hits.hung += 1;
          return;
        }
      } else if (pals) hits.pals += 1;
      else hits.motif += 1;
      const content = scene ? SCENE : pals ? "(pal bird lark 0.95 0.86 0.35 float)" : MOTIF;
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

function startAura(extra) {
  const child = spawn(aura, ["--quiet", "--preset", "dev", "--grant", "network", "core/main.aura"], {
    cwd: root,
    env: cleanEnv({
      ...process.env,
      AURA_RUNNER_PORT: String(port),
      LLM_API_KEY: "",
      ...extra,
    }),
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

function chunkIds(batch) {
  return batch.filter((m) => m.op === "chunk").map((m) => m.id);
}

function sawGate(batch) {
  for (const m of batch) {
    if (m.op !== "chunk" || !Array.isArray(m.pieces)) continue;
    for (const q of m.pieces) if (Number(q[0]) === 4) return true;
  }
  return false;
}

async function withAura(extra, fn) {
  const core = startAura(extra);
  let sock;
  try {
    await core.ready;
    sock = await connect(port);
    const io = session(sock);
    await fn(io, core);
  } finally {
    if (sock) sock.destroy();
    core.child.kill("SIGTERM");
    await new Promise((r) => core.child.on("exit", r));
  }
}

const t0 = Date.now();
await withAura({
  LUMEN_TICK_MS: "1000",
  LUMEN_SKIP_DREAM: "1",
}, async (io) => {
  io.send({ op: "hello", seed: 42 });
  const hello = await readUntil(io, (m) => m.op === "state", 80);
  const firstIds = chunkIds(hello);
  if (firstIds.length < 1) throw new Error("no opening chunks");
  if (!sawGate(hello)) throw new Error("no gate in the first 30 seconds of track");
  io.send({ op: "bye" });
  await new Promise((r) => setTimeout(r, 50));
  const sock2 = await connect(port);
  const io2 = session(sock2);
  try {
    io2.send({ op: "resync" });
    const again = await readUntil(io2, (m) => m.op === "state", 80);
    const secondIds = chunkIds(again);
    if (secondIds.join(",") !== firstIds.join(",")) {
      throw new Error("reconnect did not resend chunks " + firstIds + " vs " + secondIds);
    }
    const samples = [];
    let nextSample = 30000;
    let run = 0;
    let ticks = 0;
    while (run < 600000 && ticks < 800) {
      io2.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
      const batch = await readUntil(io2, (m) => m.op === "state", 40);
      ticks++;
      const state = batch.find((m) => m.op === "state");
      if (!state) throw new Error("missing state");
      run = state.run || 0;
      if (run >= nextSample) {
        if (!(state.ahead > 0)) throw new Error("empty road at run " + run + " ahead " + state.ahead);
        samples.push(state.ahead);
        nextSample += 30000;
      }
    }
    if (run < 600000) throw new Error("simulated run only reached " + run);
    if (samples.length < 20) throw new Error("samples " + samples.length + " " + samples.join(","));
    io2.send({ op: "bye" });
    console.log(`ten minutes ok run ${run} samples ${samples.length} minAhead ${Math.min(...samples)} ticks ${ticks} wall ${Date.now() - t0}ms`);
  } finally {
    sock2.destroy();
  }
});

const mock = await startMock();
await withAura({
  LLM_API_KEY: "mock-key",
  LLM_BASE_URL: mock.base,
  LLM_MODEL: "mock-garden",
  LLM_TIMEOUT: "2",
  LUMEN_TICK_MS: "1000",
  LUMEN_STALL_SCENE: "1",
  LUMEN_SKIP_DREAM: "1",
  LUMEN_SKIP_ARM: "1",
  LUMEN_MOTIF_GAP_MS: "4000",
}, async (io) => {
  io.send({ op: "hello", seed: 42 });
  await readUntil(io, (m) => m.op === "state", 40);
  let sawBusy = false;
  let cleared = false;
  let sawTulip = false;
  let motifAtClear = -1;
  const deadline = Date.now() + 90000;
  let run = 0;
  while (Date.now() < deadline && !(cleared && sawTulip && mock.hits.motif > motifAtClear)) {
    io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
    const batch = await readUntil(io, (m) => m.op === "state", 40);
    const state = batch.find((m) => m.op === "state");
    if (!state) throw new Error("missing state");
    run = state.run || 0;
    if (state["scene-busy"] === true || state.stall === true) sawBusy = true;
    if (!cleared && state.watchdogs >= 1 && state["scene-busy"] === false) {
      cleared = true;
      motifAtClear = mock.hits.motif;
    }
    if (cleared && state.stall === true) io.send({ op: "unstall" });
    for (const m of batch) {
      if (m.op === "state" && typeof m.scene === "string" && m.scene.includes("tulip")) sawTulip = true;
      if (m.op === "state" && Array.isArray(m.sky) && m.sky[0] > 0.9 && m.sky[1] < 0.6) sawTulip = true;
    }
    // Simulated time outruns the 2s HTTP timeout on a fast host. Keep
    // going long enough for the parked garden call to end and the next
    // one to be kept. The wall deadline above still stops a real hang.
    if (run > 150000) break;
  }
  if (!sawBusy) throw new Error("scene call never looked busy");
  if (!cleared) throw new Error("watchdog did not clear scene-busy");
  if (!(mock.hits.motif > motifAtClear)) throw new Error("no later obstacle call " + JSON.stringify(mock.hits));
  if (!sawTulip) throw new Error("later garden was not kept " + JSON.stringify(mock.hits));
  if (mock.hits.hung < 1) throw new Error("mock never hung a request");
  io.send({ op: "bye" });
  console.log(`watchdog ok hung ${mock.hits.hung} motif ${mock.hits.motif} wall ${Date.now() - t0}ms`);
});
await new Promise((r) => mock.server.close(r));
