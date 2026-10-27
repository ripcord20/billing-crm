'use strict';
const assert = require('assert');
const {
  STOP_REASONS, STOP_PICKER_STATUSES, EXAMPLE_STOPPED, todayYmd, normalizeReason,
  normalizeDate, normalizeNotes, applyStopFields, displayStoppedAt,
  customerListStatusClause, settlementFromInvoices, attachSettlement,
  shouldApplyMonthFilter, monthBounds, isStopPickerQuery,
} = require('../utils/customerStop');

assert.ok(STOP_REASONS.includes('Pindah rumah'));
assert.ok(STOP_PICKER_STATUSES.includes('isolated'));
assert.ok(STOP_PICKER_STATUSES.includes('suspended'));
assert.ok(!STOP_PICKER_STATUSES.includes('inactive'));
assert.strictEqual(EXAMPLE_STOPPED.customer_id, 'FLN-1042');
assert.strictEqual(EXAMPLE_STOPPED.stop_reason, 'Pindah rumah');
assert.strictEqual(EXAMPLE_STOPPED.settlement, 'lunas');
assert.strictEqual(normalizeReason('ganti isp'), 'Ganti ISP');
assert.strictEqual(normalizeReason(''), 'Lainnya');
assert.strictEqual(normalizeDate('2026-09-15'), '2026-09-15');
assert.strictEqual(normalizeDate('salah', '2026-01-01'), '2026-01-01');
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(todayYmd()));
assert.strictEqual(normalizeNotes('  masih nunggak Oktober  '), 'masih nunggak Oktober');
assert.strictEqual(normalizeNotes(''), null);
assert.strictEqual(normalizeNotes('   '), null);
assert.strictEqual(normalizeNotes('x'.repeat(2500)).length, 2000);

const stop = applyStopFields('active', 'inactive', { stop_reason: 'Pindah rumah', stopped_at: '2026-09-15' });
assert.strictEqual(stop.stopped_at, '2026-09-15');
assert.strictEqual(stop.stop_reason, 'Pindah rumah');

const isolirStop = applyStopFields('isolated', 'inactive', {
  stop_reason: 'Isolir berkepanjangan',
  stopped_at: '2026-10-27',
  stop_notes: 'Masih tanggungan Rp 100.000',
});
assert.strictEqual(isolirStop.stop_reason, 'Isolir berkepanjangan');
assert.strictEqual(isolirStop.stop_notes, 'Masih tanggungan Rp 100.000');

const again = applyStopFields('inactive', 'active', {});
assert.strictEqual(again.stopped_at, null);
assert.strictEqual(again.stop_reason, null);
assert.strictEqual(again.stop_notes, null);

const notesOnly = applyStopFields('inactive', 'inactive', { stop_notes: 'Sudah lunas' });
assert.strictEqual(notesOnly.stop_notes, 'Sudah lunas');

assert.strictEqual(displayStoppedAt({ stopped_at: '2026-09-15' }), '2026-09-15');
assert.strictEqual(displayStoppedAt({ updated_at: '2026-08-01T10:00:00Z' }), '2026-08-01');

assert.deepStrictEqual(customerListStatusClause('inactive'), { empty: true });
assert.deepStrictEqual(customerListStatusClause(''), { excludeStopped: true });
assert.deepStrictEqual(customerListStatusClause('overdue'), { excludeStopped: true });
assert.deepStrictEqual(customerListStatusClause('active'), { status: 'active' });
assert.deepStrictEqual(customerListStatusClause('isolated'), { status: 'isolated' });

const lunas = settlementFromInvoices([{ status: 'paid', total: 150000 }]);
assert.strictEqual(lunas.settlement, 'lunas');
assert.strictEqual(lunas.balance, 0);
assert.strictEqual(lunas.unpaid_count, 0);

const tanggungan = settlementFromInvoices([
  { id: 1, invoice_number: 'INV-1', status: 'overdue', total: 100000 },
  { id: 2, status: 'unpaid', amount: 50000 },
  { id: 3, status: 'paid', total: 999 },
]);
assert.strictEqual(tanggungan.settlement, 'tanggungan');
assert.strictEqual(tanggungan.balance, 150000);
assert.strictEqual(tanggungan.unpaid_count, 2);
assert.strictEqual(tanggungan.open_invoices.length, 2);

const withCarry = settlementFromInvoices([{ status: 'paid', total: 0 }], 25000);
assert.strictEqual(withCarry.settlement, 'tanggungan');
assert.strictEqual(withCarry.balance, 25000);

const attached = attachSettlement({
  name: 'PLS-ASINA',
  carry_over_amount: 0,
  invoices: [{ status: 'overdue', total: '100000' }],
});
assert.strictEqual(attached.settlement, 'tanggungan');
assert.strictEqual(attached.balance, 100000);
assert.strictEqual(attached.name, 'PLS-ASINA');

assert.strictEqual(shouldApplyMonthFilter('', '2026-10'), true);
assert.strictEqual(shouldApplyMonthFilter('asina', '2026-10'), false);
assert.strictEqual(shouldApplyMonthFilter('  asina  ', '2026-10'), false);
assert.strictEqual(shouldApplyMonthFilter('', 'salah'), false);
assert.deepStrictEqual(monthBounds('2026-10'), { start: '2026-10-01', next: '2026-11-01' });
assert.deepStrictEqual(monthBounds('2026-12'), { start: '2026-12-01', next: '2027-01-01' });
assert.strictEqual(monthBounds('okt'), null);

assert.strictEqual(isStopPickerQuery('1'), true);
assert.strictEqual(isStopPickerQuery('true'), true);
assert.strictEqual(isStopPickerQuery(''), false);
assert.strictEqual(isStopPickerQuery('active'), false);

console.log('customerStop.test.js OK');
