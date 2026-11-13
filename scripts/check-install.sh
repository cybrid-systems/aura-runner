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
  *"$AURA_COMMIT"*) ;;
  *) echo "unexpected version: $ver" >&2; exit 1 ;;
esac

echo "second call is idempotent" >&2
out2="$(install_aura "$work")"
if [[ "$out" != "$out2" ]]; then
  echo "second path differs: $out2" >&2
  exit 1
fi

# The other architecture's image is checked for layout and the pinned
# commit. This host does not execute it.
host="$(uname -m)"
case "$host" in
  x86_64) other="arm64" ;;
  aarch64|arm64) other="x86_64" ;;
  *) echo "skip cross-arch layout check on $host" >&2; other="" ;;
esac
if [[ -n "$other" ]]; then
  echo "checking ${other} image layout (not executed)" >&2
  listing="$(inspect_aura_arch "$other")"
  if ! printf '%s\n' "$listing" | grep -q 'bin/aura$'; then
    echo "${other} image has no bin/aura" >&2
    printf '%s\n' "$listing" >&2
    exit 1
  fi
  if ! printf '%s\n' "$listing" | grep -q "$AURA_COMMIT"; then
    echo "${other} image is not ${AURA_COMMIT}" >&2
    printf '%s\n' "$listing" >&2
    exit 1
  fi
fi

echo "install check ok: $out"
