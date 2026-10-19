'use strict';
const assert = require('assert');
const {
  classifyPayment, feeForKind, oilPeriodKey, oilPeriodLabel, monthPeriodKey, normalizeSettings
} = require('../utils/fieldIncentiveRules');

assert.strictEqual(classifyPayment({ collectedBy: null }), null);
assert.strictEqual(classifyPayment({ collectedBy: 3, invoiceIsStopFinal: false }), 'tagihan');
assert.strictEqual(classifyPayment({ collectedBy: 3, invoiceIsStopFinal: true }), 'sisa');
assert.strictEqual(classifyPayment({
  collectedBy: 3, customerStoppedAt: '2026-10-01', paymentDate: '2026-10-05'
}), 'sisa');
assert.strictEqual(classifyPayment({
  collectedBy: 3, customerStoppedAt: '2026-10-10', paymentDate: '2026-09-01'
}), 'tagihan');

assert.strictEqual(feeForKind('tagihan'), 5000);
assert.strictEqual(feeForKind('sisa'), 15000);
assert.strictEqual(feeForKind('router'), 15000);
assert.strictEqual(feeForKind('tagihan') + feeForKind('sisa'), 20000);
assert.notStrictEqual(feeForKind('sisa'), feeForKind('tagihan') + feeForKind('sisa'));

assert.strictEqual(monthPeriodKey('2026-10-19'), '2026-10');
assert.strictEqual(oilPeriodKey('2026-10-19'), '2026-09_2026-10');
assert.strictEqual(oilPeriodKey('2026-09-01'), '2026-09_2026-10');
assert.strictEqual(oilPeriodKey('2026-11-02'), '2026-11_2026-12');
assert.ok(oilPeriodLabel('2026-09_2026-10').includes('Sep'));

const s = normalizeSettings({ fee_tagihan: '7000', oli_qty: 2 });
assert.strictEqual(s.fee_tagihan, 7000);
assert.strictEqual(s.oli_qty, 2);
assert.strictEqual(s.fee_router, 15000);

console.log('fieldIncentiveRules.test.js ok');
