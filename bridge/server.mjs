// Static files plus a WebSocket that speaks newline JSON to the Aura core.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import net from "node:net";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
const webPort = Number(process.env.AURA_RUNNER_WEB || 8080);
const auraPort = Number(process.env.AURA_RUNNER_PORT || 8765);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

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

function attachSocket(ws) {
  const aura = net.connect({ host: "127.0.0.1", port: auraPort });
  aura.setNoDelay(true);
  let buf = Buffer.alloc(0);
  aura.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    let nl;
    while ((nl = buf.indexOf(0x0a)) >= 0) {
      const line = buf.subarray(0, nl).toString("utf8");
      buf = buf.subarray(nl + 1);
      if (line.length) ws.write(encodeFrame(line));
    }
  });
  aura.on("error", () => { try { ws.end(); } catch { /* closed */ } });
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
      if (op === 8) { aura.end(); ws.end(); return; }
      if (op === 9) { ws.write(Buffer.from([0x8a, payload.length, ...payload])); continue; }
      if (op === 1) {
        const text = payload.toString("utf8");
        aura.write(text.endsWith("\n") ? text : text + "\n");
      }
    }
  });
  ws.on("close", () => aura.destroy());
  ws.on("error", () => aura.destroy());
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  let rel = decodeURIComponent(url.pathname);
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

server.listen(webPort, "127.0.0.1", () => {
  console.log(`Lumen Run  http://127.0.0.1:${webPort}`);
});
