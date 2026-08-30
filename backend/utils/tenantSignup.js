'use strict';

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
  const raw = String(process.env.PUBLIC_TENANT_SIGNUP == null ? '1' : process.env.PUBLIC_TENANT_SIGNUP).trim();
  return raw !== '0' && raw.toLowerCase() !== 'false' && raw.toLowerCase() !== 'off';
}

module.exports = {
  validateTenantSignup,
  uniqueSlug,
  ensureTenantOwnerRole,
  publicSignupEnabled,
  EMAIL_RE,
  PHONE_RE
};
