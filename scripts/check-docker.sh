#!/usr/bin/env bash
# Build (unless LUMEN_IMAGE is set) and smoke-test the container.
# The page and the Aura port must answer through Docker's published ports,
# with no API key.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

IMAGE="${LUMEN_IMAGE:-lumen-run:local}"
if [[ -z "${LUMEN_IMAGE:-}" ]]; then
  sha_amd64="$(curl -fsSL --max-time 20 "https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-x86_64.tar.gz.sha256" | awk 'NF { print $1; exit }')"
  sha_arm64="$(curl -fsSL --max-time 20 "https://github.com/cybrid-systems/aura/releases/download/nightly/aura-nightly-linux-arm64.tar.gz.sha256" | awk 'NF { print $1; exit }')"
  docker build \
    --build-arg "AURA_SHA_AMD64=${sha_amd64}" \
    --build-arg "AURA_SHA_ARM64=${sha_arm64}" \
    -t "$IMAGE" \
    "$ROOT"
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "image not found: $IMAGE" >&2
  exit 1
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

pick() {
  local p
  for p in $(seq "$1" $(( $1 + 30 ))); do
    if port_free "$p"; then
      printf '%s\n' "$p"
      return
    fi
  done
  echo "no free port near $1" >&2
  exit 1
}

web="$(pick 18080)"
aura="$(pick $((web + 1)))"
name="lumen-smoke-$$"
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

start="$(date +%s.%N)"
docker run -d --name "$name" \
  -p "127.0.0.1:${web}:8080" \
  -p "127.0.0.1:${aura}:8765" \
  -e AURA_RUNNER_BIND=0.0.0.0 \
  "$IMAGE" >/dev/null

python3 - "$web" "$aura" "$name" "$start" "$IMAGE" << 'PY'
import json, os, socket, subprocess, sys, time, base64

web, aura, name, start, image = sys.argv[1:]
web = int(web)
aura = int(aura)
start = float(start)
deadline = time.time() + 90

def logs():
    return subprocess.run(["docker", "logs", name], capture_output=True, text=True).stdout + \
        subprocess.run(["docker", "logs", name], capture_output=True, text=True).stderr

def fail(msg):
    sys.stderr.write(msg + "\n")
    sys.stderr.write(logs()[-4000:] + "\n")
    sys.exit(1)

def recv_until(sock, pred, buf=b"", limit=None):
    sock.settimeout(1)
    end = deadline if limit is None else limit
    lines = []
    while time.time() < end:
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            line = line.strip()
            if not line or set(line) <= {ord(".")}:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue
            lines.append(msg)
            if pred(lines):
                return lines, buf
        try:
            chunk = sock.recv(65536)
        except socket.timeout:
            continue
        except OSError:
            break
        if not chunk:
            break
        buf += chunk
    return None, buf

