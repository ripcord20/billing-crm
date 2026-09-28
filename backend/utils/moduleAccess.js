'use strict';

const { SIDEBAR_MODULES } = require('../config/sidebarModules');

const MODULE_PREFIX = 'module.';

function roleName(reqOrUser) {
  const user = reqOrUser?.user || reqOrUser;
  return (user?.role?.name || '').toLowerCase();
}

function permissionList(reqOrUser) {
  if (Array.isArray(reqOrUser?.userPermissions)) return reqOrUser.userPermissions;
  const user = reqOrUser?.user || reqOrUser;
  return user?.role?.permissions?.map(p => p.name) || [];
}

function isSuperadmin(reqOrUser) {
  return roleName(reqOrUser) === 'superadmin';
}

function grantedModuleKeys(reqOrUser) {
  if (isSuperadmin(reqOrUser)) return SIDEBAR_MODULES.map(m => m.key);
  const names = new Set(permissionList(reqOrUser));
  const keys = SIDEBAR_MODULES.filter(m => names.has(m.name)).map(m => m.key);
  if (keys.length) return keys;
  // Jangan mengunci admin dari Settings jika seed belum jalan.
  if (roleName(reqOrUser) === 'admin') return SIDEBAR_MODULES.map(m => m.key);
  return keys;
}

function hasModule(reqOrUser, key) {
  if (!key) return false;
  if (isSuperadmin(reqOrUser)) return true;
  return grantedModuleKeys(reqOrUser).includes(key);
}

function normalizePath(pathname) {
  if (!pathname) return '/';
  let p = String(pathname).split('?')[0].split('#')[0];
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (p.startsWith('/api/')) p = p.slice(4);
  return p || '/';
}

function findModuleByPath(pathname) {
  const path = normalizePath(pathname);
  let best = null;
  let bestLen = -1;
  for (const mod of SIDEBAR_MODULES) {
    const candidates = [mod.href, ...(mod.prefixes || [])];
    for (const prefix of candidates) {
      if (!prefix) continue;
      const match = path === prefix || path.startsWith(prefix + '/');
      if (match && prefix.length > bestLen) {
        best = mod;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

function hasModuleForPath(reqOrUser, pathname) {
  if (isSuperadmin(reqOrUser)) return true;
  const mod = findModuleByPath(pathname);
  if (!mod) return false;
  return hasModule(reqOrUser, mod.key);
}

function attachLocals(req, res) {
  const keys = grantedModuleKeys(req);
  const set = new Set(keys);
  res.locals.moduleKeys = keys;
  res.locals.canModule = (key) => isSuperadmin(req) || set.has(key);
}

module.exports = {
  MODULE_PREFIX,
  roleName,
  permissionList,
  isSuperadmin,
  hasModule,
  grantedModuleKeys,
  findModuleByPath,
  hasModuleForPath,
  attachLocals
};
