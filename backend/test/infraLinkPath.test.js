'use strict';
const assert = require('assert');
const { resolvePath, parseCoordList, pathDistanceM, mergeLinkMetadata } = require('../utils/infraLinkPath');

const from = [-8.1667, 114.3852];
const to = [-8.1674, 114.3871];
const mid = [-8.1671, 114.3860];

const asIntermediates = resolvePath(from, to, [mid], null, null);
assert.strictEqual(asIntermediates.path.length, 3);
assert.deepStrictEqual(asIntermediates.waypoints, [mid]);
assert.deepStrictEqual(asIntermediates.metadata.coordinates[0], from);
assert.deepStrictEqual(asIntermediates.metadata.geojson.coordinates[0], [114.3852, -8.1667]);
assert.ok(asIntermediates.distance_m > 0);

const fullStored = resolvePath(from, to, [from, mid, to], null, null);
assert.deepStrictEqual(fullStored.path, [from, mid, to]);
assert.deepStrictEqual(fullStored.waypoints, [mid]);

const fromMeta = resolvePath(from, to, null, { coordinates: [from, mid, to] }, null);
assert.deepStrictEqual(fromMeta.path, [from, mid, to]);

const geojson = resolvePath(from, to, null, {
  geojson: { type: 'LineString', coordinates: [[114.3852, -8.1667], [114.3860, -8.1671], [114.3871, -8.1674]] }
}, null);
assert.deepStrictEqual(geojson.path[1], mid);

const lngLatList = parseCoordList([[114.3852, -8.1667], [114.3860, -8.1671]]);
assert.deepStrictEqual(lngLatList[0], from);

assert.ok(pathDistanceM([from, to]) > 100);

const merged = mergeLinkMetadata({ auto_from_customer: true }, { notes: 'x' }, {
  coordinates: [from, to],
  geojson: { type: 'LineString', coordinates: [[114.3852, -8.1667], [114.3871, -8.1674]] }
});
assert.strictEqual(merged.auto_from_customer, true);
assert.deepStrictEqual(merged.coordinates[0], from);

console.log('infraLinkPath.test.js ok');
