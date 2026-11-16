#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p dist/win

npx --yes @yao-pkg/pkg@6.3.2 host/agent.js \
  --targets node22-win-x64 \
  --output dist/win/FiberixRemote.exe \
  --compress GZip

cp -f host/capture.ps1 host/input.ps1 host/ui.html dist/win/
makensis packaging/windows/fiberix-remote.nsi
ls -lh dist/FiberixRemote-Setup.exe dist/win/FiberixRemote.exe
