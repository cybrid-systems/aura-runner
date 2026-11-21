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

if [[ "${1:-}" == "minimax" ]]; then
  # The loader prints one line and continues with DeepSeek or offline.
  export LUMEN_LLM="minimax"
elif [[ "${1:-}" == "deepseek" ]]; then
  export LUMEN_LLM="deepseek"
elif [[ -n "${1:-}" ]]; then
  echo "usage: ./run.sh [deepseek]" >&2
  exit 1
fi

_lumen_export="$(mktemp)"
chmod 600 "$_lumen_export"
if ! python3 "$ROOT/scripts/lumen_config.py" --export-file "$_lumen_export"; then
  rm -f "$_lumen_export"
  echo "Could not read settings (lumen.toml or .env)." >&2
  exit 1
fi
# shellcheck disable=SC1090
source "$_lumen_export" || { rm -f "$_lumen_export"; exit 1; }
rm -f "$_lumen_export"
unset _lumen_export

aura_from=""
aura_ver=""
if [[ -z "${AURA_BIN:-}" ]]; then
  _bin_out="$(mktemp)"
  if ! install_aura "$ROOT" >"$_bin_out"; then
    rm -f "$_bin_out"
    exit 1
  fi
  AURA_BIN="$(tr -d '\r' < "$_bin_out")"
  rm -f "$_bin_out"
  aura_from="${AURA_READY_FROM:-download}"
  aura_ver="${AURA_READY_VERSION:-}"
else
  aura_from="AURA_BIN"
fi
if [[ "$(printf '%s\n' "$AURA_BIN" | wc -l)" -ne 1 || ! -x "$AURA_BIN" ]]; then
  echo "Aura binary path is not a single executable: [$AURA_BIN]" >&2
  echo "Set AURA_BIN to a prebuilt Aura, or unset it to download the nightly." >&2
  exit 1
fi
if [[ -z "$aura_ver" ]]; then
  _ver_err="$(mktemp)"
  aura_ver="$("$AURA_BIN" --version 2>"$_ver_err" || true)"
  if [[ -z "$aura_ver" ]]; then
    echo "Could not run ${AURA_BIN} --version." >&2
    cat "$_ver_err" >&2 || true
    rm -f "$_ver_err"
    echo "Set AURA_BIN to a prebuilt Aura for this machine, or unset it to download the nightly." >&2
    exit 1
  fi
  rm -f "$_ver_err"
fi

# A trial leaves the parent read-only unless the sandbox is off, and a
# kept phrase has to rebind.
export AURA_WORK="$ROOT"
export AURA_SANDBOX="${AURA_SANDBOX:-off}"
export AURA_EVO_LOG="$ROOT/out/evo.jsonl"
export AURA_RUNNER_PORT="$AURA_PORT"
export AURA_RUNNER_WEB="$WEB_PORT"

# shellcheck source=scripts/probe-llm.sh
source "$ROOT/scripts/probe-llm.sh"
configure_llm
: > "$AURA_EVO_LOG" || true
rm -f out/aura.port

# The prebuilt binary loads the game in-process. That needs no compiler.
# The page is served as soon as it binds; it retries until the core listens.
# AURA_CORE_WAIT is how long that load may take before this script gives up.
core_wait="${AURA_CORE_WAIT:-60}"
if ! [[ "$core_wait" =~ ^[1-9][0-9]*$ ]]; then
  echo "AURA_CORE_WAIT must be a positive number of seconds" >&2
  exit 1
fi

"$AURA_BIN" --quiet --preset dev --grant network core/main.aura > out/aura.log 2>&1 &
AURA_PID=$!
node bridge/server.mjs > out/web.log 2>&1 &
WEB_PID=$!

cleanup() {
  if [[ -n "${AURA_PID:-}" ]]; then kill "$AURA_PID" 2>/dev/null || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then kill "$WEB_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

web_deadline=$((SECONDS + 10))
while port_free "$WEB_PORT"; do
  if (( SECONDS >= web_deadline )) || ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo "page server did not listen on ${WEB_PORT}" >&2
    tail -n 40 out/web.log >&2 || true
    exit 1
  fi
  sleep 0.05
done

if [[ -n "$aura_ver" ]]; then
  echo "${aura_ver}  ${aura_from}" >&2
else
  echo "Aura  ${aura_from}" >&2
fi
echo "open http://127.0.0.1:${WEB_PORT}" >&2
echo "tap or space jumps, down slides, left and right change lane" >&2

core_deadline=$((SECONDS + core_wait))
core_ready=0
while kill -0 "$WEB_PID" 2>/dev/null; do
  if [[ "$core_ready" -eq 0 ]]; then
    if grep -q "PORT " out/aura.log 2>/dev/null; then
      core_ready=1
    elif ! kill -0 "$AURA_PID" 2>/dev/null; then
      echo "Aura core exited before it was listening" >&2
      tail -n 40 out/aura.log >&2 || true
      exit 1
    elif (( SECONDS >= core_deadline )); then
      echo "Aura core did not listen within ${core_wait}s" >&2
      echo "The log is out/aura.log. ./run.sh is using the prebuilt Aura binary." >&2
      tail -n 40 out/aura.log >&2 || true
      exit 1
    fi
  fi
  sleep 0.2
done
