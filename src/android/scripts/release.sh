#!/usr/bin/env bash
# M6 AC 1: web release build → cap sync → Gradle assembleRelease (+ JVM unit tests), host-contention rule D-9.
# Usage (repo root): npm run android:release          QA build instead: BUILD_TYPE=qa npm run android:release
# Signing (release): HOWTOGO_KEYSTORE, HOWTOGO_KEYSTORE_PASSWORD, HOWTOGO_KEY_ALIAS, HOWTOGO_KEY_PASSWORD in the
# environment, or src/android/android/keystore.properties (gitignored). Without them the release APK is unsigned.
# Linux and Windows (Git Bash): on Windows the Gradle wrapper (gradlew.bat) is used and nested npm scripts run in bash.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
root="$(cd "$here/../.." && pwd)"
type="${BUILD_TYPE:-release}"
Type="$(tr '[:lower:]' '[:upper:]' <<<"${type:0:1}")${type:1}"

case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) windows=1 ;; *) windows=0 ;; esac
if [ "$windows" = 1 ]; then
  # npm 11 on Windows runs scripts with cmd; build:release uses `VAR= cmd`, so nested npm runs must use bash.
  export npm_config_script_shell="${npm_config_script_shell:-$(cygpath -w "$(command -v bash)")}"
fi

busy() { # true while QA's Playwright (test runner or its browsers) runs on this host
  if command -v pgrep >/dev/null 2>&1; then
    pgrep -f "playwright|chromium" >/dev/null
  else # Windows (Git Bash has no pgrep): ask PowerShell; skip shells, whose command lines may only mention the words
    local n
    n="$(powershell.exe -NoProfile -NonInteractive -Command \
      "@(Get-CimInstance Win32_Process | Where-Object { \$_.ProcessId -ne \$PID -and \$_.Name -notmatch '^(bash|sh|powershell|pwsh|cmd)\.exe\$' -and \$_.CommandLine -match 'ms-playwright|node_modules[\\\\/]@?playwright' }).Count" \
      2>/dev/null | tr -d '\r ')"
    [ "${n:-0}" != 0 ]
  fi
}
wait_host() { # QA's Playwright shares this 4-CPU host: wait while it runs (poll 60 s, max 30 min)
  for _ in $(seq 1 30); do busy || return 0; echo "host busy (playwright) - waiting 60 s"; sleep 60; done
  echo "host still busy after 30 min" >&2; return 1
}

(cd "$root" && npm run build:release)
(cd "$here" && { [ -d node_modules ] || npm ci --no-audit --no-fund; } && node scripts/sync.mjs)
cd "$here/android"
if [ -n "${GRADLE:-}" ]; then :
elif [ "$windows" = 1 ]; then GRADLE=./gradlew.bat
elif command -v gradle >/dev/null 2>&1; then GRADLE=gradle
elif [ -x /opt/gradle/bin/gradle ]; then GRADLE=/opt/gradle/bin/gradle
else GRADLE=./gradlew
fi
wait_host
GRADLE_OPTS="${GRADLE_OPTS:--Xmx3g}" "$GRADLE" --no-daemon --max-workers=2 "test${Type}UnitTest" "assemble${Type}"
ls -l "app/build/outputs/apk/$type/"