page = b""
while time.time() < deadline:
    try:
        s = socket.create_connection(("127.0.0.1", web), 2)
        s.sendall(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        chunks = []
        while True:
            data = s.recv(65536)
            if not data:
                break
            chunks.append(data)
        s.close()
        page = b"".join(chunks)
        if b"200" in page.split(b"\r\n", 1)[0] and b"Lumen Run" in page and b'id="view"' in page:
            break
    except OSError:
        pass
    page = b""
    time.sleep(0.2)
else:
    fail("game page did not respond")

def http_status(path):
    s = socket.create_connection(("127.0.0.1", web), 5)
    s.sendall(("GET %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n" % path).encode())
    data = b""
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        data += chunk
    s.close()
    return data.split(b"\r\n", 1)[0]

main = http_status("/main.mjs")
if b"200" not in main:
    fail("main.mjs did not respond: " + main.decode("utf-8", "replace"))
music = http_status("/symphony.mp4")
if b"204" not in music:
    fail("missing music file should be 204: " + music.decode("utf-8", "replace"))

# Backend port, through Docker's mapping. No key, so the provider list is empty.
# A connection can be accepted before the core is listening; retry until it answers.
core = None
batch = None
pending = b""
while time.time() < deadline and batch is None:
    try:
        core = socket.create_connection(("127.0.0.1", aura), 2)
    except OSError:
        time.sleep(0.2)
        continue
    try:
        core.sendall(b'{"op":"hello","seed":42}\n')
        batch, pending = recv_until(
            core,
            lambda xs: any(m.get("op") == "state" for m in xs),
            limit=min(deadline, time.time() + 15),
        )
    except OSError:
        batch = None
    if batch is None:
        try:
            core.close()
        except OSError:
            pass
        core = None
        time.sleep(0.2)
if not batch:
    fail("backend sent no state")
welcome = next((m for m in batch if m.get("op") == "welcome"), None)
state = next((m for m in batch if m.get("op") == "state"), None)
chunks = [m for m in batch if m.get("op") == "chunk"]
if not welcome or welcome.get("replay") != "LUMEN-42":
    fail("welcome replay missing")
if welcome.get("provider") not in ("", None):
    fail("llm provider was set with no key: %s" % welcome.get("provider"))
if welcome.get("providers") not in ([], None):
    fail("llm providers were set with no key")
if not chunks:
    fail("no course without an llm")
if not state or not state.get("alive", True):
    fail("run was not alive")
moved = state.get("x", 0)
for _ in range(40):
    core.sendall(b'{"op":"tick","jump":0,"slide":0,"lane":0,"dt":50}\n')
    nxt, pending = recv_until(core, lambda xs: any(m.get("op") == "state" for m in xs), pending)
    if not nxt:
        break
    state = next(m for m in nxt if m.get("op") == "state")
    if state.get("provider") not in ("", None) or state.get("providers") not in ([], None):
        fail("llm turned on during the run")
    if not state.get("alive", True):
        fail("run ended with no llm")
    moved = state.get("x", moved)
    if isinstance(moved, (int, float)) and moved > 0:
        break
core.close()
if not isinstance(moved, (int, float)) or isinstance(moved, bool) or moved <= 0:
    fail("runner did not move without an llm")

# The browser path: the page server accepts a websocket and the core answers with no provider.
ws = socket.create_connection(("127.0.0.1", web), 5)
key = base64.b64encode(os.urandom(16)).decode()
ws.sendall((
    "GET /ws HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nUpgrade: websocket\r\n"
    "Connection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n"
    % (web, key)
).encode())
shake = b""
while b"\r\n\r\n" not in shake:
    chunk = ws.recv(4096)
    if not chunk:
        fail("websocket handshake closed")
    shake += chunk
head, rest = shake.split(b"\r\n\r\n", 1)
if not head.startswith(b"HTTP/1.1 101"):
    fail("websocket was not accepted")
payload = b'{"op":"hello","seed":7}'
mask = os.urandom(4)
frame = bytearray([0x81, 0x80 | len(payload)])
frame += mask
frame += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
ws.sendall(frame)
seen = ""
wbuf = rest
ws.settimeout(1)
while time.time() < deadline and seen != "ok":
    texts = []
    while len(wbuf) >= 2:
        op = wbuf[0] & 0x0f
        ln = wbuf[1] & 0x7f
        off = 2
        if ln == 126:
            if len(wbuf) < 4:
                break
            ln = int.from_bytes(wbuf[2:4], "big")
            off = 4
        elif ln == 127:
            if len(wbuf) < 10:
                break
            ln = int.from_bytes(wbuf[2:10], "big")
            off = 10
        if len(wbuf) < off + ln:
            break
        body = wbuf[off:off + ln]
        wbuf = wbuf[off + ln:]
        if op == 1:
            texts.append(body.decode("utf-8", "replace"))
    for text in texts:
        seen += text
        try:
            msg = json.loads(text)
        except json.JSONDecodeError:
            continue
        if msg.get("op") == "welcome" and msg.get("replay") == "LUMEN-7":
            if msg.get("provider") not in ("", None) or msg.get("providers") not in ([], None):
                fail("page path enabled an llm with no key")
            seen = "ok"
            break
    if seen == "ok":
        break
    try:
        chunk = ws.recv(65536)
    except socket.timeout:
        continue
    if not chunk:
        break
    wbuf += chunk
if seen != "ok":
    ws.close()
    fail("page websocket did not return a no-llm welcome")

def ws_send(sock, opcode, payload):
    mask = os.urandom(4)
    header = bytearray([0x80 | opcode, 0x80 | len(payload)])
    header += mask
    header += bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(header)

# Release the core's one client, then the next welcome must be immediate.
ws_send(ws, 1, b'{"op":"bye"}')
ws.settimeout(0.1)
release_end = time.time() + 1.0
while time.time() < release_end:
    try:
        chunk = ws.recv(65536)
    except socket.timeout:
        continue
    except OSError:
        break
    if not chunk:
        break
try:
    ws.shutdown(socket.SHUT_RDWR)
except OSError:
    pass
ws.close()

def welcome_within(limit):
    t0 = time.time()
    sock = socket.create_connection(("127.0.0.1", web), 2)
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
                break
            shook = True
            ws_send(sock, 1, b'{"op":"hello","seed":9}')
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
                sock.close()
                return time.time() - t0
    sock.close()
    return None

second = welcome_within(1.0)
if second is None:
    fail("the next browser did not get a welcome within 1s of the probe releasing")
print("next_welcome %.3f" % second)

off = False
for _ in range(50):
    text = logs()
    if "llm: off" in text:
        off = True
        break
    time.sleep(0.1)
if not off:
    fail("container did not say llm is off")

elapsed = time.time() - start
size = subprocess.check_output(["docker", "image", "inspect", "-f", "{{.Size}}", image], text=True).strip()
print("to_playable %.3f" % elapsed)
print("image_bytes %s" % size)
print("docker smoke ok")
PY
