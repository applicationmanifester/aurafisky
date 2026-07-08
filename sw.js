const CACHE_NAME = 'aurafisky-v8';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './weather.js',
  './modules/dom-utils.js',
  './modules/toast.js',
  './styles.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  './favicon.svg',
  './logo.svg',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
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
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Cache bypass for live API calls, Firebase, and Google Auth
  if (url.includes('api.open-meteo.com') || 
      url.includes('rainviewer.com') || 
      url.includes('openstreetmap.org') ||
      url.includes('nominatim.openstreetmap.org') ||
      url.includes('firebase') || 
      url.includes('googleapis.com') || 
      url.includes('gstatic.com')) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ error: 'offline' }), { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // Stale-While-Revalidate for local assets
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && e.request.method === 'GET') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => null);

      return cached || fetchPromise;
    })
  );
});
