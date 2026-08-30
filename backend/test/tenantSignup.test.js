'use strict';

const assert = require('assert');
const {
  validateTenantSignup,
  publicSignupEnabled
} = require('../utils/tenantSignup');

const valid = {
  company_name: 'ISP Baru Jaya',
  owner_name: 'Budi Santoso',
  email: 'budi@ispbaru.id',
  password: 'rahasia12',
  phone: '081234567890'
};

const ok = validateTenantSignup(valid);
assert.strictEqual(ok.ok, true);
assert.strictEqual(ok.data.email, 'budi@ispbaru.id');
assert.strictEqual(ok.data.phone, '081234567890');

const viaName = validateTenantSignup({ ...valid, company_name: undefined, name: 'Net One' });
assert.strictEqual(viaName.ok, true);
assert.strictEqual(viaName.data.company_name, 'Net One');

assert.strictEqual(validateTenantSignup({ ...valid, company_name: 'A' }).ok, false);
assert.strictEqual(validateTenantSignup({ ...valid, owner_name: 'X' }).ok, false);
assert.strictEqual(validateTenantSignup({ ...valid, email: 'bukan-email' }).ok, false);
assert.strictEqual(validateTenantSignup({ ...valid, password: 'pendek' }).ok, false);
assert.strictEqual(validateTenantSignup({ ...valid, phone: 'abc' }).ok, false);
assert.strictEqual(validateTenantSignup({ ...valid, website: 'http://spam.test' }).ok, false);
assert.match(validateTenantSignup({ ...valid, website: 'x' }).message, /ditolak/);

const emailCase = validateTenantSignup({ ...valid, email: '  Budi@ISPBaru.ID  ' });
assert.strictEqual(emailCase.ok, true);
assert.strictEqual(emailCase.data.email, 'budi@ispbaru.id');

const noPhone = validateTenantSignup({ ...valid, phone: '' });
assert.strictEqual(noPhone.ok, true);
assert.strictEqual(noPhone.data.phone, null);

const prev = process.env.PUBLIC_TENANT_SIGNUP;
process.env.PUBLIC_TENANT_SIGNUP = '0';
assert.strictEqual(publicSignupEnabled(), false);
process.env.PUBLIC_TENANT_SIGNUP = '1';
assert.strictEqual(publicSignupEnabled(), true);
delete process.env.PUBLIC_TENANT_SIGNUP;
assert.strictEqual(publicSignupEnabled(), true);
if (prev === undefined) delete process.env.PUBLIC_TENANT_SIGNUP;
else process.env.PUBLIC_TENANT_SIGNUP = prev;

console.log('tenantSignup.test.js OK');
