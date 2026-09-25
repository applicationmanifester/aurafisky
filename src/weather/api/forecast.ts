/**
 * Forecast API functions - fetching weather, air quality, and historical data.
 */

import type { WeatherAPIResponse, HourlyWeather, DailyForecast, LocationResult } from '../types.js';
import { FORECAST_URL, GEOCODING_URL, AIR_QUALITY_URL, ARCHIVE_URL, PAST_DAYS, FORECAST_DAYS, HOURLY_PARAMS, DAILY_PARAMS, AIR_QUALITY_HOURLY_PARAMS } from '../constants.js';
import { forecastCache, geocodingCache, airQualityCache, historicalCache, createCacheKey } from './cache.js';
import { fetchJson, buildUrl } from './client.js';
import type { FetchOptions } from '../types.js';

/**
 * Round coordinate to 4 decimal places for cache key consistency.
 */
function roundCoord(v: number): string {
  return v.toFixed(4);
}

/**
 * Fetch complete weather forecast + history for a location.
 */
export async function fetchForecast(
  lat: number,
  lng: number,
  options: FetchOptions = {}
): Promise<WeatherAPIResponse> {
  const cacheKey = createCacheKey(FORECAST_URL, {
    latitude: roundCoord(lat),
    longitude: roundCoord(lng),
    past_days: PAST_DAYS,
    forecast_days: FORECAST_DAYS,
    timezone: 'auto',
  });

  return forecastCache.getOrFetch(cacheKey, async () => {
    const params = {
      latitude: roundCoord(lat),
      longitude: roundCoord(lng),
      hourly: HOURLY_PARAMS.join(','),
      daily: DAILY_PARAMS.join(','),
      timezone: 'auto',
      past_days: PAST_DAYS,
      forecast_days: FORECAST_DAYS,
    };

    const url = buildUrl(FORECAST_URL, params);
    const data = await fetchJson<WeatherAPIResponse>(url, options);

    if (!data.hourly?.time || !data.daily) {
      throw new Error('Unexpected API response format');
    }

    return data;
  });
}

/**
 * Fetch air quality data for a location.
 */
export async function fetchAirQuality(
  lat: number,
  lng: number,
  options: FetchOptions = {}
): Promise<WeatherAPIResponse | null> {
  const cacheKey = createCacheKey(AIR_QUALITY_URL, {
    latitude: roundCoord(lat),
    longitude: roundCoord(lng),
    past_days: PAST_DAYS,
    forecast_days: FORECAST_DAYS,
    timezone: 'auto',
  });

  try {
    return await airQualityCache.getOrFetch(cacheKey, async () => {
      const params = {
        latitude: roundCoord(lat),
        longitude: roundCoord(lng),
        hourly: AIR_QUALITY_HOURLY_PARAMS.join(','),
        timezone: 'auto',
        past_days: PAST_DAYS,
        forecast_days: FORECAST_DAYS,
      };

      const url = buildUrl(AIR_QUALITY_URL, params);
      return await fetchJson<WeatherAPIResponse>(url, options);
    });
  } catch {
    return null; // Air quality is optional
  }
}

/**
 * Fetch historical weather for a specific date.
 */
export async function fetchHistoricalWeather(
  lat: number,
  lng: number,
  dateStr: string,
  options: FetchOptions = {}
): Promise<WeatherAPIResponse> {
  const cacheKey = createCacheKey(ARCHIVE_URL, {
    latitude: roundCoord(lat),
    longitude: roundCoord(lng),
    start_date: dateStr,
    end_date: dateStr,
    timezone: 'auto',
  });

  return historicalCache.getOrFetch(cacheKey, async () => {
    const params = {
      latitude: roundCoord(lat),
      longitude: roundCoord(lng),
      start_date: dateStr,
      end_date: dateStr,
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
      timezone: 'auto',
    };

    const url = buildUrl(ARCHIVE_URL, params);
    const data = await fetchJson<WeatherAPIResponse>(url, options);

    if (!data.daily?.time) {
      throw new Error('Unexpected historical API response format');
    }

    return data;
  });
}

/**
 * Search for locations by name using Open-Meteo Geocoding.
 */
export async function searchLocations(
  query: string,
  options: FetchOptions = {}
): Promise<LocationResult[]> {
  if (!query || query.trim().length < 2) return [];

  const cacheKey = query.trim().toLowerCase();

  return geocodingCache.getOrFetch(cacheKey, async () => {
    const params = {
      name: query.trim(),
      count: 8,
      language: 'en',
      format: 'json',
    };

    const url = buildUrl(GEOCODING_URL, params);
    const data = await fetchJson<{ results?: Array<{
      name: string;
      country?: string;
      admin1?: string;
      latitude: number;
      longitude: number;
    }> }>(url, options);

    return (data.results || []).map((r) => ({
      name: r.name,
      country: r.country || '',
      admin1: r.admin1 || '',
      latitude: r.latitude,
      longitude: r.longitude,
      displayName: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    }));
  });
}