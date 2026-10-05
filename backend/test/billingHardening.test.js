'use strict';
const assert = require('assert');
const {
  clampPeriodDueDate,
  periodDueDateForCustomer,
  addOneMonthKeepDay
} = require('../utils/billingDates');
const {
  parseGraceDays,
  amountsMatch,
  isCustomerPeriodConflict
} = require('../utils/billingGuards');

assert.strictEqual(clampPeriodDueDate(2026, 1, 31), '2026-01-31');
assert.strictEqual(clampPeriodDueDate(2026, 2, 31), '2026-02-28');
assert.strictEqual(clampPeriodDueDate(2024, 2, 31), '2024-02-29');
assert.strictEqual(clampPeriodDueDate(2026, 4, 31), '2026-04-30');
assert.strictEqual(clampPeriodDueDate(2026, 13, 10), null);
assert.strictEqual(clampPeriodDueDate(2026, 5, 0), null);

assert.strictEqual(
  periodDueDateForCustomer({ due_date: '2026-01-31' }, 2, 2026),
  '2026-02-28'
);
assert.strictEqual(
  periodDueDateForCustomer({ billing_date: 10 }, 3, 2026),
  '2026-03-10'
);

assert.strictEqual(addOneMonthKeepDay('2026-01-31'), '2026-02-28');
assert.strictEqual(addOneMonthKeepDay('2026-01-15'), '2026-02-15');
assert.strictEqual(addOneMonthKeepDay(null), null);

assert.strictEqual(parseGraceDays('7'), 7);
assert.strictEqual(parseGraceDays('0'), 0);
assert.strictEqual(parseGraceDays('-3'), 0);
assert.strictEqual(parseGraceDays('999'), 365);
assert.strictEqual(parseGraceDays('abc'), 0);
assert.strictEqual(parseGraceDays(undefined), 0);

assert.strictEqual(amountsMatch(150000, 150000), true);
assert.strictEqual(amountsMatch(150000.4, '150000'), true);
assert.strictEqual(amountsMatch(150000, 149000), false);
assert.strictEqual(amountsMatch(150000, [0, 150000, 151000]), true);
assert.strictEqual(amountsMatch(150000, [151000, 152000]), false);
assert.strictEqual(amountsMatch(150000, [0, null, '']), true);

assert.strictEqual(isCustomerPeriodConflict(null), false);
assert.ok(isCustomerPeriodConflict({
  name: 'SequelizeUniqueConstraintError',
  fields: { customer_id: 1, period_month: 10, period_year: 2026 }
}));
assert.ok(isCustomerPeriodConflict({
  name: 'SequelizeUniqueConstraintError',
  parent: { sqlMessage: "Duplicate entry '1-10-2026' for key 'uq_invoice_customer_period'" }
}));
assert.strictEqual(isCustomerPeriodConflict({
  name: 'SequelizeUniqueConstraintError',
  fields: { invoice_number: 'INV-2610-00001' }
}), false);

console.log('billingHardening.test.js OK');
