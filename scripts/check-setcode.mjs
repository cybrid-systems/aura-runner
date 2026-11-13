// When mutate:rebind is refused, the phrase still has to land through
// set-code, and a garden that cannot be published must not change the sky.
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const MOTIF = "(seq (ground 6) (block 0 1) (hurdle 0.4 0.7) (ground 5) (gate 0.72 0.8) (ground 5) (gap 1.1) (ground 5))";
const SCENE = "(garden (sky 0.95 0.45 0.55) (ground 0.35 0.72 0.32) (flower tulip 0.85) (light 0.9))";

function connect(port) {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: "127.0.0.1", port }, () => resolve(s));
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

async function readUntil(io, pred, limit = 40) {
  const got = [];
  for (let i = 0; i < limit; i++) {
    const m = await io.next();
    got.push(m);
    if (pred(m, got)) return got;
  }
  throw new Error("no match " + JSON.stringify(got.map((m) => m.op)));
}

function startAura(port, extra) {
  const child = spawn(aura, ["--quiet", "--preset", "dev", "--grant", "network", "core/main.aura"], {
    cwd: root,
    env: { ...process.env, AURA_RUNNER_PORT: String(port), ...extra },
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

async function withCore(port, extra, fn) {
  const core = startAura(port, extra);
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

await withCore(18771, { LUMEN_SKIP_REBIND: "1" }, async (io) => {
  io.send({ op: "hello", seed: 42 });
  await readUntil(io, (m) => m.op === "state");
  io.send({ op: "propose", form: MOTIF });
  const kept = await readUntil(io, (m) => m.op === "state", 40);
  const decision = kept.find((m) => m.op === "decision" && m.kind === "KEEP" && m.arm === "motif");
  const rules = kept.find((m) => m.op === "rules");
  const state = kept.find((m) => m.op === "state");
  if (!decision) throw new Error("gated phrase was not kept " + JSON.stringify(kept.map((m) => m.op + ":" + m.kind)));
  if (!rules || rules.via !== "set-code") throw new Error("via " + JSON.stringify(rules && rules.via));
  if (!state || !String(state.motif).includes("(gate ")) throw new Error("motif missing gate " + (state && state.motif));
  io.send({ op: "propose", form: SCENE });
  const scene = await readUntil(io, (m) => m.op === "state", 40);
  const sky = scene.find((m) => m.op === "state");
  const sceneKeep = scene.find((m) => m.op === "decision" && m.kind === "KEEP" && m.arm === "scene");
  if (!sceneKeep) throw new Error("garden was not kept via set-code");
  if (!sky || !(sky.sky[0] > 0.9 && sky.sky[1] < 0.6)) throw new Error("sky did not follow the binding " + JSON.stringify(sky && sky.sky));
  if (!String(sky.scene).includes("tulip")) throw new Error("scene binding " + sky.scene);
  io.send({ op: "bye" });
  console.log("set-code keep ok");
});

await withCore(18772, { LUMEN_SKIP_REBIND: "1", LUMEN_SKIP_SETCODE: "1" }, async (io) => {
  io.send({ op: "hello", seed: 42 });
  const hello = await readUntil(io, (m) => m.op === "state");
  const before = hello.find((m) => m.op === "state");
  io.send({ op: "propose", form: SCENE });
  const scene = await readUntil(io, (m) => m.op === "state", 40);
  const rolled = scene.find((m) => m.op === "decision" && m.kind === "ROLLBACK");
  const after = scene.find((m) => m.op === "state");
  if (!rolled) throw new Error("unpublished garden was kept");
  if (!after || Math.abs(after.sky[0] - before.sky[0]) > 0.02) {
    throw new Error("sky changed without a binding " + JSON.stringify(before.sky) + " -> " + JSON.stringify(after.sky));
  }
  io.send({ op: "bye" });
  console.log("rejected publish left the sky alone");
});
