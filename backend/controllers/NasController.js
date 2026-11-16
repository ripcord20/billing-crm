'use strict';

const { NasDevice, RadiusServer, Device, Customer } = require('../models');
const { Op } = require('sequelize');
const { normalizeConnMode } = require('../utils/nasConnMode');
const { normalizeNasname, isValidNasname, normalizeVpnType } = require('../utils/nasHost');
const { resolveNasSecret } = require('../utils/nasSecret');
const RadiusSQL = require('../services/RadiusSqlService');
const RadiusProv = require('../services/RadiusProvisionService');
const Wireguard = require('../services/WireguardService');
const VpnProvision = require('../services/VpnProvisionService');
const { getTenantId } = require('../middleware/tenantContext');
const { decryptSecret } = require('../utils/secretBox');
const { buildNasRouterOsScript, radiusAllowedIps } = require('../utils/nasRouterOsScript');
const { attachNasLinkStatus } = require('../utils/nasLinkStatus');
const Core1RemoteWg = require('../services/Core1RemoteWgService');

// Push konfigurasi NAS ke server FreeRADIUS (tabel `nas`). Fungsi modul-level
// supaya tidak bergantung pada `this` (handler dipasang unbound di router).
function emptyWgCfg() {
  return {
    endpointHost: '',
    listenPort: 51820,
    serverPublicKey: '',
    serverAddress: '',
    hasServerKeys: false
  };
}

async function safeWgConfig() {
  try {
    return await Wireguard.getServerConfig();
  } catch (_) {
    return emptyWgCfg();
  }
}

function pickRadiusHost(connMode, server) {
  if (connMode === 'public') return process.env.RADIUS_PUBLIC_HOST || '103.195.65.216';
  return (server && server.host) || process.env.RADIUS_HOST || '192.168.22.99';
}

async function pushNas(row) {
  try {
    const server = await RadiusProv.resolveServer(row.radius_server_id);
    if (!server) return { success: false, message: 'Server RADIUS belum dikonfigurasi' };
    const secret = row.secret && row.secret !== '********' ? row.secret : (server.default_nas_secret || 'secret');
    await RadiusSQL.upsertNas(server, {
      nasname: row.nasname,
      shortname: row.shortname,
      type: row.type,
      ports: row.ports,
      secret,
      community: row.community,
      description: row.description
    });
    const patch = { last_sync_at: new Date(), last_error: null };
    if (!row.radius_server_id && server.id) patch.radius_server_id = server.id;
    await row.update(patch);
    return { success: true, server_id: server.id, mysql_host: server.mysql_host };
  } catch (e) {
    await row.update({ last_error: String(e.message).slice(0, 250) });
    return { success: false, message: e.message };
  }
}

