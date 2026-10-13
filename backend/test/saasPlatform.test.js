'use strict';
const assert = require('assert');

process.env.SAAS_BASE_PATH = '/platform';
const { basePath, withBase, slugify } = require('../../saas/lib/helpers');

assert.strictEqual(basePath(), '/platform');
assert.strictEqual(withBase('/login'), '/platform/login');
assert.strictEqual(withBase('/'), '/platform/');
assert.strictEqual(slugify('ISP Baru Jaya'), 'isp-baru-jaya');

process.env.SAAS_BASE_PATH = '/';
const h = require('../../saas/lib/helpers');
assert.strictEqual(h.basePath(), '');
assert.strictEqual(h.withBase('/login'), '/login');

console.log('saasPlatform.test.js ok');
