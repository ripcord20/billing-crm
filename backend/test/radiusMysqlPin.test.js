'use strict';
const assert = require('assert');
const {
  fiberixRadiusMysqlHost,
  effectiveMysqlHost,
  preferBillingMysqlAuth
} = require('../utils/radiusMysql');

assert.strictEqual(fiberixRadiusMysqlHost({}), '');
assert.strictEqual(fiberixRadiusMysqlHost({ FIBERIX_FULL_RADIUS: '1' }), '127.0.0.1');
assert.strictEqual(fiberixRadiusMysqlHost({
  FIBERIX_FULL_RADIUS: '1',
  RADIUS_MYSQL_HOST: '192.168.22.9'
}), '127.0.0.1');
assert.strictEqual(fiberixRadiusMysqlHost({
  FIBERIX_FULL_RADIUS: '1',
  RADIUS_MYSQL_HOST: '10.8.0.2'
}), '10.8.0.2');

assert.strictEqual(
  effectiveMysqlHost({ mysql_host: '192.168.22.9' }, { FIBERIX_FULL_RADIUS: '1' }),
  '127.0.0.1',
  'FreeRADIUS 22.9 membaca radcheck di billing, bukan MySQL lokal 22.9'
);
assert.strictEqual(
  effectiveMysqlHost({ mysql_host: '10.0.0.5' }, {}),
  '10.0.0.5'
);

assert.strictEqual(preferBillingMysqlAuth({ FIBERIX_FULL_RADIUS: '1' }, '127.0.0.1'), true);
assert.strictEqual(preferBillingMysqlAuth({
  FIBERIX_FULL_RADIUS: '1',
  RADIUS_MYSQL_PASSWORD: 'x'
}, '127.0.0.1'), false);
assert.strictEqual(preferBillingMysqlAuth({ FIBERIX_FULL_RADIUS: '1' }, '192.168.22.9'), false);

const eco = require('../../ecosystem.config.js');
assert.strictEqual(eco.apps[0].env_production.RADIUS_MYSQL_HOST, '127.0.0.1');
assert.strictEqual(eco.apps[0].env_production.RADIUS_HOST, '192.168.22.9');

console.log('radiusMysqlPin.test.js ok');
