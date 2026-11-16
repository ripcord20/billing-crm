'use strict';
/**
 * Tes klasifikasi IP → provider/kategori/domain untuk Content Monitoring.
 * Jalankan: node backend/test/contentMonitoring.test.js
 */
const assert = require('assert');
const {
  classifyIp,
  summarize,
  aggregateByDomain,
  registrableDomain,
  PROVIDERS
} = require('../services/IpProviderClassifier');

assert.ok(PROVIDERS.length >= 5, 'daftar provider harus terisi');

const google = classifyIp('8.8.8.8');
assert.ok(google, '8.8.8.8 harus ketemu');
assert.ok(/google/i.test(google.name), '8.8.8.8 = Google, dapat: ' + google.name);

const meta = classifyIp('157.240.1.1');
assert.ok(meta && /meta|facebook/i.test(meta.name), 'blok Meta harus ketemu');

const unknown = classifyIp('203.0.113.9');
assert.strictEqual(unknown, null, 'IP dokumentasi tidak boleh terklasifikasi');

const summary = summarize([
  { dst: '8.8.8.8', bytes: 80, connections: 2 },
  { dst: '157.240.1.1', bytes: 20, connections: 1 },
  { dst: '203.0.113.9', bytes: 10, connections: 1 }
]);
assert.strictEqual(summary.totalBytes, 110);
assert.ok(summary.providers.some(p => /google/i.test(p.name)));
assert.ok(summary.categories.some(c => c.category !== 'Lainnya'));

assert.strictEqual(registrableDomain('r1---sn-x.googlevideo.com'), 'googlevideo.com');
assert.strictEqual(registrableDomain('www.tokopedia.com'), 'tokopedia.com');
assert.strictEqual(registrableDomain('foo.bar.co.id'), 'bar.co.id');
assert.strictEqual(registrableDomain('142.250.4.1'), '142.250.4.1');

const fromCache = aggregateByDomain(
  [
    { dst: '142.250.4.1', bytes: 50, connections: 3 },
    { dst: '1.2.3.4', bytes: 10, connections: 1 }
  ],
  [{ name: 'lga25s80-in-f1.1e100.net', address: '142.250.4.1' }]
);
assert.strictEqual(fromCache.domains.length, 1);
assert.strictEqual(fromCache.domains[0].domain, '1e100.net');
assert.strictEqual(fromCache.matchedBytes, 50);

const fromPtr = aggregateByDomain(
  [{ dst: '23.246.1.1', bytes: 40, connections: 2 }],
  [{ name: 'ipv4-c001-sin001-ix.1.nflxvideo.net', address: '23.246.1.1' }]
);
assert.ok(fromPtr.domains[0].domain.indexOf('nflxvideo') !== -1);

console.log('contentMonitoring.test.js OK');
