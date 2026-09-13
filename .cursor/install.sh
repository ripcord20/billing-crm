#!/usr/bin/env bash
#
# Cloud Agent install phase — durable, idempotent repository setup.
# Runs once after checkout (and to build environment snapshots).
#   1. Ensure MariaDB server is installed (system dependency).
#   2. Install Node dependencies from the committed lockfile.
#   3. Create a local .env with dev defaults if one does not already exist.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[install] Ensuring MariaDB server is installed..."
if ! command -v mariadbd >/dev/null 2>&1 && ! command -v mysqld >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client
fi

echo "[install] Installing Node dependencies (yarn)..."
if command -v yarn >/dev/null 2>&1; then
  yarn install --frozen-lockfile || yarn install
else
  npm ci || npm install
fi

if [ ! -f "$REPO_ROOT/.env" ]; then
  echo "[install] Creating .env with local development defaults..."
  cat > "$REPO_ROOT/.env" <<'ENV'
APP_ENV=development
NODE_ENV=development
APP_NAME=ISP NetOps
APP_PORT=3003
APP_URL=http://localhost:3003
BASE_URL=http://localhost:3003
TZ=Asia/Jakarta
APP_TIMEZONE=Asia/Jakarta

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=isp_netops
DB_USER=ispnetops
DB_PASS=ispnetops

JWT_SECRET=dev-local-jwt-secret-change-me-0123456789abcdef
JWT_EXPIRY=30d
JWT_REFRESH_SECRET=dev-local-jwt-refresh-secret-change-me-0123456789
JWT_REFRESH_EXPIRY=60d
JWT_PORTAL_SECRET=dev-local-jwt-portal-secret-change-me-0123456789
JWT_RESELLER_SECRET=dev-local-jwt-reseller-secret-change-me-0123456789

CONFIG_ENCRYPTION_KEY=dev-local-config-encryption-key-change-me-0123456

LOG_LEVEL=info
LOG_DIR=logs

COMPANY_NAME=ISP NetOps Dev
COMPANY_EMAIL=dev@example.com
COMPANY_PHONE=0800000000
ENV
else
  echo "[install] .env already exists — leaving it untouched."
fi

echo "[install] Done."
