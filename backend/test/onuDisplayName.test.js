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
  resetCacheMemo,
} = require('../utils/onuDisplayName');

assert.strictEqual(snKey('HWTCa046999d'), 'hwtca046999d');
assert.strictEqual(snKey('HWTC:a0-46-99-9d'), 'hwtca046999d');

assert.strictEqual(isPlaceholderName('', 'HWTCa046999d'), true);
assert.strictEqual(isPlaceholderName('HWTCa046999d', 'HWTCa046999d'), true);
assert.strictEqual(isPlaceholderName('HSGQ-P1O003', 'x'), true);
assert.strictEqual(isPlaceholderName('ONU-P1/3', 'x'), true);
assert.strictEqual(isPlaceholderName('ARUL', 'HWTCa046999d'), false);
assert.strictEqual(isPlaceholderName('ONT01/004', 'FHTTc1805fcc'), false);

const cacheFile = path.join(os.tmpdir(), 'olt_mgmt_cache_name_test.json');
fs.writeFileSync(cacheFile, JSON.stringify({
  '1790095860667': {
    onus: [
      { name: 'ARUL', sn: 'HWTCa046999d' },
      { name: 'KUSMINAWATI', sn: 'ZICG129ae258' },
      { name: 'HSGQ-P1O003', sn: 'AABBCCDDEEFF' },
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

async function runAsync() {
  resetCacheMemo();
  const rows = await enrichAttenuationRows([
    { serial_number: 'HWTCa046999d', olt_name: 'HSGQ-G02ID' },
    { serial_number: 'ZICG129ae258' },
  ], { cachePath: cacheFile });
  assert.strictEqual(rows[0].onu_name, 'ARUL');
  assert.strictEqual(rows[0].display_name, 'ARUL');
  assert.strictEqual(rows[1].onu_name, 'KUSMINAWATI');
  try { fs.unlinkSync(cacheFile); } catch (_) {}
  console.log('onuDisplayName.test.js OK');
}

runAsync().catch((e) => {
  console.error(e);
  process.exit(1);
});
