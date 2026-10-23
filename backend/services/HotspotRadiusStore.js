'use strict';

/**
 * Store RADIUS khusus modul hotspot (voucher / user).
 *
 * - Tulis radcheck/radreply/radusergroup HANYA untuk username yang ada di
 *   tabel billing hotspot_radius_users.
 * - Username yang sudah ada di radcheck tapi bukan hotspot (PPPoE) ditolak.
 * - Tidak meng-isolir, rename, atau hapus akun RADIUS lain.
 */

const logger = require('../utils/logger');
const {
  mapUserToRadiusAttrs,
  collisionError,
  normalizeUserPayload,
  rowFromPayload,
  isIsolirHotspotUser
} = require('../utils/hotspotRadius');

const RADIUS_TABLES = [
  `CREATE TABLE IF NOT EXISTS radcheck (
    id int(11) unsigned NOT NULL AUTO_INCREMENT,
    username varchar(64) NOT NULL DEFAULT '',
    attribute varchar(64) NOT NULL DEFAULT '',
    op char(2) NOT NULL DEFAULT '==',
    value varchar(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY username (username(32))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS radreply (
    id int(11) unsigned NOT NULL AUTO_INCREMENT,
    username varchar(64) NOT NULL DEFAULT '',
    attribute varchar(64) NOT NULL DEFAULT '',
    op char(2) NOT NULL DEFAULT '==',
    value varchar(253) NOT NULL DEFAULT '',
    PRIMARY KEY (id),
    KEY username (username(32))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS radusergroup (
    id int(11) unsigned NOT NULL AUTO_INCREMENT,
    username varchar(64) NOT NULL DEFAULT '',
    groupname varchar(64) NOT NULL DEFAULT '',
    priority int(11) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY username (username(32))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS radacct (
    radacctid bigint(21) NOT NULL AUTO_INCREMENT,
    acctsessionid varchar(64) NOT NULL DEFAULT '',
    acctuniqueid varchar(32) NOT NULL DEFAULT '',
    username varchar(64) NOT NULL DEFAULT '',
    nasipaddress varchar(15) NOT NULL DEFAULT '',
    acctstarttime datetime DEFAULT NULL,
    acctstoptime datetime DEFAULT NULL,
    acctsessiontime int(12) unsigned DEFAULT NULL,
    acctinputoctets bigint(20) DEFAULT NULL,
    acctoutputoctets bigint(20) DEFAULT NULL,
    callingstationid varchar(50) NOT NULL DEFAULT '',
    framedipaddress varchar(15) NOT NULL DEFAULT '',
    PRIMARY KEY (radacctid),
    KEY username (username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
];

function isLocalMysqlHost(host) {
  const h = String(host || '').trim();
  return !h || h === '127.0.0.1' || h === 'localhost';
}

function mysqlConfig() {
  const host = process.env.RADIUS_MYSQL_HOST || process.env.DB_HOST || '127.0.0.1';
  if (process.env.CLONE_SAFE === '1' && (host === '192.168.22.99' || host === 'fiberix.my.id')) {
    const err = new Error('CLONE_SAFE: dilarang konek ke MySQL RADIUS produksi (' + host + ')');
    err.code = 'ER_CLONE_SAFE';
    throw err;
  }
  const local = isLocalMysqlHost(host);
  const user = process.env.RADIUS_MYSQL_USER || (local ? (process.env.DB_USER || 'root') : 'radius');
  const password = process.env.RADIUS_MYSQL_PASSWORD
    || (local ? (process.env.DB_PASS || process.env.DB_PASSWORD || '') : '');
  if (!password && !local) {
    throw new Error('RADIUS_MYSQL_PASSWORD belum diisi. Hotspot full RADIUS butuh schema MySQL radius.');
  }
  return {
    host,
    port: parseInt(process.env.RADIUS_MYSQL_PORT, 10) || parseInt(process.env.DB_PORT, 10) || 3306,
    user,
    password,
    database: process.env.RADIUS_MYSQL_DATABASE || 'radius'
  };
}

class HotspotRadiusStore {
  constructor(opts = {}) {
    this._queryFn = opts.query || null;
    this._model = opts.model || null;
    this._pool = null;
    this._schemaReady = false;
  }

  _getModel() {
    if (this._model) return this._model;
    const { HotspotRadiusUser } = require('../models');
    if (!HotspotRadiusUser) throw new Error('Model HotspotRadiusUser belum terdaftar');
    return HotspotRadiusUser;
  }

  async _poolInstance() {
    if (this._queryFn) return null;
    if (this._pool) return this._pool;
    const mysql = require('mysql2/promise');
    const cfg = mysqlConfig();
    this._pool = mysql.createPool({
      ...cfg,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 8000
    });
    return this._pool;
  }

  async query(sql, params = []) {
    if (this._queryFn) return this._queryFn(sql, params);
    const pool = await this._poolInstance();
    return pool.query(sql, params);
  }

  async ensureSchema() {
    if (this._schemaReady) return;
    for (const ddl of RADIUS_TABLES) {
      await this.query(ddl);
    }
    this._schemaReady = true;
  }

  async radiusHasUsername(username) {
    const [rows] = await this.query(
      'SELECT id FROM radcheck WHERE username = ? LIMIT 1',
      [username]
    );
    return !!(rows && rows.length);
  }

  async assertWritable(username) {
    const name = String(username || '').trim();
    if (!name) throw new Error('Username hotspot wajib');
    if (name.length > 64) throw new Error('Username hotspot maksimal 64 karakter');
    if (isIsolirHotspotUser({ name })) {
      throw new Error('User isolir-guest tetap lokal di MikroTik dan tidak ditulis ke RADIUS');
    }
    const Model = this._getModel();
    const owned = await Model.findOne({ where: { username: name } });
    if (owned) return owned;
    if (await this.radiusHasUsername(name)) throw collisionError(name);
    return null;
  }

  async _replaceRadius(payload) {
    const mapped = mapUserToRadiusAttrs(payload);
    const username = mapped.username;
    if (!username) throw new Error('Username hotspot wajib');
    const owned = await this._getModel().findOne({ where: { username } });
    if (!owned) {
      throw new Error('Refusing RADIUS write for non-hotspot user "' + username + '"');
    }
    await this.query('DELETE FROM radcheck WHERE username = ?', [username]);
    await this.query('DELETE FROM radreply WHERE username = ?', [username]);
    await this.query('DELETE FROM radusergroup WHERE username = ?', [username]);
    for (const c of mapped.checks) {
      await this.query(
        'INSERT INTO radcheck (username, attribute, op, value) VALUES (?, ?, ?, ?)',
        [username, c.attribute, c.op, c.value]
      );
    }
    for (const r of mapped.replies) {
      await this.query(
        'INSERT INTO radreply (username, attribute, op, value) VALUES (?, ?, ?, ?)',
        [username, r.attribute, r.op, r.value]
      );
    }
    if (mapped.groupname) {
      await this.query(
        'INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)',
        [username, mapped.groupname]
      );
    }
  }

  async get(idOrName) {
    const Model = this._getModel();
    const key = String(idOrName == null ? '' : idOrName).trim();
    if (!key) return null;
    if (/^\d+$/.test(key)) {
      const byId = await Model.findByPk(parseInt(key, 10));
      if (byId) return byId;
    }
    return Model.findOne({ where: { username: key } });
  }

  async list(params = {}) {
    const Model = this._getModel();
    const where = {};
    if (params.profile) where.profile = params.profile;
    return Model.findAll({ where, order: [['id', 'ASC']] });
  }

  async listUsernames() {
    const Model = this._getModel();
    const rows = await Model.findAll({ attributes: ['username'] });
    return rows.map((r) => r.username);
  }

  async usageByUsernames(names) {
    const out = {};
    if (!Array.isArray(names) || !names.length) return out;
    const ph = names.map(() => '?').join(',');
    let rows;
    try {
      [rows] = await this.query(
        `SELECT username,
                COALESCE(SUM(acctsessiontime), 0) AS uptime_sec,
                COALESCE(SUM(acctinputoctets), 0) AS bytes_in,
                COALESCE(SUM(acctoutputoctets), 0) AS bytes_out
           FROM radacct
          WHERE username IN (${ph})
          GROUP BY username`,
        names
      );
    } catch (e) {
      logger.warn('[HotspotRadius] radacct usage skipped: ' + e.message);
      return out;
    }
    for (const r of rows || []) {
      out[r.username] = {
        uptimeSec: parseInt(r.uptime_sec, 10) || 0,
        bytesIn: parseInt(r.bytes_in, 10) || 0,
        bytesOut: parseInt(r.bytes_out, 10) || 0
      };
    }
    return out;
  }

  async create(data) {
    await this.ensureSchema();
    const payload = normalizeUserPayload(data, null);
    if (!payload.username) throw new Error('Nama user wajib');
    if (isIsolirHotspotUser(payload)) {
      throw new Error('User isolir-guest tetap lokal di MikroTik dan tidak ditulis ke RADIUS');
    }
    await this.assertWritable(payload.username);
    const Model = this._getModel();
    const exists = await Model.findOne({ where: { username: payload.username } });
    if (exists) throw new Error('User hotspot "' + payload.username + '" sudah ada');
    const row = await Model.create(rowFromPayload(payload));
    try {
      await this._replaceRadius(payload);
    } catch (e) {
      await row.destroy().catch(() => {});
      throw e;
    }
    return row;
  }

  async update(idOrName, data) {
    await this.ensureSchema();
    const row = await this.get(idOrName);
    if (!row) throw new Error('User hotspot tidak ditemukan');
    const payload = normalizeUserPayload(data, row);
    if (!payload.username) throw new Error('Nama user wajib');
    if (isIsolirHotspotUser(payload)) {
      throw new Error('User isolir-guest tetap lokal di MikroTik dan tidak ditulis ke RADIUS');
    }
    if (payload.username !== row.username) {
      await this.assertWritable(payload.username);
      const taken = await this._getModel().findOne({ where: { username: payload.username } });
      if (taken) throw new Error('User hotspot "' + payload.username + '" sudah ada');
    }
    const oldName = row.username;
    await row.update(rowFromPayload(payload));
    if (payload.username !== oldName) {
      await this.query('DELETE FROM radcheck WHERE username = ?', [oldName]);
      await this.query('DELETE FROM radreply WHERE username = ?', [oldName]);
      await this.query('DELETE FROM radusergroup WHERE username = ?', [oldName]);
    }
    await this._replaceRadius(payload);
    return row;
  }

  async remove(idOrName) {
    await this.ensureSchema();
    const row = await this.get(idOrName);
    if (!row) throw new Error('User hotspot tidak ditemukan');
    const username = row.username;
    await this.query('DELETE FROM radcheck WHERE username = ?', [username]);
    await this.query('DELETE FROM radreply WHERE username = ?', [username]);
    await this.query('DELETE FROM radusergroup WHERE username = ?', [username]);
    await row.destroy();
    return { deleted: 1, username };
  }

  async setDisabled(idOrName, disabled) {
    await this.ensureSchema();
    const row = await this.get(idOrName);
    if (!row) throw new Error('User hotspot tidak ditemukan');
    const payload = normalizeUserPayload({ disabled: !!disabled }, row);
    await row.update({ disabled: !!disabled });
    await this._replaceRadius(payload);
    return row;
  }
}

const _shared = { inst: null };

function shared() {
  if (!_shared.inst) _shared.inst = new HotspotRadiusStore();
  return _shared.inst;
}

function resetSharedForTests() {
  _shared.inst = null;
}

module.exports = HotspotRadiusStore;
module.exports.shared = shared;
module.exports.resetSharedForTests = resetSharedForTests;
module.exports.mysqlConfig = mysqlConfig;
