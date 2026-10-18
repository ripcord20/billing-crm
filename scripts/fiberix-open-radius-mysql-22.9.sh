#!/bin/bash
# JANGAN dijalankan di Fiberix live: FreeRADIUS 22.9 sudah
# mods-enabled/sql server = 192.168.22.99. MySQL lokal 22.9 hampir kosong.
# Isolir/provision menulis radcheck di billing 127.0.0.1.
# Jalankan di server daloRADIUS 192.168.22.9 sebagai root.
# Membuka MariaDB hanya dari billing 192.168.22.99, grant user radius.
if [[ "${FORCE_OPEN_22_9_MYSQL:-}" != "1" ]]; then
  echo "Dibatalkan: FreeRADIUS 22.9 sudah baca MySQL billing 192.168.22.99."
  echo "Set FORCE_OPEN_22_9_MYSQL=1 hanya jika memang perlu buka 3306 di 22.9."
  exit 1
fi
set -euo pipefail
BILLING="${BILLING_LAN:-192.168.22.99}"
BIND="${BIND_ADDR:-192.168.22.9}"
DB="${RADIUS_MYSQL_DB:-radius}"
USER="${RADIUS_MYSQL_USER:-radius}"
PASS="${RADIUS_MYSQL_PASSWORD:-}"

if [[ -z "$PASS" ]]; then
  echo "Set RADIUS_MYSQL_PASSWORD dulu (password user MySQL RADIUS yang sudah ada)."
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Harus root di 192.168.22.9"
  exit 1
fi

CNF=""
for f in /etc/mysql/mariadb.conf.d/50-server.cnf /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/my.cnf /etc/my.cnf; do
  if [[ -f "$f" ]]; then CNF="$f"; break; fi
done
if [[ -z "$CNF" ]]; then
  echo "Tidak ketemu my.cnf"
  exit 1
fi

cp -a "$CNF" "${CNF}.bak-fiberix-$(date +%Y%m%d%H%M%S)"
if grep -qE '^[[:space:]]*bind-address' "$CNF"; then
  sed -i "s/^[[:space:]]*bind-address.*/bind-address = 0.0.0.0/" "$CNF"
else
  printf '\nbind-address = 0.0.0.0\n' >> "$CNF"
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow from "$BILLING" to any port 3306 proto tcp comment 'billing Fiberix RADIUS SQL' || true
fi
if command -v iptables >/dev/null 2>&1; then
  iptables -C INPUT -p tcp -s "$BILLING" --dport 3306 -j ACCEPT 2>/dev/null \
    || iptables -I INPUT -p tcp -s "$BILLING" --dport 3306 -j ACCEPT
fi

systemctl restart mariadb 2>/dev/null || systemctl restart mysql

mysql -e "CREATE USER IF NOT EXISTS '${USER}'@'${BILLING}' IDENTIFIED BY '${PASS}';" \
  || mysql -e "ALTER USER '${USER}'@'${BILLING}' IDENTIFIED BY '${PASS}';"
mysql -e "GRANT SELECT, INSERT, UPDATE, DELETE ON \`${DB}\`.* TO '${USER}'@'${BILLING}'; FLUSH PRIVILEGES;"

ss -ltn | grep 3306 || true
echo "OK: MySQL 3306 siap dari ${BILLING}. Tes: mysql -h ${BIND} -u ${USER} -p ${DB} -e 'SELECT COUNT(*) FROM radcheck;'"
