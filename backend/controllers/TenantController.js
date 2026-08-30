'use strict';

const { Tenant, User, Role, Customer, sequelize } = require('../models');
const { Op } = require('sequelize');
const {
  getTenantId,
  isTenantOwner,
  isPlatformAdmin,
  slugify
} = require('../utils/tenantScope');

function parsePeriod(query) {
  const now = new Date();
  const month = parseInt(query.month, 10) || (now.getMonth() + 1);
  const year = parseInt(query.year, 10) || now.getFullYear();
  return {
    month: Math.min(12, Math.max(1, month)),
    year: Math.min(2099, Math.max(2020, year))
  };
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function uniqueSlug(base, excludeId) {
  let slug = slugify(base);
  let i = 0;
  while (true) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const where = { slug: candidate };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    const exists = await Tenant.findOne({ where });
    if (!exists) return candidate;
    i += 1;
    if (i > 50) return `${slug}-${Date.now()}`;
  }
}

async function ensureTenantOwnerRole() {
  const [role] = await Role.findOrCreate({
    where: { name: 'tenant_owner' },
    defaults: {
      name: 'tenant_owner',
      display_name: 'Pemilik Tenant',
      description: 'Pemilik usaha tenant: dashboard pelanggan, tagihan, dan penerimaan.',
      is_system: true
    }
  });
  return role;
}

