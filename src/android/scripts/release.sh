#!/usr/bin/env bash
# M6 AC 1: web release build → cap sync → Gradle assembleRelease (+ JVM unit tests), host-contention rule D-9.
# Usage (repo root): npm run android:release          QA build instead: BUILD_TYPE=qa npm run android:release
# Signing (release): HOWTOGO_KEYSTORE, HOWTOGO_KEYSTORE_PASSWORD, HOWTOGO_KEY_ALIAS, HOWTOGO_KEY_PASSWORD in the
# environment, or src/android/android/keystore.properties (gitignored). Without them the release APK is unsigned.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/../.." && pwd)"
type="${BUILD_TYPE:-release}"
Type="$(tr '[:lower:]' '[:upper:]' <<<"${type:0:1}")${type:1}"

wait_host() { # QA's Playwright shares this 4-CPU host: wait while it runs (poll 60 s, max 30 min)
  for _ in $(seq 1 30); do pgrep -f "playwright|chromium" >/dev/null || return 0; echo "host busy (playwright) - waiting 60 s"; sleep 60; done
  echo "host still busy after 30 min" >&2; return 1
}

(cd "$root" && npm run build:release)
(cd "$here" && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && node scripts/sync.mjs)
GRADLE="${GRADLE:-$(command -v gradle || echo /opt/gradle/bin/gradle)}"
wait_host
cd "$here/android"
GRADLE_OPTS="${GRADLE_OPTS:--Xmx3g}" "$GRADLE" --no-daemon --max-workers=2 "test${Type}UnitTest" "assemble${Type}"
ls -l "app/build/outputs/apk/$type/"
