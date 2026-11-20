#!/usr/bin/env bash
# First install from an empty .tools must print exactly one executable path.
# Fetch progress stays on stderr.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/aura-path.sh
source "$ROOT/scripts/aura-path.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/out"

echo "fresh install into $work (native $(uname -m))" >&2
export AURA_FORCE_TOOLS=1
out="$(install_aura "$work")"
lines="$(printf '%s\n' "$out" | grep -c .)"
if [[ "$lines" -ne 1 ]]; then
  echo "install stdout was $lines lines, expected 1:" >&2
  printf '%s\n' "$out" >&2
  exit 1
fi
case "$out" in
  *OK*|*tar.gz*|*ghcr*) echo "install stdout is polluted: $out" >&2; exit 1 ;;
esac
if [[ ! -x "$out" ]]; then
  echo "not executable: $out" >&2
  exit 1
fi
ver="$("$out" --version 2>/dev/null || true)"
case "$ver" in
  *nightly*) ;;
  *) echo "unexpected version: $ver" >&2; exit 1 ;;
esac

echo "second call is idempotent" >&2
unset AURA_FORCE_TOOLS
out2="$(install_aura "$work")"
if [[ "$out" != "$out2" ]]; then
  echo "second path differs: $out2" >&2
  exit 1
fi

# The other architecture's nightly bundle is checked for layout.
# This host does not execute it.
host="$(uname -m)"
case "$host" in
  x86_64) other="arm64" ;;
  aarch64|arm64) other="x86_64" ;;
  *) echo "skip cross-arch layout check on $host" >&2; other="" ;;
esac
if [[ -n "$other" ]]; then
  echo "checking ${other} nightly bundle (not executed)" >&2
  listing="$(inspect_aura_arch "$other")"
  if ! printf '%s\n' "$listing" | grep -q 'bin/aura$'; then
    echo "${other} bundle has no bin/aura" >&2
    printf '%s\n' "$listing" >&2
    exit 1
  fi
  if ! printf '%s\n' "$listing" | grep -q "nightly"; then
    echo "${other} bundle is not the nightly release" >&2
    printf '%s\n' "$listing" >&2
    exit 1
  fi
fi

echo "offline reuses the cache and does not touch the network" >&2
out3="$(AURA_OFFLINE=1 AURA_DOWNLOAD_BASE="http://127.0.0.1:9" install_aura "$work")"
if [[ "$out" != "$out3" ]]; then
  echo "offline path differs: $out3" >&2
  exit 1
fi

echo "offline with an empty cache fails clearly" >&2
empty="$(mktemp -d)"
set +e
offline_err="$(AURA_OFFLINE=1 AURA_CACHE_DIR="$empty" install_aura "$work" 2>&1)"
offline_rc=$?
set -e
rm -rf "$empty"
if [[ "$offline_rc" -eq 0 ]]; then
  echo "offline miss should have failed" >&2
  exit 1
fi
if ! printf '%s\n' "$offline_err" | grep -q "AURA_OFFLINE=1"; then
  echo "offline miss was not actionable:" >&2
  printf '%s\n' "$offline_err" >&2
  exit 1
fi

echo "checksum mismatch is rejected" >&2
sumdir="$(mktemp -d)"
printf 'hello\n' > "$sumdir/file"
printf 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  file\n' > "$sumdir/sum"
if check_sha256 "$sumdir/file" "$sumdir/sum" 2>/dev/null; then
  echo "bad checksum was accepted" >&2
  exit 1
fi
sha256sum "$sumdir/file" > "$sumdir/good"
if ! check_sha256 "$sumdir/file" "$sumdir/good"; then
  echo "good checksum was rejected" >&2
  exit 1
fi
rm -rf "$sumdir"

echo "a 403 from the release API still reaches the container fallback" >&2
(
  cache403="$(mktemp -d)"
  container_fallback_ok() { return 0; }
  fetch_to() {
    AURA_FETCH_CODE=403
    AURA_FETCH_KIND=network
    return 1
  }
  got403="$(AURA_CACHE_DIR="$cache403" pick_asset_from_api darwin arm64 2>"$cache403/err")" || {
    echo "403 path did not fall back to the image:" >&2
    cat "$cache403/err" >&2
    exit 1
  }
  if [[ "$got403" != "CONTAINER" ]]; then
    echo "403 path returned [$got403], wanted CONTAINER" >&2
    exit 1
  fi
  if [[ ! -x "$cache403/aura/nightly/container/aura" ]]; then
    echo "403 path did not write the docker wrapper" >&2
    exit 1
  fi
  if ! grep -q "ghcr.io/cybrid-systems/aura:nightly" "$cache403/aura/nightly/container/aura"; then
    echo "wrapper does not name the nightly image" >&2
    exit 1
  fi
  if ! grep -q "AURA_RUNNER_BIND=0.0.0.0" "$cache403/aura/nightly/container/aura"; then
    echo "wrapper does not publish the Aura port inside the container" >&2
    exit 1
  fi
  rm -rf "$cache403"
)

echo "unsupported platform names the release assets" >&2
set +e
plat_err="$(AURA_OS=darwin AURA_ARCH=arm64 AURA_NO_DOCKER=1 install_aura "$work" 2>&1)"
plat_rc=$?
set -e
if [[ "$plat_rc" -eq 0 ]]; then
  echo "darwin/arm64 should not install from this release" >&2
  exit 1
fi
if ! printf '%s\n' "$plat_err" | grep -q "darwin/arm64"; then
  echo "platform error did not name darwin/arm64:" >&2
  printf '%s\n' "$plat_err" >&2
  exit 1
fi
if ! printf '%s\n' "$plat_err" | grep -q "AURA_BIN"; then
  echo "platform error did not mention AURA_BIN:" >&2
  printf '%s\n' "$plat_err" >&2
  exit 1
fi
if ! printf '%s\n' "$plat_err" | grep -q "OrbStack"; then
  echo "platform error did not tell a Mac what to install:" >&2
  printf '%s\n' "$plat_err" >&2
  exit 1
fi
if ! printf '%s\n' "$plat_err" | grep -q "does not compile"; then
  echo "platform error did not say compilation is skipped:" >&2
  printf '%s\n' "$plat_err" >&2
  exit 1
fi

echo "pinned version names the v0.2.7 asset" >&2
if [[ "$(AURA_VERSION=v0.2.7 aura_tag)" != "v0.2.7" || "$(AURA_VERSION=0.2.7 aura_version_slug)" != "0.2.7" ]]; then
  echo "pin tag/slug mismatch" >&2
  exit 1
fi
pin_name="$(aura_asset_candidates 0.2.7 linux x86_64 | head -n 1)"
if [[ "$pin_name" != "aura-0.2.7-linux-x86_64.tar.gz" ]]; then
  echo "unexpected pin asset: $pin_name" >&2
  exit 1
fi
pin_sum="$(mktemp)"
if ! fetch_to "https://github.com/cybrid-systems/aura/releases/download/v0.2.7/${pin_name}.sha256" "$pin_sum"; then
  echo "v0.2.7 checksum was not published" >&2
  exit 1
fi
if [[ "$(awk 'NF { print $1; exit }' "$pin_sum" | wc -c)" -lt 64 ]]; then
  echo "v0.2.7 checksum is empty" >&2
  exit 1
fi
rm -f "$pin_sum"

echo "install check ok: $out"
