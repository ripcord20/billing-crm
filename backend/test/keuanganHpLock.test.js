'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '../../frontend/views/pages/keuangan.ejs'),
  'utf8'
);

assert.ok(!/fin-grid" style="grid-template-columns:repeat\(5/.test(src),
  'KPI strip tidak boleh pakai inline 5-kolom (mengalahkan media query HP)');
assert.ok(src.includes('keu-table-wrap'),
  'wrapper tabel memakai kelas keu-table-wrap, bukan overflow-x:auto');
assert.ok(!/<div style="overflow-x:auto">\s*<table class="keu-table">/.test(src),
  'tabel transaksi tidak boleh overflow-x:auto (itu yang bikin geser kanan di HP)');
assert.ok(src.includes('keu-hp-lock'),
  'ada blok CSS kunci lebar HP');
assert.ok(/@media\(max-width:900px\)[\s\S]*type-tabs\s*\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(src),
  'tab Masuk/Keluar/Hutang/Modal 2 kolom di HP');
assert.ok(/@media\(max-width:900px\)[\s\S]*form-row\s*\{\s*grid-template-columns:minmax\(0,1fr\)/.test(src),
  'baris Jumlah + Tanggal 1 kolom di HP');
assert.ok(/@media\(max-width:900px\)[\s\S]*\.keu-table thead \{ display:none; \}/.test(src),
  'header tabel disembunyikan, baris jadi kartu');
assert.ok(src.includes('data-label="Kategori / Deskripsi"'),
  'sel tabel punya data-label untuk kartu HP');
assert.ok(src.includes('data-label="Aksi"'),
  'kolom aksi punya data-label agar tombol hapus tidak terpotong');
assert.ok(/input\[type="date"\]\.form-control \{ min-width:0/.test(src),
  'input tanggal tidak boleh min-width native yang melebarkan halaman');
assert.ok(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/.test(src),
  'KPI grid minmax(0,1fr) supaya 1fr tidak meledak');

console.log('keuanganHpLock.test.js OK');
