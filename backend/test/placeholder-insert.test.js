'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(
  path.join(__dirname, '../../frontend/public/js/placeholder-insert.js'),
  'utf8'
);
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const { sanitizeName, token } = sandbox.window.PlaceholderInsert;

assert.strictEqual(sanitizeName('  odp-blok 1 '), 'odp_blok_1');
assert.strictEqual(sanitizeName('{paket}'), 'paket');
assert.strictEqual(token('nama'), '{nama}');
assert.strictEqual(token(''), '');
assert.strictEqual(token(' {cid} '), '{cid}');

console.log('placeholder-insert.test.js OK');
