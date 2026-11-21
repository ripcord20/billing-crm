'use strict';
/**
 * Render template WA selamat datang, termasuk alias Inggris
 * ({company_name}, {package_price}, {apk}, dll.).
 * Jalankan: node backend/test/welcomeTemplate.test.js
 */
const assert = require('assert');
const { getWelcomeData, replaceVariables } = require('../utils/templateHelper');

const vars = getWelcomeData({
  customerName: 'Andi Wijaya',
  customerId: 'CID0099',
  customerPhone: '081234567890',
  customerEmail: 'andi@example.com',
  customerAddress: 'Jl. Melati 1',
  packageName: 'Home 50 Mbps',
  packagePrice: 275000,
  installDateFormatted: '21 November 2026',
  dueDateFormatted: '21 Desember 2026',
  billingDay: 21,
  connectionType: 'pppoe',
  pppoeUser: 'andi.wijaya',
  staticIp: '',
  companyName: 'Fiberix',
  companyPhone: '08001234567',
  companyEmail: 'cs@fiberix.my.id',
  companyWebsite: 'https://fiberix.my.id',
  permanentLink: 'https://fiberix.my.id/pub/cust/abc',
  portalPassword: '081234567890'
});

assert.strictEqual(vars.nama, 'Andi Wijaya');
assert.strictEqual(vars.name, 'Andi Wijaya');
assert.strictEqual(vars.company_name, 'Fiberix');
assert.strictEqual(vars.perusahaan, 'Fiberix');
assert.strictEqual(vars.package, 'Home 50 Mbps');
assert.strictEqual(vars.package_price, 'Rp 275.000');
assert.strictEqual(vars.install_date, '21 November 2026');
assert.strictEqual(vars.billing_day, '21');
assert.strictEqual(vars.billing_type, 'Bulanan');
assert.strictEqual(vars.app_email, 'andi@example.com');
assert.strictEqual(vars.password, '081234567890');
assert.strictEqual(vars.apk, 'https://fiberix.my.id/aplikasi');
assert.strictEqual(vars.portal, 'https://fiberix.my.id/portal');
assert.strictEqual(vars.install_fee, '-');
assert.strictEqual(vars.logistic, '-');
assert.ok(vars.full_bill_amount.indexOf('275') !== -1);

const tpl = `Selamat datang di {company_name}!
Nama: {name}
Paket: {package}
Tarif: {package_price}
Pasang: {install_date}
JT: Tanggal {billing_day}
Jenis: {billing_type}
Pasang: {install_fee}
Awal: {bill_or_prorate}
Logistic: {logistic}
Total: {full_bill_amount}
Email: {app_email}
Password: {password}
APK: {apk}`;

const out = replaceVariables(tpl, vars);
assert.ok(!/\{[a-z_]+\}/.test(out), 'placeholder sisa: ' + out);
assert.ok(out.indexOf('Fiberix') !== -1);
assert.ok(out.indexOf('Andi Wijaya') !== -1);
assert.ok(out.indexOf('Home 50 Mbps') !== -1);
assert.ok(out.indexOf('Tanggal 21') !== -1);
assert.ok(out.indexOf('081234567890') !== -1);
assert.ok(out.indexOf('https://fiberix.my.id/aplikasi') !== -1);
assert.ok(out.indexOf('{company_name}') === -1);
assert.ok(out.indexOf('{package_price}') === -1);

// Key panjang tidak boleh rusak oleh key pendek
assert.strictEqual(
  replaceVariables('paket {package} harga {package_price}', vars),
  'paket Home 50 Mbps harga Rp 275.000'
);

console.log('welcomeTemplate.test.js OK');
