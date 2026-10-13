'use strict';

function roleNameOf(role) {
  return String(role || '').toLowerCase();
}

/** BillingRadius: modul RADIUS tidak tampil di billing, hanya NAS. */
function billingHidesRadiusModule() {
  return process.env.FIBERIX_FULL_RADIUS === '1' || process.env.BILLING_HIDE_RADIUS === '1';
}

/** Modul RADIUS (host/SQL FreeRADIUS) hanya pemilik platform, tidak di billing. */
function canSeeRadiusModule(role) {
  if (billingHidesRadiusModule()) return false;
  return ['superadmin', 'admin', 'noc'].includes(roleNameOf(role));
}

/** Modul NAS (perangkat MikroTik penyewa) untuk tenant + staf. */
function canSeeNasModule(role) {
  return ['superadmin', 'admin', 'finance', 'tenant_owner', 'noc'].includes(roleNameOf(role));
}

module.exports = { canSeeRadiusModule, canSeeNasModule, billingHidesRadiusModule };
