'use strict';
const assert = require('assert');
const {
  shouldApiPollDevice,
  binaryApiMinPollMs,
  isBinaryProtocol,
  startBinaryKeepalive,
  stopBinaryKeepalive,
  BINARY_MIN_POLL_MS
} = require('../utils/mikrotikApiSession');

assert.strictEqual(isBinaryProtocol('api-plain'), true);
assert.strictEqual(isBinaryProtocol('rest-http'), false);

assert.strictEqual(shouldApiPollDevice({ api_username: 'skynet', monitoring_type: 'api' }), true);
assert.strictEqual(shouldApiPollDevice({ api_username: 'skynet', monitoring_type: 'both' }), true);
assert.strictEqual(shouldApiPollDevice({ api_username: 'skynet', monitoring_type: 'snmp' }), false);
assert.strictEqual(shouldApiPollDevice({ api_username: null, monitoring_type: 'api' }), false);
assert.strictEqual(shouldApiPollDevice({ api_username: 'skynet' }), false, 'default snmp = jangan poll API');

assert.strictEqual(binaryApiMinPollMs(5), BINARY_MIN_POLL_MS);
assert.strictEqual(binaryApiMinPollMs(15), 15000);
assert.strictEqual(binaryApiMinPollMs(60), 60000);
assert.ok(binaryApiMinPollMs(null) >= BINARY_MIN_POLL_MS);

const fake = { _apiClient: { _connected: true, run() { return Promise.resolve([]); } } };
let ticks = 0;
startBinaryKeepalive(fake, () => { ticks += 1; });
assert.ok(fake._keepTimer);
startBinaryKeepalive(fake, () => { ticks += 1; }); // idempotent
stopBinaryKeepalive(fake);
assert.strictEqual(fake._keepTimer, null);

console.log('mikrotikApiSession.test.js OK');
