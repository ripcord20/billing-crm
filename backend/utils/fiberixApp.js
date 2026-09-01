'use strict';

const { homePathForRole } = require('./tenantScope');

function isFiberixAndroidApp(req) {
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  return /FiberixBilling/i.test(ua);
}

/**
 * APK WebView: admin/owner masuk ke /mobile, role lain tetap home masing-masing.
 */
function appHomePath(roleName, req) {
  const r = String(roleName || '').toLowerCase();
  if (isFiberixAndroidApp(req) && (r === 'admin' || r === 'superadmin')) {
    return '/mobile';
  }
  return homePathForRole(roleName);
}

module.exports = { isFiberixAndroidApp, appHomePath };
