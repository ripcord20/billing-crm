'use strict';

function roleNameOf(role) {
  return String(role || '').toLowerCase();
}

/** Modul RADIUS (host/SQL FreeRADIUS) hanya pemilik platform. */
function canSeeRadiusModule(role) {
  return ['superadmin', 'admin', 'noc'].includes(roleNameOf(role));
}

/** Modul NAS (perangkat MikroTik penyewa) untuk tenant + staf. */
function canSeeNasModule(role) {
  return ['superadmin', 'admin', 'finance', 'tenant_owner', 'noc'].includes(roleNameOf(role));
}

module.exports = { canSeeRadiusModule, canSeeNasModule };
