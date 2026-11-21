#!/usr/bin/env bash
# One command from a fresh Mac to a browser tab.
# Asks for a DeepSeek key the first time, saves it in .env (mode 0600),
# and can remember a folder of your own songs in lumen.toml.
# Press Enter on the key to play with AI features off.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

ENV_FILE="${LUMEN_ENV_FILE:-$ROOT/.env}"
CONFIG_FILE="${LUMEN_CONFIG:-$ROOT/lumen.toml}"
export LUMEN_ENV_FILE="$ENV_FILE"
export LUMEN_CONFIG="$CONFIG_FILE"
export LUMEN_ROOT="$ROOT"
IMAGE="${LUMEN_IMAGE:-ghcr.io/cybrid-systems/aura-runner:latest}"
LOCAL_IMAGE="${LUMEN_LOCAL_IMAGE:-lumen-run:local}"
DEEPSEEK_URL="https://api.deepseek.com/v1"
DEEPSEEK_MODEL="deepseek-flash"

tmp_env=""
run_env=""
container_name=""
run_pid=""
stopping=0

say() { printf '%s\n' "$*" >&2; }

stop_game() {
  if [[ "$stopping" -eq 1 ]]; then
    return 0
  fi
  stopping=1
  if [[ -n "${run_pid}" ]]; then
    kill "$run_pid" 2>/dev/null || true
  fi
  if [[ -n "${container_name}" ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
    container_name=""
  fi
  if [[ -n "${tmp_env}" && -f "${tmp_env}" ]]; then
    rm -f "$tmp_env"
    tmp_env=""
  fi
  if [[ -n "${run_env}" && -f "${run_env}" ]]; then
    rm -f "$run_env"
    run_env=""
  fi
}
# HUP covers closing the terminal. SIGKILL cannot be caught; the next
# start removes a leftover lumen-run-* container.
trap stop_game EXIT
trap 'stop_game; exit 129' HUP
trap 'stop_game; exit 130' INT
trap 'stop_game; exit 143' TERM

usage() {
  cat >&2 << 'EOF'
Usage: ./play.sh [--setup] [--config]

Starts Lumen Run in Docker and opens it in your browser.
The first time, it asks for a DeepSeek API key and, if you want, a music folder.
Press Enter on the key to play with AI features off.
--setup asks again and replaces the saved answers.
--config prints the current settings. The API key is shown only as a length.
EOF
}

setup=0
show_config=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --setup) setup=1 ;;
    --config) show_config=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      say "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

if [[ "$setup" -eq 1 && "$show_config" -eq 1 ]]; then
  say "Use either --setup or --config."
  usage
  exit 1
fi

if [[ "$show_config" -eq 1 ]]; then
  exec python3 "$ROOT/scripts/lumen_config.py" --show
fi

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
  local key="$1" url="$2" model="$3"
  write_file "$(printf '%s\n' \
    '# Lumen Run API setup. Git ignores this file. Do not share it.' \
    "LLM_API_KEY=${key}" \
    "LLM_BASE_URL=${url}" \
    "LLM_MODEL=${model}" \
    'LUMEN_LLM=deepseek' \
    "LUMEN_DEEPSEEK_KEY=${key}" \
    "LUMEN_DEEPSEEK_URL=${url}" \
    "LUMEN_DEEPSEEK_MODEL=${model}")"
}

config_py() {
  python3 "$ROOT/scripts/lumen_config.py" "$@"
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

finish_without_key() {
  save_skip
  say "AI features are off. The game still runs."
  say "Run ./play.sh --setup later if you get a key."
}

ask_music() {
  say ""
  say "Optional: a folder of your own songs (mp3, ogg, wav, m4a, or flac)."
  say "They loop in the game. Leave this blank to keep the synthesized music."
  printf 'Music folder: ' >&2
  read_line 0
  local folder="$REPLY"
  if [[ -z "$folder" ]]; then
    config_py --write-music ""
    return 0
  fi
  local music_msg music_rc
  music_rc=0
  music_msg="$(config_py --check-music "$folder")" || music_rc=$?
  if [[ "$music_rc" -ne 0 ]]; then
    say "$music_msg"
    say "That folder was not saved."
    return 0
  fi
  config_py --write-music "$folder"
  say "$music_msg"
}

ask_setup() {
  config_py --notice
  say "Lumen Run can invent new worlds with DeepSeek. You can skip this and still play."
  say ""
  say "Paste a DeepSeek API key. It stays hidden and is not saved in git."
  read_secret "Press Enter to play with AI features off: "
  local key="$REPLY"
  local url="$DEEPSEEK_URL"
  local model="$DEEPSEEK_MODEL"
  if [[ -n "${LUMEN_PLAY_PROBE_URL:-}" ]]; then
    url="${LUMEN_PLAY_PROBE_URL%/}"
  fi
  if [[ -n "${LUMEN_PLAY_PROBE_MODEL:-}" ]]; then
    model="$LUMEN_PLAY_PROBE_MODEL"
  fi
  if [[ -n "$key" ]]; then
    if [[ "$key" == *$'\n'* ]]; then
      say "That key has a line break in it. Paste it as one line. Nothing was saved."
      exit 1
    fi
    say "Checking the key…"
    local status
    status="$(probe_key "$url" "$key" "$model")"
    case "$status" in
      ok)
        save_key "$key" "$url" "$model"
        say "Key looks good. Saved on this computer."
        ;;
      auth)
        say "That key was not accepted. Check the key, then run ./play.sh --setup again. Nothing was saved."
        exit 1
        ;;
      *)
        say "Could not reach DeepSeek to check the key. Check your network, then run ./play.sh --setup again. Nothing was saved."
        exit 1
        ;;
    esac
  fi
  ask_music
  if [[ -z "$key" ]]; then
    finish_without_key
  fi
}

