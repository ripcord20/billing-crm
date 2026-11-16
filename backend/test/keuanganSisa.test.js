'use strict';
const assert = require('assert');
const {
  isInstallment,
  debtGroupKey,
  remainingById,
  attachRemaining,
  computeOutstanding,
  suggestPartyName
} = require('../utils/keuanganSisa');

const harisCicil = {
  id: 1040,
  type: 'hutang',
  category: 'cicil hutang',
  description: 'Haris',
  party_name: null,
  status: 'belum_lunas',
  amount: '220000.00'
};
const pinjamanHaris = {
  id: 1020,
  type: 'hutang',
  category: 'Pinjaman Bank',
  description: 'PINJAMAN HARIS',
  party_name: 'HARIS',
  status: 'cicilan',
  amount: '581000.00'
};

assert.strictEqual(isInstallment(harisCicil), true);
assert.strictEqual(isInstallment(pinjamanHaris), false);
assert.strictEqual(debtGroupKey(harisCicil), 'hutang:haris');
assert.strictEqual(debtGroupKey(pinjamanHaris), 'hutang:haris');

const byId = remainingById([harisCicil, pinjamanHaris]);
assert.strictEqual(byId.get(1040).remaining_amount, 361000);
assert.strictEqual(byId.get(1040).paid_amount, 220000);
assert.strictEqual(byId.get(1040).principal_amount, 581000);
assert.strictEqual(byId.get(1040).is_installment, true);
assert.strictEqual(byId.get(1020).remaining_amount, 361000);
assert.strictEqual(byId.get(1020).is_installment, false);

const attached = attachRemaining([harisCicil], [harisCicil, pinjamanHaris]);
assert.strictEqual(attached[0].remaining_amount, 361000);

const outstanding = computeOutstanding([harisCicil, pinjamanHaris]);
assert.strictEqual(outstanding.hutang.remaining, 361000);
assert.strictEqual(outstanding.hutang.count, 1);
assert.strictEqual(outstanding.piutang.remaining, 0);

const onlyPrincipal = remainingById([{ ...pinjamanHaris, status: 'belum_lunas' }]).get(1020);
assert.strictEqual(onlyPrincipal.remaining_amount, 581000);
assert.strictEqual(onlyPrincipal.paid_amount, 0);

const lunas = remainingById([
  { ...pinjamanHaris, status: 'lunas' },
  harisCicil
]).get(1020);
assert.strictEqual(lunas.remaining_amount, 0);

const overpay = remainingById([
  pinjamanHaris,
  { ...harisCicil, amount: 900000 }
]).get(1020);
assert.strictEqual(overpay.remaining_amount, 0);

const other = {
  id: 9,
  type: 'hutang',
  category: 'Pinjaman Bank',
  description: 'PINJAMAN BUDI',
  party_name: 'BUDI',
  status: 'belum_lunas',
  amount: 100000
};
assert.strictEqual(debtGroupKey(other), 'hutang:budi');
const mixed = computeOutstanding([harisCicil, pinjamanHaris, other]);
assert.strictEqual(mixed.hutang.remaining, 461000);
assert.strictEqual(mixed.hutang.count, 2);

const piutang = {
  id: 3,
  type: 'piutang',
  category: 'Tagihan Pelanggan',
  description: 'Haris',
  party_name: 'HARIS',
  status: 'belum_lunas',
  amount: 50000
};
assert.strictEqual(debtGroupKey(piutang), 'piutang:haris');
assert.strictEqual(computeOutstanding([pinjamanHaris, harisCicil, piutang]).piutang.remaining, 50000);

assert.strictEqual(
  suggestPartyName({ type: 'hutang', category: 'cicil hutang', description: 'Haris', party_name: null }, [pinjamanHaris]),
  'HARIS'
);

const sequelizeLike = {
  toJSON() { return { ...harisCicil }; }
};
assert.strictEqual(attachRemaining([sequelizeLike], [harisCicil, pinjamanHaris])[0].remaining_amount, 361000);

console.log('keuanganSisa.test.js OK');
