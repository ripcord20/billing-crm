'use strict';
const assert = require('assert');
const { fiberixRadiusMysqlHost, effectiveMysqlHost } = require('../utils/radiusMysql');

assert.strictEqual(fiberixRadiusMysqlHost({}), '');
assert.strictEqual(fiberixRadiusMysqlHost({ FIBERIX_FULL_RADIUS: '1' }), '192.168.22.9');
assert.strictEqual(fiberixRadiusMysqlHost({
  FIBERIX_FULL_RADIUS: '1',
  RADIUS_MYSQL_HOST: '192.168.22.9'
}), '192.168.22.9');

assert.strictEqual(
  effectiveMysqlHost({ mysql_host: '127.0.0.1' }, { FIBERIX_FULL_RADIUS: '1' }),
  '192.168.22.9',
  'opsi 1: jangan tulis radcheck ke localhost'
);
assert.strictEqual(
  effectiveMysqlHost({ mysql_host: '10.0.0.5' }, {}),
  '10.0.0.5'
);

console.log('radiusMysqlPin.test.js ok');
