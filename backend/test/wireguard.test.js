'use strict';
const assert = require('assert');

process.env.CONFIG_ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || 'test-config-key-min-8-chars-long';
const wg = require('../services/WireguardService');

// 1) generateKeypair menghasilkan kunci base64 32-byte yang valid & unik
const a = wg.generateKeypair();
const b = wg.generateKeypair();
assert.strictEqual(Buffer.from(a.privateKey, 'base64').length, 32, 'private key 32 byte');
assert.strictEqual(Buffer.from(a.publicKey, 'base64').length, 32, 'public key 32 byte');
assert.notStrictEqual(a.privateKey, b.privateKey, 'keypair harus acak/unik');
assert.notStrictEqual(a.publicKey, a.privateKey, 'pub != priv');

// 2) preshared key 32-byte base64
assert.strictEqual(Buffer.from(wg.generatePresharedKey(), 'base64').length, 32);

// 3) IPv4 helpers roundtrip + parse CIDR
assert.strictEqual(wg._intToIp(wg._ipToInt('10.10.0.42')), '10.10.0.42');
const cidr = wg._parseCidr('10.10.0.0/24');
assert.strictEqual(cidr.bits, 24);
// network .0, broadcast .255
assert.strictEqual(wg._intToIp(cidr.network), '10.10.0.0');
assert.strictEqual(wg._intToIp(cidr.broadcast), '10.10.0.255');
assert.throws(() => wg._parseCidr('10.10.0.0/40'), /CIDR tidak valid/);
assert.throws(() => wg._ipToInt('999.1.1.1'), /IPv4 tidak valid/);

// 4) buildClientConfig: klien memakai PUBLIC key server (bukan private-nya)
const clientCfg = wg.buildClientConfig({
  privateKey: a.privateKey,
  tunnelAddress: '10.10.0.5/32',
  dns: '',
  serverPublicKey: b.publicKey,
  presharedKey: 'PSK==',
  endpoint: 'vpn.example.com:51820',
  allowedIps: '10.10.0.1/32',
  keepalive: 25
});
assert.ok(clientCfg.includes('[Interface]'));
assert.ok(clientCfg.includes(`PrivateKey = ${a.privateKey}`), 'config klien pakai private key klien');
assert.ok(clientCfg.includes(`PublicKey = ${b.publicKey}`), 'peer = public key server');
assert.ok(clientCfg.includes('Endpoint = vpn.example.com:51820'));
assert.ok(clientCfg.includes('PersistentKeepalive = 25'));
assert.ok(!clientCfg.includes(b.privateKey), 'jangan bocorkan private key server');

// 5) buildServerPeerBlock: server menyimpan PUBLIC key klien
const peerBlock = wg.buildServerPeerBlock({
  publicKey: a.publicKey,
  presharedKey: 'PSK==',
  tunnelAddress: '10.10.0.5/32',
  shortname: 'cabang-A'
});
assert.ok(peerBlock.includes('[Peer]'));
assert.ok(peerBlock.includes(`PublicKey = ${a.publicKey}`), 'peer server = public key klien');
assert.ok(peerBlock.includes('AllowedIPs = 10.10.0.5/32'));
assert.ok(peerBlock.includes('# cabang-A'));

// 6) buildMikrotikCommands berisi perintah utama RouterOS
const mt = wg.buildMikrotikCommands({
  ifaceName: 'wg-billing',
  privateKey: a.privateKey,
  tunnelAddress: '10.10.0.5/32',
  serverPublicKey: b.publicKey,
  presharedKey: 'PSK==',
  endpointHost: 'vpn.example.com',
  endpointPort: '51820',
  allowedIps: '10.10.0.1/32',
  keepalive: 25
});
assert.ok(mt.includes('/interface/wireguard/add'));
assert.ok(mt.includes('/interface/wireguard/peers/add'));
assert.ok(mt.includes('endpoint-port=51820'));

console.log('wireguard.test.js OK');
