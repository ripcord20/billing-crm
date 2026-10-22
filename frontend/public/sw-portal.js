/**
 * sw-portal.js — Service worker agar portal pelanggan bisa dipasang ke layar utama.
 * Scope: /portal
 *
 * Tidak menyimpan halaman. Tagihan dan sesi harus selalu dari jaringan.
 * Listener fetch ada supaya Chrome mengizinkan pemasangan.
 */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function () {
  // Lewati ke jaringan. Jangan cache HTML portal.
});
