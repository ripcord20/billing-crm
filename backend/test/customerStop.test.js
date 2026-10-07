'use strict';
const assert = require('assert');
const {
  STOP_REASONS, EXAMPLE_STOPPED, todayYmd, normalizeReason, normalizeDate,
  applyStopFields, displayStoppedAt, customerListStatusClause,
} = require('../utils/customerStop');

assert.ok(STOP_REASONS.includes('Pindah rumah'));
assert.strictEqual(EXAMPLE_STOPPED.customer_id, 'FLN-1042');
assert.strictEqual(EXAMPLE_STOPPED.stop_reason, 'Pindah rumah');
assert.strictEqual(normalizeReason('ganti isp'), 'Ganti ISP');
assert.strictEqual(normalizeReason(''), 'Lainnya');
assert.strictEqual(normalizeDate('2026-09-15'), '2026-09-15');
assert.strictEqual(normalizeDate('salah', '2026-01-01'), '2026-01-01');
assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(todayYmd()));

const stop = applyStopFields('active', 'inactive', { stop_reason: 'Pindah rumah', stopped_at: '2026-09-15' });
assert.strictEqual(stop.stopped_at, '2026-09-15');
assert.strictEqual(stop.stop_reason, 'Pindah rumah');

const again = applyStopFields('inactive', 'active', {});
assert.strictEqual(again.stopped_at, null);
assert.strictEqual(again.stop_reason, null);

assert.strictEqual(displayStoppedAt({ stopped_at: '2026-09-15' }), '2026-09-15');
assert.strictEqual(displayStoppedAt({ updated_at: '2026-08-01T10:00:00Z' }), '2026-08-01');

assert.deepStrictEqual(customerListStatusClause('inactive'), { empty: true });
assert.deepStrictEqual(customerListStatusClause(''), { excludeStopped: true });
assert.deepStrictEqual(customerListStatusClause('overdue'), { excludeStopped: true });
assert.deepStrictEqual(customerListStatusClause('active'), { status: 'active' });
assert.deepStrictEqual(customerListStatusClause('isolated'), { status: 'isolated' });

console.log('customerStop.test.js OK');
