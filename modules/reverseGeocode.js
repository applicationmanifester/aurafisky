// modules/reverseGeocode.js
// ── Choosing between two Nominatim zoom levels ──────────────────────
//
// Nominatim's reverse endpoint answers differently depending on the detail
// level asked for, and at the extremes it produces genuinely wrong labels:
//
//   zoom 14 -> "Gaunipalli"   (the settlement)
//   zoom 18 -> "Kottahudya"   (the parent of the nearest road node)
//
// Both are true responses for the *same* coordinate, 7 m from Gaunipalli's own
// centroid. At high zoom Nominatim walks down to the nearest address node and
// reports whichever administrative boundary contains that node; when the point
// falls just outside a small settlement's polygon, that boundary belongs to a
// different, larger village.
//
// The rule this module encodes:
//   * zoom 14 resolves to the settlement level — what a person means by
//     "where am I" — so it owns the settlement name.
//   * zoom 18 carries the finer levels (suburb / quarter / neighbourhood)
//     that matter inside a city but which zoom 14 omits, so it still
//     contributes those.
//   * When the two disagree about the settlement, the coarser one wins.

import { formatPlaceName, isOceanName, isCoordinateOnLand, formatCoordinates } from './geo.js';

/** Settlement-level parts, in priority order, per Nominatim's address schema. */
const SETTLEMENT_KEYS = ['city', 'town', 'village', 'municipality', 'hamlet'];

/**
 * Picks the settlement name out of a Nominatim address object.
 * @returns {string} '' when the address has no settlement at all.
 */
