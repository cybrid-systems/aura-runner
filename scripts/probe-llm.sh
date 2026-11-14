# Configure LLM_* from key files. Sourced by ./run.sh.
# stdout stays empty. One status line goes to stderr.
# A key is never printed.

_PROBE_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_PROBE_PY="$_PROBE_SH_DIR/probe_llm.py"

# DeepSeek V4.1 Flash is served as deepseek-flash.
# MiniMax in China: api.minimaxi.com. api.minimax.io returns 401 for that key.
DEEPSEEK_URL_DEFAULT="https://api.deepseek.com/v1"
DEEPSEEK_MODEL_DEFAULT="deepseek-flash"
MINIMAX_URL_DEFAULT="https://api.minimaxi.com/v1"
MINIMAX_MODEL_DEFAULT="MiniMax-M3.1-Flash"

configure_llm() {
  if [[ -n "${LLM_API_KEY:-}" ]]; then
    unset LUMEN_DEEPSEEK_KEY LUMEN_MINIMAX_KEY LUMEN_LLM
    echo "llm: using LLM_API_KEY from the environment" >&2
    return 0
  fi

  unset LUMEN_DEEPSEEK_KEY LUMEN_DEEPSEEK_URL LUMEN_DEEPSEEK_MODEL
  unset LUMEN_MINIMAX_KEY LUMEN_MINIMAX_URL LUMEN_MINIMAX_MODEL
  unset LLM_API_KEY LLM_BASE_URL LLM_MODEL

  local prefer="${LUMEN_LLM:-}"
  local dfile="${DEEPSEEK_KEY_FILE:-$HOME/code/keys/deepseek}"
  local mfile="${MINIMAX_KEY_FILE:-$HOME/code/keys/minimax}"
  local dkey="" mkey=""
  if [[ -f "$dfile" ]]; then
    dkey="$(tr -d '[:space:]' < "$dfile")"
  fi
  if [[ -f "$mfile" ]]; then
    mkey="$(tr -d '[:space:]' < "$mfile")"
  fi

  local durl="${DEEPSEEK_BASE_URL:-$DEEPSEEK_URL_DEFAULT}"
  local durl_model="${DEEPSEEK_MODEL:-$DEEPSEEK_MODEL_DEFAULT}"
  local murl="${MINIMAX_BASE_URL:-$MINIMAX_URL_DEFAULT}"
  local murl_model="${MINIMAX_MODEL:-$MINIMAX_MODEL_DEFAULT}"

  local tmp
  tmp="$(mktemp -d)"
  local dstat="missing" mstat="missing"

  probe_to() {
    local url="$1" key="$2" model="$3" out="$4"
    if ! LUMEN_PROBE_URL="$url" LUMEN_PROBE_KEY="$key" LUMEN_PROBE_MODEL="$model" \
        python3 "$_PROBE_PY" >"$out" 2>/dev/null; then
      printf 'unknown\n' >"$out"
    fi
  }

  local djob="" mjob=""
  if [[ -n "$dkey" ]]; then
    probe_to "$durl" "$dkey" "$durl_model" "$tmp/deepseek" &
    djob=$!
  fi
  if [[ -n "$mkey" ]]; then
    probe_to "$murl" "$mkey" "$murl_model" "$tmp/minimax" &
    mjob=$!
  fi
  if [[ -n "$djob" ]]; then wait "$djob" || true; fi
  if [[ -n "$mjob" ]]; then wait "$mjob" || true; fi
  if [[ -f "$tmp/deepseek" ]]; then dstat="$(tr -d '[:space:]' < "$tmp/deepseek")"; fi
  if [[ -f "$tmp/minimax" ]]; then mstat="$(tr -d '[:space:]' < "$tmp/minimax")"; fi
  rm -rf "$tmp"

  usable() { [[ "$1" == "ok" || "$1" == "unknown" ]]; }

  local pick=""
  if [[ "$prefer" == "minimax" ]] && usable "$mstat"; then
    pick="minimax"
  elif usable "$dstat"; then
    pick="deepseek"
  elif usable "$mstat"; then
    pick="minimax"
  fi

  if usable "$dstat"; then
    export LUMEN_DEEPSEEK_KEY="$dkey"
    export LUMEN_DEEPSEEK_URL="$durl"
    export LUMEN_DEEPSEEK_MODEL="$durl_model"
  fi
  if usable "$mstat"; then
    export LUMEN_MINIMAX_KEY="$mkey"
    export LUMEN_MINIMAX_URL="$murl"
    export LUMEN_MINIMAX_MODEL="$murl_model"
  fi

  note_of() {
    case "$1" in
      ok) printf 'probe ok' ;;
      unknown) printf 'probe unconfirmed' ;;
      auth) printf 'auth failed' ;;
      *) printf 'no key' ;;
    esac
  }

  if [[ -z "$pick" ]]; then
    echo "llm: offline (deepseek $(note_of "$dstat"), minimax $(note_of "$mstat"))" >&2
    return 0
  fi

  export LUMEN_LLM="$pick"
  local picked_note
  if [[ "$pick" == "minimax" ]]; then
    export LLM_API_KEY="$mkey"
    export LLM_BASE_URL="$murl"
    export LLM_MODEL="$murl_model"
    picked_note="$(note_of "$mstat")"
  else
    export LLM_API_KEY="$dkey"
    export LLM_BASE_URL="$durl"
    export LLM_MODEL="$durl_model"
    picked_note="$(note_of "$dstat")"
  fi
  echo "llm: $pick $LLM_MODEL ($picked_note); deepseek $(note_of "$dstat"), minimax $(note_of "$mstat")" >&2
}
