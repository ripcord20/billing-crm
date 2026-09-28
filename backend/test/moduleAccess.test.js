'use strict';
const assert = require('assert');
const {
  hasModule,
  hasModuleForPath,
  findModuleByPath,
  grantedModuleKeys,
  isSuperadmin
} = require('../utils/moduleAccess');
const { SIDEBAR_MODULES, ALL_KEYS, MOBILE_DRAWER_MODULES, accountModuleForm } = require('../config/sidebarModules');

assert.ok(ALL_KEYS.includes('dashboard'));
assert.ok(ALL_KEYS.includes('collect'));
assert.ok(ALL_KEYS.includes('tenant'));
assert.ok(SIDEBAR_MODULES.every(m => m.name.startsWith('module.') && m.href && m.section));
assert.ok(MOBILE_DRAWER_MODULES.length >= 20);
assert.ok(MOBILE_DRAWER_MODULES.every(m => ALL_KEYS.includes(m.key) && m.href.startsWith('/mobile')));

const superReq = {
  user: { role: { name: 'superadmin', permissions: [] } },
  userPermissions: []
};
assert.strictEqual(isSuperadmin(superReq), true);
assert.strictEqual(hasModule(superReq, 'settings'), true);
assert.strictEqual(hasModuleForPath(superReq, '/isolir'), true);
assert.strictEqual(grantedModuleKeys(superReq).length, ALL_KEYS.length);

const financeReq = {
  user: { role: { name: 'finance' } },
  userPermissions: ['module.finance', 'module.customers', 'module.billing']
};
assert.strictEqual(hasModule(financeReq, 'finance'), true);
assert.strictEqual(hasModule(financeReq, 'nms'), false);
assert.strictEqual(hasModuleForPath(financeReq, '/customers/profile/12'), true);
assert.strictEqual(hasModuleForPath(financeReq, '/nms'), false);
assert.strictEqual(hasModuleForPath(financeReq, '/billing'), true);
assert.strictEqual(hasModuleForPath(financeReq, '/mobile/customers'), true);
assert.strictEqual(hasModuleForPath(financeReq, '/mobile/invoice'), true);
assert.strictEqual(hasModuleForPath(financeReq, '/mobile/noc'), false);

assert.strictEqual(findModuleByPath('/wa/templates').key, 'wa-templates');
assert.strictEqual(findModuleByPath('/invoice-broadcast').key, 'invoice-broadcast');
assert.strictEqual(findModuleByPath('/settings/users').key, 'settings');
assert.strictEqual(findModuleByPath('/api/customers/1').key, 'customers');
assert.strictEqual(findModuleByPath('/mobile').key, 'dashboard');
assert.strictEqual(findModuleByPath('/mobile/customers').key, 'customers');
assert.strictEqual(findModuleByPath('/mobile/invoice').key, 'billing');
assert.strictEqual(findModuleByPath('/mobile/roles').key, 'settings');
assert.strictEqual(findModuleByPath('/mobile/wa').key, 'whatsapp');
assert.strictEqual(findModuleByPath('/mobile/monitoring').key, 'traffic');
assert.strictEqual(findModuleByPath('/mobile/host').key, 'ping');
assert.strictEqual(findModuleByPath('/mobile/payment-new').key, 'payments');

const emptyReq = {
  user: { role: { name: 'sales' } },
  userPermissions: []
};
assert.strictEqual(hasModule(emptyReq, 'sales'), false);
assert.deepStrictEqual(grantedModuleKeys(emptyReq), []);

const adminEmpty = {
  user: { role: { name: 'admin' } },
  userPermissions: []
};
assert.strictEqual(hasModule(adminEmpty, 'settings'), true);

const form = accountModuleForm();
assert.strictEqual(form.length, ALL_KEYS.length);
assert.ok(form.every(m => m.actions[0].label === 'Lihat' && m.actions[0].perm === m.name));
const pelanggan = form.find(m => m.key === 'customers');
assert.strictEqual(pelanggan.actions.length, 4);
const billing = form.find(m => m.key === 'billing');
assert.strictEqual(billing.actions.length, 3);
const perangkat = form.find(m => m.key === 'devices');
assert.strictEqual(perangkat.actions.length, 4);
const dash = form.find(m => m.key === 'dashboard');
assert.strictEqual(dash.actions.length, 1);

const overrideReq = {
  user: {
    role: { name: 'finance' },
    module_access: { modules: ['tickets', 'whatsapp'], actions: [] }
  },
  userPermissions: ['module.finance', 'module.customers']
};
assert.strictEqual(hasModule(overrideReq, 'tickets'), true);
assert.strictEqual(hasModule(overrideReq, 'finance'), false);

console.log('moduleAccess.test.js OK');
