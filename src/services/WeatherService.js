// src/services/WeatherService.js
import { OPEN_METEO_BASE_URL, CACHE_TTL_SECONDS } from '../config/constants.js';
import { cacheService } from './CacheService.js';

const cacheKey = (lat, lon) => `weather-${lat.toFixed(4)}-${lon.toFixed(4)}`;

export async function getForecast(lat, lon, units = 'celsius') {
  const key = cacheKey(lat, lon);
  const cached = cacheService.get(key);
  if (cached) return cached;

  const url = `${OPEN_METEO_BASE_URL}?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,weathercode,windgusts_10m,precipitation${units === 'fahrenheit' ? '&temperature_unit=fahrenheit' : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather API error: ${res.status}`);
  const data = await res.json();
  const result = {
    ...data.current_weather,
    hourly: data.hourly,
    units,
  };
  cacheService.set(key, result);
  return result;
}

export function toFahrenheit(celsius) {
  return celsius * 9 / 5 + 32;
}
export function toCelsius(fahrenheit) {
  return (fahrenheit - 32) * 5 / 9;
}
