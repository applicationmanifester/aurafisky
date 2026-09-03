// src/config/constants.js

export const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
  // VAPID key for FCM
  vapidKey: "YOUR_VAPID_KEY",
};

export const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
export const GEOCODING_BASE_URL = "https://nominatim.openstreetmap.org/search";

export const MAP_DEFAULT_ZOOM = 13;
export const MAP_DEFAULT_COORDS = { lat: 37.7749, lon: -122.4194 }; // San Francisco

export const CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
export const CACHE_MAX_ENTRIES = 100;
