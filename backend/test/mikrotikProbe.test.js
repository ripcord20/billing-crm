'use strict';
const assert = require('assert');
const {
  parseMikrotikRtt,
  parseMikrotikPing,
  parseMikrotikDnsLookup,
  isNoisyLossSample
} = require('../utils/mikrotikProbe');

assert.strictEqual(parseMikrotikRtt('19ms474us'), 19.474);
assert.strictEqual(parseMikrotikRtt('20ms588us'), 20.588);
assert.strictEqual(parseMikrotikRtt('20ms'), 20);
assert.ok(Math.abs(parseMikrotikRtt('20588us') - 20.588) < 0.001);

const termLike = parseMikrotikPing([
  { host: '1.1.1.1', size: 56, ttl: 59, time: '19ms474us', status: 'reply' },
  { host: '1.1.1.1', size: 56, ttl: 59, time: '19ms570us', status: 'reply' },
  { sent: 8, received: 8, 'avg-rtt': '19ms968us' }
], 8);
assert.strictEqual(termLike.success, true);
assert.strictEqual(termLike.received, 8);
assert.strictEqual(termLike.loss, 0);
assert.ok(termLike.rtt_avg > 19 && termLike.rtt_avg < 21);

const oneDrop = parseMikrotikPing({ sent: 3, received: 2, 'avg-rtt': '20ms' }, 3);
assert.strictEqual(oneDrop.loss, 33.3);
assert.strictEqual(isNoisyLossSample(3, 2), true);
assert.strictEqual(isNoisyLossSample(8, 8), false);
assert.strictEqual(isNoisyLossSample(8, 6), false);

const dns = parseMikrotikDnsLookup([{ name: 'google.com', type: 'A', data: '142.250.4.101' }]);
assert.strictEqual(dns.ok, true);
assert.deepStrictEqual(dns.answers, ['142.250.4.101']);

console.log('mikrotikProbe.test.js OK');
