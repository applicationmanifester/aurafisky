// features/myPlaces.js
// ── MY PLACES GLANCE STRIP ──────────────────────────────────────────
//
// A horizontal strip at the top of the Overview tab showing the live
// temperature + icon for every saved place (home first, max 6). One glance
// answers "how is it back home / at the office / at grandma's" — the
// multi-city habit that makes Aurafisky a daily-open app instead of a
// check-when-it-rains app.
//
// Constraints:
//   * Tap a pill → the map flies there and the forecast loads.
//   * Glance values are cached in localStorage for 30 minutes per place, and
//     at most 3 stale places are refreshed per render cycle, so opening the
//     panel never triggers a burst of API calls.
//   * Fully offline-tolerant: stale cache is always better than no data.
//   * Pure helpers exported for unit tests.

export const GLANCE_CACHE_KEY = "aurafisky_place_glance_v1";
export const GLANCE_TTL_MS = 30 * 60 * 1000;
export const GLANCE_MAX_PLACES = 6;
export const GLANCE_MAX_FETCHES_PER_CYCLE = 3;

// ────────────────── pure helpers ──────────────────

const round3 = (n) => (typeof n === "number" ? Number(n.toFixed(3)) : n);

/**
 * Builds the ordered place list: home first (if set), then bookmarks.
 * Dedupes by rounded coordinates, caps the count.
 *
 * @param {Array<{name:string,lat:number,lng:number}>|null} bookmarks
 * @param {{name:string,lat:number,lng:number}|null} home
 * @param {number} [max]
 * @returns {Array<{name:string,lat:number,lng:number}>}
 */
export function pickPlaces(bookmarks, home, max = GLANCE_MAX_PLACES) {
  const out = [];
  const seen = new Set();
  const push = (p) => {
    if (!p || typeof p.lat !== "number" || typeof p.lng !== "number") return;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
    const key = `${round3(p.lat)},${round3(p.lng)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: p.name || "Saved place", lat: p.lat, lng: p.lng });
  };
  push(home);
  for (const b of Array.isArray(bookmarks) ? bookmarks : []) push(b);
  return out.slice(0, max);
}

/**
 * Cache read: returns fresh glances and the keys that need a refetch.
 * @param {Array<{name,lat,lng}>} places
 * @param {object|null} cache - parsed localStorage map {key:{ts,temp,icon}}
 * @param {number} now
 * @param {number} [ttl]
 * @returns {{fresh:Array<{key,name,temp,icon,stale:boolean}>, staleKeys:string[]}}
 */
export function splitFreshAndStale(places, cache, now, ttl = GLANCE_TTL_MS) {
  const fresh = [];
  const staleKeys = [];
  for (const p of places) {
    const key = `${round3(p.lat)},${round3(p.lng)}`;
    const hit = cache && cache[key];
    if (hit && typeof hit.temp === "number" && now - (hit.ts || 0) < ttl) {
      fresh.push({ key, name: p.name, temp: hit.temp, icon: hit.icon || "🌡️", stale: false });
    } else {
      fresh.push({
        key,
        name: p.name,
        temp: hit ? hit.temp : null,
        icon: hit?.icon || null,
        stale: true,
      });
      staleKeys.push(key);
    }
  }
  return { fresh, staleKeys };
}

// ────────────────── module state ──────────────────

let appRef = null;
let _fetchCycle = 0;

function loadCache() {
  try {
    const raw = localStorage.getItem(GLANCE_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(GLANCE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage unavailable */
  }
}

function cacheKeyFor(lat, lng) {
  return `${round3(lat)},${round3(lng)}`;
}

// ────────────────── rendering ──────────────────

function ensureStrip() {
  if (document.getElementById("myPlacesStrip")) return;
  const host = document.getElementById("weatherTabOverview");
  if (!host) return;
  const strip = document.createElement("div");
  strip.id = "myPlacesStrip";
  strip.className = "hidden";
  strip.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">My places</h4>
      <span id="myPlacesHint" class="text-[9px] text-slate-400 font-medium">tap to open</span>
    </div>
    <div id="myPlacesPills" class="flex gap-2 overflow-x-auto hide-scrollbar pb-1" role="list" aria-label="Saved places glance"></div>`;
  // Temp display block is the first child of the Overview tab.
  const first = host.firstElementChild;
  if (first) host.insertBefore(strip, first.nextSibling);
  else host.appendChild(strip);
}

function renderStrip(places, glances) {
  const strip = document.getElementById("myPlacesStrip");
  const pills = document.getElementById("myPlacesPills");
  if (!strip || !pills) return;
  if (!places.length) {
    strip.classList.add("hidden");
    return;
  }

  pills.textContent = "";
  for (const p of places) {
    const g = glances.get ? glances.get(p.key || cacheKeyFor(p.lat, p.lng)) : null;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "listitem");
    btn.className =
      "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/50 dark:border-slate-700/50 hover:border-primary/50 active:scale-95 transition-all cursor-pointer flex-shrink-0";
    btn.title = `Open ${p.name}`;

    const name = document.createElement("span");
    name.className = "text-[11px] font-semibold text-slate-700 dark:text-slate-200 max-w-[92px] truncate";
    name.textContent = String(p.name).split(/,\s*/)[0];

    const val = document.createElement("span");
    val.className = "text-[11px] font-bold text-slate-500 dark:text-slate-400 font-variant-numeric: tabular-nums";
    val.style.fontVariantNumeric = "tabular-nums";
    val.textContent = g && g.temp != null ? `${g.icon || "🌡️"} ${Math.round(g.temp)}°` : "···";

    btn.append(name, val);
    btn.addEventListener("click", () => {
      appRef?.selectLocation?.(p.lat, p.lng, p.name);
      appRef?._haptic?.("selection");
    });
    pills.appendChild(btn);
  }
  strip.classList.remove("hidden");
}

