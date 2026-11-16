'use strict';
const assert = require('assert');
const { normalizeRelay, displayRelay } = require('../lib/relayUrl');
const { DEFAULT_RELAY, DEFAULT_RELAY_HOST } = require('../lib/defaultRelay');

assert.strictEqual(DEFAULT_RELAY_HOST, '103.195.65.216:18789');
assert.strictEqual(DEFAULT_RELAY, 'ws://103.195.65.216:18789/ws');

assert.strictEqual(normalizeRelay('192.168.22.99:18789'), 'ws://192.168.22.99:18789/ws');
assert.strictEqual(normalizeRelay('http://10.0.0.5:18789/'), 'ws://10.0.0.5:18789/ws');
assert.strictEqual(normalizeRelay('wss://remote.example.com/ws'), 'wss://remote.example.com/ws');
assert.strictEqual(normalizeRelay(''), '');
assert.strictEqual(
  normalizeRelay('', { protocol: 'http:', host: '127.0.0.1:18789' }),
  'ws://127.0.0.1:18789/ws'
);
assert.strictEqual(
  normalizeRelay('', { protocol: 'file:', host: '' }),
  ''
);
assert.strictEqual(displayRelay('ws://192.168.22.99:18789/ws'), '192.168.22.99:18789');
console.log('relayUrl.test.js OK');
