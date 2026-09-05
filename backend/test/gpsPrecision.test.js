'use strict';

const assert = require('assert');
const {
  parseCoord,
  roundCoord,
  calculateDistance,
  blendFixes,
  evaluateFix
} = require('../utils/gpsPrecision');

assert.strictEqual(parseCoord(' -8.2181234 '), -8.2181234);
assert.strictEqual(parseCoord('x'), null);
assert.strictEqual(roundCoord(-8.218123456, 7), -8.2181235);

const d = calculateDistance(-8.2181, 114.3692, -8.2182, 114.3692);
assert.ok(d > 10 && d < 13, '≈11m north-south at this latitude, got ' + d);

const blended = blendFixes(
  { latitude: -8.2181000, longitude: 114.3692000, accuracy: 30 },
  -8.2181100, 114.3692100, 8
);
assert.ok(Math.abs(blended.latitude + 8.21811) < 0.00002);
assert.ok(blended.accuracy < 8);

const first = evaluateFix(null, -8.21, 114.36, 12);
assert.strictEqual(first.accept, true);
assert.strictEqual(first.distance, 0);

const noisy = evaluateFix(
  { latitude: -8.2181, longitude: 114.3692, accuracy: 8 },
  -8.2181, 114.3692, 120
);
assert.strictEqual(noisy.accept, false);
assert.strictEqual(noisy.reason, 'low_accuracy');

const jump = evaluateFix(
  { latitude: -8.2181, longitude: 114.3692, accuracy: 10 },
  -8.2300, 114.3800, 12
);
assert.strictEqual(jump.accept, false);
assert.strictEqual(jump.reason, 'gps_jump');

const walk = evaluateFix(
  { latitude: -8.2181, longitude: 114.3692, accuracy: 8 },
  -8.21815, 114.36925, 7
);
assert.strictEqual(walk.accept, true);
assert.ok(walk.distance > 5 && walk.distance < 20);

console.log('gpsPrecision.test.js OK');
