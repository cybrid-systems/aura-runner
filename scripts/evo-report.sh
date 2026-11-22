#!/usr/bin/env bash
# Build a local evolution report from a fixture log. Nothing is uploaded.
# The page must not contain an API key or a home-directory path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v aura >/dev/null 2>&1; then
  echo "aura is not on PATH" >&2
  exit 1
fi

mkdir -p out
rm -rf out/evo-report
rm -f out/evo-fixture.jsonl out/evo-fixture-gen.aura
# The fixture names an arm. It is not a key and not a home path.
cat > out/evo-fixture-gen.aura << 'EOF'
(require "std/evo" all:)
(evo:record! "tune" "KEEP" "fair" (hash "arm" "tune" "margin" 0.2) "" 0)
(display "recorded\n")
EOF

export AURA_EVO_LOG="out/evo-fixture.jsonl"
: > "$AURA_EVO_LOG"
# Recording mutates the log. The test job runs with the sandbox off.
# This script is not play, so the escape is allowed for the fixture only.
AURA_SANDBOX=off aura --quiet --preset dev --grant network out/evo-fixture-gen.aura >out/evo-fixture.out 2>&1
if ! grep -q recorded out/evo-fixture.out; then
  echo "fixture record did not land" >&2
  cat out/evo-fixture.out >&2 || true
  exit 1
fi

aura evo report --html out/evo-report >out/evo-report.out 2>&1
html="$(find out/evo-report -name '*.html' -print -quit)"
if [[ -z "$html" ]]; then
  echo "evo report wrote no html" >&2
  cat out/evo-report.out >&2 || true
  exit 1
fi
# The tool may print the log's absolute path. The page the player can
# open keeps the relative path, so a home directory is not in the file.
python3 - "$html" "$ROOT" << 'PY'
import pathlib, sys
page, root = pathlib.Path(sys.argv[1]), str(pathlib.Path(sys.argv[2]).resolve())
text = page.read_text(encoding="utf-8", errors="replace")
text = text.replace(root + "/", "")
text = text.replace(root, ".")
page.write_text(text, encoding="utf-8")
PY
if grep -E -q '/home/|sk-|api_key|DEEPSEEK|BEGIN OPENAI' "$html"; then
  echo "evo report contains a key or a home path" >&2
  exit 1
fi
rm -f out/evo-fixture-gen.aura out/evo-fixture.out out/evo-report.out
echo "evo report $html"
