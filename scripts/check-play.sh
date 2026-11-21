#!/usr/bin/env bash
# ./play.sh questions, a hidden key, and a gitignored env file.
# No Docker daemon is required. LUMEN_PLAY_NO_RUN stops before a container.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git check-ignore -q -- .env
git check-ignore -q -- .env.playtest
git check-ignore -q -- lumen.toml
if git check-ignore -q -- lumen.toml.example; then
  echo "lumen.toml.example should stay in git" >&2
  exit 1
fi

if [[ -e .env || -e .env.playtest || -e lumen.toml ]]; then
  echo "refusing to touch an existing .env, .env.playtest, or lumen.toml" >&2
  exit 1
fi
cleanup() {
  rm -f "$ROOT/.env" "$ROOT/.env.playtest" "$ROOT/lumen.toml"
  local f
  for f in "$ROOT"/.env.??????; do
    [[ -e "$f" ]] || continue
    rm -f "$f"
  done
}
trap cleanup EXIT

fail() {
  echo "play check failed: $*" >&2
  exit 1
}

hide="$(mktemp -d)"
mkdir -p "$hide/bin"
ln -s "$(command -v dirname)" "$hide/bin/dirname"
ln -s "$(command -v bash)" "$hide/bin/bash"
out="$(PATH="$hide/bin" ./play.sh 2>&1 || true)"
rm -rf "$hide"
printf '%s\n' "$out" | grep -q "Docker is not installed" || fail "missing docker message"
printf '%s\n' "$out" | grep -q "https://www.docker.com/products/docker-desktop/" || fail "desktop link"
printf '%s\n' "$out" | grep -q "https://orbstack.dev" || fail "orbstack link"
if printf '%s\n' "$out" | grep -q "Paste a DeepSeek API key"; then
  fail "asked for a key before docker was installed"
fi

fake="$(mktemp -d)"
cat > "$fake/docker" << 'EOF'
#!/bin/sh
echo "Cannot connect to the Docker daemon. Is the docker daemon running?" >&2
exit 1
EOF
chmod +x "$fake/docker"
out="$(PATH="$fake:/usr/bin:/bin" ./play.sh 2>&1 || true)"
printf '%s\n' "$out" | grep -q "not running" || fail "stopped docker message"
printf '%s\n' "$out" | grep -q "https://orbstack.dev" || fail "stopped link"
if printf '%s\n' "$out" | grep -q "Paste a DeepSeek API key"; then
  fail "asked for a key while docker was stopped"
fi

cat > "$fake/docker" << 'EOF'
#!/bin/sh
echo "permission denied while trying to connect to the Docker daemon socket" >&2
exit 1
EOF
out="$(PATH="$fake:/usr/bin:/bin" ./play.sh 2>&1 || true)"
printf '%s\n' "$out" | grep -q "cannot use it" || fail "permission message"
rm -rf "$fake"

if ./play.sh --help >/tmp/lumen-play-help.out 2>/tmp/lumen-play-help.err; then
  grep -q "\-\-setup" /tmp/lumen-play-help.err
  grep -q "\-\-config" /tmp/lumen-play-help.err
else
  fail "help"
fi

cfg_show="$(mktemp)"
env_show="$(mktemp)"
rm -f "$cfg_show" "$env_show"
show_out="$(
  env -u LLM_API_KEY -u LLM_BASE_URL -u LLM_MODEL \
    -u LUMEN_MINIMAX_KEY -u LUMEN_MINIMAX_URL -u LUMEN_MINIMAX_MODEL \
    -u LUMEN_DEEPSEEK_KEY -u LUMEN_LLM -u LUMEN_MUSIC_DIR \
    LUMEN_ENV_FILE="$env_show" LUMEN_CONFIG="$cfg_show" LUMEN_ROOT="$ROOT" \
    ./play.sh --config
)"
printf '%s\n' "$show_out" | grep -q "api key: not set" || fail "config did not say the key is unset"
printf '%s\n' "$show_out" | grep -q "synthesized" || fail "config did not default to synthesized music"
if printf '%s\n' "$show_out" | grep -q "Docker is not installed"; then
  fail "config tried to start docker"
fi
rm -f "$cfg_show" "$env_show"

