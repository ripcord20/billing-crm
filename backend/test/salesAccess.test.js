'use strict';
const assert = require('assert');
const { allowSalesArea, apiAllowSalesArea } = require('../middleware/salesAccess');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    redirected: null,
    rendered: null
  };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.redirect = (u) => { res.redirected = u; return res; };
  res.render = (view, data) => { res.rendered = { view, data }; return res; };
  return res;
}

function run(mw, req) {
  const res = mockRes();
  let nextCalled = false;
  mw(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

const nocWithSales = {
  user: { role: { name: 'noc' } },
  userPermissions: ['module.noc', 'module.sales'],
  path: '/sales'
};
const nocWithoutSales = {
  user: { role: { name: 'noc' } },
  userPermissions: ['module.noc'],
  path: '/sales'
};
const salesUser = {
  user: { role: { name: 'sales' } },
  userPermissions: [],
  path: '/sales'
};
const financeUser = {
  user: { role: { name: 'finance' } },
  userPermissions: ['module.finance'],
  path: '/sales'
};

let r = run(allowSalesArea, nocWithSales);
assert.strictEqual(r.nextCalled, true, 'NOC with module.sales may open /sales');

r = run(allowSalesArea, nocWithoutSales);
assert.strictEqual(r.nextCalled, false);
assert.strictEqual(r.res.redirected, '/noc');

r = run(allowSalesArea, salesUser);
assert.strictEqual(r.nextCalled, true);

r = run(allowSalesArea, financeUser);
assert.strictEqual(r.nextCalled, false);
assert.strictEqual(r.res.redirected, '/finance');

r = run(apiAllowSalesArea, { ...nocWithSales, path: '/sales/stats' });
assert.strictEqual(r.nextCalled, true, 'NOC with module.sales may hit /api/sales/*');

r = run(apiAllowSalesArea, { ...nocWithoutSales, path: '/sales/stats' });
assert.strictEqual(r.nextCalled, false);
assert.strictEqual(r.res.statusCode, 403);

r = run(apiAllowSalesArea, { ...salesUser, path: '/sales/stats' });
assert.strictEqual(r.nextCalled, true);

r = run(apiAllowSalesArea, { user: null, path: '/sales/stats' });
assert.strictEqual(r.res.statusCode, 401);

console.log('salesAccess.test.js OK');
