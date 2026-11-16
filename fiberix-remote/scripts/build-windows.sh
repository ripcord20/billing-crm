#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p dist/win/runtime packaging/windows/certs

NODE_VER="${NODE_WIN_VERSION:-22.12.0}"
ZIP="/tmp/node-v${NODE_VER}-win-x64.zip"
if [[ ! -f dist/win/runtime/node.exe ]]; then
  if [[ ! -f "$ZIP" ]]; then
    curl -fsSL -o "$ZIP" "https://nodejs.org/dist/v${NODE_VER}/node-v${NODE_VER}-win-x64.zip"
  fi
  rm -rf /tmp/node-win-unpack
  mkdir -p /tmp/node-win-unpack
  unzip -q -o "$ZIP" -d /tmp/node-win-unpack
  cp -f /tmp/node-win-unpack/node-v${NODE_VER}-win-x64/node.exe dist/win/runtime/node.exe
fi

if [[ ! -d node_modules/ws ]]; then
  npm install
fi
mkdir -p dist/win/stage/node_modules
rm -rf dist/win/stage/node_modules/ws
cp -a node_modules/ws dist/win/stage/node_modules/ws

CERT_DIR="packaging/windows/certs"
NEED_CERT=1
if [[ -f "$CERT_DIR/codesign.crt" ]]; then
  subj=$(openssl x509 -in "$CERT_DIR/codesign.crt" -noout -subject 2>/dev/null || true)
  if echo "$subj" | grep -q "Skynet"; then NEED_CERT=0; fi
fi
if [[ "$NEED_CERT" = 1 ]]; then
  rm -f "$CERT_DIR/codesign.key" "$CERT_DIR/codesign.crt"
  openssl req -new -x509 -newkey rsa:4096 -sha256 -days 825 -nodes \
    -keyout "$CERT_DIR/codesign.key" \
    -out "$CERT_DIR/codesign.crt" \
    -subj "/CN=Skynet/O=Skynet/C=ID" \
    -addext "extendedKeyUsage=codeSigning" \
    -addext "keyUsage=digitalSignature"
fi

makensis packaging/windows/fiberix-remote.nsi
UNSIGNED="dist/FiberixRemote-Setup.unsigned.exe"
SIGNED="dist/FiberixRemote-Setup.exe"
mv -f "$SIGNED" "$UNSIGNED"

SIGN_ARGS=(
  sign -certs "$CERT_DIR/codesign.crt" -key "$CERT_DIR/codesign.key"
  -n "Fiberix Remote" -i "https://skynet"
  -in "$UNSIGNED" -out "$SIGNED"
)
if osslsigncode "${SIGN_ARGS[@]}" -t http://timestamp.digicert.com; then
  echo "Signed with Authenticode + timestamp"
else
  echo "Timestamp gagal, tanda tangan lokal saja" >&2
  osslsigncode "${SIGN_ARGS[@]}"
fi
rm -f "$UNSIGNED"
timeout 20 osslsigncode verify -in "$SIGNED" || true
ls -lh "$SIGNED" dist/win/runtime/node.exe
