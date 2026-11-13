#!/usr/bin/env bash
# First install from an empty .tools must print exactly one executable path.
# sha256sum -c writes "tarball: OK" to stdout; that line must not leak.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=scripts/aura-path.sh
source "$ROOT/scripts/aura-path.sh"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/out"

echo "fresh install into $work (native $(uname -m))" >&2
export AURA_FORCE_TOOLS=1
out="$(install_aura "$work" 0.2.2)"
lines="$(printf '%s\n' "$out" | grep -c .)"
if [[ "$lines" -ne 1 ]]; then
  echo "install stdout was $lines lines, expected 1:" >&2
  printf '%s\n' "$out" >&2
  exit 1
fi
case "$out" in
  *OK*|*tar.gz*) echo "install stdout is polluted: $out" >&2; exit 1 ;;
esac
if [[ ! -x "$out" ]]; then
  echo "not executable: $out" >&2
  exit 1
fi
ver="$("$out" --version 2>/dev/null || true)"
case "$ver" in
  *0.2.2*) ;;
  *) echo "unexpected version: $ver" >&2; exit 1 ;;
esac

echo "second call is idempotent" >&2
out2="$(install_aura "$work" 0.2.2)"
if [[ "$out" != "$out2" ]]; then
  echo "second path differs: $out2" >&2
  exit 1
fi

# The other architecture's release is checked for layout only. This host
# cannot execute it.
host="$(uname -m)"
case "$host" in
  x86_64) other="arm64" ;;
  aarch64|arm64) other="x86_64" ;;
  *) echo "skip cross-arch layout check on $host" >&2; other="" ;;
esac
if [[ -n "$other" ]]; then
  tarball="aura-0.2.2-linux-${other}.tar.gz"
  url="https://github.com/cybrid-systems/aura/releases/download/v0.2.2/${tarball}"
  echo "checking ${other} release layout (not executed)" >&2
  curl -fsSL -o "$work/${tarball}" "$url"
  curl -fsSL -o "$work/${tarball}.sha256" "${url}.sha256"
  (cd "$work" && sha256sum -c "${tarball}.sha256") >&2
  listing="$(tar -tzf "$work/${tarball}")"
  if ! printf '%s\n' "$listing" | grep -q '/bin/aura$'; then
    echo "${other} tarball has no bin/aura" >&2
    exit 1
  fi
fi

echo "install check ok: $out"
