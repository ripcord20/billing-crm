'use strict';
const assert = require('assert');
const {
  DEFAULT_PPP_POOL, DEFAULT_PPP_LOCAL, ACTIVE_POOL_NAME, EXPIRED_POOL_NAME,
  EXPIRED_POOL, EXPIRED_GW, buildNasRouterOsScript
} = require('../utils/nasRouterOsScript');

assert.strictEqual(ACTIVE_POOL_NAME, 'BILLINGRADIUS');
assert.strictEqual(DEFAULT_PPP_POOL, '10.2.64.2-10.2.79.254');
assert.strictEqual(DEFAULT_PPP_LOCAL, '10.2.64.1');
assert.strictEqual(EXPIRED_POOL_NAME, 'EXPIRED_BILLINGRADIUS');
assert.strictEqual(EXPIRED_POOL, '10.200.200.2-10.200.201.254');
assert.strictEqual(EXPIRED_GW, '10.200.200.1');

const script = buildNasRouterOsScript({
  shortname: 'CORE1',
  nasname: '192.168.91.1',
  secret: 'x',
  radiusHost: '192.168.22.9',
  pppPool: DEFAULT_PPP_POOL,
  pppLocal: DEFAULT_PPP_LOCAL,
  now: new Date('2026-10-20T00:00:00Z')
});
assert.ok(script.v7.indexOf('10.2.64.2-10.2.79.254') !== -1);
assert.ok(script.v7.indexOf('10.2.64.1') !== -1);
assert.ok(script.v7.indexOf('BILLINGRADIUS') !== -1);
assert.ok(script.v7.indexOf('EXPIRED_BILLINGRADIUS') !== -1);
assert.ok(script.v7.indexOf('10.200.200.2-10.200.201.254') !== -1);
assert.ok(script.v7.indexOf('10.20.0.2') === -1);
assert.ok(script.v7.indexOf(`name=${EXPIRED_POOL_NAME}`) !== -1 || script.v7.indexOf(`name="${EXPIRED_POOL_NAME}"`) !== -1);
assert.ok(/\/ip pool add name=FIBERIX ranges=/.test(script.v7) === false);
assert.ok(/\/ip pool add name=EXPIRED_FIBERIX/.test(script.v7) === false);

console.log('nasPoolBillingRadius.test.js OK');
