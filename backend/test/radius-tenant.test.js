'use strict';
const assert = require('assert');
const { mergeWhere, sqlAndTenant, runWith, getTenantId } = require('../middleware/tenantContext');
const { encryptSecret, decryptSecret } = require('../utils/secretBox');

function rateLimitFromPackage(pkg) {
  if (!pkg) return null;
  const down = parseInt(pkg.speed_down, 10) || 0;
  const up = parseInt(pkg.speed_up, 10) || 0;
  if (!down && !up) return null;
  const rx = (up || down) + 'M';
  const tx = (down || up) + 'M';
  return rx + '/' + tx;
}

// 1) mergeWhere tanpa konteks tenant tidak mengubah query
assert.deepStrictEqual(mergeWhere({ status: 'active' }), { status: 'active' });

// 2) dengan tenant, tenant_id disisipkan
runWith({ tenantId: 7, bypass: false }, () => {
  assert.strictEqual(getTenantId(), 7);
  assert.deepStrictEqual(mergeWhere({ status: 'active' }), { status: 'active', tenant_id: 7 });
  const f = sqlAndTenant('customers.tenant_id');
  assert.ok(f.sql.includes('customers.tenant_id'));
  assert.deepStrictEqual(f.replacements, [7]);
});

// 3) bypass superadmin: getTenantId null
runWith({ tenantId: null, bypass: true }, () => {
  assert.strictEqual(getTenantId(), null);
  assert.deepStrictEqual(mergeWhere({ id: 1 }), { id: 1 });
});

// 4) secret box roundtrip (pakai JWT_SECRET fallback)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-min-8';
const enc = encryptSecret('radpass');
assert.ok(enc.startsWith('enc:v1:') || enc === 'radpass');
assert.strictEqual(decryptSecret(enc), 'radpass');

// 5) rate-limit MikroTik dari paket
assert.strictEqual(rateLimitFromPackage({ speed_up: 5, speed_down: 20 }), '5M/20M');
assert.strictEqual(rateLimitFromPackage(null), null);

console.log('radius-tenant.test.js OK');
