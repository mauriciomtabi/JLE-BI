// sw.js - Service Worker de Autodestruição
// Remove a si mesmo e limpa todos os caches para resolver problemas de cache persistente no BI.

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => caches.delete(key)));
    })
    .then(() => self.registration.unregister())
    .then(() => self.clients.claim())
    .then(() => {
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          if (client.url && 'navigate' in client) {
            client.navigate(client.url);
          }
        });
      });
    })
  );
});

self.addEventListener('fetch', event => {
  // Ignora o cache e busca diretamente da rede
  event.respondWith(fetch(event.request));
});
