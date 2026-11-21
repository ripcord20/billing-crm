'use strict';
const assert = require('assert');
const {
  shouldSkipPeriodFilter,
  buildKeuanganListWhere
} = require('../utils/keuanganList');

const Op = { or: Symbol('or'), like: Symbol('like'), between: Symbol('between') };

function pad(n) { return String(n).padStart(2, '0'); }
const momentStub = (input) => {
  const d = new Date(input);
  const api = {
    startOf() { return api; },
    endOf(unit) {
      if (unit === 'month') d.setMonth(d.getMonth() + 1, 0);
      return api;
    },
    format() {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    clone() { return momentStub(d.toISOString().slice(0, 10)); }
  };
  return api;
};

assert.strictEqual(shouldSkipPeriodFilter({ type: 'hutang' }), true);
assert.strictEqual(shouldSkipPeriodFilter({ type: 'piutang' }), true);
assert.strictEqual(shouldSkipPeriodFilter({ type: 'pemasukan' }), false);
assert.strictEqual(shouldSkipPeriodFilter({ type: 'pengeluaran', search: 'HARIS' }), true);
assert.strictEqual(shouldSkipPeriodFilter({ type: 'pemasukan', all_months: '1' }), true);

const hutangNov = buildKeuanganListWhere(
  { type: 'hutang', month: 11, year: 2026 },
  { Op, moment: momentStub }
);
assert.strictEqual(hutangNov.skipPeriod, true);
assert.strictEqual(hutangNov.where.type, 'hutang');
assert.strictEqual(hutangNov.where.date, undefined, 'hutang tidak boleh terfilter bulan');

const searchHaris = buildKeuanganListWhere(
  { month: 11, year: 2026, search: 'HARIS' },
  { Op, moment: momentStub }
);
assert.strictEqual(searchHaris.skipPeriod, true);
assert.ok(searchHaris.where[Op.or], 'cari harus Op.or');
assert.strictEqual(searchHaris.where.date, undefined, 'cari mencakup semua bulan');

const pemasukanNov = buildKeuanganListWhere(
  { type: 'pemasukan', month: 11, year: 2026 },
  { Op, moment: momentStub }
);
assert.strictEqual(pemasukanNov.skipPeriod, false);
assert.deepStrictEqual(pemasukanNov.where.date[Op.between], ['2026-11-01', '2026-11-30']);

const semuaTahun = buildKeuanganListWhere(
  { year: 2026 },
  { Op, moment: momentStub }
);
assert.deepStrictEqual(semuaTahun.where.date[Op.between], ['2026-01-01', '2026-12-31']);

console.log('keuanganList.test.js OK');
