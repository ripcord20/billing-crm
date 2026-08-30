'use strict';
const assert = require('assert');
const {
  getTenantId,
  applyTenantWhere,
  applyTenantSql,
  assertCustomerTenant,
  slugify,
  homePathForRole,
  isTenantOwner
} = require('../utils/tenantScope');

assert.strictEqual(slugify('ISP Baru Jaya'), 'isp-baru-jaya');
assert.strictEqual(slugify('  '), 'tenant');
assert.strictEqual(homePathForRole('tenant_owner'), '/tenant');
assert.strictEqual(homePathForRole('superadmin'), '/dashboard');

const ownerReq = { user: { tenant_id: 7, role: { name: 'tenant_owner' } } };
assert.strictEqual(isTenantOwner(ownerReq), true);
assert.strictEqual(getTenantId(ownerReq), 7);
assert.deepStrictEqual(applyTenantWhere(ownerReq, { status: 'active' }), { status: 'active', tenant_id: 7 });
assert.strictEqual(applyTenantSql(ownerReq, 'c').sql, ' AND c.tenant_id = :_tenantId');
assert.strictEqual(applyTenantSql(ownerReq, 'c').replacements._tenantId, 7);
assert.strictEqual(assertCustomerTenant(ownerReq, { tenant_id: 7 }), true);
assert.strictEqual(assertCustomerTenant(ownerReq, { tenant_id: 2 }), false);

const adminReq = { user: { role: { name: 'admin' } }, query: { tenant_id: '3' }, body: {} };
assert.strictEqual(getTenantId(adminReq), 3);
assert.strictEqual(getTenantId({ user: { role: { name: 'admin' } }, query: {}, body: {} }), null);
assert.strictEqual(getTenantId({ user: { role: { name: 'finance' } }, query: { tenant_id: 9 }, body: {} }), null);

const ownerNoTenant = { user: { role: { name: 'tenant_owner' } } };
assert.strictEqual(getTenantId(ownerNoTenant), null);

console.log('tenantScope.test.js OK');