export function pickSettlement(address) {
  if (!address || typeof address !== 'object') return '';
  for (const key of SETTLEMENT_KEYS) {
    const v = address[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * Merges a coarse (zoom 14) and a fine (zoom 18) response into the address
 * that should drive the label.
 *
 * @param {object|null} coarseAddr - address from the zoom-14 response
 * @param {object|null} fineAddr - address from the zoom-18 response
 * @returns {{ address: object, settlement: string, disagreed: boolean }}
 */
export function mergeReverseAddresses(coarseAddr, fineAddr) {
  const coarseSettlement = pickSettlement(coarseAddr);
  const fineSettlement = pickSettlement(fineAddr);
  const disagreed = Boolean(coarseSettlement) && coarseSettlement !== fineSettlement;

  if (disagreed) {
    // Keep every fine detail (suburb, quarter, postcode...) but overwrite the
    // settlement with the one zoom 14 is confident about.
    const merged = { ...(fineAddr || {}) };
    // Clear all settlement keys so none can shadow the authoritative one.
    for (const key of SETTLEMENT_KEYS) delete merged[key];
    merged[coarseAddr && SETTLEMENT_KEYS.find((k) => coarseAddr[k])] = coarseSettlement;
    return { address: merged, settlement: coarseSettlement, disagreed: true };
  }

  // Agreement (or only one response): the finer address is strictly richer.
  const address = fineAddr || coarseAddr || {};
  return {
    address,
    settlement: fineSettlement || coarseSettlement,
    disagreed: false,
  };
}

/**
 * Builds the final place label from the two responses.
 *
 * @param {object|null} coarse  full zoom-14 response
 * @param {object|null} fine    full zoom-18 response
 * @param {object} [opts]
 * @param {(s:string)=>string} [opts.sanitize]
 * @param {string} [opts.describeFallback] - used when neither response names a place
 * @param {string} [opts.fallback] - used when the address carries no usable parts
 */
export function labelFromReverse(coarse, fine, opts = {}) {
  const sanitize = opts.sanitize || ((s) => String(s || ''));
  const merged = mergeReverseAddresses(coarse?.address, fine?.address);

  let name = formatPlaceName(merged.address, {
    fallback: sanitize(fine?.display_name || coarse?.display_name),
  });

  if (!name) {
    name = sanitize(fine?.name || coarse?.name) || opts.describeFallback || '';
  }

  return { name, ...merged };
}

/**
 * The two URLs a reverse lookup needs. Kept here so the query is testable
 * without touching the network.
 */
export function reverseUrls(lat, lng, lang = 'en') {
  const base = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2'
    + `&lat=${lat}&lon=${lng}&accept-language=${encodeURIComponent(lang)}`;
  return {
    coarse: `${base}&zoom=14&addressdetails=1`,
    fine: `${base}&zoom=18&addressdetails=1`,
  };
}

// ── Reverse Geocode Cache & In-Flight Deduplication ─────────────────
const GEOCODE_CACHE_KEY = 'aurafisky_geocode_cache_v1';
const MAX_MEM_CACHE = 150;
const memCache = new Map();
const inFlightRequests = new Map();

function getCacheKey(lat, lng, lang = 'en') {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)},${lang.toLowerCase().split(/[-_,]/)[0] || 'en'}`;
}

export function clearGeocodeCache() {
  memCache.clear();
  inFlightRequests.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(GEOCODE_CACHE_KEY);
    }
  } catch (_) {}
}

export function getGeocodeCache(lat, lng, lang = 'en') {
  const key = getCacheKey(lat, lng, lang);
  if (memCache.has(key)) {
    const item = memCache.get(key);
    // Invalidate stale ocean labels for coordinates known to be on land
    if (item && isOceanName(item.name) && isCoordinateOnLand(lat, lng)) {
      memCache.delete(key);
    } else {
      return item;
    }
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(GEOCODE_CACHE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed[key]) {
          const item = parsed[key];
          if (item && isOceanName(item.name) && isCoordinateOnLand(lat, lng)) {
            delete parsed[key];
            localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(parsed));
          } else {
            memCache.set(key, item);
            return item;
          }
        }
      }
    }
  } catch (_) {}
  return null;
}

function persistGeocodeCache(key, data, lat = null, lng = null) {
  // Never persist open ocean basin names if coordinates are on land
  if (data && isOceanName(data.name) && lat != null && lng != null && isCoordinateOnLand(lat, lng)) {
    return;
  }

  if (memCache.size >= MAX_MEM_CACHE) {
    const oldestKey = memCache.keys().next().value;
    memCache.delete(oldestKey);
  }
  memCache.set(key, data);

  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(GEOCODE_CACHE_KEY);
      const store = raw ? JSON.parse(raw) : {};
      const keys = Object.keys(store);
      if (keys.length >= 60) {
        delete store[keys[0]];
      }
      store[key] = data;
      localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(store));
    }
  } catch (_) {}
}

/**
 * High-reliability reverse geocode lookup with:
 * 1. In-memory and persistent caching (0ms hit)
 * 2. In-flight request deduplication (prevents parallel identical queries)
 * 3. Graceful fallback on network timeout or HTTP 429
 *
 * @param {number} lat
 * @param {number} lng
 * @param {object} [opts]
 * @param {string} [opts.lang='en']
 * @param {AbortSignal} [opts.signal]
 * @param {number} [opts.timeoutMs=6000]
 * @param {(s:string)=>string} [opts.sanitize]
 * @param {string} [opts.describeFallback]
 * @param {Function} [opts.fetchFn] - customizable fetch for tests
 * @returns {Promise<{ name: string, address: object, settlement: string, displayName: string, coarse: object|null, fine: object|null, cached: boolean }>}
 */
export async function reverseGeocode(lat, lng, opts = {}) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    return {
      name: opts.describeFallback || '',
      address: {},
      settlement: '',
      displayName: opts.describeFallback || '',
      coarse: null,
      fine: null,
      cached: false,
    };
  }

  const lang = opts.lang || 'en';
  const key = getCacheKey(lat, lng, lang);

  // 1. Check Cache
  const cached = getGeocodeCache(lat, lng, lang);
  if (cached) {
    return { ...cached, cached: true };
  }

  // 2. Check In-Flight deduplication
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const fetchFn = opts.fetchFn || globalThis.fetch;
  const timeoutMs = opts.timeoutMs || 8000;

  const promise = (async () => {
    const urls = reverseUrls(lat, lng, lang);
    const controller = new AbortController();
    let timeoutId = null;

    if (opts.signal) {
      if (opts.signal.aborted) {
        controller.abort();
      } else {
        opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
    }

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    }

    const safeFetch = async (url) => {
      try {
        const res = await fetchFn(url, { signal: controller.signal });
        if (res && res.ok) {
          return await res.json();
        }
        // If throttled (HTTP 429), retry once after a short 400ms backoff
        if (res && res.status === 429 && !controller.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (!controller.signal.aborted) {
            const retryRes = await fetchFn(url, { signal: controller.signal });
            if (retryRes && retryRes.ok) {
              return await retryRes.json();
            }
          }
        }
      } catch (_) {}
      return null;
    };

    // Calculate safe terrestrial fallback if fallback string accidentally names an ocean on land
    const safeDescribeFallback = (() => {
      if (opts.describeFallback && isOceanName(opts.describeFallback) && isCoordinateOnLand(lat, lng)) {
        return formatCoordinates(lat, lng);
      }
      return opts.describeFallback;
    })();

    try {
      // Coarse first (zoom 14 gives settlement identity)
      const coarse = await safeFetch(urls.coarse);
      let fine = null;
      if (!controller.signal.aborted) {
        fine = await safeFetch(urls.fine);
      }

      if (timeoutId) clearTimeout(timeoutId);

      const labeled = labelFromReverse(coarse, fine, {
        sanitize: opts.sanitize,
        describeFallback: safeDescribeFallback,
        fallback: safeDescribeFallback,
      });

      let name = labeled.name;
      // Final guard: never return an ocean name if the coordinate is on land
      if (isOceanName(name) && isCoordinateOnLand(lat, lng)) {
        name = formatCoordinates(lat, lng);
      }

      let displayName = fine?.display_name || coarse?.display_name || name;
      if (isOceanName(displayName) && isCoordinateOnLand(lat, lng)) {
        displayName = name;
      }

      const result = {
        name,
        address: labeled.address || {},
        settlement: labeled.settlement || '',
        displayName,
        coarse: coarse || null,
        fine: fine || null,
        cached: false,
      };

      if (coarse || fine) {
        persistGeocodeCache(key, {
          name: result.name,
          address: result.address,
          settlement: result.settlement,
          displayName: result.displayName,
        }, lat, lng);
      }

      return result;
    } catch (_) {
      const fallbackLabel = safeDescribeFallback || formatCoordinates(lat, lng) || `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
      return {
        name: fallbackLabel,
        address: {},
        settlement: '',
        displayName: fallbackLabel,
        coarse: null,
        fine: null,
        cached: false,
      };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, promise);
  return promise;
}