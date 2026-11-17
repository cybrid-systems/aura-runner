// A spoken wish asks several fibers for a new thing. This drives the core
// over its socket and checks the whole path: the keyword picture comes
// back at once, the fibers reply, a late one is dropped, a broken one is
// refused, the best fair one is chosen, it goes live on the next stretch
// (never on a stretch already laid), and a page that cannot draw it puts
// the previous one back.
//
//   node scripts/check-thing-e2e.mjs            mock model, assertions
//   THING_LIVE=1 node scripts/check-thing-e2e.mjs
//       real provider from the environment (LUMEN_LLM, LUMEN_*_KEY/URL),
//       prints one timing row per wish and a long run. Keys are never printed.
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const aura = process.env.AURA_BIN || "aura";
const LIVE = process.env.THING_LIVE === "1";
const port = Number(process.env.THING_PORT || (LIVE ? 18791 : 18790));

const GOOD_SIMPLE = "A pink cake bobs up. (thing pickup 1.2 (anim spin 0.1 1.0) (name cake) (part cylinder 0 0.3 0 0.8 0.4 0.8 0.98 0.62 0.75 0.1) (part sphere 0 0.75 0 0.3 0.3 0.3 0.95 0.3 0.35 0.4))";
const DARK = "A shadow ball. (thing pickup 1.2 (part sphere 0 0.5 0 0.5 0.5 0.5 0.1 0.1 0.1 0))";
const GOOD_RICH = "A pink cake with candles. (thing pickup 1.2 (anim spin 0.1 1.0) (name cake) (part cylinder 0 0.25 0 0.9 0.4 0.9 0.98 0.62 0.75 0.1) (part cylinder 0 0.6 0 0.6 0.3 0.6 1.0 0.9 0.92 0.0) (part cylinder -0.15 0.85 0 0.06 0.2 0.06 1.0 0.95 0.5 0.5) (part cylinder 0.15 0.85 0 0.06 0.2 0.06 1.0 0.95 0.5 0.5) (part sphere 0 0.9 0 0.15 0.15 0.15 0.98 0.4 0.5 0.3))";
const LATE = "A blue cake. (thing pickup 1.2 (part cylinder 0 0.4 0 0.8 0.8 0.8 0.4 0.65 1.0 0))";

function variantOf(body) {
  if (body.includes("Keep it simple")) return 0;
  if (body.includes("Add detail")) return 1;
  if (body.includes("cute and round")) return 2;
  if (body.includes("Make it bold")) return 3;
  return -1;
}

function startMock() {
  const hits = { thing: [0, 0, 0, 0], other: 0 };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const v = body.includes("(thing ROLE") ? variantOf(body) : -1;
      let content = "A paper plane drifts down. (seq (ground 6) (hurdle 0.4 0.7) (ground 6))";
      let delay = 50;
      if (v >= 0) {
        hits.thing[v] += 1;
        content = [GOOD_SIMPLE, DARK, GOOD_RICH, LATE][v];
        delay = [400, 600, 900, 6000][v];
      } else {
        hits.other += 1;
      }
      setTimeout(() => {
        const payload = JSON.stringify({ id: "mock", choices: [{ message: { role: "assistant", content } }] });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(payload);
      }, delay);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, hits, base: `http://127.0.0.1:${server.address().port}/v1` }));
  });
}

function startAura(extraEnv) {
  const env = { ...process.env, AURA_RUNNER_PORT: String(port), AURA_SANDBOX: process.env.AURA_SANDBOX || "off", ...extraEnv };
  const child = spawn(aura, ["--quiet", "--preset", "dev", "--grant", "network", "core/main.aura"], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
  let text = "";
  child.stdout.on("data", (c) => { text += c.toString(); });
  child.stderr.on("data", (c) => { text += c.toString(); });
  const ready = new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (text.includes("PORT ")) resolve();
      else if (child.exitCode !== null) reject(new Error("aura exited\n" + text));
      else if (Date.now() - t0 > 15000) reject(new Error("aura timeout\n" + text));
      else setTimeout(tick, 40);
    };
    tick();
  });
  return { child, ready, log: () => text };
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
      const msg = JSON.parse(line);
      msg._at = performance.now();
      const w = waiters.shift();
      if (w) w(msg); else queue.push(msg);
    }
  });
  return {
    send(o) { sock.write(JSON.stringify(o) + "\n"); },
    next(ms = 20000) {
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("socket quiet")), ms);
        waiters.push((m) => { clearTimeout(t); resolve(m); });
      });
    },
  };
}

