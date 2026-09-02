'use strict';

const { RadiusServer, RadiusAccount } = require('../models');
const { Op } = require('sequelize');
const RadiusSQL = require('../services/RadiusSqlService');
const RadiusProv = require('../services/RadiusProvisionService');
const { encryptSecret } = require('../utils/secretBox');
const { getTenantId } = require('../middleware/tenantContext');

function serverWhere(req) {
  const tid = getTenantId();
  if (!tid) return {};
  return { [Op.or]: [{ tenant_id: tid }, { tenant_id: null }] };
}

class RadiusController {
  async listServers(req, res) {
    try {
      const rows = await RadiusServer.findAll({ where: serverWhere(req), order: [['id', 'ASC']] });
      res.json({ success: true, data: rows });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async createServer(req, res) {
    try {
      const body = req.body || {};
      if (!body.name || !body.host || !body.mysql_host || !body.mysql_user) {
        return res.status(400).json({ success: false, message: 'Nama, host RADIUS, host MySQL, dan user MySQL wajib' });
      }
      const row = await RadiusServer.create({
        tenant_id: getTenantId() || body.tenant_id || null,
        name: body.name,
        host: body.host,
        auth_port: body.auth_port || 1812,
        acct_port: body.acct_port || 1813,
        mysql_host: body.mysql_host,
        mysql_port: body.mysql_port || 3306,
        mysql_database: body.mysql_database || 'radius',
        mysql_user: body.mysql_user,
        mysql_password: body.mysql_password ? encryptSecret(body.mysql_password) : '',
        default_nas_secret: body.default_nas_secret || null,
        notes: body.notes || null,
        is_active: body.is_active !== false
      });
      res.status(201).json({ success: true, data: row });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async updateServer(req, res) {
    try {
      const row = await RadiusServer.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'Server tidak ditemukan' });
      const body = req.body || {};
      const patch = {};
      for (const f of ['name','host','auth_port','acct_port','mysql_host','mysql_port','mysql_database','mysql_user','default_nas_secret','notes','is_active','tenant_id']) {
        if (body[f] !== undefined) patch[f] = body[f];
      }
      if (body.mysql_password && body.mysql_password !== '********') {
        patch.mysql_password = encryptSecret(body.mysql_password);
        RadiusSQL.invalidatePool(row);
      }
      await row.update(patch);
      RadiusSQL.invalidatePool(row);
      res.json({ success: true, data: row });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async ensureLocal(req, res) {
    try {
      const db = require('../models');
      const result = await require('../services/RadiusLocalBootstrap').run(db);
      RadiusSQL.invalidateAll();
      if (!result.ok) return res.status(400).json({ success: false, message: result.message || 'Gagal siapkan schema lokal' });
      const rows = await RadiusServer.findAll({ where: serverWhere(req), order: [['id', 'ASC']] });
      res.json({
        success: true,
        data: rows,
        message: 'Schema RADIUS lokal (127.0.0.1/radius) siap. Tes MySQL seharusnya berhasil.'
      });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async testServer(req, res) {
    try {
      const row = await RadiusServer.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'Server tidak ditemukan' });
      const result = await RadiusSQL.testConnection(row);
      await row.update({ last_ok_at: new Date(), last_error: null });
      res.json({ success: true, data: result, message: 'Koneksi MySQL RADIUS berhasil' });
    } catch (e) {
      try {
        const row = await RadiusServer.findByPk(req.params.id);
        if (row) await row.update({ last_error: String(e.message).slice(0, 250) });
      } catch (_) {}
      res.status(400).json({ success: false, message: 'Gagal konek MySQL RADIUS: ' + e.message });
    }
  }

  async sessions(req, res) {
    try {
      const server = await RadiusProv.resolveServer(req.query.server_id);
      if (!server) return res.status(400).json({ success: false, message: 'Server RADIUS belum dikonfigurasi' });
      const data = await RadiusSQL.listOnline(server, req.query.limit || 150);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async radiusUsers(req, res) {
    try {
      const server = await RadiusProv.resolveServer(req.query.server_id);
      if (!server) return res.status(400).json({ success: false, message: 'Server RADIUS belum dikonfigurasi' });
      const remote = await RadiusSQL.listUsers(server, req.query.search || '', req.query.limit || 80);
      const local = await RadiusAccount.findAll({ order: [['username', 'ASC']] });
      res.json({ success: true, data: { remote, local } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async provision(req, res) {
    try {
      const { Customer } = require('../models');
      const customer = await Customer.findByPk(req.body.customer_id, { include: ['package'] });
      if (!customer) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
      const result = await RadiusProv.syncCustomer(customer, {
        password: req.body.password,
        username: req.body.username,
        groupname: req.body.groupname,
        nas_id: req.body.nas_id,
        requirePassword: true
      });
      if (result.skipped) return res.status(400).json({ success: false, message: result.reason });
      if (!result.success) return res.status(400).json({ success: false, message: result.message });
      res.json({ success: true, data: result });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async isolate(req, res) {
    try {
      const { Customer } = require('../models');
      const customer = await Customer.findByPk(req.params.customerId);
      if (!customer) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
      const result = await RadiusProv.isolir(customer);
      res.json({ success: result.success, data: result, message: result.message });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async restore(req, res) {
    try {
      const { Customer } = require('../models');
      const customer = await Customer.findByPk(req.params.customerId);
      if (!customer) return res.status(404).json({ success: false, message: 'Pelanggan tidak ditemukan' });
      const result = await RadiusProv.restore(customer);
      res.json({ success: result.success, data: result, message: result.message });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}

module.exports = new RadiusController();
