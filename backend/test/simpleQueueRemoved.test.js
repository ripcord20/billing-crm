'use strict';
/**
 * Modul Simple Queue sudah dihapus dari UI billing.
 * URL lama diarahkan, menu tidak boleh muncul lagi.
 * API MikroTik /queues tetap ada untuk traffic, ping, dan profil pelanggan.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const sidebar = read('frontend/views/partials/sidebar.ejs');
assert.ok(!/href="\/monitoring\/queue"/.test(sidebar), 'sidebar tidak boleh taut ke /monitoring/queue');
assert.ok(!/Simple Queue/.test(sidebar), 'sidebar tidak boleh menampilkan Simple Queue');

const drawer = read('frontend/views/partials/mobile-drawer.ejs');
assert.ok(!/href="\/mobile\/queue"/.test(drawer), 'drawer HP tidak boleh taut ke /mobile/queue');
assert.ok(!/Simple Queue/.test(drawer), 'drawer HP tidak boleh menampilkan Simple Queue');
assert.ok(!/openQueueAdd/.test(drawer), 'FAB tidak boleh membuka form Simple Queue');

const home = read('frontend/views/pages/mobile/home.ejs');
assert.ok(!/href="\/mobile\/queue"/.test(home), 'beranda HP tidak boleh punya shortcut Queue');

const web = read('backend/routes/web.js');
assert.ok(/\/monitoring\/queue[\s\S]{0,120}?res\.redirect\('\/dashboard'\)/.test(web),
  '/monitoring/queue harus redirect ke dashboard');
assert.ok(/\/mobile\/queue[\s\S]{0,120}?res\.redirect\('\/mobile'\)/.test(web),
  '/mobile/queue harus redirect ke /mobile');
assert.ok(!/render\('pages\/queue'/.test(web), 'web.js tidak boleh merender pages/queue');
assert.ok(!/renderMobile\('queue'/.test(web), 'web.js tidak boleh merender mobile/queue');

for (const rel of [
  'frontend/views/pages/queue.ejs',
  'frontend/views/pages/mobile/queue.ejs',
  'frontend/public/js/queue.js',
]) {
  assert.ok(!fs.existsSync(path.join(root, rel)), rel + ' harus dihapus');
}

assert.ok(fs.existsSync(path.join(root, 'backend/controllers/QueueController.js')),
  'QueueController tetap dipakai traffic/ping/profil');

console.log('simpleQueueRemoved.test.js OK');
