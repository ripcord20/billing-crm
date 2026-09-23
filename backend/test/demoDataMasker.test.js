'use strict';
const assert = require('assert');
const { maskDeep } = require('../middleware/demoDataMasker');

const when = new Date('2026-09-19T05:30:45.000Z');
const masked = maskDeep({
  title: 'Bandwidth mendekati batas',
  last_seen_at: when,
  createdAt: when,
  interface_name: 'sfp+1'
});

assert.strictEqual(masked.last_seen_at, '2026-09-19T05:30:45.000Z');
assert.strictEqual(masked.createdAt, '2026-09-19T05:30:45.000Z');
assert.strictEqual(masked.title, 'Bandwidth mendekati batas');
assert.ok(typeof masked.interface_name === 'string');
assert.strictEqual(typeof masked.last_seen_at, 'string');

const rawDate = maskDeep(when);
assert.strictEqual(rawDate, '2026-09-19T05:30:45.000Z');

console.log('demoDataMasker.test.js OK');
