#!/usr/bin/env bash
# M6 release gate for a SIGNED APK (AC 3, 28, 33, 34, 37 + AC 1 asset rules). Linux and Windows (Git Bash).
# Usage (repo root): scripts/android/verify-release.sh [app-release.apk]
#   default APK: src/android/android/app/build/outputs/apk/release/app-release.apk
#   HOTFIX_N=1..9 when verifying a hotfix rebuild (expected versionCode N+hotfix).
# Checks: apksigner (v2+, one signer, cert SHA-256 == src/android/release-cert.sha256); zipalign -c -P 16;
# aapt2 badging (appId, versionName = web version, versionCode per AC 33 and above release-history.json,
# minSdk 24, target 36, label 怎么去); manifest allow-list + release flags (check-manifest.mjs); no sw.js /
# spike harness in assets; JVM unit test results (if present); size ≤ 12 MB. Writes <apk>.sha256.
set -uo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
. "$root/scripts/android/sdk-tools.sh" || exit 1
apk="${1:-$root/src/android/android/app/build/outputs/apk/release/app-release.apk}"
appId=com.wwweeeiii.howtogo
[ -f "$apk" ] || { echo "no APK at $apk" >&2; exit 1; }
napk="$(native_path "$apk")"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; fails=$((fails + 1)); }

# 1. signature (AC 34)
"$APKSIGNER" verify -v --print-certs "$napk" >"$tmp/sig.txt" 2>&1 || fail "apksigner verify exited non-zero"
want="$(tr -d ' :\r\n' <"$root/src/android/release-cert.sha256" | tr 'A-F' 'a-f')"
got="$(sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$tmp/sig.txt" | tr -d '\r' | tr 'A-F' 'a-f')"
signers="$(sed -n 's/^Number of signers: //p' "$tmp/sig.txt" | tr -d '\r')"
schemes="$(grep -E '^Verified using v[0-9.]+ scheme .*: true' "$tmp/sig.txt" | sed -E 's/^Verified using (v[0-9.]+) .*/\1/' | tr '\n' ' ')"
if grep -qE '^Verified using v(2|3|3\.1|4) scheme .*: true' "$tmp/sig.txt"; then pass "signature schemes: $schemes"; else fail "no v2+ signature (schemes: ${schemes:-none})"; fi
[ "$signers" = 1 ] && pass "signers: 1" || fail "signers: ${signers:-?} (want 1)"
[ -n "$got" ] && [ "$got" = "$want" ] && pass "cert SHA-256 $got == release-cert.sha256" || fail "cert SHA-256 ${got:-?} != release-cert.sha256 $want"
grep -E '^Signer #1 certificate DN' "$tmp/sig.txt" | tr -d '\r' | sed 's/^/     /'

# 2. 16 KB page alignment (AC 3)
if "$ZIPALIGN" -c -P 16 -v 4 "$napk" >"$tmp/zip.txt" 2>&1; then pass "zipalign -c -P 16 -v 4: $(tail -1 "$tmp/zip.txt" | tr -d '\r')"; else fail "zipalign -P 16: $(grep -v OK "$tmp/zip.txt" | head -3 | tr -d '\r')"; fi

# 3. badging (AC 2, 3, 33)
"$AAPT2" dump badging "$napk" >"$tmp/badging.txt" 2>&1 || fail "aapt2 dump badging failed"
web="$(node -p "require('$(native_path "$root/src/web/package.json" | sed 's/\\/\\\\/g')').version")"
code="$(node -e "const [a,b,c]=process.argv[1].split('.').map(x=>parseInt(x,10));console.log((a*10000+b*100+c)*100+Number(process.env.HOTFIX_N||0))" "$web")"
line1="$(head -1 "$tmp/badging.txt" | tr -d '\r')"
for kv in "name='$appId'" "versionCode='$code'" "versionName='$web'"; do
  case "$line1" in *"$kv"*) pass "package $kv" ;; *) fail "package: want $kv, got: $line1" ;; esac
