'use strict';
const assert = require('assert');
const {
  attachCustomerQuota,
  parsePppoeKey,
  indexPppoeInterfaces,
  resolveUsedBytes,
} = require('../utils/customerQuota');

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

assert.strictEqual(parsePppoeKey('<pppoe-Astuti>'), 'astuti');
assert.strictEqual(parsePppoeKey('<pppoe-Yeyen@0000583>'), 'yeyen@0000583');
assert.strictEqual(parsePppoeKey('ether1'), null);

const byUser = indexPppoeInterfaces([
  { name: '<pppoe-Astuti>', 'rx-byte': '100', 'tx-byte': '2000' },
  { name: '<pppoe-Astuti-2>', 'rx-byte': '50', 'tx-byte': '300' },
  { name: 'ether1', 'rx-byte': '9', 'tx-byte': '9' },
]);
assert.strictEqual(byUser.astuti.rx, 150);
assert.strictEqual(byUser.astuti.tx, 2300);

const fromQueue = resolveUsedBytes({ bytesIn: '500', bytesOut: '40' }, { rx: 1, tx: 2 });
assert.strictEqual(fromQueue.download, 500);
assert.strictEqual(fromQueue.upload, 40);

const fromIface = resolveUsedBytes({ bytesIn: '0', bytesOut: '0' }, { rx: 12374695847, tx: 193307414040 });
assert.strictEqual(fromIface.download, 193307414040);
assert.strictEqual(fromIface.upload, 12374695847);

console.log('customerQuota.test.js OK');
