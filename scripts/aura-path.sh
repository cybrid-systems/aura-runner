# Resolve the pinned Aura binary. The only stdout is the executable path.
# Progress goes to stderr so command substitution stays clean.
#
# Pin: Aura main e7d85162c7cafcdac779e27c453c63d44b03a91d, which contains
# b4e0ce31 (http-post returns a body, timeout is configurable). The dist
# workflow publishes an immutable image
# ghcr.io/cybrid-systems/aura:e7d85162c (and :e7d85162c-<arch>). The
# rolling GitHub "nightly" release is the same commit only until the next
# main push, so installs pull the image layer instead of that URL.
# Verified 2026-11-13: image revision and the nightly tarball BUILD-INFO
# both read e7d85162c7cafcdac779e27c453c63d44b03a91d. An older nightly
# asset (the release was created 2026-11-04) is not used.

AURA_COMMIT="e7d85162c7cafcdac779e27c453c63d44b03a91d"
AURA_TAG="e7d85162c"

aura_arch() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) printf '%s\n' x86_64 ;;
    aarch64|arm64) printf '%s\n' arm64 ;;
    *) echo "unsupported architecture: $arch" >&2; return 1 ;;
  esac
}

# Download one arch's bundle from the pinned image into dest_dir.
# stdout stays empty. On success, dest_dir contains bin/aura.
fetch_aura_bundle() {
  local arch="$1"
  local dest="$2"
  python3 - "$arch" "$dest" "$AURA_TAG" "$AURA_COMMIT" <<'PY'
import io, json, os, sys, tarfile, urllib.request
arch, dest, tag, commit = sys.argv[1:5]
repo = "cybrid-systems/aura"
tok_url = f"https://ghcr.io/token?service=ghcr.io&scope=repository:{repo}:pull"
with urllib.request.urlopen(tok_url, timeout=60) as r:
    token = json.load(r)["token"]

def get(url, accept=None):
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    if accept:
        req.add_header("Accept", accept)
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()

manifest = json.loads(get(
    f"https://ghcr.io/v2/{repo}/manifests/{tag}-{arch}",
    "application/vnd.docker.distribution.manifest.v2+json"))
layers = sorted(manifest["layers"], key=lambda L: L["size"], reverse=True)
os.makedirs(dest, exist_ok=True)
found = None
for layer in layers:
    if layer["size"] < 1000000:
        continue
    blob = get(f"https://ghcr.io/v2/{repo}/blobs/{layer['digest']}")
    try:
        tar = tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz")
    except tarfile.TarError:
        continue
    names = tar.getnames()
    hit = [n for n in names if n.endswith("/bin/aura") or n == "bin/aura"]
    info = [n for n in names if n.endswith("/BUILD-INFO") or n == "BUILD-INFO"]
    if not hit:
        tar.close()
        continue
    text = ""
    if info:
        raw = tar.extractfile(info[0])
        text = raw.read().decode("utf-8", "replace") if raw else ""
    if commit not in text:
        tar.close()
        raise SystemExit(f"layer {layer['digest']} BUILD-INFO is not {commit}: {text!r}")
    tar.extractall(dest)
    tar.close()
    found = hit[0]
    break
if not found:
    raise SystemExit(f"no aura bundle in {tag}-{arch}")
print(f"fetched {tag}-{arch} ({found})", file=sys.stderr)
PY
}

# List bin/aura and BUILD-INFO for an arch without executing it.
# stdout is the listing plus the BUILD-INFO body, for the install check.
inspect_aura_arch() {
  local arch="$1"
  python3 - "$arch" "$AURA_TAG" "$AURA_COMMIT" <<'PY'
import io, json, sys, tarfile, urllib.request
arch, tag, commit = sys.argv[1:4]
repo = "cybrid-systems/aura"
tok_url = f"https://ghcr.io/token?service=ghcr.io&scope=repository:{repo}:pull"
with urllib.request.urlopen(tok_url, timeout=60) as r:
    token = json.load(r)["token"]

def get(url, accept=None):
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {token}")
    if accept:
        req.add_header("Accept", accept)
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()

manifest = json.loads(get(
    f"https://ghcr.io/v2/{repo}/manifests/{tag}-{arch}",
    "application/vnd.docker.distribution.manifest.v2+json"))
layers = sorted(manifest["layers"], key=lambda L: L["size"], reverse=True)
for layer in layers:
    if layer["size"] < 1000000:
        continue
    blob = get(f"https://ghcr.io/v2/{repo}/blobs/{layer['digest']}")
    tar = tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz")
    names = tar.getnames()
    hit = [n for n in names if n.endswith("/bin/aura") or n == "bin/aura"]
    info = [n for n in names if n.endswith("/BUILD-INFO") or n == "BUILD-INFO"]
    if not hit:
        tar.close()
        continue
    text = ""
    if info:
        raw = tar.extractfile(info[0])
        text = raw.read().decode("utf-8", "replace") if raw else ""
    tar.close()
    if commit not in text:
        raise SystemExit(f"{arch} BUILD-INFO is not {commit}")
    print(hit[0])
    print(text.strip())
    sys.exit(0)
raise SystemExit(f"no aura bundle in {tag}-{arch}")
PY
}

install_aura() {
  local root="$1"
  local force="${AURA_FORCE_TOOLS:-}"

  if [[ -z "$force" ]] && command -v aura >/dev/null 2>&1; then
    local v
    v="$(aura --version 2>/dev/null || true)"
    if [[ "$v" == *"$AURA_COMMIT"* ]]; then
      command -v aura
      return 0
    fi
  fi

  local dest="$root/.tools/aura/bin/aura"
  if [[ -x "$dest" ]]; then
    local have
    have="$("$dest" --version 2>/dev/null || true)"
    if [[ "$have" == *"$AURA_COMMIT"* ]]; then
      printf '%s\n' "$dest"
      return 0
    fi
    rm -rf "$root/.tools/aura-src" "$root/.tools/aura"
  fi

  local arch
  arch="$(aura_arch)" || return 1
  echo "installing Aura ${AURA_TAG} (${arch}) from ghcr.io/cybrid-systems/aura:${AURA_TAG}" >&2
  rm -rf "$root/.tools/aura-src"
  mkdir -p "$root/.tools/aura-src"
  if ! fetch_aura_bundle "$arch" "$root/.tools/aura-src"; then
    echo "Aura image fetch failed" >&2
    return 1
  fi
  local bin
  bin="$(find "$root/.tools/aura-src" -type f -path '*/bin/aura' -print -quit)"
  if [[ -z "$bin" || ! -f "$bin" ]]; then
    echo "image did not contain bin/aura" >&2
    return 1
  fi
  chmod +x "$bin" || true
  local bundle
  bundle="$(cd "$(dirname "$bin")/.." && pwd)"
  rm -rf "$root/.tools/aura-dist"
  mv "$bundle" "$root/.tools/aura-dist"
  rm -rf "$root/.tools/aura-src"
  mv "$root/.tools/aura-dist" "$root/.tools/aura-src"
  rm -f "$root/.tools/aura"
  ln -s "$root/.tools/aura-src" "$root/.tools/aura"
  if [[ ! -x "$dest" ]]; then
    echo "install did not produce an executable at $dest" >&2
    return 1
  fi
  local got
  got="$("$dest" --version 2>/dev/null || true)"
  if [[ "$got" != *"$AURA_COMMIT"* ]]; then
    echo "unexpected Aura version: $got" >&2
    return 1
  fi
  echo "Aura ready: $dest" >&2
  echo "$got" >&2
  printf '%s\n' "$dest"
}
