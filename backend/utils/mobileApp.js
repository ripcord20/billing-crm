'use strict';

/**
 * Deteksi APK Capacitor / Android WebView dari User-Agent.
 * Chrome WebView menyertakan "; wv)" — browser Chrome biasa tidak.
 * APK Fiberix memakai UA "Fiberix/1.0" atau "FiberixBilling/n".
 */
function isMobileAppUserAgent(ua) {
  const s = String(ua || '');
  return /;\s*wv\)/i.test(s) || /Capacitor/i.test(s) || /Fiberix(?:Billing)?\/\d/i.test(s) || /\bFiberix\b/i.test(s);
}

/**
 * Home APK = sama dengan browser (dashboard / noc / collect/field, …).
 * Jangan arahkan ke /mobile — itu shell ringkas, bukan tampilan yang dipakai operator.
 */
function homePathForMobileApp(_roleName, _ua) {
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
