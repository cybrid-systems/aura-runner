#!/bin/sh
# Start the Aura core and the page. Both listen on 0.0.0.0 so Docker's
# published port can reach them. The game files are the image contents.
set -eu
cd /opt/lumen-run
export AURA_WORK=/opt/lumen-run
# Play leaves the sandbox on. Preset dev grants mutate, read, and write.
# AURA_SANDBOX=off is a debug escape, not normal play. This nightly does
# not path-scope write:out/; the game only writes under out/.
if [ -n "${AURA_SANDBOX+x}" ]; then
  export AURA_SANDBOX
else
  unset AURA_SANDBOX || true
fi
export AURA_RUNNER_BIND="${AURA_RUNNER_BIND:-0.0.0.0}"
export AURA_RUNNER_WEB="${AURA_RUNNER_WEB:-8080}"
export AURA_RUNNER_PORT="${AURA_RUNNER_PORT:-8765}"
export AURA_EVO_LOG="${AURA_EVO_LOG:-/opt/lumen-run/out/evo.jsonl}"
mkdir -p /opt/lumen-run/out
: > "$AURA_EVO_LOG" || true

if [ -n "${LUMEN_MINIMAX_KEY:-}${LUMEN_MINIMAX_URL:-}${LUMEN_MINIMAX_MODEL:-}" ] || [ "${LUMEN_LLM:-}" = "minimax" ]; then
  echo "MiniMax is no longer a preset. Using saved API settings if present, otherwise playing offline."
fi
if [ -n "${LLM_API_KEY:-}${LUMEN_DEEPSEEK_KEY:-}" ]; then
  echo "llm: on"
else
  echo "llm: off (the game runs without an API key)"
fi

aura_pid=""
web_pid=""
on_signal() {
  if [ -n "$web_pid" ]; then kill "$web_pid" 2>/dev/null || true; fi
  if [ -n "$aura_pid" ]; then kill "$aura_pid" 2>/dev/null || true; fi
  exit 0
}

/opt/aura/bin/aura --quiet --preset dev --grant network core/main.aura \
  > /opt/lumen-run/out/aura.log 2>&1 &
aura_pid=$!
node bridge/server.mjs &
web_pid=$!
trap on_signal TERM INT

while kill -0 "$aura_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 1
done
echo "Lumen Run stopped." >&2
on_signal() { :; }
kill "$web_pid" "$aura_pid" 2>/dev/null || true
exit 1
