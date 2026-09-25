// src/sw.js
/* eslint-disable no-restricted-globals */
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

const CACHE_NAME = 'aurafisky-v1';
const API_CACHE = 'aurafisky-api-v1';
const TILE_CACHE = 'aurafisky-tiles-v1';

// Precache manifest (injected by workbox)
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// ────────────────── API Routes ──────────────────

// Open-Meteo API - Network first, cache fallback
registerRoute(
  ({ url }) => url.origin === 'https://api.open-meteo.com',
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }), // 24 hours
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
    networkTimeoutSeconds: 10,
  })
);

// Nominatim Geocoding - Network first, cache fallback
registerRoute(
  ({ url }) => url.origin === 'https://nominatim.openstreetmap.org',
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }), // 7 days
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
    networkTimeoutSeconds: 10,
  })
);

// OSRM Routing - Network first, cache fallback
registerRoute(
  ({ url }) => url.origin === 'https://router.project-osrm.org',
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }), // 24 hours
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
    networkTimeoutSeconds: 10,
  })
);

// ────────────────── Map Tiles ──────────────────

// OpenStreetMap tiles - Cache first, long expiry
registerRoute(
  ({ url }) => url.origin === 'https://tile.openstreetmap.org' ||
               url.origin === 'https://a.tile.openstreetmap.org' ||
               url.origin === 'https://b.tile.openstreetmap.org' ||
               url.origin === 'https://c.tile.openstreetmap.org',
  new CacheFirst({
    cacheName: TILE_CACHE,
    plugins: [
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }), // 30 days
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// RainViewer radar tiles - Cache first
registerRoute(
  ({ url }) => url.origin === 'https://tilecache.rainviewer.com',
  new CacheFirst({
    cacheName: 'aurafisky-radar-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }), // 7 days
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ────────────────── Static Assets ──────────────────

// Fonts, images, etc. - Stale while revalidate
registerRoute(
  ({ request }) => request.destination === 'font' || request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'aurafisky-static-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// ────────────────── Navigation (HTML) ──────────────────

// SPA navigation - Network first for HTML, fallback to offline page
const navigationRoute = new NavigationRoute(
  new NetworkFirst({
    cacheName: 'aurafisky-nav-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
    networkTimeoutSeconds: 5,
  }),
  { allowlist: [new RegExp('^/')] } // Match all paths
);
registerRoute(navigationRoute);

// ────────────────── Background Sync ──────────────────

// Queue failed mutations for retry when online
const bgSyncPlugin = new BackgroundSyncPlugin('aurafisky-offline-queue', {
  maxRetentionTime: 24 * 60, // 24 hours
});

registerRoute(
  ({ url, request }) => url.origin === self.location.origin && request.method !== 'GET',
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  })
);

// ────────────────── Push Notifications ──────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'aurafisky-notification',
    requireInteraction: true,
    actions: data.actions || [],
    data: data.data || {},
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action) {
    // Handle action buttons
    const data = event.notification.data;
    if (event.action === 'open' && data.url) {
      event.waitUntil(clients.openWindow(data.url));
    }
    return;
  }

  // Default click - open app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === self.location.origin && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  // Track dismissal if needed
  console.log('Notification closed:', event.notification.tag);
});

// ────────────────── Periodic Background Sync (Alert Evaluation) ──────────────────

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'evaluate-alerts') {
    event.waitUntil(evaluateAlertsInBackground());
  }
});

async function evaluateAlertsInBackground() {
  try {
    // This would call your alert evaluation logic
    // For now, just log
    console.log('[SW] Background alert evaluation triggered');
    // In a real implementation, you'd:
    // 1. Get user's alerts from IndexedDB
    // 2. Fetch forecasts for each location
    // 3. Evaluate thresholds
    // 4. Show notifications if triggered
  } catch (err) {
    console.error('[SW] Background alert evaluation failed', err);
  }
}

// ────────────────── Install / Activate ──────────────────

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// ────────────────── Message Handling ──────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CHECK_UPDATE') {
    // Trigger update check
    self.registration.update();
  }
  if (event.data?.type === 'SYNC_ALERTS') {
    // Trigger alert sync from main thread
    event.waitUntil(evaluateAlertsInBackground());
  }
});

console.log('[SW] Service worker loaded');