async function untilState(io, seen) {
  for (let i = 0; i < 200; i++) {
    const m = await io.next();
    seen(m);
    if (m.op === "state") return m;
  }
  throw new Error("no state");
}

// One wish. Returns timing and the thing rows seen.
async function wish(io, text, opts) {
  const row = { text, placeholderMs: -1, chosenMs: -1, liveMs: -1, chunkMs: -1, got: 0, passed: 0, variant: -1, phase: "", kept: 0, rolled: 0, crash: false, cand: [] };
  const t0 = performance.now();
  io.send({ op: "wish", text, lang: "zh-CN", source: "voice" });
  let gen = -1;
  const seen = (m) => {
    if (row.placeholderMs < 0) row.placeholderMs = m._at - t0;
    if (m.op === "thing") {
      if (m.phase === "thinking") gen = m.gen;
      if (m.gen !== gen) return;
      row.phase = m.phase;
      const info = m.info || {};
      if (m.phase === "chosen") {
        row.chosenMs = m._at - t0; row.got = info.got; row.passed = info.passed; row.variant = info.variant;
        row.cand = info.rows || [];
      }
      if (m.phase === "none") { row.chosenMs = m._at - t0; row.got = info.got || 0; row.passed = 0; row.cand = info.rows || []; }
      if (m.phase === "live") row.liveMs = m._at - t0;
    }
    if (m.op === "decision" && m.arm === "thing") {
      if (m.kind === "KEEP") row.kept += 1;
      if (m.kind === "ROLLBACK") row.rolled += 1;
    }
    if (m.op === "chunk" && m.thing && m.thing.id === gen && row.chunkMs < 0) row.chunkMs = m._at - t0;
  };
  // The wish reply comes before any tick.
  seen(await io.next());
  const end = performance.now() + opts.waitMs;
  while (performance.now() < end) {
    io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
    await untilState(io, seen);
    if (row.liveMs >= 0 && row.chunkMs >= 0) break;
    if (row.phase === "none") break;
    await new Promise((r) => setTimeout(r, 33));
  }
  return row;
}

async function mockRun() {
  const mock = await startMock();
  const core = startAura({
    LLM_API_KEY: "mock-key", LLM_BASE_URL: mock.base, LLM_MODEL: "mock", LLM_TIMEOUT: "30",
    LUMEN_THING_DEADLINE_MS: process.env.DL || "3000",
    LUMEN_DEEPSEEK_KEY: "", LUMEN_MINIMAX_KEY: "", LUMEN_LLM: "",
  });
  let sock;
  try {
    await core.ready;
    sock = await new Promise((resolve, reject) => { const s = net.connect({ host: "127.0.0.1", port }, () => resolve(s)); s.on("error", reject); });
    const io = session(sock);
    io.send({ op: "hello", seed: 42 });
    await untilState(io, () => {});
    const row = await wish(io, "来一个粉色的蛋糕", { waitMs: 20000 });
    const log = core.log();
    if (row.placeholderMs < 0 || row.placeholderMs > 1500) throw new Error("placeholder slow " + row.placeholderMs);
    if (row.phase !== "live") throw new Error("thing not live " + JSON.stringify(row) + " hits " + JSON.stringify(mock.hits) + "\n" + log);
    if (row.got !== 3) throw new Error("expected 3 in time (one late) " + JSON.stringify(row));
    if (row.passed !== 2) throw new Error("expected 2 fair (one dark) " + JSON.stringify(row));
    if (row.variant !== 2) throw new Error("expected the richer cake (variant 2) " + JSON.stringify(row));
    if (row.chunkMs < 0) throw new Error("no chunk carried the thing");
    if (!/THING gen 1 installed via (rebind|set-code)/.test(log)) throw new Error("no install line\n" + log);
    // The late reply arrives after the round and is dropped.
    const lateBy = performance.now() + 5000;
    while (performance.now() < lateBy && !/THING gen 1 late/.test(core.log())) {
      io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
      await untilState(io, () => {});
      await new Promise((r) => setTimeout(r, 40));
    }
    if (!/THING gen 1 late/.test(core.log())) throw new Error("late reply was not dropped\n" + core.log());
    // A page that cannot draw it puts the previous one back.
    io.send({ op: "thing-bad", gen: 1 });
    let rolled = false;
    for (let i = 0; i < 40 && !rolled; i++) {
      const m = await io.next();
      if (m.op === "thing" && m.phase === "rollback") rolled = true;
      if (m.op === "state") io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
    }
    if (!rolled) throw new Error("thing-bad did not roll back\n" + core.log());
    if (mock.hits.thing.some((n) => n !== 1)) throw new Error("each variant once " + JSON.stringify(mock.hits));
    io.send({ op: "bye" });
    sock.end();
    sock = null;
    console.log(`thing e2e ok (placeholder ${row.placeholderMs.toFixed(0)}ms, chosen ${row.chosenMs.toFixed(0)}ms, live ${row.liveMs.toFixed(0)}ms, ${row.passed}/${row.got} fair, late dropped, rollback ok)`);
  } finally {
    if (sock) sock.destroy();
    core.child.kill("SIGTERM");
    await new Promise((r) => { if (core.child.exitCode !== null || core.child.signalCode !== null) r(); else core.child.once("exit", () => r()); });
    await new Promise((r) => mock.server.close(r));
  }
}

