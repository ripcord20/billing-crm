#!/usr/bin/env bash
# Per-boot runtime initialization: bring up MariaDB, ensure the app database
# and user exist, then seed the schema + a bootstrap admin. Idempotent and
# tolerant of restarts. Reaches a clear success/failure state and returns
# (the app server itself runs as a `terminals` process, not from here).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DATADIR=/var/lib/mysql
SOCKET_DIR=/var/run/mysqld

# mysql/mariadb client runs as root here (unix_socket auth). If not root, use sudo.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

echo "[start] Ensuring MariaDB data directory..."
$SUDO mkdir -p "$DATADIR" "$SOCKET_DIR"
$SUDO chown -R mysql:mysql "$DATADIR" "$SOCKET_DIR"
if [ ! -d "$DATADIR/mysql" ]; then
  echo "[start] Initializing MariaDB data directory..."
  $SUDO mariadb-install-db --user=mysql --datadir="$DATADIR" >/tmp/mariadb-init.log 2>&1
fi

if ! $SUDO mysqladmin ping >/dev/null 2>&1; then
  echo "[start] Starting mysqld_safe..."
  $SUDO mysqld_safe --datadir="$DATADIR" >/tmp/mysqld.log 2>&1 &
  for i in $(seq 1 30); do
    if $SUDO mysqladmin ping >/dev/null 2>&1; then break; fi
    sleep 1
  done
fi

if ! $SUDO mysqladmin ping >/dev/null 2>&1; then
  echo "[start] ERROR: MariaDB failed to start. See /tmp/mysqld.log" >&2
  exit 1
fi
echo "[start] MariaDB is up."

echo "[start] Ensuring database and app user..."
$SUDO mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS isp_netops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'ispuser'@'localhost' IDENTIFIED BY 'isppass';
CREATE USER IF NOT EXISTS 'ispuser'@'127.0.0.1' IDENTIFIED BY 'isppass';
GRANT ALL PRIVILEGES ON isp_netops.* TO 'ispuser'@'localhost';
GRANT ALL PRIVILEGES ON isp_netops.* TO 'ispuser'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

# Seed schema + bootstrap admin (idempotent). Non-fatal if it hiccups so the
# environment still starts; the app server also syncs the schema on boot.
echo "[start] Seeding schema + bootstrap admin..."
node backend/seeds/index.js || echo "[start] WARN: seed step reported an issue (continuing)"

echo "[start] Ready."