async function buildDashboard(tenantId, month, year) {
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant) return null;

  const [cust] = await sequelize.query(
    `SELECT
       COUNT(*) AS total,
       SUM(c.status='active') AS active_count,
       SUM(c.status='isolated') AS isolated_count,
       SUM(c.status='inactive') AS inactive_count,
       SUM(c.status='suspended') AS suspended_count,
       COUNT(DISTINCT c.package_id) AS package_count
     FROM customers c
     WHERE c.tenant_id = :tid`,
    { replacements: { tid: tenantId }, type: sequelize.QueryTypes.SELECT }
  );

  const [inv] = await sequelize.query(
    `SELECT
       COUNT(*) AS total_invoices,
       COALESCE(SUM(i.total),0) AS billed,
       SUM(i.status='paid') AS paid_count,
       SUM(i.status='unpaid') AS unpaid_count,
       SUM(i.status='overdue') AS overdue_count,
       COALESCE(SUM(CASE WHEN i.status='paid' THEN i.total ELSE 0 END),0) AS paid_amount,
       COALESCE(SUM(CASE WHEN i.status IN ('unpaid','overdue') THEN i.total ELSE 0 END),0) AS outstanding
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE c.tenant_id = :tid AND i.period_month = :month AND i.period_year = :year`,
    { replacements: { tid: tenantId, month, year }, type: sequelize.QueryTypes.SELECT }
  );

  const [pay] = await sequelize.query(
    `SELECT COUNT(*) AS tx_count, COALESCE(SUM(p.amount),0) AS received
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN customers c ON c.id = i.customer_id
     WHERE c.tenant_id = :tid AND i.period_month = :month AND i.period_year = :year`,
    { replacements: { tid: tenantId, month, year }, type: sequelize.QueryTypes.SELECT }
  );

  let deferral = { open_count: 0, overdue_promise_count: 0 };
  try {
    const [drow] = await sequelize.query(
      `SELECT
         SUM(d.status='open') AS open_count,
         SUM(d.status='open' AND d.promise_date < CURDATE()) AS overdue_promise_count
       FROM payment_deferrals d
       JOIN customers c ON c.id = d.customer_id
       WHERE c.tenant_id = :tid AND d.period_month = :month AND d.period_year = :year`,
      { replacements: { tid: tenantId, month, year }, type: sequelize.QueryTypes.SELECT }
    );
    deferral = {
      open_count: parseInt(drow?.open_count || 0, 10),
      overdue_promise_count: parseInt(drow?.overdue_promise_count || 0, 10)
    };
  } catch (_) {}

  const daily = await sequelize.query(
    `SELECT p.payment_date AS d, COALESCE(SUM(p.amount),0) AS total, COUNT(*) AS tx
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN customers c ON c.id = i.customer_id
     WHERE c.tenant_id = :tid AND i.period_month = :month AND i.period_year = :year
     GROUP BY p.payment_date
     ORDER BY p.payment_date ASC`,
    { replacements: { tid: tenantId, month, year }, type: sequelize.QueryTypes.SELECT }
  );

  const methods = await sequelize.query(
    `SELECT COALESCE(NULLIF(p.gateway,''), p.payment_method) AS method,
            COUNT(*) AS cnt, COALESCE(SUM(p.amount),0) AS total
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN customers c ON c.id = i.customer_id
     WHERE c.tenant_id = :tid AND i.period_month = :month AND i.period_year = :year
     GROUP BY method
     ORDER BY total DESC`,
    { replacements: { tid: tenantId, month, year }, type: sequelize.QueryTypes.SELECT }
  );

  const overdue = await sequelize.query(
    `SELECT c.id, c.name, c.customer_id AS cid, c.phone, c.status,
            i.invoice_number, i.total, i.due_date, i.status AS invoice_status
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE c.tenant_id = :tid
       AND i.period_month = :month AND i.period_year = :year
       AND i.status IN ('unpaid','overdue')
     ORDER BY i.due_date ASC, i.total DESC
     LIMIT 12`,
    { replacements: { tid: tenantId, month, year }, type: sequelize.QueryTypes.SELECT }
  );

  const recent = await sequelize.query(
    `SELECT p.id, p.amount, p.payment_method, p.payment_date, p.gateway,
            c.name AS cust_name, c.customer_id AS cid
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN customers c ON c.id = i.customer_id
     WHERE c.tenant_id = :tid
     ORDER BY p.payment_date DESC, p.id DESC
     LIMIT 8`,
    { replacements: { tid: tenantId }, type: sequelize.QueryTypes.SELECT }
  );

  const owners = await User.findAll({
    where: { tenant_id: tenantId, is_active: true },
    attributes: ['id', 'name', 'email', 'phone'],
    include: [{ model: Role, as: 'role', attributes: ['name', 'display_name'] }],
    limit: 8
  });

  return {
    tenant: tenant.toJSON(),
    period: { month, year },
    kpis: {
      customers: parseInt(cust?.total || 0, 10),
      active: parseInt(cust?.active_count || 0, 10),
      isolated: parseInt(cust?.isolated_count || 0, 10),
      inactive: parseInt(cust?.inactive_count || 0, 10),
      packages: parseInt(cust?.package_count || 0, 10),
      invoices: parseInt(inv?.total_invoices || 0, 10),
      billed: num(inv?.billed),
      paid_count: parseInt(inv?.paid_count || 0, 10),
      unpaid_count: parseInt(inv?.unpaid_count || 0, 10) + parseInt(inv?.overdue_count || 0, 10),
      overdue_count: parseInt(inv?.overdue_count || 0, 10),
      paid_amount: num(inv?.paid_amount),
      outstanding: num(inv?.outstanding),
      received: num(pay?.received),
      tx_count: parseInt(pay?.tx_count || 0, 10),
      deferral_open: deferral.open_count,
      deferral_overdue: deferral.overdue_promise_count
    },
    daily: daily.map((r) => ({ date: r.d, total: num(r.total), tx: parseInt(r.tx || 0, 10) })),
    methods: methods.map((r) => ({ method: r.method, count: parseInt(r.cnt || 0, 10), total: num(r.total) })),
    overdue: overdue.map((r) => ({
      id: r.id,
      name: r.name,
      cid: r.cid,
      phone: r.phone,
      status: r.status,
      invoice_number: r.invoice_number,
      total: num(r.total),
      due_date: r.due_date,
      invoice_status: r.invoice_status
    })),
    recent: recent.map((r) => ({
      id: r.id,
      amount: num(r.amount),
      method: r.gateway || r.payment_method,
      date: r.payment_date,
      name: r.cust_name,
      cid: r.cid
    })),
    owners: owners.map((u) => u.toJSON())
  };
}

