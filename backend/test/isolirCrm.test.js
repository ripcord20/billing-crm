const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  shouldClearIsolir,
  outstandingInvoiceSql
} = require('../utils/isolirCrm');

assert.strictEqual(shouldClearIsolir('isolated', 0), true);
assert.strictEqual(shouldClearIsolir('restoring', 0), true);
assert.strictEqual(shouldClearIsolir('isolated', 1), false);
assert.strictEqual(shouldClearIsolir('active', 0), false);
assert.strictEqual(shouldClearIsolir('isolated', 3), false);

const sql = outstandingInvoiceSql('c');
assert.ok(sql.includes("i.status IN ('unpaid','overdue')"));
assert.ok(sql.includes('i.customer_id = c.id'));

const svc = fs.readFileSync(path.join(__dirname, '../services/IsolirService.js'), 'utf8');
assert.ok(svc.includes('activateCrmIfPaidUp'), 'restoreAfterPayment membersihkan isolir CRM setelah lunas');
assert.ok(svc.includes("isolirStatus === 'restoring'"), 'restoreAfterPayment juga menangani status restoring');

const isolirCtrl = fs.readFileSync(path.join(__dirname, '../controllers/IsolirController.js'), 'utf8');
assert.ok(isolirCtrl.includes('reconcilePaidIsolated'), 'daftar terisolir merapikan pelanggan yang sudah lunas');
assert.ok(isolirCtrl.includes('outstandingInvoiceSql'), 'Attention isolir hanya yang masih punya tagihan');

const bill = fs.readFileSync(path.join(__dirname, '../controllers/BillingController.js'), 'utf8');
assert.ok(bill.includes('restoreAfterPayment'), 'tandai lunas / verifikasi bukti merestore isolir');
assert.ok(bill.includes("status: 'active', due_date: nextDue"), 'markPaid mengaktifkan status pelanggan');

const dash = fs.readFileSync(path.join(__dirname, '../controllers/DashboardController.js'), 'utf8');
assert.ok(dash.includes('reconcilePaidIsolated'), 'panel Attention merapikan isolir yang sudah lunas');

const helper = fs.readFileSync(path.join(__dirname, '../utils/isolirCrm.js'), 'utf8');
assert.ok(helper.includes("isolir_status = 'active'"));
assert.ok(helper.includes("status = IF(status = 'isolated', 'active', status)"));

console.log('isolirCrm.test.js OK');
