'use strict';
const assert = require('assert');
const {
  DEFAULTS,
  computeJitter,
  classifyRtt,
  classifyLoss,
  classifyJitter,
  classifyBandwidth,
  classifyAuthFails,
  classifyTrafficAnomaly,
  classifyDns,
  shouldRaiseDdos,
  dnsCompare,
  alertAudience,
  alertRoles,
  mergeSettings,
  parseServerList
} = require('../utils/qosSla');
const {
  normalizeCpuPercent,
  displayCpuPercent,
  isCustomerTunnelIface,
  isUplinkIface,
  isDdosWatchIface,
  pppoeIfaceMatchesUsername,
  aggregateDeviceTraffic,
  latestUniqueBy
} = require('../utils/deviceMetrics');

assert.strictEqual(computeJitter([10, 12, 11, 40]), 10.67);
assert.strictEqual(computeJitter([{ ms: 10 }, { ms: 20 }]), 10);
assert.strictEqual(computeJitter([12]), 0);
assert.strictEqual(computeJitter([]), 0);

assert.strictEqual(classifyRtt(40).status, 'ok');
assert.strictEqual(classifyRtt(120).status, 'warn');
assert.strictEqual(classifyRtt(151).status, 'critical');
assert.strictEqual(classifyRtt(150).status, 'critical');

assert.strictEqual(classifyLoss(0.2).status, 'ok');
assert.strictEqual(classifyLoss(0.7).status, 'warn');
assert.strictEqual(classifyLoss(1).status, 'critical');

assert.strictEqual(classifyJitter(10).status, 'ok');
assert.strictEqual(classifyJitter(25).status, 'warn');
assert.strictEqual(classifyJitter(31).status, 'critical');

const bwOk = classifyBandwidth(40e6, 100e6);
assert.strictEqual(bwOk.status, 'ok');
assert.strictEqual(bwOk.pct, 40);
const bwWarn = classifyBandwidth(85e6, 100e6);
assert.strictEqual(bwWarn.status, 'warn');
const bwCrit = classifyBandwidth(96e6, 100e6);
assert.strictEqual(bwCrit.status, 'critical');
assert.strictEqual(classifyBandwidth(10, 0).status, 'unknown');

const authOk = classifyAuthFails({ perIpCounts: { '1.1.1.1': 2 }, total: 4 });
assert.strictEqual(authOk.status, 'ok');
const authWarn = classifyAuthFails({ perIpCounts: { '8.8.8.8': 12 }, total: 12 });
assert.strictEqual(authWarn.status, 'warn');
const authCrit = classifyAuthFails({ perIpCounts: { '8.8.8.8': 22 }, total: 40 });
assert.strictEqual(authCrit.status, 'critical');

assert.strictEqual(classifyTrafficAnomaly(90, 40).status, 'ok');
assert.strictEqual(classifyTrafficAnomaly(120, 40).status, 'warn');
assert.strictEqual(classifyTrafficAnomaly(200, 40).status, 'critical');
assert.strictEqual(classifyTrafficAnomaly(10, 0).status, 'unknown');

assert.strictEqual(classifyDns({ ok: true, latencyMs: 20, accurate: true }).status, 'ok');
assert.strictEqual(classifyDns({ ok: true, latencyMs: 90, accurate: true }).status, 'warn');
assert.strictEqual(classifyDns({ ok: false, latencyMs: 10 }).status, 'critical');
assert.strictEqual(classifyDns({ ok: true, latencyMs: 10, accurate: false }).status, 'critical');

assert.strictEqual(alertAudience('bandwidth_upsell'), 'sales');
assert.strictEqual(alertAudience('qos_packet_loss'), 'tech');
assert.strictEqual(alertAudience('auth_fail'), 'security');
assert.ok(alertRoles('bandwidth_upsell').includes('finance'));
assert.ok(alertRoles('qos_packet_loss').includes('noc'));

