'use strict';
const assert = require('assert');
const {
  digitsOnly,
  normalizePhone,
  phoneVariants,
  phoneTail,
  normalizeNik,
  customerDupMessage,
  leadDupMessage
} = require('../utils/duplicateGuard');

assert.strictEqual(digitsOnly('+62 812-3456-7890'), '6281234567890');
assert.strictEqual(digitsOnly('0812 3456 7890'), '081234567890');
assert.strictEqual(digitsOnly(''), '');

assert.strictEqual(normalizePhone('081234567890'), '6281234567890');
assert.strictEqual(normalizePhone('+62 812-3456-7890'), '6281234567890');
assert.strictEqual(normalizePhone('81234567890'), '6281234567890');
assert.strictEqual(normalizePhone('6281234567890'), '6281234567890');
assert.strictEqual(normalizePhone(''), '');
assert.strictEqual(normalizePhone(null), '');

assert.strictEqual(phoneTail('081234567890'), '81234567890');
assert.strictEqual(phoneTail('6281234567890'), '81234567890');

const v08 = phoneVariants('081234567890');
assert.ok(v08.includes('081234567890'));
assert.ok(v08.includes('6281234567890'));
assert.ok(v08.includes('81234567890'));

const v62 = phoneVariants('+62 812-3456-7890');
assert.ok(v62.includes('6281234567890'));
assert.ok(v62.includes('081234567890'));

assert.strictEqual(normalizeNik('3275.01.01.01.0001'), '32750101010001');
assert.strictEqual(normalizeNik('123'), '');
assert.strictEqual(normalizeNik('12345678'), '12345678');

assert.ok(
  customerDupMessage({ customer_id: 'CID001', name: 'Budi' }, 'phone')
    .includes('Data ganda ditolak')
);
assert.ok(
  customerDupMessage({ customer_id: 'CID001', name: 'Budi' }, 'nik')
    .includes('NIK')
);
assert.ok(
  leadDupMessage({ reg_number: 'REG-1', name: 'Siti', status: 'lead' }, 'phone')
    .includes('pipeline')
);

console.log('duplicateGuard.test.js OK');
