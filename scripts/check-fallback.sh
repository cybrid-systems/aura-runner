#!/usr/bin/env bash
# ./run.sh on a Mac runs the prebuilt Aura image. The published port has to
# answer, and a websocket welcome has to come back. A second welcome within
# a second shows the probe released the core's one client.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/aura-path.sh
source "$ROOT/scripts/aura-path.sh"

cache="$(mktemp -d)"
export AURA_CACHE_DIR="$cache"
# Play-like path. Leave the sandbox on unless the caller already set it.
export AURA_WORK="$ROOT"
if [ -z "${AURA_SANDBOX+x}" ]; then
  unset AURA_SANDBOX || true
fi
unset LLM_API_KEY LLM_BASE_URL LLM_MODEL LUMEN_LLM LUMEN_MINIMAX_KEY LUMEN_DEEPSEEK_KEY || true

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
pick() {
  local p
  for p in $(seq "$1" $(( $1 + 40 ))); do
    if port_free "$p"; then
      printf '%s\n' "$p"
      return
    fi
  done
  echo "no free port near $1" >&2
  exit 1
}

web="$(pick 18280)"
export AURA_RUNNER_PORT="$(pick 18380)"
export AURA_RUNNER_WEB="$web"
write_container_wrapper
wrapper="$AURA_CONTAINER_BIN"
if ! grep -q "AURA_RUNNER_BIND=0.0.0.0" "$wrapper"; then
  echo "wrapper does not bind the Aura port inside the container" >&2
  exit 1
fi

aura_pid=""
web_pid=""
cleanup() {
  if [[ -n "$web_pid" ]]; then kill "$web_pid" 2>/dev/null || true; fi
  if [[ -n "$aura_pid" ]]; then kill "$aura_pid" 2>/dev/null || true; fi
  docker ps -aq --filter ancestor="ghcr.io/cybrid-systems/aura:nightly" | xargs -r docker rm -f >/dev/null 2>&1 || true
  rm -rf "$cache"
}
trap cleanup EXIT

echo "starting Aura through the container wrapper" >&2
"$wrapper" --quiet --preset dev --grant network core/main.aura > /tmp/lumen-fallback-aura.log 2>&1 &
aura_pid=$!
node bridge/server.mjs > /tmp/lumen-fallback-web.log 2>&1 &
web_pid=$!

python3 - "$web" "$AURA_RUNNER_PORT" << 'PY'
import base64, os, socket, sys, time
web, aura = int(sys.argv[1]), int(sys.argv[2])
deadline = time.time() + 120

def ws_send(sock, opcode, payload):
    mask = os.urandom(4)
    header = bytearray([0x80 | opcode, 0x80 | len(payload)])
    header += mask
    header += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(header)

# Host TCP to the published Aura port. An empty recv that never fills
# is the old bug: the core was bound to 127.0.0.1 inside the container.
got = b""
while time.time() < deadline and b"welcome" not in got and b'"op"' not in got:
    try:
        core = socket.create_connection(("127.0.0.1", aura), 2)
    except OSError:
        time.sleep(0.2)
        continue
    try:
        core.settimeout(2)
        core.sendall(b'{"op":"hello","seed":3}\n')
        end = time.time() + 15
        while time.time() < end and b"welcome" not in got and b'"op"' not in got:
            try:
                chunk = core.recv(65536)
            except socket.timeout:
                continue
            except OSError:
                chunk = b""
            if not chunk:
                break
            got += chunk
        if b"welcome" in got or b'"op"' in got:
            try:
                core.sendall(b'{"op":"bye"}\n')
            except OSError:
                pass
    except OSError:
        pass
    finally:
        try:
            core.close()
        except OSError:
            pass
    if b"welcome" not in got and b'"op"' not in got:
        got = b""
        time.sleep(0.2)
if b"welcome" not in got and b'"op"' not in got:
    sys.exit("published Aura port returned nothing")

def welcome(seed, limit):
    t0 = time.time()
    sock = None
    while time.time() - t0 < limit and sock is None:
        try:
            sock = socket.create_connection(("127.0.0.1", web), 2)
        except OSError:
            time.sleep(0.1)
    if sock is None:
        return None
    key = base64.b64encode(os.urandom(16)).decode()
    sock.sendall((
        "GET /ws HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nUpgrade: websocket\r\n"
        "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
        % (web, key)
    ).encode())
    buf = b""
    sock.settimeout(0.2)
    shook = False
    while time.time() - t0 < limit:
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
                sock.close()
                return None
            shook = True
            ws_send(sock, 1, ('{"op":"hello","seed":%d}' % seed).encode())
        while len(buf) >= 2:
            op = buf[0] & 0x0f
            ln = buf[1] & 0x7f
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
            body = buf[off:off + ln]
            buf = buf[off + ln:]
            if op == 1 and b'"op":"welcome"' in body:
                try:
                    ws_send(sock, 1, b'{"op":"bye"}')
                except OSError:
                    pass
                # Drain until the core closes, so the slot is free.
                end = time.time() + 1.0
                while time.time() < end:
                    try:
                        more = sock.recv(65536)
                    except socket.timeout:
                        continue
                    except OSError:
                        more = b""
                    if not more:
                        break
                try:
                    sock.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                sock.close()
                return time.time() - t0
    try:
        sock.close()
    except OSError:
        pass
    return None

first = welcome(4, max(1.0, deadline - time.time()))
if first is None:
    sys.exit("websocket did not return a welcome")
second = welcome(5, 1.0)
if second is None:
    sys.exit("the next welcome was not ready within 1s")
print("fallback_welcome %.3f" % first)
print("fallback_next %.3f" % second)
print("fallback ok")
PY
