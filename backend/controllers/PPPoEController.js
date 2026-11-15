const { getMikrotikInstance, getMikrotikInstanceByDevice } = require('../services/MikrotikService');
const logger = require('../utils/logger');

function rawDeviceId(req) {
  return String(req.query?.device_id || req.headers?.['x-device-id'] || '').trim();
}

function wantsAllDevices(req) {
  const v = rawDeviceId(req).toLowerCase();
  return v === 'all' || String(req.query?.all || '') === '1';
}

// Helper: ambil device_id dari query/header lalu return instance MikroTik
function resolveDeviceId(req) {
  const v = rawDeviceId(req);
  if (!v || v.toLowerCase() === 'all') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}
async function getMt(req) {
  return getMikrotikInstanceByDevice(resolveDeviceId(req));
}

async function mtForPrefixedId(req, rawId) {
  let deviceId = resolveDeviceId(req);
  let sid = decodeURIComponent(rawId || '');
  const m = String(sid).match(/^(\d+):(.*)$/);
  if (m) {
    deviceId = parseInt(m[1], 10);
    sid = m[2];
  }
  const mt = deviceId
    ? await getMikrotikInstanceByDevice(deviceId)
    : await getMt(req);
  return { mt, sid };
}

async function listRouterDevices() {
  const { Device } = require('../models');
  return Device.findAll({
    where: { type: 'router', is_active: true },
    attributes: ['id', 'name', 'ip_address', 'status'],
    order: [['name', 'ASC']]
  });
}

function stampRouter(rows, device) {
  if (!device) return rows || [];
  return (rows || []).map((r) => ({
    ...r,
    router: device.name,
    device_id: device.id,
    id: `${device.id}:${r.id}`
  }));
}

async function lookupSelectedDevice(req) {
  const { Device } = require('../models');
  const id = resolveDeviceId(req);
  if (id) {
    const d = await Device.findByPk(id, { attributes: ['id', 'name'] });
    if (d) return d;
  }
  try {
    const primary = await Device.findOne({
      where: { is_primary: true, type: 'router', is_active: true },
      attributes: ['id', 'name']
    });
    if (primary) return primary;
  } catch (_) { /* kolom is_primary belum ada di live */ }
  return Device.findOne({
    where: { type: 'router', is_active: true },
    attributes: ['id', 'name'],
    order: [['id', 'ASC']]
  });
}

async function collectFromRouters(kind) {
  const devices = await listRouterDevices();
  const rows = [];
  const skipped = [];
  for (const d of devices) {
    try {
      const mt = await getMikrotikInstanceByDevice(d.id);
      const list = kind === 'secrets' ? await mt.getPPPoESecrets() : await mt.getPPPoESessions();
      for (const r of list || []) {
        rows.push({
          ...r,
          router: d.name,
          device_id: d.id,
          id: `${d.id}:${r.id}`
        });
      }
    } catch (e) {
      skipped.push({ id: d.id, name: d.name, error: e.message });
      logger.warn(`[PPPoE] skip ${d.name}: ${e.message}`);
    }
  }
  return { rows, skipped };
}

async function customerOfflineCount(sessions) {
  try {
    const { Customer } = require('../models');
    const { Op } = require('sequelize');
    const customers = await Customer.findAll({
      where: {
        status: 'active',
        isolir_status: 'active',
        pppoe_username: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] }
      },
      attributes: ['pppoe_username']
    });
    const online = new Set(
      (sessions || []).map((s) => String(s.name || '').trim().toLowerCase()).filter(Boolean)
    );
    let offline = 0;
    for (const c of customers) {
      const u = String(c.pppoe_username || '').trim().toLowerCase();
      if (u && !online.has(u)) offline += 1;
    }
    return { customer_total: customers.length, customer_online: customers.length - offline, customer_offline: offline };
  } catch (e) {
    logger.warn(`[PPPoE] customer offline count: ${e.message}`);
    return { customer_total: 0, customer_online: 0, customer_offline: 0 };
  }
}

