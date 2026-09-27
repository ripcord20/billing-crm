'use strict';
/**
 * Nama ONU dari cache OLT / ont_devices.
 * Jalankan: node test/onuDisplayName.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  snKey,
  isPlaceholderName,
  displayOnuName,
  enrichAttenuationRows,
  resolveOnuFromCache,
  resetCacheMemo,
} = require('../utils/onuDisplayName');

assert.strictEqual(snKey('HWTCa046999d'), 'hwtca046999d');
assert.strictEqual(snKey('HWTC:a0-46-99-9d'), 'hwtca046999d');

assert.strictEqual(isPlaceholderName('', 'HWTCa046999d'), true);
assert.strictEqual(isPlaceholderName('HWTCa046999d', 'HWTCa046999d'), true);
assert.strictEqual(isPlaceholderName('HSGQ-P1O003', 'x'), true);
assert.strictEqual(isPlaceholderName('ONU-P1/3', 'x'), true);
assert.strictEqual(isPlaceholderName('ONT01/004', 'FHTTc1805fcc'), true);
assert.strictEqual(isPlaceholderName('ONU02/39', 'x'), true);
assert.strictEqual(isPlaceholderName('ARUL', 'HWTCa046999d'), false);
assert.strictEqual(isPlaceholderName('HARIYANA', 'FHTT9d201040'), false);

const cacheFile = path.join(os.tmpdir(), 'olt_mgmt_cache_name_test.json');
fs.writeFileSync(cacheFile, JSON.stringify({
  '1790095860667': {
    system: { model: 'HSGQ-G02ID' },
    onus: [
      { name: 'ARUL', sn: 'HWTCa046999d', onu_if: '1/3', status: 'online' },
      { name: 'KUSMINAWATI', sn: 'ZICG129ae258', onu_if: '1/6', status: 'online' },
      { name: 'HSGQ-P1O003', sn: 'AABBCCDDEEFF' },
      { name: 'ONT01/048', sn: 'FHTT9d201040', onu_if: '1/48', status: 'online' },
    ],
  },
  '1790103419693': {
    system: { model: 'HSGQ-G04ID' },
    onus: [
      { name: 'HARIYANA', sn: 'FHTT9d201040', onu_if: '3/80', status: 'offline' },
    ],
  },
}), 'utf8');
resetCacheMemo();

assert.strictEqual(displayOnuName({ serial: 'HWTCa046999d', cachePath: cacheFile }), 'ARUL');
assert.strictEqual(displayOnuName({ serial: 'ZICG129ae258', cachePath: cacheFile }), 'KUSMINAWATI');
assert.strictEqual(displayOnuName({
  serial: 'AABBCCDDEEFF',
  cachePath: cacheFile,
  ont: { model: 'PELANGGAN-A', serial_number: 'AABBCCDDEEFF' },
}), 'PELANGGAN-A');
assert.strictEqual(displayOnuName({
  serial: 'UNKNOWN123',
  cachePath: cacheFile,
  ont: { model: 'ONU-P1/3', serial_number: 'UNKNOWN123' },
}), '');

const hari = resolveOnuFromCache('FHTT9d201040', {
  cachePath: cacheFile,
  hintOlt: 'HSGQ-G02ID',
});
assert.ok(hari, 'HARIYANA harus ketemu di cache');
assert.strictEqual(hari.name, 'HARIYANA');
assert.strictEqual(hari.oltName, 'HSGQ-G04ID');
assert.strictEqual(hari.onuIf, '3/80');

async function runAsync() {
  resetCacheMemo();
  const rows = await enrichAttenuationRows([
    { serial_number: 'HWTCa046999d', olt_name: 'HSGQ-G02ID' },
    { serial_number: 'ZICG129ae258' },
    { serial_number: 'FHTT9d201040', olt_name: 'HSGQ-G02ID' },
  ], { cachePath: cacheFile });
  assert.strictEqual(rows[0].onu_name, 'ARUL');
  assert.strictEqual(rows[0].display_name, 'ARUL');
  assert.strictEqual(rows[0].olt_name, 'HSGQ-G02ID');
  assert.strictEqual(rows[1].onu_name, 'KUSMINAWATI');
  assert.strictEqual(rows[2].onu_name, 'HARIYANA');
  assert.strictEqual(rows[2].olt_name, 'HSGQ-G04ID', 'jangan campur nama G04 dengan OLT G02');
  assert.strictEqual(rows[2].onu_if, '3/80');
  try { fs.unlinkSync(cacheFile); } catch (_) {}
  console.log('onuDisplayName.test.js OK');
}

runAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});
