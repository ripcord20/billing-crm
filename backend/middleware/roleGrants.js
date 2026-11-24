'use strict';

/**
 * Izin yang melekat ke role tertentu tanpa seed permission di DB.
 * Dipakai hasPermission() di auth.js.
 *
 * NOC: daftar & kelola data pelanggan (view/create/update), tanpa hapus.
 * Billing/invoice/payment tetap ditutup lewat prefix API + allowFinanceArea.
 */
const ROLE_GRANTS = {
  finance: ['customer_view', 'customer_create', 'customer_update', 'customer_delete'],
  tenant_owner: ['customer_view', 'customer_create', 'customer_update'],
  noc: ['customer_view', 'customer_create', 'customer_update'],
};

function grantsForRole(roleName) {
  return ROLE_GRANTS[String(roleName || '').toLowerCase()] || [];
}

function roleHasGrant(roleName, permission) {
  return grantsForRole(roleName).includes(permission);
}

module.exports = { ROLE_GRANTS, grantsForRole, roleHasGrant };
