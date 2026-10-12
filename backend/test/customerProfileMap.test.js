const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(
  path.join(__dirname, '../../frontend/views/pages/customer_profile.ejs'),
  'utf8'
);

assert.ok(src.includes('cp-maphd-r'), 'tombol Peta/Satelit ada di header peta');
assert.ok(src.includes("zoomControl:!isNarrow"), 'zoom Leaflet dimatikan di layar HP');
assert.ok(src.includes('leaflet-control-zoom') && src.includes('display:none!important'), 'CSS menyembunyikan zoom di HP');
assert.ok(src.includes('map-layer-toggle{position:static'), 'toggle tidak overlay di atas peta');
assert.ok(src.indexOf('id="mapBtnStreet"') < src.indexOf('custMapWrap'), 'Peta/Satelit dirender di header, bukan di body peta');
assert.ok(!/mapBody = hasCoord[\s\S]{0,180}map-layer-toggle/.test(src), 'body peta tidak lagi memuat toggle overlay');

console.log('customerProfileMap.test.js OK');
