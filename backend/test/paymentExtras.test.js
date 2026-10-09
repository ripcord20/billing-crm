'use strict';
const assert = require('assert');
const {
  computePromiseDate,
  resolvePromiseDate,
  normalizeBulkPayload,
  canonBulkMethod,
  composeBulkNotes,
  MAX_DEFER_DAYS,
  MAX_BULK_ITEMS
} = require('../utils/paymentExtras');

const today = '2026-08-30';

assert.strictEqual(computePromiseDate(7, today), '2026-09-06');
assert.strictEqual(computePromiseDate(1, today), '2026-08-31');
assert.strictEqual(computePromiseDate(0, today), null);
assert.strictEqual(computePromiseDate(366, today), null);
assert.strictEqual(computePromiseDate('14', today), '2026-09-13');

const byDate = resolvePromiseDate({ promise_date: '2026-09-06' }, today);
assert.strictEqual(byDate.promise_date, '2026-09-06');
assert.strictEqual(byDate.duration_days, 7);

const byDays = resolvePromiseDate({ duration_days: 3 }, today);
assert.strictEqual(byDays.promise_date, '2026-09-02');
assert.strictEqual(byDays.duration_days, 3);

const past = resolvePromiseDate({ promise_date: '2026-08-01' }, today);
assert.ok(past.error);

const tooLong = resolvePromiseDate({ duration_days: MAX_DEFER_DAYS + 1 }, today);
assert.ok(tooLong.error);

const emptyBulk = normalizeBulkPayload({ customer_ids: [] });
assert.ok(emptyBulk.error);

const fromIds = normalizeBulkPayload({ customer_ids: [1, 2, 2, 3], method: 'cash' });
assert.strictEqual(fromIds.items.length, 3);
assert.strictEqual(fromIds.method, 'cash');

const fromItems = normalizeBulkPayload({
  items: [{ customer_id: 10, amount: '150000' }, { id: 11 }],
  period_month: 8,
  period_year: 2026
});
assert.strictEqual(fromItems.items.length, 2);
assert.strictEqual(fromItems.items[0].amount, 150000);

const tooMany = normalizeBulkPayload({
  customer_ids: Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => i + 1)
});
assert.ok(tooMany.error);

assert.strictEqual(canonBulkMethod('ntf'), 'transfer');
assert.strictEqual(canonBulkMethod('cash'), 'cash');
assert.strictEqual(composeBulkNotes('ntf', ''), 'Setor massal · NTF');
assert.strictEqual(composeBulkNotes('cash', ''), 'Setor massal · Cash');
assert.strictEqual(composeBulkNotes('ntf', '  via tukang tagih  '), 'via tukang tagih');

const mixed = normalizeBulkPayload({
  items: [
    { customer_id: 1, amount: 100000, method: 'ntf', notes: '' },
    { customer_id: 2, amount: 150000, method: 'cash', notes: 'rumah' }
  ],
  method: 'cash'
});
assert.strictEqual(mixed.items[0].method, 'transfer');
assert.strictEqual(mixed.items[0].notes, 'Setor massal · NTF');
assert.strictEqual(mixed.items[1].method, 'cash');
assert.strictEqual(mixed.items[1].notes, 'rumah');

console.log('paymentExtras.test.js OK');
