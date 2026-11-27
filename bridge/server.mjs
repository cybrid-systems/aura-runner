// Static files plus a WebSocket that speaks newline JSON to the Aura core.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { discoverMusic, mimeFor, musicFromEnv, musicOrder, trackByName } from "./musiclib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
const webPort = Number(process.env.AURA_RUNNER_WEB || 8080);
const auraPort = Number(process.env.AURA_RUNNER_PORT || 8765);
// The recording stays outside the repo. A missing file is a 204, and the
// page plays the synthesized tune instead.
const musicFile = process.env.LUMEN_MUSIC
  || "/home/dev/code/symphony/symphony_no_29_in_a_major_k_201.mp4";
// No music_dir: one recording stays on /symphony.mp4. Several recordings
// in that same folder become the shuffled playlist, including mp4.
function playlistDir() {
  const set = process.env.LUMEN_MUSIC_DIR;
  if (set) return set;
  let dir = path.dirname(musicFile);
  try {
    dir = path.dirname(fs.realpathSync(musicFile));
  } catch { /* the single file is absent; dirname is only a candidate */ }
  const found = discoverMusic(dir);
  if (found.ok && found.tracks.length > 1) return dir;
  return "";
}
const musicDir = playlistDir();
const musicReason = process.env.LUMEN_MUSIC_REASON || "";
const trackOrder = musicOrder(process.env.LUMEN_MUSIC_ORDER);

function currentMusic() {
  return musicFromEnv(musicDir, musicReason);
}
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

function sendBytes(req, res, file, type) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    res.writeHead(404);
    res.end();
    return;
  }
  const size = stat.size;
  const range = req.headers.range;
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (m[1] === "" && m[2] === "")) {
      res.writeHead(416, { "content-range": `bytes */${size}` });
      res.end();
      return;
    }
    if (m[1] === "") {
      const n = Number(m[2]);
      start = Math.max(0, size - n);
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Number(m[2]);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) {
      res.writeHead(416, { "content-range": `bytes */${size}` });
      res.end();
      return;
    }
    end = Math.min(end, size - 1);
    status = 206;
  }
  const headers = {
    "content-type": type,
    "accept-ranges": "bytes",
    "content-length": String(end - start + 1),
    "cache-control": "no-cache",
  };
  if (status === 206) headers["content-range"] = `bytes ${start}-${end}/${size}`;
  res.writeHead(status, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = fs.createReadStream(file, { start, end });
  const stop = () => stream.destroy();
  res.on("close", stop);
  stream.on("error", () => {
    stop();
    if (!res.writableEnded) res.end();
  });
  stream.pipe(res);
}

function sendFile(res, file) {
  const ext = path.extname(file);
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": mime[ext] || "application/octet-stream", "cache-control": "no-cache" });
    res.end(buf);
  });
}

function encodeFrame(text) {
  const payload = Buffer.from(text);
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x81, len]);
  else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

// A tick that arrives while the core is still chewing the previous one
// joins that pending tick. dt is capped at 100 ms, the same cap the
// core uses for a live step, so a slow core does not fast-forward.
function coalesceTick(prev, next) {
  if (!prev) return next;
  const dt = Math.min(100, (Number(prev.dt) || 0) + (Number(next.dt) || 0));
  const lane = (Number(prev.lane) || 0) + (Number(next.lane) || 0);
  return Object.assign({}, next, {
    dt,
    jump: Math.max(Number(prev.jump) || 0, Number(next.jump) || 0),
    slide: Math.max(Number(prev.slide) || 0, Number(next.slide) || 0),
    lane: lane > 0 ? 1 : lane < 0 ? -1 : 0,
  });
}


// The core's script runtime performs http-post synchronously; a wish's
// TLS handshake stalled its tick. The core sends the chat body here and
// yields; Node does the network wait and answers on the same line socket.
async function llmAsk(msg, writeLine) {
  const reply = (ok, content, error) => writeLine(JSON.stringify({
    op: "llm-reply", id: msg.id, ok: !!ok, content: content || "", error: error || "",
  }));
  const key = process.env.LLM_API_KEY || process.env.LUMEN_DEEPSEEK_KEY || "";
  if (!key) return reply(false, "", "no-key");
  const base = (process.env.LLM_BASE_URL || process.env.LUMEN_DEEPSEEK_URL
    || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const model = msg.model || process.env.LLM_MODEL || process.env.LUMEN_DEEPSEEK_MODEL || "deepseek-flash";
  const timeout = Number(msg.timeout) > 0 ? Number(msg.timeout) : Number(process.env.LLM_TIMEOUT || 60);
  const body = {
    model,
    messages: msg.messages || [],
    max_tokens: Number(msg.max_tokens) || 2400,
    reasoning_effort: msg.reasoning_effort || "minimal",
    // Flash thinks by default, and minimal only means low. The trace
    // spends the token budget, so the form comes back empty.
    thinking: { type: "disabled" },
  };
  if (Number.isFinite(Number(msg.temperature))) body.temperature = Number(msg.temperature);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout * 1000),
    });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    const content = data?.choices?.[0]?.message?.content || "";
    if (content) reply(true, content, "");
    else reply(false, "", data?.error?.message || `http ${res.status}`);
  } catch (err) {
    reply(false, "", String(err?.message || err));
  }
}

