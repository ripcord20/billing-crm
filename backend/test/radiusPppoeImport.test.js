'use strict';
const assert = require('assert');
const { pppoeRowsMissingFromRadcheck } = require('../utils/radiusPppoeImport');

const rows = [
  { id: 1, pppoe_username: 'ada', pppoe_password: 'x', isolir_status: 'active' },
  { id: 2, pppoe_username: 'baru', pppoe_password: 'secret', isolir_status: 'active' },
  { id: 3, pppoe_username: 'kosong', pppoe_password: '', isolir_status: 'active' },
  { id: 4, pppoe_username: '  trim  ', pppoe_password: 'p', isolir_status: 'isolated' }
];
const missing = pppoeRowsMissingFromRadcheck(rows, ['ada']);
assert.deepStrictEqual(
  missing.map((r) => r.pppoe_username),
  ['baru', 'trim']
);
assert.strictEqual(missing[1].isolir_status, 'isolated');
assert.strictEqual(pppoeRowsMissingFromRadcheck([], ['ada']).length, 0);

console.log('radiusPppoeImport.test.js ok');
