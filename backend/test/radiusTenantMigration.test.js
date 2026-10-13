'use strict';
const assert = require('assert');
const {
  pickExistingRadiusServer,
  duplicateServerIds,
  shouldSkipLocalMysqlRewrite
} = require('../utils/radiusServerPick');

const rows = [
  { id: 1, host: '192.168.22.9', mysql_host: '192.168.22.9', mysql_database: 'radius' },
  { id: 2, host: '127.0.0.1', mysql_host: '127.0.0.1', mysql_database: 'radius' }
];
assert.strictEqual(pickExistingRadiusServer(rows, '192.168.22.9').id, 1);
assert.strictEqual(pickExistingRadiusServer([], '192.168.22.9'), null);

assert.deepStrictEqual(
  duplicateServerIds([
    { id: 1, host: 'a', mysql_host: 'h', mysql_database: 'radius' },
    { id: 2, host: 'a', mysql_host: 'h', mysql_database: 'radius' },
    { id: 3, host: 'b', mysql_host: 'h', mysql_database: 'radius' }
  ]),
  [2]
);

assert.strictEqual(shouldSkipLocalMysqlRewrite({ host: '192.168.22.9', mysql_host: '127.0.0.1' }), true);
assert.strictEqual(shouldSkipLocalMysqlRewrite({ host: '10.0.0.1', mysql_host: '192.168.22.9' }), true);
assert.strictEqual(shouldSkipLocalMysqlRewrite({ host: '10.0.0.1', mysql_host: '127.0.0.1' }), false);

console.log('radiusTenantMigration.test.js ok');
