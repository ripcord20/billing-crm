const { isTenantOwner, homePathForRole } = require('../utils/tenantScope');

function _role(req) {
  return (req.user?.role?.name || '').toLowerCase();
}

function allowTenantArea(req, res, next) {
  if (!req.user) return res.redirect('/login');
  const r = _role(req);
  if (r === 'superadmin' || r === 'admin' || r === 'tenant_owner') return next();
  return res.redirect(homePathForRole(r));
}

function blockTenantOwner(req, res, next) {
  if (!req.user) return res.redirect('/login');
  if (isTenantOwner(req)) return res.redirect('/tenant');
  next();
}

function apiBlockTenantOwner(req, res, next) {
  if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
  if (isTenantOwner(req)) {
    return res.status(403).json({ success: false, message: 'Modul ini tidak tersedia untuk pemilik tenant' });
  }
  next();
}

module.exports = {
  allowTenantArea,
  blockTenantOwner,
  apiBlockTenantOwner
};