class TenantController {
  async dashboard(req, res) {
    try {
      let tid = getTenantId(req);
      if (isTenantOwner(req) && !tid) {
        return res.status(400).json({ success: false, message: 'Akun belum terhubung ke tenant' });
      }
      if (isPlatformAdmin(req) && !tid) {
        const first = await Tenant.findOne({ order: [['id', 'ASC']] });
        tid = first?.id || null;
      }
      if (!tid) {
        return res.json({ success: true, data: null, message: 'Belum ada tenant' });
      }
      const { month, year } = parsePeriod(req.query);
      const data = await buildDashboard(tid, month, year);
      if (!data) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      res.json({ success: true, data });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async list(req, res) {
    try {
      const q = (req.query.q || '').trim();
      const where = {};
      if (q) {
        where[Op.or] = [
          { name: { [Op.like]: `%${q}%` } },
          { slug: { [Op.like]: `%${q}%` } },
          { email: { [Op.like]: `%${q}%` } }
        ];
      }
      const rows = await Tenant.findAll({
        where,
        include: [{
          model: User,
          as: 'users',
          attributes: ['id', 'name', 'email', 'is_active'],
          include: [{ model: Role, as: 'role', attributes: ['name'] }],
          required: false
        }],
        order: [['created_at', 'DESC']]
      });

      const counts = await sequelize.query(
        `SELECT tenant_id, COUNT(*) AS n FROM customers WHERE tenant_id IS NOT NULL GROUP BY tenant_id`,
        { type: sequelize.QueryTypes.SELECT }
      );
      const countMap = {};
      counts.forEach((r) => { countMap[r.tenant_id] = parseInt(r.n || 0, 10); });

      const [unassignedRow] = await sequelize.query(
        `SELECT COUNT(*) AS n FROM customers WHERE tenant_id IS NULL`,
        { type: sequelize.QueryTypes.SELECT }
      );

      res.json({
        success: true,
        data: rows.map((t) => {
          const json = t.toJSON();
          json.customer_count = countMap[t.id] || 0;
          json.owners = (json.users || []).filter((u) => u.role?.name === 'tenant_owner');
          delete json.users;
          return json;
        }),
        unassigned_customers: parseInt(unassignedRow?.n || 0, 10)
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async create(req, res) {
    try {
      const name = (req.body.name || '').trim();
      if (!name) return res.status(400).json({ success: false, message: 'Nama tenant wajib diisi' });
      const tenant = await Tenant.create({
        name,
        slug: await uniqueSlug(req.body.slug || name),
        email: req.body.email || null,
        phone: req.body.phone || null,
        address: req.body.address || null,
        notes: req.body.notes || null,
        status: req.body.status === 'suspended' ? 'suspended' : 'active'
      });
      res.json({ success: true, message: 'Tenant dibuat', data: tenant });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async update(req, res) {
    try {
      const tenant = await Tenant.findByPk(req.params.id);
      if (!tenant) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      const patch = {};
      ['name', 'email', 'phone', 'address', 'notes'].forEach((k) => {
        if (req.body[k] !== undefined) patch[k] = req.body[k];
      });
      if (req.body.status === 'active' || req.body.status === 'suspended') patch.status = req.body.status;
      if (req.body.slug || req.body.name) {
        patch.slug = await uniqueSlug(req.body.slug || req.body.name || tenant.name, tenant.id);
      }
      await tenant.update(patch);
      res.json({ success: true, message: 'Tenant diperbarui', data: tenant });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async createOwner(req, res) {
    try {
      const tenant = await Tenant.findByPk(req.params.id);
      if (!tenant) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      const name = (req.body.name || '').trim();
      const email = (req.body.email || '').trim().toLowerCase();
      const password = String(req.body.password || '');
      if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi' });
      }
      if (password.length < 8) {
        return res.status(400).json({ success: false, message: 'Password minimal 8 karakter' });
      }
      const exists = await User.findOne({ where: { email } });
      if (exists) return res.status(400).json({ success: false, message: 'Email sudah terpakai' });
      const role = await ensureTenantOwnerRole();
      const user = await User.create({
        name,
        email,
        password,
        phone: req.body.phone || null,
        role_id: role.id,
        tenant_id: tenant.id,
        is_active: true
      });
      res.json({
        success: true,
        message: 'Pemilik tenant dibuat. Login di /login, lalu otomatis ke /tenant',
        data: { id: user.id, name: user.name, email: user.email, tenant_id: tenant.id, redirect: '/tenant' }
      });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }

  async assignCustomers(req, res) {
    try {
      const tenant = await Tenant.findByPk(req.params.id);
      if (!tenant) return res.status(404).json({ success: false, message: 'Tenant tidak ditemukan' });
      let ids = Array.isArray(req.body.customer_ids) ? req.body.customer_ids : [];
      ids = ids.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0);
      if (req.body.assign_unassigned) {
        const [result] = await Customer.update(
          { tenant_id: tenant.id },
          { where: { tenant_id: null } }
        );
        return res.json({ success: true, message: `${result} pelanggan belum terikat dipindah ke ${tenant.name}`, data: { updated: result } });
      }
      if (!ids.length) {
        return res.status(400).json({ success: false, message: 'Pilih pelanggan, atau centang assign_unassigned' });
      }
      const [result] = await Customer.update(
        { tenant_id: tenant.id },
        { where: { id: { [Op.in]: ids } } }
      );
      res.json({ success: true, message: `${result} pelanggan diikat ke ${tenant.name}`, data: { updated: result } });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
}

module.exports = new TenantController();
module.exports.ensureTenantOwnerRole = ensureTenantOwnerRole;
