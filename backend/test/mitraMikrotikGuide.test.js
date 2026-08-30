'use strict';
const assert = require('assert');
const {
  isPrivateHost,
  buildMitraMikrotikGuide
} = require('../utils/mitraMikrotikGuide');

assert.strictEqual(isPrivateHost('192.168.61.2'), true);
assert.strictEqual(isPrivateHost('10.10.0.1'), true);
assert.strictEqual(isPrivateHost('172.16.1.1'), true);
assert.strictEqual(isPrivateHost('127.0.0.1'), true);
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
assert.strictEqual(lan.endpoint_is_private, true);
assert.strictEqual(lan.reachable_from_internet, false);
assert.strictEqual(lan.owner_action_needed, true);
assert.ok(lan.endpoint_warning && lan.endpoint_warning.includes('192.168.61.2:51820'));
assert.ok(lan.scripts.v7.includes('endpoint-address=192.168.61.2'));
assert.ok(lan.scripts.v7.includes('abcPUBLIC='));
assert.ok(lan.scripts.v7.includes('MY_PRIVATE_KEY'));
assert.ok(!lan.scripts.v7.includes('enc:v1:'));
assert.ok(lan.verify_commands.some((c) => c.includes('10.10.0.1')));

const pub = buildMitraMikrotikGuide({
  wg_endpoint_host: '103.153.62.130',
  wg_listen_port: 51820,
  wg_server_public_key: 'xyz='
});
assert.strictEqual(pub.reachable_from_internet, true);
assert.strictEqual(pub.owner_action_needed, false);
assert.strictEqual(pub.endpoint_warning, null);
assert.ok(pub.scripts.v6.includes('endpoint-address=103.153.62.130'));

const empty = buildMitraMikrotikGuide({});
assert.strictEqual(empty.endpoint_is_private, true);
assert.ok(empty.endpoint_warning.includes('belum diisi'));

console.log('mitraMikrotikGuide.test.js OK');
