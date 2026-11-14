# Resolve the Aura nightly binary. The only stdout is the executable path.
# Progress goes to stderr so command substitution stays clean.
#
# Nightly is the rolling build from Aura main:
#   https://github.com/cybrid-systems/aura/releases/download/nightly/
# A cached copy is reused while its checksum matches that release. Set
# AURA_FORCE_TOOLS=1 to download again. AURA_DOWNLOAD_BASE replaces the
# release URL (tests, mirrors).

AURA_CHANNEL="nightly"
AURA_RELEASE_BASE="${AURA_DOWNLOAD_BASE:-https://github.com/cybrid-systems/aura/releases/download/nightly}"

aura_arch() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64) printf '%s\n' x86_64 ;;
    aarch64|arm64) printf '%s\n' arm64 ;;
    *) echo "unsupported architecture: $arch" >&2; return 1 ;;
  esac
}

aura_bundle_name() {
  printf 'aura-%s-linux-%s.tar.gz\n' "$AURA_CHANNEL" "$1"
}

fetch_url() {
  curl -fsSL --retry 3 --max-time 180 "$1" -o "$2"
}

check_sha256() {
  local file="$1"
  local sumfile="$2"
  local want got
  want="$(awk 'NF { print $1; exit }' "$sumfile")"
  if [[ -z "$want" ]]; then
    echo "empty checksum from the nightly release" >&2
    return 1
  fi
  if command -v sha256sum >/dev/null 2>&1; then
    got="$(sha256sum "$file" | awk '{ print $1 }')"
  else
    got="$(shasum -a 256 "$file" | awk '{ print $1 }')"
  fi
  if [[ "$want" != "$got" ]]; then
    echo "sha256 mismatch for $(basename "$file")" >&2
    return 1
  fi
}

# Print one line ending in bin/aura, then the bundle BUILD-INFO.
# Used to check the other architecture without executing it.
inspect_aura_arch() {
  local arch="$1"
  local name tmp bin info
  name="$(aura_bundle_name "$arch")"
  tmp="$(mktemp -d)"
  if ! fetch_url "$AURA_RELEASE_BASE/$name.sha256" "$tmp/sum"; then
    echo "could not read nightly checksum for $arch" >&2
    rm -rf "$tmp"
    return 1
  fi
  if ! fetch_url "$AURA_RELEASE_BASE/$name" "$tmp/$name"; then
    echo "could not download nightly bundle for $arch" >&2
    rm -rf "$tmp"
    return 1
  fi
  if ! check_sha256 "$tmp/$name" "$tmp/sum"; then
    rm -rf "$tmp"
    return 1
  fi
  bin="$(tar -tzf "$tmp/$name" | awk '/(^|\/)bin\/aura$/ { print; exit }')"
  info="$(tar -tzf "$tmp/$name" | awk '/(^|\/)BUILD-INFO$/ { print; exit }')"
  if [[ -z "$bin" || -z "$info" ]]; then
    echo "nightly ${arch} bundle is missing bin/aura or BUILD-INFO" >&2
    rm -rf "$tmp"
    return 1
  fi
  printf '%s\n' "$bin"
  tar -xOf "$tmp/$name" "$info"
  rm -rf "$tmp"
}

install_aura() {
  local root="$1"
  local arch name sha dest stamp sumtmp tmp bundle got
  arch="$(aura_arch)" || return 1
  name="$(aura_bundle_name "$arch")"
  dest="$root/.tools/aura/bin/aura"
  stamp="$root/.tools/aura-src/NIGHTLY-SHA"
  sumtmp="$(mktemp)"
  if ! fetch_url "$AURA_RELEASE_BASE/$name.sha256" "$sumtmp"; then
    echo "could not read the Aura nightly checksum" >&2
    rm -f "$sumtmp"
    return 1
  fi
  sha="$(awk 'NF { print $1; exit }' "$sumtmp")"
  if [[ -z "${AURA_FORCE_TOOLS:-}" && -n "$sha" && -x "$dest" && -f "$stamp" && "$(cat "$stamp")" == "$sha" ]]; then
    rm -f "$sumtmp"
    printf '%s\n' "$dest"
    return 0
  fi

  echo "installing Aura nightly (${arch})" >&2
  tmp="$(mktemp -d)"
  if ! fetch_url "$AURA_RELEASE_BASE/$name" "$tmp/$name"; then
    echo "Aura nightly download failed" >&2
    rm -rf "$tmp"
    rm -f "$sumtmp"
    return 1
  fi
  if ! check_sha256 "$tmp/$name" "$sumtmp"; then
    rm -rf "$tmp"
    rm -f "$sumtmp"
    return 1
  fi
  rm -f "$sumtmp"
  tar -xzf "$tmp/$name" -C "$tmp"
  bundle="$tmp/${name%.tar.gz}"
  if [[ ! -f "$bundle/bin/aura" ]]; then
    echo "nightly bundle did not contain bin/aura" >&2
    rm -rf "$tmp"
    return 1
  fi
  chmod +x "$bundle/bin/aura" || true
  mkdir -p "$root/.tools"
  rm -rf "$root/.tools/aura-src" "$root/.tools/aura"
  if ! mv "$bundle" "$root/.tools/aura-src"; then
    echo "could not place the nightly bundle" >&2
    rm -rf "$tmp"
    return 1
  fi
  if ! ln -s "$root/.tools/aura-src" "$root/.tools/aura"; then
    echo "could not link the nightly bundle" >&2
    rm -rf "$tmp"
    return 1
  fi
  printf '%s\n' "$sha" > "$root/.tools/aura-src/NIGHTLY-SHA"
  rm -rf "$tmp"
  if [[ ! -x "$dest" ]]; then
    echo "install did not produce an executable at $dest" >&2
    return 1
  fi
  got="$("$dest" --version 2>/dev/null || true)"
  case "$got" in
    *nightly*) ;;
    *)
      echo "unexpected Aura version: $got" >&2
      return 1
      ;;
  esac
  echo "Aura ready: $dest" >&2
  echo "$got" >&2
  printf '%s\n' "$dest"
}
