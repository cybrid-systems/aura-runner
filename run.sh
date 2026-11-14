#!/usr/bin/env bash
# One command: pinned Aura game core + the browser.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
mkdir -p out .tools

# shellcheck source=scripts/aura-path.sh
source "$ROOT/scripts/aura-path.sh"

WEB_PORT="${AURA_RUNNER_WEB:-8080}"
AURA_PORT="${AURA_RUNNER_PORT:-8765}"

if [[ "${1:-}" == "deepseek" || "${1:-}" == "minimax" ]]; then
  export LUMEN_LLM="$1"
elif [[ -n "${1:-}" ]]; then
  echo "usage: ./run.sh [deepseek|minimax]" >&2
  exit 1
fi

AURA_BIN="$(install_aura "$ROOT")"
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
