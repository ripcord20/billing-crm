'use strict';
const assert = require('assert');
const {
  sessionLookupKeys,
  indexSessionsByName,
  findSession
} = require('../utils/pppoeSessionMatch');

assert.deepStrictEqual(sessionLookupKeys('Sakina1'), ['sakina1']);
assert.deepStrictEqual(sessionLookupKeys('Rossy@0000273'), ['rossy@0000273', 'rossy']);

const sessions = [
  { name: 'Sakina1', address: '10.2.64.2' },
  { name: 'Rossy@0000273', address: '10.2.64.9' },
  { name: 'joko', address: '10.2.64.11' }
];
const map = indexSessionsByName(sessions);

assert.strictEqual(findSession(map, 'Sakina1').name, 'Sakina1');
assert.strictEqual(findSession(map, 'sakina1').name, 'Sakina1');
assert.ok(!findSession(map, 'Sakina'), 'nama tanpa angka tidak boleh nyangkut ke Sakina1');
assert.strictEqual(findSession(map, 'Rossy').name, 'Rossy@0000273');
assert.ok(!findSession(map, 'TidakAda'));

console.log('pppoeSessionMatch.test.js OK');
