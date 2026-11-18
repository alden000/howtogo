#!/usr/bin/env bash
# Lighthouse (mobile preset: simulated slow 4G, 4× CPU) on the release build: median of 3 runs per URL (QA-20).
# M5 AC 1 thresholds (medians): performance ≥ 90, accessibility ≥ 95, best practices ≥ 90, SEO ≥ 90.
# AC 2 metrics are printed per URL (median LCP, TBT, CLS) and judged: LCP ≤ 2500 ms and TBT ≤ 200 ms on `/`,
# CLS ≤ 0.05 everywhere.
# URLs: LH_PATHS (space-separated) overrides the default list. Family page `/t/...` is judged without SEO: it is
# noindex by design (M4 AC 17), which Lighthouse's SEO category always marks down (Director ruling pending).
# /privacy and /route (fixture route list) join the default list in the M5 UI round (they need the new page /
# a seeded plan).
# Lighthouse ≥ 12 has no PWA category → installability is covered by tests/pwa.spec.ts (Chrome's own verdict).
set -uo pipefail
QA="$(cd "$(dirname "$0")/.." && { pwd -W 2>/dev/null || pwd; })"; PORT=${LH_PORT:-4186}; OUT="$QA/.out/lighthouse"; mkdir -p "$OUT"
DIST="${LH_DIST:-$QA/.out/dist}"
CP="${CHROME_PATH:-$(ls -d /opt/pw-browsers/chromium-*/chrome-linux*/chrome 2>/dev/null | head -1)}"
if [ -n "$CP" ]; then export CHROME_PATH="$CP"; else unset CHROME_PATH; fi # Windows: chrome-launcher finds installed Chrome
(cd "$QA/../src/web" && exec npx vite preview --outDir "$DIST" --port $PORT --strictPort >/dev/null 2>&1) & SRV=$!
# Kill the whole tree on exit: on Windows `kill` of the msys pid leaves the npx → node vite child orphaned.
trap 'kill $SRV 2>/dev/null; bash "$QA/scripts/free-ports.sh" $PORT >/dev/null' EXIT
for i in $(seq 1 30); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.5; done
# QA-20 (Director ruling): host noise can swing perf by ±10, so each URL is run RUNS times (default 3)
# and the gate judges the MEDIAN of each category. Every run's scores are printed for the record.
RUNS="${LH_RUNS:-3}"
PATHS="${LH_PATHS:-/?demo=1 /about?demo=1 /settings?demo=1 /privacy?demo=1 /t/LhFixture0001?demo=1}"
rc=0; summary=()
for path in $PATHS; do
  name=$(echo "$path" | tr -c 'a-zA-Z0-9' '_' | sed 's/^_*//;s/_*$//'); [ -z "$name" ] && name=home
  reports=()
  for n in $(seq 1 "$RUNS"); do
    npx --prefix "$QA" lighthouse "http://localhost:$PORT$path" --quiet --chrome-flags="--headless=new --no-sandbox" \
      --only-categories=performance,accessibility,best-practices,seo --form-factor=mobile \
      --output=json --output=html --output-path="$OUT/$name-$n" >/dev/null 2>&1 && reports+=("$OUT/$name-$n.report.json")
  done
  [ ${#reports[@]} -eq 0 ] && { echo "lighthouse: run failed for $path"; rc=1; continue; }
  line=$(node -e "
    const path=process.argv[1], runs=+process.argv[2], rs=process.argv.slice(3).map(f=>require(f));
    const med=a=>a.slice().sort((x,y)=>x-y)[(a.length-1)>>1];
    const cat=k=>{const v=rs.map(r=>Math.round(r.categories[k].score*100));return [med(v),v];};
    const [p,pv]=cat('performance'),[a,av]=cat('accessibility'),[b,bv]=cat('best-practices'),[s,sv]=cat('seo');
    const m=id=>med(rs.map(r=>r.audits[id].numericValue));
    const lcp=Math.round(m('largest-contentful-paint')),tbt=Math.round(m('total-blocking-time')),cls=+m('cumulative-layout-shift').toFixed(3);
    const family=/^\/t\//.test(path), home=/^\/(\?|$)/.test(path);
    const fails=[];
    if(p<90)fails.push('perf');if(a<95)fails.push('a11y');if(b<90)fails.push('bp');if(!family&&s<90)fails.push('seo');
    if(cls>0.05)fails.push('cls');if(home&&lcp>2500)fails.push('lcp');if(home&&tbt>200)fails.push('tbt');
    if(rs.length!==runs)fails.push('runs');
    console.log(path+' perf='+p+' a11y='+a+' bp='+b+' seo='+s+(family?' (seo not judged)':'')+' lcp='+lcp+'ms tbt='+tbt+'ms cls='+cls+
      ' (median of '+rs.length+': perf '+pv.join('/')+', a11y '+av.join('/')+', bp '+bv.join('/')+', seo '+sv.join('/')+')'+(fails.length?' FAIL '+fails.join(','):''));
  " "$path" "$RUNS" "${reports[@]}")
  summary+=("$line"); [[ "$line" == *FAIL* ]] && rc=1
done
printf 'lighthouse: %s\n' "${summary[@]}"
exit $rc
