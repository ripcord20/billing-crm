'use strict';

/**
 * Multi-tenant request context (AsyncLocalStorage).
 *
 * Superadmin / admin tanpa header: tidak memfilter (lihat semua data lama).
 * Role tenant_owner: selalu di-scope ke users.tenant_id.
 * Superadmin boleh impersonasi tenant via header X-Tenant-Id atau ?tenant_id=
 *
 * Isolasi data memakai hook Sequelize beforeFind/beforeCreate pada model
 * yang punya kolom tenant_id. Query SQL mentah harus memakai sqlAndTenant().
 */

const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

function getStore() {
  return als.getStore() || null;
}

function getTenantId() {
  const s = getStore();
  if (!s || s.bypass) return null;
  return s.tenantId || null;
}

function isTenantScoped() {
  return !!getTenantId();
}

function sqlAndTenant(column = 'tenant_id') {
  const tid = getTenantId();
  if (!tid) return { sql: '', replacements: [] };
  return {
    sql: ` AND ${column} = ? `,
    replacements: [tid]
  };
}

function mergeWhere(where) {
  const tid = getTenantId();
  if (!tid) return where || {};
  const next = Object.assign({}, where || {});
  if (next.tenant_id === undefined) next.tenant_id = tid;
  return next;
}

function runWith(store, fn) {
  return als.run(store, fn);
}

function _roleName(req) {
  return (req.user?.role?.name || '').toLowerCase();
}

function isPlatformAdmin(req) {
  const r = _roleName(req);
  return r === 'superadmin' || r === 'admin';
}

function isTenantOwner(req) {
  return _roleName(req) === 'tenant_owner';
}

/**
 * Pasang di app.use('/api') dan web routes setelah authenticate.
 * Aman dipanggil tanpa user (no-op).
 */
function buildStoreFromReq(req) {
  const user = req.user;
  if (!user) return { tenantId: null, bypass: true, role: '', userId: null };
  const role = _roleName(req);
  let tenantId = user.tenant_id || null;
  let bypass = false;

  if (role === 'tenant_owner') {
    bypass = false;
  } else if (role === 'superadmin' || role === 'admin') {
    const headerTid = req.get && (req.get('x-tenant-id') || req.query?.tenant_id);
    if (headerTid && String(headerTid).match(/^\d+$/)) {
      tenantId = parseInt(headerTid, 10);
    } else {
      tenantId = null;
      bypass = true;
    }
  } else if (!tenantId) {
    bypass = true;
  }
  return { tenantId, bypass, role, userId: user.id };
}

function applyToRequest(req, next) {
  const store = buildStoreFromReq(req);
  req.tenantId = store.tenantId;
  req.tenantBypass = store.bypass;
  if (store.role === 'tenant_owner' && !store.tenantId) {
    const isApi = !!(req.xhr
      || req.headers?.accept?.includes('application/json')
      || String(req.originalUrl || '').startsWith('/api'));
    if (isApi) {
      return req.res.status(403).json({ success: false, message: 'Akun owner tenant belum terhubung ke tenant' });
    }
    return req.res.status(403).render('pages/403', {
      title: 'Akses Ditolak', layout: false,
      message: 'Akun owner belum terhubung ke tenant.'
    });
  }
  als.run(store, () => next());
}

function tenantContextMiddleware(req, res, next) {
  if (!req.user) return next();
  applyToRequest(req, next);
}

function attachTenantHooks(Model) {
  if (!Model || !Model.addHook) return;
  Model.addHook('beforeFind', (options) => {
    const tid = getTenantId();
    if (!tid) return;
    options.where = options.where || {};
    if (options.where.tenant_id === undefined) {
      options.where.tenant_id = tid;
    }
  });
  Model.addHook('beforeCount', (options) => {
    const tid = getTenantId();
    if (!tid) return;
    options.where = options.where || {};
    if (options.where.tenant_id === undefined) {
      options.where.tenant_id = tid;
    }
  });
  Model.addHook('beforeCreate', (instance) => {
    const tid = getTenantId();
    if (!tid) return;
    if (instance.tenant_id == null) instance.tenant_id = tid;
  });
  Model.addHook('beforeBulkCreate', (instances) => {
    const tid = getTenantId();
    if (!tid || !Array.isArray(instances)) return;
    for (const instance of instances) {
      if (instance.tenant_id == null) instance.tenant_id = tid;
    }
  });
}

function tenantOpFilter() {
  const tid = getTenantId();
  if (!tid) return {};
  return { tenant_id: tid };
}

module.exports = {
  als,
  getStore,
  getTenantId,
  isTenantScoped,
  sqlAndTenant,
  mergeWhere,
  runWith,
  tenantContextMiddleware,
  applyToRequest,
  buildStoreFromReq,
  attachTenantHooks,
  tenantOpFilter,
  isPlatformAdmin,
  isTenantOwner
};
