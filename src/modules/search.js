// src/modules/search.js
import { GEOCODING_BASE_URL } from '../config/constants.js';

export async function geocode(query) {
  const url = `${GEOCODING_BASE_URL}?q=${encodeURIComponent(query)}&format=json&limit=5`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocode error: ${res.status}`);
  const data = await res.json();
  return data.map((r) => ({
    display_name: r.display_name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
  }));
}
