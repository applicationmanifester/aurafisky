import localforage from "localforage";

/**
 * Aurafisky v19.0.0 Master Specification IndexedDB Persistence Layer
 * Database: aurafisky_store_v19
 * Stores:
 *   - forecasts_v1: keyed by rounded lat_lon to 2 decimal places { payload, fetchedAt, etag }
 *   - geocode_lru: stores the last 100 resolved place names/queries { results, ts }
 */

export const forecastStore = localforage.createInstance({
  name: "aurafisky_store_v19",
  storeName: "forecasts_v1",
  description: "Aurafisky v19 cached weather forecasts with ETag and timestamp",
});

export const geocodeStore = localforage.createInstance({
  name: "aurafisky_store_v19",
  storeName: "geocode_lru",
  description: "Aurafisky v19 LRU geocoding cache",
});

/**
 * Normalizes latitude and longitude to a consistent 2-decimal key: e.g. "12.81_78.29"
 */
export function getForecastKey(lat, lng) {
  const rLat = Number(lat).toFixed(2);
  const rLng = Number(lng).toFixed(2);
  return `${rLat}_${rLng}`;
}

/**
 * Saves forecast payload into forecasts_v1 store with fetchedAt timestamp and etag
 */
export async function saveCachedForecast(lat, lng, payload, etag = null) {
  try {
    const key = getForecastKey(lat, lng);
    await forecastStore.setItem(key, {
      payload,
      fetchedAt: Date.now(),
      etag,
    });
  } catch (err) {
    console.warn("saveCachedForecast failed:", err);
  }
}

/**
 * Reads cached forecast from forecasts_v1 store
 */
export async function getCachedForecast(lat, lng) {
  try {
    const key = getForecastKey(lat, lng);
    return await forecastStore.getItem(key);
  } catch (err) {
    console.warn("getCachedForecast failed:", err);
    return null;
  }
}

/**
 * Saves a query and its results to geocode_lru store, maintaining max 100 entries.
 */
export async function saveGeocodeLRU(query, results) {
  try {
    const key = String(query).trim().toLowerCase();
    if (!key || !Array.isArray(results) || results.length === 0) return;
    await geocodeStore.setItem(key, {
      results,
      ts: Date.now(),
    });
    // Prune LRU if item count exceeds 100
    const keys = await geocodeStore.keys();
    if (keys.length > 100) {
      const entries = await Promise.all(
        keys.map(async (k) => ({ k, item: await geocodeStore.getItem(k) }))
      );
      entries.sort((a, b) => (a.item?.ts || 0) - (b.item?.ts || 0));
      const excess = entries.slice(0, entries.length - 100);
      await Promise.all(excess.map((e) => geocodeStore.removeItem(e.k)));
    }
  } catch (err) {
    console.warn("saveGeocodeLRU failed:", err);
  }
}

/**
 * Reads geocoding result from geocode_lru
 */
export async function getGeocodeLRU(query) {
  try {
    const key = String(query).trim().toLowerCase();
    if (!key) return null;
    const entry = await geocodeStore.getItem(key);
    return entry?.results || null;
  } catch (err) {
    return null;
  }
}

