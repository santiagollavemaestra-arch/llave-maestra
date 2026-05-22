const CACHE_NAME = 'llave-maestra-v3';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Borrar caches viejos
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => caches.delete(key)))
    ).then(() => clients.claim())
  );
});

// Siempre ir a la red, sin cachear
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => new Response('Sin conexión'))
  );
});

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'llave-maestra',
    renotify: true
  });
});
