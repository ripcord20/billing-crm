#!/usr/bin/env bash
# Bangun APK rilis Fiberix (bukan debug) supaya installer tidak menandai debug/test.
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

KS_DIR="$ROOT/keystore"
KS="$KS_DIR/fiberix-release.jks"
mkdir -p "$KS_DIR"
if [[ ! -f "$KS" ]]; then
  keytool -genkeypair -keystore "$KS" -alias fiberix \
    -keyalg RSA -keysize 2048 -validity 3650 \
    -storepass fiberix-release -keypass fiberix-release \
    -dname "CN=Fiberix, OU=INETmedia, O=Fiberix, L=Banyuwangi, ST=Jawa Timur, C=ID"
fi

python3 "$ROOT/scripts/gen-icons.py"
python3 "$ROOT/scripts/gen-icons.py" \
  --out "$ROOT/pelanggan/src/main/res" \
  --letter P \
  --from-rgb 13,148,136 \
  --to-rgb 15,118,110

cd "$ROOT"
chmod +x gradlew 2>/dev/null || true
./gradlew :app:assembleRelease :pelanggan:assembleRelease --no-daemon
STAFF="$ROOT/app/build/outputs/apk/release/app-release.apk"
PELANGGAN="$ROOT/pelanggan/build/outputs/apk/release/pelanggan-release.apk"
echo "Staff APK: $STAFF"
ls -lh "$STAFF"
echo "Pelanggan APK: $PELANGGAN"
ls -lh "$PELANGGAN"
