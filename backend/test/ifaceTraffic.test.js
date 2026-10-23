'use strict';
const assert = require('assert');
const {
  isSessionIfaceName,
  pickUplinkInterfaces,
  pickBusiestSample,
  avgSeries,
  maxSeries
} = require('../utils/ifaceTraffic');

assert.strictEqual(isSessionIfaceName('<pppoe-AGUS>'), true);
assert.strictEqual(isSessionIfaceName('pppoe-out1'), true);
assert.strictEqual(isSessionIfaceName('sfp-sfpplus1'), false);
assert.strictEqual(isSessionIfaceName('ether4'), false);
assert.strictEqual(isSessionIfaceName('bridge'), false);

const ifaces = [
  { name: '<pppoe-AGUS>', running: true, disabled: false, rxByte: 1e12, txByte: 1e12 },
  { name: 'ether5', running: true, disabled: false, rxByte: 100, txByte: 100 },
  { name: 'sfp-sfpplus1', running: true, disabled: false, rxByte: 2e13, txByte: 1e12 },
  { name: 'ether4', running: true, disabled: false, rxByte: 1e12, txByte: 1e13 }
];
const picked = pickUplinkInterfaces(ifaces, 5);
assert.deepStrictEqual(picked.map((i) => i.name), ['sfp-sfpplus1', 'ether4', 'ether5']);
assert.ok(!picked.some((i) => i.name.startsWith('<')));

const samples = [
  { name: 'ether4', rxBitsPerSecond: 11e6, txBitsPerSecond: 95e6 },
  { name: 'sfp-sfpplus1', rxBitsPerSecond: 189e6, txBitsPerSecond: 12e6 },
  { name: '<pppoe-AGUS>', rxBitsPerSecond: 50e6, txBitsPerSecond: 50e6 }
];
const best = pickBusiestSample(samples);
assert.strictEqual(best.name, 'sfp-sfpplus1');
assert.ok(best.rxBitsPerSecond > 180e6);

const summedRx = samples.reduce((s, x) => s + x.rxBitsPerSecond, 0);
assert.ok(summedRx > 240e6, 'sum semua iface harus lebih besar dari uplink tunggal');
assert.ok(best.rxBitsPerSecond < summedRx);

assert.strictEqual(maxSeries([0, 191.1, 80]).toFixed(1), '191.1');
assert.strictEqual(avgSeries([0, 100, 200]).toFixed(1), '100.0');
assert.ok(Number(avgSeries([191.1, 127.7, 0]).toFixed(1)) < 191.1);

console.log('✓ ifaceTraffic tests PASS');
