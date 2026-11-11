#!/usr/bin/env bash
# One command: Aura v0.2.0 game core + the browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
mkdir -p out .tools

AURA_VERSION="${AURA_VERSION:-0.2.0}"
AURA_SHA="${AURA_SHA:-cf7353373ea276bc03e8364592814382ebd62539}"
WEB_PORT="${AURA_RUNNER_WEB:-8080}"
AURA_PORT="${AURA_RUNNER_PORT:-8765}"

find_aura() {
  if command -v aura >/dev/null 2>&1; then
    local v
    v="$(aura --version 2>/dev/null || true)"
    if [[ "$v" == *"0.2.0"* ]]; then
      command -v aura
      return
    fi
  fi
  if [[ -x "$ROOT/.tools/aura/bin/aura" ]]; then
    echo "$ROOT/.tools/aura/bin/aura"
    return
  fi
  local arch tarball url
  arch="$(uname -m)"
  case "$arch" in
    x86_64) arch="x86_64" ;;
    aarch64|arm64) arch="arm64" ;;
    *) echo "unsupported arch $arch" >&2; exit 1 ;;
  esac
  tarball="aura-${AURA_VERSION}-linux-${arch}.tar.gz"
  url="https://github.com/cybrid-systems/aura/releases/download/v${AURA_VERSION}/${tarball}"
  echo "installing Aura v${AURA_VERSION} (${AURA_SHA}) from the official release" >&2
  curl -fsSL -o "/tmp/${tarball}" "$url"
  curl -fsSL -o "/tmp/${tarball}.sha256" "${url}.sha256"
  (cd /tmp && sha256sum -c "${tarball}.sha256")
  rm -rf "$ROOT/.tools/aura-src"
  mkdir -p "$ROOT/.tools/aura-src"
  tar -xzf "/tmp/${tarball}" -C "$ROOT/.tools/aura-src" --strip-components=1
  ln -sfn "$ROOT/.tools/aura-src" "$ROOT/.tools/aura"
  echo "$ROOT/.tools/aura/bin/aura"
}

AURA_BIN="$(find_aura)"
export AURA_EVO_LOG="$ROOT/out/evo.jsonl"
export AURA_RUNNER_PORT="$AURA_PORT"
export AURA_RUNNER_WEB="$WEB_PORT"
: > "$AURA_EVO_LOG" || true
rm -f out/aura.port

"$AURA_BIN" --quiet --preset dev --grant network core/main.aura > out/aura.log 2>&1 &
AURA_PID=$!
WEB_PID=""

cleanup() {
  if [[ -n "${AURA_PID:-}" ]]; then kill "$AURA_PID" 2>/dev/null || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then kill "$WEB_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 80); do
  if grep -q "PORT " out/aura.log 2>/dev/null; then
    break
  fi
  if ! kill -0 "$AURA_PID" 2>/dev/null; then
    echo "Aura core exited" >&2
    cat out/aura.log >&2
    exit 1
  fi
  sleep 0.1
done
if ! grep -q "PORT " out/aura.log; then
  echo "Aura core did not listen" >&2
  cat out/aura.log >&2
  exit 1
fi

node bridge/server.mjs &
WEB_PID=$!
sleep 0.2
echo "open http://127.0.0.1:${WEB_PORT}"
echo "tap or space jumps, swipe or arrow down slides, sideways changes lane"
wait "$WEB_PID"
