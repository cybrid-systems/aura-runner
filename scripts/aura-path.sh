# Resolve a prebuilt Aura binary. The only stdout is the executable path.
# Progress and errors go to stderr so command substitution stays one line.
#
# Default is the rolling nightly release:
#   https://github.com/cybrid-systems/aura/releases/download/nightly/
# Verified asset names (nightly, and the same pattern on vX.Y.Z):
#   aura-nightly-linux-x86_64.tar.gz
#   aura-nightly-linux-arm64.tar.gz
#   aura-<version>-linux-<arch>.tar.gz.sha256 beside each archive
# macOS and Windows use the same pattern when the release publishes them.
#
# A cached copy is reused while its sha256 matches the release. The cache
# is ~/.cache/lumen-run (or $XDG_CACHE_HOME/lumen-run, or $AURA_CACHE_DIR).
# AURA_VERSION pins nightly or a release tag (v0.2.7). AURA_OFFLINE=1
# never touches the network. AURA_DOWNLOAD_BASE replaces the release URL
# (a mirror, or a directory of tarballs). AURA_FORCE_TOOLS=1 downloads again.

AURA_READY_FROM=""
AURA_READY_VERSION=""
AURA_FETCH_KIND=""
AURA_FETCH_DETAIL=""

aura_tag() {
  local v="${AURA_VERSION:-nightly}"
  if [[ "$v" == "nightly" ]]; then
    printf 'nightly\n'
  elif [[ "$v" =~ ^v[0-9] ]]; then
    printf '%s\n' "$v"
  elif [[ "$v" =~ ^[0-9] ]]; then
    printf 'v%s\n' "$v"
  else
    printf '%s\n' "$v"
  fi
}

aura_version_slug() {
  local t
  t="$(aura_tag)"
  if [[ "$t" == "nightly" ]]; then
    printf 'nightly\n'
  else
    printf '%s\n' "${t#v}"
  fi
}

aura_cache_root() {
  if [[ -n "${AURA_CACHE_DIR:-}" ]]; then
    printf '%s\n' "$AURA_CACHE_DIR"
  elif [[ -n "${XDG_CACHE_HOME:-}" ]]; then
    printf '%s/lumen-run\n' "$XDG_CACHE_HOME"
  else
    printf '%s/.cache/lumen-run\n' "$HOME"
  fi
}

aura_os() {
  if [[ -n "${AURA_OS:-}" ]]; then
    printf '%s\n' "$AURA_OS"
    return 0
  fi
  local s
  s="$(uname -s)"
  case "$s" in
    Linux) printf 'linux\n' ;;
    Darwin) printf 'darwin\n' ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT) printf 'windows\n' ;;
    *)
      echo "unsupported operating system: $s" >&2
      echo "Aura publishes prebuilt binaries for Linux. Set AURA_BIN to a binary you already have." >&2
      return 1
      ;;
  esac
}

aura_arch() {
  local arch="${AURA_ARCH:-$(uname -m)}"
  case "$arch" in
    x86_64|amd64) printf 'x86_64\n' ;;
    aarch64|arm64) printf 'arm64\n' ;;
    *)
      echo "unsupported architecture: $arch" >&2
      echo "Aura publishes x86_64 and arm64. Set AURA_BIN to a binary you already have." >&2
      return 1
      ;;
  esac
}

