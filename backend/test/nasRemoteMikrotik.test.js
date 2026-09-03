'use strict';
const assert = require('assert');
const { stripCidr, looksLikeLanDevice } = require('../utils/nasRemoteDevice');
const { buildNasRouterOsScript } = require('../utils/nasRouterOsScript');

assert.strictEqual(stripCidr('10.10.0.5/32'), '10.10.0.5');
assert.strictEqual(looksLikeLanDevice({ ip_address: '192.168.61.2', notes: '' }, '10.10.0.2'), true);
assert.strictEqual(looksLikeLanDevice({ ip_address: '10.10.0.2', notes: '' }, '10.10.0.2'), false);
assert.strictEqual(looksLikeLanDevice({
  ip_address: '192.168.1.1',
  notes: 'Dibuat otomatis dari Modul NAS — IP tunnel WireGuard untuk API/Winbox.'
}, '10.10.0.2'), false);

const data = buildNasRouterOsScript({
  nasId: 9,
  nasname: '10.10.0.2',
  shortname: 'CABANG',
  secret: 's3cret',
  radiusHost: '192.168.22.9',
  isolirHost: '10.10.0.1',
  wgServerAddress: '10.10.0.1',
  tunnelAddress: '10.10.0.2/32',
  vpnType: 'wireguard',
  connMode: 'vpn',
  skipPortForward: false,
  serverHost: '103.195.65.216',
  wireguard: {
    privateKey: 'priv',
    serverPublicKey: 'pub',
    tunnelAddress: '10.10.0.2/32',
    endpointHost: '103.195.65.216',
    endpointPort: 51820,
    allowedIps: '10.10.0.1/32,192.168.22.9/32',
    keepalive: 25
  }
});

assert.strictEqual(data.recommended_api_host, '10.10.0.2');
assert.ok(data.v7.includes('wg-fiberix'), 'script WG');
assert.ok(data.v7.includes('endpoint-address=103.195.65.216'), 'endpoint publik');
assert.ok(data.v7.includes('src-address=10.10.0.1'), 'izinkan API dari Fiberix');
assert.ok(data.v7.includes('dst-port=80,443,8728,8729,8291'), 'port API/Winbox');
assert.ok(data.v7.includes('action-data=10.10.0.1:80') || data.v7.includes('10.10.0.1:80'), 'isolir via tunnel');
assert.ok(data.notes.some((n) => /IP tunnel/i.test(n)));

const lan = buildNasRouterOsScript({
  nasname: '192.168.61.2',
  shortname: 'GANANET',
  secret: 'x',
  radiusHost: '192.168.22.9',
  vpnType: 'public',
  connMode: 'public',
  skipPortForward: true
});
assert.ok(!lan.v7.includes('wg-fiberix'));
assert.ok(!lan.v7.includes('src-address=10.10.0.1'));

console.log('nasRemoteMikrotik.test.js OK');
