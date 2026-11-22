#!/usr/bin/env bash
# Bangun APK rilis + AAB (Play Store) ZTE SSH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/android-sdk}}"
export ANDROID_SDK_ROOT="$SDK"
export ANDROID_HOME="$SDK"
export JAVA_HOME="${JAVA_HOME:-/usr/lib/jvm/java-21-openjdk-amd64}"

if [[ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" && ! -d "$SDK/platforms/android-36" && ! -d "$SDK/platforms/android-34" ]]; then
  echo "Android SDK belum ada di $SDK" >&2
  echo "Lihat android-zte-ssh/README.md" >&2
  exit 1
fi

echo "sdk.dir=$SDK" > "$ROOT/local.properties"

KS_DIR="$ROOT/keystore"
KS="$KS_DIR/zte-ssh-release.jks"
mkdir -p "$KS_DIR"
if [[ ! -f "$KS" ]]; then
  keytool -genkeypair -keystore "$KS" -alias zteshell \
    -keyalg RSA -keysize 2048 -validity 3650 \
    -storepass zte-ssh-release -keypass zte-ssh-release \
    -dname "CN=ZTE SSH, OU=Fiberix, O=Fiberix, L=Banyuwangi, ST=Jawa Timur, C=ID"
fi

python3 "$ROOT/scripts/gen-icons.py"

cd "$ROOT"
chmod +x gradlew 2>/dev/null || true
./gradlew :app:assembleRelease :app:bundleRelease --no-daemon
APK="$ROOT/app/build/outputs/apk/release/app-release.apk"
AAB="$ROOT/app/build/outputs/bundle/release/app-release.aab"
echo "APK: $APK"
ls -lh "$APK"
echo "AAB: $AAB"
ls -lh "$AAB"
