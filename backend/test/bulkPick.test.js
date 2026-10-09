'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../../frontend/public/js/payments.js'), 'utf8');

assert.ok(src.includes('_bulkPicked'), 'setor massal harus menyimpan pilihan di Map, bukan hanya baris tampil');
assert.ok(
  !/_bulkSelected\.forEach\(id => \{ if \(_bulkRows\.some/.test(src),
  'jangan hapus centang hanya karena pelanggan tidak ada di hasil pencarian'
);
assert.ok(src.includes('toggleBulkCheck'), 'checkbox harus onchange terpisah supaya tidak dobel-toggle');
assert.ok(src.includes('[..._bulkPicked.values()]'), 'setor harus memakai semua yang dicentang, termasuk yang sedang tidak tampil');
assert.ok(src.includes('pay_method') && src.includes('pay_notes'), 'setor massal harus kirim metode dan catatan per pelanggan');
assert.ok(src.includes("['ntf', 'NTF']") || src.includes("['ntf','NTF']") || src.includes("['ntf', 'NTF']"), 'opsi NTF harus ada');

function applySearch(picked, visibleRows) {
  for (const row of visibleRows) {
    if (picked.has(row.id)) picked.set(row.id, row);
  }
  return picked;
}

const picked = new Map();
picked.set(1, { id: 1, name: 'Agus', amount: 150000 });
applySearch(picked, [{ id: 2, name: 'Elisa', amount: 100000 }]);
assert.strictEqual(picked.has(1), true, 'Agus tetap dipilih setelah cari Elisa');
assert.strictEqual(picked.size, 1);
picked.set(2, { id: 2, name: 'Elisa', amount: 100000 });
assert.strictEqual(picked.size, 2);
const items = [...picked.values()].map(r => ({ customer_id: r.id, amount: r.amount }));
assert.deepStrictEqual(items.map(i => i.customer_id).sort(), [1, 2]);

console.log('bulkPick.test.js OK');
