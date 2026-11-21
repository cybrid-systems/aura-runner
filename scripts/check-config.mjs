// Config precedence, key masking, MiniMax notice, and the Docker mount.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "lumen_config.py");
const NOTICE = "MiniMax is no longer a preset. Using saved API settings if present, otherwise playing offline.";
const KEY = "sekret-config-key-042";
const ENV_KEY = "sekret-env-key-99991";
const TOML_KEY = "sekret-toml-key-88882";
const MINI = "sekret-mini-key-77773";

function py(args, env) {
  return spawnSync("python3", [script, ...args], {
    env: { PATH: process.env.PATH, HOME: os.homedir(), ...env },
    encoding: "utf8",
  });
}

function must(res, label) {
  if (res.status !== 0) {
    throw new Error(label + " exit " + res.status + "\n" + res.stderr + res.stdout);
  }
  return res;
}

function noKey(text, label) {
  for (const secret of [KEY, ENV_KEY, TOML_KEY, MINI]) {
    if (text.includes(secret)) throw new Error(label + " printed a key");
  }
}

function write(dir, name, body) {
  fs.writeFileSync(path.join(dir, name), body);
}

function read(dir, name) {
  return fs.readFileSync(path.join(dir, name), "utf8");
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lumen-cfg-"));
const songs = path.join(dir, "my songs");
const emptyDir = path.join(dir, "empty");
const oddDir = path.join(dir, "a:b");
const missing = path.join(dir, "missing-folder");
fs.mkdirSync(songs);
fs.mkdirSync(emptyDir);
fs.mkdirSync(oddDir);
fs.writeFileSync(path.join(songs, "b.mp3"), "bee");
fs.writeFileSync(path.join(songs, "a.ogg"), "ay");
fs.writeFileSync(path.join(emptyDir, "notes.txt"), "nope");

const base = { LUMEN_ROOT: dir, LUMEN_ENV_FILE: path.join(dir, ".env"), LUMEN_CONFIG: path.join(dir, "lumen.toml") };

try {
  write(dir, ".env", `LLM_API_KEY=${KEY}\nLLM_MODEL=from-dotenv\nLLM_BASE_URL=https://api.deepseek.com/v1\n`);
  write(dir, "lumen.toml", 'model = "from-toml"\nbase_url = "https://toml.example/v1"\n');
  const envWins = JSON.parse(must(py(["--json"], { ...base, LLM_MODEL: "from-env" }), "env model").stdout);
  if (envWins.model !== "from-env" || envWins.model_source !== "environment") {
    throw new Error("env model did not win " + JSON.stringify(envWins));
  }
  if (envWins.base_url !== "https://toml.example/v1" || envWins.base_url_source !== "lumen.toml") {
    throw new Error("toml address did not beat .env " + JSON.stringify(envWins));
  }
  if (envWins.api_key_length !== KEY.length || envWins.api_key_source !== ".env" || envWins.api_key_set !== true) {
    throw new Error("key length " + JSON.stringify(envWins));
  }
  noKey(JSON.stringify(envWins), "json");

  const tomlWins = JSON.parse(must(py(["--json"], base), "toml model").stdout);
  if (tomlWins.model !== "from-toml" || tomlWins.model_source !== "lumen.toml") {
    throw new Error("toml model did not beat .env " + JSON.stringify(tomlWins));
  }
  if (tomlWins.preset !== "generic") throw new Error("custom address should be generic");

  write(dir, "lumen.toml", 'music_order = "shuffle"\n');
  const dotenvModel = JSON.parse(must(py(["--json"], base), "dotenv model").stdout);
  if (dotenvModel.model !== "from-dotenv" || dotenvModel.model_source !== ".env") {
    throw new Error(".env model fallback " + JSON.stringify(dotenvModel));
  }
  if (dotenvModel.preset !== "generic" || dotenvModel.base_url !== "https://api.deepseek.com/v1") {
    throw new Error("custom model stays on the generic path " + JSON.stringify(dotenvModel));
  }
  write(dir, ".env", `LLM_API_KEY=${KEY}\n`);
  const preset = JSON.parse(must(py(["--json"], base), "deepseek preset").stdout);
  if (preset.preset !== "deepseek" || preset.model !== "deepseek-flash" || preset.model_source !== "default") {
    throw new Error("deepseek preset " + JSON.stringify(preset));
  }
  if (preset.base_url !== "https://api.deepseek.com/v1") throw new Error("deepseek url " + JSON.stringify(preset));

  write(dir, ".env", "LUMEN_LLM_OFF=1\n");
  write(dir, "lumen.toml", `api_key = "${TOML_KEY}"\nmodel = "deepseek-flash"\n`);
  const tomlKey = JSON.parse(must(py(["--json"], base), "toml key").stdout);
  if (tomlKey.api_key_source !== "lumen.toml" || tomlKey.api_key_length !== TOML_KEY.length) {
    throw new Error("toml key " + JSON.stringify(tomlKey));
  }
  const shown = must(py(["--show"], base), "show");
  noKey(shown.stdout + shown.stderr, "show");
  if (!shown.stdout.includes(`set, ${TOML_KEY.length} characters`)) {
    throw new Error("show did not mask the key\n" + shown.stdout);
  }
  if (!shown.stdout.includes("DeepSeek V4.1 Flash") || !shown.stdout.includes("deepseek-flash")) {
    throw new Error("show preset\n" + shown.stdout);
  }

  const envKey = JSON.parse(must(py(["--json"], { ...base, LLM_API_KEY: ENV_KEY }), "env key").stdout);
  if (envKey.api_key_source !== "environment" || envKey.api_key_length !== ENV_KEY.length) {
    throw new Error("env key did not win " + JSON.stringify(envKey));
  }
  const shownEnv = must(py(["--show"], { ...base, LLM_API_KEY: ENV_KEY }), "show env");
  noKey(shownEnv.stdout + shownEnv.stderr, "show env");

  write(dir, "lumen.toml", `music_dir = ${JSON.stringify(path.join(dir, "from-toml"))}\nmusic_order = "ordered"\n`);
  fs.mkdirSync(path.join(dir, "from-toml"));
  const musicEnv = JSON.parse(must(py(["--json"], { ...base, LUMEN_MUSIC_DIR: songs, LUMEN_MUSIC_ORDER: "shuffle" }), "music env").stdout);
  if (musicEnv.music_dir !== songs || musicEnv.music_dir_source !== "environment") {
    throw new Error("music env " + JSON.stringify(musicEnv));
  }
  if (musicEnv.music_order !== "shuffle" || musicEnv.music_order_source !== "environment") {
    throw new Error("order env " + JSON.stringify(musicEnv));
  }
  if (musicEnv.music_tracks.join() !== "a.ogg,b.mp3" || musicEnv.docker_mount[1] !== `${songs}:/music:ro`) {
    throw new Error("tracks or mount " + JSON.stringify(musicEnv));
  }
  const musicToml = JSON.parse(must(py(["--json"], base), "music toml").stdout);
  if (!musicToml.music_dir.endsWith("from-toml") || musicToml.music_order !== "ordered") {
    throw new Error("music toml " + JSON.stringify(musicToml));
  }

  write(dir, "lumen.toml", 'music_order = "sideways"\n');
  const badOrder = must(py(["--json"], base), "bad order");
  const badJson = JSON.parse(badOrder.stdout);
  if (badJson.music_order !== "shuffle" || !badOrder.stderr.includes("not shuffle or ordered")) {
    throw new Error("bad order " + badOrder.stderr + badOrder.stdout);
  }

  write(dir, ".env", `LLM_API_KEY=${KEY}\nLLM_BASE_URL=https://api.minimaxi.com/v1\nLLM_MODEL=MiniMax-M3.1-Flash\nLUMEN_LLM=minimax\nLUMEN_MINIMAX_KEY=${MINI}\n`);
  write(dir, "lumen.toml", 'music_order = "shuffle"\n');
  const old = must(py(["--json"], base), "old minimax");
  const oldJson = JSON.parse(old.stdout);
  if (oldJson.minimax_notice !== NOTICE) throw new Error("notice json " + old.stdout);
  if (oldJson.preset !== "generic" || oldJson.model !== "MiniMax-M3.1-Flash") {
    throw new Error("generic fallback " + old.stdout);
  }
  noKey(old.stdout, "old json");
  const notice = must(py(["--notice"], base), "notice");
  if (!notice.stderr.includes(NOTICE) || notice.stdout.trim()) throw new Error("notice stream");
  noKey(notice.stdout + notice.stderr, "notice");

  write(dir, "lumen.toml", `music_dir = ${JSON.stringify(missing)}\n`);
  const gone = JSON.parse(must(py(["--json"], base), "missing").stdout);
  if (gone.music_reason !== "missing" || gone.docker_mount.length || !gone.music_message.includes("not found")) {
    throw new Error("missing folder " + JSON.stringify(gone));
  }
  write(dir, "lumen.toml", `music_dir = ${JSON.stringify(emptyDir)}\n`);
  const bare = JSON.parse(must(py(["--json"], base), "unsupported").stdout);
  if (bare.music_reason !== "unsupported" || !bare.music_message.includes("No supported tracks")) {
    throw new Error("unsupported " + JSON.stringify(bare));
  }
  if (bare.docker_mount[1] !== `${emptyDir}:/music:ro`) throw new Error("empty-of-audio still mounts");
  fs.rmSync(path.join(emptyDir, "notes.txt"));
  const vacant = JSON.parse(must(py(["--json"], base), "empty").stdout);
  if (vacant.music_reason !== "empty" || !vacant.music_message.includes("empty")) {
    throw new Error("empty " + JSON.stringify(vacant));
  }

  write(dir, "lumen.toml", `music_dir = ${JSON.stringify(oddDir)}\n`);
  const colon = must(py(["--docker-sh"], base), "colon");
  if (!colon.stdout.includes("music_mount=()") || !colon.stderr.includes("cannot contain")) {
    throw new Error("colon mount\n" + colon.stdout + colon.stderr);
  }
  noKey(colon.stdout + colon.stderr, "colon");

  write(dir, ".env", `LLM_API_KEY=${KEY}\n`);
  write(dir, "lumen.toml", `music_dir = ${JSON.stringify(songs)}\nbase_url = "https://keep.example/v1"\nmodel = "keep-model"\n`);
  const exportPath = path.join(dir, "export.sh");
  const exported = py(["--export-file", exportPath], base);
  if (exported.status !== 0) throw new Error("export " + exported.stderr);
  if (exported.stdout.trim()) throw new Error("export printed to stdout");
  noKey(exported.stderr, "export stderr");
  const body = fs.readFileSync(exportPath, "utf8");
  if (!body.includes(`LLM_API_KEY=${JSON.stringify(KEY).slice(1, -1)}`) && !body.includes(`'${KEY}'`) && !body.includes(KEY)) {
    throw new Error("export file dropped the key");
  }
  if ((fs.statSync(exportPath).mode & 0o777) !== 0o600) throw new Error("export mode");
  if (!body.includes("unset LUMEN_MINIMAX_KEY")) throw new Error("export did not drop minimax");

  const kept = py(["--write-music", songs], base);
  if (kept.status !== 0) throw new Error("write music " + kept.stderr);
  const rewritten = read(dir, "lumen.toml");
  if (!rewritten.includes(songs) || !rewritten.includes("https://keep.example/v1") || !rewritten.includes("keep-model")) {
    throw new Error("rewrite dropped settings\n" + rewritten);
  }
  if (py(["--write-music", ""], base).status !== 0) throw new Error("clear music");
  const cleared = read(dir, "lumen.toml");
  if (/^music_dir\s*=/m.test(cleared)) throw new Error("cleared music_dir stayed active\n" + cleared);
  if (!cleared.includes("keep-model")) throw new Error("clear dropped the model");

  write(dir, "lumen.toml", "this is not toml\n");
  const broken = py(["--show"], base);
  if (broken.status === 0 || broken.stderr.includes("Traceback")) {
    throw new Error("bad toml was not a clean error\n" + broken.stderr);
  }

  const missingCheck = py(["--check-music", missing], base);
  if (missingCheck.status !== 1 || !missingCheck.stdout.includes("not found")) {
    throw new Error("check missing " + missingCheck.status + " " + missingCheck.stdout);
  }
  const okCheck = py(["--check-music", songs], base);
  if (okCheck.status !== 0 || !okCheck.stdout.includes("2 tracks will loop")) {
    throw new Error("check songs " + okCheck.status + " " + okCheck.stdout);
  }
  const emptyCheck = py(["--check-music", emptyDir], base);
  if (emptyCheck.status !== 0 || !emptyCheck.stdout.includes("empty")) {
    throw new Error("check empty " + emptyCheck.stdout);
  }
  noKey(okCheck.stdout + missingCheck.stdout + emptyCheck.stdout, "check-music");

  for (const file of ["scripts/lumen_config.py", "scripts/probe-llm.sh", "docker/entrypoint.sh"]) {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (!text.includes(NOTICE)) throw new Error(file + " drifted from the MiniMax notice");
  }
  const example = fs.readFileSync(path.join(root, "lumen.toml.example"), "utf8");
  for (const key of ["music_dir", "music_order", "base_url", "model"]) {
    if (!example.includes(key)) throw new Error("example missing " + key);
  }
  if (/^api_key\s*=/m.test(example) || example.includes(KEY)) throw new Error("example has a key");
  if (!example.includes(".env")) throw new Error("example should point the key at .env");

  console.log("config ok");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
