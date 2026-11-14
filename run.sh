#!/usr/bin/env bash
# One command: Aura nightly plus the browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
mkdir -p out .tools

# shellcheck source=scripts/aura-path.sh
source "$ROOT/scripts/aura-path.sh"

# A chosen port stays put. The defaults slide forward when something else
# already has them, which is common on a shared machine.
port_free() {
  python3 - "$1" << 'PY'
import socket, sys
s = socket.socket()
try:
    s.bind(("127.0.0.1", int(sys.argv[1])))
except OSError:
    sys.exit(1)
finally:
    s.close()
PY
}

pick_port() {
  local name="$1" chosen="$2" explicit="$3" start="$4"
  if port_free "$chosen"; then
    echo "$chosen"
    return
  fi
  if [[ "$explicit" == 1 ]]; then
    echo "${name} port ${chosen} is already in use" >&2
    exit 1
  fi
  local p
  for p in $(seq "$start" $((start + 30))); do
    if port_free "$p"; then
      echo "${name} port ${chosen} is in use; using ${p}" >&2
      echo "$p"
      return
    fi
  done
  echo "no free ${name} port near ${chosen}" >&2
  exit 1
}

if [[ -n "${AURA_RUNNER_WEB:-}" ]]; then
  WEB_PORT="$(pick_port web "$AURA_RUNNER_WEB" 1 8080)"
else
  WEB_PORT="$(pick_port web 8080 0 8081)"
fi
if [[ -n "${AURA_RUNNER_PORT:-}" ]]; then
  AURA_PORT="$(pick_port aura "$AURA_RUNNER_PORT" 1 8765)"
else
  AURA_PORT="$(pick_port aura 8765 0 8766)"
fi

if [[ "${1:-}" == "deepseek" || "${1:-}" == "minimax" ]]; then
  export LUMEN_LLM="$1"
elif [[ -n "${1:-}" ]]; then
  echo "usage: ./run.sh [deepseek|minimax]" >&2
  exit 1
fi

if [[ -z "${AURA_BIN:-}" ]]; then
  AURA_BIN="$(install_aura "$ROOT")"
fi
if [[ "$(printf '%s\n' "$AURA_BIN" | wc -l)" -ne 1 || ! -x "$AURA_BIN" ]]; then
  echo "Aura binary path is not a single executable: [$AURA_BIN]" >&2
  exit 1
fi

export AURA_EVO_LOG="$ROOT/out/evo.jsonl"
export AURA_RUNNER_PORT="$AURA_PORT"
export AURA_RUNNER_WEB="$WEB_PORT"

# shellcheck source=scripts/probe-llm.sh
source "$ROOT/scripts/probe-llm.sh"
configure_llm
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
echo "open http://127.0.0.1:${WEB_PORT}" >&2
echo "tap or space jumps, down slides, left and right change lane" >&2
wait "$WEB_PID"