const merged = mergeSettings({ qos_isp_dns: '10.0.0.1, 10.0.0.2', qos_rtt_ms: '180' });
assert.deepStrictEqual(merged.ispDns, ['10.0.0.1', '10.0.0.2']);
assert.strictEqual(merged.rttMs, 180);
assert.deepStrictEqual(merged.publicDns, DEFAULTS.publicDns);
assert.deepStrictEqual(parseServerList('1.1.1.1;8.8.8.8'), ['1.1.1.1', '8.8.8.8']);

assert.strictEqual(shouldRaiseDdos({ currentBps: 90, baselineBps: 40, consecutive: 2 }), false);
assert.strictEqual(shouldRaiseDdos({ currentBps: 20e6, baselineBps: 2e6, consecutive: 2 }), false);
assert.strictEqual(shouldRaiseDdos({ currentBps: 200e6, baselineBps: 40e6, consecutive: 1 }), false);
assert.strictEqual(shouldRaiseDdos({ currentBps: 200e6, baselineBps: 40e6, consecutive: 2 }), true);

const cmp = dnsCompare([
  { group: 'public', value: 12, status: 'ok' },
  { group: 'public', value: 18, status: 'ok' },
  { group: 'isp', value: 40, status: 'ok' }
]);
assert.strictEqual(cmp.public_avg, 15);
assert.strictEqual(cmp.isp_avg, 40);
assert.strictEqual(cmp.winner, 'public');

assert.strictEqual(normalizeCpuPercent(14), 14);
assert.strictEqual(normalizeCpuPercent(1400), 0);
assert.strictEqual(displayCpuPercent(1400), null);
assert.strictEqual(displayCpuPercent(22.4), 22);
assert.ok(isCustomerTunnelIface('<pppoe-andi>', 'pppoe-out'));
assert.ok(isCustomerTunnelIface('pppoe-andi'));
assert.ok(!isCustomerTunnelIface('sfp-sfpplus1', 'sfp-sfpplus'));
assert.ok(isUplinkIface('sfp-sfpplus1', 'sfp-sfpplus'));
assert.ok(isUplinkIface('ether1', 'ether'));
assert.ok(!isUplinkIface('<pppoe-andi>', 'pppoe-out'));
assert.ok(isDdosWatchIface('sfp-sfpplus1', 'sfp-sfpplus'));
assert.ok(!isDdosWatchIface('ether6', 'ether'));
assert.ok(!isDdosWatchIface('BILLINGRADIUS_L2TP'));
assert.ok(isCustomerTunnelIface('BILLINGRADIUS_L2TP'));
assert.ok(pppoeIfaceMatchesUsername('<pppoe-andi>', 'andi'));
assert.ok(!pppoeIfaceMatchesUsername('<pppoe-andika>', 'andi'));
assert.ok(!pppoeIfaceMatchesUsername('<pppoe-andi>', 'an'));

const totals = aggregateDeviceTraffic([
  { name: 'sfp-sfpplus1', type: 'sfp-sfpplus', running: true, rxMbps: 174.88, txMbps: 12.1 },
  { name: '<pppoe-a>', type: 'pppoe-out', running: true, rxMbps: 12.1, txMbps: 174.88 },
  { name: '<pppoe-b>', type: 'pppoe-out', running: true, rxMbps: 8, txMbps: 40 }
]);
assert.ok(Math.abs(totals.totalRxMbps - 174.88) < 0.01);
assert.ok(Math.abs(totals.totalTxMbps - 12.1) < 0.01);
assert.deepStrictEqual(totals.trafficIfaces, ['sfp-sfpplus1']);

const unique = latestUniqueBy([
  { server: '8.8.8.8', value: 11 },
  { server: '1.1.1.1', value: 12 },
  { server: '8.8.8.8', value: 99 }
], (r) => r.server);
assert.strictEqual(unique.length, 2);
assert.strictEqual(unique[0].value, 11);

console.log('qosSla.test.js OK');
