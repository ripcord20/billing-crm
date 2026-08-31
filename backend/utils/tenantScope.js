'use strict';

function roleNameOf(reqOrUser) {
  if (!reqOrUser) return '';
  const role = reqOrUser.role?.name || reqOrUser.user?.role?.name || '';
  return String(role).toLowerCase();
}

function isTenantOwner(req) {
  return roleNameOf(req) === 'tenant_owner';
}

function isPlatformAdmin(req) {
  const r = roleNameOf(req);
  return r === 'superadmin' || r === 'admin';
}

function getTenantId(req) {
  if (!req) return null;
  if (isTenantOwner(req)) {
    const id = parseInt(req.user?.tenant_id, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  if (isPlatformAdmin(req)) {
    const raw = req.query?.tenant_id || req.body?.tenant_id;
    const id = parseInt(raw, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
  }
  return null;
}

function applyTenantWhere(req, where) {
  const next = where && typeof where === 'object' ? where : {};
  const tid = getTenantId(req);
  if (tid) next.tenant_id = tid;
  return next;
}

function stampTenant(req, data) {
  const next = data && typeof data === 'object' ? data : {};
  const tid = getTenantId(req);
  if (tid && next.tenant_id == null) next.tenant_id = tid;
  return next;
}

function applyTenantSql(req, alias) {
  const col = (alias ? alias + '.' : '') + 'tenant_id';
  const tid = getTenantId(req);
  if (!tid) return { sql: '', replacements: {} };
  return { sql: ` AND ${col} = :_tenantId`, replacements: { _tenantId: tid } };
}

function assertCustomerTenant(req, customer) {
  const tid = getTenantId(req);
  if (!tid) return true;
  if (!customer) return false;
  return Number(customer.tenant_id) === tid;
}

function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'tenant';
}

function homePathForRole(roleName) {
  const r = String(roleName || '').toLowerCase();
  if (r === 'technician') return '/technician';
  if (r === 'collector') return '/collect/field';
  if (r === 'finance') return '/finance';
  if (r === 'noc') return '/noc';
  if (r === 'sales') return '/sales';
  if (r === 'tenant_owner') return '/dashboard';
  return '/dashboard';
}

module.exports = {
  roleNameOf,
  isTenantOwner,
  isPlatformAdmin,
  getTenantId,
  applyTenantWhere,
  stampTenant,
  applyTenantSql,
  assertCustomerTenant,
  slugify,
  homePathForRole
};