/** Refresh at most N stale places, then re-render with the new data. */
async function refreshStale(places, staleKeys) {
  const S = globalThis.WeatherService;
  if (!S?.fetchForecast || !S?.getHourlyAtIndex) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;

  const targets = places.filter((p) =>
    staleKeys.includes(cacheKeyFor(p.lat, p.lng)),
  ).slice(0, GLANCE_MAX_FETCHES_PER_CYCLE);
  if (!targets.length) return;

  const cache = loadCache();
  const cycle = ++_fetchCycle;

  await Promise.allSettled(
    targets.map(async (p) => {
      const data = await S.fetchForecast(p.lat, p.lng);
      const idx = S.getCurrentHourIndex
        ? S.getCurrentHourIndex(data, data.utc_offset_seconds || 0)
        : 0;
      const w = S.getHourlyAtIndex(data, idx);
      if (!w) return;
      const info = S.getWeatherInfo
        ? S.getWeatherInfo(w.weatherCode, w.isDay)
        : null;
      cache[cacheKeyFor(p.lat, p.lng)] = {
        ts: Date.now(),
        temp: w.temperature,
        icon: info?.icon || "🌡️",
      };
    }),
  );

  // Only persist/render if this is still the newest cycle.
  if (cycle === _fetchCycle) {
    saveCache(cache);
    renderMyPlaces();
  }
}

/** Public: re-render the strip from cache and kick off bounded refreshes. */
function renderMyPlaces() {
  const app = appRef || this;
  if (!app) return;
  const places = pickPlaces(
    app.bookmarks,
    app.defaultLocation,
    GLANCE_MAX_PLACES,
  );
  const cache = loadCache();
  const { fresh, staleKeys } = splitFreshAndStale(places, cache, Date.now());

  const map = new Map(fresh.map((f) => [f.key, f]));
  ensureStrip();
  renderStrip(places, map);

  if (staleKeys.length) {
    refreshStale(places, staleKeys).catch(() => {
      /* offline or failed — stale cache stays */
    });
  }
}

export function init(app) {
  appRef = app;
  app.renderMyPlaces = renderMyPlaces;

  // Re-render when bookmarks/home change.
  const originalSave =
    typeof app.saveBookmarks === "function" ? app.saveBookmarks : null;
  if (originalSave && !originalSave.__myPlacesWrapped) {
    const wrapped = function (...args) {
      const result = originalSave.apply(this, args);
      try {
        renderMyPlaces.call(this);
      } catch (e) {
        console.warn("My places re-render failed:", e);
      }
      return result;
    };
    wrapped.__myPlacesWrapped = true;
    app.saveBookmarks = wrapped;
  }

  try {
    renderMyPlaces.call(app);
  } catch {
    /* data not ready yet */
  }
}
