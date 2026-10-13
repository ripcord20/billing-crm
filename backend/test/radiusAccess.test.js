'use strict';
const assert = require('assert');
const { canSeeRadiusModule, canSeeNasModule } = require('../utils/radiusAccess');

assert.strictEqual(canSeeRadiusModule('tenant_owner'), false);
assert.strictEqual(canSeeRadiusModule('finance'), false);
assert.strictEqual(canSeeRadiusModule('superadmin'), true);
assert.strictEqual(canSeeRadiusModule('admin'), true);
assert.strictEqual(canSeeRadiusModule('noc'), true);

assert.strictEqual(canSeeNasModule('tenant_owner'), true);
assert.strictEqual(canSeeNasModule('superadmin'), true);
assert.strictEqual(canSeeNasModule('collector'), false);

console.log('radiusAccess.test.js ok');