class NasController {
  async index(req, res) {
    try {
      const rows = await NasDevice.findAll({
        include: [
          { model: RadiusServer, as: 'radius_server', required: false },
          { model: Device, as: 'device', attributes: ['id', 'name', 'ip_address', 'status'], required: false }
        ],
        order: [['id', 'DESC']]
      });
      let dump = new Map();
      try { dump = await Wireguard.dumpPeerMap(); } catch (_) { dump = new Map(); }
      const data = await attachNasLinkStatus(rows, dump);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async create(req, res) {
    try {
      const b = req.body || {};
      if (!b.nasname) {
        return res.status(400).json({ success: false, message: 'IP atau domain NAS wajib' });
      }
      const nasname = normalizeNasname(b.nasname);
      if (!isValidNasname(nasname)) {
        return res.status(400).json({ success: false, message: 'Isi IP (contoh 10.201.0.2) atau domain VPN/DDNS (contoh cabang.tunnel.web.id)' });
      }
      const connMode = normalizeConnMode(b.conn_mode);
      const vpnType = connMode === 'vpn' ? normalizeVpnType(b.vpn_type, nasname, connMode) : null;
      const secret = resolveNasSecret(b.secret);
      const row = await NasDevice.create({
        tenant_id: getTenantId() || b.tenant_id || null,
        radius_server_id: b.radius_server_id || null,
        device_id: b.device_id || null,
        nasname,
        shortname: b.shortname || nasname,
        type: b.type || 'mikrotik',
        conn_mode: connMode,
        vpn_type: vpnType,
        tunnel_address: b.tunnel_address || null,
        ports: b.ports || null,
        secret,
        community: b.community || null,
        description: b.description || null,
        area: b.area ? String(b.area).trim() : null,
        is_active: b.is_active !== false
      });
      const sync = await pushNas(row);
      res.status(201).json({ success: true, data: row, radius_sync: sync });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async update(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      const b = req.body || {};
      const patch = {};
      for (const f of ['shortname','type','ports','community','description','area','is_active','radius_server_id','device_id','tunnel_address']) {
        if (b[f] !== undefined) patch[f] = b[f];
      }
      if (b.nasname !== undefined) {
        const nasname = normalizeNasname(b.nasname);
        if (!isValidNasname(nasname)) {
          return res.status(400).json({ success: false, message: 'Isi IP atau domain NAS yang valid' });
        }
        patch.nasname = nasname;
      }
      if (b.conn_mode !== undefined) patch.conn_mode = normalizeConnMode(b.conn_mode);
      const nextMode = patch.conn_mode || row.conn_mode;
      const nextName = patch.nasname || row.nasname;
      if (b.vpn_type !== undefined || b.nasname !== undefined || b.conn_mode !== undefined) {
        patch.vpn_type = nextMode === 'vpn'
          ? normalizeVpnType(b.vpn_type !== undefined ? b.vpn_type : row.vpn_type, nextName, nextMode)
          : null;
      }
      if (b.secret && b.secret !== '********') patch.secret = b.secret;
      await row.update(patch);
      const sync = await pushNas(row);
      res.json({ success: true, data: row, radius_sync: sync });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async destroy(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      try {
        const server = await RadiusProv.resolveServer(row.radius_server_id);
        if (server) await RadiusSQL.deleteNas(server, row.nasname);
      } catch (e) {
        await row.update({ last_error: e.message.slice(0, 250) });
      }
      // Best-effort: cabut peer WireGuard dari interface lokal bila ada.
      if (row.conn_mode === 'vpn' && row.wg_public_key) {
        try { await Wireguard.removePeerForNas(row); } catch (_) {}
      }
      await row.destroy();
      res.json({ success: true, message: 'NAS dihapus dari billing (dan diupayakan dari FreeRADIUS)' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async syncOne(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      const sync = await pushNas(row);
      if (!sync.success) return res.status(400).json({ success: false, message: sync.message });
      res.json({ success: true, data: row, radius_sync: sync });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async importFromRadius(req, res) {
    try {
      const server = await RadiusProv.resolveServer(req.body.server_id);
      if (!server) return res.status(400).json({ success: false, message: 'Server RADIUS belum dikonfigurasi' });
      const remote = await RadiusSQL.listNas(server);
      let created = 0, skipped = 0;
      for (const n of remote) {
        const exists = await NasDevice.findOne({ where: { nasname: n.nasname } });
        if (exists) { skipped++; continue; }
        await NasDevice.create({
          tenant_id: getTenantId() || server.tenant_id || null,
          radius_server_id: server.id,
          nasname: n.nasname,
          shortname: n.shortname,
          type: n.type || 'other',
          ports: n.ports,
          secret: server.default_nas_secret || 'secret',
          description: n.description,
          is_active: true,
          last_sync_at: new Date()
        });
        created++;
      }
      res.json({ success: true, data: { created, skipped, remote: remote.length } });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  // ── WireGuard: pengaturan server ───────────────────────────────────────
  async wgServerGet(req, res) {
    try {
      const cfg = await Wireguard.getServerConfigPublic();
      res.json({ success: true, data: cfg });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async wgServerSave(req, res) {
    try {
      const cfg = await Wireguard.saveServerConfig(req.body || {});
      res.json({ success: true, data: cfg });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async wgServerInitKeys(req, res) {
    try {
      const r = await Wireguard.ensureServerKeys();
      const cfg = await Wireguard.getServerConfigPublic();
      res.json({ success: true, data: cfg, created: r.created });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  // ── WireGuard: generate peer + config untuk satu NAS ───────────────────
  async wgGenerate(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      const out = await Wireguard.generatePeerForNas(row, {
        reallocate: !!(req.body && req.body.reallocate),
        allowedIps: req.body && req.body.allowed_ips
      });
      res.json({ success: true, data: { vpn_type: 'wireguard', ...out } });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async routerosPreview(req, res) {
    try {
      const b = req.body || {};
      if (!b.nasname) {
        return res.status(400).json({ success: false, message: 'IP atau domain NAS wajib' });
      }
      const nasname = normalizeNasname(b.nasname);
      const connMode = normalizeConnMode(b.conn_mode);
      const vpnType = connMode === 'vpn' ? normalizeVpnType(b.vpn_type, nasname, connMode) : null;
      const secret = (b.secret && b.secret !== '********') ? String(b.secret).trim() : 'secret-otomatis';
      let server = null;
      try { server = await RadiusProv.resolveServer(b.radius_server_id); } catch (_) { server = null; }
      const wgCfg = await safeWgConfig();
      const data = buildNasRouterOsScript({
        nasname,
        shortname: b.shortname || nasname,
        secret,
        radiusHost: pickRadiusHost(connMode, server),
        tunnelAddress: b.tunnel_address,
        connMode,
        vpnType,
        pppPool: b.ppp_pool_ranges,
        pppLocal: b.ppp_local_address,
        vpsHost: wgCfg.endpointHost
      });
      res.json({ success: true, data: { ...data, generated: false, vpn_type: vpnType, conn_mode: connMode } });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async routerosScript(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      const b = req.body || {};
      const server = await RadiusProv.resolveServer(row.radius_server_id);
      const wgCfg = await safeWgConfig();
      const generateMissing = b.generate !== false;
      let generated = false;
      const connMode = b.conn_mode ? normalizeConnMode(b.conn_mode) : normalizeConnMode(row.conn_mode);
      const nasname = b.nasname ? normalizeNasname(b.nasname) : row.nasname;
      const vpnType = connMode === 'vpn'
        ? normalizeVpnType(b.vpn_type || row.vpn_type, nasname, connMode)
        : null;
      const radiusHost = pickRadiusHost(connMode, server);
      const secret = (b.secret && b.secret !== '********') ? String(b.secret).trim() : row.secret;

      if (connMode === 'vpn' && vpnType === 'wireguard' && generateMissing) {
        if (!row.wg_private_key || !row.wg_public_key) {
          if (!wgCfg.endpointHost) {
            return res.status(400).json({ success: false, message: 'Isi dulu endpoint WireGuard (tombol ⚙) sebelum generate script VPN.' });
          }
          await Wireguard.generatePeerForNas(row, {
            allowedIps: radiusAllowedIps(wgCfg.serverAddress, radiusHost)
          });
          await row.reload();
          generated = true;
        }
      }

      let wireguard = null;
      if (vpnType === 'wireguard' && row.wg_private_key) {
        const endpoint = row.wg_endpoint || `${wgCfg.endpointHost}:${wgCfg.listenPort}`;
        const [endpointHost, endpointPort] = String(endpoint).split(':');
        wireguard = {
          privateKey: decryptSecret(row.wg_private_key),
          serverPublicKey: wgCfg.serverPublicKey,
          presharedKey: row.wg_preshared_key ? decryptSecret(row.wg_preshared_key) : '',
          tunnelAddress: row.tunnel_address,
          endpointHost,
          endpointPort: endpointPort || wgCfg.listenPort || 51820,
          allowedIps: row.wg_allowed_ips || radiusAllowedIps(wgCfg.serverAddress, radiusHost),
          keepalive: row.wg_keepalive || 25
        };
      }

      let l2tp = null;
      if (vpnType === 'l2tp' && row.vpn_username) {
        l2tp = {
          host: (row.wg_endpoint || '').split(':')[0] || wgCfg.endpointHost,
          username: row.vpn_username,
          password: decryptSecret(row.vpn_password || ''),
          psk: row.vpn_psk ? decryptSecret(row.vpn_psk) : ''
        };
      }

      const data = buildNasRouterOsScript({
        nasId: row.id,
        nasname,
        shortname: b.shortname || row.shortname,
        secret,
        radiusHost,
        tunnelAddress: b.tunnel_address || row.tunnel_address,
        connMode,
        vpnType,
        pppPool: b.ppp_pool_ranges,
        pppLocal: b.ppp_local_address,
        vpsHost: wgCfg.endpointHost,
        wireguard,
        l2tp
      });
      res.json({ success: true, data: { ...data, generated, vpn_type: vpnType || null, conn_mode: connMode } });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  // ── VPN generik: dispatch by vpn_type (wireguard/l2tp/openvpn) ──────────
  async vpnGenerate(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      const out = await VpnProvision.generate(row, {
        vpn_type: req.body && req.body.vpn_type,
        reallocate: !!(req.body && req.body.reallocate),
        allowedIps: req.body && req.body.allowed_ips
      });
      res.json({ success: true, data: out });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async areas(req, res) {
    try {
      const names = new Set();
      const nasAreas = await NasDevice.findAll({
        attributes: ['area'],
        where: { area: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
        raw: true
      });
      nasAreas.forEach((r) => {
        const v = String(r.area || '').trim();
        if (v) names.add(v);
      });
      if (Customer) {
        const regs = await Customer.findAll({
          attributes: ['regency'],
          where: { regency: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
          group: ['regency'],
          raw: true
        });
        regs.forEach((r) => {
          const v = String(r.regency || '').trim();
          if (v) names.add(v);
        });
      }
      res.json({ success: true, data: Array.from(names).sort((a, b) => a.localeCompare(b, 'id')) });
    } catch (e) {
      res.json({ success: true, data: [] });
    }
  }

  async provisionRemoteWg(req, res) {
    try {
      const b = req.body || {};
      const out = await Core1RemoteWg.provision({
        name: b.name || b.shortname,
        secret: b.secret,
        location: b.location,
        apiPort: b.api_port,
        apiUsername: b.api_username,
        apiPassword: b.api_password,
        pppPool: b.ppp_pool_ranges,
        pppLocal: b.ppp_local_address,
        tenantId: getTenantId() || b.tenant_id || null
      });
      res.status(201).json({ success: true, data: out });
    } catch (e) {
      const msg = e.message || 'Gagal membuat cabang remote';
      const status = /wajib|tidak ditemukan|penuh|sudah ada|tidak valid|tidak ada di CORE/i.test(msg) ? 400 : 500;
      res.status(status).json({ success: false, message: msg });
    }
  }

  async remoteWgScript(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      const out = await Core1RemoteWg.scriptForNas(row);
      res.json({ success: true, data: out });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

}

module.exports = new NasController();
