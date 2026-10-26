'use strict';

/**
 * Riwayat sesi PPPoE dari tabel FreeRADIUS radacct.
 * Satu tabel untuk semua user; filter per username di API/UI.
 * Sesi yang sudah stop lebih dari RADIUS_ACCT_RETENTION_DAYS (default 90)
 * dibersihkan cron supaya disk tidak penuh.
 */

const mysql = require('mysql2/promise');
const logger = require('../utils/logger');
const { mapSession } = require('../utils/radiusAcctFormat');

const SCHEMA_RE = /^[A-Za-z0-9_]+$/;
const DEFAULT_RETENTION_DAYS = 90;
const MIN_RETENTION_DAYS = 7;

function schemaName() {
  const s = String(process.env.RADIUS_MYSQL_DATABASE || 'radius').trim();
  return SCHEMA_RE.test(s) ? s : 'radius';
}

function acctTable() {
  return '`' + schemaName() + '`.`radacct`';
}

function isLocalHost(host) {
  const h = String(host || '').trim();
  return !h || h === '127.0.0.1' || h === 'localhost';
}

function retentionDays() {
  const n = parseInt(process.env.RADIUS_ACCT_RETENTION_DAYS || String(DEFAULT_RETENTION_DAYS), 10);
  if (!Number.isFinite(n) || n < MIN_RETENTION_DAYS) return DEFAULT_RETENTION_DAYS;
  return n;
}

let _pool = null;
let _poolKey = '';

function remoteMysqlConfig() {
  const host = String(process.env.RADIUS_MYSQL_HOST || '').trim();
  const billingHost = String(process.env.DB_HOST || '127.0.0.1').trim();
  if (isLocalHost(host) && isLocalHost(billingHost)) return null;
  if (!host || isLocalHost(host)) return null;
  return {
    host,
    port: parseInt(process.env.RADIUS_MYSQL_PORT || '3306', 10) || 3306,
    user: process.env.RADIUS_MYSQL_USER || process.env.DB_USER || 'radius',
    password: process.env.RADIUS_MYSQL_PASSWORD || process.env.DB_PASS || process.env.DB_PASSWORD || '',
    database: schemaName()
  };
}

async function getRemotePool() {
  const cfg = remoteMysqlConfig();
  if (!cfg) return null;
  const key = [cfg.host, cfg.port, cfg.user, cfg.database].join('|');
  if (_pool && _poolKey === key) return _pool;
  if (_pool) {
    _pool.end().catch(() => {});
    _pool = null;
  }
  _pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 4,
    connectTimeout: 8000
  });
  _poolKey = key;
  return _pool;
}

async function exec(sql, replacements = []) {
  const pool = await getRemotePool();
  if (pool) {
    const [rows] = await pool.query(sql, replacements);
    return rows;
  }
  const { sequelize } = require('../models');
  const [rows] = await sequelize.query(sql, { replacements });
  return rows;
}

function normalizeUsername(raw) {
  return String(raw || '').trim().slice(0, 64);
}

const SESSION_SQL = `SELECT radacctid, acctsessionid, acctuniqueid, username,
            nasipaddress, framedipaddress, callingstationid,
            acctstarttime, acctstoptime, acctsessiontime,
            acctinputoctets, acctoutputoctets, acctterminatecause
       FROM ${acctTable()}`;

async function listByUsername(username, opts = {}) {
  const user = normalizeUsername(username);
  if (!user) {
    const err = new Error('username wajib');
    err.status = 400;
    throw err;
  }
  const limit = Math.min(200, Math.max(1, parseInt(opts.limit, 10) || 50));
  const offset = Math.max(0, parseInt(opts.offset, 10) || 0);
  const tbl = acctTable();
  const countRows = await exec(
    `SELECT COUNT(*) AS c FROM ${tbl} WHERE username = ?`,
    [user]
  );
  const total = Number((Array.isArray(countRows) ? countRows[0] : countRows)?.c || 0);
  const rows = await exec(
    `${SESSION_SQL}
      WHERE username = ?
      ORDER BY acctstarttime DESC, radacctid DESC
      LIMIT ? OFFSET ?`,
    [user, limit, offset]
  );
  const list = Array.isArray(rows) ? rows : [];
  return {
    username: user,
    total,
    retentionDays: retentionDays(),
    data: list.map((row) => mapSession(row))
  };
}

async function suggestUsernames(q, limit = 30) {
  const safe = String(q || '').trim().replace(/[%_\\]/g, '').slice(0, 48);
  const like = '%' + safe + '%';
  const lim = Math.min(50, Math.max(1, parseInt(limit, 10) || 30));
  const tbl = acctTable();
  const rows = await exec(
    `SELECT username,
            COUNT(*) AS sessions,
            MAX(acctstarttime) AS last_start
       FROM ${tbl}
      WHERE username LIKE ?
      GROUP BY username
      ORDER BY last_start DESC
      LIMIT ?`,
    [like, lim]
  );
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    username: r.username,
    sessions: Number(r.sessions || 0),
    lastStart: r.last_start
  }));
}

async function status() {
  const tbl = acctTable();
  try {
    const rows = await exec(
      `SELECT COUNT(*) AS total,
              SUM(acctstoptime IS NULL) AS online
         FROM ${tbl}`
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return {
      ok: true,
      total: Number(row?.total || 0),
      online: Number(row?.online || 0),
      retentionDays: retentionDays(),
      schema: schemaName()
    };
  } catch (e) {
    logger.warn('[RadiusAcct] status: ' + e.message);
    return {
      ok: false,
      total: 0,
      online: 0,
      retentionDays: retentionDays(),
      schema: schemaName(),
      message: e.message
    };
  }
}

async function pruneStoppedOlderThanDays(days) {
  const d = parseInt(days, 10);
  const keep = Number.isFinite(d) && d >= MIN_RETENTION_DAYS ? d : retentionDays();
  const tbl = acctTable();
  const result = await exec(
    `DELETE FROM ${tbl}
      WHERE acctstoptime IS NOT NULL
        AND acctstoptime < DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [keep]
  );
  const deleted = Number(
    (result && result.affectedRows) ||
    (Array.isArray(result) && result[0] && result[0].affectedRows) ||
    0
  );
  if (deleted) logger.info(`[RadiusAcct] prune ${deleted} sesi stop > ${keep} hari`);
  return { deleted, retentionDays: keep };
}

module.exports = {
  listByUsername,
  suggestUsernames,
  status,
  pruneStoppedOlderThanDays,
  retentionDays,
  schemaName
};
