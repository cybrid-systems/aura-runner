// Headless play of a seeded run through the Aura core, then one WebSocket
// round trip through the browser bridge.
import { spawn } from "node:child_process";
import net from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const port = 18765;
const webPort = 18080;

function waitFor(file, needle, pid, ms = 8000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      if (text.includes(needle)) resolve(text);
      else if (pid && pid.exitCode !== null) reject(new Error("process exited\n" + text));
      else if (Date.now() - t0 > ms) reject(new Error("timeout\n" + text));
      else setTimeout(tick, 50);
    };
    tick();
  });
}

function connect(p) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: "127.0.0.1", port: p }, () => resolve(s));
    s.on("error", reject);
  });
}

function session(sock) {
  let buf = "";
  const waiters = [];
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
  sock._queue = [];
  return {
    send(obj) { sock.write(JSON.stringify(obj) + "\n"); },
    async next() {
      if (sock._queue.length) return sock._queue.shift();
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}

async function readUntil(io, pred, limit = 40) {
  const got = [];
  for (let i = 0; i < limit; i++) {
    const m = await io.next();
    got.push(m);
    if (pred(m, got)) return got;
  }
  throw new Error("no match " + JSON.stringify(got.map((m) => m.op)));
}

const log = path.join(root, "out", "smoke-aura.log");
fs.mkdirSync(path.dirname(log), { recursive: true });
const child = spawn(aura, ["--quiet", "--preset", "dev", "--grant", "network", "core/main.aura"], {
  cwd: root,
  env: { ...process.env, AURA_RUNNER_PORT: String(port), AURA_EVO_LOG: path.join(root, "out", "evo.jsonl") },
  stdio: ["ignore", "pipe", "pipe"],
});
let logText = "";
child.stdout.on("data", (c) => { logText += c.toString(); });
child.stderr.on("data", (c) => { logText += c.toString(); });

let bridge;
try {
  await new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (logText.includes("PORT ")) resolve();
      else if (child.exitCode !== null) reject(new Error("aura exited\n" + logText));
      else if (Date.now() - t0 > 8000) reject(new Error("aura timeout\n" + logText));
      else setTimeout(tick, 40);
    };
    tick();
  });
  const sock = await connect(port);
  const io = session(sock);
  io.send({ op: "hello", seed: 42 });
  const hello = await readUntil(io, (m) => m.op === "state");
  const welcome = hello.find((m) => m.op === "welcome");
  const chunks = hello.filter((m) => m.op === "chunk");
  if (!welcome || welcome.replay !== "LUMEN-42") throw new Error("replay " + JSON.stringify(welcome));
  if (chunks.length < 1) throw new Error("no chunks");
  const kinds = new Set();
  let lanes = 0;
  for (const c of chunks) {
    for (const q of c.pieces) {
      kinds.add(q[0]);
      if (q.length >= 6) lanes++;
    }
  }
  if (!kinds.has(7)) throw new Error("expected a 3D lane block, kinds " + [...kinds]);
  if (lanes < 1) throw new Error("pieces missing lane");
  const t0 = Date.now();
  let state = hello.find((m) => m.op === "state");
  while (Date.now() - t0 < 1500) {
    io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
    const batch = await readUntil(io, (m) => m.op === "state", 20);
    state = batch.find((m) => m.op === "state") || state;
    await new Promise((r) => setTimeout(r, 40));
  }
  if (!(state.x > 3)) throw new Error("did not run forward " + state.x);
  if (!state.alive) throw new Error("died during the gentle open");
  io.send({ op: "tick", jump: 0, slide: 0, lane: -1 });
  await readUntil(io, (m) => m.op === "state");
  io.send({ op: "propose", form: "(seq (ground 3) (gap 6) (ground 3))" });
  const bad = await readUntil(io, (m) => m.op === "state");
  if (!bad.some((m) => m.op === "decision" && m.kind === "ROLLBACK")) throw new Error("unfair form was kept");
  io.send({ op: "propose", form: "(seq (ground 6) (block 0 1) (hurdle 0.4 0.7) (ground 4) (gap 1.1) (ground 5))" });
  const fair = await readUntil(io, (m) => m.op === "state", 30);
  if (!fair.some((m) => m.op === "decision" && m.kind === "KEEP")) throw new Error("fair 3D form rejected " + JSON.stringify(fair));
  io.send({ op: "bye" });
  sock.end();

  bridge = spawn(process.execPath, ["bridge/server.mjs"], {
    cwd: root,
    env: { ...process.env, AURA_RUNNER_PORT: String(port), AURA_RUNNER_WEB: String(webPort) },
    stdio: "ignore",
  });
  await new Promise((r) => setTimeout(r, 250));
  const key = crypto.randomBytes(16).toString("base64");
  const ws = await connect(webPort);
  let incoming = Buffer.alloc(0);
  ws.on("data", (c) => { incoming = Buffer.concat([incoming, c]); });
  ws.write(
    `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${webPort}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
  );
  const headerEnd = await new Promise((resolve, reject) => {
    const tick = () => {
      const i = incoming.indexOf("\r\n\r\n");
      if (i >= 0) resolve(i + 4);
      else setTimeout(tick, 20);
    };
    tick();
    setTimeout(() => reject(new Error("ws header timeout")), 2000);
  });
  const header = incoming.subarray(0, headerEnd).toString("utf8");
  if (!header.includes("101")) throw new Error(header.slice(0, 180));
  incoming = incoming.subarray(headerEnd);
  const mask = crypto.randomBytes(4);
  const payload = Buffer.from(JSON.stringify({ op: "hello", seed: 7 }));
  const frame = Buffer.alloc(6 + payload.length);
  frame[0] = 0x81;
  frame[1] = 0x80 | payload.length;
  mask.copy(frame, 2);
  for (let i = 0; i < payload.length; i++) frame[6 + i] = payload[i] ^ mask[i & 3];
  ws.write(frame);
  const text = await new Promise((resolve, reject) => {
    const tick = () => {
      if (incoming.length >= 2) {
        let len = incoming[1] & 0x7f;
        let off = 2;
        if (len === 126) {
          if (incoming.length < 4) return setTimeout(tick, 20);
          len = incoming.readUInt16BE(2);
          off = 4;
        }
        if (incoming.length >= off + len) {
          resolve(incoming.subarray(off, off + len).toString("utf8"));
          return;
        }
      }
      setTimeout(tick, 20);
    };
    tick();
    setTimeout(() => reject(new Error("ws body timeout")), 3000);
  });
  const wsWelcome = JSON.parse(text);
  if (wsWelcome.op !== "welcome" || wsWelcome.replay !== "LUMEN-7") throw new Error(text.slice(0, 240));
  ws.end();
  console.log("smoke ok", "x", state.x.toFixed(2), "chunks", chunks.length, "kinds", [...kinds].join(","));
} finally {
  child.kill("SIGTERM");
  if (bridge) bridge.kill("SIGTERM");
}
