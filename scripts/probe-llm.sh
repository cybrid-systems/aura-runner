# Configure LLM_* from a DeepSeek key file. Sourced by ./run.sh.
# stdout stays empty. One status line goes to stderr.
# A key is never printed.
#
# DeepSeek V4.1 Flash is served as deepseek-flash.
# An old MiniMax preset is ignored. Saved LLM_* values still work.

_PROBE_SH_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_PROBE_PY="$_PROBE_SH_DIR/probe_llm.py"

DEEPSEEK_URL_DEFAULT="https://api.deepseek.com/v1"
DEEPSEEK_MODEL_DEFAULT="deepseek-flash"
MINIMAX_NOTICE="MiniMax is no longer a preset. Using saved API settings if present, otherwise playing offline."

note_minimax() {
  if [[ -n "${LUMEN_MINIMAX_KEY:-}${LUMEN_MINIMAX_URL:-}${LUMEN_MINIMAX_MODEL:-}" || "${LUMEN_LLM:-}" == "minimax" ]]; then
    echo "$MINIMAX_NOTICE" >&2
  fi
  unset LUMEN_MINIMAX_KEY LUMEN_MINIMAX_URL LUMEN_MINIMAX_MODEL
  if [[ "${LUMEN_LLM:-}" == "minimax" ]]; then
    unset LUMEN_LLM
  fi
}

configure_llm() {
  note_minimax
  if [[ -n "${LLM_API_KEY:-}" ]]; then
    echo "llm: using LLM_API_KEY from the environment" >&2
    return 0
  fi
  # ./play.sh writes LUMEN_LLM_OFF=1 when the key prompt is skipped.
  # That choice beats ~/code/keys/deepseek and DEEPSEEK_KEY_FILE.
  if [[ "${LUMEN_LLM_OFF:-}" == "1" ]]; then
    unset LUMEN_DEEPSEEK_KEY LUMEN_DEEPSEEK_URL LUMEN_DEEPSEEK_MODEL LUMEN_LLM
    echo "llm: offline (AI features are off)" >&2
    return 0
  fi

  unset LUMEN_DEEPSEEK_KEY LUMEN_DEEPSEEK_URL LUMEN_DEEPSEEK_MODEL
  unset LLM_API_KEY LLM_BASE_URL LLM_MODEL

  local dfile="${DEEPSEEK_KEY_FILE:-$HOME/code/keys/deepseek}"
  local dkey=""
  if [[ -f "$dfile" ]]; then
    dkey="$(tr -d '[:space:]' < "$dfile")"
  fi

  local durl="${DEEPSEEK_BASE_URL:-$DEEPSEEK_URL_DEFAULT}"
  local durl_model="${DEEPSEEK_MODEL:-$DEEPSEEK_MODEL_DEFAULT}"

  local tmp
  tmp="$(mktemp -d)"
  local dstat="missing"

  probe_to() {
    local url="$1" key="$2" model="$3" out="$4"
    if ! LUMEN_PROBE_URL="$url" LUMEN_PROBE_KEY="$key" LUMEN_PROBE_MODEL="$model" \
        python3 "$_PROBE_PY" >"$out" 2>/dev/null; then
      printf 'unknown\n' >"$out"
    fi
  }

  local djob=""
  if [[ -n "$dkey" ]]; then
    probe_to "$durl" "$dkey" "$durl_model" "$tmp/deepseek" &
    djob=$!
  fi
  if [[ -n "$djob" ]]; then wait "$djob" || true; fi
  if [[ -f "$tmp/deepseek" ]]; then dstat="$(tr -d '[:space:]' < "$tmp/deepseek")"; fi
  rm -rf "$tmp"

  usable() { [[ "$1" == "ok" || "$1" == "unknown" ]]; }

  note_of() {
    case "$1" in
      ok) printf 'probe ok' ;;
      unknown) printf 'probe unconfirmed' ;;
      auth) printf 'auth failed' ;;
      *) printf 'no key' ;;
    esac
  }

  if ! usable "$dstat"; then
    echo "llm: offline (deepseek $(note_of "$dstat"))" >&2
    return 0
  fi

  export LUMEN_DEEPSEEK_KEY="$dkey"
  export LUMEN_DEEPSEEK_URL="$durl"
  export LUMEN_DEEPSEEK_MODEL="$durl_model"
  export LUMEN_LLM="deepseek"
  export LLM_API_KEY="$dkey"
  export LLM_BASE_URL="$durl"
  export LLM_MODEL="$durl_model"
  echo "llm: deepseek $LLM_MODEL ($(note_of "$dstat"))" >&2
}
