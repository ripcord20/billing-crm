'use strict';
const assert = require('assert');
const { classifyMikrotikApiGroup } = require('../utils/mikrotikApiUser');

const full = classifyMikrotikApiGroup('full');
assert.strictEqual(full.level, 'write');
assert.strictEqual(full.ok, true);
assert.strictEqual(full.warn, false);

const write = classifyMikrotikApiGroup('write');
assert.strictEqual(write.level, 'write');
assert.strictEqual(write.ok, true);

const read = classifyMikrotikApiGroup('read');
assert.strictEqual(read.level, 'read');
assert.strictEqual(read.ok, false);
assert.strictEqual(read.warn, true);
assert.ok(/group full/.test(read.message));

const custom = classifyMikrotikApiGroup('fiberix-api');
assert.strictEqual(custom.level, 'custom');
assert.strictEqual(custom.warn, true);
assert.ok(/write/.test(custom.message));

const empty = classifyMikrotikApiGroup('');
assert.strictEqual(empty.level, 'unknown');
assert.strictEqual(empty.message, null);

const spaced = classifyMikrotikApiGroup(' Full ');
assert.strictEqual(spaced.level, 'write');

console.log('mikrotikApiUser.test.js OK');
