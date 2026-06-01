// Service Worker - auto-limpieza
// v2026-05-31b — cache bust (forzar update en clientes)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
    .then(() => clients.claim())
  );
});
// Sin fetch handler — el browser maneja todas las peticiones normalmente