done
grep -qE "^(min)?[sS]dkVersion:'24'" "$tmp/badging.txt" && pass "minSdk 24" || fail "minSdk: $(grep -E '^(min)?[sS]dkVersion' "$tmp/badging.txt")"
grep -q "^targetSdkVersion:'36'" "$tmp/badging.txt" && pass "targetSdk 36" || fail "targetSdk: $(grep '^targetSdkVersion' "$tmp/badging.txt")"
grep -q "compileSdkVersion='36'" "$tmp/badging.txt" && pass "compileSdk 36" || fail "compileSdk not 36"
grep -q "^application-label:'怎么去'" "$tmp/badging.txt" && pass "label 怎么去" || fail "label: $(grep '^application-label:' "$tmp/badging.txt")"
hist="$(native_path "$root/src/android/release-history.json" | sed 's/\\/\\\\/g')"
apksha="$(sha256sum "$apk" | cut -d' ' -f1)"
# Above every release, or THIS very APK already staged as the last entry (stage-apk.mjs; re-verify is fine).
if node -e "const h=require('$hist');const r=h.releases||[];const l=r[r.length-1];if(l&&l.versionCode===$code&&l.sha256==='$apksha')process.exit(0);const last=Math.max(h.minCode||0,...r.map(x=>x.versionCode));process.exit($code>last?0:1)"; then
  pass "versionCode $code > last release/minCode in release-history.json (or this APK is the staged last entry)"
else fail "versionCode $code not above release-history.json"; fi

# 4. manifest allow-list + release flags (AC 28, 37)
"$AAPT2" dump xmltree --file AndroidManifest.xml "$napk" >"$tmp/manifest.txt" 2>&1
if node "$(native_path "$root/scripts/android/check-manifest.mjs")" "$(native_path "$tmp/manifest.txt")" "$appId" >"$tmp/man.out"; then
  pass "manifest allow-list"; else fail "manifest allow-list"; fi
tr -d '\r' <"$tmp/man.out"

# 5. assets (AC 1, 4): no service worker, no spike harness; native libs listed
unzip -Z1 "$apk" >"$tmp/files.txt" 2>/dev/null || jar tf "$napk" >"$tmp/files.txt"
bad="$(grep -E '^assets/public/(sw\.js|spike\.html)$|spike' "$tmp/files.txt" | tr '\n' ' ')"
[ -z "$bad" ] && pass "no sw.js / spike harness in assets" || fail "unexpected assets: $bad"
grep -q '^assets/public/index.html$' "$tmp/files.txt" && pass "web build bundled (assets/public/index.html)" || fail "assets/public/index.html missing"
echo "     native libs: $(grep -c '\.so$' "$tmp/files.txt") .so files"

# 6. JVM unit tests (testReleaseUnitTest results from the build, if present)
tr="$root/src/android/android/app/build/test-results/testReleaseUnitTest"
if ls "$tr"/*.xml >/dev/null 2>&1; then
  t="$(cat "$tr"/*.xml | grep -o '<testsuite [^>]*' | sed -nE 's/.* tests="([0-9]+)".* failures="([0-9]+)".* errors="([0-9]+)".*/\1 \2 \3/p' | awk '{t+=$1;f+=$2+$3} END{print t, f}')"
  [ "${t#* }" = 0 ] && pass "JVM unit tests: ${t% *} run, 0 failed" || fail "JVM unit tests: $t (run, failed)"
else echo "SKIP JVM unit test results not found ($tr)"; fi

# 7. size (AC 3) + checksum
size="$(wc -c <"$apk" | tr -d ' ')"
[ "$size" -le $((12 * 1024 * 1024)) ] && pass "size $size B ($(awk "BEGIN{printf \"%.2f\", $size/1048576}") MiB) <= 12 MiB" || fail "size $size B > 12 MiB"
(cd "$(dirname "$apk")" && sha256sum "$(basename "$apk")" >"$(basename "$apk").sha256")
echo "     sha256 $(cut -d' ' -f1 "$apk.sha256")  ($apk.sha256)"

[ "$fails" = 0 ] && echo "verify-release: ALL PASS" || echo "verify-release: $fails FAILED"
exit $((fails > 0))
