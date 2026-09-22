'use strict';
/**
 * Parser CLI C-DATA FD1604S (Huawei-like) tanpa OLT asli.
 * Jalankan: node test/cdataOltFd1604.test.js
 */
const assert = require('assert');
const Module = require('module');
const stubs = {
  '../utils/logger': { info() {}, warn() {}, error() {}, debug() {} },
};
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === '../utils/logger' || id.endsWith('/utils/logger')) return stubs['../utils/logger'];
  return origRequire.apply(this, arguments);
};
const Cdata = require('../services/CdataOltService');

const s = new Cdata({ host: '127.0.0.1', name: 'POPMDR' });

assert.strictEqual(s.cmd.enter, 'config');
assert.strictEqual(s.cmd.onuList, 'show ont info all');
assert.strictEqual(s.pagingOffCmd, '');

const sample = `
POPMDR(config)# show ont info all
----------------------------------------------------------------------------------------
  F/S P  ONT    SN               Control  Run     Config    Match     Last       Desc
         ID                      flag     state   state     state     down-cause
----------------------------------------------------------------------------------------
  0/0 1  1      ZTEGCC1FBAD8     Active   Online  success   match     dying-gasp ERNI
  0/0 1  2      ZTEGCB6F59E2     Active   Online  success   match     dying-gasp ATNAWI RUMAH
  0/0 1  5      FHTT99B54118     Active   Online  success   match     dying-gasp PIPIT
  0/0 1  20     CMDCB2246977     Active   Online  success   match     dying-gasp --More ( Press 'Q' to quit )-- DEWI SAVANA
  0/0 2  1      HWTCE1C1039A     Active   Online  success   match     dying-gasp SAMSUL ARIFIN
  0/0 2  6      ZTEGC86447CB     Active   Offline initial   initial   --         ALFIN
  0/0 2  14     ZTEGD346E4A8     Active   Offline initial   initial   --         Fitri-Permatasari
----------------------------------------------------------------------------------------
  Total: 7, online: 5
`;

const list = s.parseOnuList(sample);
assert.strictEqual(list.length, 7, '7 baris ONU');

const erni = list.find((o) => o.sn === 'ZTEGCC1FBAD8');
assert.ok(erni, 'ERNI harus ketemu');
assert.strictEqual(erni.name, 'ERNI');
assert.strictEqual(erni.pon, '1');
assert.strictEqual(erni.onu_id, 1);
assert.strictEqual(erni.onu_if, '1/1');
assert.strictEqual(erni.status, 'online');

const atnawi = list.find((o) => o.sn === 'ZTEGCB6F59E2');
assert.strictEqual(atnawi.name, 'ATNAWI RUMAH');

const dewi = list.find((o) => o.sn === 'CMDCB2246977');
assert.ok(dewi, 'pager di tengah nama harus dibersihkan');
assert.strictEqual(dewi.name, 'DEWI SAVANA');

const alfin = list.find((o) => o.sn === 'ZTEGC86447CB');
assert.strictEqual(alfin.status, 'offline');
assert.strictEqual(alfin.name, 'ALFIN');
assert.strictEqual(alfin.pon, '2');
assert.strictEqual(alfin.phase_state, 'Offline');

const fitri = list.find((o) => o.sn === 'ZTEGD346E4A8');
assert.strictEqual(fitri.name, 'Fitri-Permatasari');
assert.strictEqual(fitri.status, 'offline');

const pon1 = s.parseOnuList(sample, 1);
assert.strictEqual(pon1.length, 4);
assert.ok(pon1.every((o) => o.pon === '1'));

const opt = `
-------------------------------------------------------------------------------------
ONT    Rx power     Tx power     OLT Rx ONT    Temperature    Voltage     Current
ID     (dBm)        (dBm)         power(dBm)   (C)            (V)         (mA)
-------------------------------------------------------------------------------------
1      -21.00       2.35         -28.54        54.02          3.40        13.87
2      -20.87       2.27         -30.00        55.82          3.40        14.69
6      --           --           --            --             --          --
`;
const byId = s.parseOpticalTable(opt);
assert.strictEqual(byId.get(1).onu_rx_dbm, -21);
assert.strictEqual(byId.get(1).onu_tx_dbm, 2.35);
assert.strictEqual(byId.get(1).quality, 'good');
assert.strictEqual(byId.get(2).onu_rx_dbm, -20.87);
assert.strictEqual(byId.get(6).onu_rx_dbm, null);

const detailOut = `
  F/S                  : 0/0
  Port                 : 1
  ONT-ID               : 1
  Control flag         : active
  Run state            : online
  Distance(m)          : 2027
  Authentic mode       : sn-auth
  SN                   : ZTEGCC1FBAD8 (ZTEG-CC1FBAD8)
  Description          : ERNI
  Online  time         : 4days 9h:45m:47s
`;
const det = s.parseOnuDetail(detailOut, 1, 1);
assert.strictEqual(det.serial_number, 'ZTEGCC1FBAD8');
assert.strictEqual(det.name, 'ERNI');
assert.strictEqual(det.distance_m, 2027);
assert.strictEqual(det.onu_if, '1/1');

const optDet = s.parseOpticalDetail(`
  Rx optical power(dBm)                   : -21.00
  Tx optical power(dBm)                   : 2.35
  OLT Rx ONT optical power(dBm)           : -28.54
`, 1);
assert.strictEqual(optDet.onu_rx_dbm, -21);
assert.strictEqual(optDet.onu_tx_dbm, 2.35);
assert.strictEqual(optDet.olt_rx_dbm, -28.54);
assert.strictEqual(optDet.quality, 'good');

const packed = s._pack(list);
assert.strictEqual(packed.onus.length, 7);
assert.strictEqual(packed.ports.length, 2);
const p1 = packed.ports.find((p) => p.port === '1');
assert.strictEqual(p1.total, 4);
assert.strictEqual(p1.online, 4);
const p2 = packed.ports.find((p) => p.port === '2');
assert.strictEqual(p2.offline, 2);

const uncfgEmpty = s.parseUncfg('There is no ONT available.');
assert.strictEqual(uncfgEmpty.length, 0);

console.log('cdataOltFd1604.test.js OK');
