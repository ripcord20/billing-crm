'use strict';
/**
 * Top Customers by Bandwidth — matching & merge tanpa MikroTik sungguhan.
 * Jalankan: node backend/test/customerBandwidth.test.js
 */
const assert = require('assert');
const bw = require('../services/CustomerBandwidth');

const GB = 1073741824;

const customers = [
  { id: 1, customer_id: 'C001', name: 'Andi Warnet', pppoe_username: 'andi', static_ip: null, package: { name: '20M', speed_down: 20, speed_up: 10 } },
  { id: 2, customer_id: 'C002', name: 'Warung Nia', pppoe_username: 'nia', static_ip: '10.10.10.20', package: { name: '50M', speed_down: 50, speed_up: 20 } },
  { id: 3, customer_id: 'C003', name: 'Hotspot Budi', pppoe_username: 'budi', static_ip: '10.10.10.30', package: { name: '10M', speed_down: 10, speed_up: 5 } }
];
const index = bw.buildIndex(customers);

// ── parse & filter ──────────────────────────────────────────
assert.strictEqual(bw.parseSessionUsername('<pppoe-andi>'), 'andi');
assert.strictEqual(bw.parseSessionUsername('pppoe-andi'), 'andi');
assert.strictEqual(bw.parseSessionUsername('<l2tp-andi>'), 'andi');
assert.strictEqual(bw.parseSessionUsername('andi'), 'andi');

assert.strictEqual(bw.isCustomerInterface({ type: 'pppoe-in', name: '<pppoe-andi>' }), true);
assert.strictEqual(bw.isCustomerInterface({ type: 'l2tp-in', name: '<l2tp-andi>' }), true);
assert.strictEqual(bw.isCustomerInterface({ type: 'pppoe-out', name: 'pppoe-out1' }), false, 'uplink PPPoE client bukan pelanggan');
assert.strictEqual(bw.isCustomerInterface({ type: 'ether', name: 'ether1' }), false, 'WAN ether1 tidak boleh masuk');
assert.strictEqual(bw.isCustomerInterface({ type: 'bridge', name: 'bridge' }), false);
assert.strictEqual(bw.isCustomerInterface({ type: 'vlan', name: 'vlan100' }), false);
assert.strictEqual(bw.isCustomerInterface({ type: '', name: 'pppoe-out1' }), false);

assert.strictEqual(bw.matchCustomer(index, { name: '<pppoe-andi>' }).id, 1);
assert.strictEqual(bw.matchCustomer(index, { name: 'Q-NIA', target: '10.10.10.20/32' }).id, 2);
assert.strictEqual(bw.matchCustomer(index, { name: '<43. WARUNG NIA>' }).id, 2);

// ── WAN raksasa tidak nyangkut ke pelanggan ─────────────────
{
  const acc = bw.mergeSnapshot(index, {
    queues: [],
    interfaces: [
      { name: 'ether1', type: 'ether', txByte: 50 * GB, rxByte: 50 * GB },
      { name: '<pppoe-andi>', type: 'pppoe-in', txByte: 5 * GB, rxByte: 1 * GB }
    ],
    sessions: [],
    hotspot: []
  });
  assert.strictEqual(acc.size, 1, 'hanya pelanggan, bukan WAN');
  assert.strictEqual(acc.get(1).bytes, 6 * GB);
  assert.ok(acc.get(1).sources.has('pppoe'));
}

// ── tanpa simple queue, PPPoE interface tetap terhitung ─────
{
  const acc = bw.mergeSnapshot(index, {
    queues: [],
    interfaces: [
      { name: '<pppoe-andi>', type: 'pppoe-in', txByte: 8 * GB, rxByte: 2 * GB }
    ],
    sessions: [],
    hotspot: []
  });
  assert.ok(acc.has(1), 'pelanggan tanpa SQ harus muncul dari interface');
  assert.strictEqual(acc.get(1).download, 8 * GB);
  assert.strictEqual(acc.get(1).upload, 2 * GB);
}

// ── queue + interface pelanggan sama: MAX, bukan SUM ────────
{
  const acc = bw.mergeSnapshot(index, {
    queues: [{
      name: '<pppoe-andi>',
      bytesIn: String(10 * GB),
      bytesOut: String(1 * GB),
      rateIn: String(5e6),
      rateOut: String(1e6)
    }],
    interfaces: [
      { name: '<pppoe-andi>', type: 'pppoe-in', txByte: 4 * GB, rxByte: 0.5 * GB }
    ],
    sessions: [{ name: 'andi', bytesIn: 0.2 * GB, bytesOut: 1 * GB, service: 'pppoe' }],
    hotspot: []
  });
  const row = acc.get(1);
  assert.strictEqual(row.bytes, 11 * GB, 'MAX queue (11GB) bukan 11+4.5+1.2');
  assert.ok(row.sources.has('queue'));
  assert.ok(row.sources.has('pppoe'));
  assert.strictEqual(row.rateIn, 5e6);
}

