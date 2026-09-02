'use strict';
const assert = require('assert');
const {
  classifyNasLink,
  handshakeAgeSec,
  formatAgeLabel,
  probeTargetForNas
} = require('../utils/nasLinkStatus');

const now = 1_800_000_000_000; // fake now for age? handshakeAge uses Date.now
// handshakeAgeSec is relative to Date.now — test with explicit nowMs
assert.strictEqual(handshakeAgeSec(0), null);
assert.strictEqual(handshakeAgeSec(100, 100000), 0);
assert.strictEqual(handshakeAgeSec(50, 100000), 50);

assert.strictEqual(formatAgeLabel(12), '12 dtk lalu');
assert.strictEqual(formatAgeLabel(120), '2 mnt lalu');
assert.strictEqual(formatAgeLabel(7200), '2 jam lalu');

const hsNow = Math.floor(Date.now() / 1000) - 20;
const upHs = classifyNasLink({
  connMode: 'vpn',
  wgConfigured: true,
  handshakeUnix: hsNow
});
assert.strictEqual(upHs.state, 'up');
assert.strictEqual(upHs.reason, 'handshake');
assert.strictEqual(upHs.label, 'Terhubung');

const pending = classifyNasLink({ connMode: 'vpn', wgConfigured: false, deviceStatus: 'online' });
assert.strictEqual(pending.state, 'pending');
assert.strictEqual(pending.label, 'Belum generate');

const vpnDeviceOnly = classifyNasLink({
  connMode: 'vpn',
  wgConfigured: true,
  deviceStatus: 'online'
});
assert.strictEqual(vpnDeviceOnly.state, 'down', 'VPN jangan hijau hanya karena Device Management online');
assert.strictEqual(vpnDeviceOnly.label, 'Belum terhubung');
assert.ok(/handshake/i.test(vpnDeviceOnly.age_label));

const vpnPing = classifyNasLink({
  connMode: 'vpn',
  wgConfigured: true,
  deviceStatus: 'online',
  reachable: true
});
assert.strictEqual(vpnPing.state, 'up');
assert.strictEqual(vpnPing.reason, 'ping');

const deviceUp = classifyNasLink({
  connMode: 'public',
  deviceStatus: 'online'
});
assert.strictEqual(deviceUp.state, 'up');
assert.strictEqual(deviceUp.reason, 'device');

const pingUp = classifyNasLink({
  connMode: 'public',
  reachable: true
});
assert.strictEqual(pingUp.state, 'up');
assert.strictEqual(pingUp.reason, 'ping');

const down = classifyNasLink({ connMode: 'public' });
assert.strictEqual(down.state, 'down');
assert.strictEqual(down.label, 'Belum terhubung');

const stale = classifyNasLink({
  connMode: 'vpn',
  wgConfigured: true,
  handshakeUnix: Math.floor(Date.now() / 1000) - 900
});
assert.strictEqual(stale.state, 'down');

assert.strictEqual(probeTargetForNas({ conn_mode: 'vpn', tunnel_address: '10.10.0.2/32', nasname: '1.2.3.4' }), '10.10.0.2');
assert.strictEqual(probeTargetForNas({ conn_mode: 'public', nasname: '192.168.62.2' }), '192.168.62.2');

console.log('nasLinkStatus.test.js OK');