aura_release_base() {
  local base tag
  tag="$(aura_tag)"
  base="${AURA_DOWNLOAD_BASE:-https://github.com/cybrid-systems/aura/releases/download/$tag}"
  case "$base" in
    http://*|https://*|file://*) printf '%s\n' "${base%/}" ;;
    /*) printf 'file://%s\n' "${base%/}" ;;
    *) printf '%s\n' "${base%/}" ;;
  esac
}

# One candidate per line. The first name is the one the release uses today.
aura_asset_candidates() {
  local slug="$1" os="$2" arch="$3"
  local -a oses=("$os") arches=("$arch")
  local o a
  case "$os" in
    darwin) oses+=(macos osx mac) ;;
    windows) oses+=(win) ;;
  esac
  case "$arch" in
    x86_64) arches+=(amd64 x64) ;;
    arm64) arches+=(aarch64) ;;
  esac
  for o in "${oses[@]}"; do
    for a in "${arches[@]}"; do
      if [[ "$os" == "windows" ]]; then
        printf 'aura-%s-%s-%s.zip\n' "$slug" "$o" "$a"
        printf 'aura-%s-%s-%s.tar.gz\n' "$slug" "$o" "$a"
      else
        printf 'aura-%s-%s-%s.tar.gz\n' "$slug" "$o" "$a"
      fi
    done
  done
}

fetch_to() {
  local url="$1" dest="$2" show="${3:-}"
  local err code rc
  err="$(mktemp)"
  AURA_FETCH_KIND=""
  AURA_FETCH_DETAIL=""
  local -a args=(-fL --retry 3 --retry-delay 1 --max-time 300 -A "lumen-run")
  if [[ "$show" == "progress" ]]; then
    args+=(--progress-bar)
  else
    args+=(-sS)
  fi
  rc=0
  if [[ "$show" == "progress" ]]; then
    # The progress bar is stderr. Leave it on the terminal.
    code="$(curl "${args[@]}" -o "$dest" -w '%{http_code}' "$url")" || rc=$?
    rm -f "$err"
  else
    code="$(curl "${args[@]}" -o "$dest" -w '%{http_code}' "$url" 2>"$err")" || rc=$?
    if [[ "$rc" -ne 0 && -f "$err" ]]; then
      AURA_FETCH_DETAIL="$(tr '\n' ' ' < "$err" | sed 's/  */ /g')"
    fi
    rm -f "$err"
  fi
  if [[ "$rc" -eq 0 ]]; then
    return 0
  fi
  rm -f "$dest"
  if [[ "$code" == "404" ]]; then
    AURA_FETCH_KIND="missing"
    return 8
  fi
  AURA_FETCH_KIND="network"
  return 1
}

