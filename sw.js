// Service Worker - auto-limpieza
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => clients.claim())
  );
});
self.addEventListener('fetch', e => {
  // Solo interceptar assets del mismo origen — nunca APIs externas ni Firebase Functions
  if (e.request.url.startsWith(self.location.origin) && e.request.method === 'GET') {
    e.respondWith(fetch(e.request));
  }
});
