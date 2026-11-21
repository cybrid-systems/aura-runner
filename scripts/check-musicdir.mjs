// Music folder discovery and the local bridge that serves it.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverMusic, mimeFor } from "../bridge/musiclib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "lumen_config.py");
const KEY = "sekret-music-key-555";

function pyJson(env) {
  const res = spawnSync("python3", [script, "--json"], {
    env: { PATH: process.env.PATH, HOME: os.homedir(), ...env },
    encoding: "utf8",
  });
  if (res.status !== 0) throw new Error(res.stderr || "python json failed");
  if (res.stdout.includes(KEY) || res.stderr.includes(KEY)) throw new Error("discovery printed a key");
  return JSON.parse(res.stdout);
}

function request(port, urlPath, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: "127.0.0.1",
      port,
      path: urlPath,
      method: "GET",
      headers,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

function start(env) {
  const child = spawn(process.execPath, [path.join(root, "bridge/server.mjs")], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      AURA_RUNNER_BIND: "127.0.0.1",
      AURA_RUNNER_WEB: "0",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not listen\n" + log)), 5000);
    const take = (chunk) => {
      log += chunk;
      const match = log.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("exit", (code) => reject(new Error("server exit " + code + "\n" + log)));
  });
  return { child, ready, text: () => log };
}

async function stop(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

if (mimeFor("a.mp3") !== "audio/mpeg" || mimeFor("a.ogg") !== "audio/ogg"
  || mimeFor("a.wav") !== "audio/wav" || mimeFor("a.m4a") !== "audio/mp4"
  || mimeFor("a.flac") !== "audio/flac" || mimeFor("a.txt") !== "") {
  throw new Error("mime map");
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-music-"));
const valid = path.join(dir, "valid");
const empty = path.join(dir, "empty");
const junk = path.join(dir, "junk");
const outside = path.join(dir, "outside.mp3");
fs.mkdirSync(valid);
fs.mkdirSync(empty);
fs.mkdirSync(junk);
fs.mkdirSync(path.join(valid, "nested"));
fs.writeFileSync(path.join(valid, "b.wav"), "wav-bytes");
fs.writeFileSync(path.join(valid, "a.mp3"), "mp3-bytes");
fs.writeFileSync(path.join(valid, "c.ogg"), "ogg-bytes");
fs.writeFileSync(path.join(valid, "d.m4a"), "m4a-bytes");
fs.writeFileSync(path.join(valid, "e.FLAC"), "flac-bytes");
fs.writeFileSync(path.join(valid, "notes.txt"), "ignore-me");
fs.writeFileSync(path.join(valid, ".hidden.mp3"), "hidden");
fs.writeFileSync(path.join(valid, "nested", "nope.mp3"), "nested");
fs.writeFileSync(outside, "secret-bytes");
fs.symlinkSync(outside, path.join(valid, "leak.mp3"));
fs.writeFileSync(path.join(junk, "readme.md"), "nope");

const expected = ["a.mp3", "b.wav", "c.ogg", "d.m4a", "e.FLAC"];
const found = discoverMusic(valid);
if (!found.ok || found.tracks.map((row) => row.name).join() !== expected.join()) {
  throw new Error("valid tracks " + JSON.stringify(found));
}
if (found.tracks.some((row) => row.name === "leak.mp3" || row.name.startsWith("."))) {
  throw new Error("served a hidden or escaped file");
}

const pyValid = pyJson({
  LUMEN_ROOT: dir,
  LUMEN_ENV_FILE: path.join(dir, "none.env"),
  LUMEN_CONFIG: path.join(dir, "none.toml"),
  LUMEN_MUSIC_DIR: valid,
  LLM_API_KEY: KEY,
});
if (pyValid.music_tracks.join() !== expected.join() || pyValid.music_message) {
  throw new Error("python discovery drifted " + JSON.stringify(pyValid));
}

function expectReason(folder, reason, snippet) {
  const js = discoverMusic(folder);
  const py = pyJson({
    LUMEN_ROOT: dir,
    LUMEN_ENV_FILE: path.join(dir, "none.env"),
    LUMEN_CONFIG: path.join(dir, "none.toml"),
    LUMEN_MUSIC_DIR: folder,
  });
  if (js.reason !== reason || py.music_reason !== reason) {
    throw new Error(folder + " reason js=" + js.reason + " py=" + py.music_reason);
  }
  if (snippet && (!js.message.includes(snippet) || js.message !== py.music_message)) {
    throw new Error("message drift\n" + js.message + "\n" + py.music_message);
  }
}
expectReason(empty, "empty", "empty");
expectReason(junk, "unsupported", "No supported tracks");
expectReason(path.join(dir, "missing"), "missing", "not found");
expectReason("", "unset", "");

const servers = [];
try {
  const validSrv = start({ LUMEN_MUSIC_DIR: valid, LUMEN_MUSIC_ORDER: "ordered", LLM_API_KEY: KEY });
  servers.push(validSrv.child);
  const port = await validSrv.ready;
  const log = validSrv.text();
  if (log.includes(KEY)) throw new Error("server log printed the API key");
  if (!log.includes("5 tracks") || !log.includes("(ordered)")) throw new Error("server log\n" + log);
  const listed = await request(port, "/music.json");
  if (listed.status !== 200) throw new Error("music.json " + listed.status);
  const catalog = JSON.parse(listed.body.toString("utf8"));
  if (!catalog.ok || catalog.order !== "ordered" || catalog.tracks.map((row) => row.name).join() !== expected.join()) {
    throw new Error("catalog " + listed.body.toString("utf8"));
  }
  const file = await request(port, catalog.tracks[0].url);
  if (file.status !== 200 || file.body.toString() !== "mp3-bytes") throw new Error("track bytes " + file.status);
  if (file.headers["content-type"] !== "audio/mpeg") throw new Error("content type " + file.headers["content-type"]);
  const ranged = await request(port, catalog.tracks[0].url, { Range: "bytes=0-2" });
  if (ranged.status !== 206 || ranged.body.toString() !== "mp3") throw new Error("range " + ranged.status + " " + ranged.body.toString());
  for (const bad of ["/music/t/leak.mp3", "/music/t/notes.txt", "/music/t/%2e%2e%2foutside.mp3", "/music/t/nested%2Fnope.mp3"]) {
    const denied = await request(port, bad);
    if (denied.status !== 404) throw new Error(bad + " status " + denied.status);
  }
  await stop(validSrv.child);

  const emptySrv = start({ LUMEN_MUSIC_DIR: empty });
  servers.push(emptySrv.child);
  const emptyPort = await emptySrv.ready;
  const emptyBody = JSON.parse((await request(emptyPort, "/music.json")).body.toString("utf8"));
  if (emptyBody.ok || emptyBody.reason !== "empty" || !emptyBody.message.includes("empty")) {
    throw new Error("empty json " + JSON.stringify(emptyBody));
  }
  if (!emptySrv.text().includes("Music folder is empty")) throw new Error("empty log\n" + emptySrv.text());
  await stop(emptySrv.child);

  const junkSrv = start({ LUMEN_MUSIC_DIR: junk });
  servers.push(junkSrv.child);
  const junkPort = await junkSrv.ready;
  const junkBody = JSON.parse((await request(junkPort, "/music.json")).body.toString("utf8"));
  if (junkBody.reason !== "unsupported") throw new Error("junk json " + JSON.stringify(junkBody));
  await stop(junkSrv.child);

  const plain = start({});
  servers.push(plain.child);
  const plainPort = await plain.ready;
  const plainBody = JSON.parse((await request(plainPort, "/music.json")).body.toString("utf8"));
  if (plainBody.reason !== "unset" || plainBody.message) throw new Error("unset json " + JSON.stringify(plainBody));
  const symphony = await request(plainPort, "/symphony.mp4");
  if (symphony.status !== 204) throw new Error("missing single file should stay 204, got " + symphony.status);
  if (!plain.text().includes("music: synthesized")) throw new Error("synth log\n" + plain.text());
  await stop(plain.child);

  console.log("musicdir ok");
} finally {
  for (const child of servers) await stop(child);
  fs.rmSync(dir, { recursive: true, force: true });
}
