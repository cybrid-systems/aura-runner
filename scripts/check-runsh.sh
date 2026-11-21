#!/usr/bin/env bash
# Clean-cache ./run.sh: download the prebuilt nightly, serve the page,
# and do not invoke a C compiler, CMake, or Docker.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cache="$(mktemp -d)"
fake="$(mktemp -d)"
invocations="$(mktemp)"
pid=""
cleanup() {
  if [[ -n "${pid}" ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  rm -rf "$cache" "$fake"
  rm -f "$invocations"
}
trap cleanup EXIT

for c in gcc g++ cc c++ clang clang++ cmake ninja docker make; do
  cat > "$fake/$c" << EOF
#!/bin/sh
echo "invoked $c \$*" >> "$invocations"
exit 127
EOF
  chmod +x "$fake/$c"
done

export PATH="$fake:$PATH"
export AURA_CACHE_DIR="$cache"
export AURA_RUNNER_WEB="${AURA_RUNNER_WEB:-18092}"
export AURA_RUNNER_PORT="${AURA_RUNNER_PORT:-18792}"
export DEEPSEEK_KEY_FILE=/tmp/no-deepseek-key
export LUMEN_ENV_FILE=/tmp/no-lumen-env
export LUMEN_CONFIG=/tmp/no-lumen-toml
unset MINIMAX_KEY_FILE || true
unset AURA_BIN AURA_OFFLINE AURA_FORCE_TOOLS AURA_VERSION AURA_DOWNLOAD_BASE

mkdir -p out
rm -f out/aura.log out/web.log out/aura.port

wait_url() {
  local errfile="$1" limit="$2"
  local deadline=$((SECONDS + limit))
  while (( SECONDS < deadline )); do
    if grep -q "open http" "$errfile" 2>/dev/null; then
      return 0
    fi
    if [[ -n "${pid}" ]] && ! kill -0 "$pid" 2>/dev/null; then
      return 1
    fi
    sleep 0.05
  done
  return 1
}

echo "clean ./run.sh" >&2
start=$(date +%s.%N)
./run.sh > /tmp/lumen-runsh.out 2> /tmp/lumen-runsh.err &
pid=$!
if ! wait_url /tmp/lumen-runsh.err 180; then
  echo "run.sh did not print a URL" >&2
  cat /tmp/lumen-runsh.err >&2 || true
  exit 1
fi
url_at=$(date +%s.%N)
python3 -c "print('to_url', round(float('$url_at') - float('$start'), 3))" >&2
if grep -qi "compil" /tmp/lumen-runsh.err /tmp/lumen-runsh.out; then
  echo "output mentioned a compile:" >&2
  cat /tmp/lumen-runsh.err >&2
  exit 1
fi
if ! grep -q "  download" /tmp/lumen-runsh.err; then
  echo "a clean cache should report download:" >&2
  cat /tmp/lumen-runsh.err >&2
  exit 1
fi
if [[ -s "$invocations" ]]; then
  echo "a build tool was invoked:" >&2
  cat "$invocations" >&2
  exit 1
fi
url="$(grep -o 'http://127.0.0.1:[0-9][0-9]*' /tmp/lumen-runsh.err | head -n 1)"
code="$(curl -fsS -o /tmp/lumen-page.html -w '%{http_code}' "$url")"
if [[ "$code" != "200" ]] || ! grep -q "Lumen Run" /tmp/lumen-page.html; then
  echo "page did not load from $url (HTTP $code)" >&2
  exit 1
fi
core_deadline=$((SECONDS + 60))
while (( SECONDS < core_deadline )); do
  if grep -q "PORT " out/aura.log 2>/dev/null; then
    break
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "run.sh exited before the core listened" >&2
    cat /tmp/lumen-runsh.err >&2 || true
    tail -n 40 out/aura.log >&2 || true
    exit 1
  fi
  sleep 0.1
done
if ! grep -q "PORT " out/aura.log 2>/dev/null; then
  echo "core did not listen" >&2
  tail -n 40 out/aura.log >&2 || true
  exit 1
fi
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
pid=""

echo "offline ./run.sh uses the cache" >&2
start=$(date +%s.%N)
AURA_OFFLINE=1 ./run.sh > /tmp/lumen-runsh2.out 2> /tmp/lumen-runsh2.err &
pid=$!
if ! wait_url /tmp/lumen-runsh2.err 30; then
  echo "offline run.sh did not print a URL" >&2
  cat /tmp/lumen-runsh2.err >&2 || true
  exit 1
fi
end=$(date +%s.%N)
python3 -c "print('offline_to_url', round(float('$end') - float('$start'), 3))" >&2
if ! grep -q "  offline" /tmp/lumen-runsh2.err; then
  echo "offline run should name the cache:" >&2
  cat /tmp/lumen-runsh2.err >&2
  exit 1
fi
if grep -qi "compil" /tmp/lumen-runsh2.err /tmp/lumen-runsh2.out; then
  echo "offline output mentioned a compile" >&2
  exit 1
fi
if [[ -s "$invocations" ]]; then
  echo "a build tool was invoked on the offline run:" >&2
  cat "$invocations" >&2
  exit 1
fi
kill "$pid" 2>/dev/null || true
wait "$pid" 2>/dev/null || true
pid=""
echo "run.sh check ok"
