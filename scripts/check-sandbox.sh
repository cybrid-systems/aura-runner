#!/usr/bin/env bash
# Play leaves the sandbox on. Preset dev can write the boot line.
# --deny write must not create a file. Path-scoped write:out/ is not
# available on this nightly, so this check does not pretend that it is.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if grep -q 'AURA_SANDBOX:-off' run.sh docker/entrypoint.sh; then
  echo "play still defaults the sandbox off" >&2
  exit 1
fi
if ! grep -q -- '--preset dev --grant network' run.sh docker/entrypoint.sh; then
  echo "play lost the dev network grant" >&2
  exit 1
fi
if grep -q 'AURA_SANDBOX=off' scripts/check-fallback.sh; then
  echo "the fallback play path still forces the sandbox off" >&2
  exit 1
fi

if ! command -v aura >/dev/null 2>&1; then
  echo "aura is not on PATH" >&2
  exit 1
fi

mkdir -p out
rm -f out/nope.txt out/sandbox-probe.txt out/sandbox-deny.txt out/sandbox-ok.txt
unset AURA_SANDBOX || true

set +e
aura --quiet --preset dev --deny write -e '(write-file "out/nope.txt" "x")' >out/sandbox-deny.txt 2>&1
set -e
if [[ -f out/nope.txt ]]; then
  echo "deny write still created out/nope.txt" >&2
  cat out/sandbox-deny.txt >&2 || true
  exit 1
fi

unset AURA_SANDBOX || true
aura --quiet --preset dev --grant network -e '(begin (make-directory "out") (write-file "out/sandbox-probe.txt" "ok") (display "wrote\n"))' >out/sandbox-ok.txt 2>&1
if ! grep -q '^ok$' out/sandbox-probe.txt; then
  echo "preset dev could not write out/sandbox-probe.txt" >&2
  cat out/sandbox-ok.txt >&2 || true
  exit 1
fi
# The unrestricted line is the debug escape. Normal play does not print it.
if grep -q 'sandbox=off' out/sandbox-ok.txt; then
  echo "an unset sandbox still ran as off" >&2
  cat out/sandbox-ok.txt >&2 || true
  exit 1
fi
rm -f out/nope.txt out/sandbox-probe.txt out/sandbox-deny.txt out/sandbox-ok.txt
echo "sandbox on"
