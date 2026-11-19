# Sourced by the scripts/android/*.sh helpers: finds the Android build-tools on Linux and Windows (Git Bash).
# Sets BT (build-tools dir), ZIPALIGN, APKSIGNER, AAPT2; native_path converts a path for Java/Windows tools.
# Override with ANDROID_BUILD_TOOLS=<dir>. SDK root: ANDROID_HOME, ANDROID_SDK_ROOT, else ~/android-sdk.
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) SDK_WINDOWS=1 ;; *) SDK_WINDOWS=0 ;; esac
unix_path() { if [ "$SDK_WINDOWS" = 1 ]; then cygpath -u "$1"; else printf '%s\n' "$1"; fi; }
native_path() { if [ "$SDK_WINDOWS" = 1 ]; then cygpath -w "$1"; else printf '%s\n' "$1"; fi; }
sdk_root="$(unix_path "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}")"
BT="$(unix_path "${ANDROID_BUILD_TOOLS:-$(ls -d "$sdk_root"/build-tools/* 2>/dev/null | sort -V | tail -1)}")"
[ -d "$BT" ] || { echo "Android build-tools not found (set ANDROID_HOME or ANDROID_BUILD_TOOLS)" >&2; exit 1; }
if [ "$SDK_WINDOWS" = 1 ]; then
  ZIPALIGN="$BT/zipalign.exe"; AAPT2="$BT/aapt2.exe"; APKSIGNER="$BT/apksigner.bat"
else
  ZIPALIGN="$BT/zipalign"; AAPT2="$BT/aapt2"; APKSIGNER="$BT/apksigner"
fi
