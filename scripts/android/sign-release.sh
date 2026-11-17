#!/usr/bin/env bash
# M6 AC 31: sign an UNSIGNED release APK on the key holder's machine: zipalign + apksigner sign + verify.
# Usage: scripts/android/sign-release.sh <unsigned.apk> [out.apk]
# Reads HOWTOGO_KEYSTORE / HOWTOGO_KEYSTORE_PASSWORD / HOWTOGO_KEY_ALIAS / HOWTOGO_KEY_PASSWORD from the environment
# (e.g. `set -a; . ~/keys/howtogo-release.txt; set +a`), never from files in the repo.
set -euo pipefail
in="$1"; out="${2:-${in%-unsigned.apk}-signed.apk}"
bt="${ANDROID_BUILD_TOOLS:-$(ls -d "${ANDROID_HOME:-$HOME/android-sdk}"/build-tools/* | sort -V | tail -1)}"
: "${HOWTOGO_KEYSTORE:?}" "${HOWTOGO_KEYSTORE_PASSWORD:?}" "${HOWTOGO_KEY_ALIAS:?}"
tmp="$(mktemp --suffix=.apk)"
"$bt/zipalign" -f -P 16 4 "$in" "$tmp"
"$bt/apksigner" sign --ks "$HOWTOGO_KEYSTORE" --ks-key-alias "$HOWTOGO_KEY_ALIAS" \
  --ks-pass env:HOWTOGO_KEYSTORE_PASSWORD --key-pass env:HOWTOGO_KEY_PASSWORD --out "$out" "$tmp"
rm -f "$tmp"
"$bt/apksigner" verify --print-certs "$out" | grep -E "Signer #1 certificate (DN|SHA-256)"
sha256sum "$out"
