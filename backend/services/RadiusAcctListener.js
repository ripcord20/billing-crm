'use strict';

/**
 * Penerima RADIUS Accounting (UDP) → tulis ke radius.radacct.
 * Dipakai kalau FreeRADIUS di peer L2TP tidak listen port 1813.
 * Aktif hanya jika RADIUS_ACCT_LISTEN=1.
 */

const dgram = require('dgram');
const logger = require('../utils/logger');
const {
  parseAccountingRequest,
  uniqueId,
  buildAccountingResponse,
  findMatchingSecret,
  STATUS
} = require('../utils/radiusAcctPacket');

let sock = null;
let _secrets = [];
let _secretsAt = 0;

function acctTable() {
  const s = String(process.env.RADIUS_MYSQL_DATABASE || 'radius').replace(/[^A-Za-z0-9_]/g, '');
  return '`' + (s || 'radius') + '`.`radacct`';
}

async function exec(sql, replacements = []) {
  const { sequelize } = require('../models');
  const [rows] = await sequelize.query(sql, { replacements });
  return rows;
}

async function loadSecrets() {
  if (_secrets.length && (Date.now() - _secretsAt) < 60000) return _secrets;
  const secrets = [];
  if (process.env.RADIUS_SECRET) secrets.push(process.env.RADIUS_SECRET);
  if (process.env.RADIUS_NAS_SECRET) secrets.push(process.env.RADIUS_NAS_SECRET);
  try {
    const rows = await exec('SELECT secret FROM `radius`.`nas` WHERE secret IS NOT NULL AND secret != \'\'');
    (rows || []).forEach((r) => { if (r.secret) secrets.push(String(r.secret)); });
  } catch (_) { /* nas table optional */ }
  _secrets = Array.from(new Set(secrets.filter(Boolean)));
  _secretsAt = Date.now();
  return _secrets;
}

async function upsert(parsed) {
  const tbl = acctTable();
  const uid = uniqueId(parsed);
  const user = String(parsed.username || '').slice(0, 64);
  const sess = String(parsed.sessionId || '').slice(0, 64);
  if (!user && !sess) return;
  const nas = String(parsed.nasIp || '').slice(0, 15);
  const ip = String(parsed.framedIp || '').slice(0, 15);
  const mac = String(parsed.mac || '').slice(0, 50);
  const input = Number(parsed.inputOctets || 0);
  const output = Number(parsed.outputOctets || 0);
  const time = Number(parsed.sessionTime || 0);
  const cause = String(parsed.terminateCause || '').slice(0, 32);

  if (parsed.status === STATUS.Start) {
    await exec(
      `INSERT INTO ${tbl}
        (acctsessionid, acctuniqueid, username, nasipaddress, framedipaddress,
         callingstationid, acctstarttime, acctupdatetime, acctsessiontime,
         acctinputoctets, acctoutputoctets, acctterminatecause)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 0, 0, '')
       ON DUPLICATE KEY UPDATE
         acctupdatetime = NOW(),
         framedipaddress = VALUES(framedipaddress),
         callingstationid = VALUES(callingstationid)`,
      [sess || uid, uid, user, nas, ip, mac]
    );
    return;
  }

  const stopSql = parsed.status === STATUS.Stop
    ? ', acctstoptime = NOW(), acctterminatecause = ?'
    : ', acctupdatetime = NOW()';
  const params = parsed.status === STATUS.Stop
    ? [time, input, output, cause, uid, user, sess]
    : [time, input, output, uid, user, sess];

  const updated = await exec(
    `UPDATE ${tbl}
        SET acctsessiontime = ?,
            acctinputoctets = ?,
            acctoutputoctets = ?
            ${stopSql}
      WHERE acctuniqueid = ?
         OR (username = ? AND acctsessionid = ? AND acctstoptime IS NULL)`,
    params
  );
  const affected = Number(updated?.affectedRows || 0);
  if (!affected) {
    await exec(
      `INSERT INTO ${tbl}
        (acctsessionid, acctuniqueid, username, nasipaddress, framedipaddress,
         callingstationid, acctstarttime, acctupdatetime, acctstoptime, acctsessiontime,
         acctinputoctets, acctoutputoctets, acctterminatecause)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), ${parsed.status === STATUS.Stop ? 'NOW()' : 'NULL'}, ?, ?, ?, ?)`,
      [sess || uid, uid, user, nas, ip, mac, time, input, output, parsed.status === STATUS.Stop ? cause : '']
    );
  }
}

async function onMessage(msg, rinfo) {
  try {
    const parsed = parseAccountingRequest(msg);
    if (!parsed) return;
    const secrets = await loadSecrets();
    const secret = findMatchingSecret(msg, secrets);
    if (!secret) {
      logger.warn(`[RadiusAcctListener] secret tidak cocok dari ${rinfo.address}`);
      return;
    }
    await upsert(parsed);
    const reply = buildAccountingResponse(msg, secret);
    sock.send(reply, rinfo.port, rinfo.address);
  } catch (e) {
    logger.warn('[RadiusAcctListener] ' + e.message);
  }
}

function start() {
  if (String(process.env.RADIUS_ACCT_LISTEN || '') !== '1') {
    return Promise.resolve(false);
  }
  if (sock) return Promise.resolve(true);
  const port = parseInt(process.env.RADIUS_ACCT_PORT || '1813', 10) || 1813;
  const host = process.env.RADIUS_ACCT_BIND || '0.0.0.0';
  sock = dgram.createSocket('udp4');
  sock.on('message', onMessage);
  sock.on('error', (e) => logger.warn('[RadiusAcctListener] ' + e.message));
  return new Promise((resolve, reject) => {
    sock.bind(port, host, () => {
      logger.info(`[RadiusAcctListener] UDP ${host}:${port}`);
      resolve(true);
    });
    sock.on('error', reject);
  }).catch((e) => {
    logger.warn('[RadiusAcctListener] bind gagal: ' + e.message);
    try { sock.close(); } catch (_) {}
    sock = null;
    return false;
  });
}

function stop() {
  if (!sock) return;
  try { sock.close(); } catch (_) {}
  sock = null;
}

module.exports = { start, stop, upsert };
