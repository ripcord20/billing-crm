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

  // E04R: col 15 bukan dBm; redaman dari tabel optik 3.3.3.1.4 (0.01 dBm)
  const e04 = new Hsgq({ host: '127.0.0.1', mibMode: 'e04i', name: 'e04r' });
  assert.strictEqual(e04._parseRxPower(357), null, 'E04R col 15 jarak ≠ dBm');
  assert.strictEqual(e04._parseRxPower(180), -7.6);
  assert.strictEqual(e04._parseG02Rx(-1826), -18.26);
  assert.strictEqual(e04._parseG02Rx(-2147483648), null, 'sentinel INT_MIN');
  assert.strictEqual(e04._parseMac(Buffer.from([0x1c, 0x27, 0x04, 0xb3, 0xbe, 0x9f])), '1C:27:04:B3:BE:9F');
  assert.strictEqual(e04._indexG02Optical('1.3.6.1.4.1.50224.3.3.3.1.4.16777473.0.0', '1.3.6.1.4.1.50224.3.3.3.1.4'), '16777473');
  assert.strictEqual(e04._indexG02Optical('1.3.6.1.4.1.50224.3.3.3.1.4.16777472.65535.65535', '1.3.6.1.4.1.50224.3.3.3.1.4'), null);

  const e04map = new Map();
  e04map.set('16777473', {
    name: 'BUDI', mac: Buffer.from([0x1c, 0x27, 0x04, 0xb3, 0xbe, 0x9f]),
    rx_power: 357, rx_opt: -1826, tx_opt: 222, seq: 32, hw_ver: 'V3.1',
  });
  e04map.set('16777474', {
    name: 'BU RU', mac: Buffer.from([0xec, 0x6c, 0xb5, 0x1b, 0xec, 0x0e]),
    rx_power: 316, rx_opt: -2229, tx_opt: 238, seq: 8, hw_ver: 'V9.0',
  });
  const e04onts = e04._normalizeONTs(e04map);
  const budi = e04onts.find((o) => o.description === 'BUDI');
  assert.ok(budi);
  assert.strictEqual(budi.pon_port, 1);
  assert.strictEqual(budi.onu_id, 1);
  assert.strictEqual(budi.mac_address, '1C:27:04:B3:BE:9F');
  assert.strictEqual(budi.signal_strength, -18.26);
  assert.strictEqual(budi.tr069_params.tx_power, 2.22);
  assert.strictEqual(budi.status, 'online');
  const budiMgmt = e04._toMgmtOnu(budi);
  assert.strictEqual(budiMgmt.name, 'BUDI');
  assert.strictEqual(budiMgmt.sn, '1C:27:04:B3:BE:9F');
  assert.strictEqual(budiMgmt.type, 'V3.1');
  assert.strictEqual(budiMgmt.onu_rx_dbm, -18.26);
  const buru = e04onts.find((o) => o.description === 'BU RU');
  assert.strictEqual(buru.signal_strength, -22.29);

  console.log('✓ HSGQ G02ID + E04R MIB tests PASS');
})().catch((e) => {
  console.error('✗ FAIL:', e.message);
  process.exit(1);
});
