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

function respondWithFetch(request, fallbackResponse) {
  return fetch(request)
    .then((res) => res)
    .catch(() => fallbackResponse);
}

self.addEventListener("fetch", (e) => {
  const url = e.request.url;

  // Bypass completely for CDN/third-party assets — let browser handle natively
  if (url.includes("unpkg.com") || url.includes("cdn.jsdelivr.net")) {
    return;
  }

  // Cache bypass for live API calls, Firebase, and Google Auth
  if (
    url.includes("api.open-meteo.com") ||
    url.includes("rainviewer.com") ||
    url.includes("openstreetmap.org") ||
    url.includes("nominatim.openstreetmap.org") ||
    url.includes("firebase") ||
    url.includes("googleapis.com") ||
    url.includes("gstatic.com")
  ) {
    e.respondWith(
      fetch(e.request)
        .then((res) => res)
        .catch(() =>
          new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "application/json" },
          })
        )
    );
    return;
  }

  // Cache map tiles (CartoDB) so repeat visits render instantly. Bounded LRU.
  if (url.includes("basemaps.cartocdn.com")) {
    e.respondWith(cacheTile(e.request));
    return;
  }

  // Stale-While-Revalidate for local assets
  e.respondWith(
    (async () => {
      try {
        const cached = await caches.match(e.request);
        const networkResponse = await fetch(e.request);
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          e.request.method === "GET" &&
          e.request.url.startsWith(self.location.origin)
        ) {
          const responseToCache = networkResponse.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(e.request, responseToCache);
        }
        return networkResponse;
      } catch (err) {
        const cached = await caches.match(e.request);
        const fallback = new Response("", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": "text/plain" },
        });
        return cached || fallback;
      }
    })()
  );
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
