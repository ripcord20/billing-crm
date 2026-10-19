'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(
  path.join(__dirname, '../../frontend/public/css/app.css'),
  'utf8'
);

const mobile = css.split('Mobile dashboard: KPI biru')[1] || '';
assert.ok(mobile, 'blok CSS KPI HP tidak ditemukan');

assert.match(mobile, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
assert.match(mobile, /overflow-x:\s*hidden/);
assert.match(mobile, /scroll-snap-type:\s*none/);
assert.doesNotMatch(mobile, /scroll-snap-type:\s*x/);
assert.doesNotMatch(mobile, /flex:\s*0\s+0\s+min\(86vw/);
assert.doesNotMatch(mobile, /overflow-x:\s*auto/);

console.log('dashboardKpiMobile.test.js ok');
