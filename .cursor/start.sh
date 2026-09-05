#!/usr/bin/env bash
#
# Cloud Agent start phase — per-boot runtime initialization.
# Idempotent: safe to run on every environment start.
#   1. Start the MariaDB daemon if not already running.
#   2. Ensure the application database and user exist.
#   3. Ensure a bootstrap superadmin login exists.
#
# The application server itself runs as a long-lived process defined in the
# `terminals` section of environment.json (not here), so its logs are visible.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[start] Starting MariaDB..."
sudo service mariadb start || sudo service mysql start || true

echo "[start] Waiting for MariaDB to accept connections..."
for i in $(seq 1 30); do
  if sudo mysqladmin ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

echo "[start] Ensuring database and application user exist..."
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS isp_netops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'ispnetops'@'localhost' IDENTIFIED BY 'ispnetops';
GRANT ALL PRIVILEGES ON isp_netops.* TO 'ispnetops'@'localhost';
FLUSH PRIVILEGES;
SQL

echo "[start] Ensuring bootstrap superadmin exists..."
# Requires the schema to exist; the server creates tables on first boot in
# development. Retry briefly so a fresh DB has its tables before we seed.
for i in $(seq 1 3); do
  if node backend/scripts/create-admin.js; then
    break
  fi
  echo "[start] create-admin retry $i (schema may not be ready yet)..."
  sleep 3
done || true

echo "[start] Ready. Start the app with: node backend/server.js"
