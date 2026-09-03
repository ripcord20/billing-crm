'use strict';
const assert = require('assert');
const {
  CORE1_HUB,
  hostsFromText,
  collectUsedHosts,
  nextTunnelIp,
  ifaceByName,
  ifacePublicKey,
  findExistingPeer,
  isCore1TunnelHost,
  getHubConfig,
  buildCore1RemoteClientScript
} = require('../utils/core1RemoteWg');

assert.deepStrictEqual(hostsFromText('10.202.0.2/32,10.202.0.1/32'), [2, 1]);
assert.deepStrictEqual(hostsFromText('nas 10.202.0.12 plus noise'), [12]);
assert.deepStrictEqual(hostsFromText('10.10.0.5'), []);

const used = collectUsedHosts({
  nasRows: [{ nasname: '10.202.0.2', tunnel_address: '10.202.0.2/32' }],
  devices: [{ ip_address: '10.202.0.4' }],
  peers: [{ 'allowed-address': '10.202.0.5/32' }]
});
assert.ok(used.has(1), 'hub .1 reserved');
assert.ok(used.has(2));
assert.ok(used.has(4));
assert.ok(used.has(5));
assert.strictEqual(nextTunnelIp(used), '10.202.0.3');
assert.strictEqual(nextTunnelIp(new Set([1, 2, 3])), '10.202.0.4');

const full = new Set();
for (let i = 0; i <= 255; i++) full.add(i);
assert.throws(() => nextTunnelIp(full), /penuh/);

const ifaces = [
  { name: 'wg0', 'public-key': 'aaa=' },
  { name: 'wg-core2', 'public-key': CORE1_HUB.fallbackPublicKey, 'listen-port': 51823 }
];
const hubIf = ifaceByName(ifaces, 'wg-core2');
assert.ok(hubIf);
assert.strictEqual(ifacePublicKey(hubIf), CORE1_HUB.fallbackPublicKey);

const peers = [
  { interface: 'wg-core2', 'public-key': 'peerA=', 'allowed-address': '10.202.0.2/32', comment: 'CORE2-MANDAR' }
];
assert.strictEqual(findExistingPeer(peers, { publicKey: 'peerA=' }).comment, 'CORE2-MANDAR');
assert.strictEqual(findExistingPeer(peers, { allowedHost: '10.202.0.2' }).comment, 'CORE2-MANDAR');
assert.strictEqual(findExistingPeer(peers, { publicKey: 'missing=' }), null);

assert.strictEqual(isCore1TunnelHost('10.202.0.3'), true);
assert.strictEqual(isCore1TunnelHost('10.202.0.1'), false);
assert.strictEqual(isCore1TunnelHost('10.10.0.2'), false);

const cfg = getHubConfig({ CORE1_WG_ENDPOINT: '1.2.3.4', CORE1_WG_PORT: '51999', CORE1_DEVICE_ID: '8' });
assert.strictEqual(cfg.endpointHost, '1.2.3.4');
assert.strictEqual(cfg.listenPort, 51999);
assert.strictEqual(cfg.deviceId, 8);

const script = buildCore1RemoteClientScript({
  name: 'CABANG "X"',
  privateKey: 'PRIVKEY==',
  serverPublicKey: CORE1_HUB.fallbackPublicKey,
  tunnelIp: '10.202.0.3',
  secret: 's3cret',
  pppPool: '10.20.0.2-10.20.0.254',
  pppLocal: '10.20.0.1'
});

assert.ok(script.includes('listen-port=0'), 'client listen 0');
assert.ok(script.includes('endpoint-port=51823'), 'hub UDP 51823');
assert.ok(script.includes('endpoint-address=103.195.65.216'));
assert.ok(script.includes('address=10.202.0.3/24'));
assert.ok(script.includes(`public-key="${CORE1_HUB.fallbackPublicKey}"`));
assert.ok(script.includes('private-key="PRIVKEY=="'));
assert.ok(script.includes('allowed-address=10.202.0.1/32,192.168.22.99/32,192.168.22.9/32,192.168.91.1/32'));
assert.ok(script.includes('interface=wg-core1'));
assert.ok(script.includes('/radius add'));
assert.ok(script.includes('secret="s3cret"'));
assert.ok(script.includes('src-address=10.202.0.1'));
assert.ok(script.includes('src-address=192.168.22.99'));
assert.ok(!script.includes('10.10.0.1'), 'bukan alamat Fiberix WG');
assert.ok(!script.includes('endpoint-port=51820'), 'bukan port Fiberix WG');
assert.ok(!/listen-port=51820/.test(script), 'client tidak listen 51820');
assert.ok(!script.includes('TEMPLE_PUBLIC_KEY'));
assert.ok(!/interface wireguard add name=wg-fiberix/.test(script));
assert.ok(!script.includes('name=wg-fiberix'));
assert.ok(!script.includes('interface=wg-core2'));
assert.ok(!script.includes('name=wg-core2'));
assert.ok(script.includes('comment="CABANG  X"') || script.includes('CABANG'), 'nama cabang di comment');

console.log('core1RemoteWg.test.js OK');
