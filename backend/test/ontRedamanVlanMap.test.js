'use strict';
/**
 * Tes VLAN bind helpers, klasifikasi redaman ONT, dan routing kabel.
 * Jalankan: node backend/test/ontRedamanVlanMap.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vlan = require('../services/GenieacsVlan');
const redaman = require('../services/OntRedaman');
const router = require('../services/RoadRouter');

assert.strictEqual(vlan.isVlanIdKey('X_ZTE-COM_VLANID'), true);
assert.strictEqual(vlan.isVlanIdKey('VLANIDMark'), true);
assert.strictEqual(vlan.isVlanIdKey('VLANEnable'), false);
assert.strictEqual(vlan.isVlanIdKey('VLANPriority'), false);

const zteDevice = {
  _id: 'C0B101-F670L-ZTEGC1234567',
  InternetGatewayDevice: {
    DeviceInfo: {
      Manufacturer: { _value: 'ZTE' },
      ModelName: { _value: 'F670L' },
    },
    WANDevice: {
      1: {
        WANConnectionDevice: {
          1: {
            'X_ZTE-COM_VLANID': { _value: '20', _type: 'xsd:unsignedInt' },
            WANPPPConnection: {
              1: { 'X_ZTE-COM_VLANID': { _value: '20' } },
            },
          },
        },
      },
    },
  },
};

const extracted = vlan.extractVlan(zteDevice);
assert.strictEqual(extracted.vendor, 'zte');
assert.strictEqual(extracted.current, 20);
assert.ok(extracted.params.length >= 1);

const built = vlan.buildBindParameters(zteDevice, 100);
assert.strictEqual(built.ok, true);
assert.strictEqual(built.vlan, 100);
assert.strictEqual(built.usedFallback, false);
assert.ok(built.parameters.every((p) => p[1] === 100 && p[2] === 'xsd:unsignedInt'));
assert.ok(built.parameters.some((p) => /VLAN/.test(p[0])));

const fallback = vlan.buildBindParameters({ InternetGatewayDevice: { DeviceInfo: { Manufacturer: { _value: 'ZTE' } } } }, 100);
assert.strictEqual(fallback.usedFallback, true);
assert.ok(fallback.parameters.length >= 1);
assert.ok(fallback.parameters[0][0].includes('ZTE'));

const bad = vlan.buildBindParameters(zteDevice, 0);
assert.strictEqual(bad.ok, false);

assert.strictEqual(redaman.classifyRx(-18), 'good');
assert.strictEqual(redaman.classifyRx(-24), 'good');
assert.strictEqual(redaman.classifyRx(-25.5), 'warning');
assert.strictEqual(redaman.classifyRx(-27), 'warning');
assert.strictEqual(redaman.classifyRx(-29), 'critical');
assert.strictEqual(redaman.classifyRx(-6), 'hot');
assert.strictEqual(redaman.classifyRx(null), 'unknown');
assert.strictEqual(redaman.rxLabel('critical'), 'Kritis');

const stats = redaman.summarize([
  { severity: 'good', status: 'online' },
  { severity: 'critical', status: 'online' },
  { rx_power: -29, status: 'offline' },
]);
assert.strictEqual(stats.total, 3);
assert.strictEqual(stats.good, 1);
assert.strictEqual(stats.critical, 2);
assert.strictEqual(stats.offline, 1);

const spark = redaman.downsampleSpark([1, 2, 3, 4, 5, 6, 7, 8], 3);
assert.ok(spark.length <= 4);
assert.strictEqual(spark[spark.length - 1], 8);

const pts = [];
for (let i = 0; i < 200; i++) pts.push([i, i]);
const down = router.downsample(pts, 20);
assert.ok(down.length <= 22);
assert.deepStrictEqual(down[down.length - 1], [199, 199]);

const dist = router.pathDistanceM([[-7.25, 112.75], [-7.26, 112.76]]);
assert.ok(dist > 100 && dist < 20000, 'jarak Mojokerto-scale harus meter, dapat ' + dist);

const norm = router.normalizePoints([{ lat: -7.2, lng: 112.7 }, [ -7.3, 112.8 ]]);
assert.strictEqual(norm.length, 2);

const infraJs = fs.readFileSync(path.join(__dirname, '../../frontend/public/js/infrastructure.js'), 'utf8');
assert.ok(!/rastertiles\/voyager/.test(infraJs), 'peta infrastruktur tidak boleh pakai Carto Voyager (watermark API key)');
assert.ok(/tile\.openstreetmap\.org/.test(infraJs), 'mode Map harus OSM standar');
assert.ok(/maxZoom:\s*19/.test(infraJs), 'maxZoom peta harus 19 agar tile OSM tampil');

const infraEjs = fs.readFileSync(path.join(__dirname, '../../frontend/views/pages/infrastructure.ejs'), 'utf8');
assert.ok(!/left:\s*50%;\s*[\s\S]*transform:\s*translateX\(-50%\)/.test(infraEjs.split('SEARCH BAR')[1] || ''), 'search tidak boleh overlay tengah peta');
assert.ok(/Ikuti jalan|Kabel Jalan/.test(infraEjs), 'harus ada pilihan kabel mengikuti alur');

const sidebar = fs.readFileSync(path.join(__dirname, '../../frontend/views/partials/sidebar.ejs'), 'utf8');
assert.ok(sidebar.includes('/monitoring/ont-redaman'), 'sidebar harus punya Riwayat Redaman ONT');

console.log('ontRedamanVlanMap.test.js OK');
