'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sidebar = fs.readFileSync(
  path.join(__dirname, '../../frontend/views/partials/sidebar.ejs'),
  'utf8'
);
const web = fs.readFileSync(
  path.join(__dirname, '../routes/web.js'),
  'utf8'
);

assert.doesNotMatch(sidebar, /href="\/tenants"/);
assert.doesNotMatch(sidebar, /Multi Tenant/);
assert.match(web, /router\.get\('\/tenants'[\s\S]*res\.redirect\('\/dashboard'\)/);
assert.doesNotMatch(web, /pages\/tenants/);

console.log('noMultiTenantBilling.test.js ok');
