#!/usr/bin/env bash
# One command from a fresh Mac to a browser tab.
# Asks for an API key the first time, saves it in .env (mode 0600), and
# starts the Lumen Run image. Press Enter to play with AI features off.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

ENV_FILE="${LUMEN_ENV_FILE:-$ROOT/.env}"
IMAGE="${LUMEN_IMAGE:-ghcr.io/cybrid-systems/aura-runner:latest}"
LOCAL_IMAGE="${LUMEN_LOCAL_IMAGE:-lumen-run:local}"
MINIMAX_URL="https://api.minimaxi.com/v1"
MINIMAX_MODEL="MiniMax-M3.1-Flash"
DEEPSEEK_URL="https://api.deepseek.com/v1"
DEEPSEEK_MODEL="deepseek-flash"
OTHER_URL="https://api.openai.com/v1"
OTHER_MODEL="gpt-4o-mini"

tmp_env=""
container_name=""

say() { printf '%s\n' "$*" >&2; }

cleanup() {
  if [[ -n "${tmp_env}" && -f "${tmp_env}" ]]; then
    rm -f "${tmp_env}"
  fi
  if [[ -n "${container_name}" ]]; then
    docker rm -f "${container_name}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

usage() {
  cat >&2 << 'EOF'
Usage: ./play.sh [--setup]

Starts Lumen Run in Docker and opens it in your browser.
The first time, it asks which AI service to use. Press Enter to skip.
--setup asks again and replaces the saved answers.
EOF
}

setup=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --setup) setup=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      say "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

no_run=0
if [[ "${LUMEN_PLAY_NO_RUN:-}" == 1 ]]; then
  no_run=1
fi

docker_state() {
  if ! command -v docker >/dev/null 2>&1; then
    printf 'missing\n'
    return
  fi
  local err
  err="$(docker info 2>&1 >/dev/null || true)"
  if docker info >/dev/null 2>&1; then
    printf 'ok\n'
    return
  fi
  if printf '%s\n' "$err" | grep -qi 'permission denied'; then
    printf 'denied\n'
    return
  fi
  printf 'stopped\n'
}

explain_docker() {
  local state="$1"
  case "$state" in
    missing)
      say "Docker is not installed, so the game cannot start."
      say ""
      say "Install one of these, open it, then run ./play.sh again:"
      ;;
    stopped)
      say "Docker is installed, but it is not running."
      say ""
      say "Open Docker Desktop or OrbStack, wait until it is ready, then run ./play.sh again:"
      ;;
    denied)
      say "Docker is installed, but this account cannot use it."
      say ""
      say "Open Docker Desktop or OrbStack and finish its first-run questions, then run ./play.sh again:"
      ;;
  esac
  say "  Docker Desktop   https://www.docker.com/products/docker-desktop/"
  say "  OrbStack         https://orbstack.dev"
}

if [[ "$no_run" -eq 0 ]]; then
  state="$(docker_state)"
  if [[ "$state" != ok ]]; then
    explain_docker "$state"
    exit 1
  fi
fi

