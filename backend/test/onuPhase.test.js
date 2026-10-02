'use strict';
/**
 * Parser phase ONU: dying-gasp harus terpisah dari LOS.
 * Jalankan: node test/onuPhase.test.js
 */
const assert = require('assert');
const Module = require('module');
const stubs = {
  'telnet-client': { Telnet: class { on() {} async connect() {} async exec() { return ''; } async send() { return ''; } async end() {} } },
  'ssh2': { Client: class {} },
};
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) { return stubs[id] || origRequire.apply(this, arguments); };

const onuPhase = require('../utils/onuPhase');
const Gpon = require('../services/GponCliOltService');
const Cdata = require('../services/CdataOltService');
const Zte = require('../services/ZteOltService');

function assertPhase(raw, expected) {
  assert.strictEqual(onuPhase.normalize(raw), expected, `normalize(${JSON.stringify(raw)})`);
}

(async () => {
  assertPhase('dying-gasp', 'dyinggasp');
  assertPhase('DyingGasp', 'dyinggasp');
  assertPhase('dying gasp', 'dyinggasp');
  assertPhase('LOS', 'los');
  assertPhase('loss', 'los');
  assertPhase('working', 'working');
  assertPhase('offline', 'offline');
  assert.strictEqual(onuPhase.qualityFor('dying-gasp', 'los'), 'dyinggasp');
  assert.strictEqual(onuPhase.qualityFor('los', 'los'), 'los');
  assert.strictEqual(onuPhase.extractDownCause('Last down cause : dying-gasp'), 'dyinggasp');
  assert.strictEqual(onuPhase.extractDownCause('Last offline reason: LOS'), 'los');
  assert.strictEqual(onuPhase.findPhaseToken('1 enable disable dying-gasp').phase, 'dyinggasp');
  assert.strictEqual(onuPhase.findPhaseToken('0/0 1 1 SN Active dying-gasp success match').phase, 'dyinggasp');
  // Control-flag Active jangan lolos sebagai online
  assert.strictEqual(onuPhase.findPhaseToken('0/0 1 1 SN Active offline success match').phase, 'offline');

  const svc = new Gpon({ host: 'x' });

  // Cortina: SN + dying-gasp + nama ber-spasi (Agus pasar)
  const cortina = svc.parseOnuList(
    'ONU-ID  SN              State       Description\n' +
    '1       CDTA1234ABCD    dying-gasp  Agus pasar\n' +
    '2       CDTA9999EEEE    LOS         Elisa\n' +
    '3       CDTA0000FFFF    online      Budi\n',
    1
  );
  assert.strictEqual(cortina.length, 3);
  assert.strictEqual(cortina[0].name, 'Agus pasar');
  assert.strictEqual(onuPhase.normalize(cortina[0].phase_state), 'dyinggasp');
  assert.strictEqual(cortina[0].status, 'offline');
  assert.strictEqual(cortina[1].name, 'Elisa');
  assert.strictEqual(onuPhase.normalize(cortina[1].phase_state), 'los');
  assert.strictEqual(cortina[2].status, 'online');

  // Cortina phase-table: dying-gasp di kolom state, bukan SN
  const phaseTbl = svc.parseOnuList(
    'ONU-ID  Admin  OMCC    Phase\n' +
    '1       enable disable dying-gasp\n' +
    '2       enable disable los\n',
    2
  );
  assert.strictEqual(onuPhase.normalize(phaseTbl[0].phase_state), 'dyinggasp');
  assert.ok(!onuPhase.looksLikeSn('dying-gasp'));
  assert.notStrictEqual(phaseTbl[0].sn, 'dying-gasp');

  // Huawei-style CDATA FD1604
  const hw = svc.parseOnuList(
    'F/S P ONT SN           Control Run        Config  Match\n' +
    '0/0 1 5  CDTAAAA11111  Active  dying-gasp success match Agus pasar\n' +
    '0/0 1 8  CDTBBBB22222  Active  offline    success match Elisa\n',
    1
  );
  assert.strictEqual(hw.length, 2);
  assert.strictEqual(hw[0].onu_id, 5);
  assert.strictEqual(hw[0].sn, 'CDTAAAA11111');
  assert.strictEqual(onuPhase.normalize(hw[0].phase_state), 'dyinggasp');
  assert.ok(/Agus pasar/i.test(hw[0].name || ''));
  assert.strictEqual(hw[1].onu_id, 8);

  const opticalGasp = svc.parseOptical(
    'ONU-ID  Rx(dBm)  Tx(dBm)\n' +
    'Last down cause : dying-gasp\n' +
    '5       N/A      N/A\n',
    5
  );
  assert.strictEqual(opticalGasp.quality, 'dyinggasp');

  const opticalLos = svc.parseOptical('ONU-ID Rx Tx\nno signal\nLOS\n', 5);
  assert.strictEqual(opticalLos.quality, 'los');

  const detail = svc.parseOnuDetail(
    'Name : Agus pasar\nPhase : offline\nLast down cause : dying-gasp\nSN : CDTA1234ABCD\n',
    1, 5
  );
  assert.strictEqual(detail.phase_state, 'dyinggasp');
  assert.strictEqual(detail.last_down_cause, 'dyinggasp');
  assert.ok(/listrik/i.test(detail.diagnosis || ''));

  const cdata = new Cdata({ host: 'x' });
  const fromCdata = cdata.parseOnuList('1 CDTA1234ABCD DyingGasp Agus pasar\n', 3);
  assert.strictEqual(onuPhase.normalize(fromCdata[0].phase_state), 'dyinggasp');
  assert.strictEqual(fromCdata[0].name, 'Agus pasar');

  const zte = new Zte({ host: 'x' });
  assert.strictEqual(onuPhase.fromSnmpCode(2), 'los');
  assert.strictEqual(onuPhase.fromSnmpCode(3), 'working');
  assert.strictEqual(onuPhase.fromSnmpCode(5), 'dyinggasp');
  assert.strictEqual(onuPhase.statusFromPhase(onuPhase.fromSnmpCode(5)), 'offline');
  assert.strictEqual(onuPhase.label('dying-gasp'), 'Dying Gasp');

  const zteParsed = zte._parseOnuState(
    'OnuIndex Admin OMCC Phase Channel\n' +
    'gpon-onu_1/2/1:5 enable disable dying-gasp 1\n' +
    '1/2/1:6 enable disable LOS 1(GPON)\n',
    'gpon-olt_1/2/1'
  );
  assert.strictEqual(zteParsed[0].phase_state, 'dyinggasp');
  assert.strictEqual(zteParsed[0].status, 'offline');
  assert.strictEqual(zteParsed[1].phase_state, 'los');

  console.log('✓ ONU phase / dying-gasp tests PASS');
})().catch(e => { console.error('✗ FAIL:', e.message); console.error(e.stack); process.exit(1); });
