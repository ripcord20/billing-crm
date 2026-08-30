'use strict';
const assert = require('assert');
const {
  rosTrue,
  parseCounter,
  ifaceRxTxBytes,
  combineMonitorBits,
  rateFromDelta
} = require('../utils/interfaceTrafficRate');

assert.strictEqual(rosTrue(true), true);
assert.strictEqual(rosTrue('true'), true);
assert.strictEqual(rosTrue('false'), false);
assert.strictEqual(rosTrue(false), false);

assert.strictEqual(parseCounter('1200'), 1200);
assert.strictEqual(parseCounter(undefined), 0);

const mon = combineMonitorBits({
  'rx-bits-per-second': '1000',
  'tx-bits-per-second': '200',
  'fp-rx-bits-per-second': '50000',
  'fp-tx-bits-per-second': '3000'
});
assert.strictEqual(mon.rxBitsPerSecond, 51000);
assert.strictEqual(mon.txBitsPerSecond, 3200);
assert.notStrictEqual(mon.rxBitsPerSecond, mon.txBitsPerSecond);

const slowOnly = combineMonitorBits({
  'rx-bits-per-second': '80',
  'tx-bits-per-second': '80'
});
assert.strictEqual(slowOnly.rxBitsPerSecond, 80);
assert.strictEqual(slowOnly.txBitsPerSecond, 80);

const t0 = 1_000_000;
const prev = { rx: 1_000_000, tx: 100_000, at: t0 };
const next = { rx: 1_000_000 + 1_250_000, tx: 100_000 + 125_000 };
const rate = rateFromDelta(prev, next, t0 + 1000);
assert.strictEqual(rate.ok, true);
assert.strictEqual(rate.rxBps, 1_250_000 * 8);
assert.strictEqual(rate.txBps, 125_000 * 8);
assert.ok(rate.rxBps !== rate.txBps);

assert.strictEqual(rateFromDelta(null, next, t0).ok, false);
assert.strictEqual(rateFromDelta(prev, { rx: 10, tx: 10 }, t0 + 1000).ok, false);

assert.deepStrictEqual(ifaceRxTxBytes({ 'rx-byte': '9000', 'tx-byte': '1000' }), { rx: 9000, tx: 1000 });
assert.deepStrictEqual(ifaceRxTxBytes({ 'rx-bytes': 50, 'tx-bytes': 7 }), { rx: 50, tx: 7 });
assert.deepStrictEqual(ifaceRxTxBytes({ 'fp-rx-byte': '400', 'fp-tx-byte': '20' }), { rx: 400, tx: 20 });

console.log('interfaceTrafficRate.test.js OK');
