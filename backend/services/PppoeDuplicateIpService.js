/**
 * Scan CRM + MikroTik untuk IP yang dipakai lebih dari satu user PPPoE.
 */

const { Op } = require('sequelize');
const { Customer, Device } = require('../models');
const { getMikrotikInstanceByDevice } = require('./MikrotikService');
const {
  findDuplicateCustomers,
  findDuplicateSecrets,
  findDuplicateSessions
} = require('../utils/pppoeDuplicateIp');
const logger = require('../utils/logger');

function pickCustomer(c) {
  return {
    id: c.id,
    customer_id: c.customer_id,
    name: c.name,
    pppoe_username: c.pppoe_username || '',
    static_ip: c.static_ip,
    status: c.status,
    isolir_status: c.isolir_status,
    mikrotik_id: c.mikrotik_id
  };
}

function pickSecret(s) {
  return {
    id: s.id,
    name: s.name,
    profile: s.profile || '',
    remoteAddress: s.remoteAddress || '',
    disabled: !!s.disabled,
    comment: s.comment || ''
  };
}

function pickSession(s) {
  return {
    id: s.id,
    name: s.name,
    service: s.service || 'pppoe',
    address: s.address || '',
    callerID: s.callerID || ''
  };
}

async function scanCrm() {
  const rows = await Customer.findAll({
    where: {
      static_ip: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
      [Op.or]: [
        { pppoe_username: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
        { connection_type: 'pppoe' }
      ]
    },
    attributes: [
      'id', 'customer_id', 'name', 'pppoe_username', 'static_ip',
      'status', 'isolir_status', 'mikrotik_id', 'connection_type'
    ],
    raw: true
  });

  return findDuplicateCustomers(rows).map((g) => ({
    ip: g.ip,
    count: g.count,
    users: g.users.map(pickCustomer)
  }));
}

async function listRouters(deviceId, allRouters) {
  const attrs = ['id', 'name', 'ip_address'];
  if (allRouters || !deviceId) {
    const list = await Device.findAll({
      where: { type: 'router', is_active: true },
      attributes: attrs,
      order: [['id', 'ASC']]
    });
    if (list.length) return list;
  }
  if (deviceId) {
    const one = await Device.findByPk(deviceId, { attributes: attrs });
    if (one) return [one];
  }
  return [];
}

async function scanOneRouter(device) {
  const mt = await getMikrotikInstanceByDevice(device.id);
  const [secrets, sessions] = await Promise.all([
    mt.getPPPoESecrets().catch((e) => { throw new Error('secrets: ' + e.message); }),
    mt.getPPPoESessions().catch((e) => { throw new Error('sessions: ' + e.message); })
  ]);

  const secretDupes = findDuplicateSecrets(secrets).map((g) => ({
    ip: g.ip,
    count: g.count,
    device_id: device.id,
    device_name: device.name,
    users: g.users.map(pickSecret)
  }));

  const sessionDupes = findDuplicateSessions(sessions).map((g) => ({
    ip: g.ip,
    count: g.count,
    device_id: device.id,
    device_name: device.name,
    users: g.users.map(pickSession)
  }));

  return {
    device_id: device.id,
    device_name: device.name,
    secret_count: (secrets || []).length,
    session_count: (sessions || []).length,
    secrets: secretDupes,
    sessions: sessionDupes
  };
}

/**
 * @param {{ deviceId?: number|null, allRouters?: boolean }} opts
 */
async function scanDuplicateIps(opts = {}) {
  const deviceId = opts.deviceId ? parseInt(opts.deviceId, 10) : null;
  const allRouters = opts.allRouters !== false; // default: semua router

  const customers = await scanCrm().catch((e) => {
    logger.warn('[PppoeDupIp] CRM scan gagal: ' + e.message);
    throw e;
  });

  const routers = await listRouters(deviceId, allRouters);
  const secrets = [];
  const sessions = [];
  const errors = [];
  const scanned = [];

  if (!routers.length) {
    // Tidak ada device di DB — coba instance default (.env)
    try {
      const mt = await getMikrotikInstanceByDevice(deviceId);
      const fake = { id: deviceId || 0, name: 'default' };
      const [sec, sess] = await Promise.all([
        mt.getPPPoESecrets(),
        mt.getPPPoESessions()
      ]);
      scanned.push({ device_id: fake.id, device_name: fake.name, secret_count: (sec || []).length, session_count: (sess || []).length });
      findDuplicateSecrets(sec).forEach((g) => {
        secrets.push({
          ip: g.ip, count: g.count, device_id: fake.id, device_name: fake.name,
          users: g.users.map(pickSecret)
        });
      });
      findDuplicateSessions(sess).forEach((g) => {
        sessions.push({
          ip: g.ip, count: g.count, device_id: fake.id, device_name: fake.name,
          users: g.users.map(pickSession)
        });
      });
    } catch (e) {
      errors.push({ device_id: deviceId, device_name: 'default', message: e.message });
    }
  } else {
    const results = await Promise.allSettled(routers.map((d) => scanOneRouter(d)));
    results.forEach((r, i) => {
      const dev = routers[i];
      if (r.status === 'fulfilled') {
        scanned.push({
          device_id: r.value.device_id,
          device_name: r.value.device_name,
          secret_count: r.value.secret_count,
          session_count: r.value.session_count
        });
        secrets.push(...r.value.secrets);
        sessions.push(...r.value.sessions);
      } else {
        const msg = r.reason && r.reason.message ? r.reason.message : String(r.reason);
        logger.warn(`[PppoeDupIp] router ${dev.name} (#${dev.id}): ${msg}`);
        errors.push({ device_id: dev.id, device_name: dev.name, message: msg });
      }
    });
  }

  const summary = {
    customer_groups: customers.length,
    secret_groups: secrets.length,
    session_groups: sessions.length,
    total_groups: customers.length + secrets.length + sessions.length,
    routers_scanned: scanned.length,
    routers_failed: errors.length
  };

  return { customers, secrets, sessions, scanned, errors, summary };
}

module.exports = {
  scanDuplicateIps,
  scanCrm
};
