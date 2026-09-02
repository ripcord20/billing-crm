'use strict';
const assert = require('assert');
const { isFiberixAndroidApp, appHomePath } = require('../utils/fiberixApp');

assert.strictEqual(isFiberixAndroidApp({ headers: { 'user-agent': 'Mozilla/5.0' } }), false);
assert.strictEqual(isFiberixAndroidApp({
  headers: { 'user-agent': 'Mozilla/5.0 FiberixBilling/1.0 Android' }
}), true);
assert.strictEqual(isFiberixAndroidApp({
  headers: { 'user-agent': 'Mozilla/5.0 Chrome Fiberix/2.0' }
}), true);

const appReq = { headers: { 'user-agent': 'Fiberix/2.0' } };
assert.strictEqual(appHomePath('superadmin', appReq), '/dashboard');
assert.strictEqual(appHomePath('admin', appReq), '/dashboard');
assert.strictEqual(appHomePath('tenant_owner', appReq), '/tenant');
assert.strictEqual(appHomePath('technician', appReq), '/technician');
assert.strictEqual(appHomePath('sales', appReq), '/sales');
assert.strictEqual(appHomePath('superadmin', { headers: { 'user-agent': 'Chrome' } }), '/dashboard');

console.log('fiberixApp.test.js OK');
