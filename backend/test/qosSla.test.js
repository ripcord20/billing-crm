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
  alertAudience,
  alertRoles,
  mergeSettings,
  parseServerList,
  worstStatus,
  parseMikrotikPing,
  deviceCanApiProbe,
  latestForDevice,
  rollupMax,
  cardFromMetric
} = require('../utils/qosSla');

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

assert.strictEqual(worstStatus(['ok', 'warn', 'ok']), 'warn');
assert.strictEqual(worstStatus(['ok', 'critical']), 'critical');
assert.strictEqual(worstStatus([]), 'unknown');

const parsed = parseMikrotikPing([
  { status: 'ok', time: '18ms' },
  { status: 'ok', time: '22ms' },
  { status: 'timeout' }
]);
assert.strictEqual(parsed.success, true);
assert.strictEqual(parsed.rtt_avg, 20);
assert.strictEqual(parsed.loss, 33.33);

assert.strictEqual(deviceCanApiProbe({ api_username: 'skynet', monitoring_type: 'api' }), true);
assert.strictEqual(deviceCanApiProbe({ api_username: 'skynet', monitoring_type: 'snmp' }), false);
assert.strictEqual(deviceCanApiProbe({ monitoring_type: 'api' }), false);

const rows = [
  { device_id: 3, value: 40, status: 'ok', target: '8.8.8.8' },
  { device_id: 1, value: 12, status: 'ok', target: '1.1.1.1' }
];
assert.strictEqual(latestForDevice(rows, 1).value, 12);
assert.strictEqual(latestForDevice(rows, 'all').value, 40);
assert.strictEqual(rollupMax([19.3, 40, null]), 40);
assert.strictEqual(cardFromMetric(rows[1]).device_id, 1);

console.log('qosSla.test.js OK');
