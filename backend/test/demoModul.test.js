'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { homePathForRole } = require('../utils/tenantScope');

assert.strictEqual(homePathForRole('demo'), '/modul');
assert.strictEqual(homePathForRole('superadmin'), '/dashboard');

const root = path.join(__dirname, '../..');
const web = fs.readFileSync(path.join(root, 'backend/routes/web.js'), 'utf8');
assert.match(web, /router\.get\('\/modul'/);

const page = fs.readFileSync(path.join(root, 'frontend/views/pages/modul.ejs'), 'utf8');
assert.match(page, /Modul Billing/);
assert.match(page, /Daftar Pelanggan/);
assert.match(page, /NAS/);
assert.match(page, /Isolir/);
assert.match(page, /Versi penuh/);

const login = fs.readFileSync(path.join(root, 'frontend/views/pages/login.ejs'), 'utf8');
assert.match(login, /id="demoSharedFill"/);
assert.match(login, /id="demoQuickStart"/);

const sidebar = fs.readFileSync(path.join(root, 'frontend/views/partials/sidebar.ejs'), 'utf8');
assert.match(sidebar, /href="\/modul"/);

const demoCtl = fs.readFileSync(path.join(root, 'backend/controllers/DemoController.js'), 'utf8');
assert.match(demoCtl, /redirect: '\/modul'/);

console.log('demoModul.test.js OK');