check_sha256() {
  local file="$1" sumfile="$2" want got
  want="$(awk 'NF { print $1; exit }' "$sumfile")"
  if [[ -z "$want" || ${#want} -lt 64 ]]; then
    echo "The Aura release published an empty checksum for $(basename "$file")." >&2
    return 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    got="$(sha256sum "$file" | awk '{ print $1 }')"
  elif command -v shasum >/dev/null 2>&1; then
    got="$(shasum -a 256 "$file" | awk '{ print $1 }')"
  else
    echo "Need sha256sum or shasum to verify the Aura download." >&2
    return 1
  fi
  if [[ "$want" != "$got" ]]; then
    echo "sha256 mismatch for $(basename "$file")." >&2
    echo "The download does not match the release checksum. Retry ./run.sh." >&2
    return 1
  fi
}

bundle_top_name() {
  local name="$1" base
  base="${name%.tar.gz}"
  base="${base%.tgz}"
  base="${base%.zip}"
  printf '%s\n' "$base"
}

aura_bin_in() {
  local slot="$1"
  if [[ -f "$slot/bin/aura.exe" && ! -f "$slot/bin/aura" ]]; then
    printf '%s\n' "$slot/bin/aura.exe"
  elif [[ -f "$slot/bin/aura" ]]; then
    printf '%s\n' "$slot/bin/aura"
  else
    return 1
  fi
}

network_error() {
  local os="$1" arch="$2" cache="$3"
  echo "Could not reach the Aura release for ${os}/${arch}." >&2
  echo "Check the network, then retry ./run.sh." >&2
  echo "Or set AURA_OFFLINE=1 to use a cached copy under ${cache}." >&2
  if [[ -n "${AURA_FETCH_DETAIL:-}" ]]; then
    echo "Detail: ${AURA_FETCH_DETAIL}" >&2
  fi
}

# Print the asset file name. Leaves its checksum in $AURA_SHA_FILE.
resolve_asset() {
  local os="$1" arch="$2"
  local slug base name rc tmp
  slug="$(aura_version_slug)"
  base="$(aura_release_base)"
  tmp="$(mktemp)"
  AURA_SHA_FILE=""
  while IFS= read -r name; do
    [[ -z "$name" ]] && continue
    rc=0
    fetch_to "$base/$name.sha256" "$tmp" || rc=$?
    if [[ "$rc" -eq 0 ]]; then
      AURA_SHA_FILE="$(mktemp)"
      mv "$tmp" "$AURA_SHA_FILE"
      printf '%s\n' "$name"
      return 0
    fi
    if [[ "$rc" -ne 8 ]]; then
      rm -f "$tmp"
      network_error "$os" "$arch" "$(aura_cache_root)"
      return 1
    fi
  done < <(aura_asset_candidates "$slug" "$os" "$arch")
  rm -f "$tmp"
  if [[ -n "${AURA_DOWNLOAD_BASE:-}" ]]; then
    echo "No Aura bundle for ${os}/${arch} at ${base}." >&2
    echo "Set AURA_BIN to a binary you already have." >&2
    return 1
  fi
  pick_asset_from_api "$os" "$arch"
}

docker_ready() {
  [[ -z "${AURA_NO_DOCKER:-}" ]] || return 1
  command -v docker >/dev/null 2>&1 || return 1
  docker info >/dev/null 2>&1
}

# A Mac or Windows machine can run the prebuilt Linux image. Linux already
# has a native asset, and a test that only pretends to be Darwin must not
# pull an image.
container_fallback_ok() {
  case "$(uname -s)" in
    Darwin|MINGW*|MSYS*|CYGWIN*|Windows_NT) ;;
    *) return 1 ;;
  esac
  docker_ready
}

write_container_wrapper() {
  local dest slug
  slug="$(aura_version_slug)"
  dest="$(aura_cache_root)/aura/$slug/container/aura"
  mkdir -p "$(dirname "$dest")"
  cat > "$dest" << EOF
#!/bin/sh
# Prebuilt Aura image. This OS has no native binary in the release.
port=\${AURA_RUNNER_PORT:-8765}
work=\${AURA_WORK:-\$PWD}
exec docker run --rm \\
  -p "127.0.0.1:\${port}:\${port}" \\
  -v "\${work}:/work" -w /work \\
  -e AURA_SANDBOX -e AURA_RUNNER_PORT -e AURA_EVO_LOG -e AURA_HTTP_TIMEOUT \\
  -e LLM_API_KEY -e LLM_BASE_URL -e LLM_MODEL -e LLM_TIMEOUT -e LUMEN_LLM \\
  "ghcr.io/cybrid-systems/aura:${slug}" \\
  "\$@"
EOF
  chmod +x "$dest"
  AURA_CONTAINER_BIN="$dest"
}

explain_no_native() {
  local os="$1" arch="$2" tag="$3" chosen="$4"
  echo "No prebuilt Aura for ${os}/${arch} in the ${tag} release." >&2
  if [[ "$chosen" == NONE* && $(printf '%s\n' "$chosen" | wc -l) -gt 1 ]]; then
    echo "Published assets:" >&2
    printf '%s\n' "$chosen" | tail -n +2 | sed 's/^/  /' >&2
  else
    echo "This release publishes Linux x86_64 and Linux arm64." >&2
  fi
  echo "On a Mac, install OrbStack (https://orbstack.dev) or Docker Desktop, then run ./run.sh again." >&2
  echo "When docker is available, ./run.sh runs the prebuilt image ghcr.io/cybrid-systems/aura:$(aura_version_slug)." >&2
  echo "It does not compile Aura. You can also set AURA_BIN to a native binary." >&2
}

pick_asset_from_api() {
  local os="$1" arch="$2"
  local tag api body rc chosen slug base
  tag="$(aura_tag)"
  slug="$(aura_version_slug)"
  api="https://api.github.com/repos/cybrid-systems/aura/releases/tags/${tag}"
  body="$(mktemp)"
  rc=0
  fetch_to "$api" "$body" || rc=$?
  if [[ "$rc" -ne 0 ]]; then
    rm -f "$body"
    if [[ "$rc" -eq 8 ]]; then
      echo "Aura release '${tag}' was not found." >&2
      echo "AURA_VERSION can be nightly or a tag such as v0.2.7." >&2
      return 1
    fi
    network_error "$os" "$arch" "$(aura_cache_root)"
    return 1
  fi
  chosen="$(python3 - "$os" "$arch" "$slug" "$body" << 'PY'
import json, sys
os_name, arch, slug, path = sys.argv[1:5]
os_words = {
    "linux": ["linux"],
    "darwin": ["darwin", "macos", "osx", "mac"],
    "windows": ["windows", "win"],
}.get(os_name, [os_name])
arch_words = {
    "x86_64": ["x86_64", "amd64", "x64"],
    "arm64": ["arm64", "aarch64"],
}.get(arch, [arch])
try:
    rel = json.load(open(path))
except json.JSONDecodeError:
    sys.exit(2)
assets = [a.get("name", "") for a in rel.get("assets") or []]
def ok(name):
    low = name.lower()
    if low.endswith(".sha256") or low.endswith(".json"):
        return False
    if not (low.endswith(".tar.gz") or low.endswith(".tgz") or low.endswith(".zip")):
        return False
    if not any(w in low for w in os_words):
        return False
    if not any(w in low for w in arch_words):
        return False
    return True
cands = [n for n in assets if ok(n)]
cands.sort(key=lambda n: (0 if n.endswith(".tar.gz") else 1, len(n), n))
if cands:
    print(cands[0])
else:
    print("NONE")
    for n in assets:
        low = n.lower()
        if low.endswith(".sha256") or low.endswith(".json"):
            continue
        print(n)
PY
)" || {
    rm -f "$body"
    echo "Could not read the asset list for Aura release ${tag}." >&2
    return 1
  }
  rm -f "$body"
  if [[ "$chosen" == NONE* || -z "$chosen" ]]; then
    if container_fallback_ok; then
      echo "No native Aura build for ${os}/${arch}. Using the prebuilt Linux image." >&2
      write_container_wrapper
      printf '%s\n' "CONTAINER"
      return 0
    fi
    explain_no_native "$os" "$arch" "$tag" "$chosen"
    return 1
  fi
  chosen="$(printf '%s\n' "$chosen" | head -n 1)"
  base="$(aura_release_base)"
  AURA_SHA_FILE="$(mktemp)"
  rc=0
  fetch_to "$base/$chosen.sha256" "$AURA_SHA_FILE" || rc=$?
  if [[ "$rc" -ne 0 ]]; then
    rm -f "$AURA_SHA_FILE"
    AURA_SHA_FILE=""
    if [[ "$rc" -eq 8 ]]; then
      echo "Aura asset ${chosen} has no .sha256 file, so it was not installed." >&2
      return 1
    fi
    network_error "$os" "$arch" "$(aura_cache_root)"
    return 1
  fi
  printf '%s\n' "$chosen"
}

