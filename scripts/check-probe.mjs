// The startup probe picks DeepSeek when that key answers, keeps MiniMax
// as a switch, and leaves an explicit LLM_API_KEY alone.
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probe = path.join(root, "scripts", "probe-llm.sh");

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
  const child = spawn("bash", ["-c", "set -euo pipefail; source \"$1\" && configure_llm && printf 'MODEL=%s\\nURL=%s\\nPROV=%s\\nDKEY=%s\\nMKEY=%s\\nDMODEL=%s\\nMMODEL=%s\\n' \"${LLM_MODEL:-}\" \"${LLM_BASE_URL:-}\" \"${LUMEN_LLM:-}\" \"${LUMEN_DEEPSEEK_KEY:-}\" \"${LUMEN_MINIMAX_KEY:-}\" \"${LUMEN_DEEPSEEK_MODEL:-}\" \"${LUMEN_MINIMAX_MODEL:-}\"", "bash", probe], {
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
  const env = { ...extra, PATH: process.env.PATH, HOME: os.homedir() };
  return env;
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-probe-"));
const deepFile = path.join(dir, "deepseek");
const miniFile = path.join(dir, "minimax");
fs.writeFileSync(deepFile, "deep-test-key\n");
fs.writeFileSync(miniFile, "mini-test-key\n");

const mock = await startMock();
try {
  const both = await run(baseEnv({
    DEEPSEEK_KEY_FILE: deepFile,
    MINIMAX_KEY_FILE: miniFile,
    DEEPSEEK_BASE_URL: mock.base,
    MINIMAX_BASE_URL: mock.base,
  }));
  if (both.err.includes("deep-test-key") || both.err.includes("mini-test-key")) {
    throw new Error("probe printed a key\n" + both.err);
  }
  if (!both.out.includes("MODEL=deepseek-flash")) throw new Error("default model\n" + both.out);
  if (!both.out.includes("URL=" + mock.base)) throw new Error("default url\n" + both.out);
  if (!both.out.includes("PROV=deepseek")) throw new Error("provider\n" + both.out);
  if (!both.out.includes("DKEY=deep-test-key")) throw new Error("deep key not exported\n" + both.out);
  if (!both.out.includes("MKEY=\n") && !both.out.match(/MKEY=\n/)) {
    if (both.out.includes("MKEY=mini-test-key")) throw new Error("rejected minimax key was exported\n" + both.out);
  }
  if (both.out.includes("MKEY=mini-test-key")) throw new Error("rejected minimax key was exported\n" + both.out);
  if (!both.err.includes("deepseek") || !both.err.includes("auth failed")) {
    throw new Error("status\n" + both.err);
  }

  const prefer = await run(baseEnv({
    LUMEN_LLM: "minimax",
    DEEPSEEK_KEY_FILE: deepFile,
    MINIMAX_KEY_FILE: deepFile,
    DEEPSEEK_BASE_URL: mock.base,
    MINIMAX_BASE_URL: mock.base,
  }));
  if (!prefer.out.includes("MODEL=MiniMax-M3.1-Flash")) throw new Error("minimax model\n" + prefer.out);
  if (!prefer.out.includes("PROV=minimax")) throw new Error("minimax provider\n" + prefer.out);

  const before = mock.hits.n;
  const pinned = await run(baseEnv({
    LLM_API_KEY: "already-set",
    LLM_MODEL: "mock-garden",
    LLM_BASE_URL: "http://127.0.0.1:9/v1",
    DEEPSEEK_KEY_FILE: deepFile,
    MINIMAX_KEY_FILE: miniFile,
  }));
  if (mock.hits.n !== before) throw new Error("explicit key still probed");
  if (!pinned.out.includes("MODEL=mock-garden")) throw new Error("kept model\n" + pinned.out);
  if (!pinned.err.includes("using LLM_API_KEY")) throw new Error("status\n" + pinned.err);
  if (pinned.out.includes("DKEY=deep-test-key")) throw new Error("file key leaked into an explicit config");

  const closed = await run(baseEnv({
    DEEPSEEK_KEY_FILE: deepFile,
    DEEPSEEK_BASE_URL: "http://127.0.0.1:9/v1",
    MINIMAX_KEY_FILE: path.join(dir, "missing"),
  }));
  if (!closed.out.includes("MODEL=deepseek-flash")) throw new Error("unconfirmed\n" + closed.out + closed.err);
  if (!closed.err.includes("unconfirmed")) throw new Error("unconfirmed status\n" + closed.err);

  console.log("probe ok");
} finally {
  await new Promise((resolve) => mock.server.close(resolve));
  fs.rmSync(dir, { recursive: true, force: true });
}
