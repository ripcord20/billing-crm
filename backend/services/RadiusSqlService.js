'use strict';

/**
 * Koneksi SQL ke skema FreeRADIUS / daloRADIUS (radius / radcheck / nas / radacct).
 * Tidak menulis ke database billing — hanya ke MySQL RADIUS yang dikonfigurasi.
 */

const mysql = require('mysql2/promise');
const { decryptSecret } = require('../utils/secretBox');
const logger = require('../utils/logger');

const pools = new Map();

function poolKey(server) {
  return [
    server.id,
    server.mysql_host,
    server.mysql_port,
    server.mysql_database,
    server.mysql_user
  ].join('|');
}

async function getPool(server) {
  const key = poolKey(server);
  if (pools.has(key)) return pools.get(key);
  const password = decryptSecret(server.mysql_password || '');
  const pool = mysql.createPool({
    host: server.mysql_host,
    port: server.mysql_port || 3306,
    user: server.mysql_user,
    password,
    database: server.mysql_database || 'radius',
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 8000
  });
  pools.set(key, pool);
  return pool;
}

function invalidatePool(server) {
  const key = poolKey(server);
  const pool = pools.get(key);
  if (pool) {
    pool.end().catch(() => {});
    pools.delete(key);
  }
}

async function testConnection(server) {
  const pool = await getPool(server);
  const [rows] = await pool.query('SELECT 1 AS ok');
  return { ok: true, ping: rows[0]?.ok === 1 };
}

async function upsertCheck(pool, username, attribute, op, value) {
  const [rows] = await pool.query(
    'SELECT id FROM radcheck WHERE username = ? AND attribute = ? LIMIT 1',
    [username, attribute]
  );
  if (rows.length) {
    await pool.query('UPDATE radcheck SET op = ?, value = ? WHERE id = ?', [op, value, rows[0].id]);
  } else {
    await pool.query(
      'INSERT INTO radcheck (username, attribute, op, value) VALUES (?, ?, ?, ?)',
      [username, attribute, op, value]
    );
  }
}

async function deleteCheck(pool, username, attribute) {
  await pool.query('DELETE FROM radcheck WHERE username = ? AND attribute = ?', [username, attribute]);
}

async function upsertReply(pool, username, attribute, op, value) {
  const [rows] = await pool.query(
    'SELECT id FROM radreply WHERE username = ? AND attribute = ? LIMIT 1',
    [username, attribute]
  );
  if (rows.length) {
    await pool.query('UPDATE radreply SET op = ?, value = ? WHERE id = ?', [op, value, rows[0].id]);
  } else {
    await pool.query(
      'INSERT INTO radreply (username, attribute, op, value) VALUES (?, ?, ?, ?)',
      [username, attribute, op, value]
    );
  }
}

async function setUserGroup(pool, username, groupname) {
  if (!groupname) {
    await pool.query('DELETE FROM radusergroup WHERE username = ?', [username]);
    return;
  }
  const [rows] = await pool.query('SELECT username FROM radusergroup WHERE username = ? LIMIT 1', [username]);
  if (rows.length) {
    await pool.query('UPDATE radusergroup SET groupname = ?, priority = 1 WHERE username = ?', [groupname, username]);
  } else {
    await pool.query(
      'INSERT INTO radusergroup (username, groupname, priority) VALUES (?, ?, 1)',
      [username, groupname]
    );
  }
}

async function provisionUser(server, { username, password, groupname, rateLimit }) {
  const pool = await getPool(server);
  await upsertCheck(pool, username, 'Cleartext-Password', ':=', password);
  await deleteCheck(pool, username, 'Auth-Type');
  if (groupname) await setUserGroup(pool, username, groupname);
  if (rateLimit) {
    await upsertReply(pool, username, 'Mikrotik-Rate-Limit', ':=', rateLimit);
  }
}

async function isolateUser(server, username) {
  const pool = await getPool(server);
  await upsertCheck(pool, username, 'Auth-Type', ':=', 'Reject');
}

async function restoreUser(server, username) {
  const pool = await getPool(server);
  await deleteCheck(pool, username, 'Auth-Type');
}

async function disableUser(server, username) {
  return isolateUser(server, username);
}

async function deleteUser(server, username) {
  const pool = await getPool(server);
  await pool.query('DELETE FROM radcheck WHERE username = ?', [username]);
  await pool.query('DELETE FROM radreply WHERE username = ?', [username]);
  await pool.query('DELETE FROM radusergroup WHERE username = ?', [username]);
}

async function upsertNas(server, nas) {
  const pool = await getPool(server);
  const [rows] = await pool.query('SELECT id FROM nas WHERE nasname = ? LIMIT 1', [nas.nasname]);
  const payload = {
    nasname: nas.nasname,
    shortname: nas.shortname || nas.nasname,
    type: nas.type || 'other',
    ports: nas.ports || null,
    secret: nas.secret,
    community: nas.community || null,
    description: nas.description || 'Billing NAS'
  };
  if (rows.length) {
    await pool.query(
      'UPDATE nas SET shortname=?, type=?, ports=?, secret=?, community=?, description=? WHERE id=?',
      [payload.shortname, payload.type, payload.ports, payload.secret, payload.community, payload.description, rows[0].id]
    );
    return rows[0].id;
  }
  const [ins] = await pool.query(
    'INSERT INTO nas (nasname, shortname, type, ports, secret, community, description) VALUES (?,?,?,?,?,?,?)',
    [payload.nasname, payload.shortname, payload.type, payload.ports, payload.secret, payload.community, payload.description]
  );
  return ins.insertId;
}

async function deleteNas(server, nasname) {
  const pool = await getPool(server);
  await pool.query('DELETE FROM nas WHERE nasname = ?', [nasname]);
}

async function listNas(server) {
  const pool = await getPool(server);
  const [rows] = await pool.query('SELECT id, nasname, shortname, type, ports, description FROM nas ORDER BY nasname');
  return rows;
}

async function listOnline(server, limit = 100) {
  const pool = await getPool(server);
  const [rows] = await pool.query(
    `SELECT radacctid, username, nasipaddress, framedipaddress, callingstationid,
            acctstarttime, acctsessiontime, acctinputoctets, acctoutputoctets, acctuniqueid
       FROM radacct
      WHERE acctstoptime IS NULL
      ORDER BY acctstarttime DESC
      LIMIT ?`,
    [parseInt(limit, 10) || 100]
  );
  return rows;
}

async function listUsers(server, search, limit = 50) {
  const pool = await getPool(server);
  const like = '%' + (search || '') + '%';
  const [rows] = await pool.query(
    `SELECT username,
            MAX(CASE WHEN attribute='Cleartext-Password' THEN 'yes' END) AS has_password,
            MAX(CASE WHEN attribute='Auth-Type' THEN value END) AS auth_type
       FROM radcheck
      WHERE username LIKE ?
      GROUP BY username
      ORDER BY username
      LIMIT ?`,
    [like, parseInt(limit, 10) || 50]
  );
  return rows;
}

async function safeCall(fn) {
  try {
    return await fn();
  } catch (e) {
    logger.warn('[RadiusSQL] ' + e.message);
    throw e;
  }
}

module.exports = {
  getPool,
  invalidatePool,
  testConnection,
  provisionUser,
  isolateUser,
  restoreUser,
  disableUser,
  deleteUser,
  upsertNas,
  deleteNas,
  listNas,
  listOnline,
  listUsers,
  safeCall
};
