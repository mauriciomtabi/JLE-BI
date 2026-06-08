const CACHE_NAME = 'jle-bi-v3.13.20260608220000';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './favicon.png',
  './logo.png',
  './veiculos_app.js',
  './veiculos_styles.css',
  './veiculos_data.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    })
  );
});

// Listener para forçar ativação imediata sob comando do usuário (PWA Update Prompt)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
