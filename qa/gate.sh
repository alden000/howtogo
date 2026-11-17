#!/usr/bin/env bash
# 怎么去? release gate (M1–M4). One command, terse output, PASS/FAIL summary. Logs: qa/.out/logs/.
#   qa/gate.sh            full gate
#   SKIP=lighthouse,qa-e2e qa/gate.sh   skip steps by name (reported as SKIP, gate cannot PASS)
# Read-only for src/: builds go to qa/.out/dist (A) and qa/.out/dist-b (B, for the SW update test);
# Playwright never updates snapshots (updateSnapshots: 'none').
set -uo pipefail
# `pwd -W` (Git Bash on Windows) gives D:/… paths that node and Playwright understand; elsewhere plain pwd.
wpwd() { pwd -W 2>/dev/null || pwd; }
QA="$(cd "$(dirname "$0")" && wpwd)"; ROOT="$(cd "$QA/.." && wpwd)"; WEB="$ROOT/src/web"
LOG="$QA/.out/logs"; mkdir -p "$LOG"
# No orphans: after every step and on exit (incl. Ctrl-C), kill whatever still listens on the QA-owned
# ports (4183 dev-e2e, 4184 qa-e2e, 4186 lighthouse, 18797 qa worker = wrangler/workerd).
QA_PORTS="4183 4184 4186 18797"
freeports() { bash "$QA/scripts/free-ports.sh" $QA_PORTS; }
trap 'freeports >/dev/null' EXIT
VER=$(node -p "require('$WEB/package.json').version")
declare -a NAMES=() RESULTS=() NOTES=()
skip() { [[ ",${SKIP:-}," == *",$1,"* ]]; }
step() { # step <name> <note-extractor> <cmd...>
  local name=$1 extract=$2; shift 2
  if skip "$name"; then NAMES+=("$name"); RESULTS+=(SKIP); NOTES+=("skipped"); printf '%-12s SKIP\n' "$name"; return; fi
  local t0=$SECONDS; "$@" >"$LOG/$name.log" 2>&1; local rc=$?
  freeports >>"$LOG/$name.log" 2>&1
  local note; note=$(eval "$extract" <"$LOG/$name.log" 2>/dev/null | tr '\n' ' ' | cut -c1-110)
  NAMES+=("$name"); RESULTS+=($([ $rc -eq 0 ] && echo PASS || echo FAIL)); NOTES+=("$note ($((SECONDS - t0))s)")
  printf '%-12s %s  %s\n' "$name" "${RESULTS[-1]}" "${NOTES[-1]}"
}
cd "$ROOT"
echo "== 怎么去? release gate $VER · $(git rev-parse --short HEAD) $(git diff --quiet -- src && echo clean || echo DIRTY-src) · $(date -u +%FT%TZ)"

deps() { npm ls --all >/dev/null && git diff --quiet -- package-lock.json && npm ls --prefix "$QA" >/dev/null && echo "lockfile in sync, tree complete"; }
step deps 'tail -1' deps
step typecheck 'grep -c "error TS" || true; echo "TS errors"' npm run typecheck
unit() { npm test; }
step unit "grep -E '^ +Tests ' | awk '{s+=\$2} END {print s \" tests (shared+web+worker)\"}'; grep -E 'failed' | head -2" unit
# AC 8: key parity test (+ `en: typeof zh` and typed t() keys are enforced by typecheck above).
i18n() { (cd "$WEB" && npx vitest run test/present.test.ts -t "AC 8"); }
step i18n "grep -E '^ +Tests ' | head -1" i18n
build() {
  (cd "$WEB" && npx vite build --logLevel warn --outDir "$QA/.out/dist" --emptyOutDir) &&
  (cd "$WEB" && VITE_FLAGS=qa-b npx vite build --logLevel warn --outDir "$QA/.out/dist-b" --emptyOutDir) &&
  node "$QA/scripts/size.mjs" "$QA/.out/dist"
}
step build 'grep -E "^size"' build
step static-pwa 'grep -E "static-pwa (ok|FAIL)" -A3 | head -4' node "$QA/scripts/static-pwa.mjs" "$QA/.out/dist"
# M2 AC 37: device APIs only via the Platform adapter (D-4).
step platform-api 'tail -3' node "$QA/scripts/platform-grep.mjs"
step secrets 'tail -n +1 | head -3' node "$QA/scripts/secret-scan.mjs" "$QA/.out/dist"
step dev-e2e "grep -E '^ +[0-9]+ (passed|failed|flaky|skipped)'" bash -c "cd '$WEB' && npx playwright test -c '$QA/playwright.dev.config.mjs'"
step qa-e2e "grep -E '^ +[0-9]+ (passed|failed|flaky|skipped)'" bash -c "cd '$QA' && npx playwright test"
# QA-20: Lighthouse judges the median of 3 runs per URL (LH_RUNS overrides).
step lighthouse 'grep -E "^lighthouse"' "$QA/scripts/lighthouse.sh"
step artifact 'grep artifact' "$QA/scripts/artifact.sh" "$QA/.out/dist" "$VER"

fail=0; for r in "${RESULTS[@]}"; do [ "$r" = PASS ] || fail=1; done
echo "== summary: $(printf '%s\n' "${RESULTS[@]}" | sort | uniq -c | awk '{printf "%s %s  ", $1, $2}')"
if [ $fail -eq 0 ]; then echo "GATE PASS"; else echo "GATE FAIL — failing steps: $(for i in "${!NAMES[@]}"; do [ "${RESULTS[$i]}" = PASS ] || printf '%s ' "${NAMES[$i]}"; done)— logs in qa/.out/logs/"; fi
exit $fail
