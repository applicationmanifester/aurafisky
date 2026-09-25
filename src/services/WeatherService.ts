// src/services/WeatherService.ts
import { OPEN_METEO_BASE_URL } from '../config/constants.js';
import { weatherCache } from './CacheService.js';
import { log } from '../utils/logger.js';

export interface WeatherData {
  current_weather: {
    temperature: number;
    windspeed: number;
    winddirection: number;
    weathercode: number;
    time: string;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
    uv_index?: number[];
    relativehumidity_2m?: number[];
  };
  units: 'celsius' | 'fahrenheit';
}

export interface ForecastOptions {
  hourly?: string[];
  units?: 'celsius' | 'fahrenheit';
}

const inflightRequests = new Map<string, AbortController>();

function cacheKey(lat: number, lon: number, units: string): string {
  return `weather-${lat.toFixed(4)}-${lon.toFixed(4)}-${units}`;
}

export async function getForecast(
  lat: number,
  lon: number,
  options: ForecastOptions = {}
): Promise<WeatherData> {
  const { units = 'celsius', hourly = ['temperature_2m', 'precipitation_probability', 'wind_speed_10m', 'uv_index', 'relativehumidity_2m'] } = options;
  const key = cacheKey(lat, lon, units);

  return weatherCache.getOrFetch(key, async () => {
    const controller = new AbortController();
    inflightRequests.set(key, controller);

    try {
      const params = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        current_weather: 'true',
        hourly: hourly.join(','),
        timezone: 'auto',
        ...(units === 'fahrenheit' && { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch' }),
      });

      const res = await fetch(`${OPEN_METEO_BASE_URL}?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
      const data = await res.json();

      return {
        current_weather: data.current_weather,
        hourly: data.hourly,
        units,
      };
    } finally {
      inflightRequests.delete(key);
    }
  });
}

export function cancelForecast(lat: number, lon: number, units = 'celsius'): void {
  const key = cacheKey(lat, lon, units);
  const controller = inflightRequests.get(key);
  if (controller) {
    controller.abort();
    inflightRequests.delete(key);
  }
}

export function cancelAllForecasts(): void {
  for (const controller of inflightRequests.values()) controller.abort();
  inflightRequests.clear();
}

export function toFahrenheit(celsius: number): number { return celsius * 9 / 5 + 32; }
export function toCelsius(fahrenheit: number): number { return (fahrenheit - 32) * 5 / 9; }

// Re-export for backward compatibility
export const weatherService = {
  getForecast,
  cancelAllForecasts,
  cancelForecast,
  toFahrenheit,
  toCelsius,
};