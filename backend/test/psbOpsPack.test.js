'use strict';
/**
 * Tes pipeline PSB, occupancy ODP, gudang SN, dan fingerprint alarm.
 * Jalankan: node backend/test/psbOpsPack.test.js
 */
const assert = require('assert');
const flow = require('../services/PsbFlow');
const occupancy = require('../services/OdpOccupancy');

assert.deepStrictEqual(flow.STAGES[0], 'daftar');
assert.deepStrictEqual(flow.nextStage('daftar'), 'survey');
assert.deepStrictEqual(flow.nextStage('tagihan'), 'done');
assert.strictEqual(flow.nextStage('done'), null);
assert.strictEqual(flow.canAdvance('daftar', 'survey'), true);
assert.strictEqual(flow.canAdvance('daftar', 'bind'), false);
assert.strictEqual(flow.canAdvance('cancelled', 'survey'), false);
assert.strictEqual(flow.canAdvance('done', 'daftar'), false);

assert.strictEqual(flow.occupancyLevel(0, 8), 'ok');
assert.strictEqual(flow.occupancyLevel(6, 8), 'ok');
assert.strictEqual(flow.occupancyLevel(7, 8), 'warning');
assert.strictEqual(flow.occupancyLevel(8, 8), 'full');
assert.strictEqual(flow.occupancyLevel(9, 8), 'full');
assert.strictEqual(flow.occupancyLevel(1, 0), 'unknown');
assert.strictEqual(flow.occupancyColor('full'), '#ef4444');
assert.strictEqual(flow.occupancyColor('warning'), '#f59e0b');

assert.strictEqual(flow.warehouseNextStatus('in_stock', 'checkout'), 'checked_out');
assert.strictEqual(flow.warehouseNextStatus('checked_out', 'install'), 'installed');
assert.strictEqual(flow.warehouseNextStatus('checked_out', 'return'), 'in_stock');
assert.strictEqual(flow.warehouseNextStatus('installed', 'return'), 'in_stock');
assert.strictEqual(flow.warehouseNextStatus('in_stock', 'install'), null);
assert.strictEqual(flow.warehouseNextStatus('damaged', 'checkout'), null);

assert.strictEqual(flow.alarmFingerprint('ont_offline', 'ZTEGC1'), 'alarm:ont_offline:ztegc1');
assert.deepStrictEqual(flow.parseAlarmTag({ source: 'alarm', kind: 'ont_critical', key: 'A' }), {
  source: 'alarm', kind: 'ont_critical', key: 'A'
});
assert.strictEqual(flow.parseAlarmTag({ source: 'manual' }), null);
assert.deepStrictEqual(
  flow.parseAlarmTag(JSON.stringify({ source: 'alarm', kind: 'pppoe_drop', key: 'u1' })),
  { source: 'alarm', kind: 'pppoe_drop', key: 'u1' }
);

const used = occupancy.countUsed(1, [
  { id: 10, parent_id: 1, type: 'customer', metadata: { customer_id: 5 } },
  { id: 11, parent_id: 1, type: 'ont' },
  { id: 12, parent_id: 2, type: 'customer', metadata: { customer_id: 6 } }
], [
  { id: 5, infra_parent_id: 1 },
  { id: 7, infra_parent_id: 1 }
]);
assert.strictEqual(used, 3);

assert.strictEqual(occupancy.customerIdFromMeta({ customer_id: '12' }), 12);
assert.strictEqual(occupancy.customerIdFromMeta('{"customer_id":9}'), 9);
assert.strictEqual(occupancy.customerIdFromMeta(null), null);

const sum = occupancy.summarizeOdp({ id: 1, name: 'ODP-A', type: 'odp', capacity: 8, status: 'active' }, 8);
assert.strictEqual(sum.level, 'full');
assert.strictEqual(sum.free, 0);
assert.strictEqual(sum.pct, 100);

console.log('psbOpsPack.test.js OK');
