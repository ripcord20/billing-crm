'use strict';
const assert = require('assert');
const { normalizeConnMode, connModeLabel, isVpnConnMode } = require('../utils/nasConnMode');

assert.strictEqual(normalizeConnMode('lan'), 'lan');
assert.strictEqual(normalizeConnMode('VPN'), 'vpn');
assert.strictEqual(normalizeConnMode('ip publik'), 'public');
assert.strictEqual(normalizeConnMode('public'), 'public');
assert.strictEqual(normalizeConnMode(''), 'lan');
assert.strictEqual(normalizeConnMode('langsung'), 'lan');
assert.strictEqual(connModeLabel('vpn'), 'VPN');
assert.strictEqual(connModeLabel('public'), 'IP Publik');
assert.strictEqual(connModeLabel('lan'), 'LAN');
assert.strictEqual(isVpnConnMode('wireguard'), true);
assert.strictEqual(isVpnConnMode('lan'), false);
assert.strictEqual(isVpnConnMode('public'), false);

console.log('nasConnMode.test.js OK');
