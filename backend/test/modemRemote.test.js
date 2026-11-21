'use strict';
/**
 * Remote GUI modem — IP privat saja, URL http lewat overlay WG.
 * Jalankan: node backend/test/modemRemote.test.js
 */
const assert = require('assert');
const Modem = require('../services/ModemRemoteService');

assert.strictEqual(Modem.isAllowedModemIp('10.20.0.9'), true);
assert.strictEqual(Modem.isAllowedModemIp('10.20.0.9/32'), true);
assert.strictEqual(Modem.isAllowedModemIp('192.168.1.1'), true);
assert.strictEqual(Modem.isAllowedModemIp('172.16.4.8'), true);
assert.strictEqual(Modem.isAllowedModemIp('100.64.0.10'), true);
assert.strictEqual(Modem.isAllowedModemIp('8.8.8.8'), false, 'tolak IP publik (SSRF)');
assert.strictEqual(Modem.isAllowedModemIp('127.0.0.1'), false);
assert.strictEqual(Modem.isAllowedModemIp('169.254.1.1'), false);
assert.strictEqual(Modem.isAllowedModemIp('0.0.0.0'), false);
assert.strictEqual(Modem.isAllowedModemIp('not-an-ip'), false);
assert.strictEqual(Modem.isAllowedModemIp(''), false);

assert.strictEqual(Modem.buildModemRemoteUrl({ ip: '10.20.0.9' }), 'http://10.20.0.9');
assert.strictEqual(Modem.buildModemRemoteUrl({ ip: '10.20.0.9', port: 80 }), 'http://10.20.0.9');
assert.strictEqual(Modem.buildModemRemoteUrl({ ip: '10.20.0.9', port: 8080 }), 'http://10.20.0.9:8080');
assert.strictEqual(Modem.buildModemRemoteUrl({ ip: '10.20.0.9', scheme: 'https', port: 443 }), 'https://10.20.0.9');
assert.strictEqual(Modem.buildModemRemoteUrl({ ip: '8.8.8.8' }), null);
assert.strictEqual(Modem.sanitizePort('99999'), 80);
assert.strictEqual(Modem.sanitizeScheme('HTTPS'), 'https');
assert.strictEqual(Modem.sanitizeScheme('ftp'), 'http');

{
  const p = Modem.pickRemoteIp({ staticIp: '10.1.1.1', liveIp: '10.20.0.9', connectionType: 'pppoe' });
  assert.strictEqual(p.ip, '10.20.0.9');
  assert.strictEqual(p.source, 'session');
}
{
  const p = Modem.pickRemoteIp({ staticIp: '10.1.1.1', liveIp: null, connectionType: 'pppoe' });
  assert.strictEqual(p.ip, '10.1.1.1');
  assert.strictEqual(p.source, 'static');
}
{
  const p = Modem.pickRemoteIp({ staticIp: '10.1.1.1', liveIp: '10.20.0.9', connectionType: 'static' });
  assert.strictEqual(p.ip, '10.1.1.1', 'tipe static pakai IP tersimpan');
}
{
  const p = Modem.pickRemoteIp({ staticIp: '1.2.3.4', liveIp: null, connectionType: 'static' });
  assert.strictEqual(p.ip, null, 'IP publik tidak dipakai');
}

assert.strictEqual(Modem.extractSessionIp({ address: '10.20.0.15/32' }), '10.20.0.15');
assert.strictEqual(Modem.extractSessionIp({ address: '8.8.4.4' }), null);

(async () => {
  const deps = {
    listRouterIds: async () => [2, 5],
    getMikrotikInstanceByDevice: async (id) => {
      if (id === 2) {
        return {
          getPPPoESessions: async () => [{ name: 'Anisa1', address: '10.20.1.42' }]
        };
      }
      return { getPPPoESessions: async () => [] };
    }
  };

  const r = await Modem.resolveModemRemote(
    { pppoe_username: 'anisa1', connection_type: 'pppoe', static_ip: null },
    null,
    {},
    deps
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.url, 'http://10.20.1.42');
  assert.strictEqual(r.wg_required, true);
  assert.ok(r.hint);

  const miss = await Modem.resolveModemRemote(
    { pppoe_username: 'offline-user', connection_type: 'pppoe' },
    null,
    {},
    {
      listRouterIds: async () => [1],
      getMikrotikInstanceByDevice: async () => ({
        getPPPoESessions: async () => []
      })
    }
  );
  assert.strictEqual(miss.ok, false);

  const pub = await Modem.resolveModemRemote(
    { static_ip: '1.1.1.1', connection_type: 'static' },
    null,
    {},
    { listRouterIds: async () => [], getMikrotikInstanceByDevice: async () => ({ getPPPoESessions: async () => [] }) }
  );
  assert.strictEqual(pub.ok, false);

  const hs = await Modem.resolveModemRemote(
    { pppoe_username: 'voucher1', connection_type: 'hotspot' },
    null,
    { port: 8080 },
    {
      listRouterIds: async () => [1],
      getMikrotikInstanceByDevice: async () => ({
        getPPPoESessions: async () => [],
        getHotspotActive: async () => [{ user: 'voucher1', address: '10.10.0.55' }]
      })
    }
  );
  assert.strictEqual(hs.ok, true);
  assert.strictEqual(hs.url, 'http://10.10.0.55:8080');
  assert.strictEqual(hs.source, 'hotspot');

  console.log('modemRemote.test.js ok');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
