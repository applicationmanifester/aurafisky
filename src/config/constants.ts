// src/config/constants.ts

export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
} as const;

export const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';
export const GEOCODING_BASE_URL = 'https://nominatim.openstreetmap.org/search';

export const MAP_DEFAULT_ZOOM = 13;
export const MAP_DEFAULT_COORDS = { lat: 37.7749, lon: -122.4194 };

export const CACHE_TTL_SECONDS = 15 * 60;
export const CACHE_MAX_ENTRIES = 100;

export const FREE_LIMITS = {
  bookmarks: 3,
  alerts: 3,
  forecastDays: 7,
  historyDays: 30,
} as const;

export const PRO_LIMITS = {
  bookmarks: Infinity,
  alerts: Infinity,
  forecastDays: 30,
  historyDays: Infinity,
} as const;

export const FEATURES = {
  UNLIMITED_BOOKMARKS: 'unlimitedBookmarks',
  UNLIMITED_ALERTS: 'unlimitedAlerts',
  EXTENDED_FORECAST: 'extendedForecast',
  UNLIMITED_HISTORY: 'unlimitedHistory',
  CSV_EXPORT: 'csvExport',
  WIDGETS: 'widgets',
  API_ACCESS: 'apiAccess',
  NO_ADS: 'noAds',
  TEAM_SHARING: 'teamSharing',
  ADVANCED_INSIGHTS: 'advancedInsights',
} as const;

export const ALERT_TYPES = {
  THRESHOLD: 'threshold',
  DAILY_BRIEFING: 'daily_briefing',
  SEVERE_WEATHER: 'severe_weather',
} as const;

export const THRESHOLD_FIELDS = {
  temperature: { label: 'Temperature', unit: '°C', min: -50, max: 50 },
  precipitation_probability: { label: 'Rain Chance', unit: '%', min: 0, max: 100 },
  wind_speed: { label: 'Wind Speed', unit: 'km/h', min: 0, max: 150 },
  uv_index: { label: 'UV Index', unit: '', min: 0, max: 11 },
  aqi: { label: 'Air Quality (AQI)', unit: '', min: 0, max: 500 },
} as const;

export const SYNC_STATUS = {
  SYNCED: 'synced',
  SYNCING: 'syncing',
  OFFLINE: 'offline',
  ERROR: 'error',
} as const;