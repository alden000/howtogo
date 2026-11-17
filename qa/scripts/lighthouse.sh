#!/usr/bin/env bash
# Lighthouse (mobile) on the release build: a11y ≥ 95, perf ≥ 80, best-practices reported.
# Lighthouse ≥ 12 has no PWA category → installability is covered by tests/pwa.spec.ts (Chrome's own verdict).
set -uo pipefail
QA="$(cd "$(dirname "$0")/.." && pwd)"; PORT=4176; OUT="$QA/.out/lighthouse"; mkdir -p "$OUT"
export CHROME_PATH="${CHROME_PATH:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1)}"
(cd "$QA/../src/web" && exec npx vite preview --outDir "$QA/.out/dist" --port $PORT --strictPort >/dev/null 2>&1) & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.5; done
rc=0; summary=()
for path in "/?demo=1" "/about?demo=1" "/settings?demo=1"; do
  name=$(echo "$path" | tr -c 'a-z0-9' '_' | sed 's/^_*//;s/_*$//'); [ -z "$name" ] && name=home
  npx --prefix "$QA" lighthouse "http://localhost:$PORT$path" --quiet --chrome-flags="--headless=new --no-sandbox" \
    --only-categories=performance,accessibility,best-practices --form-factor=mobile \
    --output=json --output=html --output-path="$OUT/$name" >/dev/null 2>&1 || { echo "lighthouse: run failed for $path"; rc=1; continue; }
  line=$(node -e "const r=require('$OUT/$name.report.json');const s=k=>Math.round(r.categories[k].score*100);const p=s('performance'),a=s('accessibility'),b=s('best-practices');console.log(\`\${'$path'} perf=\${p} a11y=\${a} bp=\${b}\`+(p<80||a<95?' FAIL':''))")
  summary+=("$line"); [[ "$line" == *FAIL ]] && rc=1
done
printf 'lighthouse: %s\n' "${summary[@]}"
exit $rc