class PPPoEController {
  // GET /api/mikrotik/pppoe/active
  async activeSessions(req, res) {
    try {
      // No-cache: client should always see fresh session list
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      const fleet = wantsAllDevices(req);
      let sessions;
      let skipped = [];
      if (fleet) {
        const collected = await collectFromRouters('sessions');
        sessions = collected.rows;
        skipped = collected.skipped;
      } else {
        const mt = await getMt(req);
        const device = await lookupSelectedDevice(req);
        sessions = stampRouter(await mt.getPPPoESessions(), device);
      }
      const { search, service } = req.query;

      let filtered = sessions;

      // Filter by search (null-safe)
      if (search) {
        const q = String(search).toLowerCase();
        filtered = filtered.filter(s =>
          (s.name     || '').toLowerCase().includes(q) ||
          (s.address  || '').toLowerCase().includes(q) ||
          (s.callerID || '').toLowerCase().includes(q) ||
          (s.router   || '').toLowerCase().includes(q)
        );
      }

      // Filter by service (pppoe / l2tp / pptp / etc.)
      if (service) {
        filtered = filtered.filter(s => (s.service || '').toLowerCase() === service.toLowerCase());
      }

      const customers = fleet ? await customerOfflineCount(sessions) : null;
      res.json({
        success: true,
        data: filtered,
        total: filtered.length,
        fleet: !!fleet,
        skipped,
        ...(customers || {})
      });
    } catch (err) {
      logger.error(`PPPoE sessions error: ${err.message}`);
      // Return empty list dengan warning daripada 500 untuk connection issues
      if (err.message.includes('ECONNRESET') || err.message.includes('timeout') || err.message.includes('ECONNREFUSED')) {
        return res.json({ success: true, data: [], total: 0, warning: err.message });
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // GET /api/mikrotik/pppoe/secrets
  async secrets(req, res) {
    try {
      // No-cache: after create/update/delete, client must see the fresh list
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      if (wantsAllDevices(req)) {
        const collected = await collectFromRouters('secrets');
        return res.json({
          success: true,
          data: collected.rows,
          total: collected.rows.length,
          fleet: true,
          skipped: collected.skipped
        });
      }
      const mt = await getMt(req);
      const device = await lookupSelectedDevice(req);
      const data = stampRouter(await mt.getPPPoESecrets(), device);
      res.json({ success: true, data, total: data.length });
    } catch (err) {
      logger.error(`PPPoE secrets error: ${err.message}`);
      // Return empty array instead of 500 on connection issues
      if (err.message.includes('ECONNRESET') || err.message.includes('timeout')) {
        return res.json({ success: true, data: [], total: 0, warning: err.message });
      }
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // POST /api/mikrotik/pppoe/disconnect/:id
  async disconnect(req, res) {
    try {
      const { mt, sid } = await mtForPrefixedId(req, req.params.id);
      await mt.disconnectPPPoE(sid);
      res.json({ success: true, message: 'Session disconnected' });
    } catch (err) {
      res.status(400).json({ success: false, message: err.message });
    }
  }

  // GET /api/mikrotik/pppoe/stats
  async stats(req, res) {
    try {
      let sessions;
      if (wantsAllDevices(req)) {
        sessions = (await collectFromRouters('sessions')).rows;
      } else {
        const mt = await getMt(req);
        sessions = await mt.getPPPoESessions();
      }
      const services = {};
      sessions.forEach(s => {
        services[s.service] = (services[s.service] || 0) + 1;
      });
      res.json({
        success: true,
        data: {
          total: sessions.length,
          pppoe: services.pppoe || 0,
          l2tp:  services.l2tp  || 0,
          other: sessions.length - (services.pppoe || 0) - (services.l2tp || 0)
        }
      });
    } catch (err) {
      logger.error(`PPPoE stats error: ${err.message}`);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // GET /api/mikrotik/pppoe/profiles
  async getProfiles(req, res) {
    try {
      const mt = await getMt(req);
      const profiles = await mt.getPPPoEProfiles();
      res.json({ success: true, data: profiles || [] });
    } catch (err) {
      logger.error(`PPPoE profiles error: ${err.message}`);
      res.status(500).json({ success: false, message: err.message });
    }
  }

  // POST /api/mikrotik/pppoe/secrets
  async createSecret(req, res) {
    try {
      const mt = await getMt(req);
      if (!req.body.name)     return res.status(400).json({ success:false, message:'Username wajib diisi' });
      if (!req.body.password) return res.status(400).json({ success:false, message:'Password wajib diisi' });
      await mt.createPPPoESecret(req.body);
      // null response = ECONNRESET after write = operation succeeded
      res.json({ success: true, message: 'User PPPoE berhasil dibuat' });
    } catch (err) {
      logger.error('PPPoE createSecret error:', err.message);
      res.status(400).json({ success:false, message: err.message, detail: String(err.message) });
    }
  }

  // PUT /api/mikrotik/pppoe/secrets/:id
  async updateSecret(req, res) {
    try {
      const { mt, sid } = await mtForPrefixedId(req, req.params.id);
      await mt.updatePPPoESecret(sid, req.body);
      res.json({ success: true, message: 'User PPPoE berhasil diupdate' });
    } catch (err) {
      logger.error(`PPPoE updateSecret error (id=${req.params.id}): ${err.message}`);
      res.status(400).json({ success:false, message:err.message });
    }
  }

  // DELETE /api/mikrotik/pppoe/secrets/:id
  async deleteSecret(req, res) {
    try {
      const { mt, sid } = await mtForPrefixedId(req, req.params.id);
      await mt.deletePPPoESecret(sid);
      res.json({ success: true, message: 'User PPPoE berhasil dihapus' });
    } catch (err) {
      logger.error(`PPPoE deleteSecret error (id=${req.params.id}): ${err.message}`);
      res.status(400).json({ success:false, message:err.message });
    }
  }

  // POST /api/mikrotik/pppoe/secrets/:id/enable
  async enableSecret(req, res) {
    try {
      const { mt, sid } = await mtForPrefixedId(req, req.params.id);
      await mt.enablePPPoESecret(sid);
      res.json({ success: true, message: 'User diaktifkan' });
    } catch (err) {
      logger.error(`PPPoE enableSecret error (id=${req.params.id}): ${err.message}`);
      res.status(400).json({ success:false, message:err.message });
    }
  }

  // GET /api/mikrotik/pppoe/acct-log  (live Fiberix route — must exist so overlay tidak crash)
  async acctLog(req, res) {
    try {
      let RadiusProv = null;
      let RadiusSQL = null;
      try { RadiusProv = require('../services/RadiusProvisionService'); } catch (_) { /* optional on git */ }
      try { RadiusSQL = require('../services/RadiusSqlService'); } catch (_) { /* optional on git */ }
      if (!RadiusProv?.resolveServer || !RadiusSQL?.listOnline) {
        return res.json({ success: true, data: [], total: 0 });
      }
      const server = await RadiusProv.resolveServer(req.query && req.query.server_id);
      if (!server) return res.json({ success: true, data: [], total: 0 });
      const limit = Math.min(parseInt(req.query && req.query.limit, 10) || 200, 500);
      const rows = await RadiusSQL.listOnline(server, limit);
      return res.json({ success: true, data: rows || [], total: (rows || []).length });
    } catch (err) {
      logger.error(`PPPoE acctLog error: ${err.message}`);
      res.json({ success: true, data: [], total: 0, warning: err.message });
    }
  }

  // POST /api/mikrotik/pppoe/secrets/:id/disable
  async disableSecret(req, res) {
    try {
      const { mt, sid } = await mtForPrefixedId(req, req.params.id);
      await mt.disablePPPoESecret(sid);
      res.json({ success: true, message: 'User dinonaktifkan' });
    } catch (err) {
      logger.error(`PPPoE disableSecret error (id=${req.params.id}): ${err.message}`);
      res.status(400).json({ success:false, message:err.message });
    }
  }
}

module.exports = new PPPoEController();
