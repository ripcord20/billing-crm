'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const sidebar = fs.readFileSync(
  path.join(__dirname, '../../frontend/views/partials/sidebar.ejs'),
  'utf8'
);

assert.match(sidebar, /data-nav-group="overview"/);
assert.match(sidebar, /<span>Overview<\/span>/);
assert.doesNotMatch(
  sidebar,
  /nav-section-title">OVERVIEW[\s\S]*href="\/dashboard" class="nav-item/
);

const tenant = sidebar.indexOf('<% } else if (isTenantOwner) { %>');
const adminElse = sidebar.indexOf('<% } else { %>', tenant);
const admin = sidebar.slice(adminElse, sidebar.indexOf('<% } %>\n\n  </nav>', adminElse));

assert.match(admin, /data-nav-group="overview"/);
assert.match(admin, /data-nav-group="monitoring"/);
assert.match(admin, /data-nav-group="ticketing"/);
assert.match(admin, /data-nav-group="wa-gateway"/);
assert.match(admin, /data-nav-group="telegram"/);
assert.match(admin, /data-nav-group="email"/);
assert.match(admin, /data-nav-group="management"/);
assert.match(admin, /data-nav-group="sistem"/);
assert.doesNotMatch(admin, /nav-section-title/);

const overview = admin.split('data-nav-group="overview"')[1].split('data-nav-group="')[0];
assert.match(overview, /href="\/dashboard" class="nav-sub/);
assert.match(overview, /href="\/finance" class="nav-sub/);
assert.match(overview, /href="\/noc" class="nav-sub/);
assert.match(overview, /href="\/sales" class="nav-sub/);
assert.match(overview, /Financial Dashboard/);
assert.match(overview, /NOC Dashboard/);
assert.match(overview, /Sales Dashboard/);

assert.match(admin, /href="\/nms" class="nav-sub/);
assert.match(admin, /href="\/collect" class="nav-sub/);
assert.match(admin, /href="\/isolir"[\s\S]{0,80}?class="nav-sub/);
assert.match(admin, /href="\/tickets" class="nav-sub/);
assert.match(admin, /href="\/whatsapp" class="nav-sub/);
assert.match(admin, /href="\/telegram"[\s\S]{0,80}?class="nav-sub/);
assert.match(admin, /href="\/email-broadcast"[\s\S]{0,80}?class="nav-sub/);
assert.match(admin, /href="\/settings"[\s\S]{0,80}?class="nav-sub/);
assert.doesNotMatch(admin, /href="\/nms" class="nav-item/);
assert.doesNotMatch(admin, /href="\/collect" class="nav-item/);
assert.doesNotMatch(admin, /<span>Manajemen<\/span>/);

console.log('overviewNav.test.js ok');
