'use strict';
const assert = require('assert');
const {
  isPrivateHost,
  buildMitraMikrotikGuide
} = require('../utils/mitraMikrotikGuide');

assert.strictEqual(isPrivateHost('192.168.61.2'), true);
assert.strictEqual(isPrivateHost('10.10.0.1'), true);
assert.strictEqual(isPrivateHost(''), true);
assert.strictEqual(isPrivateHost('103.153.62.130'), false);
assert.strictEqual(isPrivateHost('vpn.fiberix.my.id'), false);

const lan = buildMitraMikrotikGuide({
  wg_endpoint_host: '192.168.61.2',
  wg_listen_port: '51820',
  wg_server_address: '10.10.0.1',
  wg_tunnel_subnet: '10.10.0.0/24',
  wg_server_public_key: 'abcPUBLIC=',
  wg_enabled: 'true'
});
assert.strictEqual(lan.show_radius_module, false);
assert.strictEqual(lan.use_tailscale, false);
assert.strictEqual(lan.use_zerotier, false);
assert.strictEqual(lan.use_mesh_saas, false);
assert.strictEqual(lan.ros6_method, 'l2tp');
assert.strictEqual(lan.ros7_method, 'wireguard');
assert.strictEqual(lan.endpoint_is_private, true);
assert.ok(lan.scripts.v7.includes('wireguard'));
assert.ok(lan.scripts.v7.includes('abcPUBLIC='));
assert.ok(lan.scripts.v7.includes('MY_PRIVATE_KEY'));
assert.ok(!lan.scripts.v6.includes('wireguard'));
assert.ok(lan.scripts.v6.includes('l2tp-client'));
assert.ok(lan.scripts.v6.includes('use-ipsec=yes'));
assert.ok(lan.scripts.v6.includes('connect-to=192.168.61.2'));
assert.ok(lan.verify_v6.some((c) => c.includes('l2tp-client')));
assert.ok(!lan.verify_v6.some((c) => c.includes('wireguard')));
assert.ok(lan.endpoint_warning.includes('klien/peer'));
assert.ok(lan.endpoint_warning.includes('bukan server VPN'));
assert.ok(!lan.endpoint_warning.includes('hanya tembus dari jaringan Fiberix'));

const pub = buildMitraMikrotikGuide({
  wg_endpoint_host: '103.153.62.130',
  vpn_server_host: 'vpn.fiberix.my.id',
  wg_server_public_key: 'xyz='
});
assert.strictEqual(pub.reachable_from_internet, true);
assert.strictEqual(pub.l2tp_reachable_from_internet, true);
assert.strictEqual(pub.endpoint_warning, null);
assert.ok(pub.scripts.v6.includes('connect-to=vpn.fiberix.my.id'));
assert.ok(pub.scripts.v7.includes('endpoint-address=103.153.62.130'));

const empty = buildMitraMikrotikGuide({});
assert.ok(empty.endpoint_warning.includes('belum mengisi'));

console.log('mitraMikrotikGuide.test.js OK');
