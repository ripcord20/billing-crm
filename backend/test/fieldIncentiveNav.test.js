'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sidebar = fs.readFileSync(path.join(__dirname, '../../frontend/views/partials/sidebar.ejs'), 'utf8');
assert.ok(sidebar.includes('href="/insentif"'), 'sidebar harus punya link /insentif');
assert.ok(sidebar.includes('Insentif Lapangan'), 'label Insentif Lapangan harus tampil');

const page = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/insentif.ejs'), 'utf8');
assert.ok(page.includes('/api/insentif/summary'));
assert.ok(page.includes('Fee tagihan'));
assert.ok(page.includes('Oli mesin'));
assert.ok(page.includes('Ambil router'));
assert.ok(page.includes('Tipe router'));
assert.ok(page.includes('id="addRouterSn"'));
assert.ok(page.includes('id="addRouterMac"'));
assert.ok(page.includes("role-b noc"));

const svc = fs.readFileSync(path.join(__dirname, '../../backend/services/FieldIncentiveService.js'), 'utf8');
assert.ok(svc.includes('isFieldRole'));
assert.ok(svc.includes('router_sn'));

const web = fs.readFileSync(path.join(__dirname, '../../backend/routes/web.js'), 'utf8');
assert.ok(web.includes("router.get('/insentif'"));

const api = fs.readFileSync(path.join(__dirname, '../../backend/routes/api.js'), 'utf8');
assert.ok(api.includes("router.use('/insentif'"));

const field = fs.readFileSync(path.join(__dirname, '../../backend/controllers/CollectorFieldController.js'), 'utf8');
assert.ok(field.includes('accrueFromPayment'));

const wo = fs.readFileSync(path.join(__dirname, '../../backend/controllers/WorkOrderController.js'), 'utf8');
assert.ok(wo.includes("type === 'dismantle'"));
assert.ok(wo.includes('accrueRouter'));

console.log('fieldIncentiveNav.test.js ok');
