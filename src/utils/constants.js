// src/utils/constants.js
// Centralized configuration — all magic numbers, API endpoints, storage keys

export const CONFIG = {
  // API
  FORECAST_URL: 'https://api.open-meteo.com/v1/forecast',
  GEOCODING_URL: 'https://geocoding-api.open-meteo.com/v1/search',
  PAST_DAYS: 3,
  FORECAST_DAYS: 7,

  // Cache
  REQUEST_CACHE_TTL: 30_000,
  MAX_CACHE_SIZE: 50,
  GEOCODING_CACHE_TTL: 300_000,

  // UI
  DEFAULT_RADAR_OPACITY: 0.55,
  MAX_TOASTS: 3,
  TOAST_DEDUP_COOLDOWN: 3_000,
  SEARCH_DEBOUNCE_MS: 300,
  MAP_CLICK_DEBOUNCE_MS: 500,
  AUDIO_RESUME_DELAY: 100,

  // Audio
  DEFAULT_VOLUME: 0.5,

  // Particles
  MAX_PARTICLES: {
    rain: 300,
    snow: 200,
    wind: 150,
    storm: 400,
  },

  // Comfort thresholds
  COMFORT: {
    TEMP_IDEAL_MIN: 18,
    TEMP_IDEAL_MAX: 26,
    HUMIDITY_IDEAL_MIN: 30,
    HUMIDITY_IDEAL_MAX: 60,
    WIND_IDEAL_MIN: 5,
    WIND_IDEAL_MAX: 25,
    UV_IDEAL_MAX: 5,
  },

  // Outdoor window criteria
  OUTDOOR: {
    TEMP_MIN: 14,
    TEMP_MAX: 32,
    PRECIP_MAX: 0.5,
    PRECIP_PROB_MAX: 40,
    WIND_MAX: 30,
    UV_MAX: 9,
    MIN_WINDOW_HOURS: 2,
  },

  // Storage keys
  STORAGE_KEYS: {
    BOOKMARKS: 'aurafisky_bookmarks',
    SEARCH_HISTORY: 'weathermap_search_history',
    TIMELINE_24H: 'aurafisky_timeline_24h',
    SHOW_BOOKMARKS_MAP: 'aurafisky_show_bookmarks_map',
    UNITS: 'aurafisky_units',
    THEME: 'aurafisky_theme',
    VOLUME: 'aurafisky_volume',
    TERMS_ACCEPTED: 'aurafisky_terms_accepted',
  },
};

// WMO Weather Codes (shared with weather service)
export const WMO_CODES = {
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

export const COMPASS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

// Toast colors (for ToastController)
export const TOAST_STYLES = {
  info:    { bg: 'bg-white dark:bg-slate-800 border-primary/20', icon: 'ℹ️' },
  error:   { bg: 'bg-white dark:bg-slate-800 border-red-400/30',   icon: '⚠️' },
  success: { bg: 'bg-white dark:bg-slate-800 border-emerald-400/30', icon: '✅' },
  warning: { bg: 'bg-white dark:bg-slate-800 border-amber-400/30', icon: '⚠️' },
};