'use strict';
const assert = require('assert');
const { attachCustomerQuota } = require('../utils/customerQuota');

const rows = [
  { id: 1, name: 'ERNI' },
  { id: 2, name: 'ALFIN' },
  { id: 3, name: 'Tanpa Queue' },
];
const snap = [
  { id: 1, bytesDown: 2147483648, bytesUp: 104857600, queueName: '<pppoe-erni>' },
  { id: 2, bytesDown: 0, bytesUp: 0, queueName: null },
];

attachCustomerQuota(rows, snap);

assert.strictEqual(rows[0].quota_used.download, 2147483648);
assert.strictEqual(rows[0].quota_used.upload, 104857600);
assert.strictEqual(rows[0].quota_used.total, 2147483648 + 104857600);
assert.strictEqual(rows[0].quota_used.has_data, true);

assert.strictEqual(rows[1].quota_used.total, 0);
assert.strictEqual(rows[1].quota_used.has_data, false);

assert.strictEqual(rows[2].quota_used.has_data, false);
assert.strictEqual(rows[2].quota_used.total, 0);

attachCustomerQuota(rows, null);
assert.ok(rows[0].quota_used);

console.log('customerQuota.test.js OK');
