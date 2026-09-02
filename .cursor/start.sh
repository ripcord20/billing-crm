#!/usr/bin/env bash
# Per-boot startup for the FLAYNET ISP NetOps dev environment.
# Brings up MariaDB and makes sure the database + admin account exist. The
# application server itself runs as a named terminal (see environment.json).
# Must be idempotent and tolerate restarts.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[start] Ensuring MariaDB socket dir ..."
sudo mkdir -p /run/mysqld
sudo chown mysql:mysql /run/mysqld

echo "[start] Starting MariaDB (if not already running) ..."
if ! sudo mysqladmin ping >/dev/null 2>&1; then
  sudo mariadbd --user=mysql >/tmp/mariadb.log 2>&1 &
  for i in $(seq 1 30); do
    sudo mysqladmin ping >/dev/null 2>&1 && break
    sleep 1
  done
fi

echo "[start] Ensuring database + user exist ..."
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS isp_netops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'isp'@'localhost' IDENTIFIED BY 'isp_pass';
GRANT ALL PRIVILEGES ON isp_netops.* TO 'isp'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "[start] Seeding development admin account (idempotent) ..."
node backend/scripts/seed-dev-admin.js || true

echo "[start] MariaDB ready."