// ── queue 0, interface berisi: pakai interface ──────────────
{
  const acc = bw.mergeSnapshot(index, {
    queues: [{ name: 'andi', bytesIn: '0', bytesOut: '0', rateIn: '0', rateOut: '0' }],
    interfaces: [
      { name: '<pppoe-andi>', type: 'pppoe-in', txByte: 3 * GB, rxByte: 1 * GB }
    ]
  });
  assert.strictEqual(acc.get(1).bytes, 4 * GB);
}

// ── hotspot by username ─────────────────────────────────────
{
  const acc = bw.mergeSnapshot(index, {
    hotspot: [{ user: 'budi', address: '10.10.10.30', bytesIn: GB, bytesOut: 2 * GB }]
  });
  assert.strictEqual(acc.get(3).bytes, 3 * GB);
  assert.ok(acc.get(3).sources.has('hotspot'));
}

// ── PPP session bytes-in = upload, bytes-out = download ─────
{
  const acc = bw.mergeSnapshot(index, {
    sessions: [{ name: 'nia', address: '10.10.10.20', bytesIn: GB, bytesOut: 4 * GB, service: 'pppoe' }]
  });
  assert.strictEqual(acc.get(2).download, 4 * GB);
  assert.strictEqual(acc.get(2).upload, GB);
}

// ── antar-router: SUM ───────────────────────────────────────
{
  const a = bw.mergeSnapshot(index, {
    queues: [{ name: 'andi', bytesIn: String(2 * GB), bytesOut: '0', rateIn: '0', rateOut: '0' }]
  });
  const b = bw.mergeSnapshot(index, {
    interfaces: [{ name: '<pppoe-andi>', type: 'pppoe-in', txByte: 3 * GB, rxByte: 0 }]
  });
  const acc = bw.mergeAcrossRouters(new Map(), a);
  bw.mergeAcrossRouters(acc, b);
  assert.strictEqual(acc.get(1).bytes, 5 * GB);
}

// ── formatRows sort + limit + skip idle ─────────────────────
{
  const acc = bw.mergeSnapshot(index, {
    queues: [
      { name: 'andi', bytesIn: String(1 * GB), bytesOut: '0', rateIn: '2000000', rateOut: '0' },
      { name: 'nia', bytesIn: String(9 * GB), bytesOut: '0', rateIn: '1000000', rateOut: '0' }
    ]
  });
  const rows = bw.formatRows(acc, { limit: 1 });
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].pppoe_username, 'nia');
  assert.ok(rows[0].sources.includes('queue'));
}

// ── unmatched PPPoE queue/session tetap muncul (tanpa CRM) ──
{
  const emptyIdx = bw.buildIndex([]);
  const acc = bw.mergeSnapshot(emptyIdx, {
    queues: [
      { name: '<pppoe-SENDY>', bytesIn: String(7 * GB), bytesOut: String(1 * GB), rateIn: '0', rateOut: '0' },
      { name: '2. Social Media', bytesIn: String(90 * GB), bytesOut: '0', rateIn: '0', rateOut: '0' }
    ],
    interfaces: [
      { name: 'ether1', type: 'ether', txByte: 80 * GB, rxByte: 80 * GB }
    ],
    sessions: [{ name: 'PONIAH', bytesIn: 0.5 * GB, bytesOut: 2 * GB, service: 'pppoe' }]
  });
  assert.ok(acc.has('u:sendy'), 'queue <pppoe-USER> tanpa CRM harus tetap terhitung');
  assert.ok(acc.has('u:poniah'), 'sesi PPP tanpa CRM harus tetap terhitung');
  assert.ok(![...acc.keys()].some(k => String(k).includes('social')), 'parent queue bukan pelanggan');
  const rows = bw.formatRows(acc, { limit: 10 });
  const sendy = rows.find(r => r.pppoe_username === 'sendy');
  assert.ok(sendy.unmatched);
  assert.strictEqual(sendy.total_gb, (8).toFixed(2));
}

// ── CRM match menang dari synthetic untuk username yang sama ──
{
  const acc = bw.mergeSnapshot(index, {
    queues: [{ name: '<pppoe-andi>', bytesIn: String(2 * GB), bytesOut: '0', rateIn: '0', rateOut: '0' }]
  });
  assert.ok(acc.has(1));
  assert.ok(!acc.has('u:andi'));
}

// ── collectLiveSnapshot tahan endpoint yang gagal ───────────
(async () => {
  const snap = await bw.collectLiveSnapshot({
    getQueueStats: async () => { throw new Error('timeout'); },
    getInterfaces: async () => [{ name: '<pppoe-andi>', type: 'pppoe-in', txByte: GB, rxByte: 0 }],
    getPPPoESessions: async () => [],
    getHotspotActive: async () => { throw new Error('no such command prefix'); }
  });
  assert.deepStrictEqual(snap.queues, []);
  assert.strictEqual(snap.interfaces.length, 1);
  assert.deepStrictEqual(snap.hotspot, []);
  console.log('✓ CustomerBandwidth tests PASS');
})().catch((e) => {
  console.error('✗ FAIL:', e.message);
  process.exit(1);
});
