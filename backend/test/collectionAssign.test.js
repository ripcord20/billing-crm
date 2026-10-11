const fs = require('fs');
const path = require('path');
const assert = require('assert');

const svc = fs.readFileSync(path.join(__dirname, '../services/CollectionService.js'), 'utf8');
assert.ok(svc.includes("attributes: ['id']"), 'generateTasks harus SELECT id saja supaya tidak pecah jika kolom pay_lat belum ada');
assert.ok(svc.includes('syncUnpaidTasks'), 'generate invoice harus bisa buat tugas kolektor');
assert.ok(svc.includes('defaultCollectorId'), 'tugas baru di-assign ke kolektor aktif bila hanya satu');

const bill = fs.readFileSync(path.join(__dirname, '../controllers/BillingController.js'), 'utf8');
assert.ok(bill.includes('already_paid'), 'invoice yang sudah lunas dilaporkan ke UI');
assert.ok(bill.includes('syncUnpaidTasks'), 'setelah generate invoice, tugas kolektor disinkron');

const srv = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.ok(srv.includes("collection_assignments.pay_lat"), 'startup harus menambah kolom pay_lat kolektor');

const field = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/collect-field.ejs'), 'utf8');
assert.ok(field.includes('data-method="cash"'), 'kolektor harus bisa pilih Cash');
assert.ok(field.includes('data-method="transfer"'), 'kolektor harus bisa pilih Transfer');
assert.ok(field.includes('data-method="ewallet"'), 'kolektor harus bisa pilih E-Wallet');
assert.ok(field.includes("fd.append('payment_method'"), 'form Bayar mengirim tipe pembayaran');
assert.ok(field.includes('id="payBankWrap"'), 'Transfer harus punya pilihan bank');
assert.ok(field.includes('data-wallet="dana"'), 'E-Wallet harus punya pilihan DANA');
assert.ok(field.includes('data-wallet="ovo"'), 'E-Wallet harus punya pilihan OVO');
assert.ok(field.includes('data-wallet="gopay"'), 'E-Wallet harus punya pilihan GoPay');
assert.ok(field.includes('data-wallet="qris"'), 'E-Wallet harus punya pilihan QRIS');
assert.ok(field.includes("fd.append('bank'"), 'form Bayar mengirim nama bank');

const ctrl = fs.readFileSync(path.join(__dirname, '../controllers/CollectorFieldController.js'), 'utf8');
assert.ok(ctrl.includes("payMethod"), 'backend kolektor menyimpan metode yang dipilih');
assert.ok(ctrl.includes("holdsCash"), 'kas di tangan hanya bertambah untuk Cash');
assert.ok(ctrl.includes("bankName"), 'backend kolektor menyimpan nama bank transfer');
assert.ok(ctrl.includes("Pilih atau isi nama bank"), 'transfer tanpa bank ditolak');
assert.ok(ctrl.includes('paid_by_name'), 'tugas lunas membawa nama yang melunasi');

assert.ok(bill.includes('paid_by_name'), 'daftar invoice membawa nama yang melunasi');
assert.ok(bill.includes('attachPaidByName'), 'nama pelunasan diisi dari collector/recorder');

const payCtrl = fs.readFileSync(path.join(__dirname, '../controllers/PaymentController.js'), 'utf8');
assert.ok(payCtrl.includes("paidByDisplayName"), 'invoice data memakai nama kolektor/admin, bukan System');
assert.ok(!payCtrl.includes("recorded_by_name = 'System'"), 'invoice tidak boleh hardcode System');

assert.ok(field.includes('id="pdBy"'), 'detail lunas kolektor menampilkan Dilunasi oleh');
assert.ok(field.includes('Dilunasi oleh'), 'kartu lunas kolektor menampilkan Dilunasi oleh');

const invPage = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/invoice.ejs'), 'utf8');
assert.ok(invPage.includes('id="paidBy"'), 'halaman invoice menampilkan Dilunasi oleh');

const { paidByDisplayName, paidByFromPayment } = require('../utils/paidBy');
assert.strictEqual(paidByDisplayName('Andi', 'Budi'), 'Andi');
assert.strictEqual(paidByDisplayName(null, 'Budi'), 'Budi');
assert.strictEqual(paidByDisplayName(null, null, 'Migrasi status billingradius'), 'Migrasi BillingRadius');
assert.strictEqual(paidByDisplayName(null, null, null), 'Sistem');
assert.strictEqual(paidByFromPayment({ collector: { name: 'Rina' }, recorder: { name: 'Admin' } }), 'Rina');
assert.strictEqual(paidByFromPayment({ recorded_by: 9, collected_by: 3 }), '');

console.log('collectionAssign.test.js OK');