trim() {
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

read_line() {
  REPLY=""
  IFS= read -r REPLY || true
  REPLY="$(trim "$REPLY")"
}

# Echo goes off before the prompt, so a key typed after the prompt is
# never shown. On a pipe there is no terminal echo to turn off.
read_secret() {
  local prompt="$1" saved=""
  REPLY=""
  if [[ -t 0 ]]; then
    saved="$(stty -g 2>/dev/null || true)"
    stty -echo 2>/dev/null || true
  fi
  printf '%s' "$prompt" >&2
  IFS= read -r REPLY || true
  if [[ -n "$saved" ]]; then
    stty "$saved" 2>/dev/null || true
  fi
  printf '\n' >&2
  REPLY="$(trim "$REPLY")"
}

has_saved() {
  [[ -s "$ENV_FILE" ]]
}

llm_off_saved() {
  [[ -f "$ENV_FILE" ]] && grep -q '^LUMEN_LLM_OFF=1$' "$ENV_FILE" && ! grep -q '^LLM_API_KEY=.' "$ENV_FILE"
}

write_file() {
  local body="$1"
  local dir
  dir="$(dirname "$ENV_FILE")"
  mkdir -p "$dir"
  if [[ "$dir" != "$ROOT" && "$dir" != "." ]]; then
    chmod 700 "$dir" || true
  fi
  local old_mask
  old_mask="$(umask)"
  umask 077
  tmp_env="$(mktemp "${ENV_FILE}.XXXXXX")"
  chmod 600 "$tmp_env"
  printf '%s\n' "$body" > "$tmp_env"
  chmod 600 "$tmp_env"
  mv -f "$tmp_env" "$ENV_FILE"
  tmp_env=""
  chmod 600 "$ENV_FILE"
  umask "$old_mask"
}

save_skip() {
  write_file "$(printf '%s\n' \
    '# Lumen Run. AI features are off.' \
    '# Run ./play.sh --setup to add a key.' \
    'LUMEN_LLM_OFF=1')"
}

save_key() {
  local provider="$1" key="$2" url="$3" model="$4"
  local lines
  lines="$(printf '%s\n' \
    '# Lumen Run API setup. Git ignores this file. Do not share it.' \
    "LLM_API_KEY=${key}" \
    "LLM_BASE_URL=${url}" \
    "LLM_MODEL=${model}")"
  case "$provider" in
    minimax)
      lines="$(printf '%s\n' "$lines" \
        'LUMEN_LLM=minimax' \
        "LUMEN_MINIMAX_KEY=${key}" \
        "LUMEN_MINIMAX_URL=${url}" \
        "LUMEN_MINIMAX_MODEL=${model}")"
      ;;
    deepseek)
      lines="$(printf '%s\n' "$lines" \
        'LUMEN_LLM=deepseek' \
        "LUMEN_DEEPSEEK_KEY=${key}" \
        "LUMEN_DEEPSEEK_URL=${url}" \
        "LUMEN_DEEPSEEK_MODEL=${model}")"
      ;;
  esac
  write_file "$lines"
}

probe_key() {
  local url="$1" key="$2" model="$3" status
  status="$(
    LUMEN_PROBE_URL="$url" LUMEN_PROBE_KEY="$key" LUMEN_PROBE_MODEL="$model" \
      python3 "$ROOT/scripts/probe_llm.py" 2>/dev/null || true
  )"
  status="$(printf '%s' "$status" | tr -d '[:space:]')"
  case "$status" in
    ok|auth|unknown) printf '%s\n' "$status" ;;
    *) printf 'unknown\n' ;;
  esac
}

ask_setup() {
  say "Lumen Run can invent new worlds with an AI service. You can skip this and still play."
  say ""
  say "Which service?"
  say "  1) MiniMax"
  say "  2) DeepSeek"
  say "  3) Another OpenAI-compatible service"
  printf 'Press Enter for MiniMax: ' >&2
  read_line 0
  local choice provider url_default model_default
  choice="$(printf '%s' "$REPLY" | tr '[:upper:]' '[:lower:]')"
  case "$choice" in
    ""|1|minimax|mini) provider="minimax"; url_default="$MINIMAX_URL"; model_default="$MINIMAX_MODEL" ;;
    2|deepseek) provider="deepseek"; url_default="$DEEPSEEK_URL"; model_default="$DEEPSEEK_MODEL" ;;
    3|other|openai|custom) provider="other"; url_default="$OTHER_URL"; model_default="$OTHER_MODEL" ;;
    *)
      say "Type 1, 2, or 3, or press Enter for MiniMax."
      exit 1
      ;;
  esac

  say ""
  say "Paste the API key. It stays hidden and is not saved in git."
  read_secret "Press Enter to play with AI features off: "
  local key="$REPLY"
  if [[ -z "$key" ]]; then
    save_skip
    say "AI features are off. The game still runs."
    say "Run ./play.sh --setup later if you get a key."
    return 0
  fi
  if [[ "$key" == *$'\n'* ]]; then
    say "That key has a line break in it. Paste it as one line. Nothing was saved."
    exit 1
  fi

  say ""
  printf 'API address [%s]\n' "$url_default" >&2
  printf 'Press Enter for the one in brackets: ' >&2
  read_line 0
  local url="${REPLY:-$url_default}"
  url="${url%/}"
  case "$url" in
    http://*|https://*) ;;
    *)
      say "The address should start with http:// or https://. Nothing was saved."
      exit 1
      ;;
  esac

  printf 'Model [%s]\n' "$model_default" >&2
  printf 'Press Enter for the one in brackets: ' >&2
  read_line 0
  local model="${REPLY:-$model_default}"
  if [[ -z "$model" ]]; then
    say "The model name was empty. Nothing was saved."
    exit 1
  fi

  say "Checking the key…"
  local status
  status="$(probe_key "$url" "$key" "$model")"
  case "$status" in
    ok)
      save_key "$provider" "$key" "$url" "$model"
      say "Key looks good. Saved on this computer."
      ;;
    auth)
      say "That key was not accepted. Check the key and the address, then run ./play.sh --setup again. Nothing was saved."
      exit 1
      ;;
    *)
      say "Could not reach that service to check the key. Check the address and your network, then run ./play.sh --setup again. Nothing was saved."
      exit 1
      ;;
  esac
}

