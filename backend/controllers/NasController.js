'use strict';

const { NasDevice } = require('../models');
const RadiusSQL = require('../services/RadiusSqlService');
const RadiusProv = require('../services/RadiusProvisionService');
const { getTenantId } = require('../middleware/tenantContext');

function pickSimple(b) {
  const name = String(b.name || b.shortname || '').trim();
  const method = b.connection_method === 'public_ip' ? 'public_ip' : 'vpn';
  const publicIp = String(b.nasname || b.public_ip || '').trim();
  return {
    shortname: name,
    description: b.description ? String(b.description).trim() : null,
    connection_method: method,
    province: b.province ? String(b.province).trim() : null,
    regency: b.regency ? String(b.regency).trim() : null,
    nasname: method === 'public_ip' ? publicIp : (publicIp || name || null),
    secret: (b.secret && b.secret !== '********') ? b.secret : null,
    type: b.type || 'mikrotik',
    is_active: b.is_active !== false
  };
}

class NasController {
  async index(req, res) {
    try {
      const rows = await NasDevice.findAll({ order: [['id', 'DESC']] });
      res.json({ success: true, data: rows });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async create(req, res) {
    try {
      const fields = pickSimple(req.body || {});
      if (!fields.shortname) {
        return res.status(400).json({ success: false, message: 'Nama NAS wajib diisi' });
      }
      if (fields.connection_method === 'public_ip' && !fields.nasname) {
        return res.status(400).json({ success: false, message: 'IP publik wajib diisi' });
      }
      const row = await NasDevice.create({
        tenant_id: getTenantId() || req.body.tenant_id || null,
        ...fields
      });
      res.status(201).json({ success: true, data: row });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async update(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      const b = req.body || {};
      const patch = pickSimple({
        name: b.name || b.shortname || row.shortname,
        description: b.description !== undefined ? b.description : row.description,
        connection_method: b.connection_method || row.connection_method,
        province: b.province !== undefined ? b.province : row.province,
        regency: b.regency !== undefined ? b.regency : row.regency,
        public_ip: b.public_ip !== undefined ? b.public_ip : (b.nasname !== undefined ? b.nasname : row.nasname),
        secret: b.secret
      });
      if (!patch.shortname) {
        return res.status(400).json({ success: false, message: 'Nama NAS wajib diisi' });
      }
      await row.update(patch);
      res.json({ success: true, data: row });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async destroy(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      await row.destroy();
      res.json({ success: true, message: 'NAS dihapus' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async syncOne(req, res) {
    try {
      const row = await NasDevice.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'NAS tidak ditemukan' });
      const sync = await this._push(row);
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
          shortname: n.shortname || n.nasname,
          type: n.type || 'other',
          connection_method: 'public_ip',
          secret: server.default_nas_secret || null,
          description: n.description,
          is_active: true
        });
        created++;
      }
      res.json({ success: true, data: { created, skipped, remote: remote.length } });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async _push(row) {
    try {
      if (!row.nasname) return { success: false, message: 'NAS belum punya IP untuk sync RADIUS' };
      const server = await RadiusProv.resolveServer(row.radius_server_id);
      if (!server) return { success: false, message: 'Server RADIUS belum dikonfigurasi' };
      const secret = row.secret || server.default_nas_secret || 'secret';
      await RadiusSQL.upsertNas(server, {
        nasname: row.nasname,
        shortname: row.shortname,
        type: row.type,
        ports: row.ports,
        secret,
        community: row.community,
        description: row.description
      });
      await row.update({ last_sync_at: new Date(), last_error: null });
      return { success: true };
    } catch (e) {
      await row.update({ last_error: String(e.message).slice(0, 250) });
      return { success: false, message: e.message };
    }
  }
}

module.exports = new NasController();
