#!/usr/bin/env bash
# Zip the release dist deterministically and write its SHA-256 next to it in qa/reports/.
# scripts/zip.mjs (sorted entries, fixed mtime) replaces `zip`, which Git Bash on Windows lacks.
set -euo pipefail
QA="$(cd "$(dirname "$0")/.." && { pwd -W 2>/dev/null || pwd; })"; DIST="${1:-$QA/.out/dist}"; VER="${2:-0.1.0}"
OUT="$QA/reports/howtogo-web-$VER-dist.zip"
rm -f "$OUT"
node "$QA/scripts/zip.mjs" "$DIST" "$OUT" >/dev/null
(cd "$QA/reports" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")
echo "artifact: $(cat "$OUT.sha256")"
