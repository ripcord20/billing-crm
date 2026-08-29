'use strict';

const { NasDevice, RadiusServer, Device } = require('../models');
const RadiusSQL = require('../services/RadiusSqlService');
const RadiusProv = require('../services/RadiusProvisionService');
const { getTenantId } = require('../middleware/tenantContext');

class NasController {
  async index(req, res) {
    try {
      const rows = await NasDevice.findAll({
        include: [
          { model: RadiusServer, as: 'radius_server', required: false },
          { model: Device, as: 'device', attributes: ['id', 'name', 'ip_address'], required: false }
        ],
        order: [['id', 'DESC']]
      });
      res.json({ success: true, data: rows });
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
      const row = await NasDevice.create({
        tenant_id: getTenantId() || b.tenant_id || null,
        radius_server_id: b.radius_server_id || null,
        device_id: b.device_id || null,
        nasname: String(b.nasname).trim(),
        shortname: b.shortname || b.nasname,
        type: b.type || 'mikrotik',
        ports: b.ports || null,
        secret: b.secret,
        community: b.community || null,
        description: b.description || null,
        is_active: b.is_active !== false
      });
      const sync = await this._push(row);
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
      for (const f of ['nasname','shortname','type','ports','community','description','is_active','radius_server_id','device_id']) {
        if (b[f] !== undefined) patch[f] = b[f];
      }
      if (b.secret && b.secret !== '********') patch.secret = b.secret;
      await row.update(patch);
      const sync = await this._push(row);
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

  async _push(row) {
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
      await row.update({ last_sync_at: new Date(), last_error: null });
      return { success: true };
    } catch (e) {
      await row.update({ last_error: String(e.message).slice(0, 250) });
      return { success: false, message: e.message };
    }
  }
}

module.exports = new NasController();