# A local image is reused. The missing registry is not pulled, and a
# lumen-run:local tag is published under the ghcr name.
imglog="$(mktemp)"
imgbin="$(mktemp -d)"
cat > "$imgbin/docker" << EOF
#!/bin/sh
printf '%s\n' "\$*" >> "$imglog"
case "\$1" in
  info) exit 0 ;;
  image)
    name="\$3"
    if [ "\$name" = "ghcr.io/cybrid-systems/aura-runner:latest" ]; then
      if [ -f "$imglog.tagged" ]; then exit 0; fi
      exit 1
    fi
    if [ "\$name" = "lumen-run:local" ]; then exit 0; fi
    exit 1
    ;;
  tag) touch "$imglog.tagged"; exit 0 ;;
  pull) printf 'PULL\n' >> "$imglog"; exit 1 ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$imgbin/docker"
printf '%s\n' 'LUMEN_LLM_OFF=1' > "$ROOT/.env.playtest"
chmod 600 "$ROOT/.env.playtest"
chosen="$(PATH="$imgbin:$PATH" LUMEN_ENV_FILE="$ROOT/.env.playtest" LUMEN_PLAY_CHOOSE_ONLY=1 ./play.sh)"
if [[ "$chosen" != "ghcr.io/cybrid-systems/aura-runner:latest" ]]; then
  fail "chose [$chosen]"
fi
if grep -q '^PULL$' "$imglog"; then
  fail "pulled even though a local image exists"
fi
if ! grep -q '^tag ' "$imglog"; then
  fail "did not retag lumen-run:local"
fi
rm -rf "$imgbin" "$imglog" "$imglog.tagged"
rm -f "$ROOT/.env.playtest"

python3 - "$ROOT" << 'PY'
import os, pty, select, shutil, subprocess, sys, tempfile, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

root = sys.argv[1]
play = os.path.join(root, "play.sh")
env_file = os.path.join(root, ".env.playtest")
cfg_dir = tempfile.mkdtemp(prefix="lumen-play-cfg-")
cfg = os.path.join(cfg_dir, "lumen.toml")
NOTICE = "MiniMax is no longer a preset. Using saved API settings if present, otherwise playing offline."
GOOD = "sk-test-lumen-not-real-7f3a"
BAD = "sk-test-rejected-9c2b"

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.hits += 1
        auth = self.headers.get("Authorization", "")
        ok = auth.endswith(GOOD)
        body = b'{"data":[]}' if ok else b'{"error":"no"}'
        self.send_response(200 if ok else 401)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)
    def do_POST(self):
        self.do_GET()
    def log_message(self, fmt, *args):
        return

server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
server.hits = 0
threading.Thread(target=server.serve_forever, daemon=True).start()
base = "http://127.0.0.1:%d/v1" % server.server_address[1]

def redact(blob, extra=()):
    text = blob.decode("utf-8", "replace") if isinstance(blob, bytes) else blob
    for secret in (GOOD, BAD, *extra):
        if secret:
            text = text.replace(secret, "[redacted]")
    return text

def base_env(extra=None):
    env = os.environ.copy()
    env["LUMEN_PLAY_NO_RUN"] = "1"
    env["LUMEN_ENV_FILE"] = env_file
    env["LUMEN_CONFIG"] = cfg
    env["LUMEN_ROOT"] = root
    env["LUMEN_PLAY_PROBE_URL"] = base
    for name in (
        "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL",
        "LUMEN_MINIMAX_KEY", "LUMEN_MINIMAX_URL", "LUMEN_MINIMAX_MODEL",
        "LUMEN_DEEPSEEK_KEY", "LUMEN_LLM", "LUMEN_MUSIC_DIR", "LUMEN_MUSIC_ORDER",
    ):
        env.pop(name, None)
    if extra:
        env.update(extra)
    return env

def run(args, steps, timeout=12, extra=None):
    env = base_env(extra)
    master, slave = pty.openpty()
    proc = subprocess.Popen(
        [play, *args],
        stdin=slave, stdout=slave, stderr=slave,
        env=env, cwd=root,
    )
    os.close(slave)
    out = b""

    def pull(limit):
        nonlocal out
        end = time.time() + limit
        while time.time() < end:
            ready, _, _ = select.select([master], [], [], 0.1)
            if not ready:
                if proc.poll() is not None:
                    break
                continue
            try:
                chunk = os.read(master, 8192)
            except OSError:
                break
            if not chunk:
                break
            out += chunk
        return out

    try:
        for needle, reply in steps:
            deadline = time.time() + timeout
            while needle.encode() not in out:
                if time.time() > deadline:
                    raise SystemExit("missing %r\n%s" % (needle, redact(out)))
                pull(0.2)
                if proc.poll() is not None and needle.encode() not in out:
                    pull(0.3)
                    if needle.encode() not in out:
                        raise SystemExit("exited before %r\n%s" % (needle, redact(out)))
            if reply is not None:
                time.sleep(0.05)
                os.write(master, reply)
        deadline = time.time() + timeout
        while proc.poll() is None and time.time() < deadline:
            pull(0.2)
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=3)
            raise SystemExit("timed out\n" + redact(out))
        pull(0.2)
        return proc.returncode, out
    finally:
        try:
            os.close(master)
        except OSError:
            pass

