const VERSION = '2.2'; // Cambiar este número con cada deploy
const CACHE = 'keynet-' + VERSION;

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => clients.claim())
      .then(() => {
        // Notificar a todos los clientes que recarguen
        self.clients.matchAll().then(clients => {
          clients.forEach(client => client.postMessage({type: 'UPDATE_AVAILABLE'}));
        });
      })
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

self.addEventListener('push', e => {
  if (!e.data) return;
  const d = e.data.json();
  self.registration.showNotification(d.title, {
    body: d.body, icon: '/llave-maestra/icon-192.png',
    badge: '/llave-maestra/icon-192.png', tag: 'keynet', renotify: true
  });
});
