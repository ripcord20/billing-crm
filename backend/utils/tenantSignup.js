'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const { slugify } = require('./tenantScope');

function models() {
  return require('../models');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\-\s()]{8,20}$/;

/**
 * Validasi form daftar mitra (ISP / tenant) tanpa akses DB.
 * Field `website` adalah honeypot: bot yang mengisinya ditolak.
 */
function validateTenantSignup(body) {
  const raw = body && typeof body === 'object' ? body : {};
  const website = String(raw.website || '').trim();
  if (website) {
    return { ok: false, status: 400, message: 'Pendaftaran ditolak' };
  }

  const company_name = String(raw.company_name || raw.name || '').trim();
  const owner_name = String(raw.owner_name || '').trim();
  const email = String(raw.email || '').trim().toLowerCase();
  const password = String(raw.password == null ? '' : raw.password);
  const phone = String(raw.phone || '').trim();

  if (company_name.length < 2 || company_name.length > 150) {
    return { ok: false, status: 400, message: 'Nama usaha minimal 2 karakter' };
  }
  if (owner_name.length < 2 || owner_name.length > 100) {
    return { ok: false, status: 400, message: 'Nama pemilik minimal 2 karakter' };
  }
  if (!EMAIL_RE.test(email) || email.length > 150) {
    return { ok: false, status: 400, message: 'Email tidak valid' };
  }
  if (password.length < 8 || password.length > 128) {
    return { ok: false, status: 400, message: 'Password minimal 8 karakter' };
  }
  if (phone && !PHONE_RE.test(phone)) {
    return { ok: false, status: 400, message: 'Nomor telepon tidak valid' };
  }

  return {
    ok: true,
    data: {
      company_name,
      owner_name,
      email,
      password,
      phone: phone || null
    }
  };
}

async function uniqueSlug(base, excludeId) {
  const { Tenant } = models();
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
  const { Role } = models();
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

function publicSignupEnabled() {
  // Default off: mitra daftar di app.fiberix.my.id (server SAAS), bukan tenant Fiberix.
  const raw = String(process.env.PUBLIC_TENANT_SIGNUP == null ? '0' : process.env.PUBLIC_TENANT_SIGNUP).trim();
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'on';
}

function provisionKeyMatches(got, expected) {
  const exp = String(expected == null ? '' : expected);
  const rec = String(got == null ? '' : got);
  if (exp.length < 16) return false;
  const a = Buffer.from(rec);
  const b = Buffer.from(exp);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function platformTenantId() {
  const n = parseInt(process.env.FIBERIX_PLATFORM_TENANT_ID || '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Buat tenant Fiberix + user tenant_owner. Tidak menyentuh tenant platform (id 1).
 */
async function createMitraTenant(data, extra) {
  const { User, Tenant, sequelize } = models();
  const payload = data && typeof data === 'object' ? data : {};
  const exists = await User.findOne({ where: { email: payload.email } });
  if (exists) {
    const err = new Error('Email sudah terpakai');
    err.status = 400;
    throw err;
  }

  const role = await ensureTenantOwnerRole();
  const slug = await uniqueSlug(payload.slug || payload.company_name);
  const notes = (extra && extra.notes) || 'Provisioned from SAAS app.fiberix.my.id';

  return sequelize.transaction(async (t) => {
    const tenant = await Tenant.create({
      name: payload.company_name,
      slug,
      email: payload.email,
      phone: payload.phone || null,
      status: 'active',
      notes
    }, { transaction: t });

    const user = await User.create({
      name: payload.owner_name,
      email: payload.email,
      password: payload.password,
      phone: payload.phone || null,
      role_id: role.id,
      tenant_id: tenant.id,
      is_active: true
    }, { transaction: t });

    return { tenant, user };
  });
}

async function listMitraTenants() {
  const { Tenant, sequelize } = models();
  const pid = platformTenantId();
  const rows = await Tenant.findAll({
    where: { id: { [Op.ne]: pid } },
    order: [['created_at', 'DESC']]
  });

  const custCounts = await sequelize.query(
    `SELECT tenant_id,
            COUNT(*) AS customer_count,
            SUM(status='active') AS active_count
     FROM customers
     WHERE tenant_id IS NOT NULL AND tenant_id <> :pid
     GROUP BY tenant_id`,
    { replacements: { pid }, type: sequelize.QueryTypes.SELECT }
  );
  const unpaidCounts = await sequelize.query(
    `SELECT c.tenant_id,
            SUM(i.status IN ('unpaid','overdue')) AS unpaid_count
     FROM invoices i
     JOIN customers c ON c.id = i.customer_id
     WHERE c.tenant_id IS NOT NULL AND c.tenant_id <> :pid
     GROUP BY c.tenant_id`,
    { replacements: { pid }, type: sequelize.QueryTypes.SELECT }
  );

  const custMap = {};
  custCounts.forEach((r) => {
    custMap[r.tenant_id] = {
      customer_count: parseInt(r.customer_count || 0, 10),
      active_count: parseInt(r.active_count || 0, 10)
    };
  });
  const unpaidMap = {};
  unpaidCounts.forEach((r) => {
    unpaidMap[r.tenant_id] = parseInt(r.unpaid_count || 0, 10);
  });

  return rows.map((t) => {
    const json = t.toJSON();
    const c = custMap[t.id] || { customer_count: 0, active_count: 0 };
    return {
      id: json.id,
      name: json.name,
      slug: json.slug,
      email: json.email,
      phone: json.phone,
      status: json.status,
      notes: json.notes,
      created_at: json.created_at || json.createdAt,
      customer_count: c.customer_count,
      active_count: c.active_count,
      unpaid_count: unpaidMap[t.id] || 0
    };
  });
}

module.exports = {
  validateTenantSignup,
  uniqueSlug,
  ensureTenantOwnerRole,
  publicSignupEnabled,
  provisionKeyMatches,
  platformTenantId,
  createMitraTenant,
  listMitraTenants,
  EMAIL_RE,
  PHONE_RE
};
