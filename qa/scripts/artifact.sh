#!/usr/bin/env bash
# Zip the release dist deterministically and write its SHA-256 next to it in qa/reports/.
set -euo pipefail
QA="$(cd "$(dirname "$0")/.." && pwd)"; DIST="${1:-$QA/.out/dist}"; VER="${2:-0.1.0}"
OUT="$QA/reports/howtogo-web-$VER-dist.zip"
rm -f "$OUT"
(cd "$DIST" && find . -type f | LC_ALL=C sort | TZ=UTC xargs touch -t 202611170000 && find . -type f | LC_ALL=C sort | zip -X -q -@ "$OUT")
(cd "$QA/reports" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")
echo "artifact: $(cat "$OUT.sha256")"
