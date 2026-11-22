'use strict';
/**
 * Akses role Admin NOC ke data pelanggan: boleh daftar/lihat/ubah,
 * tidak boleh hapus, dan modul finance tetap tertutup.
 * Jalankan: node backend/test/nocCustomerAccess.test.js
 */
const assert = require('assert');
const { ROLE_GRANTS, grantsForRole, roleHasGrant } = require('../middleware/roleGrants');
const {
  isFinanceAreaUser,
  isCustomerAreaUser,
  allowFinanceArea,
  allowCustomerArea,
} = require('../middleware/financeAccess');
const { apiBlockNocArea, isNocRole } = require('../middleware/nocAccess');

function mockReq(role) {
  return { user: { role: { name: role } } };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    redirectTo: null,
    rendered: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    render(view, locals) { this.rendered = { view, locals }; return this; },
    redirect(url) { this.redirectTo = url; return this; },
  };
  return res;
}

assert.deepStrictEqual(
  grantsForRole('noc'),
  ['customer_view', 'customer_create', 'customer_update']
);
assert.ok(roleHasGrant('noc', 'customer_create'));
assert.ok(roleHasGrant('NOC', 'customer_view'));
assert.ok(roleHasGrant('noc', 'customer_update'));
assert.ok(!roleHasGrant('noc', 'customer_delete'));
assert.ok(!ROLE_GRANTS.noc.includes('customer_delete'));
assert.ok(roleHasGrant('finance', 'customer_delete'));

const nocReq = mockReq('noc');
assert.strictEqual(isNocRole(nocReq), true);
assert.strictEqual(isFinanceAreaUser(nocReq), false, 'NOC bukan finance-area');
assert.strictEqual(isCustomerAreaUser(nocReq), true, 'NOC boleh halaman pelanggan');
assert.strictEqual(isCustomerAreaUser(mockReq('finance')), true);
assert.strictEqual(isCustomerAreaUser(mockReq('technician')), false);

let nextCalled = false;
allowCustomerArea(nocReq, mockRes(), () => { nextCalled = true; });
assert.ok(nextCalled, 'allowCustomerArea harus lolos untuk NOC');

nextCalled = false;
const financeRes = mockRes();
allowFinanceArea(nocReq, financeRes, () => { nextCalled = true; });
assert.ok(!nextCalled, 'allowFinanceArea harus menolak NOC');
assert.strictEqual(financeRes.statusCode, 403);

const blockRes = mockRes();
nextCalled = false;
apiBlockNocArea(nocReq, blockRes, () => { nextCalled = true; });
assert.ok(!nextCalled);
assert.strictEqual(blockRes.statusCode, 403);
assert.ok(String(blockRes.body && blockRes.body.message).includes('NOC'));

nextCalled = false;
apiBlockNocArea(mockReq('admin'), mockRes(), () => { nextCalled = true; });
assert.ok(nextCalled, 'admin tidak diblok apiBlockNocArea');

const express = require('express');
const http = require('http');

function fakeHasPermission(...permissions) {
  return (req, res, next) => {
    const granted = grantsForRole(req.user?.role?.name);
    if (permissions.some(p => granted.includes(p))) return next();
    return res.status(403).json({ success: false, message: 'Insufficient permissions' });
  };
}

function buildApp() {
  const app = express();
  app.use((req, res, next) => {
    req.user = { role: { name: req.headers['x-role'] || 'noc' } };
    next();
  });
  for (const p of ['/billing', '/payments']) {
    app.use(p, apiBlockNocArea);
  }
  app.use('/packages', (req, res, next) => {
    if (req.method === 'GET') return next();
    return apiBlockNocArea(req, res, next);
  });
  app.get('/customers', (req, res) => res.json({ ok: true, route: 'list' }));
  app.post('/customers', fakeHasPermission('customer_create'), (req, res) => res.json({ ok: true, route: 'create' }));
  app.delete('/customers/:id', fakeHasPermission('customer_delete'), (req, res) => res.json({ ok: true, route: 'delete' }));
  app.get('/packages', (req, res) => res.json({ ok: true, route: 'packages' }));
  app.post('/packages', (req, res) => res.json({ ok: true, route: 'pkg-create' }));
  app.get('/billing/invoices', (req, res) => res.json({ ok: true, route: 'billing' }));
  return app;
}

function request(server, { method, path, role }) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'x-role': role || 'noc' },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        let body = null;
        try { body = JSON.parse(raw); } catch (_) { body = raw; }
        resolve({ status: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const server = http.createServer(buildApp());
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const list = await request(server, { method: 'GET', path: '/customers' });
    assert.strictEqual(list.status, 200, 'NOC GET /customers');
    const create = await request(server, { method: 'POST', path: '/customers' });
    assert.strictEqual(create.status, 200, 'NOC POST /customers');
    const del = await request(server, { method: 'DELETE', path: '/customers/1' });
    assert.strictEqual(del.status, 403, 'NOC DELETE /customers diblok');
    const pkgs = await request(server, { method: 'GET', path: '/packages' });
    assert.strictEqual(pkgs.status, 200, 'NOC GET /packages');
    const pkgWrite = await request(server, { method: 'POST', path: '/packages' });
    assert.strictEqual(pkgWrite.status, 403, 'NOC POST /packages diblok');
    const billing = await request(server, { method: 'GET', path: '/billing/invoices' });
    assert.strictEqual(billing.status, 403, 'NOC billing tetap diblok');
  } finally {
    server.close();
  }
  console.log('nocCustomerAccess.test.js: OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
