'use strict';
const assert = require('assert');
const {
  computeCustomerDueStatus,
  isDueSoon,
  serializeOutstanding
} = require('../utils/customerDueStatus');

const today = new Date('2026-10-05T00:00:00');

// Invoice lunas → tidak overdue, meski due_date customer masih kemarin
const paidClear = computeCustomerDueStatus({
  unpaidInvoices: [],
  customerDueDate: '2026-10-04',
  today
});
assert.strictEqual(paidClear.status, 'paid');

// Ada invoice overdue
const overdue = computeCustomerDueStatus({
  unpaidInvoices: [
    { status: 'overdue', due_date: '2026-10-04', invoice_number: 'INV-1' }
  ],
  customerDueDate: '2026-11-10',
  today
});
assert.strictEqual(overdue.status, 'overdue');
assert.strictEqual(overdue.dueDate, '2026-10-04');

// Invoice unpaid tapi belum jatuh tempo
const unpaid = computeCustomerDueStatus({
  unpaidInvoices: [
    { status: 'unpaid', due_date: '2026-10-10' }
  ],
  customerDueDate: '2026-10-10',
  today
});
assert.strictEqual(unpaid.status, 'unpaid');
assert.strictEqual(isDueSoon('unpaid', '2026-10-07', today, 3), true);
assert.strictEqual(isDueSoon('unpaid', '2026-10-20', today, 3), false);
assert.strictEqual(isDueSoon('overdue', '2026-10-04', today, 3), false);

// Ambil invoice tertua kalau ada beberapa tertunggak
const oldest = computeCustomerDueStatus({
  unpaidInvoices: [
    { status: 'unpaid', due_date: '2026-10-20' },
    { status: 'overdue', due_date: '2026-09-01' }
  ],
  today
});
assert.strictEqual(oldest.status, 'overdue');
assert.strictEqual(oldest.dueDate, '2026-09-01');

const ser = serializeOutstanding({
  id: 10, invoice_number: 'INV-2610-00009', status: 'overdue',
  due_date: '2026-10-04', total: '112000.00', period_month: 10, period_year: 2026
});
assert.strictEqual(ser.invoice_number, 'INV-2610-00009');
assert.strictEqual(ser.total, 112000);

console.log('customerDueStatus.test.js OK');
