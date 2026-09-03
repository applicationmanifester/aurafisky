// src/services/CacheService.js
import { CACHE_MAX_ENTRIES, CACHE_TTL_SECONDS } from '../config/constants.js';

class CacheService {
  constructor({ maxEntries = 100, ttlSeconds = 900 } = {}) {
    this.maxEntries = maxEntries;
    this.ttl = ttlSeconds * 1000;
    this.store = new Map(); // key -> { value, expiry }
  }

  _purge() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiry <= now) {
        this.store.delete(key);
      }
    }
    // LRU: keep size within maxEntries
    while (this.store.size > this.maxEntries) {
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }
  }

  get(key) {
    this._purge();
    const entry = this.store.get(key);
    if (!entry) return undefined;
    return entry.value;
  }

  set(key, value) {
    this._purge();
    const expiry = Date.now() + this.ttl;
    this.store.set(key, { value, expiry });
  }
}

export const cacheService = new CacheService({
  maxEntries: CACHE_MAX_ENTRIES,
  ttlSeconds: CACHE_TTL_SECONDS,
});
