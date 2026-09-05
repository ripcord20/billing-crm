'use strict';

const assert = require('assert');
const { resolveDevicesIdFromMaps } = require('../utils/customerRouter');

const devices = new Map([
  [1, { id: 1, name: 'GANANET', type: 'router' }],
  [4, { id: 4, name: 'SWX BULUSAN', type: 'switch' }],
  [5, { id: 5, name: 'ACS', type: 'switch' }],
  [8, { id: 8, name: 'CORE 1', type: 'router' }],
  [10, { id: 10, name: 'CORE 2 (WG)', type: 'router' }]
]);
const extensions = new Map([
  [1, 1],
  [4, 10],
  [5, 8]
]);
const maps = { devices, extensions };

assert.strictEqual(resolveDevicesIdFromMaps(5, maps), 8, 'isolir 5 (CORE 1) jangan jadi ACS');
assert.strictEqual(resolveDevicesIdFromMaps(4, maps), 10, 'isolir 4 (CORE 2) jangan jadi SWX');
assert.strictEqual(resolveDevicesIdFromMaps(1, maps), 1, 'GANANET id sama di kedua tabel');
assert.strictEqual(resolveDevicesIdFromMaps(8, maps), 8, 'devices.id CORE 1 tetap CORE 1');
assert.strictEqual(resolveDevicesIdFromMaps(10, maps), 10, 'devices.id CORE 2 tetap CORE 2');
assert.strictEqual(resolveDevicesIdFromMaps('', maps), null);
assert.strictEqual(resolveDevicesIdFromMaps(null, maps), null);

console.log('✓ customerRouter ID collision tests PASS');