def names(path):
    if not os.path.exists(path):
        return []
    found = []
    for line in open(path, encoding="utf-8"):
        if not line.strip() or line.startswith("#") or "=" not in line:
            continue
        found.append(line.split("=", 1)[0])
    return found

def value(path, name):
    for line in open(path, encoding="utf-8"):
        if line.startswith(name + "="):
            return line.split("=", 1)[1].rstrip("\n")
    return None

def assert_mode(path):
    mode = os.stat(path).st_mode & 0o777
    if mode != 0o600:
        raise SystemExit("mode %o on %s" % (mode, os.path.basename(path)))

def assert_ignored(path):
    rel = os.path.relpath(path, root)
    proc = subprocess.run(["git", "check-ignore", "-q", "--", rel], cwd=root)
    if proc.returncode != 0:
        raise SystemExit("not ignored: " + rel)
    status = subprocess.check_output(["git", "status", "--porcelain", "--", rel], cwd=root, text=True)
    if status.strip():
        raise SystemExit("git status shows " + rel)

def assert_hidden(blob, *secrets):
    text = blob.decode("utf-8", "replace")
    for secret in secrets:
        if secret and secret in text:
            raise SystemExit("secret was shown\n" + redact(text, secrets))

# Skip path. Enter on the key, Enter on the folder. No key is written.
if os.path.exists(env_file):
    os.remove(env_file)
code, out = run([], [
    ("Press Enter to play with AI features off:", b"\n"),
    ("Music folder:", b"\n"),
    ("AI features are off", None),
])
if code != 0:
    raise SystemExit("skip exit %s\n%s" % (code, redact(out)))
if b"Which service?" in out or b"API address" in out or b"MiniMax" in out:
    raise SystemExit("skip asked for a service menu\n" + redact(out))
assert_mode(env_file)
assert_ignored(env_file)
if value(env_file, "LUMEN_LLM_OFF") != "1":
    raise SystemExit("skip marker missing; names %s" % names(env_file))
if "LLM_API_KEY" in names(env_file):
    raise SystemExit("skip file has a key name")
toml = open(cfg, encoding="utf-8").read()
if any(line.startswith("music_dir ") or line.startswith("music_dir=") for line in toml.splitlines()):
    raise SystemExit("skip saved a music folder\n" + toml)

# A second run reuses the skip and does not ask.
code, out = run([], [("AI features are off", None)])
if code != 0:
    raise SystemExit("reuse exit %s\n%s" % (code, redact(out)))
if b"Music folder:" in out or b"Which service?" in out:
    raise SystemExit("reuse asked again\n" + redact(out))

# DeepSeek key, checked against the mock. The address is not a question.
before = server.hits
code, out = run(["--setup"], [
    ("Press Enter to play with AI features off:", (GOOD + "\n").encode()),
    ("Key looks good", None),
    ("Music folder:", b"\n"),
])
if code != 0:
    raise SystemExit("ok exit %s\n%s" % (code, redact(out)))
assert_hidden(out, GOOD)
if server.hits <= before:
    raise SystemExit("key was not checked")
assert_mode(env_file)
assert_ignored(env_file)
if value(env_file, "LLM_API_KEY") != GOOD:
    raise SystemExit("LLM_API_KEY was not stored")
if value(env_file, "LLM_BASE_URL") != base:
    raise SystemExit("base url was not stored")
if value(env_file, "LLM_MODEL") != "deepseek-flash":
    raise SystemExit("model was not stored; names %s" % names(env_file))
if value(env_file, "LUMEN_LLM") != "deepseek":
    raise SystemExit("provider was not stored")
if value(env_file, "LUMEN_DEEPSEEK_KEY") != GOOD:
    raise SystemExit("deepseek key missing")
if "LUMEN_MINIMAX_KEY" in names(env_file) or "MiniMax" in open(env_file, encoding="utf-8").read():
    raise SystemExit("minimax left on a deepseek setup")
