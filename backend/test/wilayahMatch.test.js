'use strict';

const assert = require('assert');
const {
  normalize,
  generateCode,
  prettyVillageName,
  customerMatchesWilayah,
  pickWilayahForCustomer
} = require('../utils/wilayahMatch');

assert.strictEqual(normalize('Kel. KAMPUNGMANDAR'), 'KAMPUNGMANDAR');
assert.strictEqual(normalize('KAMPUNG MANDAR'), 'MANDAR');
assert.strictEqual(generateCode('KAMPUNG MANDAR'), 'MDR');
assert.strictEqual(generateCode('LATENG'), 'LTG');
assert.strictEqual(generateCode('BULUSAN'), 'BLSN');
assert.strictEqual(prettyVillageName('KAMPUNGMANDAR'), 'KAMPUNG MANDAR');

const mdr = { id: 1, name: 'KAMPUNG MANDAR', code: 'MDR', village: 'KAMPUNGMANDAR' };
const ltg = { id: 2, name: 'LATENG', code: 'LTG', village: 'LATENG' };

assert.ok(customerMatchesWilayah({
  name: 'MDR-HARIS SAKINA',
  village: 'KAMPUNGMANDAR',
  address: 'JL DI PANJAITAN No. 4, Kel. KAMPUNGMANDAR, Kec. BANYUWANGI'
}, mdr));

assert.ok(!customerMatchesWilayah({
  name: 'LTG-TEST',
  village: 'LATENG'
}, mdr));

assert.strictEqual(pickWilayahForCustomer({
  name: 'MDR-HARIS SAKINA',
  village: 'KAMPUNGMANDAR'
}, [ltg, mdr]).code, 'MDR');

const {
  packageMatchesWilayah,
  pickWilayahForPackage
} = require('../utils/wilayahMatch');

assert.ok(packageMatchesWilayah({ name: 'CORE 2 MDR STARTER/LITE/HEMAT 100k' }, mdr));
assert.ok(!packageMatchesWilayah({ name: 'CORE 2 MDR STARTER/LITE/HEMAT 100k' }, ltg));
assert.strictEqual(pickWilayahForPackage({
  name: 'CORE 2 MDR STARTER/LITE/HEMAT 100k'
}, [ltg, mdr]).code, 'MDR');
assert.strictEqual(pickWilayahForPackage({ name: 'Paket Umum 50 Mbps' }, [ltg, mdr]), null);

console.log('wilayahMatch.test.js OK');
