'use strict';
/**
 * Parser MIB HSGQ-G02ID (tanpa OLT asli).
 * Jalankan: node test/hsgqOltG02.test.js
 */
const assert = require('assert');
const Module = require('module');
const stubs = {
  '../utils/logger': { info() {}, warn() {}, error() {}, debug() {} },
  'net-snmp': {
    createSession() { return { get() {}, subtree() {}, close() {}, on() {} }; },
    isVarbindError() { return false; },
    Version2c: 1,
  },
};
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === '../utils/logger' || id.endsWith('/utils/logger')) return stubs['../utils/logger'];
  if (id === 'net-snmp') return stubs['net-snmp'];
  return origRequire.apply(this, arguments);
};
const Hsgq = require('../services/HsgqOltService');

const s = new Hsgq({ host: '127.0.0.1', mibMode: 'g02id', name: 'test' });

assert.deepStrictEqual(s._decodeIndex('16777472'), { pon: 1, onu: 0 });
assert.deepStrictEqual(s._decodeIndex('16777476'), { pon: 1, onu: 4 });
assert.deepStrictEqual(s._decodeIndex('16777728'), { pon: 2, onu: 0 });

assert.strictEqual(s._parseG02Rx(-1600), -16);
assert.strictEqual(s._parseG02Rx(218), 2.18);
assert.strictEqual(s._parseG02Rx(0), null);
assert.strictEqual(s._parseG02Rx(null), null);

assert.strictEqual(s._parseG02Status(1, -16), 'online');
assert.strictEqual(s._parseG02Status('1', -29), 'warning');
assert.strictEqual(s._parseG02Status(0, -16), 'offline');
assert.strictEqual(s._parseG02Status('0', null), 'offline');

const rxOid = '1.3.6.1.4.1.50224.3.12.3.1.4';
assert.strictEqual(s._indexG02Optical(`${rxOid}.16777472.0`, rxOid), '16777472');
assert.strictEqual(s._indexG02Optical(`${rxOid}.16777472.65535`, rxOid), null);

const map = new Map();
map.set('16777472', {
  name: 'UDIN', run: 1, vendor: 'HWTC', model: 'HG8245W5-6T',
  hw_ver: '1A3D.C', fw_ver: 'V5R020C10S246', sn: 'HWTC8c531cad',
  loid: null, reg: '2026/09/22 19:18:26', ticks: 2328300,
  rx_power: -1600, tx_power: 218,
});
map.set('16777483', {
  name: 'ONT01/011', run: 0, vendor: 'FHTT', model: null,
  sn: 'FHTT9b2afd60', rx_power: null, tx_power: null, ticks: 0,
});
map.set('16777520', {
  name: 'NOC 2', run: 1, vendor: 'FHTT', model: 'HG6145D2',
  sn: 'FHTT9d201040', rx_power: -3000, tx_power: 183, ticks: 100,
});

const onts = s._normalizeG02ONTs(map);
assert.strictEqual(onts.length, 3);
const udin = onts.find((o) => o.serial_number === 'HWTC8c531cad');
assert.ok(udin, 'SN GPON dari kolom 15 harus jadi serial_number');
assert.strictEqual(udin.pon_port, 1);
assert.strictEqual(udin.onu_id, 0);
assert.strictEqual(udin.status, 'online');
assert.strictEqual(udin.signal_strength, -16);
assert.strictEqual(udin.tr069_params.tx_power, 2.18);
assert.strictEqual(udin.tr069_params.ont_model, 'HG8245W5-6T');
assert.strictEqual(udin.model, 'UDIN');
assert.strictEqual(udin.source, 'snmp_hsgq_g02id');

const off = onts.find((o) => o.serial_number === 'FHTT9b2afd60');
assert.strictEqual(off.status, 'offline');
assert.strictEqual(off.signal_strength, null);

const noc = onts.find((o) => o.serial_number === 'FHTT9d201040');
assert.strictEqual(noc.status, 'warning', 'RX -30 dBm = warning');
assert.strictEqual(noc.signal_strength, -30);

(async () => {
  s._walk = async (oid) => {
    if (oid.endsWith('.3.12.2.1.2')) return [{ oid: oid + '.16777472', value: 'UDIN' }];
    if (oid.endsWith('.3.12.2.1.5')) return [{ oid: oid + '.16777472', value: 1 }];
    if (oid.endsWith('.3.12.2.1.15')) return [{ oid: oid + '.16777472', value: 'HWTC8c531cad' }];
    if (oid.endsWith('.3.12.3.1.4')) return [
      { oid: oid + '.16777472.0', value: -2100 },
      { oid: oid + '.16777472.65535', value: -2698 },
    ];
    if (oid.endsWith('.3.12.3.1.5')) return [{ oid: oid + '.16777472.0', value: 207 }];
    return [];
  };
  const live = await s.getAllONTs();
  assert.strictEqual(live.length, 1);
  assert.strictEqual(live[0].serial_number, 'HWTC8c531cad');
  assert.strictEqual(live[0].signal_strength, -21);
  assert.strictEqual(live[0].status, 'online');

  s.getSystemInfo = async () => ({ model: 'HSGQ-G02ID', version: 'IGC_V1.0.11C_Rel' });
  const mgmt = await s.getAllOnus();
  assert.strictEqual(mgmt.onus.length, 1);
  assert.strictEqual(mgmt.onus[0].onu_if, '1/0');
  assert.strictEqual(mgmt.onus[0].sn, 'HWTC8c531cad');
  assert.strictEqual(mgmt.onus[0].status, 'online');
  assert.strictEqual(mgmt.ports[0].total, 1);
  const mapped = s._toMgmtOnu({
    onu_id: 11, pon_port: 1, description: 'ONT01/011', serial_number: 'FHTT9b2afd60',
    status: 'offline', signal_strength: null, tr069_params: {},
  });
  assert.strictEqual(mapped.status, 'offline');
  assert.strictEqual(mapped.onu_if, '1/11');
  console.log('✓ HSGQ G02ID MIB tests PASS');
})().catch((e) => {
  console.error('✗ FAIL:', e.message);
  process.exit(1);
});
