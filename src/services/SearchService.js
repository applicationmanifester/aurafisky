// src/services/SearchService.js
import { geocode } from './WeatherService.js';

/**
 * SearchService provides a thin wrapper around the geocoding API to
 * support UI search operations. It returns an array of suggestion objects
 * suitable for populating a dropdown.
 */
export async function search(query) {
  if (!query.trim()) return [];
  // Re‑use the geocode helper (which already implements caching).
  const results = await geocode(query);
  // The Nominatim API returns an array of objects; map them to a simpler shape.
  return results.map((r) => ({
    display_name: r.display_name,
    lat: r.lat,
    lon: r.lon,
  }));
}
