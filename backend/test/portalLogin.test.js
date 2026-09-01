'use strict';
const assert = require('assert');
const { portalLoginKeys } = require('../utils/portalLogin');

const keys = portalLoginKeys('  user.pppoe  ');
assert.strictEqual(keys.length, 3);
assert.deepStrictEqual(keys[0], { customer_id: 'user.pppoe' });
assert.deepStrictEqual(keys[1], { phone: 'user.pppoe' });
assert.deepStrictEqual(keys[2], { pppoe_username: 'user.pppoe' });
assert.strictEqual(portalLoginKeys('')[0].customer_id, '');

console.log('portalLogin.test.js OK');
