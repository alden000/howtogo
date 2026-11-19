#!/usr/bin/env bash
# M6 AC 31: sign an UNSIGNED release APK on the key holder's machine: zipalign + apksigner sign + verify.
# Usage: scripts/android/sign-release.sh <unsigned.apk> [out.apk]
# Reads HOWTOGO_KEYSTORE / HOWTOGO_KEYSTORE_PASSWORD / HOWTOGO_KEY_ALIAS / HOWTOGO_KEY_PASSWORD from the environment
# (e.g. `set -a; . ~/keys/howtogo-release.txt; set +a`), never from files in the repo. Linux and Windows (Git Bash).
set -euo pipefail
. "$(cd "$(dirname "$0")" && pwd)/sdk-tools.sh"
in="$1"; out="${2:-${in%-unsigned.apk}-signed.apk}"
: "${HOWTOGO_KEYSTORE:?}" "${HOWTOGO_KEYSTORE_PASSWORD:?}" "${HOWTOGO_KEY_ALIAS:?}"
export HOWTOGO_KEY_PASSWORD="${HOWTOGO_KEY_PASSWORD:-$HOWTOGO_KEYSTORE_PASSWORD}"
tmp="$(mktemp --suffix=.apk)"
"$ZIPALIGN" -f -P 16 4 "$(native_path "$in")" "$(native_path "$tmp")"
"$APKSIGNER" sign --ks "$(native_path "$HOWTOGO_KEYSTORE")" --ks-key-alias "$HOWTOGO_KEY_ALIAS" \
  --ks-pass env:HOWTOGO_KEYSTORE_PASSWORD --key-pass env:HOWTOGO_KEY_PASSWORD \
  --out "$(native_path "$out")" "$(native_path "$tmp")"
rm -f "$tmp"
"$APKSIGNER" verify --print-certs "$(native_path "$out")" | grep -E "Signer #1 certificate (DN|SHA-256)"
sha256sum "$out"
