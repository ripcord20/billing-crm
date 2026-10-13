'use strict';
const assert = require('assert');
const { shouldSkipLocalMysqlRewrite } = require('../utils/radiusServerPick');

assert.strictEqual(shouldSkipLocalMysqlRewrite({
  host: '192.168.22.9',
  mysql_host: '192.168.22.9',
  mysql_password: '',
  last_error: 'ECONNREFUSED'
}), true, 'produksi 22.9 tidak boleh di-rewrite ke 127.0.0.1');

console.log('radiusLocalSkip.test.js ok');
