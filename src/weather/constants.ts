/**
 * Constants for the Weather Service.
 * Centralizes magic numbers, WMO codes, compass directions, and configuration.
 */

import type { UnitSystem } from './types.js';

/** API Configuration */
export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
export const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
export const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';

/** Forecast window */
export const PAST_DAYS = 3;
export const FORECAST_DAYS = 7;

/** Cache Configuration */
export const REQUEST_CACHE_TTL = 30_000; // 30 seconds
export const MAX_CACHE_SIZE = 50;
export const GEOCODING_CACHE_TTL = 300_000; // 5 minutes

/** Unit System */
export let currentUnits: UnitSystem = 'metric';

export function setUnits(units: UnitSystem): void {
  currentUnits = units;
}

export function getUnits(): UnitSystem {
  return currentUnits;
}

/** WMO Weather Code Mapping (4677) */
export const WMO_CODES: Record<number, { description: string; dayIcon: string; nightIcon: string }> = {
  0: { description: 'Clear sky', dayIcon: '☀️', nightIcon: '🌙' },
  1: { description: 'Mainly clear', dayIcon: '🌤️', nightIcon: '🌙' },
  2: { description: 'Partly cloudy', dayIcon: '⛅', nightIcon: '☁️' },
  3: { description: 'Overcast', dayIcon: '☁️', nightIcon: '☁️' },
  45: { description: 'Foggy', dayIcon: '🌫️', nightIcon: '🌫️' },
  48: { description: 'Depositing rime fog', dayIcon: '🌫️', nightIcon: '🌫️' },
  51: { description: 'Light drizzle', dayIcon: '🌦️', nightIcon: '🌧️' },
  53: { description: 'Moderate drizzle', dayIcon: '🌦️', nightIcon: '🌧️' },
  55: { description: 'Dense drizzle', dayIcon: '🌧️', nightIcon: '🌧️' },
  56: { description: 'Light freezing drizzle', dayIcon: '🌧️', nightIcon: '🌧️' },
  57: { description: 'Dense freezing drizzle', dayIcon: '🌧️', nightIcon: '🌧️' },
  61: { description: 'Slight rain', dayIcon: '🌦️', nightIcon: '🌧️' },
  63: { description: 'Moderate rain', dayIcon: '🌧️', nightIcon: '🌧️' },
  65: { description: 'Heavy rain', dayIcon: '🌧️', nightIcon: '🌧️' },
  66: { description: 'Light freezing rain', dayIcon: '🌧️', nightIcon: '🌧️' },
  67: { description: 'Heavy freezing rain', dayIcon: '🌧️', nightIcon: '🌧️' },
  71: { description: 'Slight snowfall', dayIcon: '🌨️', nightIcon: '🌨️' },
  73: { description: 'Moderate snowfall', dayIcon: '🌨️', nightIcon: '🌨️' },
  75: { description: 'Heavy snowfall', dayIcon: '❄️', nightIcon: '❄️' },
  77: { description: 'Snow grains', dayIcon: '❄️', nightIcon: '❄️' },
  80: { description: 'Slight rain showers', dayIcon: '🌦️', nightIcon: '🌧️' },
  81: { description: 'Moderate rain showers', dayIcon: '🌧️', nightIcon: '🌧️' },
  82: { description: 'Violent rain showers', dayIcon: '⛈️', nightIcon: '⛈️' },
  85: { description: 'Slight snow showers', dayIcon: '🌨️', nightIcon: '🌨️' },
  86: { description: 'Heavy snow showers', dayIcon: '❄️', nightIcon: '❄️' },
  95: { description: 'Thunderstorm', dayIcon: '⛈️', nightIcon: '⛈️' },
  96: { description: 'Thunderstorm with slight hail', dayIcon: '⛈️', nightIcon: '⛈️' },
  99: { description: 'Thunderstorm with heavy hail', dayIcon: '⛈️', nightIcon: '⛈️' },
};

/** Compass Directions (16-point) */
export const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const;

/** Hourly parameters to request from API */
export const HOURLY_PARAMS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation_probability',
  'precipitation',
  'weather_code',
  'cloud_cover',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'uv_index',
  'pressure_msl',
  'visibility',
  'is_day',
] as const;

