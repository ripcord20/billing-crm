'use strict';
const assert = require('assert');
const d = require('../utils/isolirMikrotikDefaults');

assert.strictEqual(d.PPPOE_POOL_NAME, 'BILLINGRADIUS');
assert.strictEqual(d.PPPOE_POOL_RANGE, '10.2.64.2-10.2.79.254');
assert.strictEqual(d.ISOLIR_POOL_NAME, 'EXPIRED_BILLINGRADIUS');
assert.strictEqual(d.ISOLIR_POOL_RANGE, '10.200.200.2-10.200.201.254');
assert.strictEqual(d.ISOLIR_LOCAL_ADDR, '10.200.200.1');
assert.strictEqual(d.LIST_ISOLIR, 'EXPIRED');
assert.strictEqual(d.LIST_BYPASS, 'EXPIRED_PAGE');
assert.strictEqual(d.LIST_CIDR, '10.200.200.0/23');
assert.strictEqual(d.PROXY_PORT, 3128);
assert.ok(d.PAGE_PATH === '/p/isolir');
assert.ok(/\/p\/isolir/.test(d.PAGE_URL));
assert.ok(d.isPlaceholderIsolirRange('10.255.255.2-10.255.255.254'));
assert.ok(!d.isPlaceholderIsolirRange(d.ISOLIR_POOL_RANGE));

const IsolirPPPoE = require('../services/IsolirPPPoE');
assert.strictEqual(IsolirPPPoE.DEFAULT_ISOLIR_PROFILE, 'EXPIRED_BILLINGRADIUS');
assert.strictEqual(IsolirPPPoE.DEFAULT_ISOLIR_POOL, 'EXPIRED_BILLINGRADIUS');

const fs = require('fs');
const path = require('path');
const fwSrc = fs.readFileSync(path.join(__dirname, '../services/IsolirFirewallV2.js'), 'utf8');
assert.ok(fwSrc.includes("LIST_ISOLIR, LIST_BYPASS, PROXY_PORT"));
assert.ok(fwSrc.includes("dst-port=80,443"));
assert.ok(fwSrc.includes('placeBeforePppAccept'));
const wpSrc = fs.readFileSync(path.join(__dirname, '../services/IsolirWebProxy.js'), 'utf8');
assert.ok(wpSrc.includes('LIST_CIDR'));
assert.ok(!/const PROXY_PORT = 8080/.test(wpSrc));

const pub = fs.readFileSync(path.join(__dirname, '../routes/publicPages.js'), 'utf8');
assert.ok(pub.includes("router.get('/isolir'"));

console.log('isolirMikrotikDefaults.test.js OK');