function attachSocket(ws) {
  const aura = net.connect({ host: "127.0.0.1", port: auraPort });
  aura.setNoDelay(true);
  let buf = Buffer.alloc(0);
  // One tick is in flight until the core answers with state or an error.
  // Anything that arrives meanwhile folds into a single follow-up, so the
  // socket cannot grow a backlog while a step runs long.
  let tickFlight = false;
  let pendingTick = null;
  function writeLine(text) {
    aura.write(text.endsWith("\n") ? text : text + "\n");
  }
  const llmReady = !!(process.env.LLM_API_KEY
    && (process.env.LLM_BASE_URL || process.env.LUMEN_DEEPSEEK_URL));
  aura.on("connect", () => writeLine(JSON.stringify({ op: "llm-proxy", ready: llmReady })));
  function releaseTick() {
    tickFlight = false;
    if (!pendingTick) return;
    const next = pendingTick;
    pendingTick = null;
    tickFlight = true;
    writeLine(JSON.stringify(next));
  }
  function forwardText(text) {
    let msg = null;
    try { msg = JSON.parse(text); } catch { msg = null; }
    if (!msg || msg.op !== "tick") {
      writeLine(text);
      return;
    }
    if (tickFlight) {
      pendingTick = coalesceTick(pendingTick, msg);
      return;
    }
    tickFlight = true;
    writeLine(JSON.stringify(msg));
  }
  aura.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let nl;
    while ((nl = buf.indexOf(0x0a)) >= 0) {
      const line = buf.subarray(0, nl).toString("utf8");
      buf = buf.subarray(nl + 1);
      if (!line.length) continue;
      let msg = null;
      try { msg = JSON.parse(line); } catch { msg = null; }
      if (msg && msg.op === "llm-ask") {
        llmAsk(msg, writeLine);
        continue;
      }
      ws.write(encodeFrame(line));
      const op = msg ? (msg.op || "") : "";
      if (op === "state" || op === "err") releaseTick();
    }
  });
  // The core accepts one client. Drop that socket as soon as the browser
  // goes away, including a half-close, so the next page can connect.
  let dropped = false;
  function dropAura() {
    if (dropped) return;
    dropped = true;
    try { aura.end(); } catch { /* closed */ }
  }
  aura.on("error", () => { try { ws.destroy(); } catch { /* closed */ } });
  aura.on("close", () => { try { ws.end(); } catch { /* closed */ } });

  let pending = Buffer.alloc(0);
  ws.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 2) {
      const b0 = pending[0];
      const b1 = pending[1];
      const op = b0 & 0x0f;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (pending.length < 4) return;
        len = pending.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (pending.length < 10) return;
        len = Number(pending.readBigUInt64BE(2));
        off = 10;
      }
      const masked = (b1 & 0x80) !== 0;
      const maskLen = masked ? 4 : 0;
      if (pending.length < off + maskLen + len) return;
      const mask = pending.subarray(off, off + maskLen);
      const payload = Buffer.from(pending.subarray(off + maskLen, off + maskLen + len));
      if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      pending = pending.subarray(off + maskLen + len);
      if (op === 8) { dropAura(); try { ws.end(); } catch { /* closed */ } return; }
      if (op === 9) { ws.write(Buffer.from([0x8a, payload.length, ...payload])); continue; }
      if (op === 1) {
        const text = payload.toString("utf8").replace(/\n$/, "");
        if (text.length) forwardText(text);
      }
    }
  });
  ws.on("end", dropAura);
  ws.on("close", dropAura);
  ws.on("error", dropAura);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/boot") {
    const note = path.join(root, "out/boot.txt");
    fs.readFile(note, "utf8", (err, text) => {
      if (err) {
        res.writeHead(204);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      res.end(text);
    });
    return;
  }
  if (rel === "/favicon.ico" || rel === "/apple-touch-icon.png" || rel === "/apple-touch-icon-precomposed.png") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (rel === "/music.json") {
    const found = currentMusic();
    const tracks = found.ok
      ? found.tracks.map((row) => ({ name: row.name, url: row.url }))
      : [];
    const body = JSON.stringify({
      ok: found.ok,
      order: trackOrder,
      tracks,
      message: found.message,
      reason: found.reason,
    });
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-length": String(Buffer.byteLength(body)),
    });
    if (req.method === "HEAD") res.end();
    else res.end(body);
    return;
  }
  if (rel.startsWith("/music/t/")) {
    const name = rel.slice("/music/t/".length);
    const found = currentMusic();
    const track = trackByName(found, name);
    if (!track) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      if (req.method === "HEAD") res.end();
      else res.end("not found");
      return;
    }
    const type = mimeFor(track.name) || "application/octet-stream";
    sendBytes(req, res, track.file, type);
    return;
  }
  if (rel === "/symphony.mp4") {
    if (!fs.existsSync(musicFile)) {
      res.writeHead(204);
      res.end();
      return;
    }
    sendBytes(req, res, musicFile, "video/mp4");
    return;
  }
  if (rel === "/") rel = "/index.html";
  const file = path.join(web, path.normalize(rel));
  if (!file.startsWith(web)) {
    res.writeHead(403);
    res.end();
    return;
  }
  sendFile(res, file);
});

server.on("upgrade", (req, socket) => {
  if (req.url.split("?")[0] !== "/ws") {
    socket.destroy();
    return;
  }
  const key = req.headers["sec-websocket-key"] || "";
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.setNoDelay(true);
  attachSocket(socket);
});

// 127.0.0.1 keeps ./run.sh on this machine. The container sets
// AURA_RUNNER_BIND=0.0.0.0 so Docker's published port can reach the page.
const bindHost = process.env.AURA_RUNNER_BIND || "127.0.0.1";
const musicAtBoot = currentMusic();
if (musicAtBoot.message) console.log(musicAtBoot.message);
else if (musicAtBoot.ok) console.log(`music: ${musicAtBoot.tracks.length} tracks from ${musicAtBoot.folder} (${trackOrder})`);
else console.log("music: synthesized");
server.listen(webPort, bindHost, () => {
  const addr = server.address();
  const port = addr && typeof addr === "object" ? addr.port : webPort;
  console.log(`Lumen Run  http://${bindHost}:${port}`);
});
