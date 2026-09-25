/**
 * Fixed memoization cache with proper promise handling.
 * Resolves the race condition in the original _cachedFetch.
 */

import type { CacheEntry } from '../types.js';
import { MAX_CACHE_SIZE, REQUEST_CACHE_TTL } from '../constants.js';

/**
 * LRU cache with TTL support.
 * Separates pending promises from resolved data to avoid race conditions.
 */
export class AsyncCache<T> {
  private resolved = new Map<string, CacheEntry<T>>();
  private pending = new Map<string, Promise<T>>();
  private readonly ttl: number;
  private readonly maxSize: number;

  constructor(ttl = REQUEST_CACHE_TTL, maxSize = MAX_CACHE_SIZE) {
    this.ttl = ttl;
    this.maxSize = maxSize;
  }

  /**
   * Get cached value or fetch using the provided factory.
   * Deduplicates concurrent requests for the same key.
   */
  async getOrFetch(key: string, factory: () => Promise<T>): Promise<T> {
    // 1. Check resolved cache first
    const cached = this.resolved.get(key);
    if (cached && Date.now() - cached.ts < this.ttl) {
      return cached.data;
    }
    if (cached) {
      this.resolved.delete(key); // Expired
    }

    // 2. Check if a request is already in flight
    const pending = this.pending.get(key);
    if (pending) {
      return pending;
    }

    // 3. Start new request
    const promise = this.executeFactory(key, factory);
    this.pending.set(key, promise);

    try {
      const data = await promise;
      return data;
    } finally {
      this.pending.delete(key);
    }
  }

  private async executeFactory(key: string, factory: () => Promise<T>): Promise<T> {
    try {
      const data = await factory();
      this.setResolved(key, data);
      return data;
    } catch (err) {
      this.pending.delete(key);
      throw err;
    }
  }

  /** Store resolved data in cache with LRU eviction */
  private setResolved(key: string, data: T): void {
    if (this.resolved.size >= this.maxSize) {
      const oldestKey = this.resolved.keys().next().value;
      if (oldestKey) this.resolved.delete(oldestKey);
    }
    this.resolved.set(key, { data, ts: Date.now() });
  }

  /** Manually set a value in the cache */
  set(key: string, data: T): void {
    this.setResolved(key, data);
  }

  /** Get cached value without fetching (returns undefined if missing/expired) */
  get(key: string): T | undefined {
    const cached = this.resolved.get(key);
    if (cached && Date.now() - cached.ts < this.ttl) {
      return cached.data;
    }
    if (cached) this.resolved.delete(key);
    return undefined;
  }

  /** Check if a key has a valid cached value */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /** Delete a specific key */
  delete(key: string): boolean {
    this.pending.delete(key);
    return this.resolved.delete(key);
  }

  /** Clear all caches */
  clear(): void {
    this.resolved.clear();
    this.pending.clear();
  }

  /** Get cache statistics */
  getStats(): { resolved: number; pending: number } {
    return {
      resolved: this.resolved.size,
      pending: this.pending.size,
    };
  }
}

/**
 * Creates a cache key from URL and options object.
 * Uses deterministic JSON serialization for options.
 */
export function createCacheKey(url: string, options: Record<string, unknown> = {}): string {
  return url + '|' + JSON.stringify(options, Object.keys(options).sort());
}

/** Global cache instances */
export const forecastCache = new AsyncCache<unknown>(REQUEST_CACHE_TTL, MAX_CACHE_SIZE);
export const geocodingCache = new AsyncCache<unknown>(300_000, 50); // 5 min TTL, smaller size
export const airQualityCache = new AsyncCache<unknown>(REQUEST_CACHE_TTL, MAX_CACHE_SIZE);
export const historicalCache = new AsyncCache<unknown>(REQUEST_CACHE_TTL, MAX_CACHE_SIZE);

/** Clear all caches (useful for testing) */
export function clearAllCaches(): void {
  forecastCache.clear();
  geocodingCache.clear();
  airQualityCache.clear();
  historicalCache.clear();
}