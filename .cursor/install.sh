#!/usr/bin/env bash
# Idempotent repository bootstrap for the FLAYNET ISP NetOps dev environment.
# Runs after the source is checked out. Installs system + node dependencies,
# writes a local .env, initializes MariaDB, creates the database, and seeds a
# development admin account. Safe to run repeatedly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[install] Installing system packages (MariaDB) ..."
if ! command -v mariadbd >/dev/null 2>&1 && ! command -v mysqld >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y mariadb-server mariadb-client
fi

echo "[install] Installing Node dependencies (yarn) ..."
yarn install --frozen-lockfile || yarn install

echo "[install] Writing .env (if missing) ..."
if [ ! -f "$REPO_ROOT/.env" ]; then
  cat > "$REPO_ROOT/.env" <<'ENV'
APP_ENV=development
NODE_ENV=development
APP_PORT=3003
APP_URL=http://localhost:3003
BASE_URL=http://localhost:3003
APP_NAME=FLAYNET
APP_TIMEZONE=Asia/Jakarta

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=isp
DB_PASS=isp_pass
DB_NAME=isp_netops

JWT_SECRET=dev-jwt-secret-change-me-please-0001
JWT_REFRESH_SECRET=dev-jwt-refresh-secret-change-me-0002
JWT_PORTAL_SECRET=dev-jwt-portal-secret-change-me-0003
JWT_RESELLER_SECRET=dev-jwt-reseller-secret-change-me-0004
JWT_EXPIRY=30d
JWT_REFRESH_EXPIRY=7d

LOG_LEVEL=info
LOG_DIR=logs
ENV
fi

mkdir -p "$REPO_ROOT/logs"

echo "[install] Initializing MariaDB data directory (if needed) ..."
sudo mkdir -p /var/lib/mysql /run/mysqld
sudo chown -R mysql:mysql /var/lib/mysql /run/mysqld
if [ ! -d /var/lib/mysql/mysql ]; then
  sudo mariadb-install-db --user=mysql --datadir=/var/lib/mysql >/dev/null
fi

echo "[install] Starting MariaDB to provision database ..."
if ! sudo mysqladmin ping >/dev/null 2>&1; then
  sudo mariadbd --user=mysql >/tmp/mariadb-install.log 2>&1 &
  for i in $(seq 1 30); do
    sudo mysqladmin ping >/dev/null 2>&1 && break
    sleep 1
  done
fi

echo "[install] Creating database and user ..."
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS isp_netops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'isp'@'localhost' IDENTIFIED BY 'isp_pass';
GRANT ALL PRIVILEGES ON isp_netops.* TO 'isp'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "[install] Seeding development admin account ..."
node backend/scripts/seed-dev-admin.js || echo "[install] admin seed skipped (will run at start)"

echo "[install] Done. Login: admin@flaynet.local / admin12345"