saved = open(env_file, encoding="utf-8").read()

# Reuse does not probe again and does not read a new key.
hits = server.hits
code, out = run([], [("Using the saved API setup", None)])
if code != 0 or b"Music folder:" in out or b"Which service?" in out:
    raise SystemExit("saved reuse failed\n" + redact(out))
if server.hits != hits:
    raise SystemExit("reuse probed again")
if open(env_file, encoding="utf-8").read() != saved:
    raise SystemExit("reuse rewrote the file")

# A rejected key is not saved over the good file, and is not shown.
code, out = run(["--setup"], [
    ("Press Enter to play with AI features off:", (BAD + "\n").encode()),
    ("That key was not accepted", None),
])
if code == 0:
    raise SystemExit("auth failure exited 0")
assert_hidden(out, BAD, GOOD)
if b"Music folder:" in out:
    raise SystemExit("auth failure asked for music\n" + redact(out))
if open(env_file, encoding="utf-8").read() != saved:
    raise SystemExit("auth failure replaced the saved file")
if BAD in open(env_file, encoding="utf-8").read():
    raise SystemExit("rejected key was written")

# Unreachable DeepSeek: nothing new is saved.
code, out = run(["--setup"], [
    ("Press Enter to play with AI features off:", (GOOD + "\n").encode()),
    ("Could not reach", None),
], extra={"LUMEN_PLAY_PROBE_URL": "http://127.0.0.1:9/v1"})
if code == 0:
    raise SystemExit("unknown probe exited 0")
assert_hidden(out, GOOD)
if open(env_file, encoding="utf-8").read() != saved:
    raise SystemExit("unreachable probe replaced the saved file")

# A music folder is saved in the config, mounted read-only, and the key stays masked.
songs = os.path.join(cfg_dir, "my songs")
os.makedirs(songs)
open(os.path.join(songs, "one.mp3"), "wb").write(b"not-a-real-mp3")
code, out = run(["--setup"], [
    ("Press Enter to play with AI features off:", (GOOD + "\n").encode()),
    ("Key looks good", None),
    ("Music folder:", (songs + "\n").encode()),
    ("will loop", None),
])
if code != 0:
    raise SystemExit("music exit %s\n%s" % (code, redact(out)))
assert_hidden(out, GOOD)
if value(env_file, "LUMEN_LLM") != "deepseek" or value(env_file, "LLM_MODEL") != "deepseek-flash":
    raise SystemExit("music setup lost the deepseek preset")
if "LUMEN_MINIMAX_KEY" in names(env_file):
    raise SystemExit("minimax key stored with music")
toml = open(cfg, encoding="utf-8").read()
if songs not in toml:
    raise SystemExit("music folder was not saved\n" + toml)
shown = subprocess.run(
    [play, "--config"], cwd=root, env=base_env(), capture_output=True, text=True,
)
if shown.returncode != 0:
    raise SystemExit("config exit %s\n%s" % (shown.returncode, shown.stderr))
if GOOD in shown.stdout or GOOD in shown.stderr or BAD in shown.stdout:
    raise SystemExit("config printed the key")
if ("%d characters" % len(GOOD)) not in shown.stdout:
    raise SystemExit("config did not mask the key\n" + shown.stdout)
if "deepseek-flash" not in shown.stdout or songs not in shown.stdout:
    raise SystemExit("config missing preset or folder\n" + shown.stdout)
mounted = subprocess.run(
    [sys.executable, os.path.join(root, "scripts/lumen_config.py"), "--docker-sh"],
    cwd=root, env=base_env(), capture_output=True, text=True,
)
if mounted.returncode != 0:
    raise SystemExit("docker-sh failed\n" + mounted.stderr)
if ":/music:ro" not in mounted.stdout or songs not in mounted.stdout:
    raise SystemExit("music folder was not mounted read-only\n" + mounted.stdout)
if GOOD in mounted.stdout or GOOD in mounted.stderr:
    raise SystemExit("docker args printed the key")
container_env = os.path.join(cfg_dir, "container.env")
held = subprocess.run(
    [sys.executable, os.path.join(root, "scripts/lumen_config.py"), "--docker-sh", "--container-env", container_env],
    cwd=root, env=base_env(), capture_output=True, text=True,
)
if held.returncode != 0 or GOOD in held.stdout:
    raise SystemExit("container env command printed the key")
