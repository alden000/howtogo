#!/usr/bin/env bash
# Lighthouse (mobile) on the release build: median of 3 runs per URL (QA-20); a11y ≥ 95, perf ≥ 80, best-practices reported.
# Lighthouse ≥ 12 has no PWA category → installability is covered by tests/pwa.spec.ts (Chrome's own verdict).
set -uo pipefail
QA="$(cd "$(dirname "$0")/.." && { pwd -W 2>/dev/null || pwd; })"; PORT=${LH_PORT:-4186}; OUT="$QA/.out/lighthouse"; mkdir -p "$OUT"
CP="${CHROME_PATH:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1)}"
if [ -n "$CP" ]; then export CHROME_PATH="$CP"; else unset CHROME_PATH; fi # Windows: chrome-launcher finds installed Chrome
(cd "$QA/../src/web" && exec npx vite preview --outDir "$QA/.out/dist" --port $PORT --strictPort >/dev/null 2>&1) & SRV=$!
# Kill the whole tree on exit: on Windows `kill` of the msys pid leaves the npx → node vite child orphaned.
trap 'kill $SRV 2>/dev/null; bash "$QA/scripts/free-ports.sh" $PORT >/dev/null' EXIT
for i in $(seq 1 30); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.5; done
# QA-20 (Director ruling): host noise can swing perf by ±10, so each URL is run RUNS times (default 3)
# and the gate judges the MEDIAN of each category. Every run's scores are printed for the record.
RUNS="${LH_RUNS:-3}"
rc=0; summary=()
for path in "/?demo=1" "/about?demo=1" "/settings?demo=1"; do
  name=$(echo "$path" | tr -c 'a-z0-9' '_' | sed 's/^_*//;s/_*$//'); [ -z "$name" ] && name=home
  reports=()
  for n in $(seq 1 "$RUNS"); do
    npx --prefix "$QA" lighthouse "http://localhost:$PORT$path" --quiet --chrome-flags="--headless=new --no-sandbox" \
      --only-categories=performance,accessibility,best-practices --form-factor=mobile \
      --output=json --output=html --output-path="$OUT/$name-$n" >/dev/null 2>&1 && reports+=("$OUT/$name-$n.report.json")
  done
  [ ${#reports[@]} -eq 0 ] && { echo "lighthouse: run failed for $path"; rc=1; continue; }
  line=$(node -e "
    const rs=process.argv.slice(1).map(f=>require(f));
    const med=k=>{const v=rs.map(r=>Math.round(r.categories[k].score*100)).sort((a,b)=>a-b);return [v[(v.length-1)>>1],v];};
    const [p,pv]=med('performance'),[a,av]=med('accessibility'),[b,bv]=med('best-practices');
    const ok=rs.length===$RUNS;
    console.log(\`$path perf=\${p} a11y=\${a} bp=\${b} (median of \${rs.length}: perf \${pv.join('/')}, a11y \${av.join('/')}, bp \${bv.join('/')})\`+(p<80||a<95||!ok?' FAIL':''));
  " "${reports[@]}")
  summary+=("$line"); [[ "$line" == *FAIL ]] && rc=1
done
printf 'lighthouse: %s\n' "${summary[@]}"
exit $rc
