'use strict';

const assert = require('assert');
const { DEFAULT_WINBOX_PORT, parseWinboxPort, winboxUrl } = require('../utils/winboxPort');

assert.strictEqual(DEFAULT_WINBOX_PORT, 8291);
assert.strictEqual(parseWinboxPort(undefined), 8291);
assert.strictEqual(parseWinboxPort(null), 8291);
assert.strictEqual(parseWinboxPort(''), 8291);
assert.strictEqual(parseWinboxPort('abc'), 8291);
assert.strictEqual(parseWinboxPort(0), 8291);
assert.strictEqual(parseWinboxPort(70000), 8291);
assert.strictEqual(parseWinboxPort('9991'), 9991);
assert.strictEqual(parseWinboxPort(8291), 8291);
assert.strictEqual(winboxUrl('192.168.22.1', 9991), 'winbox://192.168.22.1:9991');
assert.strictEqual(winboxUrl('192.168.22.1'), 'winbox://192.168.22.1:8291');
assert.strictEqual(winboxUrl(''), '');

console.log('winbox-port.test.js OK');
