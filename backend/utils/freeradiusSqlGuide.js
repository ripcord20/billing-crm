'use strict';

/**
 * Snippet konfigurasi supaya daemon FreeRADIUS di 192.168.22.9
 * membaca schema `radius` di billing (192.168.22.99), bukan MySQL lokal 22.9.
 */

const BILLING_LAN = '192.168.22.99';
const FREERADIUS_HOST = '192.168.22.9';

function escapeRadiusConfString(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapePhpSingle(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildSqlGuide(opts) {
  const billingLan = opts.billingLan || process.env.RADIUS_BILLING_LAN || BILLING_LAN;
  const daemonHost = opts.daemonHost || process.env.RADIUS_HOST || FREERADIUS_HOST;
  const mysqlUser = opts.mysqlUser || process.env.RADIUS_MYSQL_USER || 'radius';
  const mysqlDatabase = opts.mysqlDatabase || 'radius';
  const mysqlPort = parseInt(opts.mysqlPort || 3306, 10);
  const password = opts.password == null ? '' : String(opts.password);
  const nasnameHint = opts.nasnameHint || '';
  const nasSecretSet = !!opts.nasSecretSet;

  const sqlSnippet = [
    '# /etc/freeradius/3.0/mods-available/sql  (blok koneksi saja)',
    'sql {',
    '    dialect = "mysql"',
    '    driver = "rlm_sql_mysql"',
    `    server = "${escapeRadiusConfString(billingLan)}"`,
    `    port = ${mysqlPort}`,
    `    login = "${escapeRadiusConfString(mysqlUser)}"`,
    `    password = "${escapeRadiusConfString(password)}"`,
    `    radius_db = "${escapeRadiusConfString(mysqlDatabase)}"`,
    '    read_clients = yes',
    '    client_table = "nas"',
    '}'
  ].join('\n');

  const daloradiusPhp = [
    `<?php`,
    `// app/common/includes/daloradius.conf.php  (atau library/daloradius.conf.php)`,
    `$configValues['CONFIG_DB_HOST'] = '${escapePhpSingle(billingLan)}';`,
    `$configValues['CONFIG_DB_PORT'] = '${mysqlPort}';`,
    `$configValues['CONFIG_DB_USER'] = '${escapePhpSingle(mysqlUser)}';`,
    `$configValues['CONFIG_DB_PASS'] = '${escapePhpSingle(password)}';`,
    `$configValues['CONFIG_DB_NAME'] = '${escapePhpSingle(mysqlDatabase)}';`
  ].join('\n');

  const ufwCmd = `sudo ufw allow from ${daemonHost} to any port ${mysqlPort} proto tcp comment 'FreeRADIUS SQL'\nsudo ufw reload`;

  const mysqlTest = `mysql -h ${billingLan} -P ${mysqlPort} -u ${mysqlUser} -p ${mysqlDatabase} -e "SELECT COUNT(*) AS nas FROM nas;"`;

  const enableCmds = [
    'sudo ln -sfn /etc/freeradius/3.0/mods-available/sql /etc/freeradius/3.0/mods-enabled/sql',
    'sudo freeradius -XC',
    'sudo systemctl restart freeradius',
    'sudo systemctl status freeradius --no-pager'
  ].join('\n');

  const mikrotik = [
    `/radius add address=${daemonHost} secret=<SECRET_SAMA_DENGAN_MODUL_NAS> service=ppp timeout=3s`,
    '/ppp aaa set use-radius=yes accounting=yes interim-update=5m',
    nasnameHint
      ? `# nas.nasname di billing sekarang: ${nasnameHint}. Harus sama dengan IP sumber yang dilihat FreeRADIUS (LAN ${nasnameHint} atau IP tunnel WireGuard).`
      : '# nas.nasname harus sama dengan IP sumber paket RADIUS dari MikroTik.',
    nasSecretSet
      ? '# Secret sudah ada di Modul NAS — salin yang sama ke /radius di MikroTik.'
      : '# Isi secret di Modul NAS, Sync, lalu pakai nilai yang sama di MikroTik.'
  ].join('\n');

  return {
    billing_lan: billingLan,
    daemon_host: daemonHost,
    mysql_host: billingLan,
    mysql_port: mysqlPort,
    mysql_user: mysqlUser,
    mysql_database: mysqlDatabase,
    mysql_password: password,
    sql_snippet: sqlSnippet,
    daloradius_php: daloradiusPhp,
    ufw_cmd: ufwCmd,
    mysql_test: mysqlTest,
    enable_cmds: enableCmds,
    mikrotik,
    notes: [
      'CRM billing tetap tes MySQL lewat 127.0.0.1. Yang diubah hanya daemon FreeRADIUS/daloRADIUS di ' + daemonHost + '.',
      'Jangan buka TCP 3306 ke internet — hanya dari ' + daemonHost + '.',
      'Setelah SQL mengarah ke billing, user PPPoE diambil dari radcheck di 192.168.22.99, bukan dari MySQL lokal 22.9.'
    ]
  };
}

module.exports = {
  BILLING_LAN,
  FREERADIUS_HOST,
  buildSqlGuide,
  escapeRadiusConfString,
  escapePhpSingle
};
