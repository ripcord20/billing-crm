'use strict';

const assert = require('assert');
const { rateFromDelta, combineMonitorBits, ifaceRxTxBytes } = require('../utils/interfaceTrafficRate');

const now = 10_000;
assert.deepStrictEqual(rateFromDelta(null, { rx: 100, tx: 10, at: now }, now), { rxBps: 0, txBps: 0, ok: false });
const prev = { rx: 1_000_000, tx: 100_000, at: now - 1000 };
const next = { rx: 2_000_000, tx: 150_000, at: now };
const rate = rateFromDelta(prev, next, now);
assert.strictEqual(rate.ok, true);
assert.strictEqual(rate.rxBps, 8_000_000);
assert.strictEqual(rate.txBps, 400_000);
assert.notStrictEqual(rate.rxBps, rate.txBps);

const bits = combineMonitorBits({
  'rx-bits-per-second': 1000,
  'fp-rx-bits-per-second': 9_000_000,
  'tx-bits-per-second': 1000,
  'fp-tx-bits-per-second': 400_000
});
assert.strictEqual(bits.rxBitsPerSecond, 9_001_000);
assert.strictEqual(bits.txBitsPerSecond, 401_000);

assert.deepStrictEqual(ifaceRxTxBytes({ 'rx-byte': 10, 'tx-byte': 2 }), { rx: 10, tx: 2 });

console.log('interface-traffic-rate.test.js OK');
