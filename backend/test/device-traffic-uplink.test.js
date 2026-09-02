'use strict';

const assert = require('assert');
const {
  isCustomerTunnelIface,
  isIspClientIface,
  pickTrafficIfaces,
  scopeDeviceTraffic,
  parseRouteGatewayIface,
  pickActiveDefaultRouteIface,
  aggregateDeviceTraffic,
  keepMonitorIface,
  vlanParentIface
} = require('../utils/deviceMetrics');

assert.strictEqual(isIspClientIface('pppoe-out1'), true);
assert.strictEqual(isIspClientIface('l2tp-out1'), true);
assert.strictEqual(isCustomerTunnelIface('pppoe-out1'), false);
assert.strictEqual(isCustomerTunnelIface('<pppoe-andi>'), true);
assert.strictEqual(isCustomerTunnelIface('pppoe-andi'), true);

const lan = { name: 'ether2', type: 'ether', running: true, rxMbps: 40, txMbps: 480 };
const wan = { name: 'sfp-sfpplus1', type: 'sfp-sfpplus', running: true, rxMbps: 500, txMbps: 45 };
const wan2 = { name: 'sfp-sfpplus2', type: 'sfp-sfpplus', running: true, rxMbps: 490, txMbps: 40 };
const pppoeWan = { name: 'pppoe-out1', type: 'pppoe-out', running: true, rxMbps: 300, txMbps: 20 };

const pinned = pickTrafficIfaces([lan, wan], 'ether2');
assert.deepStrictEqual(pinned.map((i) => i.name), ['ether2']);

const auto = pickTrafficIfaces([lan, wan, wan2], null);
assert.strictEqual(auto.length, 1, 'never sum multiple SFP/ether');
assert.strictEqual(auto[0].name, 'sfp-sfpplus1');

const viaPppoe = pickTrafficIfaces([lan, pppoeWan], null);
assert.strictEqual(viaPppoe.length, 1);
assert.strictEqual(viaPppoe[0].name, 'pppoe-out1');

const agg = aggregateDeviceTraffic([lan, wan]);
assert.strictEqual(agg.trafficIfaces.length, 1);
assert.ok(Math.abs(agg.totalRxMbps - agg.totalTxMbps) > 100, 'uplink totals must stay asymmetric');

const scoped = scopeDeviceTraffic(
  [lan, wan],
  [
    { name: 'ether2', rxBitsPerSecond: 40e6, txBitsPerSecond: 480e6 },
    { name: 'sfp-sfpplus1', rxBitsPerSecond: 500e6, txBitsPerSecond: 45e6 }
  ],
  'sfp-sfpplus1'
);
assert.strictEqual(scoped.trafficIfaces[0], 'sfp-sfpplus1');
assert.strictEqual(scoped.interfaces.find((i) => i.name === 'sfp-sfpplus1').include_in_total, true);
assert.strictEqual(scoped.interfaces.find((i) => i.name === 'ether2').include_in_total, false);
assert.ok(scoped.totalRxMbps > scoped.totalTxMbps);

assert.strictEqual(parseRouteGatewayIface({ 'immediate-gw': '10.1.1.1%sfp-sfpplus1' }), 'sfp-sfpplus1');
assert.strictEqual(parseRouteGatewayIface({ gateway: 'pppoe-out1' }), 'pppoe-out1');
assert.strictEqual(pickActiveDefaultRouteIface([
  { 'dst-address': '0.0.0.0/0', active: 'false', gateway: 'ether2', distance: 1 },
  { 'dst-address': '0.0.0.0/0', active: 'true', 'immediate-gw': '8.8.8.8%pppoe-out1', distance: 2 }
]), 'pppoe-out1');

const coreLan = { name: 'sfp+2', type: 'sfp-sfpplus', running: true, rxMbps: 33, txMbps: 500 };
const coreWanPhy = { name: 'sfp+1', type: 'sfp-sfpplus', running: true, rxMbps: 495, txMbps: 32 };
const coreVlan = { name: 'vlan420', type: 'vlan', running: true, rxMbps: 490, txMbps: 28 };
const coreSumRx = coreLan.rxMbps + coreWanPhy.rxMbps;
const coreSumTx = coreLan.txMbps + coreWanPhy.txMbps;
assert.ok(Math.abs(coreSumRx - coreSumTx) < 10, 'sanity: summing both SFPs looks symmetric');
const coreAuto = pickTrafficIfaces([coreLan, coreWanPhy], null);
assert.strictEqual(coreAuto.length, 1);
assert.strictEqual(coreAuto[0].name, 'sfp+1');
assert.ok(Math.abs(coreAuto[0].rxMbps - coreAuto[0].txMbps) > 100);

const corePinned = pickTrafficIfaces([coreLan, coreWanPhy, coreVlan], 'vlan420');
assert.strictEqual(corePinned[0].name, 'vlan420');
assert.strictEqual(keepMonitorIface(coreVlan, 'vlan420'), true);
assert.strictEqual(keepMonitorIface(coreVlan, null), false);
assert.strictEqual(keepMonitorIface(coreWanPhy, 'vlan420'), true);
assert.strictEqual(vlanParentIface([{ name: 'vlan420', interface: 'sfp+1' }], 'vlan420'), 'sfp+1');

console.log('device-traffic-uplink.test.js OK');
