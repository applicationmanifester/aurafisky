import { BaseService } from './BaseService.js';

/**
 * Weather Service - Handles all weather data fetching, transformation, and formatting
 * Extracted from the original weather.js module
 */
export class WeatherService extends BaseService {
  constructor(options = {}) {
    super();
    this.stateStore = options.stateStore;
    this.units = options.units || 'metric'; // 'metric' or 'imperial'
    this._requestCache = new Map();
    this._geocodingCache = new Map();
    this.REQUEST_CACHE_TTL = 30000; // 30 seconds
    this.MAX_CACHE_SIZE = 50;
    this.PAST_DAYS = 3;
    this.FORECAST_DAYS = 7;
    this.FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
    this.GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
  }

  // ── Public API ────────────────────────────────────────

  /**
   * Fetch weather data for given coordinates
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<Object>} Weather data
   */
  async fetchWeather(lat, lng) {
    const cacheKey = `weather_${lat}_${lng}_${this.units}`;
    return this._cachedFetch(
      cacheKey,
      () => this._fetchWeatherInternal(lat, lng),
      this.REQUEST_CACHE_TTL
    );
  }

  /**
   * Search for locations by query
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of location results
   */
  async searchLocations(query) {
    if (!query || query.length < 2) return [];
    const cacheKey = `geocode_${query}`;
    return this._cachedFetch(
      cacheKey,
      () => this._fetchGeocodingInternal(query),
      this.REQUEST_CACHE_TTL
    );
  }

  /**
   * Set measurement units
   * @param {string} units - Either 'metric' or 'imperial'
   * @returns {string} The units that were set
   */
  setUnits(units) {
    if (units !== 'metric' && units !== 'imperial') {
      throw new Error('Units must be either "metric" or "imperial"');
    }
    this.units = units;
    // Clear cache when units change
    this._requestCache.clear();
    this._geocodingCache.clear();
    return units;
  }

  /**
   * Get current measurement units
   * @returns {string} Current units ('metric' or 'imperial')
   */
  getUnits() {
    return this.units;
  }

  // ── Private Implementation ────────────────────────────────

  /**
   * Internal method to fetch weather from API
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<Object>} Raw weather data from API
   * @private
   */
  async _fetchWeatherInternal(lat, lng) {
    const params = {
      latitude: lat,
      longitude: lng,
      hourly:
        "temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,surface_pressure,cloud_cover,windspeed_10m,winddirection_10m",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_hours",
      past_days: this.PAST_DAYS,
      forecast_days: this.FORECAST_DAYS,
      timezone: "auto",
    };

    if (this.units === 'imperial') {
      params.temperature_unit = "fahrenheit";
      params.windspeed_unit = "mph";
      params.precipitation_unit = "inch";
    }

    const response = await fetch(`${this.FORECAST_URL}?${new URLSearchParams(params)}`);
    if (!response.ok) {
      throw new Error(`Weather API failed: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Internal method to fetch geocoding data from API
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of geocoding results
   * @private
   */
  async _fetchGeocodingInternal(query) {
    const params = {
      name: query,
      count: 5,
      language: "en",
      format: "json",
    };

    const response = await fetch(`${this.GEOCODING_URL}?${new URLSearchParams(params)}`);
    if (!response.ok) {
      throw new Error(`Geocoding API failed: ${response.status}`);
    }
    const data = await response.json();
    return data.results || [];
  }

  // ── Caching Helper ──────────────────────────────────────

  /**
   * Generate cache key
   * @param {string} key - Base key
   * @param {Object} options - Additional options
   * @returns {string} Cache key
   * @private
   */
  _cacheKey(key, options = {}) {
    return key + '|' + JSON.stringify(options);
  }

  /**
   * Cached fetch implementation
   * @param {string} key - Cache key base
   * @param {Function} fetchFn - Function that returns a promise for the data
   * @param {number} ttl - Time to live in milliseconds
   * @param {Object} options - Options for cache key generation
   * @returns {Promise<any>} Cached data
   * @private
   */
  async _cachedFetch(key, fetchFn, ttl, options = {}) {
    const cacheKey = this._cacheKey(key, options);
    const cached = this._requestCache.get(cacheKey);
    if (cached) {
      if (Date.now() - cached.ts < ttl) return cached.data;
      this._requestCache.delete(cacheKey);
    }

    // Store promise IMMEDIATELY so concurrent callers share it (fixes race condition)
    const promise = fetchFn().then(data => ({
      data,
      ts: Date.now()
    }));
    this._requestCache.set(cacheKey, promise);

    try {
      const result = await promise;
      return result.data;
    } finally {
      this._requestCache.delete(cacheKey);
    }
  }

  // ── Cache Management ────────────────────────────────────

  /**
   * Clear all caches
   */
  clearCache() {
    this._requestCache.clear();
    this._geocodingCache.clear();
  }

  /**
   * Get cache sizes
   * @returns {{request: number, geocoding: number}} Cache sizes
   */
  getCacheSize() {
    return {
      request: this._requestCache.size,
      geocoding: this._geocodingCache.size
    };
  }

  // ── Lifecycle ──────────────────────────────────────────

  /**
   * Clean up resources
   */
  destroy() {
    super.destroy();
    this.clearCache();
  }
}

// Note: The static WeatherService.setUnits from the original module
// is not replicated here as it's better practice to use instance methods.
// If static access is needed, consider implementing a singleton pattern.
