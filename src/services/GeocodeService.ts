// src/services/GeocodeService.ts
import { GEOCODING_BASE_URL } from '../config/constants.js';
import { geocodeCache } from './CacheService.js';
import { log } from '../utils/logger.js';

export interface GeocodeResult {
  display_name: string;
  lat: number;
  lon: number;
  name: string;
  country: string;
  admin1: string;
}

const limiter = {
  tokens: 1,
  lastRefill: Date.now(),
  async acquire() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(1, this.tokens + elapsed);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens--;
      return;
    }
    await new Promise(r => setTimeout(r, (1 - this.tokens) * 1000));
    this.tokens = 0;
  }
};

export async function geocode(query: string): Promise<GeocodeResult[]> {
  const sanitized = query.trim().replace(/[<>\"&]/g, '').slice(0, 200);
  if (!sanitized) return [];

  return geocodeCache.getOrFetch(sanitized, async () => {
    await limiter.acquire();

    const url = `${GEOCODING_BASE_URL}?q=${encodeURIComponent(sanitized)}&format=json&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Aurafisky/18.0.0', 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`Geocode error: ${res.status}`);

    const data = await res.json();
    return data.map((r: any) => ({
      display_name: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      name: r.address?.city || r.address?.town || r.address?.village || r.address?.suburb || '',
      country: r.address?.country || '',
      admin1: r.address?.state || r.address?.province || '',
    }));
  });
}

export function destroyGeocodeService(): void {
  // Clear the rate limiter state
  limiter.tokens = 1;
  limiter.lastRefill = Date.now();
  // The cache is managed by CacheService which has its own destroy()
}