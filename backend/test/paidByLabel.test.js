'use strict';
const assert = require('assert');
const {
  describePaidBy,
  paidByVars,
  ensurePaidByLine,
  getPaymentConfirmationData,
  replaceVariables,
  getDefaultPaymentTemplate
} = require('../utils/templateHelper');

const selfPay = describePaidBy({});
assert.strictEqual(selfPay.dilunasi_oleh, 'saya');
assert.strictEqual(selfPay.dilunasi_oleh_lengkap, 'Dilunasi oleh saya');

const gateway = describePaidBy({ paymentMethod: 'gateway' });
assert.strictEqual(gateway.dilunasi_oleh, 'saya');

const col = describePaidBy({
  collectedById: 9,
  collectorName: 'Syaiful',
  paymentMethod: 'field_collection'
});
assert.strictEqual(col.dilunasi_oleh, 'kolektor Syaiful');
assert.strictEqual(col.dilunasi_oleh_lengkap, 'Dilunasi oleh kolektor Syaiful');

const byRole = describePaidBy({ userRole: 'collector', collectorName: 'Budi' });
assert.strictEqual(byRole.dilunasi_oleh, 'kolektor Budi');

const noName = describePaidBy({ paymentMethod: 'field_collection' });
assert.strictEqual(noName.dilunasi_oleh, 'kolektor');

const vars = paidByVars({ collectedById: 1, collectorName: 'Ani' });
assert.strictEqual(vars.paid_by, 'kolektor Ani');

const appended = ensurePaidByLine('Terima kasih', { dilunasi_oleh_lengkap: 'Dilunasi oleh saya' });
assert.ok(appended.includes('Dilunasi oleh saya'));
const already = ensurePaidByLine('OK\nDilunasi oleh kolektor Budi', { dilunasi_oleh_lengkap: 'Dilunasi oleh saya' });
assert.ok(!already.includes('Dilunasi oleh saya'));

const data = getPaymentConfirmationData({
  customerName: 'Andi',
  amountFormatted: 'Rp 150.000',
  paymentDateFormatted: '17/10/2026',
  method: 'field_collection',
  methodLabel: 'Cash Collect',
  collectorName: 'Syaiful',
  collectedById: 3
});
assert.strictEqual(data.dilunasi_oleh, 'kolektor Syaiful');
const msg = replaceVariables(getDefaultPaymentTemplate(), data);
assert.ok(msg.includes('kolektor Syaiful'), msg);

console.log('paidByLabel.test.js ok');
