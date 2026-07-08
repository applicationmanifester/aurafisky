const CACHE_NAME = 'aurafisky-v2';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './weather.js',
  './styles.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(() => console.warn('SW: failed to cache', url)))
      );
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Cache bypass for live API calls
  if (e.request.url.includes('api.open-meteo.com') || 
      e.request.url.includes('rainviewer.com') || 
      e.request.url.includes('openstreetmap.org') ||
      e.request.url.includes('nominatim.openstreetmap.org')) {
    e.respondWith(fetch(e.request).catch(() => new Response('', { status: 503, statusText: 'Offline' })));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => new Response('', { status: 503 })))
  );
});
