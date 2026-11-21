// The startup probe uses DeepSeek when that key answers, leaves an
// explicit LLM_API_KEY alone, and does not keep a MiniMax preset.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probe = path.join(root, "scripts", "probe-llm.sh");
const NOTICE = "MiniMax is no longer a preset. Using saved API settings if present, otherwise playing offline.";

function startMock() {
  const hits = { n: 0 };
  const server = http.createServer((req, res) => {
    hits.n += 1;
    const auth = req.headers.authorization || "";
    const ok = auth.endsWith("deep-test-key");
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
      res.end(ok ? "{\"data\":[]}" : "{\"error\":\"no\"}");
      return;
    }
    res.writeHead(404);
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, hits, base: `http://127.0.0.1:${server.address().port}/v1` });
    });
  });
}

function run(env) {
  const child = spawn("bash", ["-c", "set -euo pipefail; source \"$1\" && configure_llm && printf 'MODEL=%s\\nURL=%s\\nPROV=%s\\nDKEY=%s\\nDMODEL=%s\\n' \"${LLM_MODEL:-}\" \"${LLM_BASE_URL:-}\" \"${LUMEN_LLM:-}\" \"${LUMEN_DEEPSEEK_KEY:-}\" \"${LUMEN_DEEPSEEK_MODEL:-}\"", "bash", probe], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  let err = "";
  child.stdout.on("data", (c) => { out += c; });
  child.stderr.on("data", (c) => { err += c; });
  return new Promise((resolve, reject) => {
    child.on("exit", (code) => {
      if (code !== 0) reject(new Error("probe exit " + code + "\n" + err + out));
      else resolve({ out, err });
    });
  });
}

function baseEnv(extra) {
  return { ...extra, PATH: process.env.PATH, HOME: os.homedir() };
}

function assertNoSecret(blob, secret, label) {
  if (secret && blob.includes(secret)) throw new Error(label + "\n" + blob.replaceAll(secret, "[redacted]"));
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-probe-"));
const deepFile = path.join(dir, "deepseek");
const missing = path.join(dir, "missing");
fs.writeFileSync(deepFile, "deep-test-key\n");

const mock = await startMock();
try {
  const both = await run(baseEnv({
    DEEPSEEK_KEY_FILE: deepFile,
    MINIMAX_KEY_FILE: path.join(dir, "minimax"),
    DEEPSEEK_BASE_URL: mock.base,
    LUMEN_MINIMAX_KEY: "mini-test-key",
  }));
  assertNoSecret(both.out + both.err, "mini-test-key", "probe printed a minimax key");
  assertNoSecret(both.err, "deep-test-key", "probe printed a deepseek key");
  if (!both.out.includes("MODEL=deepseek-flash")) throw new Error("default model\n" + both.out);
  if (!both.out.includes("URL=" + mock.base)) throw new Error("default url\n" + both.out);
  if (!both.out.includes("PROV=deepseek")) throw new Error("provider\n" + both.out);
  if (!both.out.includes("DKEY=deep-test-key")) throw new Error("deep key not exported\n" + both.out);
  if (!both.err.includes(NOTICE)) throw new Error("minimax notice\n" + both.err);
  if (both.err.includes("MiniMax-M3") || both.out.includes("PROV=minimax")) {
    throw new Error("minimax preset still selected\n" + both.out + both.err);
  }
  if (mock.hits.n !== 1) throw new Error("minimax key was probed, hits " + mock.hits.n);

  const before = mock.hits.n;
  const pinned = await run(baseEnv({
    LLM_API_KEY: "already-set",
    LLM_MODEL: "mock-garden",
    LLM_BASE_URL: "http://127.0.0.1:9/v1",
    DEEPSEEK_KEY_FILE: deepFile,
    LUMEN_MINIMAX_KEY: "mini-test-key",
  }));
  if (mock.hits.n !== before) throw new Error("explicit key still probed");
  if (!pinned.out.includes("MODEL=mock-garden")) throw new Error("kept model\n" + pinned.out);
  if (!pinned.err.includes("using LLM_API_KEY")) throw new Error("status\n" + pinned.err);
  if (!pinned.err.includes(NOTICE)) throw new Error("explicit minimax notice\n" + pinned.err);
  if (pinned.out.includes("DKEY=deep-test-key")) throw new Error("file key leaked into an explicit config");
  assertNoSecret(pinned.err, "mini-test-key", "explicit config printed a minimax key");
  assertNoSecret(pinned.err, "already-set", "explicit config printed the API key");

  const closed = await run(baseEnv({
    DEEPSEEK_KEY_FILE: deepFile,
    DEEPSEEK_BASE_URL: "http://127.0.0.1:9/v1",
  }));
  if (!closed.out.includes("MODEL=deepseek-flash")) throw new Error("unconfirmed\n" + closed.out + closed.err);
  if (!closed.err.includes("unconfirmed")) throw new Error("unconfirmed status\n" + closed.err);

  const offline = await run(baseEnv({
    DEEPSEEK_KEY_FILE: missing,
    LUMEN_LLM: "minimax",
    LUMEN_MINIMAX_KEY: "mini-only-key",
  }));
  if (offline.out.includes("MODEL=MiniMax") || offline.out.includes("PROV=minimax")) {
    throw new Error("offline still selected minimax\n" + offline.out);
  }
  if (!offline.out.startsWith("MODEL=\n")) throw new Error("offline model\n" + offline.out);
  if (!offline.err.includes(NOTICE)) throw new Error("offline notice\n" + offline.err);
  if (!offline.err.includes("offline")) throw new Error("offline status\n" + offline.err);
  assertNoSecret(offline.out + offline.err, "mini-only-key", "offline printed the minimax key");

  console.log("probe ok");
} finally {
  await new Promise((resolve) => mock.server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
