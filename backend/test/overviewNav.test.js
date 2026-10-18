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

const overview = sidebar.split('data-nav-group="overview"')[1].split('data-nav-group="')[0];
assert.match(overview, /href="\/dashboard" class="nav-sub/);
assert.match(overview, /href="\/finance" class="nav-sub/);
assert.match(overview, /href="\/noc" class="nav-sub/);
assert.match(overview, /href="\/sales" class="nav-sub/);
assert.match(overview, /Financial Dashboard/);
assert.match(overview, /NOC Dashboard/);
assert.match(overview, /Sales Dashboard/);

console.log('overviewNav.test.js ok');
