#!/usr/bin/env bash
# M6 AC 31 / D-11: create the release (upload) keystore ONCE, outside the repo. RSA 4096, 30 years.
# Usage: scripts/android/new-keystore.sh [/path/outside/repo/howtogo-release.jks]
# Writes the passwords to <jks>.txt (chmod 600) next to it. Keep two backups (password manager + offline copy):
# a lost key means every user must uninstall (and loses her places and contacts) to update.
set -euo pipefail
jks="${1:-$HOME/keys/howtogo-release.jks}"
txt="${jks%.jks}.txt"
alias="${HOWTOGO_KEY_ALIAS:-howtogo}"
case "$(cd "$(dirname "$jks")" 2>/dev/null && pwd || dirname "$jks")" in
  "$(git rev-parse --show-toplevel 2>/dev/null || echo /nonexistent)"*) echo "refusing: keystore must be outside the repo" >&2; exit 1 ;;
esac
[ -e "$jks" ] && { echo "refusing: $jks exists (the key is permanent; never overwrite it)" >&2; exit 1; }
umask 077
mkdir -p "$(dirname "$jks")"
pw="$(openssl rand -base64 30 | tr -d '/+=\n' | cut -c1-32)"
keytool -genkeypair -v -keystore "$jks" -storetype PKCS12 -alias "$alias" -keyalg RSA -keysize 4096 -validity 10950 \
  -storepass "$pw" -keypass "$pw" -dname "CN=HowToGo, O=wwweeeiii, C=SG" >/dev/null 2>&1
cat >"$txt" <<TXT
# 怎么去 Android release key (appId com.wwweeeiii.howtogo). KEEP SECRET. Two backups.
HOWTOGO_KEYSTORE=$jks
HOWTOGO_KEY_ALIAS=$alias
HOWTOGO_KEYSTORE_PASSWORD=$pw
HOWTOGO_KEY_PASSWORD=$pw
TXT
chmod 600 "$jks" "$txt"
echo "created $jks (passwords in $txt, chmod 600)"
keytool -list -v -keystore "$jks" -storepass "$pw" 2>/dev/null | grep -E "SHA256:" | head -1