inside = open(container_env, encoding="utf-8").read()
if "LLM_API_KEY=%s" % GOOD not in inside or "LUMEN_MUSIC_DIR=/music" not in inside:
    raise SystemExit("container env missing key or mount path")
if "LUMEN_MINIMAX" in inside:
    raise SystemExit("container env kept minimax")
if (os.stat(container_env).st_mode & 0o777) != 0o600:
    raise SystemExit("container env mode is not 0600")

# An old MiniMax .env does not crash. The generic key still counts, and the key is not shown.
open(env_file, "w", encoding="utf-8").write(
    "LLM_API_KEY=%s\nLLM_BASE_URL=%s\nLLM_MODEL=MiniMax-M3.1-Flash\nLUMEN_LLM=minimax\nLUMEN_MINIMAX_KEY=%s\n"
    % (GOOD, base, BAD)
)
os.chmod(env_file, 0o600)
code, out = run([], [("Using the saved API setup", None)])
if code != 0:
    raise SystemExit("old minimax exit %s\n%s" % (code, redact(out)))
if NOTICE.encode() not in out:
    raise SystemExit("old minimax did not explain itself\n" + redact(out))
assert_hidden(out, GOOD, BAD)

# MiniMax leftovers with no generic key are not a saved setup. The line
# matches --config, which shows AI off.
open(env_file, "w", encoding="utf-8").write(
    "LUMEN_LLM=minimax\nLUMEN_MINIMAX_KEY=%s\n" % BAD
)
os.chmod(env_file, 0o600)
code, out = run([], [("AI features are off", None)])
if code != 0:
    raise SystemExit("minimax-only exit %s\n%s" % (code, redact(out)))
if b"Using the saved API setup" in out:
    raise SystemExit("minimax-only claimed a saved setup\n" + redact(out))
if NOTICE.encode() not in out:
    raise SystemExit("minimax-only notice missing\n" + redact(out))
assert_hidden(out, BAD)
shown_off = subprocess.run(
    [play, "--config"], cwd=root, env=base_env(), capture_output=True, text=True,
)
if shown_off.returncode != 0 or "AI: off" not in shown_off.stdout:
    raise SystemExit("minimax-only config\n" + shown_off.stdout + shown_off.stderr)
if BAD in shown_off.stdout or BAD in shown_off.stderr:
    raise SystemExit("minimax-only config printed the key")

# Default .env path is ignored too. Skip into it, then status stays clean.
os.remove(env_file)
default_cfg = os.path.join(cfg_dir, "default.toml")
env = base_env()
env.pop("LUMEN_ENV_FILE", None)
env["LUMEN_CONFIG"] = default_cfg
master, slave = pty.openpty()
proc = subprocess.Popen([play], stdin=slave, stdout=slave, stderr=slave, env=env, cwd=root)
os.close(slave)
out = b""
replies = [b"\n", b"\n"]
needles = [b"Press Enter to play with AI features off:", b"Music folder:", b"AI features are off"]
step = 0
deadline = time.time() + 12
while time.time() < deadline and step < len(needles):
    if needles[step] in out:
        if step < len(replies):
            time.sleep(0.05)
            os.write(master, replies[step])
        step += 1
        continue
    ready, _, _ = select.select([master], [], [], 0.1)
    if ready:
        try:
            out += os.read(master, 8192)
        except OSError:
            break
    elif proc.poll() is not None:
        break
proc.wait(timeout=5)
os.close(master)
if step != len(needles) or proc.returncode != 0:
    raise SystemExit("default .env skip failed\n" + redact(out))
default = os.path.join(root, ".env")
assert_mode(default)
assert_ignored(default)
if value(default, "LUMEN_LLM_OFF") != "1":
    raise SystemExit("default skip marker missing")
os.remove(default)
if os.path.exists(os.path.join(root, "lumen.toml")):
    raise SystemExit("default skip wrote lumen.toml into the repo")

shutil.rmtree(cfg_dir, ignore_errors=True)
server.shutdown()
print("play check ok")
PY

git check-ignore -q -- .env
status="$(git status --porcelain)"
if printf '%s\n' "$status" | grep -E '(^|[ ])\.env($|[. ])' >/dev/null; then
  echo "env file is visible to git:" >&2
  printf '%s\n' "$status" >&2
  exit 1
fi
if printf '%s\n' "$status" | grep -E '(^|[ /])lumen\.toml$' >/dev/null; then
  echo "lumen.toml is visible to git:" >&2
  printf '%s\n' "$status" >&2
  exit 1
fi
echo "play.sh check ok"
