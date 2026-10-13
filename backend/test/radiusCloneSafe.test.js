'use strict';
const assert = require('assert');
const { assertCloneSafeTarget } = require('../utils/radiusMysql');

const prev = process.env.CLONE_SAFE;
delete process.env.CLONE_SAFE;
assert.doesNotThrow(() => assertCloneSafeTarget({ mysql_host: '192.168.22.99' }));

process.env.CLONE_SAFE = '1';
assert.doesNotThrow(() => assertCloneSafeTarget({ mysql_host: '127.0.0.1' }));
assert.doesNotThrow(() => assertCloneSafeTarget({ mysql_host: '192.168.22.22' }));
assert.throws(
  () => assertCloneSafeTarget({ mysql_host: '192.168.22.99' }),
  (e) => e && e.code === 'ER_CLONE_SAFE'
);

if (prev === undefined) delete process.env.CLONE_SAFE;
else process.env.CLONE_SAFE = prev;
console.log('radiusCloneSafe.test.js ok');
