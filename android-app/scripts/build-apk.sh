#!/usr/bin/env bash
# Bangun APK debug Fiberix Billing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
export ANDROID_SDK_ROOT="$SDK"
export ANDROID_HOME="$SDK"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"

if [[ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" && ! -x "$SDK/cmdline-tools/bin/sdkmanager" ]]; then
  echo "Android SDK belum ada di $SDK" >&2
  echo "Lihat android-app/README.md" >&2
  exit 1
fi

echo "sdk.dir=$SDK" > "$ROOT/local.properties"

if [[ ! -f "$ROOT/gradle/wrapper/gradle-wrapper.jar" ]]; then
  echo "gradle-wrapper.jar missing" >&2
  exit 1
fi

python3 "$ROOT/scripts/gen-icons.py"

cd "$ROOT"
chmod +x gradlew 2>/dev/null || true
./gradlew :app:assembleDebug --no-daemon
APK="$ROOT/app/build/outputs/apk/debug/app-debug.apk"
echo "APK: $APK"
ls -lh "$APK"
