'use strict';
const assert = require('assert');
const { parseDbmNumber, scaleOpticalRaw, formatDbm } = require('../utils/opticalDbm');

assert.strictEqual(scaleOpticalRaw(-22678), -22.678, 'millidBm SNMP');
assert.strictEqual(scaleOpticalRaw(-2300), -23, 'centidBm integer (SNMP G02 kasar)');
assert.strictEqual(scaleOpticalRaw(-2268), -22.68, 'centidBm 2 desimal');
assert.strictEqual(scaleOpticalRaw(189), 1.89, 'TX 0.01 dBm');
assert.strictEqual(scaleOpticalRaw(-22.678), -22.678, 'sudah dBm');
assert.strictEqual(scaleOpticalRaw(-2147483648), null, 'sentinel');

assert.strictEqual(parseDbmNumber('-22.6780 dBm'), -22.678);
assert.strictEqual(parseDbmNumber('2.3760 dBm'), 2.376);
assert.strictEqual(parseDbmNumber('-27.9588 dBm'), -27.9588);
assert.strictEqual(parseDbmNumber('LOS'), null);
assert.strictEqual(parseDbmNumber(null), null);

assert.strictEqual(formatDbm(-22.678), '-22.678');
assert.strictEqual(formatDbm(-22.68), '-22.68');
assert.strictEqual(formatDbm(-23), '-23.00');
assert.strictEqual(formatDbm(-16.65), '-16.65');

console.log('✓ opticalDbm tests PASS');
