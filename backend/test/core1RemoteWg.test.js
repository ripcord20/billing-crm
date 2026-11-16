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
  mergePrefixes,
  planOfficeToVpsAllowed,
  isVpsHubPeer,
  buildVpsEnsureOfficeRemote,
  buildCore1RemoteClientScript
} = require('../utils/core1RemoteWg');

assert.deepStrictEqual(hostsFromText('10.201.0.2/32,10.201.0.1/32'), [2, 1]);
assert.deepStrictEqual(hostsFromText('nas 10.201.0.12 plus noise'), [12]);
assert.deepStrictEqual(hostsFromText('10.10.0.5'), []);
assert.deepStrictEqual(hostsFromText('10.202.0.7', '10.202.0.'), [7]);

const used = collectUsedHosts({
  nasRows: [{ nasname: '10.201.0.5', tunnel_address: '10.201.0.5/32' }],
  devices: [{ ip_address: '10.201.0.6' }],
  peers: [{ 'allowed-address': '10.201.0.7/32' }]
});
assert.ok(used.has(1), 'hub .1 reserved');
assert.ok(used.has(2), 'CORE 2 reserved');
assert.ok(used.has(19), 'CORE 1 peer reserved');
assert.ok(used.has(22), 'HP reserved');
assert.ok(used.has(5));
assert.ok(used.has(6));
assert.ok(used.has(7));
assert.strictEqual(nextTunnelIp(used), '10.201.0.3');
assert.strictEqual(nextTunnelIp(new Set()), '10.201.0.3');

const full = new Set();
for (let i = 0; i <= 255; i++) full.add(i);
assert.throws(() => nextTunnelIp(full), /penuh/);

const ifaces = [
  { name: 'wg-core2', 'public-key': 'old=' },
  { name: 'wg0', 'public-key': CORE1_HUB.fallbackPublicKey, 'listen-port': 51820 }
];
const hubIf = ifaceByName(ifaces, 'wg0');
assert.ok(hubIf);
assert.strictEqual(ifacePublicKey(hubIf), CORE1_HUB.fallbackPublicKey);

const peers = [
  { interface: 'wg0', 'public-key': 'peerA=', 'allowed-address': '10.201.0.2/32', comment: 'CORE2-MANDAR' }
];
assert.strictEqual(findExistingPeer(peers, { publicKey: 'peerA=' }).comment, 'CORE2-MANDAR');
assert.strictEqual(findExistingPeer(peers, { allowedHost: '10.201.0.2' }).comment, 'CORE2-MANDAR');
assert.strictEqual(findExistingPeer(peers, { publicKey: 'missing=' }), null);

assert.strictEqual(isCore1TunnelHost('10.201.0.2'), true);
assert.strictEqual(isCore1TunnelHost('10.201.0.3'), true);
assert.strictEqual(isCore1TunnelHost('10.201.0.1'), false);
assert.strictEqual(isCore1TunnelHost('10.202.0.3'), true);
assert.strictEqual(isCore1TunnelHost('10.10.0.2'), false);

const cfg = getHubConfig({ CORE1_WG_ENDPOINT: '1.2.3.4', CORE1_WG_PORT: '51999', CORE1_DEVICE_ID: '8' });
assert.strictEqual(cfg.endpointHost, '1.2.3.4');
assert.strictEqual(cfg.listenPort, 51999);
assert.strictEqual(cfg.deviceId, 8);

const script = buildCore1RemoteClientScript({
  name: 'CABANG "X"',
  privateKey: 'PRIVKEY==',
  serverPublicKey: CORE1_HUB.fallbackPublicKey,
  tunnelIp: '10.201.0.3',
  secret: 's3cret',
  pppPool: '10.20.0.2-10.20.0.254',
  pppLocal: '10.20.0.1'
});

assert.ok(script.includes('listen-port=0'), 'client listen 0');
assert.ok(script.includes('endpoint-port=51820'), 'hub UDP 51820');
assert.ok(script.includes('endpoint-address=103.169.206.24'));
assert.ok(script.includes('address=10.201.0.3/24'));
assert.ok(script.includes(`public-key="${CORE1_HUB.fallbackPublicKey}"`));
assert.ok(script.includes('private-key="PRIVKEY=="'));
assert.ok(script.includes('interface=wg-neva'));
assert.ok(script.includes('/radius add'));
assert.ok(script.includes('secret="s3cret"'));
assert.ok(script.includes('src-address=10.201.0.3'), 'RADIUS sumber IP tunnel');
assert.ok(script.includes('require-message-auth=no'));
assert.ok(script.includes('dst-address=192.168.22.9/32'), 'route RADIUS lewat wg-neva');
assert.ok(script.includes('dst-address=192.168.22.0/24'), 'route LAN Fiberix lewat wg-neva');
assert.ok(script.includes('Jangan matikan RADIUS urutan ke-2'));
assert.ok(script.includes('src-address=10.201.0.1'));
assert.ok(script.includes('src-address=192.168.22.99'));
assert.ok(script.includes('192.168.22.0/24'), 'allowed CORE 2 harus cover LAN Fiberix/RADIUS');
assert.ok(!script.includes('10.10.0.1'), 'bukan alamat Fiberix WG Ubuntu');
assert.ok(!script.includes('103.195.65.216'), 'bukan host CORE 1');
assert.ok(!script.includes('endpoint-port=51823'));
assert.ok(!/listen-port=51820/.test(script.split('\n').find((l) => l.includes('wireguard add')) || ''), 'client tidak listen 51820');
assert.ok(!script.includes('interface=wg-core2'));
assert.ok(!script.includes('name=wg-core2'));
assert.ok(script.includes('name=FIBERIX'));
assert.ok(script.includes('remote-address=FIBERIX'));
assert.ok(!/BILLINGRADIUS/i.test(script), 'script cabang tanpa BillingRadius');

assert.strictEqual(
  mergePrefixes('10.201.0.1/32,10.201.0.22/32', '10.201.0.0/24'),
  '10.201.0.1/32,10.201.0.22/32,10.201.0.0/24'
);
const skip = planOfficeToVpsAllowed('10.201.0.0/24,10.201.0.22/32', '10.201.0.0/24');
assert.strictEqual(skip.patch, false);
const need = planOfficeToVpsAllowed('10.201.0.1/32,10.201.0.22/32', '10.201.0.0/24');
assert.strictEqual(need.patch, true);
assert.ok(need.next.includes('10.201.0.0/24'));
assert.ok(isVpsHubPeer({
  'endpoint-address': '103.169.206.24',
  'public-key': 'other='
}));
assert.ok(isVpsHubPeer({
  'endpoint-address': '',
  'public-key': CORE1_HUB.fallbackPublicKey
}));
assert.ok(!isVpsHubPeer({ 'endpoint-address': '1.2.3.4', 'public-key': 'x=' }));

const vpsRemote = buildVpsEnsureOfficeRemote();
assert.ok(vpsRemote.includes(`wg set wg0 peer ${CORE1_HUB.officePublicKey} allowed-ips`));
assert.ok(vpsRemote.includes('192.168.22.0/24'));
assert.ok(vpsRemote.includes('ip -4 route replace 192.168.22.0/24 dev wg0'));
assert.ok(CORE1_HUB.clientAllowedAddress.includes('192.168.22.0/24'));
assert.ok(CORE1_HUB.vpsOfficeAllowedIps.includes('192.168.22.0/24'));

console.log('core1RemoteWg.test.js OK');
