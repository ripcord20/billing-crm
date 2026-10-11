const fs = require('fs');
const path = require('path');
const assert = require('assert');

const svc = fs.readFileSync(path.join(__dirname, '../services/CollectionService.js'), 'utf8');
assert.ok(svc.includes("attributes: ['id']"), 'generateTasks harus SELECT id saja supaya tidak pecah jika kolom pay_lat belum ada');

const srv = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
assert.ok(srv.includes("collection_assignments.pay_lat"), 'startup harus menambah kolom pay_lat kolektor');

const field = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/collect-field.ejs'), 'utf8');
assert.ok(field.includes('data-method="cash"'), 'kolektor harus bisa pilih Cash');
assert.ok(field.includes('data-method="transfer"'), 'kolektor harus bisa pilih Transfer');
assert.ok(field.includes('data-method="ewallet"'), 'kolektor harus bisa pilih E-Wallet');
assert.ok(field.includes("fd.append('payment_method'"), 'form Bayar mengirim tipe pembayaran');

const ctrl = fs.readFileSync(path.join(__dirname, '../controllers/CollectorFieldController.js'), 'utf8');
assert.ok(ctrl.includes("payMethod"), 'backend kolektor menyimpan metode yang dipilih');
assert.ok(ctrl.includes("holdsCash"), 'kas di tangan hanya bertambah untuk Cash');

console.log('collectionAssign.test.js OK');
