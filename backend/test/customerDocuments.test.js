'use strict';

const assert = require('assert');
const {
  normalizeCustomerDocuments,
  applyDocumentSlot,
  documentsFromRegistration,
  columnForSlot
} = require('../utils/customerDocuments');

assert.strictEqual(columnForSlot('ktp'), 'ktp_photo');
assert.strictEqual(columnForSlot('house'), 'house_photo');

const fromCols = normalizeCustomerDocuments({
  ktp_photo: '/uploads/customer/a.jpg',
  house_photo: '/uploads/customer/b.jpg',
  documents: []
});
assert.strictEqual(fromCols.ktp.url, '/uploads/customer/a.jpg');
assert.strictEqual(fromCols.house.url, '/uploads/customer/b.jpg');

const patched = applyDocumentSlot({ documents: [] }, 'ktp', {
  url: '/uploads/customer/ktp.jpg',
  name: 'ktp.jpg',
  size: 12
});
assert.strictEqual(patched.ktp_photo, '/uploads/customer/ktp.jpg');
assert.strictEqual(patched.documents.ktp.name, 'ktp.jpg');
assert.strictEqual(patched.house_photo, undefined);

const cleared = applyDocumentSlot(patched, 'ktp', null);
assert.strictEqual(cleared.ktp_photo, null);
assert.strictEqual(cleared.documents.ktp, undefined);

const fromReg = documentsFromRegistration({
  ktp_photo: '/uploads/sales/k.jpg',
  house_photo: '/uploads/sales/h.jpg'
});
assert.strictEqual(fromReg.ktp_photo, '/uploads/sales/k.jpg');
assert.strictEqual(fromReg.house_photo, '/uploads/sales/h.jpg');
assert.strictEqual(fromReg.documents.ktp.url, '/uploads/sales/k.jpg');

console.log('✓ customerDocuments tests PASS');
