'use strict';
/**
 * SNMP helper untuk switch CSS/SwOS vs RouterOS.
 * Jalankan: node backend/test/snmpDeviceMetrics.test.js
 */
const assert = require('assert');
const { SNMP_OIDS } = require('../config/constants');
const {
  isCssOrSwos,
  shouldSkipRouterOsApi,
  isRealRouterOsResource,
  formatUptimeTicks,
  firmwareFromDescr,
  collectSnmpResources,
} = require('../utils/snmpDeviceMetrics');

assert.strictEqual(isCssOrSwos({ model: 'CSS326-24G-2S+' }), true);
assert.strictEqual(isCssOrSwos({ firmware: 'SwOS 2.17' }), true);
assert.strictEqual(isCssOrSwos({ name: 'SWX BULUSAN', type: 'switch' }), true);
assert.strictEqual(isCssOrSwos({ name: 'SW-CORE' }, 'CSS326 SwOS v2.17'), true);
assert.strictEqual(isCssOrSwos({ model: 'CCR2004' }, 'RouterOS 7.15'), false);

assert.strictEqual(shouldSkipRouterOsApi({ type: 'switch', name: 'SWX BULUSAN' }), true);
assert.strictEqual(shouldSkipRouterOsApi({ type: 'switch', model: 'CRS326' }), true);
assert.strictEqual(shouldSkipRouterOsApi({ type: 'router', model: 'CCR2004' }), false);
assert.strictEqual(shouldSkipRouterOsApi({ type: 'router', model: 'CSS326-24G-2S+' }), true);

assert.strictEqual(isRealRouterOsResource(null), false);
assert.strictEqual(isRealRouterOsResource({}), false);
assert.strictEqual(isRealRouterOsResource({ cpuLoad: 0, uptime: '0s', totalMemory: 0 }), false);
assert.strictEqual(isRealRouterOsResource({ totalMemory: 134217728, cpuLoad: 3 }), true);
assert.strictEqual(isRealRouterOsResource({ version: '7.15', uptime: '1d2h', boardName: 'CCR2004' }), true);

assert.strictEqual(formatUptimeTicks(12300), '2m 3s');
assert.strictEqual(formatUptimeTicks(8640000), '1d 0h 0m');
assert.strictEqual(firmwareFromDescr('CSS326-24G-2S+ SwOS v2.17'), 'SwOS v2.17');
assert.strictEqual(firmwareFromDescr('RouterOS v7.15.3 (stable)'), 'RouterOS v7.15.3');

function fakeSession(getMap, opts = {}) {
  return {
    get(oids, cb) {
      if (opts.getErr) return cb(opts.getErr);
      const vbs = oids.map((oid) => {
        if (Object.prototype.hasOwnProperty.call(getMap, oid)) {
          return { oid, value: getMap[oid] };
        }
        return { oid, type: 128, value: null };
      });
      cb(null, vbs);
    },
    subtree(_oid, _max, _vbCb, done) { done(); },
    close() {}
  };
}

(async () => {
  const swosSys = {
    [SNMP_OIDS.SYSTEM_UPTIME]: 540000,
    [SNMP_OIDS.SYSTEM_NAME]: 'SWX-BULUSAN',
    [SNMP_OIDS.SYSTEM_DESCR]: 'CSS326-24G-2S+ SwOS v2.17',
  };

  const swos = await collectSnmpResources(
    { name: 'SWX BULUSAN', type: 'switch', model: 'CSS326-24G-2S+' },
    { session: fakeSession(swosSys) }
  );
  assert.strictEqual(swos.reachable, true, 'SwOS harus ONLINE dari sysUpTime saja');
  assert.strictEqual(swos.swos, true);
  assert.strictEqual(swos.sysName, 'SWX-BULUSAN');
  assert.ok(swos.uptime.includes('1h'), 'uptime dari ticks');
  assert.strictEqual(swos.cpuKnown, false, 'SwOS tidak punya CPU SNMP');
  assert.strictEqual(swos.memoryKnown, false, 'SwOS tidak punya RAM SNMP');

  const mixedFail = await collectSnmpResources(
    { name: 'SWX BULUSAN', type: 'switch', brand: 'MikroTik' },
    { session: fakeSession(swosSys) }
  );
  assert.strictEqual(mixedFail.reachable, true, 'GET system-only tidak gagal meski brand MikroTik');

  const down = await collectSnmpResources(
    { name: 'SWX BULUSAN', type: 'switch' },
    { session: fakeSession({}, { getErr: new Error('RequestTimedOut') }) }
  );
  assert.strictEqual(down.reachable, false);

  const ros = await collectSnmpResources(
    { name: 'CORE', type: 'router', model: 'CCR2004' },
    {
      session: fakeSession({
        [SNMP_OIDS.SYSTEM_UPTIME]: 100,
        [SNMP_OIDS.SYSTEM_NAME]: 'CORE',
        [SNMP_OIDS.SYSTEM_DESCR]: 'RouterOS 7.15',
        [SNMP_OIDS.MT_TOTAL_MEMORY]: 1024,
        [SNMP_OIDS.MT_USED_MEMORY]: 256,
      })
    }
  );
  assert.strictEqual(ros.reachable, true);
  assert.strictEqual(ros.swos, false);
  assert.strictEqual(ros.memoryKnown, true);
  assert.strictEqual(ros.memory, 25);

  console.log('snmpDeviceMetrics.test.js OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