/** Daily parameters to request from API */
export const DAILY_PARAMS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'sunrise',
  'sunset',
  'uv_index_max',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
] as const;

/** Air quality hourly parameters */
export const AIR_QUALITY_HOURLY_PARAMS = [
  'pm2_5',
  'pm10',
  'ozone',
  'us_aqi',
  'birch_pollen',
  'grass_pollen',
  'mugwort_pollen',
  'alder_pollen',
] as const;

/** Thresholds for weather classification */
export const THRESHOLDS = {
  /** Pressure tendency (hPa/hr) */
  PRESSURE_RISING: 0.3,
  PRESSURE_FALLING: -0.3,

  /** Wind shift (degrees) */
  WIND_SHIFT_SIGNIFICANT: 45,

  /** Comfort index weights */
  COMFORT: {
    TEMP_IDEAL_MIN: 18,
    TEMP_IDEAL_MAX: 26,
    TEMP_EXTREME_COLD: 0,
    TEMP_EXTREME_HOT: 35,
    HUMIDITY_IDEAL_MIN: 30,
    HUMIDITY_IDEAL_MAX: 60,
    HUMIDITY_HIGH: 85,
    WIND_IDEAL_MIN: 5,
    WIND_IDEAL_MAX: 25,
    WIND_HIGH: 40,
    UV_IDEAL_MAX: 5,
    CLOUD_IDEAL_MAX: 50,
    AQI_IDEAL_MAX: 50,
    AQI_HIGH: 150,
  },

  /** Outdoor window criteria */
  OUTDOOR: {
    TEMP_MIN: 14,
    TEMP_MAX: 32,
    PRECIP_MAX: 0.5,
    PRECIP_PROB_MAX: 40,
    WIND_MAX: 30,
    UV_MAX: 9,
    MIN_HOURS: 2,
  },

  /** Advisory thresholds */
  ADVISORY: {
    HEAT: 35,
    FROST: 2,
    EXTREME_COLD_CHILL: -45,
    SEVERE_COLD_CHILL: -30,
    WIND_CHILL_ADVISORY: -15,
    HIGH_WIND: 40,
    HEAVY_RAIN: 5,
    AQI_UNHEALTHY: 101,
    AQI_VERY_UNHEALTHY: 200,
    AQI_HAZARDOUS: 300,
  },

  /** Stargazing weights */
  STARGAZING: {
    CLOUD_WEIGHT: 0.9,
    MOON_WEIGHT: 30,
  },

  /** Diurnal bias minimum samples per hour */
  DIURNAL_MIN_SAMPLES: 3,

  /** Freshness thresholds (minutes) */
  FRESHNESS: {
    JUST_NOW: 5,
    MINUTES: 30,
    HOURS: 120,
    DAYS: 1440,
  },

  /** Anomaly detection */
  ANOMALY: {
    MIN_DIFF: 2,
    SIGNIFICANT: 3,
    EXTREME: 5,
  },

  /** Analog day matching */
  ANALOG: {
    MAX_SCORE: 30,
    TEMP_WEIGHT: 1,
    CODE_MISMATCH_PENALTY: 20,
  },

  /** Upwind calculation */
  UPWIND: {
    KM_PER_DEGREE: 111.32,
    DEFAULT_WIND_SPEED: 20, // km/h
  },
} as const;

/** Default values for missing data */
export const DEFAULTS = {
  TEMPERATURE: null,
  HUMIDITY: null,
  WIND_SPEED: null,
  PRESSURE: 1013.25,
  VISIBILITY: 10000,
  UV_INDEX: 0,
  CLOUD_COVER: 0,
  PRECIPITATION: 0,
  PRECIP_PROBABILITY: 0,
  WEATHER_CODE: 0,
} as const;

/** Model source attribution */
export const MODEL_SOURCE = 'ECMWF + GFS blended';

/** Weather code helpers — co-located with constants to avoid circular deps */
export function isRainCode(code: number): boolean {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
}

export function isSnowCode(code: number): boolean {
  return (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
}

export function isStormCode(code: number): boolean {
  return code >= 95 && code <= 99;
}