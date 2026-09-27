'use strict';
/**
 * Arah Download/Upload interface (sudut pelanggan).
 * Jalankan: node test/ifaceTrafficDir.test.js
 */
const assert = require('assert');
const {
  isCustomerTunnelIface,
  isUplinkFacing,
  isCustomerFacingIface,
  customerFacingStat,
} = require('../utils/ifaceTrafficDir');

assert.strictEqual(isCustomerTunnelIface('<pppoe-adelia>', 'pppoe-in'), true);
assert.strictEqual(isCustomerTunnelIface('pppoe-out1', 'pppoe-out'), false);
assert.strictEqual(isUplinkFacing('sfp-sfpplus1', 'sfp-sfpplus', 'UPLINK INET'), true);
assert.strictEqual(isUplinkFacing('vlan420', 'vlan', 'innercity'), true);
assert.strictEqual(isCustomerFacingIface('ether2', 'ether', 'CRS310'), true);
assert.strictEqual(isCustomerFacingIface('sfp-sfpplus2', 'sfp-sfpplus', 'DOWNLINK'), true);
assert.strictEqual(isCustomerFacingIface('sfp-sfpplus1', 'sfp-sfpplus', 'UPLINK INET'), false);
assert.strictEqual(isCustomerFacingIface('vlan420', 'vlan', 'innercity'), false);

const rawDown = {
  name: 'ether2',
  rxBitsPerSecond: 5_000_000,
  txBitsPerSecond: 139_000_000,
  rxPacketsPerSecond: 100,
  txPacketsPerSecond: 900,
};
const swapped = customerFacingStat(rawDown, 'ether', 'CRS310');
assert.strictEqual(swapped.rxBitsPerSecond, 139_000_000, 'ether2 download = TX router');
assert.strictEqual(swapped.txBitsPerSecond, 5_000_000, 'ether2 upload = RX router');

const wan = customerFacingStat({
  name: 'sfp-sfpplus1',
  rxBitsPerSecond: 800_000_000,
  txBitsPerSecond: 100_000_000,
}, 'sfp-sfpplus', 'UPLINK INET');
assert.strictEqual(wan.rxBitsPerSecond, 800_000_000, 'uplink tidak di-swap');
assert.strictEqual(wan.txBitsPerSecond, 100_000_000);

const sfp2 = customerFacingStat({
  name: 'sfp-sfpplus2',
  rxBitsPerSecond: 131_000_000,
  txBitsPerSecond: 729_000_000,
}, 'sfp-sfpplus', 'DOWNLINK');
assert.strictEqual(sfp2.rxBitsPerSecond, 729_000_000);
assert.strictEqual(sfp2.txBitsPerSecond, 131_000_000);

console.log('ifaceTrafficDir.test.js OK');
