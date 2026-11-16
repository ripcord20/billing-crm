self.addEventListener('install', (e) => {
  e.waitUntil(caches.open('fiberix-remote-v1').then((c) => c.addAll([
    '/', '/index.html', '/app.css', '/app.js', '/manifest.webmanifest', '/icon.svg'
  ])));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.pathname === '/ws' || u.pathname === '/health') return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
