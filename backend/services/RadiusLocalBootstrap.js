'use strict';

/**
 * Siapkan schema FreeRADIUS di MariaDB billing (127.0.0.1) supaya
 * Tes koneksi + Sync NAS tidak bergantung pada MySQL remote yang
 * tertutup (192.168.22.9:3306 ECONNREFUSED).
 */

const mysql = require('mysql2/promise');
const logger = require('../utils/logger');
const { encryptSecret } = require('../utils/secretBox');
const { localRadiusPassword, FREERADIUS_TABLES } = require('../utils/radiusMysql');

function sqlQuote(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function ensureDatabaseAndUser(adminConn, pass) {
  await adminConn.query(
    'CREATE DATABASE IF NOT EXISTS `radius` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  );
  const hosts = ['localhost', '127.0.0.1', '192.168.22.9', '192.168.22.99'];
  const pwd = sqlQuote(pass);
  for (const host of hosts) {
    const h = sqlQuote(host);
    try {
      await adminConn.query(`CREATE USER IF NOT EXISTS 'radius'@'${h}' IDENTIFIED BY '${pwd}'`);
    } catch (e) {
      if (!/exists|duplicate/i.test(e.message)) logger.warn('[RadiusLocal] create user ' + host + ': ' + e.message);
    }
    try {
      await adminConn.query(`ALTER USER 'radius'@'${h}' IDENTIFIED BY '${pwd}'`);
    } catch (e) {
      if (!/operation ALTER USER|does not exist/i.test(e.message)) {
        logger.warn('[RadiusLocal] alter user ' + host + ': ' + e.message);
      }
    }
    try {
      await adminConn.query(`GRANT ALL PRIVILEGES ON \`radius\`.* TO 'radius'@'${h}'`);
    } catch (e) {
      logger.warn('[RadiusLocal] grant ' + host + ': ' + e.message);
    }
  }
  try { await adminConn.query('FLUSH PRIVILEGES'); } catch (_) {}
}

async function ensureTables(adminConn) {
  await adminConn.query('USE `radius`');
  for (const sql of FREERADIUS_TABLES) {
    await adminConn.query(sql);
  }
}

function adminConfigFromEnv() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || process.env.DB_PASSWORD || '',
    multipleStatements: true
  };
}

async function ensureLocalRadiusSchema() {
  const pass = localRadiusPassword();
  const conn = await mysql.createConnection(adminConfigFromEnv());
  try {
    await ensureDatabaseAndUser(conn, pass);
    await ensureTables(conn);
  } finally {
    await conn.end();
  }
  return { database: 'radius', user: 'radius', password: pass, host: '127.0.0.1' };
}

async function pointServersAtLocal(db, local) {
  if (!db.RadiusServer) return { updated: 0 };
  const enc = encryptSecret(local.password);
  const rows = await db.RadiusServer.findAll();
  let updated = 0;
  for (const row of rows) {
    const remoteClosed = /ECONNREFUSED|192\.168\.22\.9/i.test(String(row.last_error || ''))
      || row.mysql_host === '192.168.22.9';
    const emptyPass = !row.mysql_password;
    if (!remoteClosed && !emptyPass && row.mysql_host && row.mysql_host !== '127.0.0.1') continue;
    const patch = {
      mysql_host: process.env.RADIUS_MYSQL_HOST || '127.0.0.1',
      mysql_port: parseInt(process.env.RADIUS_MYSQL_PORT || '3306', 10),
      mysql_database: 'radius',
      mysql_user: process.env.RADIUS_MYSQL_USER || 'radius',
      mysql_password: enc,
      last_error: null
    };
    if (!row.host) patch.host = process.env.RADIUS_HOST || '192.168.22.9';
    await row.update(patch);
    updated += 1;
  }
  return { updated };
}

async function run(db) {
  try {
    const local = await ensureLocalRadiusSchema();
    const { updated } = await pointServersAtLocal(db, local);
    logger.info(`[RadiusLocal] schema radius siap di 127.0.0.1 (servers updated: ${updated})`);
    return { ok: true, updated };
  } catch (e) {
    logger.warn('[RadiusLocal] bootstrap: ' + e.message);
    return { ok: false, message: e.message };
  }
}

module.exports = {
  run,
  ensureLocalRadiusSchema,
  pointServersAtLocal
};
