#!/usr/bin/env bash
# ./play.sh questions, a hidden key, and a gitignored env file.
# No Docker daemon is required. LUMEN_PLAY_NO_RUN stops before a container.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

git check-ignore -q -- .env
git check-ignore -q -- .env.playtest

if [[ -e .env || -e .env.playtest ]]; then
  echo "refusing to touch an existing .env or .env.playtest" >&2
  exit 1
fi
cleanup() {
  rm -f "$ROOT/.env" "$ROOT/.env.playtest"
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
if printf '%s\n' "$out" | grep -q "Paste the API key"; then
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
if printf '%s\n' "$out" | grep -q "Paste the API key"; then
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
else
  fail "help"
fi

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
import os, pty, select, subprocess, sys, time, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

root = sys.argv[1]
play = os.path.join(root, "play.sh")
env_file = os.path.join(root, ".env.playtest")
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

def run(args, steps, timeout=12):
    env = os.environ.copy()
    env["LUMEN_PLAY_NO_RUN"] = "1"
    env["LUMEN_ENV_FILE"] = env_file
    env.pop("LLM_API_KEY", None)
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

# Skip path. Enter, then Enter. No key is written.
if os.path.exists(env_file):
    os.remove(env_file)
code, out = run([], [
    ("Which service?", b"\n"),
    ("Press Enter to play with AI features off:", b"\n"),
    ("AI features are off", None),
])
if code != 0:
    raise SystemExit("skip exit %s\n%s" % (code, redact(out)))
if b"API address" in out:
    raise SystemExit("skip asked for an address\n" + redact(out))
assert_mode(env_file)
assert_ignored(env_file)
if value(env_file, "LUMEN_LLM_OFF") != "1":
    raise SystemExit("skip marker missing; names %s" % names(env_file))
if "LLM_API_KEY" in names(env_file):
    raise SystemExit("skip file has a key name")

# A second run reuses the skip and does not ask.
code, out = run([], [("AI features are off", None)])
if code != 0:
    raise SystemExit("reuse exit %s\n%s" % (code, redact(out)))
if b"Which service?" in out:
    raise SystemExit("reuse asked again\n" + redact(out))

# MiniMax key, checked against the mock.
before = server.hits
code, out = run(["--setup"], [
    ("Which service?", b"1\n"),
    ("Press Enter to play with AI features off:", (GOOD + "\n").encode()),
    ("API address", (base + "\n").encode()),
    ("Model [", b"MiniMax-M3.1-Flash\n"),
    ("Key looks good", None),
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
if value(env_file, "LLM_MODEL") != "MiniMax-M3.1-Flash":
    raise SystemExit("model was not stored")
if value(env_file, "LUMEN_LLM") != "minimax":
    raise SystemExit("provider was not stored")
if value(env_file, "LUMEN_MINIMAX_KEY") != GOOD:
    raise SystemExit("LUMEN_MINIMAX_KEY was not stored")
if value(env_file, "LUMEN_MINIMAX_URL") != base:
    raise SystemExit("minimax url was not stored")
if "LUMEN_DEEPSEEK_KEY" in names(env_file):
    raise SystemExit("deepseek key stored for minimax")
saved = open(env_file, encoding="utf-8").read()

# Reuse does not probe again and does not read a new key.
hits = server.hits
code, out = run([], [("Using the saved API setup", None)])
if code != 0 or b"Which service?" in out:
    raise SystemExit("saved reuse failed\n" + redact(out))
if server.hits != hits:
    raise SystemExit("reuse probed again")
if open(env_file, encoding="utf-8").read() != saved:
    raise SystemExit("reuse rewrote the file")

# A rejected key is not saved over the good file, and is not shown.
code, out = run(["--setup"], [
    ("Which service?", b"1\n"),
    ("Press Enter to play with AI features off:", (BAD + "\n").encode()),
    ("API address", (base + "\n").encode()),
    ("Model [", b"MiniMax-M3.1-Flash\n"),
    ("That key was not accepted", None),
])
if code == 0:
    raise SystemExit("auth failure exited 0")
assert_hidden(out, BAD, GOOD)
if open(env_file, encoding="utf-8").read() != saved:
    raise SystemExit("auth failure replaced the saved file")
if BAD in open(env_file, encoding="utf-8").read():
    raise SystemExit("rejected key was written")

# Unreachable address: nothing new is saved.
code, out = run(["--setup"], [
    ("Which service?", b"3\n"),
    ("Press Enter to play with AI features off:", (GOOD + "\n").encode()),
    ("API address", b"http://127.0.0.1:9/v1\n"),
    ("Model [", b"gpt-4o-mini\n"),
    ("Could not reach that service", None),
])
if code == 0:
    raise SystemExit("unknown probe exited 0")
assert_hidden(out, GOOD)
if open(env_file, encoding="utf-8").read() != saved:
    raise SystemExit("unreachable probe replaced the saved file")

# DeepSeek names, then an OpenAI-compatible service with only LLM_*.
code, out = run(["--setup"], [
    ("Which service?", b"2\n"),
    ("Press Enter to play with AI features off:", (GOOD + "\n").encode()),
    ("API address", (base + "\n").encode()),
    ("Model [", b"deepseek-flash\n"),
    ("Key looks good", None),
])
if code != 0:
    raise SystemExit("deepseek exit %s\n%s" % (code, redact(out)))
assert_hidden(out, GOOD)
if value(env_file, "LUMEN_LLM") != "deepseek":
    raise SystemExit("deepseek provider; names %s" % names(env_file))
if value(env_file, "LUMEN_DEEPSEEK_KEY") != GOOD:
    raise SystemExit("deepseek key missing")
if "LUMEN_MINIMAX_KEY" in names(env_file):
    raise SystemExit("minimax key left on a deepseek setup")
assert_mode(env_file)

code, out = run(["--setup"], [
    ("Which service?", b"3\n"),
    ("Press Enter to play with AI features off:", (GOOD + "\n").encode()),
    ("API address", (base + "\n").encode()),
    ("Model [", b"\n"),
    ("Key looks good", None),
])
if code != 0:
    raise SystemExit("other exit %s\n%s" % (code, redact(out)))
assert_hidden(out, GOOD)
if value(env_file, "LLM_MODEL") != "gpt-4o-mini":
    raise SystemExit("other default model; names %s" % names(env_file))
if "LUMEN_LLM" in names(env_file) or "LUMEN_MINIMAX_KEY" in names(env_file):
    raise SystemExit("named provider stored for a generic service: %s" % names(env_file))
assert_mode(env_file)
assert_ignored(env_file)

# A bad menu choice does not write.
before_text = open(env_file, encoding="utf-8").read()
code, out = run(["--setup"], [
    ("Which service?", b"9\n"),
    ("Type 1, 2, or 3", None),
])
if code == 0:
    raise SystemExit("bad choice exited 0")
if open(env_file, encoding="utf-8").read() != before_text:
    raise SystemExit("bad choice rewrote the file")

# Default .env path is ignored too. Skip into it, then status stays clean.
os.remove(env_file)
code, out = run([], [
    ("Which service?", b"\n"),
    ("Press Enter to play with AI features off:", b"\n"),
    ("AI features are off", None),
])
# The case above used LUMEN_ENV_FILE. Check the default path separately.
env = os.environ.copy()
env["LUMEN_PLAY_NO_RUN"] = "1"
env.pop("LUMEN_ENV_FILE", None)
env.pop("LLM_API_KEY", None)
master, slave = pty.openpty()
proc = subprocess.Popen([play], stdin=slave, stdout=slave, stderr=slave, env=env, cwd=root)
os.close(slave)
out = b""
replies = [b"\n", b"\n"]
needles = [b"Which service?", b"Press Enter to play with AI features off:", b"AI features are off"]
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
echo "play.sh check ok"
