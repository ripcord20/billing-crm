'use strict';

const { homePathForRole } = require('./tenantScope');

function isFiberixAndroidApp(req) {
  const ua = String((req && req.headers && req.headers['user-agent']) || '');
  return /Fiberix(?:Billing)?\/\d/i.test(ua);
}

/**
 * APK WebView memakai situs yang sama dengan browser.
 * Home mengikuti peran (dashboard / noc / sales / …), bukan /mobile.
 */
function appHomePath(roleName, req) {
  return homePathForRole(roleName);
}

module.exports = { isFiberixAndroidApp, appHomePath };
