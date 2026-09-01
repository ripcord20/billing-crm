'use strict';
const assert = require('assert');
const {
  HISTORY_MAX,
  isSessionIfaceName,
  pickUplinkNames,
  selectSampleIfaces,
  aggregateSampledTraffic,
  pickBandwidth,
  seriesFromHistory,
  ifaceSeriesFromHistory,
  createRingBuffer,
} = require('../utils/nocRealtime');

assert.ok(HISTORY_MAX >= 120, 'history must hold more than a minute at 2s poll');
assert.strictEqual(isSessionIfaceName('<pppoe-AGUS>'), true);
assert.strictEqual(isSessionIfaceName('pppoe-out1'), true);
assert.strictEqual(isSessionIfaceName('sfp-sfpplus1'), false);

const ifaces = [
  { name: '<pppoe-AGUS>', type: 'pppoe-in', running: true, disabled: false, rxByte: 1e12, txByte: 1e12 },
  { name: 'ether5', type: 'ether', running: true, disabled: false, rxByte: 100, txByte: 100 },
  { name: 'sfp-sfpplus1', type: 'sfp', running: true, disabled: false, rxByte: 2e13, txByte: 1e12 },
  { name: 'ether4', type: 'ether', running: true, disabled: false, rxByte: 1e12, txByte: 1e13 },
  { name: 'vlan61', type: 'vlan', running: true, disabled: false, rxByte: 2e13, txByte: 1e12 },
  { name: 'bridge', type: 'bridge', running: true, disabled: false, rxByte: 9e12, txByte: 9e12 },
];

assert.deepStrictEqual(pickUplinkNames(ifaces, 2), ['sfp-sfpplus1', 'ether4']);

const sampled = selectSampleIfaces(ifaces, ['vlan61', 'sfp-sfpplus1', 'ether5'], { uplinkLimit: 1, extraLimit: 8 });
assert.deepStrictEqual(sampled.uplinkNames, ['sfp-sfpplus1']);
assert.ok(sampled.sampleIfaces.includes('vlan61'));
assert.ok(sampled.sampleIfaces.includes('ether5'));
assert.ok(!sampled.extraNames.includes('sfp-sfpplus1'), 'uplink must not be duplicated in extra');
assert.ok(sampled.sampleIfaces.length <= 3);
assert.ok(!sampled.sampleIfaces.includes('bridge'), 'unmonitored bridge must not be sampled');
assert.ok(!sampled.sampleIfaces.includes('ether4'), 'second-busiest ether is not the WAN total');

const stats = [
  { name: 'ether4', rxBitsPerSecond: 11e6, txBitsPerSecond: 95e6 },
  { name: 'sfp-sfpplus1', rxBitsPerSecond: 189e6, txBitsPerSecond: 12e6 },
  { name: 'vlan61', rxBitsPerSecond: 180e6, txBitsPerSecond: 10e6 },
];
const agg = aggregateSampledTraffic(stats, ['sfp-sfpplus1']);
assert.strictEqual(agg.uplinkName, 'sfp-sfpplus1');
assert.strictEqual(agg.rxMbps, 189);
assert.ok(agg.rxMbps < 189 + 11, 'must not sum every sampled iface');
assert.strictEqual(agg.perIface.vlan61.rxMbps, 180);

const flipped = aggregateSampledTraffic([
  { name: 'ether4', rxBitsPerSecond: 12e6, txBitsPerSecond: 255e6 },
  { name: 'sfp-sfpplus1', rxBitsPerSecond: 133e6, txBitsPerSecond: 6e6 },
], ['sfp-sfpplus1', 'ether4']);
assert.strictEqual(flipped.uplinkName, 'ether4', 'live-busiest of 2 uplinks can flip to LAN');
const pinned = aggregateSampledTraffic([
  { name: 'ether4', rxBitsPerSecond: 12e6, txBitsPerSecond: 255e6 },
  { name: 'sfp-sfpplus1', rxBitsPerSecond: 133e6, txBitsPerSecond: 6e6 },
], ['sfp-sfpplus1']);
assert.strictEqual(pinned.uplinkName, 'sfp-sfpplus1');
assert.strictEqual(pinned.rxMbps, 133);

const slice = [
  { ts: 1, cpu: 10, memPct: 40, pppoe: 100, rxMbps: 50, txMbps: 8, perIface: { vlan61: { rxMbps: 12, txMbps: 1 } } },
  { ts: 2, cpu: 12, memPct: 41, pppoe: 101, rxMbps: 80, txMbps: 9, perIface: { vlan61: { rxMbps: 20, txMbps: 2 } } },
];
const global = seriesFromHistory(slice, null);
assert.deepStrictEqual(global.cpu.map((p) => p.y), [10, 12]);
assert.deepStrictEqual(global.rx_mbps.map((p) => p.y), [50, 80]);

const vlan = seriesFromHistory(slice, ['vlan61']);
assert.deepStrictEqual(vlan.rx_mbps.map((p) => p.y), [12, 20]);

const byIface = ifaceSeriesFromHistory(slice);
assert.deepStrictEqual(byIface.vlan61.tx.map((p) => p.y), [1, 2]);

const bw = pickBandwidth(slice[1], ['vlan61']);
assert.strictEqual(bw.rx, 20);

const buf = createRingBuffer(3);
buf.push(7, { ts: 1 });
buf.push(7, { ts: 2 });
buf.push(7, { ts: 3 });
buf.push(7, { ts: 4 });
assert.deepStrictEqual(buf.get(7).map((s) => s.ts), [2, 3, 4]);
assert.deepStrictEqual(buf.get(99), []);

console.log('✓ nocRealtime tests PASS');
