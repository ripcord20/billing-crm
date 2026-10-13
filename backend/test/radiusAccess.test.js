'use strict';
const assert = require('assert');
const { canSeeRadiusModule, canSeeNasModule, billingHidesRadiusModule } = require('../utils/radiusAccess');

const prevFull = process.env.FIBERIX_FULL_RADIUS;
const prevHide = process.env.BILLING_HIDE_RADIUS;
delete process.env.FIBERIX_FULL_RADIUS;
delete process.env.BILLING_HIDE_RADIUS;

assert.strictEqual(billingHidesRadiusModule(), false);
assert.strictEqual(canSeeRadiusModule('tenant_owner'), false);
assert.strictEqual(canSeeRadiusModule('finance'), false);
assert.strictEqual(canSeeRadiusModule('superadmin'), true);
assert.strictEqual(canSeeRadiusModule('admin'), true);
assert.strictEqual(canSeeRadiusModule('noc'), true);

process.env.FIBERIX_FULL_RADIUS = '1';
assert.strictEqual(billingHidesRadiusModule(), true);
assert.strictEqual(canSeeRadiusModule('superadmin'), false);
assert.strictEqual(canSeeRadiusModule('admin'), false);
assert.strictEqual(canSeeNasModule('admin'), true);
delete process.env.FIBERIX_FULL_RADIUS;

assert.strictEqual(canSeeNasModule('tenant_owner'), true);
assert.strictEqual(canSeeNasModule('superadmin'), true);
assert.strictEqual(canSeeNasModule('collector'), false);

if (prevFull === undefined) delete process.env.FIBERIX_FULL_RADIUS;
else process.env.FIBERIX_FULL_RADIUS = prevFull;
if (prevHide === undefined) delete process.env.BILLING_HIDE_RADIUS;
else process.env.BILLING_HIDE_RADIUS = prevHide;

console.log('radiusAccess.test.js ok');
