'use strict';
const assert = require('assert');
const { parseOntLabel, isGponSn, isDeviceSn } = require('../../frontend/public/js/parseOntLabel');

const sticker = [
  'MAC:30-40-74-8D-05-50',
  'GPON SN:ZTEGD5D45D98',
  'D-SN:ZTEEQJNQ1U19878',
  'ZXHN F670L'
].join('\n');

const haris = parseOntLabel(sticker);
assert.strictEqual(haris.sn, 'ZTEGD5D45D98');
assert.strictEqual(haris.mac, '30:40:74:8D:05:50');

const barcodesFirstDsn = parseOntLabel('', [
  'ZTEEQJNQ1U19878',
  '3040748D0550',
  'ZTEGD5D45D98'
]);
assert.strictEqual(barcodesFirstDsn.sn, 'ZTEGD5D45D98');
assert.strictEqual(barcodesFirstDsn.mac, '30:40:74:8D:05:50');

const oldRegexWouldPickDsn = parseOntLabel('D-SN:ZTEEQJNQ1U19878\nGPON SN:ZTEGE5D4539A');
assert.strictEqual(oldRegexWouldPickDsn.sn, 'ZTEGE5D4539A');

assert.strictEqual(isGponSn('ZTEGD5D45D98'), true);
assert.strictEqual(isDeviceSn('ZTEEQJNQ1U19878'), true);
assert.strictEqual(isGponSn('ZTEEQJNQ1U19878'), false);

const dsnOnly = parseOntLabel('D-SN:ZTEEQJNQ1U19878');
assert.strictEqual(dsnOnly.sn, '');

const huawei = parseOntLabel('GPON SN:HWTC1234ABCD\nMAC 11-22-33-44-55-66');
assert.strictEqual(huawei.sn, 'HWTC1234ABCD');
assert.strictEqual(huawei.mac, '11:22:33:44:55:66');

console.log('parseOntLabel.test.js OK');
