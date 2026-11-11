'use strict';
const assert = require('assert');
const { mergeWhere, sqlAndTenant, runWith, getTenantId } = require('../middleware/tenantContext');
const { encryptSecret, decryptSecret } = require('../utils/secretBox');

function rateLimitFromPackage(pkg) {
  if (!pkg) return null;
  const down = parseInt(pkg.speed_down, 10) || 0;
  const up = parseInt(pkg.speed_up, 10) || 0;
  if (!down && !up) return null;
  const rx = (up || down) + 'M';
  const tx = (down || up) + 'M';
  return rx + '/' + tx;
}

// 1) mergeWhere tanpa konteks tenant tidak mengubah query
assert.deepStrictEqual(mergeWhere({ status: 'active' }), { status: 'active' });

// 2) dengan tenant, tenant_id disisipkan
runWith({ tenantId: 7, bypass: false }, () => {
  assert.strictEqual(getTenantId(), 7);
  assert.deepStrictEqual(mergeWhere({ status: 'active' }), { status: 'active', tenant_id: 7 });
  const f = sqlAndTenant('customers.tenant_id');
  assert.ok(f.sql.includes('customers.tenant_id'));
  assert.deepStrictEqual(f.replacements, [7]);
});

// 3) bypass superadmin: getTenantId null
runWith({ tenantId: null, bypass: true }, () => {
  assert.strictEqual(getTenantId(), null);
  assert.deepStrictEqual(mergeWhere({ id: 1 }), { id: 1 });
});

// 4) secret box roundtrip (pakai JWT_SECRET fallback)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-min-8';
const enc = encryptSecret('radpass');
assert.ok(enc.startsWith('enc:v1:') || enc === 'radpass');
assert.strictEqual(decryptSecret(enc), 'radpass');

// 5) rate-limit MikroTik dari paket
assert.strictEqual(rateLimitFromPackage({ speed_up: 5, speed_down: 20 }), '5M/20M');
assert.strictEqual(rateLimitFromPackage(null), null);

const { describeMysqlError, FREERADIUS_TABLES, localRadiusPassword } = require('../utils/radiusMysql');
assert.ok(describeMysqlError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 192.168.22.9:3306' }, { mysql_host: '192.168.22.9', mysql_port: 3306 }).includes('3306'));
assert.ok(describeMysqlError({ code: 'ER_ACCESS_DENIED_ERROR', message: 'denied' }, { mysql_host: '127.0.0.1' }).includes('password'));
assert.ok(FREERADIUS_TABLES.length >= 5);
assert.ok(FREERADIUS_TABLES.every((s) => /CREATE TABLE IF NOT EXISTS/i.test(s)));
assert.ok(localRadiusPassword().length >= 8);

const { buildSqlGuide, BILLING_LAN, FREERADIUS_HOST } = require('../utils/freeradiusSqlGuide');
const guide = buildSqlGuide({
  password: 'p"ass\\word',
  nasnameHint: '192.168.61.2',
  nasSecretSet: true
});
assert.strictEqual(guide.billing_lan, BILLING_LAN);
assert.strictEqual(guide.daemon_host, FREERADIUS_HOST);
assert.ok(guide.sql_snippet.includes(`server = "${BILLING_LAN}"`));
assert.ok(guide.sql_snippet.includes('read_clients = yes'));
assert.ok(guide.sql_snippet.includes('password = "p\\"ass\\\\word"'));
assert.ok(guide.daloradius_php.includes(`CONFIG_DB_HOST'] = '${BILLING_LAN}'`));
assert.ok(guide.mysql_test.includes(BILLING_LAN));
assert.ok(guide.ufw_cmd.includes('192.168.22.9'));
assert.ok(guide.ufw_cmd.includes('3306'));
assert.ok(!guide.ufw_cmd.includes('Anywhere'));
assert.ok(guide.mikrotik.includes(FREERADIUS_HOST));
assert.ok(guide.mikrotik.includes('192.168.61.2'));

const { buildNasRouterOsScript, radiusAllowedIps, EXPIRED_NET } = require('../utils/nasRouterOsScript');
const ros = buildNasRouterOsScript({
  nasId: 3,
  nasname: '192.168.61.2',
  shortname: 'GANANET',
  secret: 'sec"ret',
  radiusHost: '192.168.22.9',
  tunnelAddress: '10.10.0.2/32',
  vpnType: 'wireguard',
  vpsHost: 'vpn.example.com',
  wireguard: {
    privateKey: 'PRIV',
    serverPublicKey: 'PUB',
    presharedKey: '',
    tunnelAddress: '10.10.0.2/32',
    endpointHost: 'vpn.example.com',
    endpointPort: 51820,
    allowedIps: '10.10.0.1/32,192.168.22.9/32',
    keepalive: 25
  }
});
assert.ok(ros.v7.includes('/radius/add'));
assert.ok(ros.v7.includes('address=192.168.22.9'));
assert.ok(ros.v7.includes('secret="sec\\"ret"'));
assert.ok(ros.v7.includes('comment="FIBERIX"'));
assert.ok(!/comment~"BILLINGRADIUS"/.test(ros.v7));
assert.ok(ros.v7.includes('Tidak menghapus object BILLINGRADIUS'));
assert.ok(ros.v7.includes('EXPIRED_FIBERIX'));
assert.ok(ros.v7.includes(EXPIRED_NET));
assert.ok(ros.v7.includes('wg-fiberix'));
assert.ok(ros.v6.includes('/radius add'));
assert.strictEqual(ros.recommended_api_host, '10.10.0.2');
assert.strictEqual(ros.port_forward_example.applied, false);
assert.ok(ros.port_forward_example.nft_example.includes('10.10.0.2:8728'));
assert.ok(ros.port_forward_example.rules[0].public.startsWith('vpn.example.com:'));
assert.ok(radiusAllowedIps('10.10.0.1', '192.168.22.9').includes('192.168.22.9/32'));

console.log('radius-tenant.test.js OK');
