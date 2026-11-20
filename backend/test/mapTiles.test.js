'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

require('../../frontend/public/js/map-tiles.js');
const tiles = global.MapTiles;
assert.ok(tiles.STREET_URL.includes('arcgisonline.com'));
assert.ok(!tiles.STREET_URL.includes('tile.openstreetmap.org'));
assert.ok(!tiles.STREET_URL.includes('cartocdn.com'));

const frontend = path.join(__dirname, '../../frontend');
function walk(dir, acc) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === 'vendor') continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|ejs|html)$/.test(name)) acc.push(p);
  }
  return acc;
}
const hits = [];
for (const file of walk(frontend, [])) {
  const t = fs.readFileSync(file, 'utf8');
  if (t.includes('tile.openstreetmap.org/{z}') || t.includes('basemaps.cartocdn.com/rastertiles/voyager')) {
    hits.push(path.relative(frontend, file));
  }
}
assert.deepStrictEqual(hits, [], 'frontend masih memakai tile OSM volunteer / Carto Voyager: ' + hits.join(', '));
console.log('mapTiles.test.js ok');