if [[ "$setup" -eq 1 || ! -s "$ENV_FILE" ]]; then
  ask_setup
else
  config_py --notice
  music_line="$(config_py --music-line || true)"
  if [[ -n "$music_line" ]]; then
    say "$music_line"
  fi
  if llm_off_saved; then
    say "AI features are off. The game still runs. Run ./play.sh --setup to add a key."
  else
    say "Using the saved API setup. Run ./play.sh --setup to change it."
  fi
fi

if [[ "$no_run" -eq 1 ]]; then
  exit 0
fi

reap_stale() {
  local ids i
  ids="$(docker ps -aq --filter name=lumen-run- 2>/dev/null || true)"
  if [[ -z "$ids" ]]; then
    return 0
  fi
  say "Stopping an earlier game that was still running."
  # shellcheck disable=SC2086
  docker rm -f $ids >/dev/null 2>&1 || true
  # The published port is released a moment after the container exits.
  for i in $(seq 1 20); do
    if port_free 8080; then
      return 0
    fi
    sleep 0.1
  done
}

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

have_image() {
  docker image inspect "$1" >/dev/null 2>&1
}

build_local() {
  local sha_amd64="" sha_arm64=""
  sha_amd64="$(curl -fsSL --max-time 20 "https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-x86_64.tar.gz.sha256" | awk 'NF { print $1; exit }')" || sha_amd64=""
  sha_arm64="$(curl -fsSL --max-time 20 "https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-arm64.tar.gz.sha256" | awk 'NF { print $1; exit }')" || sha_arm64=""
  docker build --provenance=false \
    --build-arg "AURA_SHA_AMD64=${sha_amd64}" \
    --build-arg "AURA_SHA_ARM64=${sha_arm64}" \
    -t "$LOCAL_IMAGE" \
    -t "$IMAGE" \
    "$ROOT"
}

# A local build is tagged with the published name, so the next start
# finds it and does not pull or build again. A pull is only attempted
# when neither name is on this computer (the registry may not be public yet).
choose_image() {
  if [[ -n "${LUMEN_IMAGE:-}" ]]; then
    IMAGE="$LUMEN_IMAGE"
    if ! have_image "$IMAGE"; then
      say "The image ${IMAGE} is not on this computer."
      exit 1
    fi
    return 0
  fi
  IMAGE="ghcr.io/cybrid-systems/aura-runner:latest"
  if ! have_image "$IMAGE" && have_image "$LOCAL_IMAGE"; then
    docker tag "$LOCAL_IMAGE" "$IMAGE"
  fi
  if have_image "$IMAGE"; then
    return 0
  fi
  say "Downloading the game image…"
  if docker pull "$IMAGE"; then
    return 0
  fi
  say "Could not download ${IMAGE}."
  say "Building it on this computer instead. This uses the prebuilt Aura nightly and does not compile Aura."
  build_local
}

choose_image
if [[ "${LUMEN_PLAY_CHOOSE_ONLY:-}" == 1 ]]; then
  printf '%s\n' "$IMAGE"
  exit 0
fi

reap_stale
port="$(pick_port)"
url="http://127.0.0.1:${port}"
container_name="lumen-run-${port}-$$"

