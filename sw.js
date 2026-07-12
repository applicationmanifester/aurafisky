importScripts(
  "https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js",
);
importScripts("weather.js");
importScripts("src/icons.js");
// Bump this on every deploy. The activate handler wipes any aurafisky-v*
// cache whose version differs, so browsers can never keep serving a stale
// older build of the app shell.
const CACHE_NAME = "aurafisky-v34";
// Critical app-shell files: if any of these fail to precache, the install
// must fail loudly so a half-cached SW never goes live and 504s on boot.
const CRITICAL_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./weather.js",
  "./styles.css",
  "./src/icons.js",
  "./modules/dom-utils.js",
  "./modules/toast.js",
];
// Best-effort extras (icons, css, CDN libs) — failure is tolerated.
const OPTIONAL_ASSETS = [
  "./favicon.svg",
  "./logo.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.json",
  "./css/tailwind.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js",
  "https://cdn.jsdelivr.net/npm/dompurify@3.0.6/dist/purify.min.js",
];
const ASSETS = [...CRITICAL_ASSETS, ...OPTIONAL_ASSETS];

// Minimal offline page served when a navigation fails and nothing is cached.
// Lets the app's own offline banner take over instead of a browser error.
const OFFLINE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Aurafisky — Offline</title><style>
html,body{margin:0;height:100%;background:#0b1220;color:#e2e8f0;
font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center}
div{padding:24px;max-width:360px}h1{font-size:1.25rem;margin:0 0 8px}
p{opacity:.7;line-height:1.5;margin:0}
</style></head><body><div>
<h1>Aurafisky is offline</h1>
<p>Check your connection and reload. Recent weather data may still be available.</p>
</div></body></html>`;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Critical shell must all succeed or the install fails loudly.
      await Promise.all(
        CRITICAL_ASSETS.map((url) => cache.add(url)),
      );
      // Optional extras: tolerate individual failures.
      await Promise.allSettled(
        OPTIONAL_ASSETS.map((url) =>
          cache.add(url).catch(() => console.warn("SW: failed to cache", url)),
        ),
      );
    }),
  );
});

self.addEventListener("activate", (e) => {
  console.log("SW activated:", CACHE_NAME);
  e.waitUntil(
    caches
      .keys()
      .then((keys) => {
        // Whitelist caches we want to KEEP across updates:
        //   - CACHE_NAME        : the current app shell build
        //   - TILE_CACHE        : map tiles (self-evicting via LRU, see cacheTile)
        // Everything else — including stale aurafisky-vNN builds from prior
        // deploys and any orphan/orphaned-name caches — is deleted so a
        // browser can never resurrect an older version of the app.
        const keep = new Set([CACHE_NAME, TILE_CACHE]);
        return Promise.all(
          keys
            .filter((key) => !keep.has(key))
            .map((key) => {
              console.log("SW: removing stale cache", key);
              return caches.delete(key);
            }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// Allow the page to force-activate a waiting SW (postMessage "skipWaiting")
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    // Acknowledge so the page's postMessage promise resolves and the
    // message channel doesn't close mid-flight ("channel closed" error).
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage("activated");
    }
    self.skipWaiting();
  }
});

const TILE_CACHE = "aurafisky-tiles-v1";
const TILE_CACHE_MAX = 350;

async function cacheTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res) {
      await cache.put(request, res.clone());
      const keys = await cache.keys();
      if (keys.length > TILE_CACHE_MAX) {
        await cache.delete(keys[0]);
      }
    }
    return res;
  } catch (err) {
    return (
      cached ||
      new Response("", { status: 504, statusText: "Tile unavailable" })
    );
  }
}

self.addEventListener("fetch", (e) => {
  const url = e.request.url;

  // CDN/third-party libs — serve cache-first so the app works offline.
  // The assets are precached at install; this avoids the dead-cache bug
  // where Leaflet/localforage/DOMPurify were never served from the Cache API.
  if (url.includes("unpkg.com") || url.includes("cdn.jsdelivr.net")) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(e.request);
        if (cached) return cached;
        try {
          const networkResponse = await fetch(e.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          // Fall back to any cached copy regardless of URL match strictness.
          const anyMatch = await caches.match(e.request, { ignoreVary: true });
          if (anyMatch) return anyMatch;
          throw err;
        }
      })(),
    );
    return;
  }

  // Map tiles (CartoDB) — bounded LRU cache for instant repeat visits.
  if (url.includes("basemaps.cartocdn.com")) {
    e.respondWith(cacheTile(e.request));
    return;
  }

  // Live API / Firebase / Auth — go DIRECT. Previously we synthesized a
  // 503 here; that fabricated error confused the console and the SDKs.
  // Let the browser surface real network errors instead.
  if (
    url.includes("api.open-meteo.com") ||
    url.includes("rainviewer.com") ||
    url.includes("openstreetmap.org") ||
    url.includes("nominatim.openstreetmap.org") ||
    url.includes("firebase") ||
    url.includes("googleapis.com") ||
    url.includes("gstatic.com")
  ) {
    return;
  }

  // Navigation requests (the app shell): try network, fall back to the
  // cached index.html so the PWA still opens offline. Never reject a
  // navigation — that yields a blank "network error" page.
  if (e.request.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const net = await fetch(e.request);
          if (net && net.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put("./index.html", net.clone());
            return net;
          }
          throw new Error("bad nav response");
        } catch (err) {
          const cached = await caches.match("./index.html");
          if (cached) return cached;
          // Last resort: any cached same-origin doc
          const anyDoc = await caches.match(e.request, { ignoreSearch: true });
          if (anyDoc) return anyDoc;
          // Nothing cached at all: show a minimal offline page instead of
          // throwing (which would surface as an unhandled rejection).
          return new Response(OFFLINE_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 200,
          });
        }
      })()
    );
    return;
  }

  // Same-origin assets only: stale-while-revalidate. On failure fall back
  // to cache; never return a synthetic 503 — propagate the real error.
  if (e.request.method === "GET" && url.startsWith(self.location.origin)) {
    e.respondWith(
      (async () => {
        const cached = await caches.match(e.request);
        try {
          const networkResponse = await fetch(e.request);
          if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          if (cached) return cached;
          // Network failed and nothing cached. Never re-throw: that surfaces
          // as an unhandled rejection + a blank "network error" response.
          // For a navigation, serve the cached shell or a minimal offline
          // page so the app (and its offline banner) can still run.
          if (e.request.mode === "navigate") {
            const shell = await caches.match("./index.html");
            if (shell) return shell;
            return new Response(OFFLINE_HTML, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
              status: 200,
            });
          }
          // Non-navigation same-origin asset (app.js, weather.js, styles.css)
          // failed both network and cache. A dead 504 with an empty body would
          // leave the page loaded but the script never executed (blank card).
          // Fall back to the cached app shell so the PWA still boots and can
          // show its offline banner; only images/tiles get the silent 504.
          if (/\.(js|css|html?)$/.test(url)) {
            const shell = await caches.match("./index.html");
            if (shell) return shell;
            return new Response(OFFLINE_HTML, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
              status: 200,
            });
          }
          return new Response("", { status: 504, statusText: "Offline" });
        }
      })()
    );
  }
});

// Handle notification clicks (focus or open PWA)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        if (clientList.length > 0) {
          let client = clientList[0];
          for (let c of clientList) {
            if (c.focused) {
              client = c;
              break;
            }
          }
          return client.focus();
        }
        return self.clients.openWindow("./");
      }),
  );
});

// Background Weather Notification Check
async function checkAndSendBackgroundWeatherNotification() {
  try {
    const defaultLocation = await localforage.getItem("defaultLocation");
    const defaultLocationNotify = await localforage.getItem(
      "defaultLocationNotify",
    );
    const units = await localforage.getItem("units");

    if (!defaultLocation || !defaultLocationNotify) return;

    const now = Date.now();
    const lastNotified = await localforage.getItem(
      "last_weather_notification_time",
    );
    if (lastNotified) {
      const timeDiff = now - lastNotified;
      if (timeDiff < 55 * 60 * 1000) {
        return; // Already notified in the last 55 minutes
      }
    }

    if (units) {
      WeatherService.setUnits(units);
    }

    const forecast = await WeatherService.fetchForecast(
      defaultLocation.lat,
      defaultLocation.lng,
    );
    const currentHourIdx = WeatherService.getCurrentHourIndex(forecast);
    const hourWeather = WeatherService.getHourlyAtIndex(
      forecast,
      currentHourIdx,
    );

    if (!hourWeather) return;

    const isFahrenheit = WeatherService.getUnits() === "imperial";
    const tempVal = isFahrenheit
      ? (hourWeather.temperature * 9) / 5 + 32
      : hourWeather.temperature;
    const tempStr = `${tempVal.toFixed(1)}°${isFahrenheit ? "F" : "C"}`;

    const weatherInfo = WeatherService.getWeatherInfo(
      hourWeather.weatherCode,
      hourWeather.isDay,
    );
    const desc = weatherInfo ? weatherInfo.description : "Unknown conditions";
    const emoji = weatherInfo?.icon || "🌡️";

    const title = `Weather Update: ${defaultLocation.name}`;
    const options = {
      body: `${emoji} ${desc} | Temperature: ${tempStr} | Humidity: ${hourWeather.humidity}%`,
      icon: "favicon.svg",
      badge: "favicon.svg",
      tag: "aurafisky-hourly-weather",
      renotify: true,
    };

    await self.registration.showNotification(title, options);

    await localforage.setItem("last_weather_notification_time", now);
  } catch (err) {
    console.error("Background weather notification failed:", err);
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "hourly-weather-update") {
    event.waitUntil(checkAndSendBackgroundWeatherNotification());
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = {};
  }
  const title =
    (payload.notification && payload.notification.title) ||
    payload.title ||
    "Aurafisky Weather";
  const options = {
    body:
      (payload.notification && payload.notification.body) ||
      payload.body ||
      "Weather update available.",
    icon: "favicon.svg",
    badge: "favicon.svg",
    tag: "aurafisky-push",
    renotify: true,
    data: payload.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Global error handler for unhandled promise rejections in SW
self.addEventListener("unhandledrejection", (event) => {
  console.error("SW unhandled rejection:", event.reason);
  event.preventDefault();
});
