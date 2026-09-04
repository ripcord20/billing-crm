'use strict';

const { RadiusServer, RadiusAccount } = require('../models');
const { Op } = require('sequelize');
const RadiusSQL = require('../services/RadiusSqlService');
const RadiusProv = require('../services/RadiusProvisionService');
const { encryptSecret } = require('../utils/secretBox');
const { getTenantId } = require('../utils/tenantScope');

function serverWhere(req) {
  const tid = getTenantId(req);
  if (!tid) return {};
  return { [Op.or]: [{ tenant_id: tid }, { tenant_id: null }] };
}

class RadiusController {
  async status(req, res) {
    try {
      const server = await RadiusProv.resolveServer(null, getTenantId(req));
      res.json({
        success: true,
        data: {
          enabled: !!server,
          backend: server ? 'radius' : 'mikrotik',
          server: server ? { id: server.id, name: server.name, host: server.host } : null
        }
      });
    } catch (e) {
      res.json({ success: true, data: { enabled: false, backend: 'mikrotik', server: null } });
    }
  }

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
        tenant_id: getTenantId(req) || body.tenant_id || null,
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
      for (const f of ['name', 'host', 'auth_port', 'acct_port', 'mysql_host', 'mysql_port', 'mysql_database', 'mysql_user', 'default_nas_secret', 'notes', 'is_active', 'tenant_id']) {
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

  async deleteServer(req, res) {
    try {
      const row = await RadiusServer.findByPk(req.params.id);
      if (!row) return res.status(404).json({ success: false, message: 'Server tidak ditemukan' });
      RadiusSQL.invalidatePool(row);
      await row.destroy();
      res.json({ success: true, message: 'Server RADIUS dihapus dari daftar (FreeRADIUS tidak diubah)' });
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
      const server = await RadiusProv.resolveServer(req.query.server_id, getTenantId(req));
      if (!server) return res.status(400).json({ success: false, message: 'Server RADIUS belum dikonfigurasi' });
      const data = await RadiusSQL.listOnline(server, req.query.limit || 150);
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async radiusUsers(req, res) {
    try {
      const server = await RadiusProv.resolveServer(req.query.server_id, getTenantId(req));
      if (!server) return res.status(400).json({ success: false, message: 'Server RADIUS belum dikonfigurasi' });
      const remote = await RadiusSQL.listUsers(server, req.query.search || '', req.query.limit || 80);
      const local = await RadiusAccount.findAll({ order: [['username', 'ASC']] });
      res.json({ success: true, data: { remote, local } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async groups(req, res) {
    try {
      const server = await RadiusProv.resolveServer(req.query.server_id, getTenantId(req));
      if (!server) return res.json({ success: true, data: [] });
      const data = await RadiusSQL.listGroups(server);
      res.json({ success: true, data });
    } catch (e) {
      res.json({ success: true, data: [] });
    }
  }

  async createUser(req, res) {
    try {
      const PppoeAccount = require('../services/PppoeAccountService');
      const result = await PppoeAccount.provisionStandalone({
        username: req.body.name || req.body.username,
        password: req.body.password,
        profile: req.body.profile || req.body.groupname,
        remoteAddress: req.body.remoteAddress,
        tenant_id: getTenantId(req),
        backend: req.body.pppoe_backend || 'radius',
        failIfExists: true
      });
      if (!result.success) return res.status(400).json({ success: false, message: result.message });
      res.json({ success: true, data: result, message: 'User PPPoE disimpan di RADIUS' });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
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
        groupname: req.body.groupname || req.body.profile,
        nas_id: req.body.nas_id,
        requirePassword: true
      });
      if (result.skipped) return res.status(400).json({ success: false, message: result.message || result.reason });
      if (!result.success) return res.status(400).json({ success: false, message: result.message });
      if (req.body.username && req.body.username !== customer.pppoe_username) {
        await customer.update({
          pppoe_username: req.body.username,
          connection_type: customer.connection_type || 'pppoe'
        });
      }
      res.json({ success: true, data: result, message: 'User PPPoE tersimpan di RADIUS' });
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
