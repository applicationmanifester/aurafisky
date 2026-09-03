/**
 * Type definitions for UI state and events
 */

import type { WeatherData, HourlyWeather, DailyForecast, GeocodingResult, UnitSystem, ComfortAssessment, OutdoorWindow } from './weather.js';

/** Application theme */
export type Theme = 'light' | 'dark' | 'auto';

/** Map tile layer style */
export type MapStyle = 'light' | 'dark' | 'satellite' | 'terrain';

/** Particle effect type */
export type ParticleEffect = 'none' | 'rain' | 'snow' | 'wind' | 'storm';

/** Radar overlay state */
export interface RadarState {
  active: boolean;
  opacity: number;
  timestamp: string | null;
  playing: boolean;
  speed: number;
}

/** Search history entry */
export interface SearchHistoryEntry {
  query: string;
  lat: number;
  lng: number;
  name: string;
  timestamp: number;
}

/** Bookmark entry */
export interface Bookmark {
  id: string;
  name: string;
  lat: number;
  lng: number;
  addedAt: number;
  color?: string;
}

/** Toast notification */
export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration?: number;
  persistent?: boolean;
  action?: {
    label: string;
    handler: () => void;
  };
}

/** Timeline data point for charts */
export interface TimelinePoint {
  time: string;
  temperature: number;
  feelsLike: number;
  precipitation: number;
  precipProb: number;
  windSpeed: number;
  uvIndex: number;
  humidity: number;
  weatherCode: number;
}

/** Application state (reactive) */
export interface AppState {
  // Location
  selectedLat: number | null;
  selectedLng: number | null;
  selectedName: string | null;
  
  // Weather data
  weatherData: WeatherData | null;
  currentConditions: HourlyWeather | null;
  dailyForecasts: DailyForecast[];
  comfortAssessment: ComfortAssessment | null;
  outdoorWindows: OutdoorWindow[];
  
  // UI state
  isDark: boolean;
  theme: Theme;
  mapStyle: MapStyle;
  particleEffect: ParticleEffect;
  radarState: RadarState;
  
  // Units
  units: UnitSystem;
  
  // Search & bookmarks
  searchHistory: SearchHistoryEntry[];
  bookmarks: Bookmark[];
  showBookmarksOnMap: boolean;
  
  // Audio
  audioEnabled: boolean;
  volume: number;
  currentSoundscape: string | null;
  
  // Loading states
  isLoadingWeather: boolean;
  isLoadingSearch: boolean;
  error: string | null;
  
  // PWA
  updateAvailable: boolean;
  
  // Timestamps
  lastWeatherFetch: number | null;
}

/** Event types for EventBus */
export interface AppEvents {
  // Location events
  'location:select': { lat: number; lng: number; name: string };
  'location:changed': { lat: number; lng: number; name: string };
  'location:geolocate': void;
  
  // Weather events
  'weather:fetch': { lat: number; lng: number };
  'weather:loaded': { data: WeatherData };
  'weather:error': { error: Error };
  
  // UI events
  'theme:change': boolean; // isDark
  'map-style:change': MapStyle;
  'particles:type': ParticleEffect;
  'radar:toggle': boolean;
  'radar:opacity': number;
  'radar:play': boolean;
  'radar:speed': number;
  
  // Units
  'units:change': UnitSystem;
  
  // Search & bookmarks
  'search:query': string;
  'search:results': GeocodingResult[];
  'bookmark:add': Bookmark;
  'bookmark:remove': string; // id
  'bookmark:toggle-map': boolean;
  
  // Audio
  'audio:play': string; // soundscape name
  'audio:pause': void;
  'audio:volume': number;
  
  // Notifications
  'notification:show': Toast;
  'notification:hide': string; // toast id
  
  // PWA
  'pwa:update-available': void;
  
  // Errors
  'error': Error | string;
  
  // Lifecycle
  'app:ready': void;
  'app:destroy': void;
}

/** Map marker data */
export interface MapMarkerData {
  lat: number;
  lng: number;
  name?: string;
  weatherCode?: number;
  temperature?: number;
}

/** Panel view state */
export type PanelView = 'current' | 'hourly' | 'daily' | 'comfort' | 'radar' | 'settings' | 'bookmarks';

/** Timeline chart config */
export interface TimelineChartConfig {
  metric: 'temperature' | 'feelsLike' | 'precipitation' | 'precipProb' | 'windSpeed' | 'uvIndex' | 'humidity';
  hours: number; // 24, 48, 72, etc.
}