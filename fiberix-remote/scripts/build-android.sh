#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
export ANDROID_SDK_ROOT="$SDK"
export ANDROID_HOME="$SDK"

mkdir -p android/app/src/main/assets/viewer
cp -f viewer/index.html viewer/app.js viewer/app.css viewer/manifest.webmanifest viewer/icon.svg viewer/relayUrl.js viewer/defaultRelay.js \
  android/app/src/main/assets/viewer/

if [[ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" && ! -x "$SDK/cmdline-tools/bin/sdkmanager" ]]; then
  mkdir -p "$SDK/cmdline-tools"
  zip="/tmp/android-cmdline-tools.zip"
  if [[ ! -f "$zip" ]]; then
    curl -fsSL -o "$zip" "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  fi
  rm -rf "$SDK/cmdline-tools/latest" /tmp/cmdline-tools
  unzip -q -o "$zip" -d /tmp
  mkdir -p "$SDK/cmdline-tools/latest"
  mv /tmp/cmdline-tools/* "$SDK/cmdline-tools/latest/"
fi

SDKMANAGER="$SDK/cmdline-tools/latest/bin/sdkmanager"
yes | "$SDKMANAGER" --sdk_root="$SDK" --licenses >/tmp/android-licenses.log || true
"$SDKMANAGER" --sdk_root="$SDK" "platforms;android-34" "build-tools;34.0.0" "platform-tools"

printf 'sdk.dir=%s\n' "$SDK" > android/local.properties

cd android
GRADLE_BIN="${GRADLE_HOME:-}/bin/gradle"
if [[ -x /tmp/gradle-8.7/bin/gradle ]]; then
  /tmp/gradle-8.7/bin/gradle --no-daemon assembleRelease
elif [[ -x "$GRADLE_BIN" ]]; then
  "$GRADLE_BIN" --no-daemon assembleRelease
else
  chmod +x gradlew
  ./gradlew --no-daemon assembleRelease
fi
APK_SRC="app/build/outputs/apk/release/app-release.apk"
mkdir -p "$ROOT/dist"
cp -f "$APK_SRC" "$ROOT/dist/FiberixRemote.apk"
ls -lh "$ROOT/dist/FiberixRemote.apk"
