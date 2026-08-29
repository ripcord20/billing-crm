#!/usr/bin/env bash
# Repository bootstrap — durable setup tied to the checked-out source.
# Idempotent: safe to re-run. Does NOT start long-running processes.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Plain `yarn install` (not --frozen-lockfile): the repo pins a git dependency
# (libsignal) whose URL yarn 1.x normalizes on every run, which would make
# --frozen-lockfile fail. Plain install is deterministic enough for dev.
echo "[install] Installing Node dependencies with yarn..."
yarn install

# Create a dev .env if none exists (.env is gitignored). Never overwrite an
# existing file so local customizations / secrets are preserved.
if [ ! -f .env ]; then
  echo "[install] Creating .env from .cursor/env.dev.example"
  cp .cursor/env.dev.example .env
else
  echo "[install] .env already present — leaving as-is"
fi

echo "[install] Done."