unpack_bundle() {
  local archive="$1" name="$2" slot="$3"
  local tmp top
  tmp="$(mktemp -d)"
  case "$name" in
    *.zip)
      if ! command -v unzip >/dev/null 2>&1; then
        echo "The Aura build is a zip archive and unzip is not installed." >&2
        rm -rf "$tmp"
        return 1
      fi
      if ! unzip -q "$archive" -d "$tmp"; then
        echo "Could not unpack ${name}." >&2
        rm -rf "$tmp"
        return 1
      fi
      ;;
    *)
      if ! tar -xzf "$archive" -C "$tmp"; then
        echo "Could not unpack ${name}." >&2
        rm -rf "$tmp"
        return 1
      fi
      ;;
  esac
  top="$tmp/$(bundle_top_name "$name")"
  if [[ ! -d "$top/bin" ]]; then
    top=""
    local d
    for d in "$tmp"/*; do
      if [[ -d "$d/bin" ]]; then
        top="$d"
        break
      fi
    done
  fi
  if [[ -z "$top" || ! -d "$top/bin" ]]; then
    echo "The Aura bundle does not contain bin/aura." >&2
    echo "That archive is not a prebuilt binary. ./run.sh does not compile Aura." >&2
    rm -rf "$tmp"
    return 1
  fi
  rm -rf "$slot"
  mkdir -p "$(dirname "$slot")"
  if ! mv "$top" "$slot"; then
    echo "Could not place the Aura bundle in the cache." >&2
    rm -rf "$tmp" "$slot"
    return 1
  fi
  rm -rf "$tmp"
  local bin
  bin="$(aura_bin_in "$slot")" || {
    echo "The Aura bundle does not contain bin/aura." >&2
    rm -rf "$slot"
    return 1
  }
  chmod +x "$bin" 2>/dev/null || true
  [[ -f "$slot/libexec/aura" ]] && chmod +x "$slot/libexec/aura" 2>/dev/null || true
  [[ -f "$slot/rt/ld.so" ]] && chmod +x "$slot/rt/ld.so" 2>/dev/null || true
  printf '%s\n' "$bin"
}

verify_running_version() {
  local bin="$1" slug got
  slug="$(aura_version_slug)"
  got="$("$bin" --version 2>/dev/null || true)"
  case "$got" in
    *"$slug"*) ;;
    *)
      echo "unexpected Aura version: ${got:-"(no version)"}" >&2
      echo "Wanted a build of ${slug}. Remove the cache and retry, or set AURA_BIN." >&2
      return 1
      ;;
  esac
  AURA_READY_VERSION="$got"
}

use_cached_slot() {
  local slot="$1" from="$2" bin
  bin="$(aura_bin_in "$slot")" || return 1
  if [[ ! -x "$bin" && ! -f "$bin" ]]; then
    return 1
  fi
  chmod +x "$bin" 2>/dev/null || true
  if ! verify_running_version "$bin"; then
    return 1
  fi
  AURA_READY_FROM="$from"
  printf '%s\n' "$bin"
}

# Download or reuse one platform's bundle. Prints the bin/aura path.
# Foreign architectures are not executed.
ensure_bundle() {
  local os="$1" arch="$2" execute="$3"
  local cache slug plat stamp slot sha name bin
  cache="$(aura_cache_root)"
  slug="$(aura_version_slug)"
  case "$slug" in
    *[!A-Za-z0-9._-]*)
      echo "invalid AURA_VERSION: ${AURA_VERSION}" >&2
      return 1
      ;;
  esac
  plat="${os}-${arch}"
  stamp="$cache/aura/$slug/$plat/current"
  if [[ -n "${AURA_OFFLINE:-}" ]]; then
    if [[ -f "$stamp" ]]; then
      sha="$(tr -d '[:space:]' < "$stamp")"
      slot="$cache/aura/$slug/$plat/$sha"
      if [[ "$execute" == 1 ]]; then
        if use_cached_slot "$slot" "offline"; then
          return 0
        fi
      elif bin="$(aura_bin_in "$slot")" && [[ -f "$slot/BUILD-INFO" ]]; then
        AURA_READY_FROM="offline"
        printf '%s\n' "$bin"
        return 0
      fi
    fi
    echo "AURA_OFFLINE=1 and there is no cached Aura ${slug} for ${os}/${arch}." >&2
    echo "Expected it under ${cache}." >&2
    echo "Run ./run.sh once while online, or set AURA_BIN." >&2
    return 1
  fi

  local asset_out
  asset_out="$(mktemp)"
  if ! resolve_asset "$os" "$arch" >"$asset_out"; then
    rm -f "$asset_out"
    return 1
  fi
  name="$(head -n 1 "$asset_out")"
  rm -f "$asset_out"
  if [[ "$name" == "CONTAINER" ]]; then
    if [[ -z "${AURA_CONTAINER_BIN:-}" || ! -x "$AURA_CONTAINER_BIN" ]]; then
      echo "Could not prepare the Aura docker wrapper." >&2
      return 1
    fi
    echo "Aura image ghcr.io/cybrid-systems/aura:$(aura_version_slug)  docker" >&2
    if ! verify_running_version "$AURA_CONTAINER_BIN"; then
      return 1
    fi
    AURA_READY_FROM="docker"
    printf '%s\n' "$AURA_CONTAINER_BIN"
    return 0
  fi
  if [[ -z "$name" || -z "${AURA_SHA_FILE:-}" || ! -f "$AURA_SHA_FILE" ]]; then
    echo "Could not choose an Aura asset for ${os}/${arch}." >&2
    return 1
  fi
  sha="$(awk 'NF { print $1; exit }' "$AURA_SHA_FILE")"
  if [[ -z "$sha" ]]; then
    echo "The Aura release published an empty checksum for ${name}." >&2
    rm -f "$AURA_SHA_FILE"
    return 1
  fi
  slot="$cache/aura/$slug/$plat/$sha"
  if [[ -z "${AURA_FORCE_TOOLS:-}" && -d "$slot" ]]; then
    if [[ "$execute" == 1 ]]; then
      if use_cached_slot "$slot" "cache"; then
        printf '%s\n' "$sha" > "$stamp"
        rm -f "$AURA_SHA_FILE"
        return 0
      fi
    elif bin="$(aura_bin_in "$slot")" && [[ -f "$slot/BUILD-INFO" ]]; then
      AURA_READY_FROM="cache"
      printf '%s\n' "$sha" > "$stamp"
      rm -f "$AURA_SHA_FILE"
      printf '%s\n' "$bin"
      return 0
    fi
  fi

  local tmp archive
  tmp="$(mktemp -d)"
  archive="$tmp/$name"
  echo "downloading Aura ${slug} (${os}/${arch})…" >&2
  if ! fetch_to "$(aura_release_base)/$name" "$archive" progress; then
    rm -rf "$tmp"
    rm -f "$AURA_SHA_FILE"
    if [[ "${AURA_FETCH_KIND:-}" == "missing" ]]; then
      echo "The checksum was published but ${name} is missing from the release." >&2
    else
      network_error "$os" "$arch" "$cache"
    fi
    return 1
  fi
  if ! check_sha256 "$archive" "$AURA_SHA_FILE"; then
    rm -rf "$tmp"
    rm -f "$AURA_SHA_FILE"
    return 1
  fi
  rm -f "$AURA_SHA_FILE"
  bin="$(unpack_bundle "$archive" "$name" "$slot")" || {
    rm -rf "$tmp" "$slot"
    return 1
  }
  rm -rf "$tmp"
  mkdir -p "$(dirname "$stamp")"
  printf '%s\n' "$sha" > "$stamp"
  # Drop older checksums of this same version so the cache does not grow.
  local old
  for old in "$cache/aura/$slug/$plat"/*; do
    [[ "$old" == "$slot" || "$old" == "$stamp" ]] && continue
    [[ -d "$old" ]] && rm -rf "$old"
  done
  if [[ "$execute" == 1 ]]; then
    if ! verify_running_version "$bin"; then
      rm -rf "$slot"
      return 1
    fi
  elif [[ ! -f "$slot/BUILD-INFO" ]]; then
    echo "The Aura bundle is missing BUILD-INFO." >&2
    rm -rf "$slot"
    return 1
  fi
  AURA_READY_FROM="download"
  printf '%s\n' "$bin"
}

install_aura() {
  local root="${1:-.}"
  local os arch
  if [[ ! -d "$root" ]]; then
    echo "install dir does not exist: $root" >&2
    return 1
  fi
  os="$(aura_os)" || return 1
  arch="$(aura_arch)" || return 1
  ensure_bundle "$os" "$arch" 1
}

# Print one line ending in bin/aura, then BUILD-INFO, for a Linux arch
# this host does not execute.
inspect_aura_arch() {
  local arch="$1" bin slot info
  bin="$(AURA_OS=linux AURA_ARCH="$arch" ensure_bundle linux "$arch" 0)" || return 1
  slot="$(cd "$(dirname "$bin")/.." && pwd)"
  info="$slot/BUILD-INFO"
  if [[ ! -f "$info" ]]; then
    echo "nightly ${arch} bundle is missing BUILD-INFO" >&2
    return 1
  fi
  printf '%s\n' "bin/aura"
  cat "$info"
}
