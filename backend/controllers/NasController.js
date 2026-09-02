'use strict';

const { NasDevice, RadiusServer, Device } = require('../models');
const RadiusSQL = require('../services/RadiusSqlService');
const RadiusProv = require('../services/RadiusProvisionService');
const Wireguard = require('../services/WireguardService');
const VpnProvision = require('../services/VpnProvisionService');
const { getTenantId } = require('../middleware/tenantContext');
const { decryptSecret } = require('../utils/secretBox');
const { buildNasRouterOsScript, radiusAllowedIps, isPrivateHost, DEFAULT_PPP_POOL, DEFAULT_PPP_LOCAL } = require('../utils/nasRouterOsScript');
const { attachNasLinkStatus } = require('../utils/nasLinkStatus');

// Push konfigurasi NAS ke server FreeRADIUS (tabel `nas`). Fungsi modul-level
// supaya tidak bergantung pada `this` (handler dipasang unbound di router).
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

function pickPpp(row, b) {
  const body = b || {};
  const pool = (body.ppp_pool_ranges != null ? body.ppp_pool_ranges : (row && row.ppp_pool_ranges)) || '';
  const local = (body.ppp_local_address != null ? body.ppp_local_address : (row && row.ppp_local_address)) || '';
  return {
    pppPool: String(pool).trim() || DEFAULT_PPP_POOL,
    pppLocal: String(local).trim() || DEFAULT_PPP_LOCAL
  };
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
      if (!b.nasname || !b.secret) {
        return res.status(400).json({ success: false, message: 'IP NAS (nasname) dan secret wajib' });
      }
      const connMode = b.conn_mode === 'vpn' ? 'vpn' : 'public';
      const row = await NasDevice.create({
        tenant_id: getTenantId() || b.tenant_id || null,
        radius_server_id: b.radius_server_id || null,
        device_id: b.device_id || null,
        nasname: String(b.nasname).trim(),
        shortname: b.shortname || b.nasname,
        type: b.type || 'mikrotik',
        conn_mode: connMode,
        vpn_type: connMode === 'vpn' ? (b.vpn_type || 'wireguard') : null,
        tunnel_address: b.tunnel_address || null,
        ppp_pool_ranges: b.ppp_pool_ranges || null,
        ppp_local_address: b.ppp_local_address || null,
        ports: b.ports || null,
        secret: b.secret,
        community: b.community || null,
        description: b.description || null,
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
      for (const f of ['nasname','shortname','type','ports','community','description','is_active','radius_server_id','device_id','conn_mode','vpn_type','tunnel_address','ppp_pool_ranges','ppp_local_address']) {
        if (b[f] !== undefined) patch[f] = b[f];
      }
      if (b.conn_mode === 'vpn' && b.vpn_type === undefined) patch.vpn_type = row.vpn_type || 'wireguard';
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

  async routerosScript(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      const server = await RadiusProv.resolveServer(row.radius_server_id);
      const radiusHost = (server && server.host) || process.env.RADIUS_HOST || '192.168.22.9';
      const wgCfg = await Wireguard.getServerConfig();
      const generateMissing = !(req.body && req.body.generate === false);
      let generated = false;
      const vpnType = (row.vpn_type || (row.conn_mode === 'vpn' ? 'wireguard' : '')).toLowerCase();

      if (row.conn_mode === 'vpn' && vpnType === 'wireguard' && generateMissing) {
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
        nasname: row.nasname,
        shortname: row.shortname,
        secret: row.secret,
        radiusHost,
        tunnelAddress: row.tunnel_address,
        vpnType,
        vpsHost: wgCfg.endpointHost,
        serverHost: wgCfg.endpointHost,
        connMode: row.conn_mode,
        skipPortForward: row.conn_mode !== 'vpn' || isPrivateHost(wgCfg.endpointHost),
        ...pickPpp(row, req.body),
        wireguard,
        l2tp
      });
      res.json({
        success: true,
        data: {
          ...data,
          generated,
          vpn_type: vpnType || null,
          conn_mode: row.conn_mode,
          endpoint_is_lan: isPrivateHost(wgCfg.endpointHost)
        }
      });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async routerosPreview(req, res) {
    try {
      const b = req.body || {};
      const nasname = String(b.nasname || '').trim();
      const secret = String(b.secret || '').trim();
      if (!nasname || !secret || secret === '********') {
        return res.status(400).json({ success: false, message: 'IP NAS dan secret wajib untuk pratinjau script' });
      }
      const server = await RadiusProv.resolveServer(b.radius_server_id);
      const radiusHost = (server && server.host) || process.env.RADIUS_HOST || '192.168.22.9';
      const connMode = b.conn_mode === 'vpn' ? 'vpn' : 'public';
      const vpnType = connMode === 'vpn' ? String(b.vpn_type || 'wireguard').toLowerCase() : 'public';
      const data = buildNasRouterOsScript({
        nasname,
        shortname: b.shortname || nasname,
        secret,
        radiusHost,
        vpnType,
        connMode,
        skipPortForward: connMode !== 'vpn',
        ...pickPpp(null, b)
      });
      res.json({
        success: true,
        data: {
          ...data,
          generated: false,
          vpn_type: vpnType === 'public' ? null : vpnType,
          conn_mode: connMode,
          endpoint_is_lan: true
        }
      });
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

}

module.exports = new NasController();
