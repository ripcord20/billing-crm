'use strict';

/**
 * Koneksi SQL ke skema FreeRADIUS / daloRADIUS (radcheck / radreply / radusergroup / radacct).
 * Tidak menulis ke database billing.
 */

const mysql = require('mysql2/promise');
const { decryptSecret } = require('../utils/secretBox');
const logger = require('../utils/logger');
const { describeMysqlError, isIpv4 } = require('../utils/radiusMysql');

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
  let password = '';
  try {
    password = decryptSecret(server.mysql_password || '');
  } catch (e) {
    throw Object.assign(new Error('Password MySQL RADIUS tidak bisa didekripsi. Isi ulang di modul RADIUS.'), { code: 'ER_ACCESS_DENIED_ERROR' });
  }
  const pool = mysql.createPool({
    host: server.mysql_host || '127.0.0.1',
    port: server.mysql_port || 3306,
    user: server.mysql_user || 'radius',
    password,
    database: server.mysql_database || 'radius',
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 8000
  });
  pools.set(key, pool);
  return pool;
}

async function withPool(server, fn) {
  try {
    const pool = await getPool(server);
    return await fn(pool);
  } catch (e) {
    invalidatePool(server);
    const err = new Error(describeMysqlError(e, server));
    err.code = e.code;
    throw err;
  }
}

function invalidatePool(server) {
  const key = poolKey(server);
  const pool = pools.get(key);
  if (pool) {
    pool.end().catch(() => {});
    pools.delete(key);
  }
}

function invalidateAll() {
  for (const pool of pools.values()) pool.end().catch(() => {});
  pools.clear();
}

async function testConnection(server) {
  return withPool(server, async (pool) => {
    const [rows] = await pool.query('SELECT 1 AS ok');
    let userCount = 0;
    try {
      const [[c]] = await pool.query('SELECT COUNT(DISTINCT username) AS c FROM radcheck');
      userCount = c?.c || 0;
    } catch (_) {}
    return { ok: true, ping: rows[0]?.ok === 1, user_count: userCount, host: server.mysql_host };
  });
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

async function deleteReply(pool, username, attribute) {
  await pool.query('DELETE FROM radreply WHERE username = ? AND attribute = ?', [username, attribute]);
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

async function userExists(server, username) {
  return withPool(server, async (pool) => {
    const [rows] = await pool.query('SELECT id FROM radcheck WHERE username = ? LIMIT 1', [username]);
    return rows.length > 0;
  });
}

async function provisionUser(server, { username, password, groupname, rateLimit, framedIp, framedPool }) {
  return withPool(server, async (pool) => {
    if (password) {
      await upsertCheck(pool, username, 'Cleartext-Password', ':=', password);
    }
    await deleteCheck(pool, username, 'Auth-Type');
    if (groupname) await setUserGroup(pool, username, groupname);
    if (rateLimit) {
      await upsertReply(pool, username, 'Mikrotik-Rate-Limit', ':=', rateLimit);
    }
    if (framedIp && isIpv4(framedIp)) {
      await upsertReply(pool, username, 'Framed-IP-Address', ':=', framedIp.trim());
      await deleteReply(pool, username, 'Framed-Pool');
    } else if (framedPool) {
      await upsertReply(pool, username, 'Framed-Pool', ':=', String(framedPool).trim());
      await deleteReply(pool, username, 'Framed-IP-Address');
    }
    return { username };
  });
}

async function isolateUser(server, username) {
  return withPool(server, async (pool) => {
    await upsertCheck(pool, username, 'Auth-Type', ':=', 'Reject');
  });
}

async function restoreUser(server, username) {
  return withPool(server, async (pool) => {
    await deleteCheck(pool, username, 'Auth-Type');
  });
}

async function disableUser(server, username) {
  return isolateUser(server, username);
}

async function deleteUser(server, username) {
  return withPool(server, async (pool) => {
    await pool.query('DELETE FROM radcheck WHERE username = ?', [username]);
    await pool.query('DELETE FROM radreply WHERE username = ?', [username]);
    await pool.query('DELETE FROM radusergroup WHERE username = ?', [username]);
  });
}

async function renameUser(server, oldUsername, newUsername) {
  if (!oldUsername || !newUsername || oldUsername === newUsername) return;
  return withPool(server, async (pool) => {
    const [exists] = await pool.query('SELECT id FROM radcheck WHERE username = ? LIMIT 1', [newUsername]);
    if (exists.length) {
      throw new Error(`Username RADIUS "${newUsername}" sudah dipakai`);
    }
    await pool.query('UPDATE radcheck SET username = ? WHERE username = ?', [newUsername, oldUsername]);
    await pool.query('UPDATE radreply SET username = ? WHERE username = ?', [newUsername, oldUsername]);
    await pool.query('UPDATE radusergroup SET username = ? WHERE username = ?', [newUsername, oldUsername]);
  });
}

async function listOnline(server, limit = 100) {
  return withPool(server, async (pool) => {
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
  });
}

async function listUsers(server, search, limit = 80) {
  return withPool(server, async (pool) => {
    const like = '%' + (search || '') + '%';
    const [rows] = await pool.query(
      `SELECT c.username,
              MAX(CASE WHEN c.attribute='Cleartext-Password' THEN 'yes' END) AS has_password,
              MAX(CASE WHEN c.attribute='Auth-Type' THEN c.value END) AS auth_type,
              (SELECT groupname FROM radusergroup g WHERE g.username = c.username LIMIT 1) AS groupname
         FROM radcheck c
        WHERE c.username LIKE ?
        GROUP BY c.username
        ORDER BY c.username
        LIMIT ?`,
      [like, parseInt(limit, 10) || 80]
    );
    return rows;
  });
}

async function listGroups(server) {
  return withPool(server, async (pool) => {
    const names = new Set();
    try {
      const [a] = await pool.query('SELECT DISTINCT groupname FROM radgroupreply WHERE groupname != "" ORDER BY groupname');
      a.forEach(r => { if (r.groupname) names.add(r.groupname); });
    } catch (_) {}
    try {
      const [b] = await pool.query('SELECT DISTINCT groupname FROM radusergroup WHERE groupname != "" ORDER BY groupname');
      b.forEach(r => { if (r.groupname) names.add(r.groupname); });
    } catch (_) {}
    return Array.from(names).sort();
  });
}

module.exports = {
  getPool,
  invalidatePool,
  invalidateAll,
  testConnection,
  upsertCheck,
  deleteCheck,
  upsertReply,
  setUserGroup,
  userExists,
  provisionUser,
  isolateUser,
  restoreUser,
  disableUser,
  deleteUser,
  renameUser,
  listOnline,
  listUsers,
  listGroups
};
