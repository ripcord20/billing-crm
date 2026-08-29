'use strict';

const { Tenant, User, Role, Customer, Invoice, Payment, Package } = require('../models');
const { Op } = require('sequelize');
const { slugify } = require('../services/RadiusTenantMigration');
const { isPlatformAdmin } = require('../middleware/tenantContext');

function requireAdmin(req, res) {
  if (!isPlatformAdmin(req)) {
    res.status(403).json({ success: false, message: 'Hanya admin/superadmin yang boleh mengelola tenant' });
    return false;
  }
  return true;
}

class TenantController {
  async index(req, res) {
    try {
      if (!requireAdmin(req, res)) return;
      const rows = await Tenant.findAll({ order: [['id', 'ASC']] });
      const data = [];
      for (const t of rows) {
        const json = t.toJSON();
        json.customer_count = await Customer.count({ where: { tenant_id: t.id } });
        json.owner = t.owner_user_id
          ? await User.findByPk(t.owner_user_id, { attributes: ['id', 'name', 'email'] })
          : null;
        data.push(json);
      }
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async show(req, res) {
    try {
      const t = await Tenant.findByPk(req.params.id);
      if (!t) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      if (!isPlatformAdmin(req) && req.user.tenant_id !== t.id) {
        return res.status(403).json({ success: false, message: 'Akses ditolak' });
      }
      res.json({ success: true, data: t });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async create(req, res) {
    try {
      if (!requireAdmin(req, res)) return;
      const { name, company_name, phone, email, address, notes, radius_server_id } = req.body;
      if (!name) return res.status(400).json({ success: false, message: 'Nama tenant wajib' });
      let slug = slugify(req.body.slug || name);
      let n = 0;
      while (await Tenant.findOne({ where: { slug } })) {
        n += 1;
        slug = slugify(name) + '-' + n;
      }
      const tenant = await Tenant.create({
        name, slug, company_name, phone, email, address, notes,
        radius_server_id: radius_server_id || null,
        status: 'active'
      });
      res.status(201).json({ success: true, data: tenant });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async update(req, res) {
    try {
      if (!requireAdmin(req, res)) return;
      const t = await Tenant.findByPk(req.params.id);
      if (!t) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      const fields = ['name', 'company_name', 'phone', 'email', 'address', 'notes', 'status', 'radius_server_id', 'owner_user_id'];
      const patch = {};
      for (const f of fields) if (req.body[f] !== undefined) patch[f] = req.body[f];
      if (req.body.slug) patch.slug = slugify(req.body.slug);
      await t.update(patch);
      res.json({ success: true, data: t });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async createOwner(req, res) {
    try {
      if (!requireAdmin(req, res)) return;
      const t = await Tenant.findByPk(req.params.id);
      if (!t) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      const { name, email, password, phone } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Nama, email, dan password owner wajib' });
      }
      const role = await Role.findOne({ where: { name: 'tenant_owner' } });
      if (!role) return res.status(500).json({ success: false, message: 'Role tenant_owner belum ada' });
      const user = await User.create({
        name,
        email,
        password,
        phone: phone || null,
        role_id: role.id,
        tenant_id: t.id,
        is_active: true
      });
      await t.update({ owner_user_id: user.id });
      res.status(201).json({ success: true, data: { user: user.toJSON(), tenant: t } });
    } catch (e) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  async dashboard(req, res) {
    try {
      const tid = isPlatformAdmin(req) && req.query.tenant_id
        ? parseInt(req.query.tenant_id, 10)
        : (req.user.tenant_id || req.tenantId);
      if (!tid) {
        if (isPlatformAdmin(req)) {
          const first = await Tenant.findOne({ order: [['id', 'ASC']] });
          if (!first) return res.status(400).json({ success: false, message: 'Belum ada tenant' });
          req.query.tenant_id = String(first.id);
          return this.dashboard(req, res);
        }
        return res.status(400).json({ success: false, message: 'Tenant tidak ditentukan' });
      }

      const tenant = await Tenant.findByPk(tid);
      if (!tenant) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      if (!isPlatformAdmin(req) && req.user.tenant_id !== tid) {
        return res.status(403).json({ success: false, message: 'Akses ditolak' });
      }

      const moment = require('moment');
      const month = parseInt(req.query.month) || (moment().month() + 1);
      const year = parseInt(req.query.year) || moment().year();
      const today = moment().format('YYYY-MM-DD');
      const periodWhere = { tenant_id: tid, period_month: month, period_year: year };

      const customers = await Customer.count({ where: { tenant_id: tid } });
      const active = await Customer.count({ where: { tenant_id: tid, status: 'active' } });
      const isolated = await Customer.count({ where: { tenant_id: tid, isolir_status: 'isolated' } });
      const packages = await Package.count({ where: { tenant_id: tid } });

      const unpaid = await Invoice.count({
        where: { ...periodWhere, status: { [Op.in]: ['unpaid', 'overdue'] } }
      });
      const paid = await Invoice.count({ where: { ...periodWhere, status: 'paid' } });
      const overdue = await Invoice.count({
        where: {
          ...periodWhere,
          status: { [Op.in]: ['unpaid', 'overdue'] },
          due_date: { [Op.lt]: today }
        }
      });
      const revenue = await Payment.sum('amount', {
        where: {
          tenant_id: tid,
          payment_date: {
            [Op.between]: [
              moment({ year, month: month - 1, day: 1 }).startOf('month').format('YYYY-MM-DD'),
              moment({ year, month: month - 1, day: 1 }).endOf('month').format('YYYY-MM-DD')
            ]
          }
        }
      }) || 0;
      const outstanding = await Invoice.sum('total', {
        where: { ...periodWhere, status: { [Op.in]: ['unpaid', 'overdue'] } }
      }) || 0;

      res.json({
        success: true,
        data: {
          tenant,
          period: { month, year },
          kpis: {
            customers, active, isolated, packages,
            unpaid, paid, overdue,
            revenue: Number(revenue),
            outstanding: Number(outstanding)
          }
        }
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
}

module.exports = new TenantController();
