'use strict';

/**
 * Deteksi APK Capacitor / Android WebView dari User-Agent.
 * Chrome WebView menyertakan "; wv)" — browser Chrome biasa tidak.
 */
function isMobileAppUserAgent(ua) {
  const s = String(ua || '');
  return /;\s*wv\)/i.test(s) || /Capacitor/i.test(s) || /\bFiberix\b/i.test(s);
}

/**
 * Home path khusus APK. Admin/superadmin ke shell /mobile.
 * Role lain (collector, finance, …) tetap pakai homePathForRole.
 * Return null kalau bukan APK / bukan role shell.
 */
function homePathForMobileApp(roleName, ua) {
  if (!isMobileAppUserAgent(ua)) return null;
  const r = String(roleName || '').toLowerCase();
  if (r === 'superadmin' || r === 'admin') return '/mobile';
  return null;
}

function resolveAppHomePath(roleName, ua, fallbackHome) {
  return homePathForMobileApp(roleName, ua) || fallbackHome;
}

module.exports = {
  isMobileAppUserAgent,
  homePathForMobileApp,
  resolveAppHomePath
};
