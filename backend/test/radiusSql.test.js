'use strict';

/**
 * Unit test RadiusSqlService helpers + PppoeAccount field extraction.
 * Jalankan: node backend/test/radiusSql.test.js
 */
const assert = require('assert');
const { describeMysqlError, isIpv4, rateLimitFromPackage } = require('../utils/radiusMysql');
const { extractPppoeFields, stripPppoeFields } = require('../services/PppoeAccountService');

assert.strictEqual(isIpv4('10.10.10.1'), true);
assert.strictEqual(isIpv4('pool-pppoe'), false);
assert.strictEqual(isIpv4(''), false);

const denied = describeMysqlError({ code: 'ER_ACCESS_DENIED_ERROR', message: 'x' }, { mysql_host: '127.0.0.1', mysql_port: 3306 });
assert.ok(/ditolak/.test(denied));
const refused = describeMysqlError({ code: 'ECONNREFUSED' }, { mysql_host: '192.168.1.9' });
assert.ok(/menolak koneksi/.test(refused));

const fields = extractPppoeFields({
  create_pppoe: true,
  pppoe_username: 'budi',
  radius_password: 'secret1',
  pppoe_profile: '20Mbps',
  mikrotik_id: '4',
  pppoe_backend: 'auto'
});
assert.strictEqual(fields.create, true);
assert.strictEqual(fields.username, 'budi');
assert.strictEqual(fields.password, 'secret1');
assert.strictEqual(fields.profile, '20Mbps');
assert.strictEqual(fields.deviceId, 4);
assert.strictEqual(fields.backend, 'auto');

const fromMobile = extractPppoeFields({
  pppoe_username: 'andi',
  pppoe_password: 'pass2',
  pppoe_profile: '10Mbps',
  router_id: 8
});
assert.strictEqual(fromMobile.create, true);
assert.strictEqual(fromMobile.password, 'pass2');
assert.strictEqual(fromMobile.deviceId, 8);

const stripped = stripPppoeFields({
  name: 'Budi',
  radius_password: 'x',
  create_pppoe: true,
  pppoe_profile: '20Mbps',
  phone: '0812',
  device_id: 9
});
assert.strictEqual(stripped.name, 'Budi');
assert.strictEqual(stripped.phone, '0812');
assert.strictEqual(stripped.radius_password, undefined);
assert.strictEqual(stripped.create_pppoe, undefined);
assert.strictEqual(stripped.device_id, undefined);

assert.strictEqual(rateLimitFromPackage({ speed_down: 20, speed_up: 10 }), '10M/20M');
assert.strictEqual(rateLimitFromPackage({ speed_down: 30, speed_up: 0 }), '30M/30M');
assert.strictEqual(rateLimitFromPackage(null), null);

const { encryptSecret, decryptSecret } = require('../utils/secretBox');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-radius';
const enc = encryptSecret('mysql-pass');
assert.ok(enc.startsWith('enc:v1:'));
assert.strictEqual(decryptSecret(enc), 'mysql-pass');
assert.strictEqual(decryptSecret('plain'), 'plain');

console.log('✓ RADIUS SQL / PPPoE field tests PASS');