if [[ "$setup" -eq 1 || ! -s "$ENV_FILE" ]]; then
  ask_setup
else
  if llm_off_saved; then
    say "AI features are off. The game still runs. Run ./play.sh --setup to add a key."
  else
    say "Using the saved API setup. Run ./play.sh --setup to change it."
  fi
fi

if [[ "$no_run" -eq 1 ]]; then
  exit 0
fi

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
  local chosen="${LUMEN_PLAY_PORT:-8080}" explicit=0
  if [[ -n "${LUMEN_PLAY_PORT:-}" ]]; then
    explicit=1
  fi
  if port_free "$chosen"; then
    printf '%s\n' "$chosen"
    return
  fi
  if [[ "$explicit" -eq 1 ]]; then
    say "Port ${chosen} is already in use."
    exit 1
  fi
  local p
  for p in $(seq 8081 8110); do
    if port_free "$p"; then
      say "Port ${chosen} is in use. Using ${p}."
      printf '%s\n' "$p"
      return
    fi
  done
  say "No free port near 8080."
  exit 1
}

build_local() {
  local sha_amd64="" sha_arm64=""
  sha_amd64="$(curl -fsSL --max-time 20 "https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-x86_64.tar.gz.sha256" | awk 'NF { print $1; exit }')" || sha_amd64=""
  sha_arm64="$(curl -fsSL --max-time 20 "https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-arm64.tar.gz.sha256" | awk 'NF { print $1; exit }')" || sha_arm64=""
  docker build --provenance=false \
    --build-arg "AURA_SHA_AMD64=${sha_amd64}" \
    --build-arg "AURA_SHA_ARM64=${sha_arm64}" \
    -t "$LOCAL_IMAGE" \
    "$ROOT"
  IMAGE="$LOCAL_IMAGE"
}

if [[ -z "${LUMEN_IMAGE:-}" ]]; then
  if docker image inspect "$IMAGE" >/dev/null 2>&1; then
    say "Downloading the latest game image…"
    if ! docker pull "$IMAGE"; then
      say "Could not refresh the image. Using the copy already on this computer."
    fi
  else
    say "Downloading the game image…"
    if ! docker pull "$IMAGE"; then
      say "Could not download ${IMAGE}."
      say "Building it on this computer instead. This uses the prebuilt Aura nightly and does not compile Aura."
      build_local
    fi
  fi
elif ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  say "The image ${IMAGE} is not on this computer."
  exit 1
fi

port="$(pick_port)"
url="http://127.0.0.1:${port}"
container_name="lumen-run-${port}-$$"

say "Starting the game…"
docker run -d --rm --name "$container_name" \
  -p "127.0.0.1:${port}:8080" \
  --env-file "$ENV_FILE" \
  "$IMAGE" >/dev/null

deadline=$((SECONDS + 90))
ready=0
while (( SECONDS < deadline )); do
  running="$(docker inspect -f '{{.State.Running}}' "$container_name" 2>/dev/null || echo false)"
  if [[ "$running" != true ]]; then
    say "The game stopped before it was ready."
    docker logs "$container_name" >&2 || true
    exit 1
  fi
  if curl -fsS -o /dev/null --max-time 2 "${url}/" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 0.2
done
if [[ "$ready" -ne 1 ]]; then
  say "The game did not open in time."
  docker logs "$container_name" >&2 || true
  exit 1
fi

if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
  open "$url" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$url" >/dev/null 2>&1 || true &
fi

say ""
say "open ${url}"
say "Tap or space jumps, down slides, left and right change lane."
say "Press Ctrl-C to stop."
say ""
say "Copy this if you want to start it yourself later:"
printf 'docker run --rm -p 127.0.0.1:%s:8080 --env-file %q %q\n' "$port" "$ENV_FILE" "$IMAGE" >&2

code=0
docker wait "$container_name" >/dev/null 2>&1 || code=$?
container_name=""
exit "$code"
