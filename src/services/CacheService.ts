// src/services/CacheService.ts
// Enhanced cache service with IndexedDB persistence for offline support

import localforage from 'localforage';

type CacheEntry<T> = {
  value: T;
  expiry: number;
  promise?: Promise<T>;
};

interface CacheOptions {
  maxEntries: number;
  defaultTtlMs: number;
  storeName?: string;
}

// Configure localforage for cache
localforage.config({
  name: 'aurafisky_cache',
  storeName: 'cache_entries',
});

export class CacheService<T = unknown> {
  #memoryStore = new Map<string, CacheEntry<T>>();
  #maxEntries: number;
  #defaultTtlMs: number;
  #storeName: string;
  #cleanupInterval: ReturnType<typeof setInterval> | null = null;
  #initialized = false;

  constructor({ maxEntries = 100, defaultTtlMs = 900_000, storeName = 'default' }: Partial<CacheOptions> = {}) {
    this.#maxEntries = maxEntries;
    this.#defaultTtlMs = defaultTtlMs;
    this.#storeName = storeName;
    this.#startCleanup();
  }

  async #ensureInitialized(): Promise<void> {
    if (this.#initialized) return;
    try {
      // Load from IndexedDB
      const keys = await localforage.keys();
      const cacheKeys = keys.filter(k => k.startsWith(`${this.#storeName}_`));
      for (const key of cacheKeys) {
        const entry = await localforage.getItem<CacheEntry<T>>(key);
        if (entry && entry.expiry > Date.now()) {
          this.#memoryStore.set(key.replace(`${this.#storeName}_`, ''), entry);
        }
      }
    } catch (err) {
      console.warn('Failed to load cache from IndexedDB', err);
    }
    this.#initialized = true;
  }

  #startCleanup() {
    this.#cleanupInterval = setInterval(() => this.#cleanupExpired(), 5 * 60 * 1000);
    if (typeof (this.#cleanupInterval as any).unref === 'function') {
      (this.#cleanupInterval as any).unref();
    }
  }

  #cleanupExpired() {
    const now = Date.now();
    for (const [key, entry] of this.#memoryStore) {
      if (entry.expiry <= now) {
        this.#memoryStore.delete(key);
        this.#deleteFromDisk(key).catch(() => {});
      }
    }
  }

  async getOrFetch(key: string, fetcher: () => Promise<T>, ttlMs?: number): Promise<T> {
    await this.#ensureInitialized();
    
    const now = Date.now();
    const existing = this.#memoryStore.get(key);
    if (existing?.expiry > now) {
      return existing.promise ?? Promise.resolve(existing.value);
    }
    if (existing) {
      this.#memoryStore.delete(key);
      await this.#deleteFromDisk(key).catch(() => {});
    }

    // Create a controlled promise wrapper to avoid race conditions
    let resolveRef: (v: T) => void;
    let rejectRef: (e: Error) => void;
    const controlledPromise = new Promise<T>((res, rej) => {
      resolveRef = res;
      rejectRef = rej;
    });

    this.#memoryStore.set(key, {
      value: undefined as any,
      expiry: now + (ttlMs ?? this.#defaultTtlMs),
      promise: controlledPromise
    });

    try {
      const value = await fetcher();
      await this.set(key, value, ttlMs);
      resolveRef!(value);
      return value;
    } catch (err) {
      this.#memoryStore.delete(key);
      await this.#deleteFromDisk(key).catch(() => {});
      rejectRef!(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async get(key: string): Promise<T | undefined> {
    await this.#ensureInitialized();
    
    const entry = this.#memoryStore.get(key);
    if (!entry || entry.expiry <= Date.now()) {
      this.#memoryStore.delete(key);
      await this.#deleteFromDisk(key).catch(() => {});
      return undefined;
    }
    return entry.value;
  }

  async set(key: string, value: T, ttlMs?: number): Promise<void> {
    await this.#ensureInitialized();
    
    if (this.#memoryStore.size >= this.#maxEntries) {
      const firstKey = this.#memoryStore.keys().next().value;
      if (firstKey) {
        this.#memoryStore.delete(firstKey);
        await this.#deleteFromDisk(firstKey).catch(() => {});
      }
    }
    
    const expiry = Date.now() + (ttlMs ?? this.#defaultTtlMs);
    this.#memoryStore.set(key, { value, expiry });
    await this.#saveToDisk(key, { value, expiry }).catch(() => {});
  }

  async delete(key: string): Promise<void> {
    this.#memoryStore.delete(key);
    await this.#deleteFromDisk(key).catch(() => {});
  }

  async clear(): Promise<void> {
    this.#memoryStore.clear();
    try {
      const keys = await localforage.keys();
      const cacheKeys = keys.filter(k => k.startsWith(`${this.#storeName}_`));
      await Promise.all(cacheKeys.map(k => localforage.removeItem(k)));
    } catch (err) {
      console.warn('Failed to clear cache', err);
    }
  }

  has(key: string): boolean {
    const entry = this.#memoryStore.get(key);
    return entry !== undefined && entry.expiry > Date.now();
  }

  get size(): number {
    return this.#memoryStore.size;
  }

  destroy(): void {
    if (this.#cleanupInterval) clearInterval(this.#cleanupInterval);
  }

  // IndexedDB helpers
  #saveToDisk(key: string, entry: CacheEntry<T>): Promise<void> {
    return localforage.setItem(`${this.#storeName}_${key}`, entry);
  }

  #deleteFromDisk(key: string): Promise<void> {
    return localforage.removeItem(`${this.#storeName}_${key}`);
  }

  // Export/Import for backup
  async exportCache(): Promise<string> {
    await this.#ensureInitialized();
    const data: Record<string, CacheEntry<T>> = {};
    for (const [key, entry] of this.#memoryStore.entries()) {
      data[key] = entry;
    }
    return JSON.stringify({ version: 1, storeName: this.#storeName, exportedAt: Date.now(), data }, null, 2);
  }

  async importCache(jsonString: string): Promise<void> {
    const parsed = JSON.parse(jsonString);
    for (const [key, entry] of Object.entries(parsed.data || {})) {
      if ((entry as CacheEntry<T>).expiry > Date.now()) {
        this.#memoryStore.set(key, entry as CacheEntry<T>);
        await this.#saveToDisk(key, entry as CacheEntry<T>).catch(() => {});
      }
    }
  }
}

export const weatherCache = new CacheService({ maxEntries: 100, defaultTtlMs: 15 * 60 * 1000, storeName: 'weather' });
export const geocodeCache = new CacheService({ maxEntries: 200, defaultTtlMs: 60 * 60 * 1000, storeName: 'geocode' });
export const radarCache = new CacheService({ maxEntries: 50, defaultTtlMs: 60 * 60 * 1000, storeName: 'radar' });
export const routingCache = new CacheService({ maxEntries: 50, defaultTtlMs: 60 * 60 * 1000, storeName: 'routing' });