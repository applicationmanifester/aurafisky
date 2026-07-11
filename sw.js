importScripts(
  "https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js",
);
importScripts("weather.js");
importScripts("src/icons.js");
const CACHE_NAME = "aurafisky-v23";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./weather.js",
  "./favicon.svg",
  "./logo.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./src/icons.js",
  "./modules/dom-utils.js",
  "./modules/toast.js",
  "./manifest.json",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.jsdelivr.net/npm/localforage@1.10.0/dist/localforage.min.js",
  "https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js",
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map((url) =>
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
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// ── Bounded map-tile cache ───────────────────────────────────
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

  // CDN/third-party libs — let the browser handle natively.
  if (url.includes("unpkg.com") || url.includes("cdn.jsdelivr.net")) {
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
          throw err; // let the browser surface the genuine network error
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