say "Starting the game…"
# The container sees a mode 0600 env file built from the saved settings.
# A music folder is mounted read-only at /music. The key is not on the
# command line. Attached, not -d, so closing the terminal stops the game.
run_env="$(mktemp)"
chmod 600 "$run_env"
music_mount=()
music_order="shuffle"
llm_on=0
llm_base=""
llm_model=""
docker_sh="$(config_py --docker-sh --container-env "$run_env")"
# shellcheck disable=SC2086
eval "$docker_sh"
args=(docker run --rm --name "$container_name" -p "127.0.0.1:${port}:8080" --env-file "$run_env")
if [[ ${#music_mount[@]} -gt 0 ]]; then
  args+=("${music_mount[@]}")
fi
args+=("$IMAGE")
"${args[@]}" &
run_pid=$!

wait_ready() {
  python3 - "$url" "${LUMEN_PLAY_READY_WAIT:-90}" "$run_pid" << 'PY'
import base64, os, socket, sys, time
url, limit, run_pid = sys.argv[1], float(sys.argv[2]), int(sys.argv[3])
host, port_s = url.split("://", 1)[1].rsplit(":", 1)
port = int(port_s)
deadline = time.time() + limit

def client_alive():
    if run_pid <= 0:
        return True
    try:
        os.kill(run_pid, 0)
    except OSError:
        return False
    return True

def take_frames(buf):
    texts = []
    while len(buf) >= 2:
        op = buf[0] & 0x0F
        ln = buf[1] & 0x7F
        off = 2
        if ln == 126:
            if len(buf) < 4:
                break
            ln = int.from_bytes(buf[2:4], "big")
            off = 4
        elif ln == 127:
            if len(buf) < 10:
                break
            ln = int.from_bytes(buf[2:10], "big")
            off = 10
        if len(buf) < off + ln:
            break
        texts.append((op, buf[off:off + ln]))
        buf = buf[off + ln:]
    return texts, buf

def ws_send(sock, opcode, payload):
    mask = os.urandom(4)
    header = bytearray([0x80 | opcode, 0x80 | len(payload)])
    header += mask
    header += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(header)

def release(sock):
    # bye frees the core's one client. Keep reading so a large welcome
    # cannot fill the socket and stall that bye.
    try:
        ws_send(sock, 1, b'{"op":"bye"}')
    except OSError:
        return
    sock.settimeout(0.1)
    end = time.time() + 1.0
    while time.time() < end:
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            continue
        except OSError:
            break
        if not chunk:
            break

while time.time() < deadline:
    if not client_alive():
        sys.exit(2)
    try:
        sock = socket.create_connection((host, port), 2)
    except OSError:
        time.sleep(0.1)
        continue
    try:
        key = base64.b64encode(os.urandom(16)).decode()
        sock.sendall((
            "GET /ws HTTP/1.1\r\nHost: %s:%d\r\nUpgrade: websocket\r\n"
            "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n" % (host, port, key)
        ).encode())
        sock.settimeout(1)
        buf = b""
        shook = False
        end = time.time() + 8
        while time.time() < end and time.time() < deadline:
            try:
                chunk = sock.recv(65536)
            except socket.timeout:
                continue
            if not chunk:
                break
            buf += chunk
            if not shook:
                if b"\r\n\r\n" not in buf:
                    continue
                head, buf = buf.split(b"\r\n\r\n", 1)
                if not head.startswith(b"HTTP/1.1 101"):
                    break
                shook = True
                payload = b'{"op":"hello","seed":1}'
                mask = os.urandom(4)
                frame = bytearray([0x81, 0x80 | len(payload)])
                frame += mask
                frame += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
                sock.sendall(frame)
            texts, buf = take_frames(buf)
            for op, text in texts:
                if op == 1 and (b'"op":"welcome"' in text or b'"op":"state"' in text):
                    release(sock)
                    sys.exit(0)
    except OSError:
        pass
    finally:
        try:
            sock.close()
        except OSError:
            pass
    time.sleep(0.1)
sys.exit(1)
PY
}

ready_rc=0
wait_ready || ready_rc=$?
if [[ "$ready_rc" -ne 0 ]]; then
  if [[ "$ready_rc" -eq 2 ]]; then
    say "The game stopped before it was ready."
  else
    say "The game did not become ready in time."
  fi
  docker logs "$container_name" >&2 || true
  stop_game
  exit 1
fi

if [[ "$(uname -s)" == "Darwin" ]] && command -v open >/dev/null 2>&1; then
  open "$url" >/dev/null 2>&1 || true
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$url" >/dev/null 2>&1 || true &
fi

say ""
say "The game is ready."
say "open ${url}"
say "Tap or space jumps, down slides, left and right change lane."
say "Press Ctrl-C to stop."
say ""
say "Copy this if you want to start it yourself later:"
print_replay() {
  printf 'docker run --rm -p 127.0.0.1:%s:8080 --env-file %q' "$port" "$ENV_FILE"
  if [[ "${llm_on:-0}" -eq 1 ]]; then
    printf ' -e %q -e %q' "LLM_BASE_URL=${llm_base}" "LLM_MODEL=${llm_model}"
  fi
  if [[ ${#music_mount[@]} -gt 0 ]]; then
    local a
    for a in "${music_mount[@]}"; do
      printf ' %q' "$a"
    done
    printf ' -e %q -e %q' "LUMEN_MUSIC_DIR=/music" "LUMEN_MUSIC_ORDER=${music_order}"
  fi
  printf ' %q\n' "$IMAGE"
}
print_replay >&2

code=0
wait "$run_pid" || code=$?
run_pid=""
container_name=""
exit "$code"