const WISHES = [
  "来一个粉色的蛋糕",
  "我想要一座彩虹桥可以滑过去",
  "路边长出一棵会发光的蘑菇树",
  "来一只蓝色的小企鹅陪我跑",
  "前面放一排金色的木头让我跳",
  "我要好多亮晶晶的钻石",
  "来一个紫色的甜甜圈",
  "路边有一座小城堡",
  "前面有一个绿色的拱门",
  "来一个会转圈的冰淇淋",
];

async function liveRun() {
  const core = startAura({ LLM_TIMEOUT: "30" });
  let sock;
  const rows = [];
  try {
    await core.ready;
    sock = await new Promise((resolve, reject) => { const s = net.connect({ host: "127.0.0.1", port }, () => resolve(s)); s.on("error", reject); });
    const io = session(sock);
    io.send({ op: "hello", seed: 42 });
    const runT0 = performance.now();
    await untilState(io, () => {});
    const list = (process.env.THING_WISHES ? process.env.THING_WISHES.split("|") : WISHES);
    for (const text of list) {
      const row = await wish(io, text, { waitMs: Number(process.env.THING_WAIT_MS || 30000) });
      rows.push(row);
      console.log(JSON.stringify({
        wish: row.text,
        placeholder_ms: Math.round(row.placeholderMs),
        chosen_ms: Math.round(row.chosenMs),
        live_ms: Math.round(row.liveMs),
        on_road_ms: Math.round(row.chunkMs),
        got: row.got, passed: row.passed, variant: row.variant, phase: row.phase,
        keep: row.kept, rollback: row.rolled,
        cand: row.cand.map((c) => `${c.variant}:${c.ms}ms:${c.checked}${c.fair}:${c.why}`).join(" "),
      }));
    }
    // Long run: keep ticking and wishing until LONG_S, watching for exits.
    const longS = Number(process.env.THING_LONG_S || 0);
    if (longS > 0) {
      let wishes = 0;
      let ticks = 0;
      let lastWish = 0;
      const stopAt = performance.now() + longS * 1000;
      while (performance.now() < stopAt) {
        if (performance.now() - lastWish > 12000) {
          io.send({ op: "wish", text: WISHES[wishes % WISHES.length], lang: "zh-CN", source: "voice" });
          wishes += 1;
          lastWish = performance.now();
        }
        io.send({ op: "tick", jump: 0, slide: 0, lane: 0 });
        await untilState(io, () => {});
        ticks += 1;
        if (core.child.exitCode !== null) throw new Error("core exited during long run");
        await new Promise((r) => setTimeout(r, 33));
      }
      const log = core.log();
      console.log(JSON.stringify({
        long_s: Math.round((performance.now() - runT0) / 1000), wishes, ticks,
        installed: (log.match(/ installed via /g) || []).length,
        chosen: (log.match(/ chosen variant /g) || []).length,
        none: (log.match(/ none got /g) || []).length,
        late: (log.match(/ late variant /g) || []).length,
        rollbacks: (log.match(/ rollback /g) || []).length,
        core_alive: core.child.exitCode === null,
        hold_budget: /mutation-hold-budget/.test(log),
        topology_restored: /topology restored/.test(log),
      }));
    }
    io.send({ op: "bye" });
    sock.end();
    sock = null;
    fs.mkdirSync(path.join(root, "out"), { recursive: true });
    fs.writeFileSync(path.join(root, "out", "thing-live.log"), core.log().split("\n").filter((l) => l.startsWith("THING")).join("\n") + "\n");
  } finally {
    if (sock) sock.destroy();
    core.child.kill("SIGTERM");
    await new Promise((r) => { if (core.child.exitCode !== null || core.child.signalCode !== null) r(); else core.child.once("exit", () => r()); });
  }
}

(LIVE ? liveRun() : mockRun()).catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
