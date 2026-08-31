'use strict';
const assert = require('assert');

process.env.CONFIG_ENCRYPTION_KEY = process.env.CONFIG_ENCRYPTION_KEY || 'test-config-key-min-8-chars-long';
const wg = require('../services/WireguardService');

assert.strictEqual(wg.phoneAllowedIps('10.10.0.1', '192.168.22.9'), '10.10.0.1/32,192.168.22.9/32');
assert.strictEqual(wg.phoneAllowedIps('10.10.0.1', '10.10.0.1'), '10.10.0.1/32');

const a = wg.generateKeypair();
const b = wg.generateKeypair();
const clientCfg = wg.buildClientConfig({
  privateKey: a.privateKey,
  tunnelAddress: '10.10.0.8/32',
  dns: '',
  serverPublicKey: b.publicKey,
  presharedKey: wg.generatePresharedKey(),
  endpoint: 'vpn.fiberix.my.id:51820',
  allowedIps: '10.10.0.1/32,192.168.22.9/32',
  keepalive: 25
});

(async () => {
  const url = await wg.toQrDataUrl(clientCfg);
  assert.ok(url.startsWith('data:image/png;base64,'), 'QR harus PNG data URL');
  assert.ok(url.length > 200, 'QR tidak boleh kosong');
  await assert.rejects(() => wg.toQrDataUrl('   '), /kosong/);
  console.log('wireguardQr.test.js OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
