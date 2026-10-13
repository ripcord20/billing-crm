'use strict';
const assert = require('assert');
const {
  CORE1_HUB,
  ifaceByName,
  findTunnelAddress,
  addressOnHub,
  hasUdpInputAccept,
  planHubEnsure,
  nextTunnelIp,
  collectUsedHosts,
  isCore1TunnelHost
} = require('../utils/core1RemoteWg');

const hub = { ...CORE1_HUB };

assert.strictEqual(ifaceByName([{ name: 'wg0' }, { name: 'wg-core2' }], 'wg-core2').name, 'wg-core2');
assert.strictEqual(ifaceByName([{ name: 'wg0' }], 'wg-core2'), null);

const orphan = { '.id': '*22BB6', address: '10.202.0.1/24', interface: '*C6' };
assert.strictEqual(findTunnelAddress([orphan], '10.202.0.1').interface, '*C6');
assert.strictEqual(addressOnHub(orphan, 'wg-core2'), false);
assert.strictEqual(addressOnHub({ address: '10.202.0.1/24', interface: 'wg-core2' }, 'wg-core2'), true);

assert.strictEqual(hasUdpInputAccept([
  { chain: 'input', action: 'accept', protocol: 'udp', 'dst-port': '51823', comment: 'CORE2-MANDAR' }
], 51823), true);
assert.strictEqual(hasUdpInputAccept([
  { chain: 'input', action: 'accept', protocol: 'udp', 'dst-port': '51823', disabled: 'true' }
], 51823), false);
assert.strictEqual(hasUdpInputAccept([], 51823), false);

const missing = planHubEnsure({
  ifaces: [{ name: 'wg0' }],
  addrs: [orphan],
  filters: [{ chain: 'input', action: 'accept', protocol: 'udp', 'dst-port': '51823' }],
  hub
});
assert.strictEqual(missing.createIface, true);
assert.strictEqual(missing.createAddress, false);
assert.strictEqual(missing.moveAddress, true);
assert.strictEqual(missing.addressId, '*22BB6');
assert.strictEqual(missing.addFirewall, false);

const ready = planHubEnsure({
  ifaces: [{ name: 'wg-core2' }],
  addrs: [{ '.id': '*1', address: '10.202.0.1/24', interface: 'wg-core2' }],
  filters: [{ chain: 'input', action: 'accept', protocol: 'udp', 'dst-port': '51823' }],
  hub
});
assert.deepStrictEqual(ready, {
  createIface: false,
  createAddress: false,
  moveAddress: false,
  addressId: '*1',
  addFirewall: false
});

const used = collectUsedHosts({
  nasRows: [{ nasname: '10.202.0.2' }],
  devices: [{ ip_address: '10.202.0.3' }],
  peers: [{ 'allowed-address': '10.202.0.4/32' }]
});
assert.strictEqual(nextTunnelIp(used), '10.202.0.5');
assert.strictEqual(isCore1TunnelHost('10.202.0.5'), true);
assert.strictEqual(isCore1TunnelHost('10.202.0.1'), false);
assert.strictEqual(isCore1TunnelHost('10.10.0.2'), false);

console.log('core1RemoteWg.test.js ok');
