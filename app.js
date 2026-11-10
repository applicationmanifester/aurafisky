/*
 * ============================================================
 * Aurafisky Application — app.js (OpenLayers + Immersive Features)
 * ============================================================
 * Main application controller. Handles:
 *   - OpenLayers vector-tile map initialization & theme-adaptive basemap
 *   - Live RainViewer animated overlays (Weather Radar & Satellite Clouds)
 *   - Map Canvas Weather Particle overlays (Rain, Snow, Wind, Storm effects)
 *   - 24-Hour Dual-Axis SVG Forecast Charts (Temp curves + Precip probability bars)
 *   - Air Quality Index (AQI) ratings fetched from Open-Meteo Air Quality API
 *   - Split-view Cities Comparison panels (inspect side-by-side weather metrics)
 *   - Programmatic Ambient Audio Synthesizer (Web Audio API weather soundscapes)
 *   - Persistent Bookmark Favorites drawer with Flag emoji indicators
 *   - Dynamic panel weather condition gradients & wind compass needle
 *   - Geolocation & user notification toasts
 *   - PWA service worker offline caching registries
 *
 * Dependencies: weather.js (WeatherService module)
 * ============================================================
 */

import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "@fontsource/inter/latin-ext-400.css";
import "ol/ol.css";

// OpenLayers: renders vector tiles via Canvas 2D, not WebGL — chosen over
// MapLibre GL specifically because it doesn't depend on GPU-accelerated
// WebGL being available (see modules/map-language.js for why real language
// switching needs vector tiles at all rather than raster ones).
import OlMap from "ol/Map.js";
import View from "ol/View.js";
import LayerGroup from "ol/layer/Group.js";
import TileLayer from "ol/layer/Tile.js";
import XYZ from "ol/source/XYZ.js";
import { defaults as defaultInteractions } from "ol/interaction/defaults.js";
import DragRotate from "ol/interaction/DragRotate.js";
import { altKeyOnly } from "ol/events/condition.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { apply as applyMapboxStyle, applyStyle as applyMapboxLayerStyle, getLayers as getMapboxLayers } from "ol-mapbox-style";
import { HtmlMarker } from "./modules/ol-marker.js";
import { localizeGlStyle } from "./modules/map-language.js";
import {
  formatPlaceName,
  shortPlaceName,
  mediumPlaceName,
  breakdownAddress,
  formatCoordinates,
  formatCoordinateAccuracy,
  haversineMeters,
  describeProximity,
  describeCoordinates,
  isCoordinateOnLand,
  isOceanName,
} from "./modules/geo.js";
import { reverseUrls, labelFromReverse, reverseGeocode } from "./modules/reverseGeocode.js";
import { applyViewportHeight, watchViewport } from "./modules/viewport.js";
import { t, detectLocale, setLocale, supportedLocales, translateText, translateDOM, refreshExternalTranslation } from "./modules/i18n.js";
import { isMobileLayout } from "./features/breakpoints.js";
import localforage from "localforage";
import DOMPurify from "dompurify";
import {
  forecastStore,
  geocodeStore,
  getCachedForecast,
  saveCachedForecast,
  getGeocodeLRU,
  saveGeocodeLRU,
} from "./modules/storage.js";

localforage.config({
  name: "aurafisky",
  storeName: "aurafisky_store",
  description: "Aurafisky bookmarks, settings, and cached weather data",
});

if (typeof window !== "undefined") {
  if (!window.localforage) window.localforage = localforage;
  if (!window.DOMPurify) window.DOMPurify = DOMPurify;
  window.storageService = {
    forecastStore,
    geocodeStore,
    getCachedForecast,
    saveCachedForecast,
    getGeocodeLRU,
    saveGeocodeLRU,
  };
}

import './weather.js';
import './modules/dom-utils.js';
import './modules/toast.js';
import './src/icons.js';
import { initFeatures } from './features/registry.js';
import { initWebVitals } from './features/analytics.js';
import { init as initErrorHandler } from './features/errorHandler.js';
import { HapticEngine } from './modules/haptics.js';
import { SpringScrubber, buildSparklinePillSvg } from './modules/timeline-physics.js';
import { wakeLockManager } from './modules/wake-lock.js';

// Wallpaper backgrounds are generated procedurally on a canvas by
// features/wallpaper.js rather than pulled from a stock-photo CDN. That
// keeps the wallpaper working offline, stops leaking visitor IPs to a third
// party, and lets the PNG export reuse the exact same renderer so the saved
// image matches the screen.



/**
 * Soft gradient used behind the weather panel, keyed off the WMO code.
 * A gradient rather than a photograph: it must paint before any network
 * response arrives, and it keeps the panel on the same offline-first,
 * no-third-party footing as the wallpaper.
 */
function weatherPanelGradient(code, isDay) {
  let pair;
  if (code >= 95) pair = ["#312e81", "#0f172a"];
  else if (code >= 71 && code <= 77) pair = ["#e2e8f0", "#94a3b8"];
  else if (code >= 85) pair = ["#e2e8f0", "#94a3b8"];
  else if (code >= 51 && code <= 67) pair = ["#1e3a8a", "#0f172a"];
  else if (code >= 80 && code <= 82) pair = ["#1e3a8a", "#0f172a"];
  else if (code === 45 || code === 48) pair = ["#64748b", "#94a3b8"];
  else if (code === 2 || code === 3) pair = isDay ? ["#7dd3fc", "#e2e8f0"] : ["#1e293b", "#0f172a"];
  else pair = isDay ? ["#fbbf24", "#7dd3fc"] : ["#1e293b", "#020617"];
  return `linear-gradient(135deg, ${pair[0]} 0%, ${pair[1]} 100%)`;
}

/**
 * Curated popular destinations shown in the search dropdown when the
 * user focuses the (empty) field and has no search history yet.
 * Instant access with zero network — coordinates are well-known.
 */
const POPULAR_LOCATIONS = [
  { name: "New York", admin1: "New York", country: "United States", countryCode: "US", latitude: 40.7128, longitude: -74.006, population: 8808000, featureCode: "PPL", displayName: "New York, New York, United States" },
  { name: "London", admin1: "England", country: "United Kingdom", countryCode: "GB", latitude: 51.5072, longitude: -0.1276, population: 8908000, featureCode: "PPLC", displayName: "London, England, United Kingdom" },
  { name: "Tokyo", admin1: "Tokyo", country: "Japan", countryCode: "JP", latitude: 35.6895, longitude: 139.6917, population: 14047000, featureCode: "PPLC", displayName: "Tokyo, Tokyo, Japan" },
  { name: "Paris", admin1: "Île-de-France", country: "France", countryCode: "FR", latitude: 48.8566, longitude: 2.3522, population: 2161000, featureCode: "PPLC", displayName: "Paris, Île-de-France, France" },
  { name: "Dubai", admin1: "Dubai", country: "United Arab Emirates", countryCode: "AE", latitude: 25.2048, longitude: 55.2708, population: 3478000, featureCode: "PPLC", displayName: "Dubai, Dubai, United Arab Emirates" },
  { name: "Singapore", admin1: "", country: "Singapore", countryCode: "SG", latitude: 1.3521, longitude: 103.8198, population: 5686000, featureCode: "PPLC", displayName: "Singapore, Singapore" },
  { name: "Sydney", admin1: "New South Wales", country: "Australia", countryCode: "AU", latitude: -33.8688, longitude: 151.2093, population: 5312000, featureCode: "PPL", displayName: "Sydney, New South Wales, Australia" },
  { name: "Mumbai", admin1: "Maharashtra", country: "India", countryCode: "IN", latitude: 19.076, longitude: 72.8777, population: 12440000, featureCode: "PPL", displayName: "Mumbai, Maharashtra, India" },
];

/**
 * localStorage keys this app owns, beyond the weathermap_cache_* family.
 * Used by "Clear local cache" so the button's promise is true.
 */
const LOCAL_DATA_KEYS = new Set([
  "last_weather_notification_time",
  "aurafisky_theme",
  "aurafisky_wallpaper",
  "aurafisky_wallpaper_photo",
  "aurafisky_saved_routes",
  "aurafisky_alert_rules",
  "aurafisky_alert_fired",
  "aurafisky_terminator",
  "aurafisky_map_style",
  "aurafisky_map_layers_minimized",
  "aurafisky_show_bookmarks_map",
  "aurafisky_dismiss_install_banner",
  "aurafisky_desktop_panel_pos",
  "aurafisky_timeline_24h",
  "aurafisky_tv_hint_dismissed",
  "mapLanguage",
  "weathermap_search_history",
]);

class AurafiskyApp {
  // Helper to set innerHTML safely using DOMPurify
  setSafeHTML(el, html) {
    if (!el) return;
    if (typeof DOMPurify !== "undefined" && DOMPurify.sanitize) {
      el.innerHTML = DOMPurify.sanitize(html);
    } else {
      el.textContent = html.replace(/<[^>]*>/g, "");
    }
  }
  constructor() {
    // ── Firebase Configuration & State ────────────────────────
    this.firebaseConfig = {
      projectId: "aurafisky",
      appId: "1:206842187982:web:994268ad1fa6290b45409f",
      storageBucket: "aurafisky.firebasestorage.app",
      // Injected at build time from VITE_FIREBASE_API_KEY (see vite.config.js
      // `define` + .env.example)
      apiKey: typeof __FIREBASE_API_KEY__ !== "undefined" ? __FIREBASE_API_KEY__ : "",
      authDomain: "aurafisky.firebaseapp.com",
      messagingSenderId: "206842187982",
      // Web Push VAPID key from Firebase Console → Project Settings → Cloud Messaging.
      // Injected at build time from VITE_FCM_VAPID_KEY.
      vapidKey: typeof __FCM_VAPID_KEY__ !== "undefined" ? __FCM_VAPID_KEY__ : "",
      measurementId: "G-1GLZ5WT63W",
    };
    this.fcmToken = null;
    this._fb = null; // Firebase modules (lazy-loaded)
    this.user = null;
    this.syncHistory = true;
    this.defaultLocation = null;
    this.defaultLocationNotify = false;
    this.notifyIntervalMin = 60; // user-configurable notification interval (minutes)
    this.hourlyNotificationTimer = null;

    // ── State ──────────────────────────────────────────────────
    this.map = null; // OpenLayers map instance
    this.marker = null; // HtmlMarker instance (see modules/ol-marker.js)
    this._mapClickDebounce = false; // Debounce guard for rapid map clicks
    this._timelineRAF = null; // RequestAnimationFrame cache for timeline

    // Datasets
    this.weatherData = null; // Forecast dataset
    this.airQualityData = null; // Air quality dataset
    this.currentHourIndex = 0; // Index into hourly arrays
    this.selectedLat = null; // Last selected latitude
    this.selectedLng = null; // Last selected longitude
    this.selectedName = ""; // Last selected location name
    this._pendingLocation = null; // Location requested while a fetch was in flight

    // UI States
    this.isDark = false; // Dark mode state
    this.searchDebounceTimer = null; // Debounce timer for search

    // Bookmarks List
    this.bookmarks = []; // Saved locations {name, lat, lng}
    this.searchHistory = this._loadSearchHistory();

    // Radar/Satellite Sequence State
    this.radarActive = false; // Weather overlay state
    this.radarLayers = []; // Array of Leaflet tile layers
    this.radarTimestamps = []; // RainViewer timestamps
    this.radarIndex = 0; // Current radar layer index
    this.radarTimer = null; // Animation loop timer
    this.radarPlaying = false; // Radar playing status
    this.overlayType = "radar"; // 'radar' or 'satellite'
    this.radarOpacity = 0.55; // Current overlay opacity

    // Terms & Conditions (local + cloud synced)
    this.termsAccepted =
      typeof localStorage !== "undefined" &&
      localStorage.getItem("aurafisky_terms_accepted") === "true";

    // Soundscape State
    this.audioActive = false; // Audio mute state
    this.audioContext = null; // Web Audio Context
    this.audioNodes = {}; // Active synthesizer nodes
    this.volumeLevel = 0.5; // Sound volume level (0.0 to 1.0)
    this.activeSoundType = null; // Active sound type
    this.timeline24hMode = localStorage.getItem("aurafisky_timeline_24h") === "true"; // 24h timeline mode

    // Canvas Particles Overlay State
    this.canvas = null; // Overlay canvas element
    this.ctx = null; // Canvas 2D context
    this.particles = []; // Particles array
    this.animationFrameId = null; // Animation loop ID
    this.activeEffectType = "none"; // 'rain', 'snow', 'wind', 'storm', 'none'
    this.lightningFlash = 0; // Flash opacity for lightning storms

    // Network Offline State
    this.isOffline = !navigator.onLine;

    // Search state
    this.searchHistoryKey = "weathermap_search_history";
    this.searchHighlightIndex = -1;
    this.searchActiveFilter = "all"; // Keyboard nav index in search results

    // Bookmark map markers
    this.bookmarkMarkers = []; // Leaflet markers for bookmarked locations
    this.showBookmarksOnMap = localStorage.getItem("aurafisky_show_bookmarks_map") !== "false";

    // Wallpaper preset state
    this.wallpaperPreset = localStorage.getItem("aurafisky_wallpaper_preset") || "none";


    // Sunrise countdown timer
    this.sunCountdownTimer = null;
    this._panelClockTimer = null;
    this.thunderInterval = null;
    this.birdsInterval = null;

    // Ensure compact mode class is never lingering
    document.documentElement.classList.remove("compact");
    this.minimalMode = false;
    this.toggleMinimalMode = () => {
      document.documentElement.classList.remove("compact");
    };

    // Advanced feature state
    this.showSignal = false; // Signal/noise toggle
    this.showConfidence = false; // Confidence bands toggle

    this.freshnessTimestamp = null; // Last data fetch time
    this.biasMap = null; // Diurnal bias correction map
    this._historicalResults = null; // Cached historical archive data

    // Shared audio noise buffer
    this._noiseBuffer = null;

    // Timeline throttle state (perf #5)
    this._timelinePending = false;

    // Cached signal/noise decomposition (perf #6)
    this._cachedDecomposition = null;


    // Temperature overlay state
    this.tempOverlayLayers = [];
    this.tempOverlayTimer = null;

    // PWA Install prompt
    this.deferredPrompt = null;

    // Bookmark alert polling timer
    this._alertPollTimer = null;

    // ── Wallpaper State ──────────────────────────────────────────
    // Support multiple wallpaper locations (max 3)
    this.wallpaperLocations = []; // Array of { lat, lng, name, id, addedAt }
    this.activeWallpaperIndex = 0; // Which wallpaper is currently displayed
    this.wallpaperTimer = null; // Auto-refresh timer (5 min)
    this.wallpaperRefreshInterval = 300000; // 5 minutes in ms
    this.isWallpaperMode = false; // Whether wallpaper overlay is visible
    this.wallpaperAutoRotateTimer = null; // Auto-rotate timer
    this.wallpaperAutoRotateInterval = 300000; // 5 minutes default
    this.wallpaperAutoRotateEnabled = false;
    this.wallpaperLastUpdated = null; // Timestamp of last successful refresh
    this.wallpaperWeatherData = null; // Cached weather for active wallpaper
    this.wallpaperAirQualityData = null; // Cached air quality for active wallpaper
    this.wallpaperCurrentHourIndex = 0; // Current hour index for active wallpaper
    this.wallpaperTouchStartY = 0; // For swipe-to-close
    this.wallpaperTouchActive = false; // For swipe-to-close
    this.wallpaperReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.wallpaperHighContrast = false;
    this.wallpaperBgAnimationId = null; // Background canvas animation frame
    this.wallpaperBgParticles = null; // Background weather particles
    this.wallpaperNotificationThresholds = {
      rain: true,
      tempDrop: 5, // degrees C
      uvHigh: 7,
      windHigh: 40, // km/h
    };
    this.wallpaperNotificationSent = new Set(); // Track sent notifications to avoid spam
    this.wallpaperWakeLock = null; // Wake Lock API sentinel
    this.wallpaperWakeLockEnabled = false;
    this.wallpaperFullscreenActive = false;
    this.wallpaperSoundEnabled = false; // Ambient soundscape in wallpaper mode
    this.wallpaperPhotoEnabled = true; // Procedurally generated scene background
    this.wallpaperBrandEnabled = false; // Aurafisky brand wallpaper background
    this.wallpaperGeofenceEnabled = false; // Geofence triggers
    this._wallpaperGeofenceWatchId = null;
    this.wallpaperSoundWasPlayingBefore = false; // Track app soundscape state before wallpaper

    // Toast dedup tracking (UI #16)

    // ── DOM References ────────────────────────────────────────
    this.$ = {
      map: document.getElementById("map"),
      searchInput: document.getElementById("searchInput"),
      searchClearBtn: document.getElementById("searchClearBtn"),
      searchSpinner: document.getElementById("searchSpinner"),
      searchDropdown: document.getElementById("searchDropdown"),
      searchResults: document.getElementById("searchResults"),
      searchFilterBar: document.getElementById("searchFilterBar"),

      myLocationBtn: document.getElementById("myLocationBtn"),
      settingsSoundToggle: document.getElementById("settingsSoundToggle"),
      settingsVolumeSlider: document.getElementById("settingsVolumeSlider"),
      settingsTimeline24hToggle: document.getElementById("settingsTimeline24hToggle"),
      bookmarksBtn: document.getElementById("bookmarksBtn"),
      bookmarksDropdown: document.getElementById("bookmarksDropdown"),
      bookmarksList: document.getElementById("bookmarksList"),
      toggleBookmarksMapBtn: document.getElementById("toggleBookmarksMapBtn"),
      closeBookmarksBtn: document.getElementById("closeBookmarksBtn"),
      weatherPanel: document.getElementById("weatherPanel"),
      panelCloseBtn: document.getElementById("panelCloseBtn"),
      favoriteToggleBtn: document.getElementById("favoriteToggleBtn"),
      favoriteStarIcon: document.getElementById("favoriteStarIcon"),
      starOutlineIcon: document.getElementById("favoriteStarIcon"),
      starFilledIcon: document.getElementById("favoriteStarIcon"),
      homeToggleBtn: document.getElementById("homeToggleBtn"),
      homeOutlineIcon: document.getElementById("homeOutlineIcon"),
      timelineSlider: document.getElementById("timelineSlider"),
      timelineLabel: document.getElementById("timelineLabel"),
      timelineBadge: document.getElementById("timelineBadge"),
      timelineDays: document.getElementById("timelineDays"),
      nowIndicator: document.getElementById("nowIndicator"),
      nowTimeLabel: document.getElementById("nowTimeLabel"),
      timelineTooltip: document.getElementById("timelineTooltip"),
      timelineTicks: document.getElementById("timelineTicks"),
      timelineTrackFill: document.getElementById("timelineTrackFill"),
      timelineTrackBg: document.getElementById("timelineTrackBg"),
      timelineMinimiseBtn: document.getElementById("timelineMinimiseBtn"),
      timelineMinimizedTrigger: document.getElementById("timelineMinimizedTrigger"),
      timelineMinimizedLabel: document.getElementById("timelineMinimizedLabel"),
      timelineFullContent: document.getElementById("timelineFullContent"),
      loadingOverlay: document.getElementById("loadingOverlay"),
      toastContainer: document.getElementById("toastContainer"),
      offlineBanner: document.getElementById("offlineBanner"),
      weatherPanelSkeleton: document.getElementById("weatherPanelSkeleton"),
      weatherPanelError: document.getElementById("weatherPanelError"),
      weatherErrorTitle: document.getElementById("weatherErrorTitle"),
      weatherErrorMessage: document.getElementById("weatherErrorMessage"),
      weatherErrorIcon: document.getElementById("weatherErrorIcon"),
      weatherRetryBtn: document.getElementById("weatherRetryBtn"),
      weatherViewCachedBtn: document.getElementById("weatherViewCachedBtn"),
      weatherPanelContent: document.getElementById("weatherPanelContent"),
      weatherPanelTabs: document.getElementById("weatherPanelTabs"),
      overviewAQIChip: document.getElementById("overviewAQIChip"),
      overviewWindChip: document.getElementById("overviewWindChip"),
      overviewHumidityChip: document.getElementById("overviewHumidityChip"),
      nowcastSection: document.getElementById("nowcastSection"),
      nowcastIcon: document.getElementById("nowcastIcon"),
      nowcastHeadline: document.getElementById("nowcastHeadline"),
      nowcastBars: document.getElementById("nowcastBars"),
      mobileBottomNav: document.getElementById("mobileBottomNav"),
      mobileNavMapBtn: document.getElementById("mobileNavMapBtn"),
      mobileNavWeatherBtn: document.getElementById("mobileNavWeatherBtn"),
      mobileNavRouteBtn: document.getElementById("mobileNavRouteBtn"),
      mobileNavSavedBtn: document.getElementById("mobileNavSavedBtn"),
      mobileNavLayersBtn: document.getElementById("mobileNavLayersBtn"),
      errorBanner: document.getElementById("errorBanner"),
      errorMessage: document.getElementById("errorMessage"),
      errorRetryBtn: document.getElementById("errorRetryBtn"),
      errorDismissBtn: document.getElementById("errorDismissBtn"),
      a11yLiveRegion: document.getElementById("a11y-live-region"),

      // Turn-by-turn navigation
      navigateHereBtn: document.getElementById("navigateHereBtn"),
      navPanel: document.getElementById("navPanel"),
      navPreview: document.getElementById("navPreview"),
      navPreviewDestination: document.getElementById("navPreviewDestination"),
      navPreviewStats: document.getElementById("navPreviewStats"),
      navStartBtn: document.getElementById("navStartBtn"),
      navCancelPreviewBtn: document.getElementById("navCancelPreviewBtn"),
      navActive: document.getElementById("navActive"),
      navManeuverIcon: document.getElementById("navManeuverIcon"),
      navManeuverDistance: document.getElementById("navManeuverDistance"),
      navManeuverText: document.getElementById("navManeuverText"),
      navMuteBtn: document.getElementById("navMuteBtn"),
      navMuteIcon: document.getElementById("navMuteIcon"),
      navRerouteBanner: document.getElementById("navRerouteBanner"),
      navOffRouteBanner: document.getElementById("navOffRouteBanner"),
      navEta: document.getElementById("navEta"),
      navRemainingDistance: document.getElementById("navRemainingDistance"),
      navStopBtn: document.getElementById("navStopBtn"),

      // Map overlay toggles (modes/terrain, day/night terminator, isobars, extremes)
      mapLayersBtn: document.getElementById("mapLayersBtn"),
      mapLayersFlyout: document.getElementById("mapLayersFlyout"),
      minimizeMapLayersBtn: document.getElementById("minimizeMapLayersBtn"),
      mapLayersHeaderTitle: document.getElementById("mapLayersHeaderTitle"),
      mapLayersActiveBadge: document.getElementById("mapLayersActiveBadge"),
      mapLayersBody: document.getElementById("mapLayersBody"),
      mapStyleGrid: document.getElementById("mapStyleGrid"),
      settingsMapStyleSelect: document.getElementById("settingsMapStyleSelect"),
      terminatorToggleBtn: document.getElementById("terminatorToggleBtn"),
      isobarToggleBtn: document.getElementById("isobarToggleBtn"),
      extremesBtn: document.getElementById("extremesBtn"),
      extremesPanel: document.getElementById("extremesPanel"),
      extremesList: document.getElementById("extremesList"),
      extremesCloseBtn: document.getElementById("extremesCloseBtn"),

      // Radar/Satellite Controls
      radarControls: document.getElementById("radarControls"),
      radarToggleBtn: document.getElementById("radarToggleBtn"),
      layerTypeSelect: document.getElementById("layerTypeSelect"),
      radarDot: document.getElementById("radarDot"),
      radarPlayback: document.getElementById("radarPlayback"),
      radarPlayBtn: document.getElementById("radarPlayBtn"),
      radarPlayIcon: document.getElementById("radarPlayIcon"),
      radarPauseIcon: document.getElementById("radarPauseIcon"),
      radarTimeLabel: document.getElementById("radarTimeLabel"),
      radarExtras: document.getElementById("radarExtras"),
      radarOpacitySlider: document.getElementById("radarOpacitySlider"),
      legendPrecip: document.getElementById("legendPrecip"),
      legendTemp: document.getElementById("legendTemp"),
      radarMinimizeBtn: document.getElementById("radarMinimizeBtn"),
      radarCollapsedBtn: document.getElementById("radarCollapsedBtn"),
      radarExpandedPanel: document.getElementById("radarExpandedPanel"),
      zoomInBtn: document.getElementById("zoomInBtn"),
      zoomOutBtn: document.getElementById("zoomOutBtn"),
      compassBtn: document.getElementById("compassBtn"),
      compassNeedle: document.getElementById("compassNeedle"),

      // SVG Sparkline
      trendSvg: document.getElementById("trendSvg"),
      trendHeader: document.getElementById("trendHeader"),
      trendBody: document.getElementById("trendBody"),
      trendCollapseIcon: document.getElementById("trendCollapseIcon"),
      chartHours: document.getElementById("chartHours"),
      chartLine: document.getElementById("chartLine"),
      chartArea: document.getElementById("chartArea"),
      chartPoints: document.getElementById("chartPoints"),

      // Panel details
      panelLocationName: document.getElementById("panelLocationName"),
      panelCoordinates: document.getElementById("panelCoordinates"),
      locationAddressCoords: document.getElementById("locationAddressCoords"),
      locationAddressCoordsText: document.getElementById("locationAddressCoordsText"),
      locationAddressTimeDivider: document.getElementById("locationAddressTimeDivider"),
      locationAddressTimeText: document.getElementById("locationAddressTimeText"),
      panelTimeLabel: document.getElementById("panelTimeLabel"),
      mobilePanelTimeRow: document.getElementById("mobilePanelTimeRow"),
      mobilePanelTimeLabel: document.getElementById("mobilePanelTimeLabel"),
      mobilePanelTzBadge: document.getElementById("mobilePanelTzBadge"),
      panelCardLocalTime: document.getElementById("panelCardLocalTime"),
      panelCardLocalTimeText: document.getElementById("panelCardLocalTimeText"),
      panelCardFreshness: document.getElementById("panelCardFreshness"),
      panelIcon: document.getElementById("panelIcon"),
      panelTemp: document.getElementById("panelTemp"),
      panelDescription: document.getElementById("panelDescription"),
      panelFeelsLike: document.getElementById("panelFeelsLike"),
      panelHumidity: document.getElementById("panelHumidity"),
      panelWind: document.getElementById("panelWind"),
      windArrow: document.getElementById("windArrow"),
      panelPressure: document.getElementById("panelPressure"),
      panelClouds: document.getElementById("panelClouds"),
      panelUV: document.getElementById("panelUV"),
      panelUVBadge: document.getElementById("panelUVBadge"),
      panelUVAdvice: document.getElementById("panelUVAdvice"),
      panelPrecip: document.getElementById("panelPrecip"),
      panelDewPoint: document.getElementById("panelDewPoint"),
      panelWindGusts: document.getElementById("panelWindGusts"),
      panelVisibility: document.getElementById("panelVisibility"),
      panelTempDelta: document.getElementById("panelTempDelta"),
      dailyForecast: document.getElementById("dailyForecast"),

      // AQI Elements
      aqiCard: document.getElementById("aqiCard"),
      panelAQILabel: document.getElementById("panelAQILabel"),
      panelAQIMetrics: document.getElementById("panelAQIMetrics"),
      panelAQIBadge: document.getElementById("panelAQIBadge"),
      pollenCard: document.getElementById("pollenCard"),
      pollenBirch: document.getElementById("pollenBirch"),
      pollenGrass: document.getElementById("pollenGrass"),
      pollenMugwort: document.getElementById("pollenMugwort"),
      pollenAlder: document.getElementById("pollenAlder"),
      uvChart: document.getElementById("uvChart"),

      shortcutsModal: document.getElementById("shortcutsModal"),
      shortcutsCloseBtn: document.getElementById("shortcutsCloseBtn"),
      appInfoModal: document.getElementById("appInfoModal"),
      appInfoCloseBtn: document.getElementById("appInfoCloseBtn"),
      appInfoCloseBtn2: document.getElementById("appInfoCloseBtn2"),
      logoBtn: document.getElementById("logoBtn"),

      // Advisory Alert Elements
      advisoryBanner: document.getElementById("advisoryBanner"),
      advisoryIcon: document.getElementById("advisoryIcon"),
      advisoryTitle: document.getElementById("advisoryTitle"),
      advisoryDesc: document.getElementById("advisoryDesc"),

      // Astronomy SVG Elements
      sunArcPassed: document.getElementById("sunArcPassed"),
      sunArcDot: document.getElementById("sunArcDot"),
      sunSunrise: document.getElementById("sunSunrise"),
      sunSunset: document.getElementById("sunSunset"),
      sunDayLength: document.getElementById("sunDayLength"),
      sunCountdown: document.getElementById("sunCountdown"),
      moonLitPath: document.getElementById("moonLitPath"),
      moonPhaseLabel: document.getElementById("moonPhaseLabel"),
      moonPhasePercent: document.getElementById("moonPhasePercent"),
      moonPhaseDesc: document.getElementById("moonPhaseDesc"),
      stargazingScore: document.getElementById("stargazingScore"),
      stargazingLabel: document.getElementById("stargazingLabel"),
      goldenBlueHourLabel: document.getElementById("goldenBlueHourLabel"),

      // Climate Time-Machine Elements
      timeMachineTrigger: document.getElementById("timeMachineTrigger"),
      timeMachineChevron: document.getElementById("timeMachineChevron"),
      timeMachineDrawer: document.getElementById("timeMachineDrawer"),
      timeMachineSvg: document.getElementById("timeMachineSvg"),
      timeMachineLine: document.getElementById("timeMachineLine"),
      timeMachinePoints: document.getElementById("timeMachinePoints"),
      timeMachineRows: document.getElementById("timeMachineRows"),
      offlineTimeMachineBadge: document.getElementById(
        "offlineTimeMachineBadge",
      ),

      // Comparison Panel Elements
      comparePanel: document.getElementById("comparePanel"),
      compareCloseBtn: document.getElementById("compareCloseBtn"),
      compareHeading: document.getElementById("compareHeading"),
      compareTempA: document.getElementById("compareTempA"),
      compareTempB: document.getElementById("compareTempB"),
      compareWindA: document.getElementById("compareWindA"),
      compareWindB: document.getElementById("compareWindB"),
      compareAQIA: document.getElementById("compareAQIA"),
      compareAQIB: document.getElementById("compareAQIB"),
      compareHumidityA: document.getElementById("compareHumidityA"),
      compareHumidityB: document.getElementById("compareHumidityB"),
      compareDescA: document.getElementById("compareDescA"),
      compareDescB: document.getElementById("compareDescB"),

      // New Feature Elements

      shareWeatherBtn: document.getElementById("shareWeatherBtn"),
      shareModal: document.getElementById("shareModal"),
      shareModalCloseBtn: document.getElementById("shareModalCloseBtn"),
      shareOptCurrent: document.getElementById("shareOptCurrent"),
      shareOptHourly: document.getElementById("shareOptHourly"),
      shareOptWeekly: document.getElementById("shareOptWeekly"),
      shareOptFull: document.getElementById("shareOptFull"),
      shareTargetNative: document.getElementById("shareTargetNative"),
      shareTargetWhatsApp: document.getElementById("shareTargetWhatsApp"),
      shareTargetTelegram: document.getElementById("shareTargetTelegram"),
      shareTargetX: document.getElementById("shareTargetX"),
      shareTargetCopy: document.getElementById("shareTargetCopy"),
      panelExpandWideBtn: document.getElementById("panelExpandWideBtn"),
      panelExpandWideIcon: document.getElementById("panelExpandWideIcon"),
      panelCompressWideIcon: document.getElementById("panelCompressWideIcon"),
      panelMinimizeBtn: document.getElementById("panelMinimizeBtn"),
      setWallpaperBtn: document.getElementById("setWallpaperBtn"),
      wallpaperOutlineIcon: document.getElementById("wallpaperOutlineIcon"),
      wallpaperFilledIcon: document.getElementById("wallpaperFilledIcon"),
      hourlyTabContent: document.getElementById("hourlyTabContent"),

      hourlyStrip: document.getElementById("hourlyStrip"),
      bestWindowCard: document.getElementById("bestWindowCard"),
      bestWindowText: document.getElementById("bestWindowText"),

      // Install & Auto-refresh buttons
      installBtn: document.getElementById("installBtn"),
      installBtnLabel: document.getElementById("installBtnLabel"),
      pwaInstallBanner: document.getElementById("pwaInstallBanner"),
      pwaInstallBannerBtn: document.getElementById("pwaInstallBannerBtn"),
      pwaInstallBannerCloseBtn: document.getElementById("pwaInstallBannerCloseBtn"),

      // New Features
      comfortIndex: document.getElementById("comfortIndex"),
      comfortLabel: document.getElementById("comfortLabel"),
      pressureTendency: document.getElementById("pressureTendency"),
      timelineDelta: document.getElementById("timelineDelta"),
      nextRainBtn: document.getElementById("nextRainBtn"),

      predictiveArrival: document.getElementById("predictiveArrival"),
      anomalyLabel: document.getElementById("anomalyLabel"),
      patternLabel: document.getElementById("patternLabel"),

      // Advanced features
      confidenceToggle: document.getElementById("confidenceToggle"),
      percentileLabel: document.getElementById("percentileLabel"),
      trustScore: document.getElementById("trustScore"),
      signalNoiseBtn: document.getElementById("signalNoiseBtn"),
      cumulativeCurve: document.getElementById("cumulativeCurve"),
      momentumLabel: document.getElementById("momentumLabel"),
      paramImportance: document.getElementById("paramImportance"),
      freshnessLabel: document.getElementById("freshnessLabel"),
      // temporalGrid (class-based, no ID needed)
      briefingBtn: document.getElementById("briefingBtn"),
      briefingContent: document.getElementById("briefingContent"),
      regimeLabel: document.getElementById("regimeLabel"),
      spatialGradLabel: document.getElementById("spatialGradLabel"),
      analogLabel: document.getElementById("analogLabel"),

      // Wallpaper Overlay Elements
      wallpaperOverlay: document.getElementById("wallpaperOverlay"),
      wallpaperCloseBtn: document.getElementById("wallpaperCloseBtn"),
      wallpaperLocationName: document.getElementById("wallpaperLocationName"),
      wallpaperCoordinates: document.getElementById("wallpaperCoordinates"),
      wallpaperTimeLabel: document.getElementById("wallpaperTimeLabel"),
      wallpaperIcon: document.getElementById("wallpaperIcon"),
      wallpaperTemp: document.getElementById("wallpaperTemp"),
      wallpaperDescription: document.getElementById("wallpaperDescription"),
      wallpaperFeelsLike: document.getElementById("wallpaperFeelsLike"),
      wallpaperHumidity: document.getElementById("wallpaperHumidity"),
      wallpaperWind: document.getElementById("wallpaperWind"),
      wallpaperPressure: document.getElementById("wallpaperPressure"),
      wallpaperClouds: document.getElementById("wallpaperClouds"),
      wallpaperUV: document.getElementById("wallpaperUV"),
      wallpaperPrecip: document.getElementById("wallpaperPrecip"),
      wallpaperDewPoint: document.getElementById("wallpaperDewPoint"),
      wallpaperWindGusts: document.getElementById("wallpaperWindGusts"),
      wallpaperVisibility: document.getElementById("wallpaperVisibility"),
      wallpaperAQI: document.getElementById("wallpaperAQI"),
      wallpaperAQIBadge: document.getElementById("wallpaperAQIBadge"),
      wallpaperAQIMetrics: document.getElementById("wallpaperAQIMetrics"),
      wallpaperComfortScore: document.getElementById("wallpaperComfortScore"),
      wallpaperComfortLabel: document.getElementById("wallpaperComfortLabel"),
      wallpaperSunArc: document.getElementById("wallpaperSunArc"),
      wallpaperSunArcPassed: document.getElementById("wallpaperSunArcPassed"),
      wallpaperSunArcDot: document.getElementById("wallpaperSunArcDot"),
      wallpaperSunSunrise: document.getElementById("wallpaperSunSunrise"),
      wallpaperSunSunset: document.getElementById("wallpaperSunSunset"),
      wallpaperSunDayLength: document.getElementById("wallpaperSunDayLength"),
      wallpaperMoonPhase: document.getElementById("wallpaperMoonPhase"),
      wallpaperMoonLitPath: document.getElementById("wallpaperMoonLitPath"),
      wallpaperMoonPhaseLabel: document.getElementById("wallpaperMoonPhaseLabel"),
      wallpaperMoonPhasePercent: document.getElementById("wallpaperMoonPhasePercent"),
      wallpaperMoonPhaseDesc: document.getElementById("wallpaperMoonPhaseDesc"),
      wallpaperStargazing: document.getElementById("wallpaperStargazing"),
      wallpaperStargazingLabel: document.getElementById("wallpaperStargazingLabel"),
      wallpaperLastUpdated: document.getElementById("wallpaperLastUpdated"),
      wallpaperRefreshBtn: document.getElementById("wallpaperRefreshBtn"),
      wallpaperPrecipNextRain: document.getElementById("wallpaperPrecipNextRain"),
      wallpaperPrecipTimelineLabels: document.getElementById("wallpaperPrecipTimelineLabels"),
      wallpaperInlineAlert: document.getElementById("wallpaperInlineAlert"),
      wallpaperInlineAlertTitle: document.getElementById("wallpaperInlineAlertTitle"),
      wallpaperInlineAlertDesc: document.getElementById("wallpaperInlineAlertDesc"),
      wallpaperNoRainMsg: document.getElementById("wallpaperNoRainMsg"),
      // Hero enhancement elements
      wallpaperHighTemp: document.getElementById("wallpaperHighTemp"),
      wallpaperLowTemp: document.getElementById("wallpaperLowTemp"),
      wallpaperHeroSunrise: document.getElementById("wallpaperHeroSunrise"),
      wallpaperHeroSunset: document.getElementById("wallpaperHeroSunset"),
      wallpaperTrendDelta: document.getElementById("wallpaperTrendDelta"),
      wallpaperTrendSvg: document.getElementById("wallpaperTrendSvg"),
      wallpaperTrendLine: document.getElementById("wallpaperTrendLine"),
      wallpaperTrendArea: document.getElementById("wallpaperTrendArea"),
      // Forecast strips
      wallpaperDailySection: document.getElementById("wallpaperDailySection"),
      wallpaperDailyStrip: document.getElementById("wallpaperDailyStrip"),
      wallpaperHourlySection: document.getElementById("wallpaperHourlySection"),
      wallpaperHourlyStrip: document.getElementById("wallpaperHourlyStrip"),
      // Settings panel
      wallpaperSettingsPanel: document.getElementById("wallpaperSettingsPanel"),
      wallpaperSettingsCloseBtn: document.getElementById("wallpaperSettingsCloseBtn"),
      wallpaperRefreshIntervalSelect: document.getElementById("wallpaperRefreshIntervalSelect"),
      wallpaperAutoRotateToggle: document.getElementById("wallpaperAutoRotateToggle"),
      wallpaperRotateIntervalSelect: document.getElementById("wallpaperRotateIntervalSelect"),
      wallpaperSoundToggle: document.getElementById("wallpaperSoundToggle"),
      wallpaperNotifyRain: document.getElementById("wallpaperNotifyRain"),
      wallpaperNotifyTempDrop: document.getElementById("wallpaperNotifyTempDrop"),
      wallpaperNotifyUV: document.getElementById("wallpaperNotifyUV"),
      wallpaperNotifyWind: document.getElementById("wallpaperNotifyWind"),
      wallpaperHCSetting: document.getElementById("wallpaperHCSetting"),
      wallpaperBrandToggle: document.getElementById("wallpaperBrandToggle"),
      wallpaperPhotoToggle: document.getElementById("wallpaperPhotoToggle"),
      wallpaperPersistToggle: document.getElementById("wallpaperPersistToggle"),
      wallpaperWakeLockToggle: document.getElementById("wallpaperWakeLockToggle"),
      wallpaperGeofenceToggle: document.getElementById("wallpaperGeofenceToggle"),
      // Immersive features
      wallpaperFullscreenBtn: document.getElementById("wallpaperFullscreenBtn"),
      wallpaperFullscreenIcon: document.getElementById("wallpaperFullscreenIcon"),
      wallpaperExportBtn: document.getElementById("wallpaperExportBtn"),
      wallpaperPhotoBg: document.getElementById("wallpaperPhotoBg"),
      wallpaperSceneCanvas: document.getElementById("wallpaperSceneCanvas"),
      wallpaperPickPhotoBtn: document.getElementById("wallpaperPickPhotoBtn"),
      wallpaperClearPhotoBtn: document.getElementById("wallpaperClearPhotoBtn"),
      wallpaperDeviceBtn: document.getElementById("wallpaperDeviceBtn"),
      panelWeatherBg: document.getElementById("panelWeatherBg"),
      wallpaperBrandBg: document.getElementById("wallpaperBrandBg"),
      // Mini radar
      wallpaperRadarSection: document.getElementById("wallpaperRadarSection"),
      wallpaperRadarBaseMap: document.getElementById("wallpaperRadarBaseMap"),
      wallpaperRadarImage: document.getElementById("wallpaperRadarImage"),
      wallpaperRadarDot: document.getElementById("wallpaperRadarDot"),
      wallpaperRadarTime: document.getElementById("wallpaperRadarTime"),
      wallpaperRadarLoading: document.getElementById("wallpaperRadarLoading"),
      // New Wallpaper Enhancement Elements
      wallpaperTabs: document.getElementById("wallpaperTabs"),
      wallpaperTabContainer: document.getElementById("wallpaperTabContainer"),
      wallpaperAddTabBtn: document.getElementById("wallpaperAddTabBtn"),
      wallpaperAddTabModal: document.getElementById("wallpaperAddTabModal"),
      wallpaperAddTabModalClose: document.getElementById("wallpaperAddTabModalClose"),
      wallpaperTabSearchInput: document.getElementById("wallpaperTabSearchInput"),
      wallpaperTabSearchClear: document.getElementById("wallpaperTabSearchClear"),
      wallpaperTabSearchResults: document.getElementById("wallpaperTabSearchResults"),
      wallpaperPopularCities: document.getElementById("wallpaperPopularCities"),
      wallpaperSavedBookmarksSection: document.getElementById("wallpaperSavedBookmarksSection"),
      wallpaperSavedBookmarks: document.getElementById("wallpaperSavedBookmarks"),
      wallpaperAlertBanner: document.getElementById("wallpaperAlertBanner"),
      wallpaperAlertText: document.getElementById("wallpaperAlertText"),
      wallpaperAlertDismiss: document.getElementById("wallpaperAlertDismiss"),
      wallpaperPrecipTimeline: document.getElementById("wallpaperPrecipTimeline"),
      wallpaperPrecipTimelineSvg: document.getElementById("wallpaperPrecipTimelineSvg"),
      wallpaperOfflineIndicator: document.getElementById("wallpaperOfflineIndicator"),
      wallpaperAutoRotateBtn: document.getElementById("wallpaperAutoRotateBtn"),
      wallpaperAutoRotateIcon: document.getElementById("wallpaperAutoRotateIcon"),
      wallpaperSettingsBtn: document.getElementById("wallpaperSettingsBtn"),
      wallpaperShareBtn: document.getElementById("wallpaperShareBtn"),
      wallpaperHighContrastBtn: document.getElementById("wallpaperHighContrastBtn"),
      wallpaperBgCanvas: document.getElementById("wallpaperBgCanvas"),
      wallpaperFirstOpenHint: document.getElementById("wallpaperFirstOpenHint"),

      // Auth & Settings Dialogs
      profileBtn: document.getElementById("profileBtn"),
      profileIconGeneric: document.getElementById("profileIconGeneric"),
      profileAvatarImg: document.getElementById("profileAvatarImg"),
      profileAvatarFallback: document.getElementById("profileAvatarFallback"),
      accountDialog: document.getElementById("accountDialog"),
      accountCloseBtn: document.getElementById("accountCloseBtn"),
      accountLoggedOut: document.getElementById("accountLoggedOut"),
      googleSignInBtn: document.getElementById("googleSignInBtn"),
      accountLoggedIn: document.getElementById("accountLoggedIn"),
      accountAvatarImg: document.getElementById("accountAvatarImg"),
      accountName: document.getElementById("accountName"),
      accountEmail: document.getElementById("accountEmail"),
      syncStatusTime: document.getElementById("syncStatusTime"),
      accountSettingsBtn: document.getElementById("accountSettingsBtn"),
      googleSignOutBtn: document.getElementById("googleSignOutBtn"),
      settingsPanel: document.getElementById("settingsPanel"),
      settingsCloseBtn: document.getElementById("settingsCloseBtn"),
      settingsUnitsToggle: document.getElementById("settingsUnitsToggle"),
      settingsThemeToggle: document.getElementById("settingsThemeToggle"),
      settingsAppLanguageSelect: document.getElementById("settingsAppLanguageSelect"),
      settingsMapLanguageToggle: document.getElementById("settingsMapLanguageToggle"),
      settingsSyncHistoryToggle: document.getElementById(
        "settingsSyncHistoryToggle",
      ),
      settingsClearCacheBtn: document.getElementById("settingsClearCacheBtn"),
      settingsDeleteDataBtn: document.getElementById("settingsDeleteDataBtn"),
      settingsTermsBtn: document.getElementById("settingsTermsBtn"),
      termsModal: document.getElementById("termsModal"),
      termsAcceptBtn: document.getElementById("termsAcceptBtn"),
      termsCloseBtn: document.getElementById("termsCloseBtn"),
      copyContactEmailBtn: document.getElementById("copyContactEmailBtn"),
      termsCornerLink: document.getElementById("termsCornerLink"),
      setDefaultLocationBtn: document.getElementById("setDefaultLocationBtn"),
      defaultLocationNotifyToggle: document.getElementById(
        "defaultLocationNotifyToggle",
      ),
      defaultLocationStatus: document.getElementById("defaultLocationStatus"),
      defaultLocationNotifyHint: document.getElementById(
        "defaultLocationNotifyHint",
      ),
      notifyIntervalSelect: document.getElementById("notifyIntervalSelect"),
    };

    // ── Loading-overlay watchdog ──────────────────────────────
    // Guarantee the overlay never permanently blocks the UI, even if init()
    // throws before hideLoadingOverlay() runs. Force it gone after 8s.
    setTimeout(() => {
      const ov = this.$.loadingOverlay;
      if (ov && ov.isConnected) this.hideLoadingOverlay();
    }, 8000);

    // ── Initialize ────────────────────────────────────────────
    this.init();
  }

  /** Initialize application settings, maps, bookmarks, and UI triggers. */
  async init() {
    // Capture a pristine copy of the weather panel markup before anything
    // mutates it. Used to rebuild the full card if compact mode is restored
    // from saved prefs before a weather render has produced a snapshot.
    const panelEl = document.getElementById("weatherPanel");
    if (panelEl) this._weatherPanelTemplate = panelEl.outerHTML;

    // Global error boundary — surface unexpected errors without killing the app.
    const isBenignError = (err) => {
      const msg = (err?.message || String(err || "")).toLowerCase();
      return (
        msg.includes("message channel closed") ||
        msg.includes("listener indicated an asynchronous response") ||
        msg.includes("quic_peer_going_away") ||
        msg.includes("err_quic_protocol_error") ||
        msg.includes("resizeobserver loop") ||
        msg.includes("cancelled") ||
        msg.includes("aborted")
      );
    };

    window.addEventListener("error", (e) => {
      if (isBenignError(e.error || e.message)) {
        e.preventDefault();
        return;
      }
      console.error("Unhandled error:", e.error || e.message);
    });
    window.addEventListener("unhandledrejection", (e) => {
      if (isBenignError(e.reason)) {
        e.preventDefault();
        return;
      }
      console.error("Unhandled promise rejection:", e.reason);
    });

    // Accessibility keyboard navigation & modal listeners (moved out of an
    // inline <script> in index.html so the CSP doesn't need 'unsafe-inline'
    // for scripts).
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.hideTermsModal();
        if (this.toggleAppInfoModal) this.toggleAppInfoModal(false);
        if (this.toggleShortcutsModal) this.toggleShortcutsModal(false);
        if (this.toggleAccountDialog) this.toggleAccountDialog(false);
        if (this.toggleSettingsPanel) this.toggleSettingsPanel(false);
        if (this.closeExtremesPanel) this.closeExtremesPanel();
        if (this.cancelNavigation && this.$.navPanel && !this.$.navPanel.classList.contains("hidden")) {
          this.cancelNavigation();
        }
        if (this.isWallpaperMode) {
          // Settings drawer closes first, then the overlay (keeps the tabs)
          this.hideWallpaperSettings();
          this.hideWallpaperOverlay();
          this.isWallpaperMode = false;
          this.stopWallpaperAutoRotate();
          this.updateWallpaperButtonUI();
        } else if (this.$.wallpaperSettingsPanel && !this.$.wallpaperSettingsPanel.classList.contains("hidden")) {
          this.hideWallpaperSettings();
        }
      }
      // Arrow keys switch wallpaper tabs while the overlay is open
      if (this.isWallpaperMode && this.wallpaperLocations.length > 1) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          this.switchWallpaperTab((this.activeWallpaperIndex + 1) % this.wallpaperLocations.length);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          this.switchWallpaperTab((this.activeWallpaperIndex - 1 + this.wallpaperLocations.length) % this.wallpaperLocations.length);
        }
      }
      if ((e.key === "Enter" || e.key === " ") && e.target && e.target.getAttribute("role") === "button") {
        e.preventDefault();
        e.target.click();
      }
    });

    // Theme defaults to light regardless of OS/device preference, but if
    // this browser has switched to dark before we start there dark right
    // away instead of always flashing light first. The cloud-synced
    // preference (see saveUserDataToCloud's prefs.theme handling) arrives
    // later over the network and used to call toggleDarkMode() *after* the
    // light basemap had already started rendering — swapping the whole
    // vector basemap out mid-load, which is what "a different map suddenly
    // appears" was: a real theme flip, not a rendering glitch. Reading the
    // last-known theme synchronously here closes that gap for returning
    // visitors; toggleDarkMode() below keeps this in sync going forward.
    let initialDark = false;
    try {
      const savedMapStyle = localStorage.getItem("aurafisky_map_style");
      if (savedMapStyle) {
        // Only dark mode map style should have dark tabs / theme; all other map modes are light
        initialDark = savedMapStyle === "dark";
      } else {
        initialDark = localStorage.getItem("aurafisky_theme") === "dark";
      }
    } catch (e) {
      // ignore — storage unavailable, fall back to light
    }
    this.isDark = initialDark;
    document.documentElement.classList.toggle("dark", this.isDark);
    if (this.isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }

    // Attach feature-module methods (radar, bookmarks, audio, canvas effects, etc.)
    // eagerly and synchronously, before anything below binds an event handler or
    // calls one directly — avoids a load-order race where a listener could fire
    // before its handler method exists (see features/registry.js).
    // Global error handler — must be first so it catches errors from
    // feature init, map setup, and everything else downstream.
    initErrorHandler(this);

    initFeatures(this);

    // Web Vitals tracking (LCP, FID/INP, CLS) — privacy-first, no network
    // unless the user opts in to analytics sharing.
    if (this.analytics) {
      initWebVitals(this.analytics);
    }

    // Apply device language
    this.setLanguage(this.currentLanguage);

    // Sync device profile across tabs
    if (this.deviceProfile && this.syncBus?.syncDeviceProfile) {
      this.syncBus.syncDeviceProfile(this.deviceProfile);
    }

    // Load bookmarks (in-memory until cloud sync)

    // Setup OpenLayers map viewport
    this.initMap();

    // Keep --app-height tracking the visible viewport. Must start before the
    // panel styles resolve: ten rules across the stylesheets are sized as
    // var(--app-height, 100vh), and the 100vh fallback is wrong on iOS Safari
    // where 100vh includes the space behind the collapsing address bar.
    this._stopViewportWatch = watchViewport({
      onResize: () => this.map?.updateSize(),
    });

    // Setup Particle Canvas Overlay
    this.initWeatherCanvas();

    // Bind event handlers
    this.bindEvents();
    this.initKeyboardShortcuts();
    this.initWeatherPanelTabs();
    this.initMobileBottomNav();
    this.initMobileHistoryBack();

    // Initialize Firebase integrations & bind user profile / settings triggers
    this.initFirebase();

    // Register the Service Worker. This is the single registration path — the
    // inline <script> in index.html and vite-plugin-pwa's injected registerSW.js
    // were both removed in favour of this one, which additionally sets
    // updateViaCache:'none' and forces update checks on focus/visibility.
    this.registerServiceWorker();

    // Load initial startup location (shared URL link first, then restored session, home, or geolocation)
    this._loadInitialStartupLocation();

    // Restore persisted wallpaper (opt-in) after the initial location loads,
    // so the wallpaper tabs are ready even before the user touches anything.
    if (this.restoreWallpaperFromStorage()) {
      setTimeout(() => {
        this.showWallpaperOverlay();
        this.loadWallpaperDataForActiveTab();
        this.startWallpaperAutoRefresh();
        this.updateWallpaperButtonUI();
      }, 2000);
    }
  }

  /**
   * True when a click event was really the tail end of a pan/swipe gesture
   * rather than a deliberate tap, so the caller should ignore it.
   *
   * Two signals, either of which is enough:
   *   1. Leaflet fired movestart/dragstart since the last pointerdown.
   *   2. The pointer travelled more than DRAG_SLOP_PX from where it went down —
   *      catches short drags that never cross Leaflet's own drag threshold.
   *
   * Shared by the map click handler and the weather / home / bookmark marker
   * click handlers, which previously each carried their own copy of this logic.
   *
   * @param {Object} e - OpenLayers MapBrowserEvent (carries `originalEvent`)
   * @returns {boolean} true if the event should be treated as a drag, not a tap
   */
  _isDragGesture(e) {
    const DRAG_SLOP_PX = 8;

    if (this._mapWasDragged) {
      this._mapWasDragged = false;
      return true;
    }

    const orig = e?.originalEvent;
    if (!this._touchStartPos || !orig) return false;

    const clientX =
      orig.clientX ??
      (orig.changedTouches?.[0]?.clientX || orig.touches?.[0]?.clientX);
    const clientY =
      orig.clientY ??
      (orig.changedTouches?.[0]?.clientY || orig.touches?.[0]?.clientY);
    if (clientX == null || clientY == null) return false;

    const dist = Math.hypot(
      clientX - this._touchStartPos.x,
      clientY - this._touchStartPos.y,
    );
    return dist > DRAG_SLOP_PX;
  }

  // OL's Map has no zoomIn()/zoomOut() of its own (Leaflet did) — animate
  // the View's zoom by one step instead.
  _zoomBy(delta) {
    if (!this.map) return;
    const view = this.map.getView();
    view.animate({ zoom: view.getZoom() + delta, duration: 200 });
  }

  // Animate map rotation back to North (0 radians)
  resetRotation() {
    if (!this.map) return;
    const view = this.map.getView();
    view.animate({ rotation: 0, duration: 300 });
    this._haptic?.('selection');
  }

  // Update compass needle rotation and button active state based on view rotation
  _updateCompass() {
    if (!this.map || !this.$.compassBtn) return;
    const rotation = this.map.getView()?.getRotation() || 0;
    const isRotated = Math.abs(rotation) > 0.005; // > ~0.3 degrees
    if (isRotated) {
      this.$.compassBtn.classList.add('ring-2', 'ring-primary-500/60', 'border-primary-500/70', 'shadow-primary-500/25', 'bg-white', 'dark:bg-slate-700');
      this.$.compassBtn.setAttribute('title', 'Map rotated — Click to reset North (Alt+drag or twist to rotate)');
      if (this.$.compassNeedle) {
        const deg = -rotation * (180 / Math.PI);
        this.$.compassNeedle.style.transformOrigin = 'center';
        this.$.compassNeedle.style.transform = `rotate(${deg}deg)`;
      }
    } else {
      this.$.compassBtn.classList.remove('ring-2', 'ring-primary-500/60', 'border-primary-500/70', 'shadow-primary-500/25', 'bg-white', 'dark:bg-slate-700');
      this.$.compassBtn.setAttribute('title', 'Reset North orientation');
      if (this.$.compassNeedle) {
        this.$.compassNeedle.style.transformOrigin = 'center';
        this.$.compassNeedle.style.transform = 'rotate(0deg)';
      }
    }
  }

  // Set --app-height to the true visible viewport height so layout using
  // var(--app-height, 100vh) is never clipped behind mobile browser chrome.
  //
  // The measurement itself lives in modules/viewport.js, which is started in
  // initMapViewportTracking() below. This method remains as the single-shot
  // entry point (and so map updates stay in one place) rather than being a
  // second, subtly different implementation.
  _updateAppHeight() {
    const h = applyViewportHeight();
    this.map?.updateSize();
    return h;
  }

  // ================================================================
  //  MAP INITIALIZATION & TILE SETUPS
  // ================================================================

  /**
   * Recolors the GL style's flat "background" layer so it reads as ocean
   * instead of void.
   *
   * Web Mercator has no representation past ±85.0511° — there is no tile
   * Enhances vector basemap vibrancy, contrast, and natural tones.
   *
   * In light theme, OpenFreeMap Liberty's default palette is flat and muted
   * (pale grey land, washed-out water, near-invisible greens). Furthermore,
   * setting "background" to waterColor painted underneath all land and bled
   * through low-opacity landcover layers, giving land an unnatural grey-cyan wash.
   * Here we restore rich, vivid ocean blues, lush vibrant greenery, and clean
   * warm natural land base while keeping label typography crisp and localized.
   *
   * @param {Object} styleJson - Mutated in place.
   * @param {"light"|"dark"} theme
   */
  _enhanceBasemapVibrance(styleJson, theme) {
    const layers = styleJson?.layers;
    if (!Array.isArray(layers)) return;

    if (theme === "light") {
      // 1. Keep base land as clean, warm natural map parchment (#faf8f4), not waterColor
      const bg = layers.find((l) => l.id === "background");
      if (bg?.paint) {
        bg.paint["background-color"] = "#faf8f4";
      }

      // 2. Vibrant, rich, crystalline azure ocean & waterways
      const water = layers.find((l) => l.id === "water" && l.type === "fill");
      if (water?.paint) {
        water.paint["fill-color"] = "#4a95ea";
      }

      for (const l of layers) {
        if (l.id && l.id.startsWith("waterway_") && l.paint?.["line-color"]) {
          l.paint["line-color"] = "#4a95ea";
        }
      }

      // 3. Vibrant, lush greenery & parks (boost from faint 0.3-0.4 opacity to rich vivid tones)
      const wood = layers.find((l) => l.id === "landcover_wood");
      if (wood?.paint) {
        wood.paint["fill-color"] = "#7ecb54";
        wood.paint["fill-opacity"] = 0.68;
      }

      const grass = layers.find((l) => l.id === "landcover_grass");
      if (grass?.paint) {
        grass.paint["fill-color"] = "#9edb7a";
        grass.paint["fill-opacity"] = 0.62;
      }

      const park = layers.find((l) => l.id === "park");
      if (park?.paint) {
        park.paint["fill-color"] = "#ace488";
        park.paint["fill-opacity"] = 0.78;
      }

      const sand = layers.find((l) => l.id === "landcover_sand");
      if (sand?.paint) {
        sand.paint["fill-color"] = "#f9e7a8";
      }
    } else if (theme === "dark") {
      // Sleek, high-contrast dark theme (styled like CartoDB Dark Matter / Mapbox Dark)
      // 1. Differentiate deep midnight-navy ocean vs modern dark charcoal-slate land
      const bg = layers.find((l) => l.id === "background");
      if (bg?.paint) {
        bg.paint["background-color"] = "#161d2a"; // Distinct dark slate land
      }

      const water = layers.find((l) => l.id === "water");
      if (water?.paint) {
        water.paint["fill-color"] = "#090f19"; // Deep midnight ocean
      }

      const waterway = layers.find((l) => l.id === "waterway");
      if (waterway?.paint) {
        waterway.paint["line-color"] = "#19283c";
      }

      for (const l of layers) {
        // 2. Crisp, luminescent administrative & country boundaries
        if (l.id && l.id.startsWith("boundary_") && l.paint?.["line-color"]) {
          l.paint["line-color"] = "#384d6b";
        }

        // 3. Crisp, highly legible silver place & country typography
        if (l.type === "symbol" && l.paint) {
          if (l.paint["text-color"]) {
            l.paint["text-color"] = "#d1d9e6";
          }
          if (l.paint["text-halo-color"]) {
            l.paint["text-halo-color"] = "rgba(9, 15, 25, 0.9)";
            l.paint["text-halo-width"] = 1.3;
          }
        }

        // 4. Subtle visible road network
        if (l.id && l.id.startsWith("highway_") && l.paint) {
          if (l.paint["line-color"] === "hsl(0,0%,7%)" || l.paint["line-color"] === "#000") {
            l.paint["line-color"] = "#202a3a";
          } else if (l.paint["line-color"] === "#181818" || l.paint["line-color"] === "#2a2a2a") {
            l.paint["line-color"] = "#2b384e";
          }
        }

        // 5. Subtle dark emerald nature & park areas
        if (l.id === "landcover_wood" || l.id === "landuse_park") {
          if (l.paint) l.paint["fill-color"] = "#14261f";
        }
      }
    }
  }

  initMap() {
    try {
      // Latitude clamp to valid Web Mercator data extent (±83.5°) — longitude is
      // left unconstrained (multiWorld) so panning wraps smoothly.
      const maxLat = fromLonLat([0, 83.5])[1];
      const minLat = fromLonLat([0, -83.5])[1];

      this.map = new OlMap({
        target: "map",
        layers: [],
        view: new View({
          center: fromLonLat([0.0, 20.0]),
          zoom: 3,
          minZoom: 2,
          maxZoom: 18,
          extent: [-Infinity, minLat, Infinity, maxLat],
          // Constrain the whole viewport to the extent, not just the center.
          // Web Mercator ends at ~±85° — past that there is no map to draw,
          // only background. With constrainOnlyCenter the center stopped at
          // the pole but the viewport kept going, so half the screen showed
          // that void (the "empty tiles": nothing was failing to load, there
          // was simply no world left there). Constraining the viewport stops
          // the pan at the edge instead, the way every other map app does.
          // OL handles the zoomed-way-out case where the world is shorter
          // than the viewport by centering it (see ol/centerconstraint.js).
          multiWorld: true,
        }),
        controls: [], // zoom controls are integrated into the radar panel instead
        // Map rotation is supported via two-finger twist on mobile and Alt+drag or Alt+Shift-drag on desktop,
        // with the interactive compass needle button resetting back to North.
        interactions: defaultInteractions({
          altShiftDragRotate: true,
          pinchRotate: true,
        }).extend([
          new DragRotate({ condition: altKeyOnly }),
        ]),
      });

      // Update compass button whenever map rotation changes
      this.map.getView().on("change:rotation", () => {
        this._updateCompass();
      });

      // Map label locale is synchronized with the app language below.
      this.mapLanguage = this.getSavedMapLanguage() || 'en';
    // i18n: detect and apply the user's preferred language.
    this.language = detectLocale();
    this.applyLanguage(this.language);
    this.applyUniversalTranslation(this.language);

      // Map style preference: 'street' | 'satellite' | 'terrain' | 'dark'
      const savedMapStyle = localStorage.getItem("aurafisky_map_style");
      this.mapStyle = savedMapStyle || (this.isDark ? "dark" : "street");

      // Map opacity: 0-1 range
      const savedOpacity = localStorage.getItem("aurafisky_map_opacity");
      this.mapOpacity = savedOpacity ? parseFloat(savedOpacity) : 1;

      // Terrain overlay toggle
      const savedTerrain = localStorage.getItem("aurafisky_terrain_overlay");
      this.terrainOverlayEnabled = savedTerrain !== null ? savedTerrain === "true" : false;

      // Map layers flyout state
      localStorage.removeItem("aurafisky_map_layers_minimized");
      this.mapLayersMinimized = false;

      // Instant global edge raster basemaps so the map paints in <50ms immediately
      // while OpenFreeMap vector styles stream in the background. Keyless, zero-watermark OSM raster fallback.
      const instantLightTile = new TileLayer({
        source: new XYZ({
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          maxZoom: 19,
          crossOrigin: "anonymous",
          cacheSize: 2048,
          attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
        zIndex: 0
      });
      const instantDarkTile = new TileLayer({
        className: "ol-dark-tile",
        source: new XYZ({
          url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
          maxZoom: 19,
          crossOrigin: "anonymous",
          cacheSize: 2048,
          attributions: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }),
        zIndex: 0
      });

      this.lightBasemap = new LayerGroup({ layers: [instantLightTile] });
      this.darkBasemap = new LayerGroup({ layers: [instantDarkTile] });

      // Satellite basemap: High-resolution Esri World Imagery + Reference Boundaries & Places
      // Native hardware-accelerated image pipeline with browser edge caching
      this.satelliteBasemap = new LayerGroup({
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 18,
              crossOrigin: "anonymous",
              cacheSize: 2048,
              attributions: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
            })
          }),
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 18,
              crossOrigin: "anonymous",
              cacheSize: 2048
            }),
            opacity: 0.95
          })
        ]
      });

      // Terrain basemap: Esri World Topo Map with mountain hillshading, contours, and physical relief
      this.terrainBasemap = new LayerGroup({
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 17,
              crossOrigin: "anonymous",
              attributions: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, USGS, FAO, NPS, NRCAN"
            }),
            preload: 1
          })
        ]
      });

      // Additional basemaps (hillshade, opentopo, ocean, natgeo) are created
      // below in the same style as the four above. Keeping them in a single
      // object makes adding a new layer a one-line change.
      this.hillshadeBasemap = new LayerGroup({
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 16,
              crossOrigin: "anonymous",
              attributions: "Tiles &copy; Esri &mdash; USGS, NGA, NASA, CGIAR, NCEAS, NLS, OS, NMA, Geodatastyrelsen, GSA, GSI, GIS, NOAA, NOAA NGDC"
            }),
            preload: 1
          })
        ]
      });
      this.openTopoBasemap = new LayerGroup({
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png",
              maxZoom: 17,
              crossOrigin: "anonymous",
              attributions: "Map data &copy; OpenStreetMap contributors, SRTM | Map style &copy; OpenTopoMap (CC-BY-SA)"
            }),
            preload: 1
          })
        ]
      });
      this.oceanBasemap = new LayerGroup({
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 10,
              crossOrigin: "anonymous",
              attributions: "Tiles &copy; Esri &mdash; Esri, GEBCO, NOAA, National Geographic, DeLorme, GEBCO, NOAA NGDC, and other contributors"
            }),
            preload: 1
          }),
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Reference/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 10,
              crossOrigin: "anonymous"
            }),
            opacity: 0.9,
            preload: 1
          })
        ]
      });
      this.natGeoBasemap = new LayerGroup({
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 12,
              crossOrigin: "anonymous",
              attributions: "Tiles &copy; Esri &mdash; National Geographic, Esri, DeLorme, NAVTEQ, UNEP-WCMC, USGS, NASA, ESA, METI, NRCAN, GEBCO, NOAA, iPC"
            }),
            preload: 1
          })
        ]
      });

      const initialGroup = {
        street: this.lightBasemap,
        dark: this.darkBasemap,
        satellite: this.satelliteBasemap,
        terrain: this.terrainBasemap,
        hillshade: this.hillshadeBasemap,
        opentopo: this.openTopoBasemap,
        ocean: this.oceanBasemap,
        natgeo: this.natGeoBasemap
      }[this.mapStyle] || (this.isDark ? this.darkBasemap : this.lightBasemap);

      this.map.addLayer(initialGroup);

      // Real vector basemap: OpenFreeMap's OpenMapTiles-schema tiles, styled
      // via the same Mapbox/MapLibre style JSON OpenFreeMap publishes,
      // rendered client-side by OpenLayers' Canvas 2D vector-tile renderer
      // (no WebGL dependency — see modules/map-language.js for why real
      // language switching needs vector tiles at all). Replaces the old
      // raster-tile setup, whose URLs were dead ends: OpenFreeMap serves
      // vector tiles only (a "?lang=en" raster PNG endpoint 404s on every
      // tile — part of the original "tiles render slow" complaint), and
      // OSM's raster server silently ignores "?lang=native". Style JSON is
      // fetched once per theme, localized for the current language (see
      // localizeGlStyle), and applied to a LayerGroup per theme so toggling
      // dark mode is just swapping which group is on the map.
      this._glStyleUrls = {
        light: "https://tiles.openfreemap.org/styles/liberty",
        dark: "https://tiles.openfreemap.org/styles/dark",
      };
      this._glStyles = {}; // cache of the raw (un-localized) fetched style JSON, by theme

      const loadBasemap = async (theme, group) => {
        try {
          const res = await fetch(this._glStyleUrls[theme]);
          const rawStyle = await res.json();
          this._enhanceBasemapVibrance(rawStyle, theme);
          this._glStyles[theme] = rawStyle;
          await applyMapboxStyle(group, localizeGlStyle(rawStyle, this.mapLanguage));
          // Preload 1 level of lower-resolution tiles beyond the viewport so
          // panning into new territory shows something immediately instead
          // of a blank tile while the full-res one is still being fetched
          // and parsed (vector tiles decode on the main thread — there's no
          // background worker like MapLibre GL had — so this preload buffer
          // is what actually keeps panning feeling smooth).
          for (const vtLayer of getMapboxLayers(group, "openmaptiles")) {
            vtLayer.setPreload(1);
          }
          // A location passed in on startup (shared link, restored session)
          // calls selectLocation() — and therefore view.animate() — before
          // this fetch resolves, while the map still has zero layers. OL
          // doesn't always notice that layers were added to a view that
          // already has stale frame state from animating before anything
          // was renderable: the map reports every layer/source as "ready"
          // but the canvas stays blank until something else nudges it. Force
          // that nudge here instead of relying on it happening implicitly.
          this.map.render();
        } catch (err) {
          console.error(`Basemap load failed (${theme}):`, err);
        }
      };
      // Load the visible theme first, on its own — fetching+parsing both
      // basemaps at once (the old behavior) doubled network requests and
      // main-thread parse work during the exact window the visible map is
      // trying to paint, which is real time added to "map loads slowly".
      // The other theme loads right after, still well before anyone would
      // toggle it, so switching dark/light stays instant.
      const activeTheme = this.isDark ? "dark" : "light";
      const inactiveTheme = this.isDark ? "light" : "dark";
      const activeGroup = this.isDark ? this.darkBasemap : this.lightBasemap;
      const inactiveGroup = this.isDark ? this.lightBasemap : this.darkBasemap;
      loadBasemap(activeTheme, activeGroup).then(() => {
        loadBasemap(inactiveTheme, inactiveGroup);
        this._updateMapStyleUI();
      });

      this.map.on("movestart", () => {
        if (this.radarPlaying) {
          this._radarWasPlayingBeforeMove = true;
          this.pauseRadarPlayback();
        }
        this._mapWasDragged = true;
      });

      // Track touch/drag start position to prevent accidental location selection
      // while panning on mobile. Consumed by _isDragGesture(), which every map
      // and marker click handler shares.
      this._touchStartPos = null;
      this._mapWasDragged = false;

      const mapContainer = this.map.getTargetElement();
      if (mapContainer) {
        mapContainer.addEventListener("pointerdown", (e) => {
          this._touchStartPos = { x: e.clientX, y: e.clientY };
          this._mapWasDragged = false;
        }, { passive: true });
      }

      // OL's View extent constraint (set above) already keeps latitude in
      // range on its own — no manual re-clamp-after-the-fact needed here,
      // unlike Leaflet's maxBounds which snapped back reactively.
      this.map.on("moveend", () => {
        if (this._radarWasPlayingBeforeMove) {
          this._radarWasPlayingBeforeMove = false;
          clearTimeout(this._radarResumeTimer);
          this._radarResumeTimer = setTimeout(() => {
            if (this.radarActive) this.startRadarPlayback();
          }, 500);
        }
      });

      // Bind map click handler with drag & threshold validation
      this.map.on("click", async (e) => {
        if (this._mapClickDebounce) return;

        // Dismiss virtual keyboard and search dropdown on map tap
        if (this.$.searchInput) {
          this.$.searchInput.blur();
        }
        if (this.$.searchDropdown) {
          this.$.searchDropdown.classList.remove("open");
          this._syncSearchAria();
        }

        // Dismiss open terms, info, or shortcuts modals on map click
        if (this.$.termsModal && this.$.termsModal.style.display !== "none" && !this.$.termsModal.classList.contains("hidden")) {
          this.hideTermsModal();
          return;
        }
        if (this.$.appInfoModal && this.$.appInfoModal.style.display !== "none" && !this.$.appInfoModal.classList.contains("hidden")) {
          if (this.toggleAppInfoModal) this.toggleAppInfoModal(false);
          return;
        }
        if (this.$.shortcutsModal && this.$.shortcutsModal.style.display !== "none" && !this.$.shortcutsModal.classList.contains("hidden")) {
          if (this.toggleShortcutsModal) this.toggleShortcutsModal(false);
          return;
        }

        // Ignore clicks triggered by panning/swiping gestures on mobile/desktop
        if (this._isDragGesture(e)) return;

        // While the route-drawing feature is active, a tap adds a route stop
        // and must not ALSO run the normal "select this location" flow below
        // — that used to fire on every stop-add, yanking the weather panel
        // and marker/tooltip to each new point in rapid succession (the
        // "popup disappears immediately" symptom when placing route stops).
        if (this._routeModeActive) return;

        // Check if click is near home pin (pixel distance) — a fallback for
        // taps that land just outside the marker's own DOM footprint;
        // direct hits are handled by the marker's own click listener, which
        // (via ol.Overlay's stopEvent) never reaches this handler at all.
        if (this._homeMarker && this.defaultLocation) {
          const markerPx = this.map.getPixelFromCoordinate(
            fromLonLat([this.defaultLocation.lng, this.defaultLocation.lat]),
          );
          if (markerPx) {
            const dist = Math.hypot(e.pixel[0] - markerPx[0], e.pixel[1] - markerPx[1]);
            if (dist < 20) {
              this.selectLocation(
                this.defaultLocation.lat,
                this.defaultLocation.lng,
                this.defaultLocation.name,
              );
              return;
            }
          }
        }
        this._mapClickDebounce = true;
        try {
          const [lng, lat] = toLonLat(e.coordinate);
          await this.handleMapClick(lat, lng);
        } catch (err) {
          console.error("Map click handler error:", err);
        } finally {
          setTimeout(() => (this._mapClickDebounce = false), 300);
        }
      });

      this.refreshBookmarkPins();

      // Restore the terminator overlay if it was on last session. Calling
      // the toggle with force:true (rather than just drawing directly) also
      // starts its 5-minute keep-alive timer, so a returning user with the
      // preference on doesn't need to touch the button for it to stay live.
      if (this.terminatorEnabled) this.toggleDayNightTerminator(true);

      this.hideLoadingOverlay();
      this.showToast("Click anywhere or search for a city!", "info");

      // Keep OL's idea of the viewport in sync with the container's real box.
      // OL caches the size it measured and renders tiles for that size only,
      // so any change it doesn't hear about leaves the map painted across
      // part of the container and blank for the rest. The window "resize"
      // and visualViewport listeners below miss the cases where the element
      // changes without the window doing so — --app-height being written by
      // viewport-height.js, Tailwind/CSS arriving late, fonts reflowing the
      // layout — which is what the staggered timeouts underneath were
      // guessing at. A ResizeObserver watches the element itself, so every
      // one of those is covered by observation instead of by guesswork.
      const mapEl = this.map.getTargetElement();
      if (mapEl && typeof ResizeObserver !== "undefined") {
        this._mapResizeObserver = new ResizeObserver(() => {
          this.map?.updateSize();
        });
        this._mapResizeObserver.observe(mapEl);
      }

      // Re-fit the map when the mobile URL bar shows/hides. The visual-viewport
      // resize/scroll wiring itself now lives in initMapViewportTracking()
      // (modules/viewport.js), started from init() — keeping it in one place
      // is what stops the two copies drifting, which is how --app-height ended
      // up written but never read.
      this._updateAppHeight();
    } catch (error) {
      console.error("Map initialization failed:", error);
      this.hideLoadingOverlay();
      this.showToast("Failed to load map. Refresh the page.", "error");
    }
  }

  // ================================================================
  //  UI INTERACTION & ACTION BINDINGS
  // ================================================================

  bindEvents() {
    // ── Search Dropdowns ──────────────────────────────────────
    this.$.searchInput.addEventListener("input", () =>
      this.handleSearchInput(),
    );
    this.$.searchClearBtn.addEventListener("click", () => this.clearSearch());

    // ── Filter Categories inside Search Dropdown ──────────────────
    if (this.$.searchFilterBar) {
      this.$.searchFilterBar.addEventListener("click", (e) => {
        const chip = e.target.closest(".search-filter-chip");
        if (chip && chip.dataset.filter) {
          this.setSearchFilter(chip.dataset.filter);
        }
      });
    }

    // ── Bookmarks Favorites ───────────────────────────────────
    this.$.bookmarksBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.showBookmarksOnMap = true;
      try { localStorage.setItem("aurafisky_show_bookmarks_map", "true"); } catch (_) {}
      this.updateBookmarksMapToggleUI?.();
      this.refreshBookmarkPins?.();
      if (this.bookmarks && this.bookmarks.length > 0) {
        const coords = this.bookmarks.map((b) => fromLonLat([b.lng, b.lat]));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        coords.forEach(([x, y]) => {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        });
        if (this.bookmarks.length === 1) {
          this.map?.getView().animate({ center: coords[0], zoom: 10, duration: 600 });
        } else {
          this.map?.getView().fit([minX, minY, maxX, maxY], { padding: [80, 80, 160, 80], maxZoom: 12, duration: 600 });
        }
      }
      this.$.bookmarksDropdown.classList.toggle("hidden");
      this._haptic('selection');
    });

    // Map Language Toggle
    this.$.mapLanguageToggle?.addEventListener("click", () => {
      const newLang = this.mapLanguage === 'en'
        ? this.getNativeMapLanguage()
        : 'en';
      this.setMapLanguage(newLang);
      this._haptic('selection');
    });

    this.$.closeBookmarksBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.$.bookmarksDropdown.classList.add("hidden");
      this.syncMobileBottomNavState?.();
      this._haptic('selection');
    });

    const exportBtn = document.getElementById("exportWorkspaceBtn");
    exportBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.exportWorkspace?.();
      this._haptic?.('selection');
    });

    const importInput = document.getElementById("importWorkspaceFileInput");
    importInput?.addEventListener("change", (e) => {
      const file = e.target?.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const text = ev.target?.result;
        if (text && typeof text === "string") {
          await this.importWorkspace?.(text);
          this._haptic?.('success');
        }
      };
      reader.readAsText(file);
      importInput.value = "";
    });
    if (this.$.toggleBookmarksMapBtn) {
      this.$.toggleBookmarksMapBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showBookmarksOnMap = !this.showBookmarksOnMap;
        localStorage.setItem("aurafisky_show_bookmarks_map", String(this.showBookmarksOnMap));
        this.updateBookmarksMapToggleUI();
        this.refreshBookmarkPins();
        this._haptic('selection');
      });
      this.updateBookmarksMapToggleUI();
    }
    this.$.homeToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this.defaultLocation && this.defaultLocation.lat != null) {
        this.toggleHomeDropdown();
      } else if (this.selectedLat != null && this.selectedLng != null) {
        this.setHomeLocation(this.selectedLat, this.selectedLng, this.selectedName);
      } else {
        this.showToast("📍 Tap any place on map or search a city, then tap Home to save your home.", "info");
      }
      this._haptic('light');
    });
    this.$.favoriteToggleBtn.addEventListener("click", () => {
      this.toggleFavoriteCurrentLocation();
      this._haptic('light');
    });
    this.$.setWallpaperBtn?.addEventListener("click", () => {
      this.toggleWallpaper();
      this._haptic('light');
    });

    // ── Wallpaper Overlay Controls ──────────────────────────────
    this.$.wallpaperCloseBtn?.addEventListener("click", () => {
      // Hide the overlay but keep the tabs — re-openable via the wallpaper
      // button or the W key. Only removing tabs (×) deletes the setup.
      this.hideWallpaperOverlay();
      this.isWallpaperMode = false;
      this.stopWallpaperAutoRotate();
      this.updateWallpaperButtonUI();
      this._haptic('selection');
    });
    this.$.wallpaperRefreshBtn?.addEventListener("click", () => {
      this.loadWallpaperDataForActiveTab();
      this._haptic('selection');
    });
    this.$.wallpaperAddTabBtn?.addEventListener("click", () => {
      this.openWallpaperAddTabModal();
      this._haptic('light');
    });

    this.$.wallpaperAddTabModalClose?.addEventListener("click", () => {
      this.closeWallpaperAddTabModal();
    });

    this.$.wallpaperAddTabModal?.addEventListener("click", (e) => {
      if (e.target === this.$.wallpaperAddTabModal) {
        this.closeWallpaperAddTabModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.$.wallpaperAddTabModal && !this.$.wallpaperAddTabModal.classList.contains("hidden")) {
        this.closeWallpaperAddTabModal();
      }
    });

    // Popular city presets click delegation
    this.$.wallpaperPopularCities?.addEventListener("click", (e) => {
      const chip = e.target.closest(".popular-city-chip");
      if (!chip) return;
      const lat = parseFloat(chip.dataset.lat);
      const lng = parseFloat(chip.dataset.lng);
      const name = chip.dataset.name;
      if (!isNaN(lat) && !isNaN(lng)) {
        this.addWallpaperTab(lat, lng, name);
        this.closeWallpaperAddTabModal();
        this._haptic('success');
      }
    });

    // Live search input in add-tab modal
    let tabSearchDebounce = null;
    this.$.wallpaperTabSearchInput?.addEventListener("input", (e) => {
      const val = (e.target.value || "").trim();
      if (this.$.wallpaperTabSearchClear) {
        this.$.wallpaperTabSearchClear.classList.toggle("hidden", !val);
      }
      if (tabSearchDebounce) clearTimeout(tabSearchDebounce);

      if (!val) {
        if (this.$.wallpaperTabSearchResults) {
          this.$.wallpaperTabSearchResults.innerHTML = "";
          this.$.wallpaperTabSearchResults.classList.add("hidden");
        }
        return;
      }

      tabSearchDebounce = setTimeout(async () => {
        try {
          const results = await WeatherService.searchLocations(val);
          if (!this.$.wallpaperTabSearchResults) return;
          this.$.wallpaperTabSearchResults.innerHTML = "";
          if (results && results.length > 0) {
            this.$.wallpaperTabSearchResults.classList.remove("hidden");
            results.slice(0, 5).forEach((loc) => {
              const itemBtn = document.createElement("button");
              itemBtn.type = "button";
              itemBtn.className = "w-full text-left px-3 py-2 rounded-lg bg-white/5 hover:bg-white/15 text-slate-200 hover:text-white transition-colors flex items-center justify-between gap-2 cursor-pointer border border-white/5";
              const dispName = loc.displayName || loc.name;
              itemBtn.innerHTML = `<span class="truncate font-medium text-xs">${dispName}</span><span class="text-[10px] text-slate-400 font-mono flex-shrink-0">${loc.latitude.toFixed(2)}°, ${loc.longitude.toFixed(2)}°</span>`;
              itemBtn.addEventListener("click", () => {
                this.addWallpaperTab(loc.latitude, loc.longitude, dispName);
                this.closeWallpaperAddTabModal();
                this._haptic('success');
              });
              this.$.wallpaperTabSearchResults.appendChild(itemBtn);
            });
          } else {
            this.$.wallpaperTabSearchResults.classList.remove("hidden");
            this.$.wallpaperTabSearchResults.innerHTML = '<div class="text-xs text-slate-400 px-3 py-2">No matching locations found.</div>';
          }
        } catch (_) {}
      }, 250);
    });

    this.$.wallpaperTabSearchClear?.addEventListener("click", () => {
      if (this.$.wallpaperTabSearchInput) {
        this.$.wallpaperTabSearchInput.value = "";
        this.$.wallpaperTabSearchInput.focus();
      }
      this.$.wallpaperTabSearchClear?.classList.add("hidden");
      if (this.$.wallpaperTabSearchResults) {
        this.$.wallpaperTabSearchResults.innerHTML = "";
        this.$.wallpaperTabSearchResults.classList.add("hidden");
      }
    });
    document.getElementById("wallpaperBrandLogo")?.addEventListener("click", (e) => {
      e.preventDefault();
      this.wallpaperBrandEnabled = !this.wallpaperBrandEnabled;
      if (this.wallpaperBrandEnabled) {
        this.showWallpaperBrandBg();
        if (this.$.wallpaperPhotoToggle) this.$.wallpaperPhotoToggle.checked = false;
        this.hideWallpaperPhotoBg();
        this.showToast("Aurafisky brand wallpaper enabled ✨", "success");
      } else {
        this.hideWallpaperBrandBg();
        this.showToast("Default dynamic background restored", "info");
      }
      if (this.$.wallpaperBrandToggle) this.$.wallpaperBrandToggle.checked = this.wallpaperBrandEnabled;
      if (this.wallpaperPersistEnabled) this.saveWallpaperToStorage();
      this._haptic('selection');
    });
    this.$.wallpaperAutoRotateBtn?.addEventListener("click", () => {
      this.toggleWallpaperAutoRotate();
      this._haptic('selection');
    });
    this.$.wallpaperHighContrastBtn?.addEventListener("click", () => {
      this.toggleWallpaperHighContrast();
      this._haptic('selection');
    });
    this.$.wallpaperShareBtn?.addEventListener("click", () => {
      this.shareWallpaper();
      this._haptic('light');
    });
    this.$.wallpaperSettingsBtn?.addEventListener("click", () => {
      this.showWallpaperSettings();
      this._haptic('selection');
    });
    this.$.wallpaperPickPhotoBtn?.addEventListener("click", () => {
      this.wallpaper?.pickPhoto?.();
      this._haptic('selection');
    });
    this.$.wallpaperClearPhotoBtn?.addEventListener("click", () => {
      this.wallpaper?.clearPhoto?.();
      this._haptic('selection');
    });
    this.$.wallpaperDeviceBtn?.addEventListener("click", () => {
      this.wallpaper?.setDeviceWallpaper?.();
      this._haptic('selection');
    });
    this.$.wallpaperAlertDismiss?.addEventListener("click", () => {
      this.dismissWallpaperAlert();
      this._haptic('light');
    });
    this.$.wallpaperFullscreenBtn?.addEventListener("click", () => {
      this.toggleWallpaperFullscreen();
      this._haptic('selection');
    });
    this.$.wallpaperExportBtn?.addEventListener("click", () => {
      this.exportWallpaperImage();
      this._haptic('medium');
    });
    this.$.wallpaperSettingsCloseBtn?.addEventListener("click", () => {
      this.hideWallpaperSettings();
      this._haptic('selection');
    });

    // Settings panel controls
    this.$.wallpaperRefreshIntervalSelect?.addEventListener("change", (e) => {
      this.wallpaperRefreshInterval = parseInt(e.target.value, 10) || 300000;
      if (this.isWallpaperMode) this.startWallpaperAutoRefresh();
      this._haptic('selection');
    });
    this.$.wallpaperAutoRotateToggle?.addEventListener("change", (e) => {
      this.wallpaperAutoRotateEnabled = e.target.checked;
      if (this.wallpaperAutoRotateEnabled) {
        this.startWallpaperAutoRotate();
        this.showToast("Auto-rotate enabled", "success");
      } else {
        this.stopWallpaperAutoRotate();
        this.showToast("Auto-rotate disabled", "info");
      }
      this.updateAutoRotateButtonUI();
      this._haptic('selection');
    });
    this.$.wallpaperRotateIntervalSelect?.addEventListener("change", (e) => {
      this.wallpaperAutoRotateInterval = parseInt(e.target.value, 10) || 300000;
      if (this.wallpaperAutoRotateEnabled) this.startWallpaperAutoRotate();
      this._haptic('selection');
    });
    this.$.wallpaperSoundToggle?.addEventListener("change", (e) => {
      this.setWallpaperSoundscape(e.target.checked);
      this._haptic('selection');
    });
    this.$.wallpaperNotifyRain?.addEventListener("change", (e) => {
      this.wallpaperNotificationThresholds.rain = e.target.checked;
      this._haptic('selection');
    });
    this.$.wallpaperNotifyTempDrop?.addEventListener("change", () => {
      this.wallpaperNotificationThresholds.tempDrop = parseInt(this.$.wallpaperNotifyTempDrop.value, 10) || 5;
      this._haptic('selection');
    });
    this.$.wallpaperNotifyUV?.addEventListener("change", () => {
      this.wallpaperNotificationThresholds.uvHigh = parseInt(this.$.wallpaperNotifyUV.value, 10) || 7;
      this._haptic('selection');
    });
    this.$.wallpaperNotifyWind?.addEventListener("change", () => {
      this.wallpaperNotificationThresholds.windHigh = parseInt(this.$.wallpaperNotifyWind.value, 10) || 40;
      this._haptic('selection');
    });
    this.$.wallpaperHCSetting?.addEventListener("change", (e) => {
      if (this.wallpaperHighContrast !== e.target.checked) this.toggleWallpaperHighContrast();
      this._haptic('selection');
    });
    this.$.wallpaperBrandToggle?.addEventListener("change", (e) => {
      this.wallpaperBrandEnabled = e.target.checked;
      if (this.wallpaperBrandEnabled) {
        this.showWallpaperBrandBg();
        if (this.$.wallpaperPhotoToggle) this.$.wallpaperPhotoToggle.checked = false;
        this.hideWallpaperPhotoBg();
        this.showToast("Aurafisky brand wallpaper enabled", "success");
      } else {
        this.hideWallpaperBrandBg();
        this.showToast("Brand wallpaper disabled", "info");
      }
      if (this.wallpaperPersistEnabled) this.saveWallpaperToStorage();
      this._haptic('selection');
    });
    this.$.wallpaperPhotoToggle?.addEventListener("change", (e) => {
      this.wallpaperPhotoEnabled = e.target.checked;
      if (this.wallpaperPhotoEnabled) {
        this.showWallpaperPhotoBg();
        this.showToast("Scenic photo background enabled", "success");
      } else {
        this.hideWallpaperPhotoBg();
        this.showToast("Photo background disabled", "info");
      }
      this._haptic('selection');
    });
    this.$.wallpaperPersistToggle?.addEventListener("change", (e) => {
      this.wallpaperPersistEnabled = e.target.checked;
      if (this.wallpaperPersistEnabled) {
        this.saveWallpaperToStorage();
        this.showToast("Wallpaper will be remembered on reload", "success");
      } else {
        this.clearWallpaperStorage();
        this.showToast("Wallpaper persistence disabled", "info");
      }
      this._haptic('selection');
    });
    this.$.wallpaperWakeLockToggle?.addEventListener("change", (e) => {
      this.wallpaperWakeLockEnabled = e.target.checked;
      if (this.wallpaperWakeLockEnabled && this.isWallpaperMode) {
        this.requestWallpaperWakeLock();
      } else {
        this.releaseWallpaperWakeLock();
      }
      this._haptic('selection');
    });
    this.$.wallpaperGeofenceToggle?.addEventListener("change", (e) => {
      if (this.wallpaperGeofenceEnabled !== e.target.checked) this.toggleWallpaperGeofence();
      this._haptic('selection');
    });

    // Track fullscreen changes (user can also exit via F11/Esc)
    document.addEventListener("fullscreenchange", () => {
      this.wallpaperFullscreenActive = !!document.fullscreenElement;
      this.updateFullscreenButtonUI();
    });


    // Touch events for swipe-to-close
    this.$.wallpaperOverlay?.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) {
        this.wallpaperTouchStartY = e.touches[0].clientY;
        this.wallpaperTouchActive = true;
      }
    }, { passive: true });

    this.$.wallpaperOverlay?.addEventListener("touchmove", (e) => {
      if (!this.wallpaperTouchActive || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - this.wallpaperTouchStartY;
      if (dy > 0) {
        e.preventDefault();
        this.$.wallpaperOverlay.style.transform = `translateY(${dy}px)`;
        this.$.wallpaperOverlay.style.transition = "none";
      }
    }, { passive: false });

    this.$.wallpaperOverlay?.addEventListener("touchend", (e) => {
      if (!this.wallpaperTouchActive) return;
      const dy = e.changedTouches[0].clientY - this.wallpaperTouchStartY;
      this.wallpaperTouchActive = false;
      this.$.wallpaperOverlay.style.transition = "";
      if (dy > 100) {
        // Swipe-down hides the overlay but keeps the tabs
        this.hideWallpaperOverlay();
        this.isWallpaperMode = false;
        this.stopWallpaperAutoRotate();
        this.updateWallpaperButtonUI();
      } else {
        this.$.wallpaperOverlay.style.transform = "";
      }
    }, { passive: true });

    // Tab click delegation — check close FIRST: the close button lives inside
    // a tab element, so closest() matches both and the order decides behavior.
    this.$.wallpaperTabContainer?.addEventListener("click", (e) => {
      const closeBtn = e.target.closest('[data-wallpaper-close]');
      if (closeBtn) {
        e.stopPropagation();
        const index = parseInt(closeBtn.dataset.wallpaperClose, 10);
        this.removeWallpaperTab(index);
        return;
      }
      const tab = e.target.closest('[data-wallpaper-tab]');
      if (tab) {
        const index = parseInt(tab.dataset.wallpaperTab, 10);
        this.switchWallpaperTab(index);
      }
    });

    // ── Map Controls ──────────────────────────────────────────
    // Pre-warm GPS so the first click on "My Location" resolves instantly — but
    // ONLY when permission has already been granted. Calling getCurrentPosition
    // on hover would raise the permission prompt with no user action to explain
    // it, and a reflexive "Block" poisons the origin permanently.
    const prewarmGPS = () => {
      if (!navigator.geolocation || this._gpsWarmed) return;
      this._gpsWarmed = true;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this._lastKnownGpsCoords = pos.coords;
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
      );
    };
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (status.state === "granted") prewarmGPS();
        })
        .catch(() => {});
    }

    this.$.myLocationBtn.addEventListener("click", () => {
      this.getMyLocation();
      this._haptic('light');
    });
    this.$.panelCloseBtn.addEventListener("click", () => {
      this.hideWeatherPanel();
      this._haptic('selection');
    });
    this.$.panelExpandWideBtn?.addEventListener("click", () => {
      this.toggleWideWeatherPanel();
      this._haptic('selection');
    });
    this.$.panelMinimizeBtn?.addEventListener("click", () => {
      this.toggleMinimizeWeatherPanel();
      this._haptic('selection');
    });
    this.$.compareCloseBtn?.addEventListener("click", () => {
      this.hideComparePanel?.();
      this._haptic('selection');
    });

    // ── Account & Settings Dialogs Toggles ────────────────────
    if (this.$.googleSignInBtn) {
      this.$.googleSignInBtn.addEventListener("click", () =>
        this.signInWithGoogle(),
      );
    }
    if (this.$.googleSignOutBtn) {
      this.$.googleSignOutBtn.addEventListener("click", () =>
        this.signOutUser(),
      );
    }
    if (this.$.profileBtn) {
      this.$.profileBtn.addEventListener("click", () => {
        this.toggleAccountDialog();
        this._haptic('selection');
      });
    }
    if (this.$.accountDialog) {
      this.$.accountDialog.addEventListener("click", (e) => {
        // If they click on the backdrop itself (not the inner modal)
        if (e.target === this.$.accountDialog) {
          this.toggleAccountDialog(false);
        }
      });
    }
    if (this.$.accountCloseBtn) {
      this.$.accountCloseBtn.addEventListener("click", () => {
        this.toggleAccountDialog(false);
        this._haptic('selection');
      });
    }
    if (this.$.accountSettingsBtn) {
      this.$.accountSettingsBtn.addEventListener("click", () => {
        this.toggleAccountDialog(false);
        this.toggleSettingsPanel(true);
        this._haptic('selection');
      });
    }
    if (this.$.settingsCloseBtn) {
      this.$.settingsCloseBtn.addEventListener("click", () => {
        this.toggleSettingsPanel(false);
        this._haptic('selection');
      });
    }
    if (this.$.settingsPanel) {
      this.$.settingsPanel.addEventListener("click", (e) => {
        const content = this.$.settingsPanel.children[1];
        if (content && !content.contains(e.target)) {
          this.toggleSettingsPanel(false);
        }
      });
    }

    // ── Volume Control (now in settings panel) ────────────────
    if (this.$.settingsVolumeSlider) {
      this.$.settingsVolumeSlider.addEventListener("input", (e) => {
        this.handleVolumeChange(parseInt(e.target.value, 10) / 100);
      });
      this.$.settingsVolumeSlider.addEventListener("change", () => {
        this.saveUserDataToCloud();
      });
    }

    // ── Settings Panel Toggles (always active, not Firebase-dependent) ──
    if (this.$.settingsUnitsToggle) {
      this.$.settingsUnitsToggle.addEventListener("change", (e) => {
        const useFahrenheit = e.target.checked;
        WeatherService.setUnits(useFahrenheit ? "imperial" : "metric");
        this.syncUnitLabel();
        if (this.weatherData)
          this.updateWeatherDisplay(parseInt(this.$.timelineSlider.value, 10));
        this.saveUserDataToCloud();
        this.syncBus?.syncUnits(WeatherService.getUnits());
        this._haptic('selection');
      });
    }
    if (this.$.settingsThemeToggle) {
      this.$.settingsThemeToggle.addEventListener("change", () => {
        this.toggleDarkMode();
        this.saveUserDataToCloud();
        this._haptic('selection');
      });
    }
    if (this.$.settingsSoundToggle) {
      this.$.settingsSoundToggle.addEventListener("change", (e) => {
        this.toggleAmbientSoundscape(e.target.checked);
        this.saveUserDataToCloud();
        this._haptic('selection');
      });
    }
    if (this.$.settingsTimeline24hToggle) {
      this.$.settingsTimeline24hToggle.addEventListener("change", (e) => {
        this.timeline24hMode = e.target.checked;
        localStorage.setItem("aurafisky_timeline_24h", this.timeline24hMode);
        if (this.weatherData) this.initTimeline();
        this.saveUserDataToCloud();
        this._haptic('selection');
      });
    }
    if (this.$.settingsMapLanguageToggle) {
      this.$.settingsMapLanguageToggle.addEventListener("change", (e) => {
        const newLang = e.target.checked ? this.getNativeMapLanguage() : 'en';
        this.setMapLanguage(newLang);
        this._haptic('selection');
      });
    }
    if (this.$.settingsAppLanguageSelect) {
      const currentLang = localStorage.getItem("aurafisky_lang") || this.language || "en";
      this.$.settingsAppLanguageSelect.value = currentLang;
      this.$.settingsAppLanguageSelect.addEventListener("change", (e) => {
        const selected = e.target.value;
        this.setLanguage(selected);
        this._haptic?.('selection');
      });
    }

    // ── Map Modes & Terrain Switcher ──────────────────────────
    if (this.$.mapLayersBtn) {
      this.$.mapLayersBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleMapLayersFlyout();
        this._haptic?.('selection');
      });
    }

    const styleCards = document.querySelectorAll(".map-style-card");
    styleCards.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const style = btn.getAttribute("data-map-style");
        if (style) this.setMapStyle(style);
        this.toggleMapLayersFlyout(false);
        this._haptic?.('selection');
      });
    });

    // ── Map Opacity Slider ──────────────────────────
    const opacitySlider = document.getElementById("mapOpacitySlider");
    const opacityValue = document.getElementById("mapOpacityValue");
    if (opacitySlider && opacityValue) {
      opacitySlider.addEventListener("input", (e) => {
        const val = parseInt(e.target.value, 10);
        opacityValue.textContent = `${val}%`;
        this.mapOpacity = val / 100;
        try {
          localStorage.setItem("aurafisky_map_opacity", String(this.mapOpacity));
        } catch (_) {}
        this._applyMapOpacity();
        this._haptic?.('selection');
      });
    }

    // ── Terrain Overlay Toggle ──────────────────────
    const terrainToggle = document.getElementById("terrainOverlayToggle");
    if (terrainToggle) {
      terrainToggle.addEventListener("change", (e) => {
        this.terrainOverlayEnabled = e.target.checked;
        try {
          localStorage.setItem("aurafisky_terrain_overlay", String(this.terrainOverlayEnabled));
        } catch (_) {}
        this._applyTerrainOverlay();
        this._updateMapColorLegend?.();
        this._haptic?.('selection');
      });
    }

    // ── Temperature Grid Overlay Toggle ───────────────
    const tempGridToggle = document.getElementById("tempGridOverlayToggle");
    if (tempGridToggle) {
      tempGridToggle.addEventListener("change", (e) => {
        this.toggleTemperatureOverlay(e.target.checked);
        this._haptic?.('selection');
      });
    }

    // ── Map Key / Legend Button in Flyout ─────────────
    document.getElementById("toggleMapLegendCardBtn")?.addEventListener("click", () => {
      const card = document.getElementById("mapLegendCard");
      const pill = document.getElementById("mapLegendPillBtn");
      if (card) card.classList.remove("hidden");
      pill?.setAttribute("aria-expanded", "true");
      this.toggleMapLayersFlyout(false);
      this._haptic?.('selection');
    });

    this._initMapColorLegend();


    document.getElementById("closeMapLayersBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMapLayersFlyout(false);
      this._haptic?.('selection');
    });

    const mapModeSelect = document.getElementById("mapModeSelectDropdown");
    if (mapModeSelect) {
      const handleModeChange = (e) => {
        const val = e.target.value;
        if (val) {
          this.setMapStyle(val);
          this._haptic?.('selection');
        }
      };
      mapModeSelect.addEventListener("change", handleModeChange);
      mapModeSelect.addEventListener("input", handleModeChange);
    }

    document.getElementById("prevMapModeBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleMapStyle(-1);
      this._haptic?.('selection');
    });

    document.getElementById("nextMapModeBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleMapStyle(1);
      this._haptic?.('selection');
    });

    // Home Location Dropdown Options
    document.getElementById("closeHomeDropdownBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleHomeDropdown(false);
      this._haptic?.('light');
    });

    document.getElementById("homeDropdownGoBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleHomeDropdown(false);
      this.goToHomeLocation?.();
      this._haptic?.('selection');
    });

    document.getElementById("homeDropdownSetCurrentBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleHomeDropdown(false);
      if (this.selectedLat != null && this.selectedLng != null) {
        this.setHomeLocation?.(this.selectedLat, this.selectedLng, this.selectedName);
      } else {
        this.showToast("Select a location on the map first.", "info");
      }
      this._haptic?.('selection');
    });

    document.getElementById("homeDropdownRemoveBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleHomeDropdown(false);
      this.removeHomeLocation?.();
      this._haptic?.('selection');
    });

    document.getElementById("minimizeMapLayersBtn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMapLayersMinimized();
      this._haptic?.('selection');
    });

    document.getElementById("mapLayersHeaderTitle")?.addEventListener("click", (e) => {
      if (this.$.mapLayersFlyout?.classList.contains("minimized")) {
        e.stopPropagation();
        this.toggleMapLayersMinimized(false);
        this._haptic?.('selection');
      }
    });

    document.getElementById("mapLayersActiveBadge")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.cycleMapStyle(1);
      this._haptic?.('selection');
    });

    this.$.mapLayersFlyout?.addEventListener("click", (e) => {
      if (this.$.mapLayersFlyout.classList.contains("minimized") && !e.target.closest("#closeMapLayersBtn") && !e.target.closest("#minimizeMapLayersBtn")) {
        this.toggleMapLayersMinimized(false);
        this._haptic?.('selection');
      }
    });

    document.getElementById("mapLayersBackdrop")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMapLayersFlyout(false);
      this._haptic?.('selection');
    });

    document.addEventListener("click", (e) => {
      if (
        this.$.mapLayersFlyout &&
        !this.$.mapLayersFlyout.classList.contains("hidden") &&
        !this.$.mapLayersFlyout.contains(e.target) &&
        !this.$.mapLayersBtn?.contains(e.target)
      ) {
        this.toggleMapLayersFlyout(false);
      }
    });

    if (this.$.settingsMapStyleSelect) {
      this.$.settingsMapStyleSelect.addEventListener("change", (e) => {
        this.setMapStyle(e.target.value);
        this._haptic?.('selection');
      });
    }

    if (this.$.settingsDeleteDataBtn) {
      this.$.settingsDeleteDataBtn.addEventListener("click", () => {
        this.deleteCloudUserData();
        this._haptic('warning');
      });
    }

    // ── Terms & Privacy Modal Controls ────────────────────────
    if (this.$.settingsTermsBtn) {
      this.$.settingsTermsBtn.addEventListener("click", () =>
        this.showTermsModal(),
      );
    }
    if (this.$.termsCornerLink) {
      this.$.termsCornerLink.addEventListener("click", () =>
        this.showTermsModal(),
      );
    }
    if (this.$.termsCloseBtn) {
      this.$.termsCloseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.hideTermsModal();
        this._haptic('selection');
      });
    }
    if (this.$.termsAcceptBtn) {
      this.$.termsAcceptBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.termsAccepted = true;
        try {
          localStorage.setItem("aurafisky_terms_accepted", "true");
          localforage.setItem("termsAccepted", true);
        } catch (_) {}
        this.hideTermsModal();
        this.saveUserDataToCloud();
        this.showToast("Terms & Conditions accepted.", "success");
        this._haptic('selection');
      });
    }
    if (this.$.termsModal) {
      this.$.termsModal.addEventListener("click", (e) => {
        const dialog = this.$.termsModal.firstElementChild;
        if (!dialog || !dialog.contains(e.target)) {
          this.hideTermsModal();
        }
      });
    }
    if (this.$.extremesPanel) {
      this.$.extremesPanel.addEventListener("click", (e) => {
        const dialog = this.$.extremesPanel.firstElementChild;
        if (!dialog || !dialog.contains(e.target)) {
          this.closeExtremesPanel();
        }
      });
    }
    if (this.$.copyContactEmailBtn) {
      this.$.copyContactEmailBtn.addEventListener("click", () => {
        navigator.clipboard
          .writeText("applicationmanifester@gmail.com")
          .then(() => {
            this.showToast("Email copied to clipboard!", "success");
            const btn = this.$.copyContactEmailBtn;
            const originalText = btn.textContent;
            btn.textContent = "Email copied!";
            btn.disabled = true;
            setTimeout(() => {
              btn.textContent = originalText;
              btn.disabled = false;
            }, 2000);
          })
          .catch(() => {
            this.showToast("Could not copy email.", "error");
          });
      });
    }

    // ── Additional Settings & Location Controls ──────────────
    if (this.$.settingsSyncHistoryToggle) {
      this.$.settingsSyncHistoryToggle.addEventListener("change", (e) => {
        this.syncHistory = e.target.checked;
        this.saveUserDataToCloud();
      });
    }
    if (this.$.settingsClearCacheBtn) {
      this.$.settingsClearCacheBtn.addEventListener("click", () => {
        this.clearLocalCaches();
      });
    }
    if (this.$.setDefaultLocationBtn) {
      this.$.setDefaultLocationBtn.addEventListener("click", async () => {
        if (this.selectedLat == null || this.selectedLng == null) {
          this.showToast("Please select a location on the map first.", "info");
          return;
        }
        this.defaultLocation = {
          lat: this.selectedLat,
          lng: this.selectedLng,
          name:
            this.selectedName ||
            `${this.selectedLat.toFixed(4)}, ${this.selectedLng.toFixed(4)}`,
        };
        this.updateHomeButton();
        this.updateHomeMarker();
        this.updateSettingsUIFromLocal();
        this.syncBus?.syncDefaultLocation(
          this.defaultLocation,
          this.defaultLocationNotify,
          this.notifyIntervalMin,
        );
        await this.saveUserDataToCloud();
        this.showToast("Default location updated.", "success");

        if (this.defaultLocationNotify) {
          this.checkAndSendHourlyNotification(true);
        }
      });
    }
    if (this.$.defaultLocationNotifyToggle) {
      this.$.defaultLocationNotifyToggle.addEventListener(
        "change",
        async (e) => {
          if (!this.defaultLocation) {
            this.showToast("Please set a default location first.", "info");
            e.target.checked = false;
            return;
          }
          if (e.target.checked) {
            if ("Notification" in window) {
              const permission = await Notification.requestPermission();
              if (permission !== "granted") {
                this.showToast("Notification permission denied.", "error");
                e.target.checked = false;
                this.defaultLocationNotify = false;
                await this.saveUserDataToCloud();
                return;
              }
            } else {
              this.showToast(
                "Notifications are not supported in this browser.",
                "error",
              );
              e.target.checked = false;
              return;
            }
            this.defaultLocationNotify = true;
            this.showToast(
              "Hourly weather notifications enabled.",
              "success",
            );
            this.checkAndSendHourlyNotification(true);
            this.initPushNotifications();
          } else {
            this.defaultLocationNotify = false;
            this.showToast(
              "Hourly weather notifications disabled.",
              "success",
            );
          }
          this.updateSettingsUIFromLocal();
          this.setupHourlyNotifications();
          await this.saveUserDataToCloud();
        },
      );
    }
    if (this.$.notifyIntervalSelect) {
      this.$.notifyIntervalSelect.addEventListener("change", (e) => {
        const minutes = parseInt(e.target.value, 10) || 60;
        this.notifyIntervalMin = minutes;
        if (this.defaultLocationNotify) {
          this.setupHourlyNotifications();
          this.showToast(`Notifications every ${minutes} min`, "success");
        }
        this.saveUserDataToCloud();
      });
    }

    // ── Time Slider ───────────────────────────────────────────
    let _lastSliderVal = -1;
    this.$.timelineSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
      const hourIndex = val + timeOffset;
      this.handleTimelineChange(val);
      this.updateTimelineTooltip(hourIndex);
      this._updateTrackFill(val);
      // Discrete integer hour boundary crossed -> trigger 8ms micro-tick (<=12Hz)
      if (val !== _lastSliderVal) {
        this.hapticEngine?.trigger('hourlyTick', this.$.timelineSlider);
        _lastSliderVal = val;
      }
    });
    this.$.timelineSlider.addEventListener("change", () => {
      _lastSliderVal = -1; // reset on release
      if (this._tooltipHideTimer) clearTimeout(this._tooltipHideTimer);
      this._tooltipHideTimer = setTimeout(() => {
        if (this.$.timelineTooltip)
          this.$.timelineTooltip.classList.add("hidden");
      }, 2500);
    });

    // ── Weather Panel Weather Card Preset Buttons & Dropdown ─────────────────
    const presetSelect = document.getElementById("wallpaperPresetSelect");
    if (presetSelect) {
      presetSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        if (!val) return;
        this.setWallpaperPreset(val);
        this._haptic?.('selection');
      });
    }
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const preset = btn.dataset.preset;
        if (!preset) return;
        this.setWallpaperPreset(preset);
        this._haptic?.('selection');
      });
    });

    // ── Location Address Details Toggle & Copy ─────────────────────
    const copyAddressBtn = document.getElementById("copyAddressBtn");
    if (copyAddressBtn) {
      copyAddressBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const textToCopy = this._currentFullAddress || this.selectedName || "";
        if (!textToCopy) return;
        try {
          await navigator.clipboard.writeText(textToCopy);
          const btnText = document.getElementById("copyAddressBtnText");
          if (btnText) btnText.textContent = "Copied!";
          this.showToast("📍 Address copied to clipboard", "success");
          this._haptic?.('selection');
          setTimeout(() => {
            if (btnText) btnText.textContent = "Copy";
          }, 2000);
        } catch (_) {
          this.showToast(textToCopy, "info");
        }
      });
    }

    const toggleAddressBtn = document.getElementById("toggleAddressCardBtn");
    const addressHeader = document.getElementById("locationAddressHeader");
    const addressContent = document.getElementById("locationAddressContent");
    const addressToggleIcon = document.getElementById("toggleAddressCardIcon");
    const addressToggleText = document.getElementById("toggleAddressCardText");

    const toggleAddressDetails = (force) => {
      if (!addressContent) return;
      const isCurrentlyHidden = addressContent.classList.contains("hidden");
      const shouldShow = force !== undefined ? force : isCurrentlyHidden;
      if (shouldShow) {
        addressContent.classList.remove("hidden");
        if (addressToggleText) addressToggleText.textContent = "Hide";
        if (addressToggleIcon) addressToggleIcon.classList.add("rotate-180");
        toggleAddressBtn?.setAttribute("aria-expanded", "true");
        addressHeader?.setAttribute("aria-expanded", "true");
      } else {
        addressContent.classList.add("hidden");
        if (addressToggleText) addressToggleText.textContent = "Details";
        if (addressToggleIcon) addressToggleIcon.classList.remove("rotate-180");
        toggleAddressBtn?.setAttribute("aria-expanded", "false");
        addressHeader?.setAttribute("aria-expanded", "false");
      }
    };

    if (toggleAddressBtn) {
      toggleAddressBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleAddressDetails();
      });
    }
    const locationAddressCoords = document.getElementById("locationAddressCoords");
    if (locationAddressCoords) {
      locationAddressCoords.addEventListener("click", async (e) => {
        e.stopPropagation();
        const coordsText = document.getElementById("locationAddressCoordsText")?.textContent?.trim();
        if (!coordsText) return;
        try {
          await navigator.clipboard.writeText(coordsText);
          this.showToast(`📍 Coordinates copied: ${coordsText}`, "success");
          this._haptic?.('selection');
        } catch (_) {
          this.showToast(coordsText, "info");
        }
      });
    }

    if (addressHeader) {
      addressHeader.addEventListener("click", (e) => {
        if (e.target.closest("#copyAddressBtn, #locationAddressCoords")) return;
        toggleAddressDetails();
      });
      addressHeader.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleAddressDetails();
        }
      });
    }

    if (this.$.nowIndicator) {
      this.$.nowIndicator.addEventListener("click", () => this.jumpToNow());
    }
    if (this.$.timelineBadge) {
      this.$.timelineBadge.addEventListener("click", () => this.jumpToNow());
    }

    // ── Timeline Minimise/Expand controls ─────────────────────
    if (this.$.timelineMinimiseBtn) {
      this.$.timelineMinimiseBtn.addEventListener("click", () => {
        this.toggleTimelineMinimized(true);
        this._haptic('selection');
      });
    }
    if (this.$.timelineMinimizedTrigger) {
      this.$.timelineMinimizedTrigger.addEventListener("click", () => {
        this.toggleTimelineMinimized(false);
        this._haptic('selection');
      });
    }

    // ── Weather Overlay controls ────────────────────────────────
    this.$.zoomInBtn?.addEventListener("click", () => {
      this._zoomBy(1);
      this._haptic('selection');
    });
    this.$.zoomOutBtn?.addEventListener("click", () => {
      this._zoomBy(-1);
      this._haptic('selection');
    });
    this.$.compassBtn?.addEventListener("click", () => {
      this.resetRotation();
    });
    this.$.resetViewBtn?.addEventListener("click", () => this.resetView());
    this.$.radarToggleBtn.addEventListener("click", () => {
      this.toggleRadar();
      this._haptic('light');
    });

    this.$.navigateHereBtn?.addEventListener("click", () => {
      this.startNavigationPreview();
      this._haptic('light');
    });
    this.$.weatherRetryBtn?.addEventListener("click", () => {
      this._haptic('light');
      if (this.selectedLat != null && this.selectedLng != null) {
        this.selectLocation(this.selectedLat, this.selectedLng, this.selectedName);
      }
    });
    this.$.weatherViewCachedBtn?.addEventListener("click", () => {
      this._haptic('light');
      if (this.selectedLat != null && this.selectedLng != null) {
        const cached = this.getNearestCachedLocation(this.selectedLat, this.selectedLng);
        if (cached?.forecast) {
          this.weatherData = cached.forecast;
          this.airQualityData = cached.airQuality;
          this.currentHourIndex = WeatherService.getCurrentHourIndex(
            this.weatherData,
            this.weatherData?.utc_offset_seconds || 0,
          );
          this.updateOfflineBadge(true);
          this.initTimeline();
          this.updateWeatherDisplay(this.currentHourIndex);
          this._setWeatherPanelState("content");
        }
      }
    });
    this.$.navCancelPreviewBtn?.addEventListener("click", () => this.cancelNavigation());
    this.$.navStartBtn?.addEventListener("click", () => this.beginTurnByTurn());
    this.$.navStopBtn?.addEventListener("click", () => this.cancelNavigation());
    this.$.navMuteBtn?.addEventListener("click", () => this.toggleNavMute());

    this.$.terminatorToggleBtn?.addEventListener("click", () => {
      this.toggleDayNightTerminator();
      this._haptic('light');
    });

    this.$.isobarToggleBtn?.addEventListener("click", () => {
      this.toggleIsobars();
      this._haptic('light');
    });

    this.$.extremesBtn?.addEventListener("click", () => {
      this.openExtremesPanel();
      this._haptic('light');
    });
    this.$.extremesCloseBtn?.addEventListener("click", () => {
      this.closeExtremesPanel();
    });

    if (
      this.$.radarMinimizeBtn &&
      this.$.radarCollapsedBtn &&
      this.$.radarExpandedPanel
    ) {
      this.$.radarMinimizeBtn.addEventListener("click", () => {
        this.$.radarExpandedPanel.classList.add("hidden");
        document.getElementById("radarBackdrop")?.classList.add("hidden");
        this.$.radarCollapsedBtn.classList.remove("hidden");
        this.popHistoryOverlay?.("radar");
        this._haptic('selection');
      });
      this.$.radarCollapsedBtn.addEventListener("click", () => {
        this.$.radarCollapsedBtn.classList.add("hidden");
        this.$.radarExpandedPanel.classList.remove("hidden");
        document.getElementById("radarBackdrop")?.classList.remove("hidden");
        this.pushHistoryOverlay?.("radar");
        this._haptic('selection');
      });
    }

    document.getElementById("radarBackdrop")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.$.radarExpandedPanel?.classList.add("hidden");
      document.getElementById("radarBackdrop")?.classList.add("hidden");
      this.$.radarCollapsedBtn?.classList.remove("hidden");
      this.popHistoryOverlay?.("radar");
      this._haptic?.('selection');
    });
    this.$.layerTypeSelect.addEventListener("change", (e) => {
      this._haptic('selection');
      this.overlayType = e.target.value;
      if (this.radarActive) {
        if (this.overlayType === "temperature") {
          this.stopRadarPlayback();
          this.clearTempOverlay();
          this.initTempOverlayLayers();
          this.$.radarPlayback.classList.add("hidden");
          if (this.$.legendPrecip) this.$.legendPrecip.classList.add("hidden");
          if (this.$.legendTemp) this.$.legendTemp.classList.remove("hidden");
          this.radarActive = true;
          this.activeEffectType = "none";
        } else if (this.overlayType === "wind") {
          this.stopRadarPlayback();
          this.clearRadarLayers();
          this.clearTempOverlay();
          this.$.radarPlayback.classList.add("hidden");
          if (this.$.legendPrecip) this.$.legendPrecip.classList.add("hidden");
          if (this.$.legendTemp) this.$.legendTemp.classList.add("hidden");
          this.activeEffectType = "wind";
          this.radarActive = true;
          this.initWindParticles();
          if (!this.animationFrameId) this.runWeatherCanvasLoop();
        } else {
          this.clearTempOverlay();
          this.activeEffectType = "none";
          if (this.$.legendPrecip)
            this.$.legendPrecip.classList.remove("hidden");
          if (this.$.legendTemp) this.$.legendTemp.classList.add("hidden");
          this.$.radarPlayback.classList.remove("hidden");
          this.initRadarLayers().then(() => this.startRadarPlayback());
        }
      }
    });
    this.$.radarPlayBtn.addEventListener("click", () => {
      this.toggleRadarPlayback();
      this._haptic('selection');
    });

    // ── Climate Time Machine trigger ─────────────────────────
    this.$.timeMachineTrigger?.addEventListener("click", () => {
      this.toggleClimateTimeMachine?.();
      this._haptic('light');
    });

    // ── Share Weather Modal ──────────────────────────────────
    this.selectedShareType = 'current';
    this.$.shareWeatherBtn?.addEventListener("click", () => {
      this.toggleShareModal(true);
      this._haptic('light');
    });
    this.$.shareModalCloseBtn?.addEventListener("click", () => {
      this.toggleShareModal(false);
      this._haptic('selection');
    });
    this.$.shareModal?.addEventListener("click", (e) => {
      if (e.target === this.$.shareModal) this.toggleShareModal(false);
    });

    const shareTypeBtns = [this.$.shareOptCurrent, this.$.shareOptHourly, this.$.shareOptWeekly, this.$.shareOptFull];
    shareTypeBtns.forEach((btn) => {
      btn?.addEventListener("click", () => {
        this.selectedShareType = btn.getAttribute("data-type") || "current";
        // Styling lives in styles.css under .share-type-btn / .is-selected;
        // toggling one class avoids clobbering the element's other classes.
        shareTypeBtns.forEach((b) =>
          b?.classList.toggle("is-selected", b === btn),
        );
        this._haptic('selection');
      });
    });

    this.$.shareTargetNative?.addEventListener("click", () => {
      this.shareWeather(this.selectedShareType || 'current', 'native');
      this._haptic('medium');
    });
    this.$.shareTargetWhatsApp?.addEventListener("click", () => {
      this.shareWeather(this.selectedShareType || 'current', 'whatsapp');
      this._haptic('medium');
    });
    this.$.shareTargetTelegram?.addEventListener("click", () => {
      this.shareWeather(this.selectedShareType || 'current', 'telegram');
      this._haptic('medium');
    });
    this.$.shareTargetX?.addEventListener("click", () => {
      this.shareWeather(this.selectedShareType || 'current', 'x');
      this._haptic('medium');
    });
    this.$.shareTargetCopy?.addEventListener("click", () => {
      this.shareWeather(this.selectedShareType || 'current', 'copy');
      this._haptic('medium');
    });

    // ── PWA Install Button ───────────────────────────────────
    this.$.installBtn?.addEventListener("click", () => {
      this.installPWA();
      this._haptic('medium');
    });

    // ── Next Rain Button ────────────────────────────────────
    this.$.nextRainBtn.addEventListener("click", () => {
      this.jumpToNextRain();
      this._haptic('selection');
    });

    // ── Signal/Noise Toggle ─────────────────────────────────
    this.$.signalNoiseBtn.addEventListener("click", () => {
      this.toggleSignalNoiseView();
      this._haptic('selection');
    });

    // ── Briefing Button ─────────────────────────────────────
    this.$.briefingBtn.addEventListener("click", () => {
      this.generateBriefing();
      this._haptic('selection');
    });

    // ── Confidence Bands Toggle ─────────────────────────────
    this.$.confidenceToggle.addEventListener("click", () => {
      this.showConfidence = !this.showConfidence;
      this.$.confidenceToggle.classList.toggle(
        "bg-primary/20",
        this.showConfidence,
      );
      if (this.weatherData) {
        this.drawHourlySparkline(parseInt(this.$.timelineSlider.value, 10));
      }
      this._haptic('selection');
    });

    // ── 24h Temperature Trend Expand/Collapse Toggle ─────────
    if (this.$.trendHeader && this.$.trendBody) {
      const toggleTrendSection = (forceExpand) => {
        const isHidden = this.$.trendBody.classList.contains("hidden");
        const willExpand = forceExpand !== undefined ? forceExpand : isHidden;
        this.$.trendBody.classList.toggle("hidden", !willExpand);
        this.$.trendHeader.setAttribute("aria-expanded", willExpand ? "true" : "false");
        if (this.$.trendCollapseIcon) {
          this.$.trendCollapseIcon.classList.toggle("-rotate-90", !willExpand);
        }
        if (willExpand && this.weatherData) {
          requestAnimationFrame(() => {
            this._sparklineDrawnWidth = 0;
            this.drawHourlySparkline(parseInt(this.$.timelineSlider?.value || 0, 10));
          });
        }
      };

      this.$.trendHeader.addEventListener("click", (e) => {
        if (e.target.closest("#signalNoiseBtn") || e.target.closest("#confidenceToggle")) return;
        toggleTrendSection();
        this._haptic?.("selection");
      });

      this.$.trendHeader.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleTrendSection();
          this._haptic?.("selection");
        }
      });
    }

    // ── Responsive ResizeObserver for 24h Temperature Trend ─
    if (window.ResizeObserver && this.$.trendSvg?.parentElement) {
      let trendResizeRaf = null;
      const trendObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.round(entry.contentRect.width);
          if (w > 0 && Math.abs(w - (this._sparklineDrawnWidth || 0)) > 4) {
            cancelAnimationFrame(trendResizeRaf);
            trendResizeRaf = requestAnimationFrame(() => {
              this._sparklineDrawnWidth = 0;
              if (this.weatherData && !this.$.trendBody?.classList.contains("hidden")) {
                this.drawHourlySparkline(parseInt(this.$.timelineSlider?.value || 0, 10));
              }
            });
          }
        }
      });
      trendObserver.observe(this.$.trendSvg.parentElement);
    }

    // ── Keyboard Shortcuts ───────────────────────────────────
    this.$.searchInput.addEventListener("keydown", (e) =>
      this.handleSearchKeyboard(e),
    );
    this._boundKeydown = (e) => {
      if (e.key === "Escape") {
        this.$.searchDropdown.classList.remove("open");
        this._syncSearchAria();
        if (this.$.weatherPanel.classList.contains("open")) {
          this.hideWeatherPanel();
        }
      }
    };
    document.addEventListener("keydown", this._boundKeydown);

    // ── Search Focus → show history ──────────────────────────
    this._boundSearchFocus = () => {
      const query = this.$.searchInput.value.trim();
      if (query.length < 2) {
        this.showSearchHistory();
      } else {
        this.$.searchDropdown.classList.add("open");
        if (this.$.searchSpinner.classList.contains("hidden")) {
          this.performSearch(query);
        }
      }
    };
    this.$.searchInput.addEventListener("focus", this._boundSearchFocus);
    this._boundSearchClick = () => {
      if (!this.$.searchDropdown.classList.contains("open")) this._boundSearchFocus();
    };
    this.$.searchInput.addEventListener("click", this._boundSearchClick);

    // ── Network status tracking ──────────────────────────────
    this._boundOnline = () => this.updateOnlineStatus(true);
    this._boundOffline = () => this.updateOnlineStatus(false);
    window.addEventListener("online", this._boundOnline);
    window.addEventListener("offline", this._boundOffline);

    // Initial status check
    if (!navigator.onLine) {
      this.updateOnlineStatus(false);
    }

    // ── Self-refresh on return (so users never rely on the 5-min toggle) ──
    // Re-fetch only when the data is stale (≥5 min) after the tab is hidden
    // and refocused. Silent: no toast, no timer — just keeps data honest.
    this._boundRefocus = () => {
      if (document.visibilityState === "hidden") return;
      const stale =
        !this.freshnessTimestamp ||
        Date.now() - this.freshnessTimestamp > 300000;
      if (stale && this.selectedLat != null && !this._isFetching && !this.isOffline) {
        this.selectLocation(this.selectedLat, this.selectedLng, this.selectedName);
      }
      // Refresh wallpaper data if stale and wallpaper mode is active
      if (this.isWallpaperMode && this.wallpaperLocations.length > 0) {
        const wallpaperStale =
          !this.wallpaperLastUpdated ||
          Date.now() - this.wallpaperLastUpdated > this.wallpaperRefreshInterval;
        if (wallpaperStale && !this.isOffline) {
          this.loadWallpaperDataForActiveTab();
        } else if (this.isWallpaperMode) {
          // Restart background animation if it stopped while hidden
          this.startWallpaperBgAnimation();
          // Update relative time label
          this.updateWallpaperRelativeTime();
        }
      }
    };
    document.addEventListener("visibilitychange", this._boundRefocus);
    window.addEventListener("focus", this._boundRefocus);

    // ── PWA Install Prompt ──────────────────────────────────
    this._isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    this._isInStandalone =
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches;

    const showMobileInstallBanner = () => {
      if (
        isMobileLayout() &&
        !this._isInStandalone &&
        localStorage.getItem("aurafisky_dismiss_install_banner") !== "true" &&
        this.$.pwaInstallBanner
      ) {
        this.$.pwaInstallBanner.classList.remove("hidden");
      }
    };

    this._boundBeforeInstall = (e) => {
      e.preventDefault(); // store prompt for manual trigger from Settings
      this.deferredPrompt = e;
      this.$.installBtn?.classList.remove("hidden");
      if (this.$.installBtnLabel) this.$.installBtnLabel.textContent = "Install Aurafisky App";
      setTimeout(showMobileInstallBanner, 2500);
    };
    window.addEventListener("beforeinstallprompt", this._boundBeforeInstall);

    // iOS Safari has no beforeinstallprompt — surface the manual
    // "Add to Home Screen" instruction instead so iPhone/iPad users
    // can still install the app.
    if (this._isIOS && !this._isInStandalone) {
      if (this.$.installBtn) {
        this.$.installBtn.classList.remove("hidden");
        if (this.$.installBtnLabel) this.$.installBtnLabel.textContent = "Add to Home Screen";
      }
      setTimeout(showMobileInstallBanner, 3000);
    }

    this.$.pwaInstallBannerBtn?.addEventListener("click", () => {
      if (this.deferredPrompt) {
        this.deferredPrompt.prompt();
        this.deferredPrompt.userChoice.then(() => {
          this.deferredPrompt = null;
          this.$.pwaInstallBanner?.classList.add("hidden");
        });
      } else if (this._isIOS) {
        this.showToast("Tap Share (⎋) below then 'Add to Home Screen' (+)", "info", 6000);
        this.$.pwaInstallBanner?.classList.add("hidden");
        localStorage.setItem("aurafisky_dismiss_install_banner", "true");
      } else {
        this.showToast("Install option available in browser menu (⋮)", "info");
        this.$.pwaInstallBanner?.classList.add("hidden");
      }
    });

    this.$.pwaInstallBannerCloseBtn?.addEventListener("click", () => {
      this.$.pwaInstallBanner?.classList.add("hidden");
      localStorage.setItem("aurafisky_dismiss_install_banner", "true");
      this._haptic("selection");
    });

    window.addEventListener("appinstalled", () => {
      this.deferredPrompt = null;
      this.$.installBtn?.classList.add("hidden");
      this.$.pwaInstallBanner?.classList.add("hidden");
      localStorage.setItem("aurafisky_dismiss_install_banner", "true");
    });

    // ── Document click (close overlays) ─────────────────────
    this._boundDocClick = (e) => {
      if (
        !e.target.closest("#searchInput") &&
        !e.target.closest("#searchClearBtn") &&
        !e.target.closest("#searchDropdown")
      ) {
        this.$.searchDropdown.classList.remove("open");
        this._syncSearchAria();
      }
      if (
        !e.target.closest("#bookmarksBtn") &&
        !e.target.closest("#bookmarksDropdown") &&
        !e.target.closest("#mobileNavSavedBtn")
      ) {
        if (!this.$.bookmarksDropdown?.classList.contains("hidden")) {
          this.$.bookmarksDropdown?.classList.add("hidden");
          this.syncMobileBottomNavState?.();
        }
      }
      if (
        !e.target.closest("#homeDropdown") &&
        !e.target.closest("#mobileNavMapBtn") &&
        !e.target.closest("#homeToggleBtn")
      ) {
        this.toggleHomeDropdown?.(false);
      }
      if (
        !e.target.closest("#routeDropdown") &&
        !e.target.closest("#routeBtn") &&
        !e.target.closest("#mobileNavRouteBtn")
      ) {
        if (typeof this.toggleRouteDropdown === "function") {
          this.toggleRouteDropdown(false);
        } else {
          document.getElementById("routeDropdown")?.classList.add("hidden");
        }
      }
    };
    document.addEventListener("click", this._boundDocClick);

    // ── Pull-to-refresh: detect downward swipe on app header/body (not map) ──
    this._pullStartY = 0;
    this._pullActive = false;
    this._pullNotified = false;
    this._pullIndicator = document.getElementById("pullToRefreshIndicator");
    document.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
        // Disable pull-to-refresh during map panning or panel interactions
        const isMapTouch = e.target.closest("#map") || e.target.closest("#weatherPanel") || e.target.closest("#celestialRadarSection");
        if (isMapTouch) {
          this._pullActive = false;
          return;
        }
        this._pullStartY = e.touches[0].clientY;
        this._pullActive = true;
        this._pullNotified = false;
      },
      { passive: true },
    );
    document.addEventListener(
      "touchmove",
      (e) => {
        if (!this._pullActive || e.touches.length !== 1) return;
        const dy = e.touches[0].clientY - this._pullStartY;
        if (dy > 10 && dy < 100 && window.scrollY === 0 && this._pullIndicator) {
          this._pullIndicator.classList.remove("hidden");
          this._pullIndicator.style.opacity = Math.min(dy / 100, 1);
        }
        if (dy > 100 && !this._pullNotified && window.scrollY === 0) {
          this._pullNotified = true;
          this._pullActive = false;
          if (this._pullIndicator) this._pullIndicator.classList.add("hidden");
          this.showToast("Refreshing weather...", "info");
          if (this.selectedLat && this.selectedLng && this.selectedName) {
            this.selectLocation(
              this.selectedLat,
              this.selectedLng,
              this.selectedName,
            );
          } else {
            this.getMyLocation();
          }
        }
      },
      { passive: true },
    );
    document.addEventListener(
      "touchend",
      () => {
        this._pullActive = false;
        if (this._pullIndicator) this._pullIndicator.classList.add("hidden");
      },
      { passive: true },
    );

    // ── Mobile pull-down on weather panel to minimize (peek mode) ──
    this._panelTouchStartY = 0;
    this._panelTouchActive = false;
    const panel = this.$.weatherPanel;
    if (panel) {
      panel.addEventListener(
        "touchstart",
        (e) => {
          if (!isMobileLayout() || e.touches.length !== 1) return;
          this._panelTouchStartY = e.touches[0].clientY;
          this._panelTouchActive = true;
        },
        { passive: true },
      );
      panel.addEventListener(
        "touchend",
        (e) => {
          if (!this._panelTouchActive || !isMobileLayout()) return;
          this._panelTouchActive = false;
          if (this.$.weatherPanel.classList.contains("minimized")) return;
          const dy = e.changedTouches[0].clientY - this._panelTouchStartY;
          // If pulled down > 60px while scrolled at the top, snap into minimized peek mode
          if (
            this.$.weatherPanel.classList.contains("open") &&
            this.$.weatherPanelContent?.scrollTop === 0 &&
            dy > 60
          ) {
            this.toggleMinimizeWeatherPanel();
            this._haptic("light");
          }
        },
        { passive: true },
      );
    }

    // Initialize desktop panel dragging & position persistence
    this.initDesktopPanelDragging();

    // Restore saved wide mode preference on desktop
    try {
      const savedWide = localStorage.getItem("aurafisky_weather_wide");
      if (savedWide === "true" && !isMobileLayout()) {
        this.toggleWideWeatherPanel(true);
      }
    } catch (_) {}

    // ── Haptic feedback & tactile standards (Sprint 3) ────────────
    this.hapticEngine = new HapticEngine({ audioContext: this.audioContext });
    this._haptic = (type = 'light', targetEl = null) => {
      return this.hapticEngine.trigger(type, targetEl);
    };
    this._legacyHaptic = (type = 'light') => {
      if (typeof navigator === 'undefined' || !navigator.vibrate) return;
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      const patterns = {
        light: [5],
        medium: [10],
        heavy: [20],
        selection: [2],
        success: [10, 50, 10],
        warning: [20, 50, 20],
        error: [30, 30, 30, 30, 50],
      };
      try {
        navigator.vibrate(patterns[type] || patterns.light);
      } catch (_) {}
    };

    // ── Resize for canvas (RAF-throttled) ────────────────────
    this._resizeRAF = null;
    this._boundResize = () => {
      if (this._resizeRAF) return;
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = null;
        this.resizeWeatherCanvas();
        if (this.map) {
          this.map.updateSize();
        }
        // If weather panel is in desktop wide mode, ensure it stays clamped within visible bounds
        if (this.$.weatherPanel?.classList.contains("wide-mode") && window.innerWidth >= 640) {
          const rect = this.$.weatherPanel.getBoundingClientRect();
          if (rect.right > window.innerWidth - 16) {
            const newLeft = Math.max(16, window.innerWidth - 800);
            this.$.weatherPanel.style.left = `${newLeft}px`;
          }
        }
      });
    };
    window.addEventListener("resize", this._boundResize);
  }

  // ── Desktop Panel Dragging & Position Persistence ──────────────
  initDesktopPanelDragging() {
    const panel = this.$.weatherPanel;
    if (!panel) return;

    this._restoreDesktopPanelPosition();

    const dragHandle = document.getElementById("panelDragHandle") || panel.querySelector(".weather-panel-drag-bar");
    if (!dragHandle) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onPointerDown = (e) => {
      if (window.innerWidth < 768 || (e.button !== undefined && e.button !== 0)) return;
      // Strictly restrict dragging to the top drag handle bar
      const isTopHandle = e.target.closest("#panelDragHandle, .weather-panel-drag-bar");
      if (!isTopHandle) return;
      // Don't drag if user clicked an interactive control or selectable text element
      if (e.target.closest("button:not(#panelDragHandle), input, a, select, [role='button']:not(#panelDragHandle), #locationAddressCard, #panelCoordinates, #panelActionsRow, #weatherPanelTabs, #weatherPanelContent")) return;

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = panel.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      panel.style.right = "auto";
      panel.style.bottom = "auto";
      panel.style.left = `${initialLeft}px`;
      panel.style.top = `${initialTop}px`;
      panel.classList.add("dragging-desktop");
      document.body.style.userSelect = "none";

      const onPointerMove = (moveEvent) => {
        if (!isDragging) return;
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let newLeft = initialLeft + dx;
        let newTop = initialTop + dy;

        const maxLeft = Math.max(10, window.innerWidth - panel.offsetWidth - 10);
        const maxTop = Math.max(10, window.innerHeight - 80);

        newLeft = Math.max(10, Math.min(newLeft, maxLeft));
        newTop = Math.max(50, Math.min(newTop, maxTop));

        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
      };

      const onPointerUp = () => {
        if (!isDragging) return;
        isDragging = false;
        panel.classList.remove("dragging-desktop");
        document.body.style.userSelect = "";

        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);

        const pos = { left: parseInt(panel.style.left, 10), top: parseInt(panel.style.top, 10) };
        try {
          localStorage.setItem("aurafisky_desktop_panel_pos", JSON.stringify(pos));
        } catch (_) {}
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("mousemove", onPointerMove);
      window.addEventListener("mouseup", onPointerUp);
    };

    dragHandle.addEventListener("pointerdown", onPointerDown);
    dragHandle.addEventListener("mousedown", onPointerDown);

    // Double-click drag handle strictly to reset panel position to default
    const onResetPosition = (e) => {
      if (window.innerWidth < 768) return;
      if (!e.target.closest("#panelDragHandle, .weather-panel-drag-bar")) return;
      try {
        localStorage.removeItem("aurafisky_desktop_panel_pos");
      } catch (_) {}
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
      this.showToast("Restored weather card to default position", "info");
    };

    dragHandle.addEventListener("dblclick", onResetPosition);
  }

  _restoreDesktopPanelPosition() {
    if (window.innerWidth < 768) return;
    const panel = this.$.weatherPanel;
    if (!panel) return;

    try {
      const saved = localStorage.getItem("aurafisky_desktop_panel_pos");
      if (saved) {
        const pos = JSON.parse(saved);
        if (typeof pos.left === "number" && typeof pos.top === "number") {
          const maxLeft = Math.max(10, window.innerWidth - (panel.offsetWidth || 380) - 10);
          const maxTop = Math.max(10, window.innerHeight - 80);
          const left = Math.max(10, Math.min(pos.left, maxLeft));
          const top = Math.max(50, Math.min(pos.top, maxTop));

          panel.style.right = "auto";
          panel.style.bottom = "auto";
          panel.style.left = `${left}px`;
          panel.style.top = `${top}px`;
        }
      }
    } catch (e) {}
  }

  /**
   * Updates network online/offline UI and triggers auto-sync upon reconnection.
   * Decouples transient latency; presents a muted amber offline pill only when truly offline.
   */
  updateOnlineStatus(isOnline) {
    this.isOffline = !isOnline;
    const banner = this.$.offlineBanner;
    if (banner) {
      if (isOnline) {
        banner.classList.add("hidden");
        banner.className = "hidden fixed top-20 left-1/2 -translate-x-1/2 z-[1004] bg-amber-500/90 backdrop-blur-md text-amber-950 dark:text-amber-100 border border-amber-400/30 text-center py-1.5 px-4 text-xs font-semibold rounded-full shadow-lg";
        if (this.selectedLat != null && !this._isFetching) {
          this.showToast("⚡ Network reconnected — refreshing weather...", "info");
          this.selectLocation(this.selectedLat, this.selectedLng, this.selectedName);
        }
      } else {
        const mins = this.freshnessTimestamp
          ? Math.max(0, Math.round((Date.now() - this.freshnessTimestamp) / 60000))
          : null;
        const timeLabel = mins !== null ? ` (cached ${mins}m ago)` : "";
        banner.textContent = `⚠️ Offline — showing cached data${timeLabel}`;
        banner.className = "fixed top-20 left-1/2 -translate-x-1/2 z-[1004] bg-amber-500/90 backdrop-blur-md text-amber-950 dark:text-amber-100 border border-amber-400/30 text-center py-1.5 px-4 text-xs font-semibold rounded-full shadow-lg animate-in fade-in";
        banner.classList.remove("hidden");
      }
    }
  }

  // ── Error handling ────────────────────────────────────────────────
  showError(message, title = "Something went wrong") {
    const banner = this.$.errorBanner;
    const msgEl = this.$.errorMessage;
    if (!banner || !msgEl) return;
    msgEl.textContent = message;
    const h3 = banner.querySelector("h3");
    if (h3) h3.textContent = title;
    banner.classList.remove("hidden");
    // Announce to screen readers
    const live = this.$.a11yLiveRegion;
    if (live) live.textContent = `${title}: ${message}`;
  }

  hideError() {
    const banner = this.$.errorBanner;
    if (banner) banner.classList.add("hidden");
  }

  // ================================================================
  //  GEOLOCATION & REVERSE SEARCH (Nominatim)

  _persistSession(lat, lng, name) {
    localforage.setItem("_lastSession", { lat, lng, name }).catch(() => {});
    this._updateUrlParams(lat, lng, name);
  }

  _updateUrlParams(lat, lng, name) {
    try {
      if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng)) {
        const url = new URL(window.location.href);
        url.searchParams.set("lat", lat.toFixed(4));
        url.searchParams.set("lng", lng.toFixed(4));
        if (name) {
          url.searchParams.set("name", name);
        } else {
          url.searchParams.delete("name");
        }
        // State serialization in URL hash for zero-backend shareable state
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        hashParams.set("lat", lat.toFixed(4));
        hashParams.set("lng", lng.toFixed(4));
        if (this.mapStyle) hashParams.set("layer", this.mapStyle);
        if (name) hashParams.set("name", name);
        url.hash = hashParams.toString();
        window.history.replaceState(null, "", url.toString());
      }
    } catch (e) {
      console.warn("Could not update URL params:", e);
    }
  }

  _clearUrlParams() {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      for (const key of ["lat", "lng", "name"]) {
        if (url.searchParams.has(key)) {
          url.searchParams.delete(key);
          changed = true;
        }
      }
      url.hash = "";
      window.history.replaceState(null, "", url.toString());
    } catch (e) {
      console.warn("Could not clear URL params:", e);
    }
  }

  _checkUrlParamsOnStartup() {
    try {
      const hashStr = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
      const hashParams = new URLSearchParams(hashStr);
      const searchParams = new URLSearchParams(window.location.search);
      // Accept either query params or URL hash state
      const params = hashParams.has("lat") ? hashParams : searchParams;
      const latStr = params.get("lat");
      const lngStr = params.get("lng");
      const nameStr = params.get("name");
      const layerStr = params.get("layer");
      if (layerStr && this.setMapStyle) {
        try { this.setMapStyle(layerStr); } catch (_) {}
      }
      const wallpaperStr = params.get("wallpaper");
      const action = params.get("action");

      // PWA shortcut / deep-link actions. Independent of lat/lng so a
      // shortcut can act on the restored session location.
      if (action) {
        setTimeout(() => {
          try {
            if (action === "radar") this.toggleRadar?.();
            else if (action === "aura") this.aura?.open?.();
            else if (action === "briefing") {
              this.showWeatherPanel?.();
              this.switchWeatherTab?.("overview");
              this.renderDailyBriefing?.(true);
            }
          } catch (e) {
            console.warn("URL action failed:", action, e);
          }
        }, 1200); // let the map + panel finish mounting
      }

      if (latStr != null && lngStr != null) {
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          // URLSearchParams already decodes percent-escaped values. Decoding
          // again breaks valid names containing a literal "%" (for example
          // "100% Pure") and can prevent a shared location from loading.
          // Discard invalid ocean basin names from shared link when coordinates are on land
          let name = nameStr;
          if (name && isOceanName(name) && isCoordinateOnLand(lat, lng)) {
            name = null;
          }
          const effName = name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          this.selectLocation(lat, lng, effName);
          // Shared wallpaper link: open the wallpaper overlay for this location
          if (wallpaperStr === "true") {
            setTimeout(() => {
              this.addWallpaperTab(lat, lng, name);
            }, 1500); // Wait for weather data to load first
          }
          return true;
        }
      }
    } catch (e) {
      console.warn("URL params startup check error:", e);
    }
    return false;
  }

  async _loadInitialStartupLocation() {
    this._sweepStaleCache();
    await this._loadLocalCache();

    // 1. Priority 1: Check if page was opened via a shared link URL (?lat=...&lng=...&name=...)
    if (this._checkUrlParamsOnStartup()) {
      return;
    }

    // Fallback runner to restore previous session or default home
    const restoreFallback = () => {
      if (this._restoreSession()) {
        return true;
      }
      if (this.defaultLocation && this.defaultLocation.lat != null) {
        this.selectLocation(this.defaultLocation.lat, this.defaultLocation.lng, this.defaultLocation.name);
        if (this.defaultLocationNotify) {
          this.setupHourlyNotifications();
        }
        return true;
      }
      return false;
    };

    // 2. Mobile-first Smart Hybrid auto-location check
    // On mobile devices, if geolocation permission is already granted or in a native app (Capacitor),
    // open the user's current location immediately.
    // If not yet determined or if permission is prompt/denied, instantly render the cached session / home
    // without raising an unexpected intrusive prompt or blocking the screen.
    const isMobile = isMobileLayout();
    const isNativeApp = typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());

    if (isMobile) {
      let permissionState = null;
      try {
        if (typeof navigator !== "undefined" && navigator.permissions?.query) {
          const perm = await navigator.permissions.query({ name: "geolocation" });
          permissionState = perm?.state;
        }
      } catch (e) {
        // Permission query not supported on some WebViews
      }

      if (isNativeApp || permissionState === "granted" || permissionState !== "denied" || this._lastKnownGpsCoords) {
        // Instantly render optimistic cached session/home so screen is never blank while GPS locks
        const restored = restoreFallback();

        // Concurrently get fresh user location and smoothly transition to where the user currently is
        this.getMyLocation({
          silent: true,
          precise: true,
          onFail: () => {
            if (!restored) restoreFallback();
          },
        });
        return;
      }
    }

    // 3. Desktop or mobile without pre-granted location: Restored previous session
    if (this._restoreSession()) {
      return;
    }

    // 4. Default Home location
    if (this.defaultLocation && this.defaultLocation.lat != null) {
      this.selectLocation(this.defaultLocation.lat, this.defaultLocation.lng, this.defaultLocation.name);
      if (this.defaultLocationNotify) {
        this.setupHourlyNotifications();
      }
      return;
    }

    // 5. Geolocation fallback
    this.getMyLocation();
  }

  _restoreSession() {
    const saved = this._localCache?._lastSession;
    if (saved && saved.lat != null && saved.lng != null) {
      let savedName = saved.name;
      if (savedName && isOceanName(savedName) && isCoordinateOnLand(saved.lat, saved.lng)) {
        savedName = null;
      }
      this.selectLocation(
        saved.lat,
        saved.lng,
        savedName || `${saved.lat.toFixed(4)}, ${saved.lng.toFixed(4)}`,
      );
      return true;
    }
    return false;
  }

  async _loadLocalCache() {
    try {
      const keys = [
        "_lastSession",
        "defaultLocation",
        "defaultLocationNotify",
        "units",
        "termsAccepted",
        "timeline24h",
      ];
      const results = await Promise.all(
        keys.map((k) => localforage.getItem(k)),
      );
      this._localCache = {};
      keys.forEach((k, i) => {
        this._localCache[k] = results[i];
      });

      if (this._localCache.defaultLocation) {
        this.defaultLocation = this._localCache.defaultLocation;
      }
      if (this._localCache.defaultLocationNotify != null) {
        this.defaultLocationNotify = this._localCache.defaultLocationNotify;
      }
      if (this._localCache.notifyIntervalMin != null) {
        this.notifyIntervalMin = this._localCache.notifyIntervalMin;
      }
      if (this._localCache.units && !this._cloudUnitsLoaded) {
        WeatherService.setUnits(this._localCache.units);
        this.syncUnitLabel();
      }
      if (this._localCache.termsAccepted != null) {
        this.termsAccepted = this._localCache.termsAccepted;
      }
      if (this._localCache.timeline24h != null) {
        this.timeline24hMode = this._localCache.timeline24h;
      }
    } catch (e) {
      console.warn("Local cache load error:", e);
    }
  }

  _describeCoordinates(lat, lng) {
    return describeCoordinates(lat, lng);
  }

  async handleMapClick(lat, lng, options = {}) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      return;
    }
    const defaultName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    // Use street/neighborhood zoom on GPS fix
    const zoom = options.zoom ?? (options.isGps ? (isMobileLayout() ? 14 : 13) : undefined);
    // Call selectLocation IMMEDIATELY on click so weather card opens/updates instantly (1st click)
    // Address resolution runs centrally with in-flight deduplication and caching in resolveLocationAddress
    await this.selectLocation(lat, lng, defaultName, { zoom });
  }

  _updateHeaderLocationAndCoords(name, lat, lng) {
    const targetName = name || this.selectedName || "Unknown Location";
    const targetLat = lat ?? this.selectedLat;
    const targetLng = lng ?? this.selectedLng;

    if (this.$.panelLocationName) {
      const existingBadge = this.$.panelLocationName.querySelector(".home-badge");
      if (existingBadge) existingBadge.remove();
      const isCoord = /^\s*[-+]?\d+\.?\d*°?\s*[NSEW]?\s*,\s*[-+]?\d+\.?\d*°?\s*[NSEW]?\s*$/i.test(targetName);
      const displayHeader = isCoord ? "Locating..." : (shortPlaceName(targetName) || targetName);
      this.$.panelLocationName.textContent = displayHeader;
      this.$.panelLocationName.title = targetName;
    }

    const homeBadge = document.getElementById("panelHomeBadge");
    if (homeBadge && this.defaultLocation && targetLat != null) {
      const isHome = Math.abs(this.defaultLocation.lat - targetLat) < 0.0001 &&
                     Math.abs(this.defaultLocation.lng - targetLng) < 0.0001;
      homeBadge.classList.toggle("hidden", !isHome);
    }

    const titleAlias = document.getElementById("auraLocationTitle") || document.getElementById("googleLocationTitle");
    if (titleAlias) {
      titleAlias.textContent = shortPlaceName(targetName) || targetName;
    }
    if (this.googleMapsMobile) {
      this.googleMapsMobile.syncCurrentLocationInfo(null, targetName);
    }

    if (targetLat != null && targetLng != null && !isNaN(targetLat) && !isNaN(targetLng)) {
      const decimals = 4;
      const formatted = formatCoordinates(targetLat, targetLng, { precision: decimals });
      const accuracy = formatCoordinateAccuracy(targetLat, decimals);
      if (this.$.panelCoordinates) {
        this.$.panelCoordinates.textContent = `📍 ${formatted}`;
        this.$.panelCoordinates.title = `${targetLat.toFixed(6)}, ${targetLng.toFixed(6)} — resolution ${accuracy}`;
      }
      const mobileCoords = this.$.locationAddressCoordsText || document.getElementById("locationAddressCoordsText");
      if (mobileCoords) {
        mobileCoords.textContent = formatted;
        mobileCoords.title = `${targetLat.toFixed(6)}, ${targetLng.toFixed(6)} — resolution ${accuracy} (Click to copy)`;
      }
    }
  }

  _syncDocumentTitle(weather = this.currentWeather) {
    const rawName = String(this.selectedName || "").trim();
    const isCoordinates = /^[-+]?\d+(?:\.\d+)?\s*,\s*[-+]?\d+(?:\.\d+)?$/.test(rawName);
    const isPlaceholder = /^(locating\.\.\.|unknown location|fetching weather\.\.\.|location address)$/i.test(rawName);
    const placeName = !isCoordinates && !isPlaceholder
      ? shortPlaceName(rawName).trim()
      : this.selectedLat != null && this.selectedLng != null
        ? `${this.selectedLat.toFixed(2)}°, ${this.selectedLng.toFixed(2)}°`
        : "Weather";
    const condition = weather
      ? `${WeatherService.formatTemp(weather.temperature)} ${weather.icon} `
      : "";
    document.title = `${condition}${placeName || "Weather"} — Aurafisky`;
  }

  _renderLocationAddressLoading() {
    const content = document.getElementById("locationAddressContent");
    if (!content) return;
    content.innerHTML = `
      <div class="py-1 text-[11px] text-slate-400 flex items-center gap-2 animate-pulse">
        <span class="w-3 h-3 rounded-full border-2 border-teal-500/30 border-t-teal-500 animate-spin flex-shrink-0"></span>
        <span class="truncate">Resolving address details...</span>
      </div>
    `;
  }

  _renderLocationAddressCard(address, displayName, lat, lng) {
    const summaryEl = document.getElementById("locationAddressSummary");
    const content = document.getElementById("locationAddressContent");
    if (!summaryEl && !content) return;

    const b = breakdownAddress(address, displayName, lat, lng);
    this._currentFullAddress = b.fullAddress;

    const areaVal = b.area || b.city || "—";
    const talukVal = b.taluk || "—";
    const districtVal = b.district || "—";
    const stateVal = b.state || "—";
    const metaBottom = [b.postcode, b.country].filter(Boolean).join(", ");

    // Sync mobile address tab coordinates
    const mobileCoords = this.$.locationAddressCoordsText || document.getElementById("locationAddressCoordsText");
    const effLat = lat ?? this.selectedLat;
    const effLng = lng ?? this.selectedLng;
    const hasValidCoords = effLat != null && effLng != null && !isNaN(effLat) && !isNaN(effLng);
    const coordFormatted = hasValidCoords ? formatCoordinates(effLat, effLng, { precision: 4 }) : "—";
    const coordAccuracy = hasValidCoords ? `${effLat.toFixed(6)}, ${effLng.toFixed(6)} — resolution ${formatCoordinateAccuracy(effLat, 4)}` : "";

    if (mobileCoords && hasValidCoords) {
      mobileCoords.textContent = coordFormatted;
      mobileCoords.title = `${coordAccuracy} (Click to copy)`;
    }

    // Build concise 1-line summary breadcrumb for the compact bar
    const summaryParts = [
      b.area || b.city,
      b.taluk && b.taluk !== b.area ? b.taluk : null,
      b.district && b.district !== b.area && b.district !== b.taluk ? b.district : null,
      b.state
    ].filter(Boolean);
    const isCoordString = /^\s*[-+]?\d+\.?\d*°?\s*[NSEW]?\s*,\s*[-+]?\d+\.?\d*°?\s*[NSEW]?\s*$/i.test(b.fullAddress || "");
    const formattedCoords = hasValidCoords ? coordFormatted : "Location Address";
    const summaryText = summaryParts.length > 0
      ? summaryParts.join(" • ")
      : (isCoordString || !b.fullAddress ? formattedCoords : b.fullAddress);

    if (summaryEl) {
      summaryEl.textContent = summaryText;
      summaryEl.title = b.fullAddress ? `${summaryText}\n${b.fullAddress}` : summaryText;
    }

    const tzName = this.weatherData?.timezone || "";
    const tzAbbr = this.weatherData?.timezone_abbreviation || "";
    const utcOffSec = this.weatherData?.utc_offset_seconds;
    const utcOffsetStr = utcOffSec != null
      ? `UTC${utcOffSec >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(utcOffSec) / 3600)).padStart(2, "0")}:${String(Math.floor((Math.abs(utcOffSec) % 3600) / 60)).padStart(2, "0")}`
      : "";
    const detailLocalTimeStr = WeatherService.getFormattedLocationCurrentDateTime
      ? WeatherService.getFormattedLocationCurrentDateTime(tzName, utcOffSec || 0)
      : "";
    const detailTzBadge = [tzName, tzAbbr, utcOffsetStr].filter(Boolean).join(" · ");

    if (content) {
      content.innerHTML = `
        <div class="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10.5px] select-text">
          <div class="flex flex-col min-w-0 select-text">
            <span class="text-[8.5px] uppercase font-bold text-slate-400 tracking-wider select-text">Area / Locality</span>
            <span class="font-semibold text-slate-800 dark:text-slate-200 truncate select-text cursor-text" title="${areaVal}">${areaVal}</span>
          </div>
          <div class="flex flex-col min-w-0 select-text">
            <span class="text-[8.5px] uppercase font-bold text-slate-400 tracking-wider select-text">Taluk / Tehsil</span>
            <span class="font-semibold text-slate-800 dark:text-slate-200 truncate select-text cursor-text" title="${talukVal}">${talukVal}</span>
          </div>
          <div class="flex flex-col min-w-0 select-text">
            <span class="text-[8.5px] uppercase font-bold text-slate-400 tracking-wider select-text">District</span>
            <span class="font-semibold text-slate-800 dark:text-slate-200 truncate select-text cursor-text" title="${districtVal}">${districtVal}</span>
          </div>
          <div class="flex flex-col min-w-0 select-text">
            <span class="text-[8.5px] uppercase font-bold text-slate-400 tracking-wider select-text">State / Province</span>
            <span class="font-semibold text-slate-800 dark:text-slate-200 truncate select-text cursor-text" title="${stateVal}">${stateVal}</span>
          </div>
          <div class="col-span-2 flex flex-col min-w-0 select-text pt-1 border-t border-slate-200/50 dark:border-slate-700/40">
            <span class="text-[8.5px] uppercase font-bold text-slate-400 tracking-wider select-text">Coordinates (Lat, Long)</span>
            <span class="font-mono font-semibold text-teal-700 dark:text-teal-300 truncate select-text cursor-text" title="${coordAccuracy}">📍 ${coordFormatted}</span>
          </div>
          <div class="col-span-2 flex flex-col min-w-0 select-text pt-1 border-t border-slate-200/50 dark:border-slate-700/40">
            <span class="text-[8.5px] uppercase font-bold text-slate-400 tracking-wider select-text">Local Time & Timezone</span>
            <div class="flex items-center gap-1.5 min-w-0">
              <span id="addressDetailLocalTime" class="font-semibold text-slate-800 dark:text-slate-200 select-text cursor-text whitespace-nowrap">🕒 ${detailLocalTimeStr || "Calculating..."}</span>
              ${detailTzBadge ? `<span class="text-[9.5px] font-mono text-slate-500 dark:text-slate-400 whitespace-normal" title="${detailTzBadge}">(${detailTzBadge})</span>` : ""}
            </div>
          </div>
        </div>
        <div class="mt-1.5 pt-1 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 select-text">
          <span class="truncate pr-1 font-medium select-text cursor-text">${metaBottom || (hasValidCoords ? coordFormatted : "")}</span>
          <button id="viewFullAddressBtn" type="button" class="text-[9.5px] text-teal-600 dark:text-teal-400 font-bold flex-shrink-0 cursor-pointer hover:underline select-none">Full Address</button>
        </div>
        <div id="fullAddressDetail" class="hidden mt-1 p-1.5 bg-slate-100/90 dark:bg-slate-800/70 rounded-lg text-[10px] font-mono text-slate-600 dark:text-slate-300 leading-snug break-words border border-slate-200/60 dark:border-slate-700/40 select-all select-text cursor-text">
          ${b.fullAddress || "No additional street address available for these coordinates."}
        </div>
      `;

      const toggleBtn = content.querySelector("#viewFullAddressBtn");
      const fullDetail = content.querySelector("#fullAddressDetail");
      if (toggleBtn && fullDetail) {
        toggleBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          fullDetail.classList.toggle("hidden");
          toggleBtn.textContent = fullDetail.classList.contains("hidden") ? "Full Address" : "Hide Details";
        });
      }
    }
  }

  async resolveLocationAddress(lat, lng, fallbackName) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      this._renderLocationAddressCard(null, fallbackName, lat, lng);
      return;
    }

    const cacheKey = `weathermap_cache_${lat.toFixed(3)}_${lng.toFixed(3)}`;
    const userLang = (() => {
      if (this.mapLanguage && this.mapLanguage !== 'native') {
        return this.mapLanguage;
      }
      try {
        return (navigator.language || "en").split(/[-_,]/)[0] || "en";
      } catch (e) {
        return "en";
      }
    })();

    const sanitize = (str) => {
      if (typeof DOMPurify !== "undefined" && DOMPurify.sanitize)
        return DOMPurify.sanitize(String(str || ""));
      return String(str || "").replace(/[<>&]/g, "");
    };

    try {
      const res = await reverseGeocode(lat, lng, {
        lang: userLang,
        timeoutMs: 6000,
        sanitize,
        describeFallback: this._describeCoordinates(lat, lng),
      });

      if (this.selectedLat === lat && this.selectedLng === lng) {
        this.selectedAddress = res.address;
        this.selectedDisplayName = res.displayName || fallbackName || "";
        this.addressResolvedForLat = lat;
        this.addressResolvedForLng = lng;
        this._renderLocationAddressCard(this.selectedAddress, this.selectedDisplayName, lat, lng);

        const isGenericOrCoordOrInvalidOcean =
          !this.selectedName ||
          /^\s*[-+]?\d+\.?\d*°?\s*[NSEW]?\s*,\s*[-+]?\d+\.?\d*°?\s*[NSEW]?\s*$/i.test(this.selectedName) ||
          /^(locating\.\.\.|unknown location|fetching weather\.\.\.|location address)$/i.test(this.selectedName.trim()) ||
          (isOceanName(this.selectedName) && (!isOceanName(res.name) || isCoordinateOnLand(lat, lng)));

        if (res.name && isGenericOrCoordOrInvalidOcean) {
          this.selectedName = res.name;
          this._updateHeaderLocationAndCoords(res.name, lat, lng);
          this._updateUrlParams(lat, lng, res.name);
          this._persistSession(lat, lng, res.name);
        }
        this._syncDocumentTitle(this.currentWeather);
        if (this.marker) {
          const timeOffset = this.timeline24hMode ? this._getTimelineOffset?.() || 0 : 0;
          const targetIdx = parseInt(this.$.timelineSlider?.value || 0, 10) + timeOffset;
          const currentWeather = this.weatherData ? WeatherService.getHourlyAtIndex(this.weatherData, targetIdx) : null;
          if (currentWeather) {
            this.marker.setHtml(this._buildMarkerHtml(currentWeather), this.selectedName, "location-tooltip");
          }
          const cityEl = this.marker.element?.querySelector(".weather-marker-city");
          if (cityEl) {
            const displayName = shortPlaceName(this.selectedName).trim();
            cityEl.textContent = displayName;
            cityEl.title = displayName;
          }
          const pinRoot = this.marker.element?.querySelector(".aurafisky-location-pin");
          if (pinRoot) {
            pinRoot.setAttribute("aria-label", this.selectedName);
          }
        }

        // Update cache with resolved address and verified coordinates
        if (this.weatherData) {
          this._persistWeatherCache(cacheKey, {
            forecast: this.weatherData,
            airQuality: this.airQualityData,
            ts: this.freshnessTimestamp || Date.now(),
            name: this.selectedName || fallbackName,
            address: this.selectedAddress,
            displayName: this.selectedDisplayName,
            addressLat: lat,
            addressLng: lng,
          });
        }
      }
    } catch (e) {
      console.warn("Reverse geocode failed:", e);
      if (this.selectedLat === lat && this.selectedLng === lng) {
        this._renderLocationAddressCard(null, fallbackName || this.selectedName, lat, lng);
        this._syncDocumentTitle(this.currentWeather);
      }
    }
  }

  _updatePanelTimeLabel(weather, hourIndex) {
    if (!this.$.panelTimeLabel && !this.$.mobilePanelTimeLabel && !this.$.panelCardLocalTimeText) return;
    const nowIdx = WeatherService.getCurrentHourIndex(
      this.weatherData,
      this.weatherData?.utc_offset_seconds || 0,
    );
    const isNow = hourIndex == null || hourIndex === nowIdx;
    let label = "";
    if (isNow && WeatherService.getFormattedLocationCurrentDateTime) {
      label = WeatherService.getFormattedLocationCurrentDateTime(
        this.weatherData?.timezone,
        this.weatherData?.utc_offset_seconds || 0,
      );
    } else if (weather?.time) {
      label = WeatherService.formatDateTime(
        weather.time,
        this.weatherData?.timezone,
        this.weatherData?.utc_offset_seconds,
      );
    }

    if (this.$.panelTimeLabel) {
      this.$.panelTimeLabel.textContent = label;
    }
    if (this.$.mobilePanelTimeLabel) {
      this.$.mobilePanelTimeLabel.textContent = label;
    }

    // Timezone abbreviation / UTC offset badge
    let tzAbbr = this.weatherData?.timezone_abbreviation;
    if (!tzAbbr && this.weatherData?.utc_offset_seconds != null) {
      const off = this.weatherData.utc_offset_seconds;
      const sign = off >= 0 ? "+" : "-";
      const h = Math.floor(Math.abs(off) / 3600);
      const m = Math.floor((Math.abs(off) % 3600) / 60);
      tzAbbr = m > 0 ? `UTC${sign}${h}:${String(m).padStart(2, "0")}` : `UTC${sign}${h}`;
    }

    if (this.$.mobilePanelTzBadge) {
      if (tzAbbr) {
        this.$.mobilePanelTzBadge.textContent = tzAbbr;
        this.$.mobilePanelTzBadge.classList.remove("hidden");
      } else {
        this.$.mobilePanelTzBadge.classList.add("hidden");
      }
    }

    // Main weather card local time display
    if (this.$.panelCardLocalTimeText) {
      this.$.panelCardLocalTimeText.textContent = tzAbbr ? `${label} (${tzAbbr})` : label;
    }

    // Mobile address GPS line local time
    if (this.$.locationAddressTimeText && this.$.locationAddressTimeDivider) {
      if (label) {
        this.$.locationAddressTimeText.textContent = tzAbbr ? `🕒 ${label} · ${tzAbbr}` : `🕒 ${label}`;
        this.$.locationAddressTimeText.classList.remove("hidden");
        this.$.locationAddressTimeDivider.classList.remove("hidden");
      } else {
        this.$.locationAddressTimeText.classList.add("hidden");
        this.$.locationAddressTimeDivider.classList.add("hidden");
      }
    }

    // Collapsible Address Details card local time (if open)
    const addressDetailTime = document.getElementById("addressDetailLocalTime");
    if (addressDetailTime && label) {
      addressDetailTime.textContent = tzAbbr ? `🕒 ${label} (${tzAbbr})` : `🕒 ${label}`;
    }
  }

  _startPanelClockTicker() {
    if (this._panelClockTimer) return;
    this._panelClockTimer = setInterval(() => {
      if (!this.weatherData || (!this.$.panelTimeLabel && !this.$.mobilePanelTimeLabel)) return;
      const nowIdx = WeatherService.getCurrentHourIndex(
        this.weatherData,
        this.weatherData?.utc_offset_seconds || 0,
      );
      if (this.currentHourIndex === nowIdx) {
        this._updatePanelTimeLabel(this.currentWeather, this.currentHourIndex);
      }
    }, 10000);
  }

  _setWeatherPanelState(state, options = {}) {
    // state: 'loading' | 'content' | 'error'
    if (this.$.panelCardFreshness && state === "error") {
      this.$.panelCardFreshness.textContent = "Forecast update unavailable";
      this.$.panelCardFreshness.className = "text-[10px] mt-0.5 text-amber-600 dark:text-amber-400";
    }
    if (this.$.weatherPanelSkeleton) {
      this.$.weatherPanelSkeleton.classList.toggle("hidden", state !== "loading");
    }
    if (this.$.weatherPanelContent) {
      this.$.weatherPanelContent.classList.toggle("hidden", state !== "content");
    }
    if (this.$.weatherPanelError) {
      this.$.weatherPanelError.classList.toggle("hidden", state !== "error");
      if (state === "error") {
        if (this.$.weatherErrorTitle && options.title) {
          this.$.weatherErrorTitle.textContent = options.title;
        }
        if (this.$.weatherErrorMessage && options.message) {
          this.$.weatherErrorMessage.textContent = options.message;
        }
        if (this.$.weatherErrorIcon && options.icon) {
          this.$.weatherErrorIcon.textContent = options.icon;
        }
        if (this.$.weatherViewCachedBtn) {
          this.$.weatherViewCachedBtn.classList.toggle("hidden", !options.hasCachedData);
        }
      }
    }
  }

  async selectLocation(lat, lng, name, options = {}) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      return;
    }
    // While a fetch is in flight, don't drop the request — remember the
    // LATEST requested location and run it once the current fetch settles.
    // Rapid switching (tap A → quickly tap B) used to lose B entirely: the
    // guard returned silently, so the user had to tap a third time.
    if (this._isFetching) {
      this._pendingLocation = { lat, lng, name };
      return;
    }
    this._isFetching = true;
    try {
      this._persistSession(lat, lng, name);
      this.syncBus?.syncLocation(lat, lng, name);

      let weatherPopulated = false;

      this.selectedLat = lat;
      this.selectedLng = lng;
      this.selectedName = name;
      this.currentWeather = null;
      this.freshnessTimestamp = null;
      this._syncDocumentTitle(null);
      this.selectedAddress = null;
      this.selectedDisplayName = null;
      this._currentFullAddress = '';
      this.addressResolvedForLat = null;
      this.addressResolvedForLng = null;
      const summaryEl = document.getElementById("locationAddressSummary");
      if (summaryEl) {
        summaryEl.innerHTML = '<span class="text-slate-400">Resolving address...</span>';
      }
      this.updateSettingsUIFromLocal();

      this._cachedDecomposition = null;

      // Center viewport. Web Mercator (what the view's extent/fromLonLat use)
      // is only defined up to ~85.05° latitude — the poles project to
      // infinity. A location right at that edge (a saved session, a shared
      // link, a search result near a pole) used to be handed straight to
      // fromLonLat()/view.animate() and would hang the tab: the requested
      // center fell just outside the view's own extent clamp, and OL never
      // settled on a resolution. Clamp only the point we center on — lat/lng
      // used for weather data, the marker, and the name stay exact.
      const viewCenterLat = Math.max(-85, Math.min(85, lat));

      this.map.updateSize();
      const view = this.map.getView();
      const targetZoom = options.zoom ?? Math.min(Math.max(view.getZoom(), 9), 17);
      view.animate({ center: fromLonLat([lng, viewCenterLat]), zoom: targetZoom });

      // Refresh UI panel state
      this._updateHeaderLocationAndCoords(name, lat, lng);
      this._renderLocationAddressLoading();
      this.resolveLocationAddress(lat, lng, name);
      if (this.$.panelTimeLabel) this.$.panelTimeLabel.textContent = "Fetching weather...";
      if (this.$.mobilePanelTimeLabel) this.$.mobilePanelTimeLabel.textContent = "Fetching weather...";
      if (this.$.panelCardLocalTimeText) this.$.panelCardLocalTimeText.textContent = "Fetching weather...";
      if (this.$.panelCardFreshness) {
        this.$.panelCardFreshness.textContent = "Updating forecast…";
        this.$.panelCardFreshness.className = "text-[10px] mt-0.5 text-slate-400 dark:text-slate-500";
      }

      // Clear the AI briefing — it describes the *previous* location, so leaving
      // it on screen attributes one place's conditions to another.
      if (this.$.briefingContent) {
        this.$.briefingContent.textContent = "";
        this.$.briefingContent.classList.add("hidden");
      }

      // Reset AQI view
      this.$.panelAQILabel.textContent = "Loading AQI...";
      this.$.panelAQIBadge.textContent = "--";
      this.$.panelAQIBadge.className =
        "text-[10px] font-bold px-2.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 uppercase tracking-wider text-center min-w-[70px] flex-shrink-0";

      this.showWeatherPanel();
      this.updateStarUI();

      // Close Time-Machine drawer when switching cities
      this.closeClimateTimeMachine?.();

      const cacheKey = `weathermap_cache_${lat.toFixed(3)}_${lng.toFixed(3)}`;

      // ── Stale-While-Revalidate: Instant <50ms cache hydration ───────
      // Read from aurafisky_store_v19 (forecasts_v1) or local storage cache first
      let cached = null;
      try {
        const idbCached = await getCachedForecast(lat, lng);
        if (idbCached?.payload?.forecast) {
          cached = {
            ...idbCached.payload,
            ts: idbCached.fetchedAt || idbCached.payload.ts || Date.now(),
          };
        } else {
          cached = this.getNearestCachedLocation(lat, lng);
        }
      } catch (e) {
        cached = this.getNearestCachedLocation(lat, lng);
      }

      const hasValidCache = Boolean(
        cached &&
        cached.forecast
      );

      if (!hasValidCache) {
        // Show loading skeleton only if zero cached data exists
        this._setWeatherPanelState("loading");
      }

      if (hasValidCache) {
        this.weatherData = cached.forecast;
        this.airQualityData = cached.airQuality || null;
        this.currentHourIndex = WeatherService.getCurrentHourIndex(
          cached.forecast,
          cached.forecast?.utc_offset_seconds || 0,
        );
        this.freshnessTimestamp = cached.ts || 0;
        this.biasMap = WeatherService.computeDiurnalBias(
          cached.forecast,
          cached.forecast?.utc_offset_seconds || 0,
        );
        // Reveal cached content in <50ms immediately
        this._setWeatherPanelState("content");
        this.initTimeline();
        const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
        this.$.timelineSlider.value = this.currentHourIndex - timeOffset;
        this.$.timelineSlider.disabled = false;
        this.updateWeatherDisplay(this.currentHourIndex);
        if (this._ensembleReady) this.renderEnsemble(lat, lng);
        if (
          cached.address &&
          cached.addressLat != null &&
          cached.addressLng != null &&
          haversineMeters(cached.addressLat, cached.addressLng, lat, lng) < 1500
        ) {
          this.selectedAddress = cached.address;
          this.selectedDisplayName = cached.displayName || cached.name || '';
          this.addressResolvedForLat = lat;
          this.addressResolvedForLng = lng;
          this._renderLocationAddressCard(this.selectedAddress, this.selectedDisplayName, lat, lng);
        }
        const fl = document.getElementById("freshnessLabel");
        if (fl) {
          const mins = Math.max(0, Math.round((Date.now() - (cached.ts || 0)) / 60000));
          fl.textContent = mins === 0 ? "Updated just now" : `Updated ${mins}m ago`;
        }
        this.updateOfflineBadge(false);
        weatherPopulated = true;
      }

      try {
        if (this.isOffline && !navigator.onLine) {
          throw new Error("Device is offline");
        }

        // Fetch forecast and Air Quality in parallel
        const forecastPromise = WeatherService.fetchForecast(lat, lng);
        const airQualityPromise = WeatherService.fetchAirQuality(lat, lng).catch(() => null);

        // Core forecast renders the weather card — don't block on air quality
        const forecast = await forecastPromise;

        // If air quality arrives concurrently, use it immediately
        let airQuality = null;
        try {
          airQuality = await Promise.race([
            airQualityPromise,
            new Promise((resolve) => setTimeout(() => resolve(null), 100)),
          ]);
        } catch {}

        this.weatherData = forecast;
        this.airQualityData = airQuality;
        this.currentHourIndex = WeatherService.getCurrentHourIndex(
          this.weatherData,
          this.weatherData?.utc_offset_seconds || 0,
        );

        // Compute diurnal bias from past days
        this.biasMap = WeatherService.computeDiurnalBias(
          forecast,
          forecast?.utc_offset_seconds || 0,
        );

        // Store freshness timestamp and persist cache for offline fallback
        this.freshnessTimestamp = Date.now();
        const cachePayload = {
          forecast,
          airQuality,
          ts: this.freshnessTimestamp,
          name,
        };
        if (
          this.selectedAddress &&
          this.addressResolvedForLat != null &&
          haversineMeters(this.addressResolvedForLat, this.addressResolvedForLng, lat, lng) < 1500
        ) {
          cachePayload.address = this.selectedAddress;
          cachePayload.displayName = this.selectedDisplayName;
          cachePayload.addressLat = this.addressResolvedForLat;
          cachePayload.addressLng = this.addressResolvedForLng;
        }
        this._persistWeatherCache(cacheKey, cachePayload);
        saveCachedForecast(lat, lng, cachePayload).catch(() => {});
        const fl = document.getElementById("freshnessLabel");
        if (fl) fl.textContent = "Updated just now";

        // If air quality resolves slightly later, update smoothly in background
        if (!airQuality) {
          airQualityPromise.then((aq) => {
            if (aq && this.selectedLat === lat && this.selectedLng === lng) {
              this.airQualityData = aq;
              this.updateAirQualityDisplay(this.currentHourIndex);
              this._updateOverviewChips(this.currentWeather, aq?.hourly?.us_aqi?.[this.currentHourIndex]);
              const aqPayload = {
                forecast,
                airQuality: aq,
                ts: this.freshnessTimestamp,
                name,
              };
              this._persistWeatherCache(cacheKey, aqPayload);
              saveCachedForecast(lat, lng, aqPayload).catch(() => {});
            }
          });
        }

        this.updateOfflineBadge(false);
        weatherPopulated = true;

        // Populate slider timeline tick boundaries
        this.initTimeline();

        // Sync slider thumb - account for 24h mode offset
        const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
        this.$.timelineSlider.value = this.currentHourIndex - timeOffset;
        this.$.timelineSlider.disabled = false;

        // Update weather dashboard text, AQI, soundscapes, and SVG charts
        this.updateWeatherDisplay(this.currentHourIndex);
        if (this._ensembleReady) this.renderEnsemble(lat, lng);

        // One-time PWA install prompt after the first successful lookup.
        if (this.deferredPrompt && !this._installPromptShown) {
          this._installPromptShown = true;
          this.showToast(
            "Tip: install Aurafisky from Settings for offline access anytime.",
            "info",
            6000,
          );
        }

        // Place customized divIcon weather label
        this.createWeatherMarker(lat, lng, this.currentHourIndex);
        this.updateMarineFloodUI?.(lat, lng);

        // Refresh home badge and marker
        this.updateHomeButton();
        this.updateHomeMarker();

        // Reveal content cleanly
        this._setWeatherPanelState("content");
        requestAnimationFrame(() => {
          if (this.$.weatherPanelContent) this.$.weatherPanelContent.scrollTop = 0;
        });
      } catch (error) {
        console.warn(
          "Live weather fetch failed, attempting cache recovery:",
          error,
        );

        // Attempt to retrieve from local cache
        const cached = this.getNearestCachedLocation(lat, lng);
        if (cached) {
          this.weatherData = cached.forecast;
          this.airQualityData = cached.airQuality;
          this.currentHourIndex = WeatherService.getCurrentHourIndex(
            this.weatherData,
            this.weatherData?.utc_offset_seconds || 0,
          );

          this.updateOfflineBadge(true);
          this.showToast("Loaded cached offline weather details.", "info");
          weatherPopulated = true;

          this.initTimeline();
          // Sync slider thumb - account for 24h mode offset
          const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
          this.$.timelineSlider.value = this.currentHourIndex - timeOffset;
          this.$.timelineSlider.disabled = false;

          this.updateWeatherDisplay(this.currentHourIndex);
          if (this._ensembleReady) this.renderEnsemble(lat, lng);
          this.createWeatherMarker(lat, lng, this.currentHourIndex);

          this.updateHomeButton();
          this.updateHomeMarker();

          this._setWeatherPanelState("content");
          requestAnimationFrame(() => {
            if (this.$.weatherPanelContent) this.$.weatherPanelContent.scrollTop = 0;
          });
        } else {
          this.showToast(
            this.isOffline
              ? "You are offline and no cached data is available for this city."
              : "Could not fetch weather metrics. Please try again.",
            "error",
          );

          // Clear prior location's weather data so we NEVER present one city's weather under another!
          this.weatherData = null;
          this.airQualityData = null;

          this._setWeatherPanelState("error", {
            title: this.isOffline ? "You are Offline" : "Weather Data Unavailable",
            message: this.isOffline
              ? "No saved forecast found for this location. Reconnect and tap Retry."
              : "Unable to retrieve live conditions for this point. Tap Retry to reconnect.",
            icon: this.isOffline ? "📶" : "⚠️",
            hasCachedData: false,
          });
        }
      }

      this.updateHomeButton();
      this.updateHomeMarker();
      this.updateWallpaperButtonUI();



    } finally {
      this._isFetching = false;
      // Run the latest location requested while this fetch was in flight
      if (this._pendingLocation) {
        const pending = this._pendingLocation;
        this._pendingLocation = null;
        this.selectLocation(pending.lat, pending.lng, pending.name);
      }
    }
  }

  /**
   * Writes one location's forecast to localStorage for offline fallback,
   * evicting the oldest entries so the cache stays bounded.
   *
   * Each entry is a full 10-day hourly forecast — roughly 200-400 KB of JSON.
   * Without eviction a user who browses a few dozen places fills the ~5 MB
   * localStorage quota, at which point every subsequent write throws
   * QuotaExceededError and offline fallback silently stops working for good.
   *
   * @param {string} key - `weathermap_cache_<lat>_<lng>`
   * @param {Object} payload - { forecast, airQuality, ts, name }
   */
  _persistWeatherCache(key, payload) {
    const MAX_CACHED_LOCATIONS = 12;
    try {
      const existing = this._getCacheKeyList().filter((k) => k !== key);
      // Oldest-first by stored timestamp; unparseable entries sort first so
      // they get evicted before healthy ones.
      const withTs = existing.map((k) => {
        let ts = 0;
        try {
          ts = JSON.parse(localStorage.getItem(k))?.ts || 0;
        } catch (e) {
          ts = 0;
        }
        return { key: k, ts };
      });
      withTs.sort((a, b) => a.ts - b.ts);
      while (withTs.length >= MAX_CACHED_LOCATIONS) {
        localStorage.removeItem(withTs.shift().key);
      }

      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      // Quota still exceeded (or storage disabled): drop every weather cache
      // entry and retry once, so one oversized payload can't wedge the cache.
      console.warn("Weather cache write failed, purging and retrying:", e);
      try {
        this._getCacheKeyList().forEach((k) => localStorage.removeItem(k));
        localStorage.setItem(key, JSON.stringify(payload));
      } catch (e2) {
        console.warn("Weather cache unavailable; offline fallback disabled:", e2);
      }
    }
  }

  getNearestCachedLocation(lat, lng) {
    // Great-circle metres, not degrees. The old `Math.hypot(dLat, dLng)`
    // compared one degree of latitude against one of longitude as if they were
    // the same unit: 0.05° of longitude is ~5.5 km at the equator but only
    // ~2.8 km at 60°N, so the effective search radius swung by 2x depending on
    // latitude and rejected valid cached forecasts for high-latitude cities.
    const MAX_MATCH_METERS = 6000;
    let nearestKey = null;
    let nearestMeters = MAX_MATCH_METERS;

    const cacheKeys = this._getCacheKeyList();
    for (const key of cacheKeys) {
      const parts = key.replace("weathermap_cache_", "").split("_");
      const cLat = parseFloat(parts[0]);
      const cLng = parseFloat(parts[1]);
      const meters = haversineMeters(cLat, cLng, lat, lng);
      if (meters < nearestMeters) {
        nearestMeters = meters;
        nearestKey = key;
      }
    }

    if (!nearestKey) return null;
    try {
      return JSON.parse(localStorage.getItem(nearestKey));
    } catch {
      return null;
    }
  }

  _getCacheKeyList() {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith("weathermap_cache_")) keys.push(key);
      }
      return keys;
    } catch {
      return [];
    }
  }

  // Wipe everything the app persists locally: legacy localStorage weather
  // caches, localforage settings/session, and Service Worker caches. Keeps
  // the "Clear Cache" button honest — it actually clears, then reloads fresh.
  async clearLocalCaches() {
    this.showToast("Clearing local cache…", "info");
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key) continue;
        // The button says it clears local data, so it clears all of it. It
        // previously removed only weathermap_cache_* and one timestamp, which
        // left ~12 other keys behind — including the wallpaper photo, saved
        // routes, alert rules and the terminator toggle.
        if (key.startsWith("weathermap_cache_") || LOCAL_DATA_KEYS.has(key)) {
          localStorage.removeItem(key);
        }
      }
    } catch (_) { /* localStorage may be unavailable; ignore */ }

    try { await localforage.clear(); } catch (_) {}

    if (navigator.serviceWorker && "caches" in window) {
      try {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      } catch (_) {}
    }
    setTimeout(() => window.location.reload(), 1200);
  }

  // Drop legacy weathermap_cache_* keys older than 30d (or unparseable).
  // Pure hygiene — runs silently at startup, no toast.
  _sweepStaleCache() {
    try {
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith("weathermap_cache_")) continue;
        try {
          const data = JSON.parse(localStorage.getItem(key) || "{}");
          if (data.ts == null || data.ts < cutoff) {
            localStorage.removeItem(key);
            continue;
          }
          // Sanitize legacy unverified addresses that lack verified coordinates
          if (data.address && (data.addressLat == null || data.addressLng == null)) {
            delete data.address;
            delete data.displayName;
            localStorage.setItem(key, JSON.stringify(data));
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    } catch (_) {}
  }

  updateOfflineBadge(isCachedDisplay) {
    if (isCachedDisplay) {
      const existing = this.$.panelLocationName.querySelector("span");
      if (!existing) {
        this.$.panelLocationName.textContent = this.selectedName;
        const cachedSpan = document.createElement("span");
        cachedSpan.className =
          "text-[9px] font-semibold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded ml-1.5 uppercase tracking-wider";
        cachedSpan.textContent = "Cached";
        this.$.panelLocationName.appendChild(cachedSpan);
      }
      this.$.offlineTimeMachineBadge.classList.remove("hidden");
    } else {
      const existing = this.$.panelLocationName.querySelector("span");
      if (existing) {
        this.$.panelLocationName.textContent = this.selectedName;
      }
      this.$.offlineTimeMachineBadge.classList.add("hidden");
    }
  }

  /**
   * Builds the marker's inner HTML from a weather snapshot.
   * Single source of truth for the marker template (#4/#9).
   */
  _buildMarkerHtml(weather) {
    const isCoordString = /^\s*[-+]?\d+\.\d+\s*,\s*[-+]?\d+\.\d+\s*$/.test(this.selectedName || "");
    let cityName = "";
    if (this.selectedName && !isCoordString) {
      cityName = shortPlaceName(this.selectedName).trim();
    } else if (this.selectedAddress) {
      const b = breakdownAddress(this.selectedAddress, this.selectedDisplayName, this.selectedLat, this.selectedLng);
      cityName = (b.area || b.city || b.taluk || "").trim();
    }
    if (!cityName) {
      cityName = isCoordString ? "Locating..." : (weather?.description || "");
    }
    return `
        <div class="aurafisky-location-pin group" role="button" tabindex="0" aria-label="${cityName}">
          <div class="weather-marker relative bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl pl-2.5 pr-2 py-1.5 shadow-2xl border border-slate-200/80 dark:border-slate-700/80 flex items-center gap-2 select-none min-w-[90px]">
            <div class="weather-marker-icon text-xl leading-none flex-shrink-0">${weather.icon}</div>
            <div class="weather-marker-info flex flex-col text-left leading-none min-w-0 pr-0.5">
              <span class="weather-marker-temp text-sm font-extrabold text-slate-800 dark:text-white leading-tight">${WeatherService.formatTemp(weather.temperature)}</span>
              <span class="weather-marker-city text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-[85px] mt-0.5 leading-tight" title="${cityName}">${cityName}</span>
            </div>
            <button type="button" class="marker-close-btn flex-shrink-0" title="Close location" aria-label="Close location">
              <svg class="marker-close-svg pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="pin-stem"></div>
          <div class="pin-ground-anchor">
            <div class="pin-ground-pulse"></div>
            <div class="pin-ground-dot"></div>
          </div>
        </div>
      `;
  }

  createWeatherMarker(lat, lng, hourIndex = null) {
    const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
    const targetIdx = hourIndex ?? (parseInt(this.$.timelineSlider.value, 10) + timeOffset);

    const weather = WeatherService.getHourlyAtIndex(
      this.weatherData,
      targetIdx,
    );
    if (!weather) return;

    // The timeline calls this on every hour change. Tearing the marker down and
    // re-adding it each time churns the DOM, drops the tooltip and click
    // binding, and makes the marker flicker while the slider is dragged — so
    // when the marker is already at this position, just swap its content.
    const pos = this.marker?.getPosition();
    const samePosition =
      pos &&
      Math.abs(pos.lat - lat) < 1e-9 &&
      Math.abs(pos.lng - lng) < 1e-9;

    if (samePosition) {
      this.marker.setHtml(this._buildMarkerHtml(weather), this.selectedName, "location-tooltip");
    } else {
      if (this.marker) {
        this.marker.remove();
        this.marker = null;
      }

      this.marker = new HtmlMarker(this.map, {
        lat,
        lng,
        html: this._buildMarkerHtml(weather),
        className: "custom-weather-marker-icon",
        size: [110, 68],
        anchor: [55, 68],
        tooltip: this.selectedName || undefined,
        tooltipClassName: "location-tooltip",
        onClick: (domEvent) => {
          if (this._isDragGesture({ originalEvent: domEvent })) return;
          if (domEvent.target.closest(".marker-close-btn")) {
            domEvent.stopPropagation();
            this.hideWeatherPanel();
            this._haptic('selection');
            return;
          }
          this.showWeatherPanel();
        },
      });
    }

    // Sync pinCache for a bookmarked location so its pin stays fresh — but only
    // while the timeline is on the current hour. Caching a time-travelled hour
    // here would stamp it with ts: Date.now(), and renderBookmarkPins treats
    // anything under 5 minutes old as current, so a bookmark pin would display
    // a future forecast as if it were the present conditions.
    const isCurrentHour = targetIdx === this.currentHourIndex;
    if (isCurrentHour && this.bookmarks && this.bookmarks.length > 0) {
      const isBookmarked = this.bookmarks.some(
        (b) => Math.abs(b.lat - lat) < 0.0001 && Math.abs(b.lng - lng) < 0.0001
      );
      if (isBookmarked) {
        const pinCache = this._getBookmarkPinCache();
        pinCache[lat + "_" + lng] = { weather, ts: Date.now() };
        this._saveBookmarkPinCache(pinCache);
      }
    }
  }

  // ================================================================
  //  WEATHER PANEL UPDATE & DYNAMIC THEMES & DUAL-AXIS SVG SPARKLINE
  // ================================================================

  updateWeatherDisplay(hourIndex) {
    if (!this.weatherData?.hourly?.time?.length) {
      return;
    }
    const maxIdx = this.weatherData.hourly.time.length - 1;
    const safeHourIndex = Math.max(0, Math.min(maxIdx, typeof hourIndex === "number" ? hourIndex : 0));
    const weather = WeatherService.getHourlyAtIndex(
      this.weatherData,
      safeHourIndex,
    );
    if (!weather) return;

    this.currentWeather = weather;

    // Header labels
    this._updateHeaderLocationAndCoords(this.selectedName, this.selectedLat, this.selectedLng);
    this._updatePanelTimeLabel(weather, hourIndex);
    this._startPanelClockTicker();

    // Weather type display (emoji — consistent with share/hourly/bookmark surfaces)
    this.$.panelIcon.textContent = weather.icon;
    this.$.panelTemp.textContent = WeatherService.formatTemp(
      weather.temperature,
    );
    this.$.panelTemp.className = `text-4xl font-extrabold ${WeatherService.getTempClass(weather.temperature)}`;
    this.$.panelDescription.textContent = weather.description;
    this.$.panelFeelsLike.textContent = `Feels like ${WeatherService.formatTemp(weather.feelsLike)}`;

    // Grid panels (unit-aware)
    this.$.panelHumidity.textContent = `${weather.humidity ?? "--"}%`;
    this.$.panelWind.textContent = `${WeatherService.formatWind(weather.windSpeed)} ${WeatherService.getWindDirection(weather.windDirection)}`;
    this.$.panelPressure.textContent = WeatherService.formatPressure(
      weather.pressure,
    );
    this.$.panelClouds.textContent = `${weather.cloudCover ?? "--"}%`;
    this.$.panelUV.textContent =
      weather.uvIndex != null ? weather.uvIndex.toFixed(1) : "--";
    if (this.$.panelUVBadge || this.$.panelUVAdvice) {
      const uvGuidance = WeatherService.getUVGuidance(weather.uvIndex);
      if (this.$.panelUVBadge) {
        if (weather.uvIndex != null) {
          this.$.panelUVBadge.textContent = uvGuidance.level;
          this.$.panelUVBadge.className = `text-[9px] font-bold px-1.5 py-0.5 rounded-full ${uvGuidance.badgeBg}`;
          this.$.panelUVBadge.classList.remove("hidden");
        } else {
          this.$.panelUVBadge.classList.add("hidden");
        }
      }
      if (this.$.panelUVAdvice) {
        this.$.panelUVAdvice.textContent = uvGuidance.advice;
        this.$.panelUVAdvice.title = `${uvGuidance.advice} (Estimated burn time: ${uvGuidance.burnTime})`;
      }
    }
    this.$.panelPrecip.textContent = WeatherService.formatPrecip(
      weather.precipitation,
    );

    // Dew Point (calculated from temp + humidity)
    const dewPoint = WeatherService.calculateDewPoint(
      weather.temperature,
      weather.humidity,
    );
    this.$.panelDewPoint.textContent =
      dewPoint != null ? WeatherService.formatTemp(dewPoint) : "--°";

    // Wind Gusts
    if (weather.windGusts != null) {
      this.$.panelWindGusts.textContent = WeatherService.formatWind(
        weather.windGusts,
      );
    } else {
      this.$.panelWindGusts.textContent = "--";
    }

    // Visibility
    this.$.panelVisibility.textContent = WeatherService.formatVisibility(
      weather.visibility,
    );

    // Hourly temp delta arrow
    this.updateTempDelta(hourIndex);

    // Rotate wind compass needle
    if (weather.windDirection != null) {
      this.$.windArrow.style.transform = `rotate(${weather.windDirection}deg)`;
    } else {
      this.$.windArrow.style.transform = "rotate(0deg)";
    }

    // Air Quality Index (AQI)
    this.updateAirQualityDisplay(hourIndex);

    // Scan for weather alerts & advisories
    const aqiVal = this.airQualityData?.hourly?.us_aqi[hourIndex];
    if (aqiVal != null) {
      this.currentAqi = Math.round(aqiVal);
    }
    const advisories = WeatherService.getAdvisories(weather, aqiVal);
    this.renderAdvisoryBanner(advisories);

    // Sync Overview Quick Stats Chips
    this._updateOverviewChips(weather, aqiVal);

    // Precipitation Nowcast (Phase 2 P0)
    this._renderNowcast(hourIndex);

    // Comfort Index
    const comfortScore = WeatherService.getComfortIndex(weather, aqiVal);
    const comfortInfo = WeatherService.getComfortLabel(comfortScore, weather);
    this.updateComfortDisplay(comfortScore, comfortInfo);

    // Pressure tendency
    const tendency = WeatherService.getPressureTendency(
      this.weatherData,
      hourIndex,
    );
    this.updatePressureTendency(tendency);

    // Wind shift detection (deduplicated so scrubbing does not trigger duplicate toasts)
    const windShift = WeatherService.getWindShift(this.weatherData, hourIndex);
    if (windShift && this._lastNotifiedWindShiftHour !== hourIndex) {
      this._lastNotifiedWindShiftHour = hourIndex;
      this.showToast(`${windShift.icon} ${windShift.label}`, "info");
    }

    // Timeline rate-of-change deltas
    const deltas = WeatherService.getTimelineDeltas(
      this.weatherData,
      hourIndex,
    );
    this.renderTimelineDeltas(deltas);

    // Next rain hour indicator
    this.updateNextRainButton(hourIndex);

    // Predictive arrival
    this.updatePredictiveArrival(weather, hourIndex);

    // ── New Advanced Features ─────────────────────────────────

    // 3. Percentile rank (using historical archive if available)
    if (this._historicalResults) {
      const allTemps = this._historicalResults
        .filter((r) => r?.daily?.temperature_2m_max?.[0] != null)
        .map(
          (r) =>
            (r.daily.temperature_2m_max[0] + r.daily.temperature_2m_min[0]) / 2,
        );
      const pct = WeatherService.getPercentileRank(
        weather.temperature,
        allTemps,
      );
      if (pct != null && this.$.percentileLabel) {
        this.$.percentileLabel.textContent = `${pct}th percentile for this date`;
        this.$.percentileLabel.className = `text-[10px] font-semibold ${pct > 90 ? "text-red-500" : pct < 10 ? "text-blue-500" : "text-slate-400"}`;
      }
    }

    // 4. Trust score
    const trust = WeatherService.computeTrustScore(this.weatherData, hourIndex);
    this.updateTrustScore(trust);

    // 7. Weather momentum
    const momentum = WeatherService.getWeatherMomentum(
      this.weatherData,
      hourIndex,
    );
    if (momentum && this.$.momentumLabel) {
      const velSign = momentum.velocity > 0 ? "+" : "";
      const accelSign = momentum.acceleration > 0 ? "+" : "";
      const velCls =
        momentum.velocity > 0
          ? "text-red-400"
          : momentum.velocity < 0
            ? "text-blue-400"
            : "";
      const accelCls =
        momentum.acceleration > 0
          ? "text-red-500"
          : momentum.acceleration < 0
            ? "text-blue-500"
            : "";
      // Build momentum label safely
      const momentumHTML = `Δ ${velSign}${momentum.velocity.toFixed(1)}°C/h <span class="${accelCls}">(α ${accelSign}${momentum.acceleration.toFixed(1)}°C/h²)</span>`;
      this.setSafeHTML(this.$.momentumLabel, momentumHTML);
      this.$.momentumLabel.className = "text-[10px] font-medium flex gap-1";
    }

    // 8. Parameter importance
    const importance = WeatherService.getParameterImportance(weather, aqiVal);
    this.updateParamImportance(importance);

    // 9. Freshness
    if (this.freshnessTimestamp && this.$.freshnessLabel) {
      const fresh = WeatherService.getFreshnessLabel(this.freshnessTimestamp);
      const activeLang = this.language || detectLocale();
      const localizedFresh = translateText(fresh.label, activeLang);
      this.$.freshnessLabel.textContent = `📡 ${localizedFresh}`;
      this.$.freshnessLabel.style.opacity = fresh.opacity;
      if (this.$.panelCardFreshness) {
        const fUpdated = t("forecast_updated", activeLang) || "Forecast updated";
        this.$.panelCardFreshness.textContent = `${fUpdated} ${localizedFresh}`;
        this.$.panelCardFreshness.className = `text-[10px] mt-0.5 ${fresh.isStale ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500"}`;
      }
    } else if (this.$.panelCardFreshness) {
      const activeLang = this.language || detectLocale();
      this.$.panelCardFreshness.textContent = t("forecast_update_unavailable", activeLang) || "Forecast update time unavailable";
      this.$.panelCardFreshness.className = "text-[10px] mt-0.5 text-slate-400 dark:text-slate-500";
    }

    // 15. Phase-space regime classifier
    const regime = WeatherService.classifyWeatherRegime(weather, tendency);
    if (regime && this.$.regimeLabel) {
      this.$.regimeLabel.textContent = `${regime.icon} ${regime.label}`;
      this.$.regimeLabel.className =
        "text-[10px] font-bold text-teal-500 dark:text-teal-400";
    }

    // 14. Spatial gradient — DELETED. getSpatialGradient() fabricated
    // temperature values (20 - |lat| * 0.4) with no API call, which is a
    // data-integrity violation: a weather app must never display a number it
    // did not measure. The label is cleared rather than left showing a
    // fabricated gradient. If a real gradient is wanted later, it should be
    // computed from the forecast at upwind/downwind sample points (the
    // WeatherService.getUpwindPoint() helper already exists and is real).

    // Update browser tab favicon + title dynamically
    this.updateWeatherFavicon(weather.weatherCode, weather.isDay);
    this._syncDocumentTitle(weather);

    // Draw Astronomy Widget (Solar Arc + Moon Phase)
    this.updateAstronomyWidget(weather, hourIndex);

    // Keep the day/night terminator (if enabled) synced to whatever
    // instant the timeline is showing, not just wall-clock "now".
    if (this.terminatorEnabled) {
      this.updateDayNightTerminator(weather.time, this.weatherData?.utc_offset_seconds);
    }

    // Apply smooth color gradient theme depending on climate
    this.applyPanelWeatherTheme(weather.weatherCode, weather.isDay);

    // Sync mobile bottom sheet weather and location-based use cases
    if (this.googleMapsMobile) {
      this.googleMapsMobile.syncCurrentLocationInfo(weather, this.selectedName, this.weatherData);
    }

    // Draw interactive SVG Sparkline Trend line
    this.drawHourlySparkline(hourIndex);

    // Render Hourly Forecast Scroll Strip
    this.renderHourlyStrip(hourIndex);

    // Find & render Best Outdoor Window
    this.renderBestOutdoorWindow(hourIndex);

    // Update Ambient Audio Soundscape
    this.updateAmbientSoundscapeSynthesizer(
      weather.weatherCode,
      weather.windSpeed,
    );

    // Update Map Canvas Particle Overlay
    this.updateWeatherCanvasOverlayEffect(
      weather.weatherCode,
      weather.windSpeed,
      weather.windDirection,
    );

    // Temporal compression grid & UV chart only need rendering when forecast data or units change,
    // avoiding heavy DOM re-parsing on every timeline scrub frame
    const currentUnits = (typeof WeatherService !== "undefined" && WeatherService.getUnits?.()) || "metric";
    if (this._lastRenderedGridData !== this.weatherData || this._lastRenderedGridUnits !== currentUnits) {
      this._lastRenderedGridData = this.weatherData;
      this._lastRenderedGridUnits = currentUnits;
      const matrices = WeatherService.getTemporalCompression(this.weatherData);
      this.renderTemporalGrid(matrices);
      this.renderUVChart();
    }

    // Extended device-adaptive metrics, daily summary & rain-chance strip
    this.updateExtendedWeatherInfo(weather, hourIndex);

    // Update bottom slider indicators — sync knob to hourIndex
    const nowIdx = WeatherService.getCurrentHourIndex(
      this.weatherData,
      this.weatherData?.utc_offset_seconds || 0,
    );
    const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
    const targetSliderVal = hourIndex - timeOffset;
    if (this.$.timelineSlider && parseInt(this.$.timelineSlider.value, 10) !== targetSliderVal) {
      this.$.timelineSlider.value = targetSliderVal;
      this._updateTrackFill(targetSliderVal);
    }

    // Now-indicator bar stays fixed at the real current time (set by initTimeline).
    // Only refresh the badge text so it shows the current clock time.
    if (this.$.nowTimeLabel) {
      this.$.nowTimeLabel.textContent = WeatherService.getFormattedLocationCurrentTime(
        this.weatherData?.timezone,
        this.weatherData?.utc_offset_seconds || 0,
      );
    }

    // Now button: always visible. Shows 'Now' at current time, 'Go to Now' when scrubbed away.
    const isNow = Math.abs(hourIndex - nowIdx) <= 1;
    if (this.$.timelineBadge) {
      this.$.timelineBadge.classList.remove("hidden");
      this.$.timelineBadge.textContent = isNow ? "Now" : "Go to Now";
    }
    const timeStr = WeatherService.formatDateTime(
      weather.time,
      this.weatherData?.timezone,
      this.weatherData?.utc_offset_seconds,
    );
    this.$.timelineLabel.textContent = timeStr;
    if (this.$.timelineMinimizedLabel) {
      this.$.timelineMinimizedLabel.textContent = timeStr;
    }


    // Synchronize marker bubble (uses shared template #4/#9)
    if (this.marker) {
      this.marker.setHtml(this._buildMarkerHtml(weather), this.selectedName, "location-tooltip");
    }

    // Update shareable URL
    this._updateUrlParams(this.selectedLat, this.selectedLng, this.selectedName);

    // Refresh temperature overlay if active
    if ((this.radarActive && this.overlayType === "temperature") || this.temperatureOverlayEnabled) {
      this.clearTempOverlay();
      this.initTempOverlayLayers();
    }

    // Init dashboard drag after weather data loads
    this.initDashboardDrag();

    // Keep the 🏠 Home badge in sync (panelLocationName text was reset above)
    this.updateHomeButton();

    // Keep mobile header badge & real-time cards in exact sync with current weather & AQI
    if (this.googleMapsMobile) {
      this.googleMapsMobile.syncCurrentLocationInfo(weather, this.selectedName, this.weatherData);
    }

    // Immediately translate cards into active language
    if (this.language && this.language !== "en" && typeof translateDOM === "function") {
      const card = document.getElementById("weatherCard");
      if (card) translateDOM(card, this.language);
    }
  }

  /**
   * Sums an hourly Open-Meteo variable across all hours of a given date
   * ("YYYY-MM-DD"). Used for daily totals the API only exposes hourly
   * (e.g. sunshine_duration).
   */
  _sumHourlyForDate(hourly, key, dateKey) {
    const times = hourly?.time;
    const values = hourly?.[key];
    if (!Array.isArray(times) || !Array.isArray(values)) return null;
    let total = null;
    for (let i = 0; i < times.length; i++) {
      if (!times[i]?.startsWith(dateKey)) continue;
      const v = values[i];
      if (v != null && isFinite(v)) total = (total ?? 0) + v;
    }
    return total;
  }

  /**
   * Populates the extended weather-card surfaces introduced by the
   * device-adaptive upgrade:
   *   • extra metric cards (rain chance, wind bearing, sunshine,
   *     storm potential/CAPE, freezing level, daylight)
   *   • "Today at a Glance" daily summary chips
   *   • 12-hour rain-probability strip (Hourly tab)
   * Every write is guarded so a missing element or missing API field
   * can never disturb the existing rendering pipeline.
   */
  updateExtendedWeatherInfo(weather, hourIndex) {
    const d = this.weatherData;
    if (!d?.hourly || !d?.daily) return;
    const h = d.hourly;
    const daily = d.daily;
    const utcOffset = d.utc_offset_seconds || 0;

    // Resolve which daily entry corresponds to the displayed hour.
    const dateKey = (h.time?.[hourIndex] || "").slice(0, 10);
    let dayIdx = daily.time ? daily.time.indexOf(dateKey) : -1;
    if (dayIdx < 0) dayIdx = 0;

    const setText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    // ── Extended metric cards (Details & AQI tab) ──────────────
    setText(
      "panelPrecipProb",
      weather.precipProb != null
        ? `${Math.round(weather.precipProb)}%`
        : "--",
    );
    const bearing = weather.windDirection;
    setText(
      "panelWindDir",
      bearing != null
        ? `${WeatherService.getWindDirection(bearing)} · ${Math.round(bearing)}°`
        : "--",
    );
    setText("panelSunshine", WeatherService.formatDuration(
      daily.sunshine_duration?.[dayIdx] != null
        ? daily.sunshine_duration[dayIdx]
        : this._sumHourlyForDate(h, "sunshine_duration", dateKey),
    ));
    setText("panelCAPE", WeatherService.formatCAPE(h.cape?.[hourIndex]));
    setText("panelFreezingLevel", WeatherService.formatFreezingLevel(h.freezing_level_height?.[hourIndex]));
    setText("panelDaylight", WeatherService.formatDuration(daily.daylight_duration?.[dayIdx]));

    // ── Today at a Glance (Overview tab) ───────────────────────
    setText(
      "todaySunrise",
      daily.sunrise?.[dayIdx]
        ? WeatherService.formatTimeOnly(daily.sunrise[dayIdx]) || "--"
        : "--",
    );
    setText(
      "todaySunset",
      daily.sunset?.[dayIdx]
        ? WeatherService.formatTimeOnly(daily.sunset[dayIdx]) || "--"
        : "--",
    );
    setText(
      "todayRainChance",
      WeatherService.formatPrecipProb(daily.precipitation_probability_max?.[dayIdx]),
    );
    const maxUV = daily.uv_index_max?.[dayIdx];
    setText("todayMaxUV", maxUV != null ? maxUV.toFixed(1) : "--");
    setText(
      "todayMaxWind",
      daily.wind_speed_10m_max?.[dayIdx] != null
        ? WeatherService.formatWind(daily.wind_speed_10m_max[dayIdx])
        : "--",
    );
    setText(
      "todayPrecipSum",
      daily.precipitation_sum?.[dayIdx] != null
        ? WeatherService.formatPrecip(daily.precipitation_sum[dayIdx])
        : "--",
    );
    const dayHigh = daily.temperature_2m_max?.[dayIdx];
    const dayLow = daily.temperature_2m_min?.[dayIdx];
    setText(
      "panelTempRange",
      dayHigh != null && dayLow != null
        ? `${WeatherService.formatDayLabel(dateKey)} · High ${WeatherService.formatTemp(dayHigh)} · Low ${WeatherService.formatTemp(dayLow)}`
        : "",
    );
    const rangeEl = document.getElementById("panelTempRange");
    if (rangeEl) rangeEl.title = rangeEl.textContent;

    // ── Rain-chance strip (Hourly tab, next 12h) ───────────────
    const strip = document.getElementById("rainChanceStrip");
    const stripLabels = document.getElementById("rainChanceLabels");
    const stripSection = document.getElementById("rainChanceSection");
    if (strip && stripLabels && stripSection) {
      const probs = h.precipitation_probability || [];
      const start = Math.max(0, hourIndex);
      const buckets = [];
      for (let i = start; i < Math.min(start + 12, probs.length); i++) {
        buckets.push({ time: h.time?.[i], prob: probs[i] });
      }
      if (buckets.length) {
        stripSection.classList.remove("hidden");
        // Build bars via DOM + CSSOM (CSP forbids inline style attributes)
        strip.innerHTML = "";
        stripLabels.innerHTML = "";
        buckets.forEach(({ time, prob }, i) => {
          const pct = Math.max(4, Math.min(100, Math.round(prob ?? 0)));
          const color =
            pct >= 70
              ? "bg-blue-600"
              : pct >= 40
                ? "bg-blue-400"
                : pct >= 15
                  ? "bg-blue-300 dark:bg-blue-700"
                  : "bg-blue-200/80 dark:bg-blue-900";
          const bar = document.createElement("div");
          bar.className = `flex-1 ${color}`;
          bar.title = `${pct}% rain chance`;
          bar.style.height = `${pct}%`;
          strip.appendChild(bar);

          const label = document.createElement("span");
          label.textContent =
            i % 3 === 0 && time
              ? WeatherService.formatHourLabel(time, utcOffset)
              : "·";
          stripLabels.appendChild(label);
        });
      } else {
        stripSection.classList.add("hidden");
      }
    }

    if (this.language && this.language !== "en" && typeof translateDOM === "function") {
      const p = this.$.weatherPanel || document.getElementById("weatherPanel");
      if (p) translateDOM(p, this.language);
    }
  }

  updateAirQualityDisplay(hourIndex) {
    if (!this.airQualityData || !this.airQualityData.hourly) {
      this.$.panelAQILabel.textContent = "AQI Unavailable";
      this.$.panelAQIMetrics.textContent = "PM2.5: -- | PM10: -- | O3: --";
      return;
    }

    const h = this.airQualityData.hourly;
    const aqiVal = h.us_aqi?.[hourIndex];
    const pm25 = h.pm2_5?.[hourIndex];
    const pm10 = h.pm10?.[hourIndex];
    const ozone = h.ozone?.[hourIndex];

    const info = WeatherService.getAQIInfo(aqiVal);

    this.$.panelAQILabel.textContent = info.label;
    this.$.panelAQILabel.className = `text-sm font-semibold ${info.colorClass} truncate`;
    this.$.panelAQIMetrics.textContent = `PM2.5: ${pm25 != null ? pm25.toFixed(1) : "--"} | PM10: ${pm10 != null ? pm10.toFixed(1) : "--"} | O3: ${ozone != null ? ozone.toFixed(1) : "--"} µg/m³`;

    this.$.panelAQIBadge.textContent =
      aqiVal != null ? Math.round(aqiVal) : "--";
    this.$.panelAQIBadge.className =
      "text-[10px] font-bold px-2.5 py-1.5 rounded-xl uppercase tracking-wider text-center min-w-[70px] flex-shrink-0 transition-all duration-300";
    if (aqiVal != null) {
      if (aqiVal <= 50) this.$.panelAQIBadge.classList.add("aqi-good");
      else if (aqiVal <= 100)
        this.$.panelAQIBadge.classList.add("aqi-moderate");
      else if (aqiVal <= 150)
        this.$.panelAQIBadge.classList.add("aqi-sensitive");
      else if (aqiVal <= 200)
        this.$.panelAQIBadge.classList.add("aqi-unhealthy");
      else if (aqiVal <= 300)
        this.$.panelAQIBadge.classList.add("aqi-very-unhealthy");
      else this.$.panelAQIBadge.classList.add("aqi-hazardous");
    }

    // Pollen display
    const birch = h.birch_pollen?.[hourIndex];
    const grass = h.grass_pollen?.[hourIndex];
    const mugwort = h.mugwort_pollen?.[hourIndex];
    const alder = h.alder_pollen?.[hourIndex];
    const hasPollen =
      birch != null || grass != null || mugwort != null || alder != null;
    if (hasPollen && this.$.pollenCard) {
      this.$.pollenCard.classList.remove("hidden");
      const renderPollen = (el, val) => {
        const info = WeatherService.getPollenLevel(val);
        el.textContent = info ? `${info.icon} ${val.toFixed(0)}` : "--";
        el.className = `text-sm font-bold ${info?.color || "text-slate-400"}`;
      };
      renderPollen(this.$.pollenBirch, birch);
      renderPollen(this.$.pollenGrass, grass);
      renderPollen(this.$.pollenMugwort, mugwort);
      renderPollen(this.$.pollenAlder, alder);
    } else if (this.$.pollenCard) {
      this.$.pollenCard.classList.add("hidden");
    }

    // Refresh best 2-hour outdoor running/activity window
    this.updateBestOutdoorWindowUI?.();
  }

  /**
   * Applies custom background styling according to weather conditions.
   */
  applyPanelWeatherTheme(code, isDay) {
    this.$.weatherPanel.classList.remove(
      "theme-sunny",
      "theme-rainy",
      "theme-cloudy",
      "theme-stormy",
      "theme-snowy",
    );

    // The panel tint is a generated gradient rather than a stock photo, so it
    // renders instantly, works offline, and sends nothing to a CDN.
    const panelBg = this.$.panelWeatherBg || document.getElementById("panelWeatherBg");
    if (panelBg) {
      panelBg.style.backgroundImage = weatherPanelGradient(code, isDay);
      panelBg.style.opacity = this.isDark ? "0.22" : "0.16";
    }

    if (!isDay) {
      return;
    }

    if (code === 0 || code === 1) {
      this.$.weatherPanel.classList.add("theme-sunny");
    } else if (code === 2 || code === 3 || code === 45 || code === 48) {
      this.$.weatherPanel.classList.add("theme-cloudy");
    } else if (WeatherService.isRainCode(code)) {
      this.$.weatherPanel.classList.add("theme-rainy");
    } else if (WeatherService.isStormCode(code)) {
      this.$.weatherPanel.classList.add("theme-stormy");
    } else if (WeatherService.isSnowCode(code)) {
      this.$.weatherPanel.classList.add("theme-snowy");
    }
  }

  /**
   * Renders the custom interactive 24h Dual-Axis SVG Trend Sparkline inside the panel.
   * Supports confidence bands, signal/noise decomposition, and probabilistic precip curves.
   */
  drawHourlySparkline(selectedHourIndex) {
    if (!this.weatherData?.hourly?.time) return;

    const totalHours = this.weatherData.hourly.time.length;
    let startIdx = Math.max(0, selectedHourIndex - 12);
    const endIdx = Math.min(totalHours - 1, startIdx + 23);
    if (endIdx - startIdx < 23) startIdx = Math.max(0, endIdx - 23);

    if (
      startIdx === this._sparklineStart &&
      endIdx === this._sparklineEnd &&
      this._sparklineDrawnWidth === (Math.max(280, Math.round(this.$.trendSvg?.parentElement?.getBoundingClientRect().width || 300))) &&
      this.$.chartPoints.childNodes.length > 0
    )
      return;
    this._sparklineStart = startIdx;
    this._sparklineEnd = endIdx;
    this._sparklineDrawnWidth = Math.max(280, Math.round(this.$.trendSvg?.parentElement?.getBoundingClientRect().width || 300));
    if (this.$.trendSvg) {
      this.$.trendSvg.setAttribute("viewBox", `0 0 ${this._sparklineDrawnWidth} 80`);
    }

    const hourlyTemps = [];
    const hourlyPrecipProb = [];
    const hourlyTimes = [];
    const indicators = [];

    for (let i = startIdx; i <= endIdx; i++) {
      hourlyTemps.push(this.weatherData.hourly.temperature_2m[i]);
      hourlyPrecipProb.push(
        this.weatherData.hourly.precipitation_probability?.[i] ?? 0,
      );
      hourlyTimes.push(this.weatherData.hourly.time[i]);
      indicators.push(i);
    }

    const minTemp = Math.min(...hourlyTemps);
    const maxTemp = Math.max(...hourlyTemps);
    const tempRange = Math.max(1, maxTemp - minTemp);

    const width = this._sparklineDrawnWidth || 300;
    const height = 65;
    const paddingLeft = 12;
    const paddingRight = 12;
    const paddingTop = 12;
    const paddingBottom = 12;

    const chartW = width - paddingLeft - paddingRight;
    const chartH = height - paddingTop - paddingBottom;

    const points = hourlyTemps.map((temp, idx) => {
      const x = paddingLeft + (idx / 23) * chartW;
      const y = paddingTop + chartH - ((temp - minTemp) / tempRange) * chartH;
      return {
        x,
        y,
        temp,
        precip: hourlyPrecipProb[idx],
        idx: indicators[idx],
        time: hourlyTimes[idx],
      };
    });

    this.$.chartPoints.innerHTML = "";

    // ── Confidence Bands (shaded σ ribbon) ──────────────────
    if (this.showConfidence) {
      const bands = WeatherService.getConfidenceBands(this.weatherData);
      if (bands) {
        const bandPoints = indicators
          .map((origIdx, localIdx) => {
            const sigma = bands[origIdx];
            if (sigma == null) return null;
            const yUpper = points[localIdx]?.y - (sigma / tempRange) * chartH;
            const yLower = points[localIdx]?.y + (sigma / tempRange) * chartH;
            return { x: points[localIdx]?.x, yUpper, yLower };
          })
          .filter((p) => p != null);

        if (bandPoints.length >= 2) {
          const upperPath =
            "M " + bandPoints.map((p) => `${p.x} ${p.yUpper}`).join(" L ");
          const lowerPath =
            " L " +
            bandPoints
              .slice()
              .reverse()
              .map((p) => `${p.x} ${p.yLower}`)
              .join(" L ") +
            " Z";
          const ribbon = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
          );
          ribbon.setAttribute("d", upperPath + lowerPath);
          ribbon.setAttribute("fill", "#6366f1");
          ribbon.setAttribute("fill-opacity", "0.12");
          ribbon.setAttribute("stroke", "none");
          this.$.chartPoints.prepend(ribbon);
        }
      }
    }

    // ── Signal/Noise Decomposition (cached per render #6) ──
    let lineTemps = hourlyTemps;
    if (this.showSignal) {
      if (!this._cachedDecomposition) {
        this._cachedDecomposition = WeatherService.decomposeSignalNoise(
          this.weatherData,
        );
      }
      const decomposed = this._cachedDecomposition;
      if (decomposed?.signal) {
        lineTemps = indicators
          .map((i) => decomposed.signal[i])
          .filter((t) => t != null);
        // Map back to our window
        lineTemps = points.map(
          (p, i) => decomposed.signal[indicators[i]] ?? p.temp,
        );
      }
    }

    // Draw Precip probability bars
    const barWidth = Math.max(2, chartW / 24 - 2);
    points.forEach((p) => {
      if (p.precip > 0) {
        const barHeight = (p.precip / 100) * (chartH + 8);
        const barY = height - barHeight;

        const rect = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "rect",
        );
        rect.setAttribute("x", p.x - barWidth / 2);
        rect.setAttribute("y", barY);
        rect.setAttribute("width", barWidth);
        rect.setAttribute("height", barHeight);
        rect.setAttribute("rx", "1");
        rect.setAttribute("class", "chart-bar");
        rect.setAttribute("title", `Precipitation: ${p.precip}%`);

        rect.addEventListener("click", () => {
          const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
          const sliderVal = p.idx - timeOffset;
          this.$.timelineSlider.value = sliderVal;
          this.handleTimelineChange(sliderVal);
        });

        this.$.chartPoints.appendChild(rect);
      }
    });

    // Generate temp line path
    let pathCmd = `M ${points[0].x} ${lineTemps ? paddingTop + chartH - ((lineTemps[0] - minTemp) / tempRange) * chartH : points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const y = lineTemps
        ? paddingTop + chartH - ((lineTemps[i] - minTemp) / tempRange) * chartH
        : points[i].y;
      pathCmd += ` L ${points[i].x} ${y}`;
    }
    this.$.chartLine.setAttribute("d", pathCmd);

    const areaCmd = `${pathCmd} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;
    this.$.chartArea.setAttribute("d", areaCmd);

    // ── Noise dots (residuals) when signal view is active (uses cache #6) ──
    if (this.showSignal) {
      const decomposed = this._cachedDecomposition;
      if (decomposed?.noise) {
        points.forEach((p) => {
          const noise =
            decomposed.noise[indicators[p.idx - indicators[0]]] ?? 0;
          if (Math.abs(noise) > 0.5) {
            const dot = document.createElementNS(
              "http://www.w3.org/2000/svg",
              "circle",
            );
            dot.setAttribute("cx", p.x);
            const signalY =
              paddingTop +
              chartH -
              ((lineTemps[p.idx - indicators[0]] - minTemp) / tempRange) *
                chartH;
            const noisePixel = -(noise / tempRange) * chartH;
            dot.setAttribute("cy", signalY + noisePixel);
            dot.setAttribute("r", "1");
            dot.setAttribute("fill", noise > 0 ? "#ef4444" : "#3b82f6");
            dot.setAttribute("fill-opacity", "0.3");
            this.$.chartPoints.appendChild(dot);
          }
        });
      }
    }

    // Plot circle nodes
    points.forEach((p) => {
      const isSelected = p.idx === selectedHourIndex;
      const y = lineTemps
        ? paddingTop +
          chartH -
          ((lineTemps[p.idx - indicators[0]] - minTemp) / tempRange) * chartH
        : p.y;

      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", isSelected ? "4.5" : "2.5");
      circle.setAttribute("fill", isSelected ? "#6366f1" : "#cbd5e1");
      circle.setAttribute("fill-opacity", isSelected ? "1" : "0.4");
      circle.setAttribute("stroke", isSelected ? "#ffffff" : "none");
      circle.setAttribute("stroke-width", isSelected ? "1.5" : "0");
      circle.setAttribute("class", "chart-point");

      circle.addEventListener("click", () => {
        const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
        const sliderVal = p.idx - timeOffset;
        this.$.timelineSlider.value = sliderVal;
        this.handleTimelineChange(sliderVal);
      });

      this.$.chartPoints.appendChild(circle);

      if (
        isSelected ||
        (!this.showSignal && (p.temp === minTemp || p.temp === maxTemp))
      ) {
        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text",
        );
        text.setAttribute("x", p.x);
        text.setAttribute("y", y - 6);
        text.setAttribute("class", "chart-text");
        text.textContent = `${Math.round(this.showSignal ? lineTemps[p.idx - indicators[0]] : p.temp)}°`;
        this.$.chartPoints.appendChild(text);
      }
    });

    // Hours labels
    this.$.chartHours.innerHTML = "";
    const labelIndices = [0, 6, 12, 18, 23];
    labelIndices.forEach((idx) => {
      if (points[idx]) {
        const span = document.createElement("span");
        span.textContent = WeatherService.formatHourLabel(
        points[idx].time,
        this.weatherData?.utc_offset_seconds || 0,
      );
        this.$.chartHours.appendChild(span);
      }
    });

    // Cumulative precip probability curve
    const cumCurve = WeatherService.getCumulativePrecipProb(
      this.weatherData,
      indicators[0],
      24,
    );
    if (cumCurve && cumCurve.length > 1 && this.$.cumulativeCurve) {
      const maxCum = Math.max(...cumCurve.map((c) => c.cumProb));
      if (maxCum > 0) {
        const h2 = 20;
        this.$.cumulativeCurve.innerHTML = "";
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("class", "w-full h-full overflow-visible");
        svg.setAttribute("viewBox", `0 0 ${width} ${h2}`);
        const cChartW = width - paddingLeft - paddingRight;
        const cPoints = cumCurve
          .filter((c, i) => i >= 0 && i < points.length)
          .map((c, i) => ({
            x: paddingLeft + (i / Math.min(cumCurve.length - 1, 23)) * cChartW,
            y: h2 - (c.cumProb / Math.max(100, maxCum)) * (h2 - 4) - 2,
            prob: c.cumProb,
          }));
        if (cPoints.length >= 2) {
          let cPath = `M ${cPoints[0].x} ${cPoints[0].y}`;
          for (let i = 1; i < cPoints.length; i++) {
            cPath += ` L ${cPoints[i].x} ${cPoints[i].y}`;
          }
          const path = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
          );
          path.setAttribute("d", cPath);
          path.setAttribute("fill", "none");
          path.setAttribute("stroke", "#3b82f6");
          path.setAttribute("stroke-width", "1.5");
          path.setAttribute("stroke-dasharray", "3,2");
          svg.appendChild(path);
          // Fill under curve
          const area = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path",
          );
          area.setAttribute(
            "d",
            `${cPath} L ${cPoints[cPoints.length - 1].x} ${h2} L ${cPoints[0].x} ${h2} Z`,
          );
          area.setAttribute("fill", "#3b82f6");
          area.setAttribute("fill-opacity", "0.08");
          svg.appendChild(area);
        }
        this.$.cumulativeCurve.appendChild(svg);
      }
    }
  }

  // ================================================================
  //  TIMELINE SLIDER
  // ================================================================

  initTimeline() {
    if (!this.weatherData) return;

    const hourlyTimes = this.weatherData.hourly.time;
    let totalHours = hourlyTimes.length;
    let timeOffset = 0;

    // 24h mode: filter to ±12 hours (25 hours total) from current hour
    if (this.timeline24hMode) {
      timeOffset = this._getTimelineOffset();
      totalHours = Math.min(25, hourlyTimes.length - timeOffset);
    }

    this.$.timelineSlider.min = 0;
    this.$.timelineSlider.max = totalHours - 1;

    // Day boundaries mapping
    const dayMap = new Map();
    for (let i = 0; i < totalHours; i++) {
      const actualIdx = i + timeOffset;
      const dateStr = hourlyTimes[actualIdx].split("T")[0];
      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, i);
      }
    }

    const isMobile = typeof isMobileLayout === "function" ? isMobileLayout() : (typeof window !== "undefined" && window.innerWidth < 640);
    this.$.timelineDays.innerHTML = "";
    let lastRenderedPct = -999;
    const dayEntries = Array.from(dayMap.entries());

    dayEntries.forEach(([dateStr, startIdx], entryIdx) => {
      const pct = (startIdx / (totalHours - 1)) * 100;
      const fullDayText = WeatherService.formatDayLabel(dateStr);
      const isToday = fullDayText === "Today";

      // On mobile view with dense multi-day timelines, prevent pill collision:
      // 1. Abbreviate "Yesterday" -> "Yest" and "Tomorrow" -> "Tmrw".
      // 2. Enforce minimum spacing on mobile, always preserving "Today".
      let compactDayText = fullDayText;
      const isDenseTimeline = isMobile || totalHours > 48 || (typeof window !== "undefined" && window.innerWidth < 840);
      if (isDenseTimeline) {
        if (fullDayText === "Yesterday") compactDayText = "Yest";
        else if (fullDayText === "Tomorrow") compactDayText = "Tmrw";
      }

      if (isDenseTimeline && !isToday && totalHours > 48) {
        if (pct - lastRenderedPct < 11) {
          const nextIsToday = dayEntries[entryIdx + 1] && WeatherService.formatDayLabel(dayEntries[entryIdx + 1][0]) === "Today";
          if (nextIsToday || (entryIdx % 2 !== 0)) {
            return;
          }
        }
      }

      lastRenderedPct = pct;

      const label = document.createElement("span");
      label.className = isToday
        ? "absolute whitespace-nowrap px-1.5 sm:px-2 py-0.5 rounded-full bg-primary/10 text-primary dark:bg-primary-light/15 dark:text-primary-light font-bold text-[8.5px] sm:text-[10px]"
        : "absolute whitespace-nowrap px-1 sm:px-1.5 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-700/60 text-[8px] sm:text-[9.5px]";
      label.style.left = `${pct}%`;
      label.style.transform = "translateX(-50%)";
      label.textContent = compactDayText;
      this.$.timelineDays.appendChild(label);
    });
    this.$.timelineDays.style.position = "relative";
    this.$.timelineDays.style.height = "22px";

    // Tick marks formatting with adaptive interval to prevent collisions
    this.$.timelineTicks.innerHTML = "";
    let tickStep = 6;
    if (this.timeline24hMode) {
      tickStep = isMobile ? 3 : 1;
    } else {
      if (totalHours > 48) {
        tickStep = (!isMobile && typeof window !== "undefined" && window.innerWidth >= 1200) ? 12 : 24;
      } else if (totalHours > 24) {
        tickStep = isMobile ? 12 : 6;
      } else {
        tickStep = isMobile ? 3 : 1;
      }
    }

    // Dynamic track width collision guard (ensures >= 40px spacing between tick numbers)
    const trackWidth = this.$.timelineTicks.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 400);
    const minHoursForClearTicks = Math.ceil((40 / Math.max(280, trackWidth)) * totalHours);
    if (tickStep < minHoursForClearTicks) {
      if (minHoursForClearTicks <= 3) tickStep = 3;
      else if (minHoursForClearTicks <= 6) tickStep = 6;
      else if (minHoursForClearTicks <= 12) tickStep = 12;
      else tickStep = 24;
    }

    for (let i = 0; i < totalHours; i++) {
      const actualIdx = i + timeOffset;
      const timePart = hourlyTimes[actualIdx]?.split("T")[1];
      if (!timePart) continue;
      const h = parseInt(timePart.split(":")[0], 10);

      const isTickHour = (h % tickStep === 0);

      if (isTickHour) {
        const tick = document.createElement("span");
        tick.className = this.timeline24hMode
          ? "absolute text-[7.5px] sm:text-[9px] md:text-[10px] text-slate-400 dark:text-slate-500 font-semibold select-none"
          : "absolute text-[8px] sm:text-[9.5px] md:text-[10px] text-slate-400 dark:text-slate-500 font-semibold select-none";
        tick.style.left = `${(i / (totalHours - 1)) * 100}%`;
        tick.style.transform = "translateX(-50%)";
        tick.style.top = "2px";

        const displayH = h === 0 ? "00" : h.toString().padStart(2, "0");
        tick.textContent = displayH;
        this.$.timelineTicks.appendChild(tick);
      }
    }

    const nowIdx = WeatherService.getCurrentHourIndex(
      this.weatherData,
      this.weatherData?.utc_offset_seconds || 0,
    );
    this.currentHourIndex = nowIdx;
    const displayNowIdx = Math.max(0, Math.min(totalHours - 1, nowIdx - timeOffset));
    const nowPct = (displayNowIdx / (totalHours - 1)) * 100;

    // Set slider knob position initially to current hour (Now) by default
    this.$.timelineSlider.value = displayNowIdx;
    this._updateTrackFill(displayNowIdx);

    this.$.nowIndicator.style.left = `${nowPct}%`;
    this.$.nowIndicator.classList.remove("hidden");
    this.$.timelineSlider.style.setProperty("--now-position", `${nowPct}%`);

    const nowCode = this.weatherData.hourly.weather_code[nowIdx];
    if (nowCode !== undefined) {
      this.$.timelineSlider.style.setProperty('--knob-color', this._getWeatherColorForCode(nowCode));
    }

    if (this.$.nowTimeLabel) {
      this.$.nowTimeLabel.textContent = WeatherService.getFormattedLocationCurrentTime(
        this.weatherData?.timezone,
        this.weatherData?.utc_offset_seconds || 0
      );
    }
    this.updateTrackColors();
  }

  jumpToNow() {
    if (!this.weatherData) return;
    const nowIdx = WeatherService.getCurrentHourIndex(
      this.weatherData,
      this.weatherData?.utc_offset_seconds || 0
    );
    const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
    const totalHours = this.weatherData.hourly?.time?.length || 240;
    const sliderVal = Math.max(
      0,
      Math.min(totalHours - 1, nowIdx - timeOffset)
    );
    this.$.timelineSlider.value = sliderVal;
    this._updateTrackFill(sliderVal);
    this.handleTimelineChange(sliderVal);
  }

  /** Updates the custom track fill bar width to match the current slider position */
  _updateTrackFill(sliderVal) {
    const fill = this.$.timelineTrackFill;
    if (!fill || !this.$.timelineSlider) return;
    const min = parseFloat(this.$.timelineSlider.min) || 0;
    const max = parseFloat(this.$.timelineSlider.max) || 239;
    const pct = ((sliderVal - min) / (max - min)) * 100;
    fill.style.width = `${pct.toFixed(2)}%`;
  }

  updateTimelineTooltip(hourIndex) {
    const tip = this.$.timelineTooltip;
    if (!tip || !this.weatherData?.hourly) return;
    const timeStr = this.weatherData.hourly.time[hourIndex];
    if (!timeStr) {
      tip.classList.add("hidden");
      return;
    }

    const units = (typeof WeatherService !== "undefined" && WeatherService.getUnits?.()) || "metric";
    const sparklineHtml = buildSparklinePillSvg(this.weatherData, hourIndex, units);
    if (sparklineHtml) {
      tip.innerHTML = sparklineHtml;
    } else {
      const parts = timeStr.split("T");
      const dateParts = parts[0].split("-");
      const timeParts = parts[1].split(":");
      const localDate = new Date(
        parseInt(dateParts[0], 10),
        parseInt(dateParts[1], 10) - 1,
        parseInt(dateParts[2], 10),
        parseInt(timeParts[0], 10),
        parseInt(timeParts[1], 10)
      );
      const dayName = localDate.toLocaleDateString("en-US", { weekday: "short" });
      const timeFormatted = WeatherService.formatTimeOnly(timeStr);
      const temp = this.weatherData.hourly.temperature_2m?.[hourIndex];
      tip.textContent = `${dayName} ${timeFormatted} • ${temp != null ? Math.round(temp) + '°' : '--°'}`;
    }

    // Check hazard threshold crossing (UV >= 8, AQI > 150, Wind > 50 km/h, Precip > 5 mm/h)
    if (this.hapticEngine) {
      const metrics = {
        uv: this.weatherData.hourly.uv_index?.[hourIndex],
        windSpeed: this.weatherData.hourly.wind_speed_10m?.[hourIndex],
        precipitation: this.weatherData.hourly.precipitation?.[hourIndex],
      };
      this.hapticEngine.checkWeatherThresholds(metrics, hourIndex, this.$.timelineSlider);
    }

    // Calculate position based on slider index for 24h mode / weekly mode
    const slider = this.$.timelineSlider;
    const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
    const sliderIndex = hourIndex - timeOffset;
    const min = parseInt(slider.min, 10) || 0;
    const max = parseInt(slider.max, 10) || 1;
    const pct = Math.max(0, Math.min(1, (sliderIndex - min) / (max - min)));

    // Edge clamping: ensure glossy pill never spills beyond timeline track edges
    const sliderWidth = slider.offsetWidth || 300;
    const pillHalfWidth = 80;
    const thumbX = pct * sliderWidth;
    let arrowOffset = 0;

    if (thumbX < pillHalfWidth) {
      const shift = pillHalfWidth - thumbX;
      tip.style.transform = `translateX(calc(-50% + ${shift}px))`;
      arrowOffset = -shift;
    } else if (thumbX > sliderWidth - pillHalfWidth) {
      const shift = thumbX - (sliderWidth - pillHalfWidth);
      tip.style.transform = `translateX(calc(-50% - ${shift}px))`;
      arrowOffset = shift;
    } else {
      tip.style.transform = "translateX(-50%)";
      arrowOffset = 0;
    }

    const pill = tip.querySelector(".sparkline-pill");
    if (pill) {
      pill.style.setProperty("--arrow-offset", `${arrowOffset}px`);
    }

    tip.style.left = `${pct * 100}%`;
    tip.classList.remove("hidden");
  }


  resetView() {
    if (!this.map) return;
    this.map.updateSize();
    this.map.getView().animate({ center: fromLonLat([0.0, 20.0]), zoom: 3, rotation: 0 });
    this.showToast("Map view reset", "info");
  }

  _getWeatherColorForCode(code) {
    if (code >= 95) return "#dc2626";
    if (code >= 71 && code <= 77) return "#e0e7ff";
    if (code >= 51 && code <= 67) return "#60a5fa";
    if (code >= 80 && code <= 86) return "#3b82f6";
    if (code >= 61 && code <= 66) return "#2563eb";
    if (code >= 45 && code <= 48) return "#94a3b8";
    if (code >= 3 && code <= 4) return "#94a3b8";
    if (code === 2) return "#cbd5e1";
    return "#fbbf24";
  }

  updateTrackColors() {
    if (!this.weatherData?.hourly?.weather_code) return;
    const hourlyTimes = this.weatherData.hourly.time;
    if (!hourlyTimes || !hourlyTimes.length) return;

    let totalHours = hourlyTimes.length;
    let timeOffset = 0;

    if (this.timeline24hMode) {
      timeOffset = this._getTimelineOffset();
      totalHours = Math.min(25, hourlyTimes.length - timeOffset);
    }

    const colors = [];
    for (let i = 0; i < totalHours; i++) {
      const actualIdx = i + timeOffset;
      const code = this.weatherData.hourly.weather_code[actualIdx];
      colors.push(this._getWeatherColorForCode(code));
    }
    const stops = colors
      .map((c, i) => `${c} ${((i / (totalHours - 1)) * 100).toFixed(2)}%`)
      .join(", ");
    const gradient = `linear-gradient(to right, ${stops})`;

    if (this.$.timelineTrackBg) {
      this.$.timelineTrackBg.style.background = gradient;
    }
    if (this.$.timelineSlider?.parentElement) {
      this.$.timelineSlider.parentElement.style.setProperty('--track-colors', gradient);
    }
  }

  handleTimelineChange(sliderIndex) {
    if (!this.weatherData) return;

    // Cancel any existing animation frame to prevent queue buildup
    if (this._timelineRAF) {
      cancelAnimationFrame(this._timelineRAF);
      this._timelineRAF = null;
    }

    // Convert slider index to actual data index when in 24h mode
    const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
    const hourIndex = sliderIndex + timeOffset;

    const code = this.weatherData.hourly.weather_code[hourIndex];
    if (code !== undefined && this.$.timelineSlider) {
      this.$.timelineSlider.style.setProperty('--knob-color', this._getWeatherColorForCode(code));
    }

    this._timelineRAF = requestAnimationFrame(() => {
      this._timelineRAF = null;
      // Invalidate cached decomposition on hour change
      this._cachedDecomposition = null;
      this.updateWeatherDisplay(hourIndex);
      if (this.selectedLat != null && this.selectedLng != null) {
        this.createWeatherMarker(this.selectedLat, this.selectedLng, hourIndex);
      }
      // Keep the minimised card in sync with the selected hour
      this.updateTimelineTooltip(hourIndex);
      this.updateTrackColors();

      // Ensure celestial bodies and sky dome update immediately during timeline scrubbing
      if (document.body.classList.contains("sky-radar-fullscreen-active") || this.activeWeatherTab === "astronomy") {
        const timePart = this.weatherData?.hourly?.time?.[hourIndex];
        if (timePart && typeof this.updateCelestialBodies === "function") {
          this.updateCelestialBodies(new Date(timePart));
        }
      }
    });
  }

  // Get the time offset for 24h mode (centered on current hour)
  _getTimelineOffset() {
    if (!this.weatherData) return 0;
    const nowIdx = WeatherService.getCurrentHourIndex(
      this.weatherData,
      this.weatherData?.utc_offset_seconds || 0,
    );
    const totalHours = this.weatherData.hourly.time.length;
    // Center 24-hour window around current hour (12 before, 12 after)
    const startIdx = Math.max(0, Math.min(nowIdx - 12, totalHours - 25));
    return startIdx;
  }

  // ================================================================
  //  WEATHER RADAR & SATELLITE OVERLAYS (RainViewer API)
  // ================================================================
  // (relocated to features/radar.js -- see features/registry.js)

  // ================================================================
  //  SAVED LOCATIONS / BOOKMARKS FAVORITES
  // ================================================================
  // (relocated to features/bookmarks.js -- see features/registry.js)

  // ================================================================
  //  COMPARE CITIES VIEW
  // ================================================================
  // (relocated to features/compareCities.js -- see features/registry.js)

  // ================================================================
  //  UNIT TOGGLE (°C/°F, km/h/mph)
  // ================================================================
  // (relocated to features/units.js -- see features/registry.js)

  // ================================================================
  //  SHARE WEATHER
  // ================================================================
  // (relocated to features/share.js -- see features/registry.js)

  // ================================================================
  //  HOURLY FORECAST SCROLL STRIP
  // ================================================================
  // (relocated to features/hourlyStrip.js -- see features/registry.js)

  // ================================================================
  //  BEST OUTDOOR WINDOW
  // ================================================================
  // (relocated to features/insights.js -- see features/registry.js)

  // ================================================================
  //  TEMPORAL COMPRESSION GRID
  // ================================================================
  // (relocated to features/insights.js -- see features/registry.js)

  // ================================================================
  //  COMFORT INDEX DISPLAY
  // ================================================================
  // (relocated to features/insights.js -- see features/registry.js)

  // ================================================================
  //  PRESSURE TENDENCY
  // ================================================================
  // (relocated to features/insights.js -- see features/registry.js)

  // ================================================================
  //  TIMELINE DELTAS (rate of change)
  // ================================================================
  // (relocated to features/insights.js -- see features/registry.js)

  // ================================================================
  //  NEXT RAIN BUTTON
  // ================================================================
  // (relocated to features/insights.js -- see features/registry.js)

  // ================================================================
  //  PREDICTIVE ARRIVAL (weather coming your way)
  // ================================================================
  // (relocated to features/insights.js -- see features/registry.js)

  // ================================================================
  //  DATA EXPORT
  // ================================================================

  // ================================================================
  //  EXTREME MINIMAL MODE
  // ================================================================
  // (relocated to features/minimalMode.js -- see features/registry.js)

  // ================================================================
  //  SEARCH KEYBOARD NAVIGATION & HISTORY
  // ================================================================

  handleSearchKeyboard(e) {
    const items = this.$.searchResults.querySelectorAll(".search-result-item");

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this.searchHighlightIndex < items.length - 1) {
        this.searchHighlightIndex++;
      } else {
        this.searchHighlightIndex = 0; // wrap to top
      }
      this.highlightSearchItem(items);
      items[this.searchHighlightIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this.searchHighlightIndex > 0) {
        this.searchHighlightIndex--;
      } else {
        this.searchHighlightIndex = items.length - 1; // wrap to bottom
      }
      this.highlightSearchItem(items);
      items[this.searchHighlightIndex]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (this.searchHighlightIndex >= 0 && items[this.searchHighlightIndex]) {
        items[this.searchHighlightIndex].click();
      } else if (items.length > 0) {
        items[0].click();
      }
    }
  }

  highlightSearchItem(items) {
    items.forEach((item, i) => {
      item.classList.toggle("bg-primary/10", i === this.searchHighlightIndex);
      item.classList.toggle(
        "dark:bg-primary/20",
        i === this.searchHighlightIndex,
      );
    });
    this._syncSearchAria();
  }

  getSearchHistory() {
    return [...this.searchHistory];
  }

  _loadSearchHistory() {
    try {
      const raw = localStorage.getItem(this.searchHistoryKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  _saveSearchHistory() {
    try {
      localStorage.setItem(
        this.searchHistoryKey,
        JSON.stringify(this.searchHistory),
      );
    } catch {}
  }

  addToSearchHistory(result) {
    if (!result) return;
    const name = result.name || result.displayName || "";
    const displayName = result.displayName || result.name || "";
    // Remove duplicate if exists
    this.searchHistory = this.searchHistory.filter(
      (h) => h.displayName !== displayName && h.name !== name,
    );
    // Add to front — keep the rich metadata so history rows render with flags and stats
    this.searchHistory.unshift({
      displayName: displayName,
      name: name,
      latitude: result.latitude ?? result.lat,
      longitude: result.longitude ?? result.lng,
      countryCode: result.countryCode || "",
      admin1: result.admin1 || "",
      country: result.country || "",
      population: result.population ?? null,
      featureCode: result.featureCode || "",
    });
    // Keep last 10
    this.searchHistory = this.searchHistory.slice(0, 10);
    this._saveSearchHistory();
  }

  removeFromSearchHistory(target, e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    this._haptic?.('light');
    if (typeof target === 'number') {
      this.searchHistory.splice(target, 1);
    } else {
      this.searchHistory = this.searchHistory.filter(
        (h) => h.displayName !== target && h.name !== target,
      );
    }
    this._saveSearchHistory();
    if (this.searchActiveFilter === 'recents') {
      this.showSearchRecentsOnly();
    } else {
      this.showSearchHistory();
    }
  }

  clearSearchHistory(e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    this._haptic?.('selection');
    this.searchHistory = [];
    this._saveSearchHistory();
    if (this.searchActiveFilter === 'recents') {
      this.showSearchRecentsOnly();
    } else {
      this.showSearchHistory();
    }
    this.showToast?.("Search history cleared", "info", 1500);
  }

  /**
   * Reads cached temperature & weather code for a location if stored in localStorage or memory.
   * Returns { temp, unit, weatherCode } or null.
   */
  _getCachedTempForLocation(lat, lng) {
    if (lat == null || lng == null) return null;
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!isFinite(nLat) || !isFinite(nLng)) return null;

    // 1. Check active loaded location
    if (
      this.currentData?.current &&
      this.selectedLat != null &&
      this.selectedLng != null &&
      Math.abs(this.selectedLat - nLat) < 0.08 &&
      Math.abs(this.selectedLng - nLng) < 0.08
    ) {
      const cur = this.currentData.current;
      const temp = cur.temperature_2m ?? cur.temperature;
      if (temp != null && isFinite(temp)) {
        return {
          temp: Math.round(temp),
          unit: this.units?.temperature || "°C",
          weatherCode: cur.weather_code ?? cur.weathercode,
        };
      }
    }

    // 2. Check localStorage weathermap_cache_* keys
    try {
      const exactKey = `weathermap_cache_${nLat.toFixed(3)}_${nLng.toFixed(3)}`;
      const exactRaw = localStorage.getItem(exactKey);
      if (exactRaw) {
        const parsed = JSON.parse(exactRaw);
        const cur = parsed?.forecast?.current;
        if (cur && (cur.temperature_2m != null || cur.temperature != null)) {
          const temp = cur.temperature_2m ?? cur.temperature;
          return {
            temp: Math.round(temp),
            unit: this.units?.temperature || "°C",
            weatherCode: cur.weather_code ?? cur.weathercode,
          };
        }
      }

      // Check nearby cache keys within ~0.1 deg (~10km)
      const keys = this._getCacheKeyList ? this._getCacheKeyList() : [];
      for (const k of keys) {
        const parts = k.replace("weathermap_cache_", "").split("_");
        if (parts.length >= 2) {
          const cLat = parseFloat(parts[0]);
          const cLng = parseFloat(parts[1]);
          if (Math.abs(cLat - nLat) < 0.08 && Math.abs(cLng - nLng) < 0.08) {
            const parsed = JSON.parse(localStorage.getItem(k));
            const cur = parsed?.forecast?.current;
            if (cur && (cur.temperature_2m != null || cur.temperature != null)) {
              const temp = cur.temperature_2m ?? cur.temperature;
              return {
                temp: Math.round(temp),
                unit: this.units?.temperature || "°C",
                weatherCode: cur.weather_code ?? cur.weathercode,
              };
            }
          }
        }
      }
    } catch (_) {}
    return null;
  }

  _getWeatherEmoji(code) {
    if (code == null) return "🌡️";
    if (code === 0) return "☀️";
    if (code <= 3) return "⛅";
    if (code === 45 || code === 48) return "🌫️";
    if (code >= 51 && code <= 67) return "🌧️";
    if (code >= 71 && code <= 77) return "🌨️";
    if (code >= 80 && code <= 82) return "🌦️";
    if (code >= 85 && code <= 86) return "🌨️";
    if (code >= 95) return "⛈️";
    return "🌡️";
  }

  _createSvgIcon(name) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "w-4 h-4");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    if (name === "gps") {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2.2");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z");
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "12");
      circle.setAttribute("cy", "9");
      circle.setAttribute("r", "2.5");
      svg.appendChild(path);
      svg.appendChild(circle);
    } else if (name === "home") {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2.2");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z");
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.setAttribute("points", "9 22 9 12 15 12 15 22");
      svg.appendChild(path);
      svg.appendChild(poly);
    } else if (name === "star") {
      svg.setAttribute("fill", "currentColor");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z");
      svg.appendChild(path);
    } else if (name === "clock") {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z");
      svg.appendChild(path);
    } else if (name === "globe") {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "12");
      circle.setAttribute("cy", "12");
      circle.setAttribute("r", "10");
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", "M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z");
      svg.appendChild(circle);
      svg.appendChild(path);
    }
    return svg;
  }

  setSearchFilter(filter) {
    this.searchActiveFilter = filter;
    const chips = this.$.searchDropdown?.querySelectorAll(".search-filter-chip");
    chips?.forEach((chip) => {
      const active = chip.dataset.filter === filter;
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-selected", active ? "true" : "false");
    });
    this._haptic?.('selection');

    const query = this.$.searchInput?.value.trim() || "";
    if (query.length >= 2) {
      this.performSearch(query);
    } else {
      if (filter === "favorites") {
        this.showSearchBookmarks();
      } else if (filter === "recents") {
        this.showSearchRecentsOnly();
      } else if (filter === "popular") {
        this.showSearchPopularOnly();
      } else {
        this.showSearchHistory();
      }
    }
  }

  _renderSearchShortcuts(container) {
    const { createElement } = window.domUtils;
    const shortcutsGrid = createElement("div", {
      className: "search-shortcuts-grid grid grid-cols-3 gap-1.5 p-2 border-b border-slate-200/60 dark:border-slate-700/60",
    });

    // 1. My Location (GPS)
    const gpsBtn = createElement(
      "button",
      {
        type: "button",
        className: "search-shortcut-card flex flex-col items-center justify-center p-2 rounded-xl bg-slate-100/70 hover:bg-teal-500/10 dark:bg-slate-800/60 dark:hover:bg-teal-500/15 border border-slate-200/60 dark:border-slate-700/60 transition-all text-center group cursor-pointer",
        title: "Go to current GPS location",
      },
      createElement(
        "div",
        { className: "w-7 h-7 rounded-full bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform" },
        this._createSvgIcon("gps"),
      ),
      createElement("span", { className: "text-[11px] font-semibold text-slate-800 dark:text-slate-200 leading-tight", textContent: "My GPS" }),
      createElement("span", { className: "text-[9px] text-slate-400 dark:text-slate-500", textContent: "Device location" }),
    );
    gpsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.$.searchDropdown.classList.remove("open");
      this._syncSearchAria();
      if (this.$.searchInput) this.$.searchInput.blur();
      this.getMyLocation();
      this._haptic?.('selection');
    });
    shortcutsGrid.appendChild(gpsBtn);

    // 2. Home Location
    const homeName = this.defaultLocation?.name ? this.defaultLocation.name.split(",")[0] : "Set Home";
    const homeBtn = createElement(
      "button",
      {
        type: "button",
        className: "search-shortcut-card flex flex-col items-center justify-center p-2 rounded-xl bg-slate-100/70 hover:bg-orange-500/10 dark:bg-slate-800/60 dark:hover:bg-orange-500/15 border border-slate-200/60 dark:border-slate-700/60 transition-all text-center group cursor-pointer",
        title: this.defaultLocation?.name ? `Go to Home (${homeName})` : "Set home location",
      },
      createElement(
        "div",
        { className: "w-7 h-7 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform" },
        this._createSvgIcon("home"),
      ),
      createElement("span", { className: "text-[11px] font-semibold text-slate-800 dark:text-slate-200 leading-tight", textContent: "Home" }),
      createElement("span", { className: "text-[9px] text-slate-400 dark:text-slate-500 truncate max-w-[70px]", textContent: homeName }),
    );
    homeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.$.searchDropdown.classList.remove("open");
      this._syncSearchAria();
      if (this.$.searchInput) this.$.searchInput.blur();
      if (this.defaultLocation && this.defaultLocation.lat != null) {
        this.goToHomeLocation?.();
      } else if (this.selectedLat != null && this.selectedLng != null) {
        this.setHomeLocation?.(this.selectedLat, this.selectedLng, this.selectedName);
      } else {
        this.showToast?.("Search or tap a location on the map, then tap Home to save it.", "info");
      }
      this._haptic?.('selection');
    });
    shortcutsGrid.appendChild(homeBtn);

    // 3. Saved Places
    const bookmarkCount = this.bookmarks?.length || 0;
    const savedBtn = createElement(
      "button",
      {
        type: "button",
        className: "search-shortcut-card flex flex-col items-center justify-center p-2 rounded-xl bg-slate-100/70 hover:bg-amber-500/10 dark:bg-slate-800/60 dark:hover:bg-amber-500/15 border border-slate-200/60 dark:border-slate-700/60 transition-all text-center group cursor-pointer",
        title: "View saved places",
      },
      createElement(
        "div",
        { className: "w-7 h-7 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform" },
        this._createSvgIcon("star"),
      ),
      createElement("span", { className: "text-[11px] font-semibold text-slate-800 dark:text-slate-200 leading-tight", textContent: "Saved" }),
      createElement("span", { className: "text-[9px] text-slate-400 dark:text-slate-500", textContent: `${bookmarkCount} places` }),
    );
    savedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.setSearchFilter("favorites");
    });
    shortcutsGrid.appendChild(savedBtn);

    container.appendChild(shortcutsGrid);
  }

  showSearchHistory() {
    const history = this.getSearchHistory();
    const { createElement, clearElement } = window.domUtils;
    const container = this.$.searchResults;
    this.searchActiveFilter = "all";
    this.$.searchDropdown?.querySelectorAll(".search-filter-chip").forEach((chip) => {
      const active = chip.dataset.filter === "all";
      chip.classList.toggle("active", active);
      chip.setAttribute("aria-selected", active ? "true" : "false");
    });
    clearElement(container);

    // 1. Top Quick Shortcuts (My GPS, Home, Saved)
    this._renderSearchShortcuts(container);

    let itemIndex = 0;

    // 2. Recent Searches (up to 5 items)
    if (history.length > 0) {
      const header = createElement(
        "div",
        { className: "search-section-header flex items-center justify-between px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase" },
        createElement("div", { className: "flex items-center gap-1.5" },
          this._createSvgIcon("clock"),
          createElement("span", { textContent: "Recent Searches" }),
        ),
        createElement("button", {
          type: "button",
          className: "text-[10px] text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors font-medium cursor-pointer",
          textContent: "Clear all",
          title: "Clear all recent searches",
        }),
      );

      header.querySelector("button").addEventListener("click", (e) => {
        this.clearSearchHistory(e);
      });
      container.appendChild(header);

      history.slice(0, 5).forEach((r) => {
        const row = this._buildSearchResultRow(r, { index: itemIndex++, isHistory: true });
        row.addEventListener("click", (e) => {
          if (e.target.closest(".search-action-btn")) return;
          e.stopPropagation();
          this.selectSearchResult(r);
        });
        container.appendChild(row);
      });
    }

    // 3. Popular World Cities
    const popHeader = createElement(
      "div",
      { className: "search-section-header flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase border-t border-slate-200/50 dark:border-slate-700/50 mt-1 pt-2" },
      this._createSvgIcon("globe"),
      createElement("span", { textContent: "Popular World Cities" }),
    );
    container.appendChild(popHeader);

    POPULAR_LOCATIONS.forEach((r) => {
      const row = this._buildSearchResultRow(r, { index: itemIndex++ });
      row.addEventListener("click", (e) => {
        if (e.target.closest(".search-action-btn")) return;
        e.stopPropagation();
        this.selectSearchResult(r);
      });
      container.appendChild(row);
    });

    this.$.searchDropdown.classList.add("open");
    this.searchHighlightIndex = -1;
    this._syncSearchAria();
  }

  showSearchBookmarks() {
    const { createElement, clearElement } = window.domUtils;
    const container = this.$.searchResults;
    clearElement(container);

    const bookmarks = this.bookmarks || [];
    const header = createElement(
      "div",
      { className: "search-section-header flex items-center justify-between px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase" },
      createElement("div", { className: "flex items-center gap-1.5" },
        this._createSvgIcon("star"),
        createElement("span", { textContent: `Saved Places (${bookmarks.length})` }),
      ),
    );
    container.appendChild(header);

    if (bookmarks.length === 0) {
      const emptyCard = createElement(
        "div",
        { className: "p-6 text-center flex flex-col items-center justify-center text-slate-400 dark:text-slate-500" },
        createElement("div", { className: "text-3xl mb-2", textContent: "⭐" }),
        createElement("div", { className: "text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", textContent: "No saved places yet" }),
        createElement("div", { className: "text-[11px] max-w-[240px]", textContent: "Search for any city or tap the map, then tap the star icon to save it here for 1-tap weather." }),
      );
      container.appendChild(emptyCard);
    } else {
      bookmarks.forEach((b, i) => {
        const itemData = {
          displayName: b.name,
          name: b.name,
          latitude: b.lat,
          longitude: b.lng,
          country: "",
          countryCode: "",
          featureCode: "",
          type: "Saved place",
        };
        const row = this._buildSearchResultRow(itemData, { index: i, isBookmark: true });
        row.addEventListener("click", (e) => {
          if (e.target.closest(".search-action-btn")) return;
          e.stopPropagation();
          this.selectSearchResult(itemData);
        });
        container.appendChild(row);
      });
    }

    this.$.searchDropdown.classList.add("open");
    this.searchHighlightIndex = -1;
    this._syncSearchAria();
  }

  showSearchRecentsOnly() {
    const history = this.getSearchHistory();
    const { createElement, clearElement } = window.domUtils;
    const container = this.$.searchResults;
    clearElement(container);

    const header = createElement(
      "div",
      { className: "search-section-header flex items-center justify-between px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase" },
      createElement("div", { className: "flex items-center gap-1.5" },
        this._createSvgIcon("clock"),
        createElement("span", { textContent: `Recent Searches (${history.length})` }),
      ),
      history.length > 0
        ? createElement("button", {
            type: "button",
            className: "text-[10px] text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors font-medium cursor-pointer",
            textContent: "Clear all",
            title: "Clear all recent searches",
          })
        : null,
    );

    if (history.length > 0) {
      header.querySelector("button")?.addEventListener("click", (e) => {
        this.clearSearchHistory(e);
      });
    }
    container.appendChild(header);

    if (history.length === 0) {
      const emptyCard = createElement(
        "div",
        { className: "p-6 text-center flex flex-col items-center justify-center text-slate-400 dark:text-slate-500" },
        createElement("div", { className: "text-3xl mb-2", textContent: "🕒" }),
        createElement("div", { className: "text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", textContent: "No recent searches" }),
        createElement("div", { className: "text-[11px] max-w-[240px]", textContent: "Cities you explore will be saved here for rapid 1-tap recall." }),
      );
      container.appendChild(emptyCard);
    } else {
      history.forEach((r, i) => {
        const row = this._buildSearchResultRow(r, { index: i, isHistory: true });
        row.addEventListener("click", (e) => {
          if (e.target.closest(".search-action-btn")) return;
          e.stopPropagation();
          this.selectSearchResult(r);
        });
        container.appendChild(row);
      });
    }

    this.$.searchDropdown.classList.add("open");
    this.searchHighlightIndex = -1;
    this._syncSearchAria();
  }

  showSearchPopularOnly() {
    const { createElement, clearElement } = window.domUtils;
    const container = this.$.searchResults;
    clearElement(container);

    const popHeader = createElement(
      "div",
      { className: "search-section-header flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-wider uppercase" },
      this._createSvgIcon("globe"),
      createElement("span", { textContent: "Popular World Cities" }),
    );
    container.appendChild(popHeader);

    POPULAR_LOCATIONS.forEach((r, i) => {
      const row = this._buildSearchResultRow(r, { index: i });
      row.addEventListener("click", (e) => {
        if (e.target.closest(".search-action-btn")) return;
        e.stopPropagation();
        this.selectSearchResult(r);
      });
      container.appendChild(row);
    });

    this.$.searchDropdown.classList.add("open");
    this.searchHighlightIndex = -1;
    this._syncSearchAria();
  }

  _showPopularLocations() {
    this.showSearchPopularOnly();
  }

  toggleBookmarkForResult(r, e) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const lat = r.latitude ?? r.lat;
    const lng = r.longitude ?? r.lng;
    if (lat == null || lng == null) return;
    const name = r.displayName || r.name || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;

    if (!this.bookmarks) this.bookmarks = [];
    const existingIdx = this.bookmarks.findIndex(
      (b) => Math.abs(b.lat - lat) < 0.001 && Math.abs(b.lng - lng) < 0.001,
    );

    if (existingIdx >= 0) {
      this.bookmarks.splice(existingIdx, 1);
      this.showToast?.(`Removed "${name.split(',')[0]}" from bookmarks`, "info", 2000);
    } else {
      this.bookmarks.push({ name, lat, lng });
      this.showToast?.(`⭐ Saved "${name.split(',')[0]}" to bookmarks`, "success", 2000);
    }

    this.saveBookmarks?.();
    this._haptic?.('selection');

    if (this.searchActiveFilter === 'favorites') {
      this.showSearchBookmarks();
    } else {
      const btn = e?.currentTarget;
      if (btn) {
        const isNowBookmarked = this.bookmarks.some(
          (b) => Math.abs(b.lat - lat) < 0.001 && Math.abs(b.lng - lng) < 0.001,
        );
        btn.innerHTML = isNowBookmarked
          ? `<svg class="w-4 h-4 text-amber-500 fill-amber-500" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`
          : `<svg class="w-4 h-4 text-slate-400 hover:text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>`;
        btn.className = `search-action-btn search-star-btn p-1 rounded-full transition-colors cursor-pointer ${isNowBookmarked ? "text-amber-500 hover:bg-amber-500/10" : "text-slate-400 hover:text-amber-500 hover:bg-amber-500/10"}`;
      }
    }
  }

  _buildSearchResultRow(r, { index = null, query = "", isHistory = false, isBookmark = false } = {}) {
    const { createElement } = window.domUtils;
    const isCoords = r.featureCode === "COORD" || r.country === "Coordinates" || r.country === "GPS Coordinates";
    let flagEmoji = isCoords ? "🧭" : WeatherService.getCountryFlag(r.countryCode);
    if (!flagEmoji || flagEmoji === "📍") {
      const code = (r.featureCode || "").toUpperCase();
      if (code === "PPLC") flagEmoji = "🏛️";
      else if (code.startsWith("PPL")) flagEmoji = "🏙️";
      else if (code.startsWith("AIRP")) flagEmoji = "✈️";
      else if (code === "MT" || code === "PK") flagEmoji = "🏔️";
      else if (code === "ISL") flagEmoji = "🏝️";
      else if (code === "LAKE" || code === "BAY" || code === "SEA") flagEmoji = "🌊";
      else if (code === "PARK" || code === "RES") flagEmoji = "🌲";
      else flagEmoji = "📍";
    }

    const typeLabel = isCoords
      ? "Coordinates"
      : WeatherService.getFeatureLabel(r.featureCode) || r.type || "";

    const meta = [];
    if (r.admin1 && r.admin1 !== r.name) meta.push(r.admin1);
    if (r.country && r.country !== "Coordinates" && r.country !== "GPS Coordinates") meta.push(r.country);
    const metaText = meta.join(", ");

    const lat = r.latitude ?? r.lat;
    const lng = r.longitude ?? r.lng;

    const cachedWeather = this._getCachedTempForLocation(lat, lng);

    const stats = [];
    if (!cachedWeather) {
      const popLabel = WeatherService.formatPopulation(r.population);
      if (popLabel) stats.push(`${popLabel} people`);
      else if (r.elevation != null && isFinite(r.elevation))
        stats.push(`${Math.round(r.elevation)} m`);
    }
    const statsText = stats.join(" · ");

    const nameEl = createElement("span", {
      className: "text-xs font-semibold text-slate-800 dark:text-slate-100 truncate",
    });
    const nameStr = r.name || r.displayName || "";
    const q = (query || "").toLowerCase();
    if (q && nameStr.toLowerCase().includes(q)) {
      const idx = nameStr.toLowerCase().indexOf(q);
      if (idx > 0)
        nameEl.appendChild(document.createTextNode(nameStr.slice(0, idx)));
      nameEl.appendChild(
        createElement("span", {
          className: "text-teal-600 dark:text-teal-400 font-bold underline decoration-teal-400/40 underline-offset-2",
          textContent: nameStr.slice(idx, idx + q.length),
        }),
      );
      if (idx + q.length < nameStr.length)
        nameEl.appendChild(
          document.createTextNode(nameStr.slice(idx + q.length)),
        );
    } else {
      nameEl.textContent = nameStr;
    }

    const row1 = createElement(
      "div",
      { className: "flex items-center gap-1.5 min-w-0" },
      nameEl,
    );

    if (typeLabel) {
      let badgeColor = "bg-teal-500/10 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300";
      const uType = typeLabel.toLowerCase();
      if (uType.includes("capital")) {
        badgeColor = "bg-amber-500/15 text-amber-800 dark:bg-amber-500/25 dark:text-amber-200 border border-amber-500/30";
      } else if (uType.includes("airport")) {
        badgeColor = "bg-indigo-500/15 text-indigo-800 dark:bg-indigo-500/25 dark:text-indigo-200 border border-indigo-500/30";
      } else if (uType.includes("mountain")) {
        badgeColor = "bg-emerald-500/15 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-200 border border-emerald-500/30";
      } else if (uType.includes("coord")) {
        badgeColor = "bg-purple-500/15 text-purple-800 dark:bg-purple-500/25 dark:text-purple-200 border border-purple-500/30";
      }
      row1.appendChild(
        createElement("span", {
          className: `search-type-pill text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badgeColor}`,
          textContent: typeLabel,
        }),
      );
    }

    const textBlock = createElement(
      "div",
      { className: "min-w-0 flex-1 ml-2 text-left" },
      row1,
    );
    if (metaText) {
      textBlock.appendChild(
        createElement("div", {
          className: "text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5",
          textContent: metaText,
        }),
      );
    }

    const rightSide = createElement("div", {
      className: "flex items-center gap-2 flex-shrink-0 ml-2",
    });

    if (cachedWeather) {
      const emoji = this._getWeatherEmoji(cachedWeather.weatherCode);
      const tempBadge = createElement("span", {
        className: "search-temp-badge text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80",
        textContent: `${emoji} ${cachedWeather.temp}°`,
        title: "Current weather preview",
      });
      rightSide.appendChild(tempBadge);
    } else if (statsText) {
      rightSide.appendChild(
        createElement("span", {
          className: "text-[9px] text-slate-400 dark:text-slate-500 whitespace-nowrap font-medium",
          textContent: statsText,
        }),
      );
    }

    if (isHistory) {
      const delBtn = createElement("button", {
        type: "button",
        className: "search-action-btn search-delete-btn p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-colors cursor-pointer",
        title: "Remove from recent searches",
        "aria-label": `Remove ${nameStr} from history`,
      });
      const delSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      delSvg.setAttribute("class", "w-3.5 h-3.5");
      delSvg.setAttribute("fill", "none");
      delSvg.setAttribute("viewBox", "0 0 24 24");
      delSvg.setAttribute("stroke", "currentColor");
      delSvg.setAttribute("stroke-width", "2");
      const delPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      delPath.setAttribute("stroke-linecap", "round");
      delPath.setAttribute("stroke-linejoin", "round");
      delPath.setAttribute("d", "M6 18L18 6M6 6l12 12");
      delSvg.appendChild(delPath);
      delBtn.appendChild(delSvg);

      delBtn.addEventListener("click", (e) => {
        this.removeFromSearchHistory(r.displayName || r.name, e);
      });
      rightSide.appendChild(delBtn);
    } else if (isBookmark) {
      const starBtn = createElement("button", {
        type: "button",
        className: "search-action-btn search-star-btn p-1 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 rounded-full transition-colors cursor-pointer",
        title: "Remove from saved places",
        "aria-label": `Remove ${nameStr} from saved places`,
      });
      const starSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      starSvg.setAttribute("class", "w-4 h-4 fill-amber-500");
      starSvg.setAttribute("viewBox", "0 0 24 24");
      const starPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      starPath.setAttribute("d", "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z");
      starSvg.appendChild(starPath);
      starBtn.appendChild(starSvg);

      starBtn.addEventListener("click", (e) => {
        this.toggleBookmarkForResult(r, e);
      });
      rightSide.appendChild(starBtn);
    } else {
      const isFav = this.bookmarks?.some(
        (b) => lat != null && lng != null && Math.abs(b.lat - lat) < 0.001 && Math.abs(b.lng - lng) < 0.001,
      );
      const starBtn = createElement("button", {
        type: "button",
        className: `search-action-btn search-star-btn p-1 rounded-full transition-colors cursor-pointer ${
          isFav ? "text-amber-500 hover:bg-amber-500/10" : "text-slate-400 hover:text-amber-500 hover:bg-amber-500/10"
        }`,
        title: isFav ? "Saved to bookmarks (click to remove)" : "Save to bookmarks",
        "aria-label": isFav ? `Remove ${nameStr} from bookmarks` : `Bookmark ${nameStr}`,
      });
      const starSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      starSvg.setAttribute("class", `w-4 h-4 ${isFav ? "fill-amber-500 text-amber-500" : ""}`);
      starSvg.setAttribute("viewBox", "0 0 24 24");
      starSvg.setAttribute("stroke", "currentColor");
      starSvg.setAttribute("stroke-width", "2");
      starSvg.setAttribute("fill", isFav ? "currentColor" : "none");
      const starPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      starPath.setAttribute("stroke-linecap", "round");
      starPath.setAttribute("stroke-linejoin", "round");
      starPath.setAttribute("d", "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z");
      starSvg.appendChild(starPath);
      starBtn.appendChild(starSvg);

      starBtn.addEventListener("click", (e) => {
        this.toggleBookmarkForResult(r, e);
      });
      rightSide.appendChild(starBtn);
    }

    const row = createElement(
      "div",
      {
        className:
          "search-result-item w-full flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-all hover:bg-slate-100/90 dark:hover:bg-slate-700/50 select-none group",
        role: "option",
        tabIndex: 0,
        "aria-selected": "false",
      },
      createElement("span", {
        className: "text-base leading-none flex-shrink-0 select-none",
        textContent: flagEmoji,
      }),
      textBlock,
      rightSide,
    );

    if (index != null) row.dataset.index = String(index);
    return row;
  }

  // ================================================================
  //  SEARCH INPUTS (Open-Meteo Geocoding Falls)
  // ================================================================

  handleSearchInput() {
    const query = this.$.searchInput.value.trim();
    this.$.searchClearBtn.classList.toggle("hidden", query.length === 0);

    clearTimeout(this.searchDebounceTimer);

    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    if (query.length < 2) {
      if (query.length === 0) {
        this.showSearchHistory();
      } else {
        this.$.searchDropdown.classList.remove("open");
        this.$.searchResults.innerHTML = "";
        this._syncSearchAria();
      }
      return;
    }

    this.searchDebounceTimer = setTimeout(() => this.performSearch(query), 300);
  }

  async performSearch(query) {
    this.$.searchSpinner.classList.remove("hidden");

    // 1. Direct Lat/Lng coordinate search (e.g., "11.38, 77.89" or "40.71 -74.00")
    const coordMatch = query.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        const coordResult = [{
          name: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
          country: "GPS Coordinates",
          countryCode: "",
          admin1: "Direct Coordinates",
          latitude: lat,
          longitude: lng,
          featureCode: "COORD",
          displayName: `Location at ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
        }];
        this.renderSearchResults(coordResult);
        this.$.searchSpinner.classList.add("hidden");
        return;
      }
    }

    // Check geocode_lru IndexedDB store before hitting network
    try {
      const cached = await getGeocodeLRU(query);
      if (Array.isArray(cached) && cached.length > 0) {
        this.renderSearchResults(cached);
        this.$.searchSpinner.classList.add("hidden");
        return;
      }
    } catch (_) {}

    const controller = new AbortController();
    this.searchAbortController = controller;

    try {
      const results = await WeatherService.searchLocations(
        query,
        controller.signal,
      );
      if (this.searchAbortController !== controller) return;
      this.renderSearchResults(results);
      if (Array.isArray(results) && results.length > 0) {
        saveGeocodeLRU(query, results).catch(() => {});
      }
    } catch (error) {
      console.error("Search query error:", error);
      const { createElement, clearElement } = window.domUtils;
      clearElement(this.$.searchResults);
      this.$.searchResults.appendChild(
        createElement("div", {
          className: "px-4 py-3 text-sm text-slate-400",
          textContent: "No results found",
        }),
      );
      this.$.searchDropdown.classList.add("open");
      this._syncSearchAria();
    } finally {
      this.$.searchSpinner.classList.add("hidden");
    }
  }

  renderSearchResults(results) {
    const { createElement, clearElement } = window.domUtils;
    const container = this.$.searchResults;
    clearElement(container);

    const query = this.$.searchInput.value.trim();

    if (!results || results.length === 0) {
      const emptyDiv = createElement(
        "div",
        { className: "p-6 text-center flex flex-col items-center justify-center text-slate-400 dark:text-slate-500" },
        createElement("div", { className: "text-3xl mb-2", textContent: "🔍" }),
        createElement("div", { className: "text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1", textContent: `No locations found for "${query}"` }),
        createElement("div", { className: "text-[11px] max-w-[260px]", textContent: "Check spelling or try searching by country, state, or lat/lng coordinates (e.g. 51.5, -0.12)." }),
      );
      container.appendChild(emptyDiv);
      this.$.searchDropdown.classList.add("open");
      this._syncSearchAria();
      return;
    }

    this.searchHighlightIndex = -1;

    results.forEach((r, i) => {
      const row = this._buildSearchResultRow(r, { index: i, query });
      row.addEventListener("click", (e) => {
        if (e.target.closest(".search-action-btn")) return;
        e.stopPropagation();
        const idx = parseInt(row.dataset.index, 10);
        this.selectSearchResult(results[idx] || r);
      });
      container.appendChild(row);
    });

    this.$.searchDropdown.classList.add("open");
    this._syncSearchAria();
  }

  /** Keeps the input's aria-expanded and options' aria-selected honest. */
  _syncSearchAria() {
    const input = this.$.searchInput;
    if (!input) return;
    const open = this.$.searchDropdown.classList.contains("open");
    input.setAttribute("aria-expanded", open ? "true" : "false");
    const items = this.$.searchResults.querySelectorAll('[role="option"]');
    items.forEach((el, i) =>
      el.setAttribute(
        "aria-selected",
        i === this.searchHighlightIndex ? "true" : "false",
      ),
    );
  }

  async selectSearchResult(result) {
    this.$.searchDropdown.classList.remove("open");
    this._syncSearchAria();
    this.$.searchInput.value = result.displayName || result.name || "";
    this.$.searchClearBtn.classList.remove("hidden");
    if (this.$.searchInput) this.$.searchInput.blur();

    const lat = result.latitude ?? result.lat;
    const lng = result.longitude ?? result.lng;

    if (lat != null && lng != null) {
      this.addToSearchHistory(result);
      await this.selectLocation(
        lat,
        lng,
        result.displayName || result.name,
      );
    }
  }

  clearSearch() {
    this.$.searchInput.value = "";
    this.$.searchClearBtn.classList.add("hidden");
    this.$.searchResults.innerHTML = "";
    this.searchActiveFilter = "all";
    const chips = this.$.searchDropdown?.querySelectorAll(".search-filter-chip");
    chips?.forEach((c) => c.classList.toggle("active", c.dataset.filter === "all"));
    this.$.searchInput.focus();
    this.showSearchHistory();
  }
// ================================================================
  //  THEME ADJUSTMENTS & MAP TILES
  // ================================================================

  toggleDarkMode() {
    this.isDark = !this.isDark;

    document.documentElement.classList.toggle("dark", this.isDark);
    if (this.isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    try {
      localStorage.setItem("aurafisky_theme", this.isDark ? "dark" : "light");
    } catch (e) {
      // ignore — storage unavailable
    }

    if (this.isDark) {
      this.mapStyle = "dark";
      try { localStorage.setItem("aurafisky_map_style", "dark"); } catch (_) {}
    } else if (this.mapStyle === "dark") {
      this.mapStyle = "street";
      try { localStorage.setItem("aurafisky_map_style", "street"); } catch (_) {}
    }

    // Swap basemap style (handles language preference)
    this._switchBasemapTheme();

    // Update theme-color meta tag for browser chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = this.isDark ? "#0f172a" : "#6366f1";
    this.updateSettingsUIFromLocal();
    this.saveUserDataToCloud();
    this.syncBus?.syncTheme(this.isDark);
  }

  // ================================================================
  //  MY LOCATION
  // ================================================================
  // (relocated to features/myLocation.js -- see features/registry.js)

  // ================================================================
  //  ADVANCED FEATURE METHODS
  // ================================================================
  // (relocated to features/insights.js -- see features/registry.js)

  // ================================================================
  //  PANEL VISIBILITIES
  // ================================================================

  // ================================================================
  //  WALLPAPER MODE — Full-screen weather wallpaper
  // ================================================================

  /**
   * Toggles wallpaper mode: opens the overlay if closed, closes it if open,
   * or creates a tab for the current location when none exist.
   */
  toggleWallpaper() {
    if (!this.selectedLat || !this.selectedLng) {
      this.showToast("Select a location first", "info");
      return;
    }

    const targetLat = this.selectedLat;
    const targetLng = this.selectedLng;
    const targetName = this.selectedName || `${targetLat.toFixed(4)}, ${targetLng.toFixed(4)}`;

    // Check if the currently selected location is already the active wallpaper tab
    const activeTab = this.wallpaperLocations[this.activeWallpaperIndex];
    const isCurrentActive = activeTab &&
      Math.abs(activeTab.lat - targetLat) < 0.0001 &&
      Math.abs(activeTab.lng - targetLng) < 0.0001;

    if (this.isWallpaperMode && isCurrentActive) {
      // Overlay open and already showing this location → close overlay
      this.hideWallpaperOverlay();
      this.isWallpaperMode = false;
      this.stopWallpaperAutoRotate();
      this.updateWallpaperButtonUI();
      return;
    }

    // Pre-seed wallpaper weather from selected location for instant sync
    if (this.weatherData) {
      this.wallpaperWeatherData = this.weatherData;
      this.wallpaperAirQualityData = this.airQualityData;
      this.wallpaperCurrentHourIndex = this.currentHourIndex;
    }

    // If this location is already in tabs, switch to it!
    const existingIndex = this.wallpaperLocations.findIndex(
      (w) => Math.abs(w.lat - targetLat) < 0.0001 &&
             Math.abs(w.lng - targetLng) < 0.0001
    );

    if (existingIndex >= 0) {
      this.activeWallpaperIndex = existingIndex;
      this.isWallpaperMode = true;
      this.showWallpaperOverlay();
      this.renderWallpaperTabs();
      this.loadWallpaperDataForActiveTab();
      if (this.wallpaperAutoRotateEnabled) this.startWallpaperAutoRotate();
      this.showToast(`Switched wallpaper to ${targetName} 🖼️`, "success");
    } else {
      // Add this new location as a wallpaper tab
      this.addWallpaperTab(targetLat, targetLng, targetName);
      this.showToast(`Set wallpaper to ${targetName} 🖼️`, "success");
    }
    this.updateWallpaperButtonUI();
  }

  /**
   * Adds a new wallpaper tab (or switches to it if it already exists).
   */
  addWallpaperTab(lat = null, lng = null, name = null) {
    const targetLat = lat ?? this.selectedLat;
    const targetLng = lng ?? this.selectedLng;
    const targetName = name ?? this.selectedName;

    if (!targetLat || !targetLng) {
      this.showToast("Select a location first", "info");
      return;
    }

    // Pre-seed weather data if coordinates match the currently selected card
    if (this.weatherData &&
        Math.abs(targetLat - (this.selectedLat ?? 0)) < 0.001 &&
        Math.abs(targetLng - (this.selectedLng ?? 0)) < 0.001) {
      this.wallpaperWeatherData = this.weatherData;
      this.wallpaperAirQualityData = this.airQualityData;
      this.wallpaperCurrentHourIndex = this.currentHourIndex;
    }

    // Prevent duplicate tabs — switching to the existing one instead
    const existingIndex = this.wallpaperLocations.findIndex(
      (w) => Math.abs(w.lat - targetLat) < 0.0001 &&
             Math.abs(w.lng - targetLng) < 0.0001
    );
    if (existingIndex >= 0) {
      this.activeWallpaperIndex = existingIndex;
      this.isWallpaperMode = true;
      this.showWallpaperOverlay();
      this.renderWallpaperTabs();
      this.loadWallpaperDataForActiveTab();
      return;
    }

    if (this.wallpaperLocations.length >= 6) {
      this.wallpaperLocations.shift();
      if (this.activeWallpaperIndex > 0) this.activeWallpaperIndex--;
    }

    const id = Date.now().toString();
    const newTab = { lat: targetLat, lng: targetLng, name: targetName, id, addedAt: Date.now() };
    this.wallpaperLocations.push(newTab);
    this.activeWallpaperIndex = this.wallpaperLocations.length - 1;

    this.isWallpaperMode = true;
    this.showWallpaperOverlay();
    this.renderWallpaperTabs();
    this.loadWallpaperDataForActiveTab();
    this.startWallpaperAutoRefresh();
    this.startWallpaperBgAnimation();
    this.showFirstOpenHint();
    if (this.wallpaperPersistEnabled) this.saveWallpaperToStorage();
    this._haptic('success');
  }

  /**
   * Removes a wallpaper tab by index.
   */
  removeWallpaperTab(index) {
    this.wallpaperLocations.splice(index, 1);
    if (this.wallpaperLocations.length === 0) {
      this.disableWallpaper();
    } else {
      if (this.activeWallpaperIndex > index) {
        this.activeWallpaperIndex--;
      } else if (this.activeWallpaperIndex >= this.wallpaperLocations.length) {
        this.activeWallpaperIndex = this.wallpaperLocations.length - 1;
      }
      this.renderWallpaperTabs();
      this.loadWallpaperDataForActiveTab();
    }
    if (this.wallpaperPersistEnabled) this.saveWallpaperToStorage();
    this.updateWallpaperButtonUI();
    this._haptic('light');
  }

  /**
   * Switches to a different wallpaper tab.
   */
  switchWallpaperTab(index) {
    if (index < 0 || index >= this.wallpaperLocations.length) return;
    this.activeWallpaperIndex = index;
    this.renderWallpaperTabs();
    this.loadWallpaperDataForActiveTab();
    if (this.wallpaperPersistEnabled) this.saveWallpaperToStorage();
    this._haptic('selection');
  }

  /**
   * Renders the wallpaper tabs UI with modern pill aesthetics.
   */
  renderWallpaperTabs() {
    if (!this.$.wallpaperTabContainer) return;

    this.$.wallpaperTabContainer.innerHTML = "";
    this.wallpaperLocations.forEach((tab, index) => {
      const isActive = index === this.activeWallpaperIndex;
      const tabEl = document.createElement("button");
      tabEl.type = "button";
      tabEl.className = `wallpaper-tab flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all select-none cursor-pointer border ${
        isActive
          ? "active bg-white/25 text-white border-white/40 shadow-lg shadow-black/25 backdrop-blur-md"
          : "bg-black/30 hover:bg-white/15 text-slate-200 hover:text-white border-white/10 hover:border-white/25 backdrop-blur-sm"
      }`;
      tabEl.dataset.wallpaperTab = index;
      tabEl.setAttribute("role", "tab");
      tabEl.setAttribute("aria-selected", isActive);
      tabEl.title = tab.name;

      // Status indicator dot
      const statusDot = document.createElement("span");
      statusDot.className = `w-2 h-2 rounded-full flex-shrink-0 ${
        isActive ? "bg-emerald-400 ring-2 ring-emerald-400/40 animate-pulse" : "bg-slate-400/60"
      }`;
      tabEl.appendChild(statusDot);

      // Name label
      const nameSpan = document.createElement("span");
      nameSpan.className = "truncate max-w-[120px] pointer-events-none";
      const shortName = shortPlaceName(tab.name || "");
      nameSpan.textContent = shortName;
      tabEl.appendChild(nameSpan);

      // Close button
      const closeBtn = document.createElement("span");
      closeBtn.className = "flex-shrink-0 ml-0.5 p-0.5 rounded-full hover:bg-white/30 text-slate-300 hover:text-white transition-colors cursor-pointer flex items-center justify-center";
      closeBtn.dataset.wallpaperClose = index;
      closeBtn.setAttribute("aria-label", `Remove ${tab.name}`);
      closeBtn.setAttribute("role", "button");
      closeBtn.setAttribute("tabindex", "0");
      closeBtn.title = "Remove location";
      const closeIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      closeIcon.setAttribute("class", "w-3 h-3 pointer-events-none");
      closeIcon.setAttribute("fill", "none");
      closeIcon.setAttribute("viewBox", "0 0 24 24");
      closeIcon.setAttribute("stroke", "currentColor");
      closeIcon.setAttribute("stroke-width", "2.5");
      closeIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>';
      closeBtn.appendChild(closeIcon);
      tabEl.appendChild(closeBtn);

      this.$.wallpaperTabContainer.appendChild(tabEl);

      if (isActive) {
        try {
          tabEl.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
        } catch (_) {}
      }
    });
  }

  /**
   * Loads weather data for the currently active wallpaper tab.
   */
  async loadWallpaperDataForActiveTab() {
    const activeTab = this.wallpaperLocations[this.activeWallpaperIndex];
    if (!activeTab) return;

    // Immediately update header title and coordinates to active tab
    if (this.$.wallpaperLocationName) {
      this.$.wallpaperLocationName.textContent = activeTab.name;
    }
    if (this.$.wallpaperCoordinates) {
      const latDir = activeTab.lat >= 0 ? "N" : "S";
      const lngDir = activeTab.lng >= 0 ? "E" : "W";
      this.$.wallpaperCoordinates.textContent = `${Math.abs(activeTab.lat).toFixed(4)}° ${latDir}, ${Math.abs(activeTab.lng).toFixed(4)}° ${lngDir}`;
    }

    // Show loading state while fetching
    if (this.$.wallpaperLastUpdated) {
      this.$.wallpaperLastUpdated.textContent = "Updating…";
    }

    // Clear stale conditions if switching from a different location
    if (!this.wallpaperWeatherData ||
        Math.abs((this.wallpaperWeatherData.latitude ?? 0) - activeTab.lat) > 0.05 ||
        Math.abs((this.wallpaperWeatherData.longitude ?? 0) - activeTab.lng) > 0.05) {
      if (this.$.wallpaperTemp) this.$.wallpaperTemp.textContent = "--°";
      if (this.$.wallpaperDescription) this.$.wallpaperDescription.textContent = "Loading weather…";
      if (this.$.wallpaperFeelsLike) this.$.wallpaperFeelsLike.textContent = "Fetching conditions…";
    }

    const wasOffline = this.isOffline;

    try {
      const [forecast, airQuality] = await Promise.all([
        WeatherService.fetchForecast(activeTab.lat, activeTab.lng),
        WeatherService.fetchAirQuality(activeTab.lat, activeTab.lng),
      ]);

      this.wallpaperWeatherData = forecast;
      this.wallpaperAirQualityData = airQuality;
      this.wallpaperCurrentHourIndex = WeatherService.getCurrentHourIndex(
        forecast,
        forecast?.utc_offset_seconds || 0,
      );

      // Clear the offline badge — data is now fresh
      this.showWallpaperOffline(false);
      this.refreshWallpaperDisplay();
      this.updateWallpaperLastUpdated();
      this.checkWallpaperAlerts();
      this.renderPrecipTimeline();

      // Recover from a previously-offline state with a toast
      if (wasOffline && !this.isOffline) {
        this.showToast("⚡ Back online — wallpaper updated", "success");
      }
    } catch (error) {
      console.warn("Wallpaper data load failed:", error);
      // Only show the offline badge when the device is truly offline;
      // API failures (rate limit, etc.) keep the stale data visible instead.
      this.showWallpaperOffline(!navigator.onLine);
      if (this.$.wallpaperLastUpdated) {
        this.$.wallpaperLastUpdated.textContent = this.wallpaperLastUpdated
          ? this._formatRelativeUpdate(this.wallpaperLastUpdated)
          : "Update failed";
      }
      if (!this.wallpaperWeatherData) {
        this.showToast("Could not load wallpaper weather. Check connection.", "error");
      }
    }
  }

  /**
   * Disables wallpaper mode and closes the overlay.
   */
  disableWallpaper() {
    this.wallpaperLocations = [];
    this.activeWallpaperIndex = 0;
    this.isWallpaperMode = false;
    this.hideWallpaperOverlay();
    this.stopWallpaperAutoRefresh();
    this.stopWallpaperAutoRotate();
    this.stopWallpaperBgAnimation();
    this.stopWallpaperClockTick();
    this.hidePrecipTooltip();
    this.updateWallpaperButtonUI();
    this.showToast("Wallpaper removed", "info");
    this._haptic('light');
  }

  /**
   * Updates the wallpaper button UI to reflect current state.
   */
  updateWallpaperButtonUI() {
    const isWallpaper = this.wallpaperLocations.some(
      (w) => Math.abs(w.lat - (this.selectedLat ?? 0)) < 0.0001 &&
             Math.abs(w.lng - (this.selectedLng ?? 0)) < 0.0001
    );
    if (this.$.wallpaperOutlineIcon && this.$.wallpaperFilledIcon) {
      this.$.wallpaperOutlineIcon.classList.toggle("hidden", isWallpaper);
      this.$.wallpaperFilledIcon.classList.toggle("hidden", !isWallpaper);
    }
    if (this.$.setWallpaperBtn) {
      this.$.setWallpaperBtn.setAttribute("aria-pressed", isWallpaper);
      this.$.setWallpaperBtn.title = isWallpaper ? "Remove wallpaper" : "Set as wallpaper";
    }
  }

  /**
   * Shows the full-screen wallpaper overlay.
   */
  showWallpaperOverlay() {
    this.$.wallpaperOverlay.classList.remove("hidden");
    this.$.wallpaperOverlay.classList.add("flex");
    // Lock background scroll while the full-screen overlay is open
    document.body.style.overflow = "hidden";
    // Ensure at least the active location tab exists
    if (this.wallpaperLocations.length === 0 && (this.currentLat !== undefined || this.currentLocationName)) {
      this.wallpaperLocations.push({
        id: `tab_${Date.now()}`,
        lat: this.currentLat ?? 0,
        lng: this.currentLng ?? 0,
        name: this.currentLocationName || "Current Location",
        addedAt: Date.now(),
      });
      this.activeWallpaperIndex = 0;
      if (this.weatherData) {
        this.wallpaperWeatherData = this.weatherData;
        this.wallpaperAirQualityData = this.airQualityData;
        this.wallpaperCurrentHourIndex = this.currentHourIndex;
      }
    }

    this.renderWallpaperTabs();
    this.refreshWallpaperDisplay();
    this.startWallpaperBgAnimation();
    this.setWallpaperPreset(this.wallpaperPreset || localStorage.getItem("aurafisky_wallpaper_preset") || "none");

    // Immersive features
    if (this.wallpaperBrandEnabled) {
      this.showWallpaperBrandBg();
    } else {
      this.wallpaperPhotoEnabled = true;
      this.showWallpaperPhotoBg();
    }
    if (this.wallpaperHighContrast) this.$.wallpaperOverlay.classList.add("high-contrast");
    if (this.wallpaperSoundEnabled) this.setWallpaperSoundscape(true);
    if (this.wallpaperWakeLockEnabled) this.requestWallpaperWakeLock();
    if (this.wallpaperAutoRotateEnabled) this.startWallpaperAutoRotate();

    // Persist any settings changes made while open (opt-in)
    if (this.wallpaperPersistEnabled) this.saveWallpaperToStorage();
  }

  /**
   * Hides the full-screen wallpaper overlay.
   */
  hideWallpaperOverlay() {
    this.$.wallpaperOverlay.classList.add("hidden");
    this.$.wallpaperOverlay.classList.remove("flex");
    document.body.style.overflow = "";
    this.stopWallpaperBgAnimation();
    this.stopWallpaperClockTick();
    this.hidePrecipTooltip();
    // Exit browser fullscreen if it was entered from the wallpaper
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    // Release wake lock — screen only needs to stay awake while visible
    this.releaseWallpaperWakeLock();
    // Stop the wallpaper soundscape (restores the app's previous audio state)
    if (this.wallpaperSoundEnabled) this.setWallpaperSoundscape(false);
    // Restore the document title + theme-color to the main app state
    if (this.weatherData && this.selectedLat != null) {
      const weather = WeatherService.getHourlyAtIndex(this.weatherData, this.currentHourIndex);
      if (weather) {
        this._syncDocumentTitle(weather);
      }
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = this.isDark ? "#0f172a" : "#6366f1";
  }

  /**
   * Starts the 5-minute auto-refresh timer for wallpaper data.
   */
  startWallpaperAutoRefresh() {
    this.stopWallpaperAutoRefresh();
    this.wallpaperTimer = setInterval(() => {
      if (this.wallpaperLocations.length > 0 && this.isWallpaperMode) {
        this.loadWallpaperDataForActiveTab();
      }
    }, this.wallpaperRefreshInterval);
  }

  /**
   * Stops the wallpaper auto-refresh timer.
   */
  stopWallpaperAutoRefresh() {
    if (this.wallpaperTimer) {
      clearInterval(this.wallpaperTimer);
      this.wallpaperTimer = null;
    }
  }

  /**
   * Toggles auto-rotate between wallpaper tabs.
   */
  toggleWallpaperAutoRotate() {
    this.wallpaperAutoRotateEnabled = !this.wallpaperAutoRotateEnabled;
    if (this.wallpaperAutoRotateEnabled) {
      this.startWallpaperAutoRotate();
      this.showToast("Auto-rotate enabled", "success");
    } else {
      this.stopWallpaperAutoRotate();
      this.showToast("Auto-rotate disabled", "info");
    }
    this.updateAutoRotateButtonUI();
  }

  /**
   * Starts auto-rotate timer.
   */
  startWallpaperAutoRotate() {
    this.stopWallpaperAutoRotate();
    this.wallpaperAutoRotateTimer = setInterval(() => {
      if (this.wallpaperLocations.length > 1 && this.isWallpaperMode) {
        this.activeWallpaperIndex = (this.activeWallpaperIndex + 1) % this.wallpaperLocations.length;
        this.renderWallpaperTabs();
        this.loadWallpaperDataForActiveTab();
      }
    }, this.wallpaperAutoRotateInterval);
  }

  /**
   * Stops auto-rotate timer.
   */
  stopWallpaperAutoRotate() {
    if (this.wallpaperAutoRotateTimer) {
      clearInterval(this.wallpaperAutoRotateTimer);
      this.wallpaperAutoRotateTimer = null;
    }
  }

  /**
   * Updates auto-rotate button UI.
   */
  updateAutoRotateButtonUI() {
    if (this.$.wallpaperAutoRotateBtn) {
      this.$.wallpaperAutoRotateBtn.setAttribute("aria-pressed", this.wallpaperAutoRotateEnabled);
      this.$.wallpaperAutoRotateBtn.classList.toggle("bg-primary/30", this.wallpaperAutoRotateEnabled);
      this.$.wallpaperAutoRotateBtn.classList.toggle("text-primary", this.wallpaperAutoRotateEnabled);
    }
  }

  /**
   * Toggles high contrast mode.
   */
  toggleWallpaperHighContrast() {
    this.wallpaperHighContrast = !this.wallpaperHighContrast;
    this.$.wallpaperOverlay?.classList.toggle("high-contrast", this.wallpaperHighContrast);
    if (this.$.wallpaperHighContrastBtn) {
      this.$.wallpaperHighContrastBtn.setAttribute("aria-pressed", this.wallpaperHighContrast);
      this.$.wallpaperHighContrastBtn.classList.toggle("bg-primary/30", this.wallpaperHighContrast);
      this.$.wallpaperHighContrastBtn.classList.toggle("text-primary", this.wallpaperHighContrast);
    }
    this._haptic('selection');
  }

  /**
   * Shares the current wallpaper as a link.
   */
  async shareWallpaper() {
    const activeTab = this.wallpaperLocations[this.activeWallpaperIndex];
    if (!activeTab) return;

    const url = new URL(window.location.href);
    url.searchParams.set("wallpaper", "true");
    url.searchParams.set("lat", activeTab.lat.toFixed(4));
    url.searchParams.set("lng", activeTab.lng.toFixed(4));
    url.searchParams.set("name", activeTab.name);

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Aurafisky Wallpaper: ${activeTab.name}`,
          text: `Weather wallpaper for ${activeTab.name}`,
          url: url.toString(),
        });
      } else {
        await navigator.clipboard.writeText(url.toString());
        this.showToast("Link copied to clipboard", "success");
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        this.showToast("Share failed", "error");
      }
    }
    this._haptic('light');
  }

  /**
   * Shows the wallpaper settings drawer.
   */
  showWallpaperSettings() {
    this.syncWallpaperSettingsUI();
    this.$.wallpaperSettingsPanel?.classList.remove("hidden");
    this.$.wallpaperSettingsPanel?.classList.add("flex");
    this._haptic('light');
  }

  /**
   * Hides the wallpaper settings drawer.
   */
  hideWallpaperSettings() {
    this.$.wallpaperSettingsPanel?.classList.add("hidden");
    this.$.wallpaperSettingsPanel?.classList.remove("flex");
  }

  /**
   * Dismisses the severe weather alert banner.
   */
  dismissWallpaperAlert() {
    this.$.wallpaperAlertBanner?.classList.add("hidden");
    this.$.wallpaperInlineAlert?.classList.add("hidden");
  }

  /**
   * Checks for severe weather alerts for the active wallpaper.
   */
  checkWallpaperAlerts() {
    if (!this.wallpaperWeatherData || !this.wallpaperAirQualityData) return;

    const weather = WeatherService.getHourlyAtIndex(
      this.wallpaperWeatherData,
      this.wallpaperCurrentHourIndex,
    );
    const aqiVal = this.wallpaperAirQualityData?.hourly?.us_aqi?.[this.wallpaperCurrentHourIndex];
    const advisories = WeatherService.getAdvisories(weather, aqiVal);

    const severe = advisories.filter(
      (a) => a.severity === "extreme" || a.severity === "severe"
    );

    if (severe.length > 0) {
      const alert = severe[0];
      // Advisories carry type/title/desc/severity but no icon — map it here
      const ALERT_ICONS = {
        heat: "🔥",
        "extreme-cold": "🥶",
        "wind-chill": "🥶",
        frost: "❄️",
        wind: "💨",
        storm: "⛈️",
        rain: "🌧️",
        aqi: "🍃",
      };
      const alertIcon = ALERT_ICONS[alert.type] || "⚠️";
      if (this.$.wallpaperAlertText) {
        this.$.wallpaperAlertText.textContent = `${alertIcon} ${alert.title}: ${alert.desc}`;
      }
      this.$.wallpaperAlertBanner?.classList.remove("hidden");

      if (this.$.wallpaperInlineAlertTitle) {
        this.$.wallpaperInlineAlertTitle.textContent = alert.title;
      }
      if (this.$.wallpaperInlineAlertDesc) {
        this.$.wallpaperInlineAlertDesc.textContent = alert.desc;
      }
      this.$.wallpaperInlineAlert?.classList.remove("hidden");

      // Send notification if enabled and not already sent
      const alertKey = `${this.activeWallpaperIndex}-${alert.type}-${Date.now() / 3600000 | 0}`;
      if (this.wallpaperNotificationThresholds[alert.type] && !this.wallpaperNotificationSent.has(alertKey)) {
        this.wallpaperNotificationSent.add(alertKey);
        this.sendWallpaperNotification(alert, this.wallpaperLocations[this.activeWallpaperIndex]?.name);
      }
    } else {
      this.dismissWallpaperAlert();
    }
  }

  /**
   * Sends a browser notification for wallpaper alert.
   */
  async sendWallpaperNotification(alert, locationName) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(`Aurafisky: ${alert.title}`, {
          body: `${locationName}: ${alert.desc}`,
          icon: "favicon.svg",
          badge: "favicon.svg",
          tag: `wallpaper-alert-${this.activeWallpaperIndex}`,
          renotify: true,
        });
      } else {
        new Notification(`Aurafisky: ${alert.title}`, {
          body: `${locationName}: ${alert.desc}`,
          icon: "favicon.svg",
        });
      }
    } catch (e) {
      console.warn("Wallpaper notification failed:", e);
    }
  }

  /**
   * Renders the precipitation timeline chart.
   */
  renderPrecipTimeline() {
    if (!this.wallpaperWeatherData?.hourly || !this.$.wallpaperPrecipTimelineSvg) return;

    const hourly = this.wallpaperWeatherData.hourly;
    const startIdx = this.wallpaperCurrentHourIndex;
    const endIdx = Math.min(startIdx + 12, hourly.time.length);
    const points = [];
    let maxPrecip = 0;

    for (let i = startIdx; i < endIdx; i++) {
      const precip = hourly.precipitation?.[i] ?? 0;
      const prob = hourly.precipitation_probability?.[i] ?? 0;
      const displayValue = Math.max(precip * 10, prob);
      maxPrecip = Math.max(maxPrecip, displayValue);
      points.push({ precip, prob, time: hourly.time[i], value: displayValue });
    }

    if (maxPrecip === 0) {
      // Show the card with a friendly "no rain" state instead of hiding it
      this.$.wallpaperPrecipTimeline?.classList.remove("hidden");
      if (this.$.wallpaperNoRainMsg) this.$.wallpaperNoRainMsg.classList.remove("hidden");
      if (this.$.wallpaperPrecipTimelineSvg) this.$.wallpaperPrecipTimelineSvg.innerHTML = "";
      if (this.$.wallpaperPrecipTimelineLabels) this.$.wallpaperPrecipTimelineLabels.innerHTML = "";
      if (this.$.wallpaperPrecipNextRain) this.$.wallpaperPrecipNextRain.textContent = "Dry";
      return;
    }

    this.$.wallpaperPrecipTimeline?.classList.remove("hidden");
    if (this.$.wallpaperNoRainMsg) this.$.wallpaperNoRainMsg.classList.add("hidden");

    const width = 300;
    const height = 50;
    const padding = 20;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const svg = this.$.wallpaperPrecipTimelineSvg;
    svg.innerHTML = "";
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    // Bars — with hover tooltips showing probability % and mm
    points.forEach((p, i) => {
      const x = padding + (i / Math.max(1, points.length - 1)) * chartW;
      const barH = maxPrecip > 0 ? (p.value / maxPrecip) * chartH : 0;
      const y = padding + chartH - barH;

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", x - 8);
      rect.setAttribute("y", y);
      rect.setAttribute("width", 16);
      rect.setAttribute("height", barH);
      rect.setAttribute("rx", 2);
      // Intensity coloring: brighter blue = heavier expected rain
      rect.setAttribute("fill", p.precip > 0 ? "rgba(59, 130, 246, 0.8)" : "rgba(59, 130, 246, 0.3)");
      rect.setAttribute("class", "wallpaper-precip-bar");
      rect.addEventListener("mouseenter", (e) => this.showPrecipTooltip(e, p));
      rect.addEventListener("mouseleave", () => this.hidePrecipTooltip());
      svg.appendChild(rect);
    });

    // Next rain indicator
    const nextRainIdx = WeatherService.findNextRainHour(this.wallpaperWeatherData, this.wallpaperCurrentHourIndex);
    if (nextRainIdx !== null && this.$.wallpaperPrecipNextRain) {
      const hoursUntil = nextRainIdx - this.wallpaperCurrentHourIndex;
      this.$.wallpaperPrecipNextRain.textContent = hoursUntil <= 0 ? "Rain now" : `Rain in ${hoursUntil}h`;
    }

    // Time labels
    if (this.$.wallpaperPrecipTimelineLabels) {
      this.$.wallpaperPrecipTimelineLabels.innerHTML = "";
      [0, Math.floor(points.length / 2), points.length - 1].forEach((i) => {
        if (points[i]) {
          const span = document.createElement("span");
          const t = new Date(points[i].time);
          span.textContent = WeatherService.formatTimeOnly(t);
          this.$.wallpaperPrecipTimelineLabels.appendChild(span);
        }
      });
    }
  }

  /**
   * Renders the 24h temperature trend sparkline in the wallpaper hero.
   */
  renderWallpaperTrendSparkline() {
    if (!this.wallpaperWeatherData?.hourly || !this.$.wallpaperTrendSvg) return;

    const hourly = this.wallpaperWeatherData.hourly;
    const startIdx = this.wallpaperCurrentHourIndex;
    const endIdx = Math.min(startIdx + 24, hourly.time.length);
    const temps = [];
    const times = [];

    for (let i = startIdx; i < endIdx; i++) {
      temps.push(hourly.temperature_2m?.[i]);
      times.push(hourly.time[i]);
    }
    if (temps.length < 2 || temps.some((t) => t == null)) return;

    const minTemp = Math.min(...temps);
    const maxTemp = Math.max(...temps);
    const tempRange = Math.max(1, maxTemp - minTemp);

    const width = 300;
    const height = 48;
    const pad = 4;
    const chartW = width - pad * 2;
    const chartH = height - pad * 2;

    const points = temps.map((t, i) => ({
      x: pad + (i / (temps.length - 1)) * chartW,
      y: pad + chartH - ((t - minTemp) / tempRange) * chartH,
    }));

    let pathCmd = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      pathCmd += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
    }
    this.$.wallpaperTrendLine?.setAttribute("d", pathCmd);
    this.$.wallpaperTrendArea?.setAttribute(
      "d",
      `${pathCmd} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`
    );

    // Trend delta: how much warmer/cooler in 24h
    if (this.$.wallpaperTrendDelta) {
      const delta = temps[temps.length - 1] - temps[0];
      if (Math.abs(delta) >= 1) {
        const sign = delta > 0 ? "+" : "";
        this.$.wallpaperTrendDelta.textContent = `${sign}${delta.toFixed(1)}° / 24h`;
        this.$.wallpaperTrendDelta.className = `text-[10px] font-bold ${delta > 0 ? "text-orange-400" : "text-sky-400"}`;
      } else {
        this.$.wallpaperTrendDelta.textContent = "Steady";
        this.$.wallpaperTrendDelta.className = "text-[10px] font-bold text-slate-400";
      }
    }
  }

  /**
   * Shows a hover tooltip for a precipitation timeline bar.
   */
  showPrecipTooltip(e, point) {
    let tip = document.getElementById("wallpaperPrecipTooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "wallpaperPrecipTooltip";
      tip.className = "wallpaper-precip-tooltip";
      this.$.wallpaperOverlay?.appendChild(tip);
    }
    const t = new Date(point.time);
    const timeLabel = WeatherService.formatTimeOnly(t);
    const prob = Math.round(point.prob);
    const mm = point.precip.toFixed(1);
    tip.textContent = `${timeLabel} · ${prob}% · ${mm} mm`;
    tip.style.left = `${e.clientX}px`;
    tip.style.top = `${e.clientY - 40}px`;
    tip.classList.add("visible");
  }

  /**
   * Hides the precipitation tooltip.
   */
  hidePrecipTooltip() {
    document.getElementById("wallpaperPrecipTooltip")?.classList.remove("visible");
  }

  /**
   * Ticks the wallpaper clock every minute so the header shows the live
   * current time at the wallpaper location, not a frozen fetch-time stamp.
   */
  startWallpaperClockTick() {
    this.stopWallpaperClockTick();
    this._wallpaperClockTick = setInterval(() => {
      if (!this.isWallpaperMode || !this.wallpaperWeatherData) return;
      if (this.$.wallpaperTimeLabel) {
        this.$.wallpaperTimeLabel.textContent = `${WeatherService.getFormattedLocationCurrentTime(
          this.wallpaperWeatherData?.timezone,
          this.wallpaperWeatherData?.utc_offset_seconds || 0,
        )} · ${WeatherService.formatDayLabel(this.wallpaperWeatherData?.daily?.time?.[0]) || ""}`;
      }
      // Also refresh the relative "updated X ago" label every minute
      this.updateWallpaperRelativeTime();
    }, 60000);
  }

  /**
   * Stops the wallpaper clock tick.
   */
  stopWallpaperClockTick() {
    if (this._wallpaperClockTick) {
      clearInterval(this._wallpaperClockTick);
      this._wallpaperClockTick = null;
    }
  }

  /**
   * Starts background weather animation on canvas.
   */
  startWallpaperBgAnimation() {
    if (this.wallpaperReducedMotion) return;
    if (!this.$.wallpaperBgCanvas) return;
    // Guard against double-starting — a second loop would run concurrently
    // and drive the particles at double speed.
    if (this.wallpaperBgAnimationId) return;

    const canvas = this.$.wallpaperBgCanvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size — persistent listener so the wallpaper canvas keeps
    // tracking the window across resizes (not just the first one).
    if (this._wallpaperResize) {
      window.removeEventListener("resize", this._wallpaperResize);
      this._wallpaperResize = null;
    }
    this._wallpaperResize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    this._wallpaperResize();
    window.addEventListener("resize", this._wallpaperResize);

    this.wallpaperBgAnimationId = requestAnimationFrame(() => this.animateWallpaperBg(ctx, canvas));
  }

  /**
   * Stops background weather animation.
   */
  stopWallpaperBgAnimation() {
    if (this.wallpaperBgAnimationId) {
      cancelAnimationFrame(this.wallpaperBgAnimationId);
      this.wallpaperBgAnimationId = null;
    }
    if (this._wallpaperResize) {
      window.removeEventListener("resize", this._wallpaperResize);
      this._wallpaperResize = null;
    }
    if (this.$.wallpaperBgCanvas) {
      const ctx = this.$.wallpaperBgCanvas.getContext("2d");
      ctx?.clearRect(0, 0, this.$.wallpaperBgCanvas.width, this.$.wallpaperBgCanvas.height);
    }
  }

  /**
   * Animates weather particles on background canvas.
   */
  animateWallpaperBg(ctx, canvas) {
    if (!this.wallpaperWeatherData) {
      this.wallpaperBgAnimationId = requestAnimationFrame(() => this.animateWallpaperBg(ctx, canvas));
      return;
    }

    const weather = WeatherService.getHourlyAtIndex(
      this.wallpaperWeatherData,
      this.wallpaperCurrentHourIndex,
    );
    if (!weather) {
      this.wallpaperBgAnimationId = requestAnimationFrame(() => this.animateWallpaperBg(ctx, canvas));
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const code = weather.weatherCode;
    const windSpeed = weather.windSpeed ?? 0;
    const windDir = (weather.windDirection ?? 0) * Math.PI / 180;

    // Initialize particles if needed
    if (!this.wallpaperBgParticles) {
      this.wallpaperBgParticles = [];
      const count = Math.min(80, Math.max(20, Math.floor(canvas.width * canvas.height / 15000)));
      for (let i = 0; i < count; i++) {
        this.wallpaperBgParticles.push(this.createWallpaperParticle(canvas, code, windSpeed, windDir));
      }
    }

    // Update and draw particles
    this.wallpaperBgParticles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;

      // Wrap around
      if (p.x < 0) p.x = canvas.width;
      if (p.x > canvas.width) p.x = 0;
      if (p.y < 0) p.y = canvas.height;
      if (p.y > canvas.height) p.y = 0;

      // Respawn dead particles
      if (p.life <= 0) {
        Object.assign(p, this.createWallpaperParticle(canvas, code, windSpeed, windDir));
        p.x = Math.random() * canvas.width;
        p.y = Math.random() * canvas.height;
        p.life = 1;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.opacity * p.life;
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    this.wallpaperBgAnimationId = requestAnimationFrame(() => this.animateWallpaperBg(ctx, canvas));
  }

  /**
   * Creates a weather particle for background animation.
   */
  createWallpaperParticle(canvas, code, windSpeed, windDir) {
    const isRain = WeatherService.isRainCode(code);
    const isSnow = WeatherService.isSnowCode(code);
    const isStorm = WeatherService.isStormCode(code);

    let color, size, opacity, vx, vy, decay;

    if (isStorm) {
      color = "#fbbf24"; // lightning yellow
      size = Math.random() * 3 + 1;
      opacity = 0.6;
      decay = 0.008;
      vx = Math.cos(windDir) * (windSpeed / 20 + 1);
      vy = Math.sin(windDir) * (windSpeed / 20 + 1) + 1;
    } else if (isRain) {
      color = "#60a5fa";
      size = Math.random() * 2 + 0.5;
      opacity = 0.5;
      decay = 0.01;
      vx = Math.cos(windDir) * (windSpeed / 30 + 0.5);
      vy = Math.sin(windDir) * (windSpeed / 30 + 0.5) + 3;
    } else if (isSnow) {
      color = "#fff";
      size = Math.random() * 2.5 + 1;
      opacity = 0.7;
      decay = 0.003;
      vx = Math.cos(windDir) * (windSpeed / 40 + 0.3);
      vy = Math.sin(windDir) * (windSpeed / 40 + 0.3) + 1;
    } else {
      // Clear/cloudy - subtle dust motes
      color = "#94a3b8";
      size = Math.random() * 1.5 + 0.5;
      opacity = 0.15;
      decay = 0.001;
      vx = Math.cos(windDir) * (windSpeed / 50 + 0.1);
      vy = Math.sin(windDir) * (windSpeed / 50 + 0.1) + 0.2;
    }

    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx, vy, size, color, opacity, decay, life: 1,
    };
  }

  /**
   * Updates the wallpaper display with dynamic background theme.
   */
  refreshWallpaperDisplay() {
    if (!this.wallpaperLocations.length) return;

    const activeTab = this.wallpaperLocations[this.activeWallpaperIndex];
    if (!activeTab) return;

    // Always keep header name and coordinates in sync with activeTab
    if (this.$.wallpaperLocationName) this.$.wallpaperLocationName.textContent = activeTab.name;
    const latDir = activeTab.lat >= 0 ? "N" : "S";
    const lngDir = activeTab.lng >= 0 ? "E" : "W";
    if (this.$.wallpaperCoordinates) {
      this.$.wallpaperCoordinates.textContent = `${Math.abs(activeTab.lat).toFixed(4)}° ${latDir}, ${Math.abs(activeTab.lng).toFixed(4)}° ${lngDir}`;
    }

    if (!this.wallpaperWeatherData) return;

    const weather = WeatherService.getHourlyAtIndex(
      this.wallpaperWeatherData,
      this.wallpaperCurrentHourIndex,
    );
    if (!weather) return;

    const aqiVal = this.wallpaperAirQualityData?.hourly?.us_aqi?.[this.wallpaperCurrentHourIndex];

    // Apply dynamic background theme based on weather
    this.applyWallpaperTheme(weather.weatherCode, weather.isDay);

    // Declare dailyData early so it can be used throughout this method
    const dailyData = this.wallpaperWeatherData?.daily;

    // Header time
    this.$.wallpaperTimeLabel.textContent = `${WeatherService.getFormattedLocationCurrentTime(
      this.wallpaperWeatherData?.timezone,
      this.wallpaperWeatherData?.utc_offset_seconds || 0,
    )} · ${WeatherService.formatDayLabel(dailyData?.time?.[0]) || ""}`;
    this.startWallpaperClockTick();

    // Current conditions hero
    this.$.wallpaperIcon.textContent = weather.icon;
    this.$.wallpaperTemp.textContent = WeatherService.formatTemp(weather.temperature);
    this.$.wallpaperDescription.textContent = weather.description;
    this.$.wallpaperFeelsLike.textContent = `Feels like ${WeatherService.formatTemp(weather.feelsLike)}`;

    // Hero extras: today's High/Low + Sunrise/Sunset
    if (this.$.wallpaperHighTemp && this.$.wallpaperLowTemp) {
      const high = dailyData?.temperature_2m_max?.[0];
      const low = dailyData?.temperature_2m_min?.[0];
      this.$.wallpaperHighTemp.textContent = high != null ? WeatherService.formatTemp(high) : "--°";
      this.$.wallpaperLowTemp.textContent = low != null ? WeatherService.formatTemp(low) : "--°";
    }
    if (this.$.wallpaperHeroSunrise && this.$.wallpaperHeroSunset && dailyData) {
      if (dailyData.sunrise?.[0]) {
        this.$.wallpaperHeroSunrise.textContent = WeatherService.formatTimeOnly(dailyData.sunrise[0]);
      }
      if (dailyData.sunset?.[0]) {
        this.$.wallpaperHeroSunset.textContent = WeatherService.formatTimeOnly(dailyData.sunset[0]);
      }
    }

    // 24h temperature trend sparkline
    this.renderWallpaperTrendSparkline();

    // Quick metrics
    this.$.wallpaperHumidity.textContent = `${weather.humidity ?? "--"}%`;
    this.$.wallpaperWind.textContent = `${WeatherService.formatWind(weather.windSpeed)} ${WeatherService.getWindDirection(weather.windDirection)}`;
    this.$.wallpaperPressure.textContent = WeatherService.formatPressure(weather.pressure);
    this.$.wallpaperClouds.textContent = `${weather.cloudCover ?? "--"}%`;

    // Detailed metrics
    this.$.wallpaperUV.textContent = weather.uvIndex != null ? weather.uvIndex.toFixed(1) : "--";
    this.$.wallpaperPrecip.textContent = WeatherService.formatPrecip(weather.precipitation);
    const dewPoint = WeatherService.calculateDewPoint(weather.temperature, weather.humidity);
    this.$.wallpaperDewPoint.textContent = dewPoint != null ? WeatherService.formatTemp(dewPoint) : "--°";
    this.$.wallpaperWindGusts.textContent = weather.windGusts != null ? WeatherService.formatWind(weather.windGusts) : "--";
    this.$.wallpaperVisibility.textContent = WeatherService.formatVisibility(weather.visibility);

    // Air Quality (info.colorClass carries the full Tailwind class, e.g. "text-emerald-500")
    this.updateWallpaperAQI(aqiVal);

    // Comfort Index
    const comfortScore = WeatherService.getComfortIndex(weather, aqiVal);
    const comfortInfo = WeatherService.getComfortLabel(comfortScore, weather);
    if (this.$.wallpaperComfortScore) {
      this.$.wallpaperComfortScore.textContent = comfortScore ?? "--";
    }
    if (this.$.wallpaperComfortLabel) {
      this.$.wallpaperComfortLabel.textContent = comfortInfo ? `${comfortInfo.icon} ${comfortInfo.label}` : "--";
    }

    // Astronomy — guarded so one null element can't kill the whole render
    try {
      this.updateWallpaperAstronomy(weather);
    } catch (e) {
      console.warn("Wallpaper astronomy render failed:", e);
    }

    // Stargazing
    const stargazing = WeatherService.getStargazingScore(weather.cloudCover, this.getMoonPhaseFraction());
    if (stargazing && this.$.wallpaperStargazing) {
      this.$.wallpaperStargazing.textContent = stargazing.score;
      if (this.$.wallpaperStargazingLabel) {
        this.$.wallpaperStargazingLabel.textContent = `${stargazing.icon} ${stargazing.label}`;
      }
    }

    // Precip timeline
    this.renderPrecipTimeline();

    // Forecast strips
    this.renderWallpaperDailyStrip();
    this.renderWallpaperHourlyStrip();

    // Check alerts
    this.checkWallpaperAlerts();

    // Show offline indicator if needed
    this.showWallpaperOffline(this.isOffline);

    // Sync browser title + theme-color to wallpaper conditions
    this.syncWallpaperTitle();

    // Refresh photo background for the active tab (photo is seeded per location)
    if (this.wallpaperPhotoEnabled) this.showWallpaperPhotoBg();

    // Reorder sections by time of day (morning/commute/evening/night focus)
    this.applyTimeBasedLayout();
  }

  /**
   * Applies dynamic background theme based on weather.
   */
  applyWallpaperTheme(code, isDay) {
    const overlay = this.$.wallpaperOverlay;
    if (!overlay) return;

    // Remove existing theme classes
    overlay.classList.remove(
      "theme-sunny", "theme-rainy", "theme-cloudy", "theme-stormy", "theme-snowy", "theme-night"
    );

    if (!isDay) {
      overlay.classList.add("theme-night");
      return;
    }

    if (code === 0 || code === 1) {
      overlay.classList.add("theme-sunny");
    } else if (code === 2 || code === 3 || code === 45 || code === 48) {
      overlay.classList.add("theme-cloudy");
    } else if (WeatherService.isRainCode(code)) {
      overlay.classList.add("theme-rainy");
    } else if (WeatherService.isStormCode(code)) {
      overlay.classList.add("theme-stormy");
    } else if (WeatherService.isSnowCode(code)) {
      overlay.classList.add("theme-snowy");
    }
  }

  /**
   * Shows/hides offline indicator.
   */
  showWallpaperOffline(isOffline) {
    if (this.$.wallpaperOfflineIndicator) {
      this.$.wallpaperOfflineIndicator.classList.toggle("hidden", !isOffline);
    }
  }

  /**
   * Shows first-open hint.
   */
  showFirstOpenHint() {
    const hint = this.$.wallpaperFirstOpenHint;
    if (!hint) return;

    const hasSeenHint = sessionStorage.getItem("wallpaperHintSeen");
    if (!hasSeenHint) {
      hint.classList.remove("hidden");
      sessionStorage.setItem("wallpaperHintSeen", "true");
      setTimeout(() => hint.classList.add("hidden"), 8000);
    }
  }

  /**
   * Updates last updated with relative time.
   */
  updateWallpaperLastUpdated() {
    this.wallpaperLastUpdated = Date.now();
    if (this.$.wallpaperLastUpdated) {
      this.$.wallpaperLastUpdated.textContent = "Updated just now";
    }
    // Update to relative time after a few seconds
    setTimeout(() => this.updateWallpaperRelativeTime(), 5000);
  }

  /**
   * Updates last updated with relative time format.
   */
  updateWallpaperRelativeTime() {
    if (!this.wallpaperLastUpdated || !this.$.wallpaperLastUpdated) return;
    this.$.wallpaperLastUpdated.textContent = this._formatRelativeUpdate(this.wallpaperLastUpdated);
  }

  /**
   * Formats a timestamp as a relative "updated X ago" label.
   * @param {number} ts - Unix ms timestamp of the last successful refresh
   * @returns {string}
   */
  _formatRelativeUpdate(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Updated just now";
    if (mins === 1) return "Updated 1 min ago";
    if (mins < 60) return `Updated ${mins} min ago`;
    const hours = Math.floor(mins / 60);
    return `Updated ${hours}h ago`;
  }

  /**
   * Updates the wallpaper AQI display.
   */
  updateWallpaperAQI(aqiVal) {
    if (!this.wallpaperAirQualityData || !this.wallpaperAirQualityData.hourly) {
      this.$.wallpaperAQI.textContent = "AQI Unavailable";
      this.$.wallpaperAQIMetrics.textContent = "PM2.5: -- | PM10: -- | O3: --";
      this.$.wallpaperAQIBadge.textContent = "--";
      this.$.wallpaperAQIBadge.className = "text-xs font-bold px-3 py-1.5 rounded-full bg-slate-800 text-slate-400";
      return;
    }

    const h = this.wallpaperAirQualityData.hourly;
    const pm25 = h.pm2_5?.[this.wallpaperCurrentHourIndex];
    const pm10 = h.pm10?.[this.wallpaperCurrentHourIndex];
    const ozone = h.ozone?.[this.wallpaperCurrentHourIndex];

    const info = WeatherService.getAQIInfo(aqiVal);
    this.$.wallpaperAQI.textContent = info.label;
    // info.colorClass is the full Tailwind class (e.g. "text-emerald-500") —
    // stripping the "text-" prefix produced a class that doesn't exist.
    this.$.wallpaperAQI.className = `text-lg font-semibold ${info.colorClass}`;
    this.$.wallpaperAQIMetrics.textContent = `PM2.5: ${pm25 != null ? pm25.toFixed(1) : "--"} | PM10: ${pm10 != null ? pm10.toFixed(1) : "--"} | O3: ${ozone != null ? ozone.toFixed(1) : "--"} µg/m³`;

    this.$.wallpaperAQIBadge.textContent = aqiVal != null ? Math.round(aqiVal) : "--";
    this.$.wallpaperAQIBadge.className = "text-xs font-bold px-3 py-1.5 rounded-full";
    if (aqiVal != null) {
      if (aqiVal <= 50) this.$.wallpaperAQIBadge.classList.add("bg-emerald-500/20", "text-emerald-400");
      else if (aqiVal <= 100) this.$.wallpaperAQIBadge.classList.add("bg-amber-500/20", "text-amber-400");
      else if (aqiVal <= 150) this.$.wallpaperAQIBadge.classList.add("bg-orange-500/20", "text-orange-400");
      else if (aqiVal <= 200) this.$.wallpaperAQIBadge.classList.add("bg-red-500/20", "text-red-400");
      else if (aqiVal <= 300) this.$.wallpaperAQIBadge.classList.add("bg-fuchsia-500/20", "text-fuchsia-400");
      else this.$.wallpaperAQIBadge.classList.add("bg-rose-500/20", "text-rose-400");
    } else {
      this.$.wallpaperAQIBadge.classList.add("bg-slate-800", "text-slate-400");
    }
  }

  /**
   * Updates the wallpaper astronomy widgets (sun arc, moon phase).
   */
  updateWallpaperAstronomy(weather) {
    if (!this.wallpaperWeatherData?.daily) return;

    const daily = this.wallpaperWeatherData.daily;
    const sunrise = daily.sunrise?.[0];
    const sunset = daily.sunset?.[0];

    if (sunrise && sunset && this.$.wallpaperSunArcPassed) {
      const riseDate = WeatherService.parseIsoLocal(sunrise);
      const setDate = WeatherService.parseIsoLocal(sunset);
      const now = new Date();
      const dayMs = setDate - riseDate;
      const elapsedMs = now - riseDate;
      const progress = dayMs > 0 ? Math.max(0, Math.min(1, elapsedMs / dayMs)) : 0;

      // Arc geometry: Ellipse center (100, 70), rx = 80, ry = 55, baseline y = 70, apex y = 15
      // Progress p in [0, 1] maps to theta in [PI, 0]
      const theta = Math.PI * (1 - progress);
      const currentX = (100 - 80 * Math.cos(theta)).toFixed(1);
      const currentY = (70 - 55 * Math.sin(theta)).toFixed(1);

      if (progress <= 0.005) {
        this.$.wallpaperSunArcPassed.setAttribute("d", "M 20,70 A 80,55 0 0,1 20,70");
      } else {
        this.$.wallpaperSunArcPassed.setAttribute("d", `M 20,70 A 80,55 0 0,1 ${currentX},${currentY}`);
      }
      if (this.$.wallpaperSunArcDot) {
        this.$.wallpaperSunArcDot.setAttribute("cx", currentX);
        this.$.wallpaperSunArcDot.setAttribute("cy", currentY);
        const isDaytime = elapsedMs >= 0 && elapsedMs <= dayMs;
        this.$.wallpaperSunArcDot.setAttribute("opacity", isDaytime ? "1" : "0.35");
      }
      if (this.$.wallpaperSunSunrise) {
        this.$.wallpaperSunSunrise.textContent = WeatherService.formatTimeOnly(sunrise);
      }
      if (this.$.wallpaperSunSunset) {
        this.$.wallpaperSunSunset.textContent = WeatherService.formatTimeOnly(sunset);
      }
      if (this.$.wallpaperSunDayLength) {
        const dayLengthHours = Math.floor(dayMs / 3600000);
        const dayLengthMins = Math.floor((dayMs % 3600000) / 60000);
        this.$.wallpaperSunDayLength.textContent = `${dayLengthHours}h ${dayLengthMins}m`;
      }
    }

    // Moon phase
    const currentTime = this.weatherData ? new Date() : new Date();
    const moonPhase = WeatherService.getMoonPhase(currentTime);
    if (this.$.wallpaperMoonLitPath) {
      if (typeof this.getMoonSvgPath === "function") {
        this.$.wallpaperMoonLitPath.setAttribute(
          "d",
          this.getMoonSvgPath(moonPhase.phase, 30, 30, 27),
        );
      } else {
        const r = 27, cx = 30, cy = 30, p = moonPhase.phase;
        if (p <= 0.03 || p >= 0.97) {
          this.$.wallpaperMoonLitPath.setAttribute("d", "");
        } else if (p >= 0.47 && p <= 0.53) {
          this.$.wallpaperMoonLitPath.setAttribute("d", "M 30 3 A 27 27 0 0 1 30 57 A 27 27 0 0 1 30 3");
        } else if (p < 0.5) {
          const rx = r - 4 * r * p;
          const sweep = rx < 0 ? 1 : 0;
          this.$.wallpaperMoonLitPath.setAttribute("d", `M 30 3 A 27 27 0 0 1 30 57 A ${Math.abs(rx).toFixed(2)} 27 0 0 ${sweep} 30 3`);
        } else {
          const rx = r - 4 * r * (p - 0.5);
          const sweep = rx < 0 ? 1 : 0;
          this.$.wallpaperMoonLitPath.setAttribute("d", `M 30 3 A 27 27 0 0 0 30 57 A ${Math.abs(rx).toFixed(2)} 27 0 0 ${sweep} 30 3`);
        }
      }
    }
    if (this.$.wallpaperMoonPhaseLabel) {
      this.$.wallpaperMoonPhaseLabel.textContent = moonPhase.label;
    }
    if (this.$.wallpaperMoonPhasePercent) {
      this.$.wallpaperMoonPhasePercent.textContent = `${Math.round(moonPhase.phase * 100)}%`;
    }
    if (this.$.wallpaperMoonPhaseDesc) {
      this.$.wallpaperMoonPhaseDesc.textContent = `${moonPhase.icon} Phase fraction: ${moonPhase.phase.toFixed(2)}`;
    }
  }

  /**
   * Gets the moon phase fraction for the current date.
   */
  getMoonPhaseFraction() {
    const moonPhase = WeatherService.getMoonPhase(new Date());
    return moonPhase.phase;
  }

  // ================================================================
  //  WALLPAPER FORECAST STRIPS
  // ================================================================

  /**
   * Renders the 7-day forecast strip in the wallpaper.
   */
  renderWallpaperDailyStrip() {
    if (!this.wallpaperWeatherData?.daily?.time || !this.$.wallpaperDailyStrip) return;

    const daily = this.wallpaperWeatherData.daily;
    this.$.wallpaperDailyStrip.innerHTML = "";

    daily.time.slice(0, 7).forEach((date, i) => {
      const code = daily.weather_code?.[i] ?? 0;
      const info = WeatherService.getWeatherInfo(code, true);
      const maxTemp = daily.temperature_2m_max?.[i];
      const minTemp = daily.temperature_2m_min?.[i];
      const precipProb = daily.precipitation_probability_max?.[i];

      const dayEl = document.createElement("div");
      dayEl.className = "flex-shrink-0 w-[72px] flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors";

      // Day label
      const dayLabel = document.createElement("span");
      dayLabel.className = `text-[11px] font-bold ${i === 0 ? "text-primary" : "text-slate-400"}`;
      dayLabel.textContent = WeatherService.formatDayLabel(date);
      dayEl.appendChild(dayLabel);

      // Icon
      const icon = document.createElement("span");
      icon.className = "text-xl";
      icon.textContent = info.icon;
      dayEl.appendChild(icon);

      // Temps
      const temps = document.createElement("span");
      temps.className = "text-[11px] font-semibold text-slate-200";
      temps.textContent = `${maxTemp != null ? Math.round(maxTemp) : "--"}° / ${minTemp != null ? Math.round(minTemp) : "--"}°`;
      dayEl.appendChild(temps);

      // Precip probability
      const precip = document.createElement("span");
      precip.className = `text-[9px] font-medium ${precipProb > 30 ? "text-blue-400" : "text-slate-500"}`;
      precip.textContent = precipProb != null ? `💧 ${precipProb}%` : "💧 --%";
      dayEl.appendChild(precip);

      this.$.wallpaperDailyStrip.appendChild(dayEl);
    });
  }

  /**
   * Renders the hourly forecast strip (next 24h) in the wallpaper.
   */
  renderWallpaperHourlyStrip() {
    if (!this.wallpaperWeatherData?.hourly?.time || !this.$.wallpaperHourlyStrip) return;

    const hourly = this.wallpaperWeatherData.hourly;
    const startIdx = this.wallpaperCurrentHourIndex;
    const endIdx = Math.min(startIdx + 24, hourly.time.length);
    this.$.wallpaperHourlyStrip.innerHTML = "";

    for (let i = startIdx; i < endIdx; i++) {
      const code = hourly.weather_code?.[i] ?? 0;
      const isDay = hourly.is_day?.[i] === 1;
      const info = WeatherService.getWeatherInfo(code, isDay);
      const temp = hourly.temperature_2m?.[i];
      const precipProb = hourly.precipitation_probability?.[i];
      const time = hourly.time[i];

      const hourEl = document.createElement("div");
      hourEl.className = "flex-shrink-0 w-[60px] flex flex-col items-center gap-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-colors";

      // Time label
      const timeLabel = document.createElement("span");
      timeLabel.className = `text-[10px] font-bold ${i === startIdx ? "text-primary" : "text-slate-400"}`;
      timeLabel.textContent = WeatherService.formatHourLabel(time);
      hourEl.appendChild(timeLabel);

      // Icon
      const icon = document.createElement("span");
      icon.className = "text-base";
      icon.textContent = info.icon;
      hourEl.appendChild(icon);

      // Temp
      const tempLabel = document.createElement("span");
      tempLabel.className = "text-[11px] font-semibold text-slate-200";
      tempLabel.textContent = WeatherService.formatTemp(temp);
      hourEl.appendChild(tempLabel);

      // Precip probability
      const precip = document.createElement("span");
      precip.className = `text-[9px] font-medium ${precipProb > 30 ? "text-blue-400" : "text-slate-500"}`;
      precip.textContent = precipProb != null ? `${precipProb}%` : "--%";
      hourEl.appendChild(precip);

      this.$.wallpaperHourlyStrip.appendChild(hourEl);
    }
  }

  // ================================================================
  //  WALLPAPER FULLSCREEN + WAKE LOCK
  // ================================================================

  /**
   * Toggles true browser fullscreen (kiosk/ambient mode — hides browser chrome).
   */
  async toggleWallpaperFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await this.$.wallpaperOverlay?.requestFullscreen();
      }
      // fullscreenchange listener updates state + button UI
    } catch (e) {
      console.warn("Fullscreen toggle failed:", e);
      this.showToast("Fullscreen not available", "error");
    }
  }

  /**
   * Updates the fullscreen button UI.
   */
  updateFullscreenButtonUI() {
    if (this.$.wallpaperFullscreenBtn) {
      this.$.wallpaperFullscreenBtn.setAttribute("aria-pressed", this.wallpaperFullscreenActive);
      this.$.wallpaperFullscreenBtn.classList.toggle("bg-primary/30", this.wallpaperFullscreenActive);
      this.$.wallpaperFullscreenBtn.classList.toggle("text-primary", this.wallpaperFullscreenActive);
      this.$.wallpaperFullscreenBtn.title = this.wallpaperFullscreenActive ? "Exit fullscreen" : "Fullscreen mode";
    }
  }

  /**
   * Requests a Wake Lock so the screen stays awake in wallpaper/kiosk mode
   * (great for bedside displays). The system can release it automatically —
   * re-request on visibility change when enabled.
   */
  async requestWallpaperWakeLock() {
    if (!("wakeLock" in navigator)) {
      this.showToast("Wake Lock not supported in this browser", "info");
      if (this.$.wallpaperWakeLockToggle) this.$.wallpaperWakeLockToggle.checked = false;
      this.wallpaperWakeLockEnabled = false;
      return;
    }
    try {
      this.wallpaperWakeLock = await navigator.wakeLock.request("screen");
      this.wallpaperWakeLock.addEventListener("release", () => {
        this.wallpaperWakeLock = null;
      });
      this.showToast("Screen will stay awake", "success");
    } catch (e) {
      console.warn("Wake Lock request failed:", e);
      if (this.$.wallpaperWakeLockToggle) this.$.wallpaperWakeLockToggle.checked = false;
      this.wallpaperWakeLockEnabled = false;
    }
  }

  /**
   * Releases the Wake Lock.
   */
  async releaseWallpaperWakeLock() {
    if (this.wallpaperWakeLock) {
      try {
        await this.wallpaperWakeLock.release();
      } catch (_) {}
      this.wallpaperWakeLock = null;
    }
  }

  // ================================================================
  //  WALLPAPER SOUNDSCAPE INTEGRATION
  // ================================================================

  /**
   * Toggles the wallpaper ambient soundscape. Reuses the app's existing
   * procedural audio synthesizer but drives it from the wallpaper's weather.
   */
  setWallpaperSoundscape(enabled) {
    this.wallpaperSoundEnabled = enabled;
    if (enabled) {
      // Remember the app soundscape state so leaving wallpaper restores it
      this.wallpaperSoundWasPlayingBefore = this.audioActive;
      this.audioActive = true;
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume().catch(() => {});
      }
      // Drive the synthesizer from the wallpaper's weather
      if (this.wallpaperWeatherData) {
        const weather = WeatherService.getHourlyAtIndex(
          this.wallpaperWeatherData,
          this.wallpaperCurrentHourIndex,
        );
        if (weather) {
          this.updateAmbientSoundscapeSynthesizer(weather.weatherCode, weather.windSpeed);
        }
      }
      this.showToast("Wallpaper soundscape active", "success");
    } else {
      this.stopAllSounds();
      this.activeSoundType = null;
      // Restore the app soundscape state it had before wallpaper mode
      this.audioActive = this.wallpaperSoundWasPlayingBefore;
      if (this.$.settingsSoundToggle) {
        this.$.settingsSoundToggle.checked = this.audioActive;
      }
      this.showToast("Wallpaper soundscape stopped", "info");
    }
    this._haptic('selection');
  }

  // ================================================================
  //  WALLPAPER TITLE + THEME-COLOR SYNC
  // ================================================================

  /**
   * Syncs the document title and browser theme-color to the wallpaper
   * location's current conditions.
   */
  syncWallpaperTitle() {
    if (!this.wallpaperWeatherData || !this.wallpaperLocations.length) return;
    const weather = WeatherService.getHourlyAtIndex(
      this.wallpaperWeatherData,
      this.wallpaperCurrentHourIndex,
    );
    const activeTab = this.wallpaperLocations[this.activeWallpaperIndex];
    if (!weather || !activeTab) return;

    document.title = `${WeatherService.formatTemp(weather.temperature)} ${weather.icon} ${shortPlaceName(activeTab.name)} — Aurafisky Wallpaper`;

    // Theme-color matches the wallpaper theme (browser chrome on mobile)
    const THEME_COLORS = {
      "theme-sunny": "#b45309",
      "theme-rainy": "#1e40af",
      "theme-cloudy": "#334155",
      "theme-stormy": "#4c1d95",
      "theme-snowy": "#1e40af",
      "theme-night": "#020617",
    };
    const themeClasses = Array.from(this.$.wallpaperOverlay?.classList || []);
    const themeClass = themeClasses.find((c) => THEME_COLORS[c]);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = THEME_COLORS[themeClass] || "#0f172a";
  }

  // ================================================================
  //  WALLPAPER PERSISTENCE (opt-in)
  // ================================================================

  /**
   * Saves the wallpaper tabs + settings to localStorage (opt-in).
   */
  saveWallpaperToStorage() {
    try {
      localStorage.setItem("aurafisky_wallpaper", JSON.stringify({
        locations: this.wallpaperLocations,
        activeIndex: this.activeWallpaperIndex,
        refreshInterval: this.wallpaperRefreshInterval,
        autoRotateEnabled: this.wallpaperAutoRotateEnabled,
        autoRotateInterval: this.wallpaperAutoRotateInterval,
        soundEnabled: this.wallpaperSoundEnabled,
        photoEnabled: this.wallpaperPhotoEnabled,
        brandEnabled: this.wallpaperBrandEnabled,
        wakeLockEnabled: this.wallpaperWakeLockEnabled,
        thresholds: this.wallpaperNotificationThresholds,
        highContrast: this.wallpaperHighContrast,
      }));
    } catch (e) {
      console.warn("Wallpaper save failed:", e);
    }
  }

  /**
   * Clears the persisted wallpaper from localStorage.
   */
  clearWallpaperStorage() {
    try {
      localStorage.removeItem("aurafisky_wallpaper");
    } catch (_) {}
  }

  /**
   * Restores the wallpaper from localStorage on startup (opt-in).
   */
  restoreWallpaperFromStorage() {
    try {
      const raw = localStorage.getItem("aurafisky_wallpaper");
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.locations) || data.locations.length === 0) return false;

      this.wallpaperLocations = data.locations;
      this.activeWallpaperIndex = Math.min(data.activeIndex || 0, this.wallpaperLocations.length - 1);
      if (data.refreshInterval) this.wallpaperRefreshInterval = data.refreshInterval;
      this.wallpaperAutoRotateEnabled = !!data.autoRotateEnabled;
      if (data.autoRotateInterval) this.wallpaperAutoRotateInterval = data.autoRotateInterval;
      this.wallpaperSoundEnabled = !!data.soundEnabled;
      this.wallpaperPhotoEnabled = data.photoEnabled !== false;
      this.wallpaperBrandEnabled = !!data.brandEnabled;
      this.wallpaperWakeLockEnabled = !!data.wakeLockEnabled;
      if (data.thresholds) this.wallpaperNotificationThresholds = { ...this.wallpaperNotificationThresholds, ...data.thresholds };
      this.wallpaperHighContrast = !!data.highContrast;

      // Sync settings UI
      this.syncWallpaperSettingsUI();
      return true;
    } catch (e) {
      console.warn("Wallpaper restore failed:", e);
      return false;
    }
  }

  /**
   * Syncs the wallpaper settings panel UI from current state.
   */
  syncWallpaperSettingsUI() {
    if (this.$.wallpaperRefreshIntervalSelect) {
      this.$.wallpaperRefreshIntervalSelect.value = String(this.wallpaperRefreshInterval);
    }
    if (this.$.wallpaperAutoRotateToggle) {
      this.$.wallpaperAutoRotateToggle.checked = this.wallpaperAutoRotateEnabled;
    }
    if (this.$.wallpaperRotateIntervalSelect) {
      this.$.wallpaperRotateIntervalSelect.value = String(this.wallpaperAutoRotateInterval);
    }
    if (this.$.wallpaperSoundToggle) {
      this.$.wallpaperSoundToggle.checked = this.wallpaperSoundEnabled;
    }
    if (this.$.wallpaperBrandToggle) {
      this.$.wallpaperBrandToggle.checked = this.wallpaperBrandEnabled;
    }
    if (this.$.wallpaperNotifyRain) {
      this.$.wallpaperNotifyRain.checked = !!this.wallpaperNotificationThresholds.rain;
    }
    if (this.$.wallpaperNotifyTempDrop) {
      this.$.wallpaperNotifyTempDrop.value = this.wallpaperNotificationThresholds.tempDrop;
    }
    if (this.$.wallpaperNotifyUV) {
      this.$.wallpaperNotifyUV.value = this.wallpaperNotificationThresholds.uvHigh;
    }
    if (this.$.wallpaperNotifyWind) {
      this.$.wallpaperNotifyWind.value = this.wallpaperNotificationThresholds.windHigh;
    }
    if (this.$.wallpaperHCSetting) {
      this.$.wallpaperHCSetting.checked = this.wallpaperHighContrast;
    }
    if (this.$.wallpaperPhotoToggle) {
      this.$.wallpaperPhotoToggle.checked = this.wallpaperPhotoEnabled;
    }
    if (this.$.wallpaperPersistToggle) {
      this.$.wallpaperPersistToggle.checked = this.wallpaperPersistEnabled;
    }
    if (this.$.wallpaperWakeLockToggle) {
      this.$.wallpaperWakeLockToggle.checked = this.wallpaperWakeLockEnabled;
    }
    if (this.$.wallpaperGeofenceToggle) {
      this.$.wallpaperGeofenceToggle.checked = this.wallpaperGeofenceEnabled;
    }
    if (this.$.wallpaperHighContrastBtn) {
      this.$.wallpaperHighContrastBtn.classList.toggle("bg-primary/30", this.wallpaperHighContrast);
      this.$.wallpaperHighContrastBtn.classList.toggle("text-primary", this.wallpaperHighContrast);
      this.$.wallpaperHighContrastBtn.setAttribute("aria-pressed", this.wallpaperHighContrast);
    }
  }

  // ================================================================
  //  WALLPAPER PHOTO BACKGROUND (DYNAMIC WEATHER CROSSFADE)
  // ================================================================

  /**
   * Resolves an online scenic weather wallpaper suited to current conditions.
   * Uses deterministic hashing to keep the wallpaper stable per location and condition.
   */
  /**
   * Paints the procedural scene behind the wallpaper overlay. All rendering
   * lives in features/wallpaper.js; this stays as the app-level entry point
   * the rest of the overlay code already calls.
   */
  showWallpaperPhotoBg() {
    this.wallpaperPhotoEnabled && this.wallpaper?.show?.();
  }

  /**
   * Stops the render loop and releases the screen wake lock.
   */
  hideWallpaperPhotoBg() {
    this.wallpaper?.hide?.();
  }

  /**
   * Re-renders the scene in place — used when the active wallpaper tab or the
   * conditions change underneath an open overlay.
   */
  refreshWallpaperPhotoBg() {
    this.wallpaperPhotoEnabled && this.wallpaper?.refresh?.();
  }

  /**
   * Applies the selected wallpaper atmosphere/theme preset across both
   * the procedural canvas scene and the overlay container.
   */
  setWallpaperPreset(preset = "none") {
    this.wallpaperPreset = preset;
    try {
      localStorage.setItem("aurafisky_wallpaper_preset", preset);
    } catch (_) {}

    // Update preset on the wallpaper canvas renderer
    if (this.wallpaper && typeof this.wallpaper.setPreset === "function") {
      this.wallpaper.setPreset(preset);
    } else if (this.wallpaper) {
      this.wallpaper.presetName = preset;
      this.refreshWallpaperPhotoBg();
    }

    // Update preset theme classes on wallpaper overlay
    const overlay = this.$.wallpaperOverlay || document.getElementById("wallpaperOverlay");
    if (overlay) {
      const allPresets = ["none", "golden", "midnight", "sunrise", "forest", "desert", "aurora", "monochrome", "twilight"];
      allPresets.forEach((p) => overlay.classList.remove(`preset-${p}`));
      if (preset && preset !== "none") {
        overlay.classList.add(`preset-${preset}`);
      }
    }

    // Update active UI state on theme preset buttons & select dropdown
    document.querySelectorAll("[data-preset]").forEach((btn) => {
      const isCurrent = btn.dataset.preset === preset;
      btn.classList.toggle("active", isCurrent);
      btn.setAttribute("aria-selected", isCurrent ? "true" : "false");
    });
    const presetSelectDropdown = document.getElementById("wallpaperPresetSelect");
    if (presetSelectDropdown && presetSelectDropdown.value !== preset) {
      presetSelectDropdown.value = preset;
    }
  }

  openWallpaperAddTabModal() {
    const modal = this.$.wallpaperAddTabModal || document.getElementById("wallpaperAddTabModal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");

    const input = this.$.wallpaperTabSearchInput || document.getElementById("wallpaperTabSearchInput");
    if (input) {
      input.value = "";
      input.focus();
    }
    const results = this.$.wallpaperTabSearchResults || document.getElementById("wallpaperTabSearchResults");
    if (results) {
      results.innerHTML = "";
      results.classList.add("hidden");
    }

    // Populate saved bookmarks section if any
    const bookmarksSection = this.$.wallpaperSavedBookmarksSection || document.getElementById("wallpaperSavedBookmarksSection");
    const bookmarksList = this.$.wallpaperSavedBookmarks || document.getElementById("wallpaperSavedBookmarks");
    if (bookmarksSection && bookmarksList) {
      if (this.bookmarks && this.bookmarks.length > 0) {
        bookmarksList.innerHTML = "";
        this.bookmarks.forEach((b) => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "text-xs px-3 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 transition-all active:scale-95 cursor-pointer";
          const shortName = shortPlaceName(b.name || "");
          btn.textContent = `⭐ ${shortName}`;
          btn.addEventListener("click", () => {
            this.addWallpaperTab(b.lat, b.lng, b.name);
            this.closeWallpaperAddTabModal();
            this._haptic('success');
          });
          bookmarksList.appendChild(btn);
        });
        bookmarksSection.classList.remove("hidden");
      } else {
        bookmarksSection.classList.add("hidden");
      }
    }
  }

  /**
   * Closes the Add Location modal.
   */
  closeWallpaperAddTabModal() {
    const modal = this.$.wallpaperAddTabModal || document.getElementById("wallpaperAddTabModal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  /**
   * Shows the Aurafisky brand wallpaper background.
   */
  showWallpaperBrandBg() {
    this.$.wallpaperBrandBg?.classList.remove("hidden");
  }

  /**
   * Hides the Aurafisky brand wallpaper background.
   */
  hideWallpaperBrandBg() {
    this.$.wallpaperBrandBg?.classList.add("hidden");
  }

  /**
   * Mini radar snapshot removed per user request.
   */
  async renderWallpaperMiniRadar() {
    return;
  }

  // ================================================================
  //  WALLPAPER GEOFENCE TRIGGERS
  // ================================================================

  /**
   * Toggles geofence triggers: watches the device location and auto-shows
   * the wallpaper when the user arrives within ~500m of a wallpaper tab.
   */
  toggleWallpaperGeofence() {
    this.wallpaperGeofenceEnabled = !this.wallpaperGeofenceEnabled;
    if (this.wallpaperGeofenceEnabled) {
      this.startWallpaperGeofence();
      this.showToast("Geofence triggers enabled — arrive at a wallpaper location to auto-show it", "success", 5000);
    } else {
      this.stopWallpaperGeofence();
      this.showToast("Geofence triggers disabled", "info");
    }
  }

  /**
   * Starts watching the device location for geofence triggers.
   */
  startWallpaperGeofence() {
    this.stopWallpaperGeofence();
    if (!navigator.geolocation) {
      this.showToast("Geolocation not supported", "error");
      this.wallpaperGeofenceEnabled = false;
      return;
    }
    this._wallpaperGeofenceWatchId = navigator.geolocation.watchPosition(
      (pos) => this._checkWallpaperGeofence(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: false, timeout: 30000, maximumAge: 60000 }
    );
  }

  /**
   * Stops the geofence watcher.
   */
  stopWallpaperGeofence() {
    if (this._wallpaperGeofenceWatchId != null) {
      navigator.geolocation.clearWatch(this._wallpaperGeofenceWatchId);
      this._wallpaperGeofenceWatchId = null;
    }
  }

  /**
   * Checks whether the device is within the geofence radius of any wallpaper
   * tab and auto-shows that tab's wallpaper. ~500m ≈ 0.0045° — coarse but
   * appropriate for "arrived in this area".
   */
  _checkWallpaperGeofence(lat, lng) {
    if (!this.wallpaperGeofenceEnabled || !this.wallpaperLocations.length) return;

    const GEOFENCE_DEG = 0.0045; // ~500m
    const idx = this.wallpaperLocations.findIndex(
      (w) => Math.abs(w.lat - lat) < GEOFENCE_DEG && Math.abs(w.lng - lng) < GEOFENCE_DEG
    );
    if (idx < 0) return;
    // Already showing this tab — nothing to do
    if (this.isWallpaperMode && this.activeWallpaperIndex === idx) return;

    this.switchWallpaperTab(idx);
    this.isWallpaperMode = true;
    this.showWallpaperOverlay();
    this.showToast(`📍 Arrived at ${this.wallpaperLocations[idx].name} — wallpaper shown`, "success");
  }

  // ================================================================
  //  WALLPAPER TIME-BASED LAYOUT
  // ================================================================

  /**
   * Reorders the wallpaper content sections by time of day, surfacing what
   * matters most right now: astronomy + stargazing first at night, metrics
   * + precip in the morning commute window, forecast strips in the evening.
   */
  applyTimeBasedLayout() {
    const content = this.$.wallpaperOverlay?.querySelector(":scope > .flex-1");
    if (!content) return;

    // Sections keyed by their content identity
    const sectionMap = {};
    Array.from(content.children).forEach((child) => {
      if (child.id === "wallpaperInlineAlert") return;
      if (child.querySelector?.("#wallpaperIcon")) sectionMap.hero = child;
      else if (child.querySelector?.("#wallpaperHumidity")) sectionMap.metrics = child;
      else if (child.querySelector?.("#wallpaperAQI")) sectionMap.analysis = child;
      else if (child.querySelector?.("#wallpaperSunArc")) sectionMap.astronomy = child;
      else if (child.querySelector?.("#wallpaperHourlyStrip")) sectionMap.hourly = child;
      else if (child.querySelector?.("#wallpaperDailyStrip")) sectionMap.daily = child;
    });

    const hour = new Date().getHours();
    let order;
    if (hour >= 20 || hour < 6) {
      // Night (8 PM - 6 AM): Hero -> Metrics -> Astronomy -> Hourly -> Daily -> Analysis
      order = [
        sectionMap.hero,
        sectionMap.metrics,
        sectionMap.astronomy,
        sectionMap.hourly,
        sectionMap.daily,
        sectionMap.analysis,
      ];
    } else {
      // Daytime: Hero -> Metrics -> Hourly -> Daily -> Analysis -> Astronomy
      order = [
        sectionMap.hero,
        sectionMap.metrics,
        sectionMap.hourly,
        sectionMap.daily,
        sectionMap.analysis,
        sectionMap.astronomy,
      ];
    }

    // Re-append in the new order; inline alert stays pinned at the top
    order.forEach((section) => {
      if (section) content.appendChild(section);
    });
  }

  // ================================================================
  //  WALLPAPER SCREENSHOT / EXPORT
  // ================================================================

  /**
   * Renders the wallpaper's current conditions + key metrics + 7-day strip
   * onto a canvas and downloads it as a PNG. Self-contained draw (no
   * html2canvas dependency) so it works offline.
   */
  /**
   * Saves the wallpaper as a PNG. The scene, the user's photo and the
   * typography are all painted by features/wallpaper.js using the same code
   * path as the live overlay, so the download matches what is on screen.
   */
  exportWallpaperImage() {
    if (this.wallpaper?.exportPng) {
      this.wallpaper.exportPng();
      return;
    }
    this.showToast("Wallpaper export is unavailable", "error");
  }

  destroy() {
    if (this._rebindCleanups) {
      this._rebindCleanups.forEach((fn) => fn());
      this._rebindCleanups = null;
    }
    document.removeEventListener("keydown", this._boundKeydown);
    document.removeEventListener("click", this._boundDocClick);
    window.removeEventListener("online", this._boundOnline);
    window.removeEventListener("offline", this._boundOffline);
    window.removeEventListener("resize", this._boundResize);
    document.removeEventListener("visibilitychange", this._boundRefocus);
    window.removeEventListener("focus", this._boundRefocus);
    this.$.searchInput?.removeEventListener("focus", this._boundSearchFocus);
    this.$.searchInput?.removeEventListener("click", this._boundSearchClick);
    this._languageMutationObserver?.disconnect();
    this._languageMutationObserver = null;
    this.audioContext?.close().catch(() => {});
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.stopAllSounds();
    if (this._stopViewportWatch) {
      this._stopViewportWatch();
      this._stopViewportWatch = null;
    }
    if (this.thunderInterval) clearInterval(this.thunderInterval);
    if (this.birdsInterval) clearInterval(this.birdsInterval);
    this.clearRadarLayers();
    if (this.radarTimer) clearInterval(this.radarTimer);
    this._noiseBuffer = null;
    this._historicalResults = null;
    this.biasMap = null;
    if (this._alertPollTimer) clearInterval(this._alertPollTimer);
    if (this.tempOverlayTimer) clearInterval(this.tempOverlayTimer);
    if (this.wallpaperTimer) clearInterval(this.wallpaperTimer);
    if (this.wallpaperAutoRotateTimer) clearInterval(this.wallpaperAutoRotateTimer);
    if (this._wallpaperClockTick) clearInterval(this._wallpaperClockTick);
    if (this.wallpaperBgAnimationId) cancelAnimationFrame(this.wallpaperBgAnimationId);
    if (this._wallpaperGeofenceWatchId != null) navigator.geolocation.clearWatch(this._wallpaperGeofenceWatchId);
    if (this.wallpaperWakeLock) this.wallpaperWakeLock.release().catch(() => {});
    if (this._resizeRAF) {
      cancelAnimationFrame(this._resizeRAF);
      this._resizeRAF = null;
    }
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    if (this._tooltipHideTimer) clearTimeout(this._tooltipHideTimer);
    if (this.sunCountdownTimer) clearInterval(this.sunCountdownTimer);
    if (this._navWatchId != null) navigator.geolocation.clearWatch(this._navWatchId);
    if (this._terminatorTimer) clearInterval(this._terminatorTimer);
    if (this._panelClockTimer) clearInterval(this._panelClockTimer);
  }

  showWeatherPanel() {
    this.$.weatherPanel.classList.add("open");
    this.$.weatherPanel.classList.remove("minimized");
    this.$.weatherPanel.removeAttribute("inert");
    this.$.weatherPanel.style.opacity = "";
    this.$.weatherPanel.style.pointerEvents = "";
    this.pushHistoryOverlay("weather");
    this.$.weatherPanel.style.transform = "";
    this.$.weatherPanel.style.transition = "";

    const restorePill = document.getElementById("restoreSheetPill");
    if (restorePill) {
      restorePill.classList.add("hidden");
    }

    const timeline = document.getElementById("timelineBar");
    if (timeline && isMobileLayout()) {
      timeline.classList.add("hidden-by-sheet");
    }

    if (!isMobileLayout()) {
      this.$.weatherPanel.style.height = '';
      this.$.weatherPanel.style.maxHeight = '';
      this.$.weatherPanel.style.transform = '';
      this.$.weatherPanel.style.opacity = '';
      this.$.weatherPanel.classList.remove("sheet-peek", "sheet-half", "sheet-full", "google-maps-sheet");
      this._restoreDesktopPanelPosition();
      const isWidePref = localStorage.getItem("aurafisky_weather_wide") === "true";
      this.$.weatherPanel.classList.toggle("wide-mode", isWidePref);
      this.updateWideButtonState(isWidePref);
    } else {
      this.$.weatherPanel.classList.add("open", "sheet-full", "aura-sheet", "google-maps-sheet");
      this.$.weatherPanel.style.height = '100dvh';
      this.$.weatherPanel.style.maxHeight = '100dvh';
      this.$.weatherPanel.style.top = '0px';
      this.$.weatherPanel.style.bottom = '0px';
      this.$.weatherPanel.style.left = '0px';
      this.$.weatherPanel.style.right = '0px';
      this.$.weatherPanel.style.transform = 'translateY(0)';
      // Remain below (minimized / peek) on mobile by default so the map stays visible
      if (this.googleMapsMobile) {
        this.googleMapsMobile.sheetState = 'peek';
        this.googleMapsMobile.snapSheet('peek');
      } else {
        this.toggleMinimizeWeatherPanel();
      }
    }
    if (!isMobileLayout()) {
      document.body.classList.add("weather-panel-expanded");
      if (this.$.panelMinimizeBtn) {
        this.$.panelMinimizeBtn.classList.remove("chevron-flipped");
      }
    }
    if (this.$.mobileNavWeatherBtn) {
      this.$.mobileNavWeatherBtn.classList.add("active");
      this.$.mobileNavMapBtn?.classList.remove("active");
    }
    this.syncMobileBottomNavState();
    // Mobile: collapse radar panel to avoid overlap
    if (
      isMobileLayout() &&
      this.$.radarExpandedPanel &&
      !this.$.radarExpandedPanel.classList.contains("hidden")
    ) {
      this.$.radarExpandedPanel.classList.add("hidden");
      this.$.radarCollapsedBtn.classList.remove("hidden");
    }
  }

  hideWeatherPanel() {
    this.$.weatherPanel.classList.remove("open", "minimized", "sheet-peek", "sheet-half", "sheet-full");
    this.$.weatherPanel.setAttribute("inert", "");
    this.$.weatherPanel.style.opacity = "0";
    this.$.weatherPanel.style.pointerEvents = "none";
    this.popHistoryOverlay("weather");
    this.$.weatherPanel.style.transform = "translateY(110%)";
    this.$.weatherPanel.style.transition = "";
    if (this.googleMapsMobile) {
      this.googleMapsMobile.sheetState = 'dismissed';
      const pill = document.getElementById('restoreSheetPill');
      if (pill) pill.classList.add('hidden');
    }
    if (!isMobileLayout()) {
      this.$.weatherPanel.style.height = "";
      this.$.weatherPanel.style.maxHeight = "";
    } else {
      this.$.weatherPanel.style.height = "";
      this.$.weatherPanel.style.maxHeight = "";
      this.$.weatherPanel.style.top = "";
      this.$.weatherPanel.style.bottom = "";
      this.$.weatherPanel.style.left = "";
      this.$.weatherPanel.style.right = "";
    }
    document.body.classList.remove("weather-panel-expanded");
    if (this.$.mobileNavMapBtn) {
      this.$.mobileNavMapBtn.classList.add("active");
      this.$.mobileNavWeatherBtn?.classList.remove("active");
    }
    this.syncMobileBottomNavState();
    document.documentElement.classList.remove("compact");
    if (this.$.panelMinimizeBtn) {
      this.$.panelMinimizeBtn.classList.remove("chevron-flipped");
    }
    this.stopAllSounds();
    if (this.audioActive) {
      this.toggleAmbientSoundscape();
    }
    this.activeEffectType = "none";
    this.particles = [];
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    // Guard against canvas not being initialized (#3)
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    // Remove the selected location marker and popup from the map
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }
    this.selectedLat = null;
    this.selectedLng = null;
    this.selectedName = "";
    this.weatherData = null;
    if (typeof this.updateHomeButton === "function") {
      this.updateHomeButton();
    }
    if (this.$.searchInput) {
      this.$.searchInput.value = "";
    }
    if (this.$.searchClearBtn) {
      this.$.searchClearBtn.classList.add("hidden");
    }
    this._clearUrlParams();
    localforage.removeItem("_lastSession").catch(() => {});
  }

  toggleMinimizeWeatherPanel() {
    if (isMobileLayout() && this.googleMapsMobile) {
      if (this.googleMapsMobile.sheetState === 'full') {
        this.googleMapsMobile.snapSheet('peek');
      } else {
        this.googleMapsMobile.snapSheet('full');
      }
      return;
    }
    this.$.weatherPanel.classList.toggle("minimized");
    const isMin = this.$.weatherPanel.classList.contains("minimized");
    if (!isMobileLayout()) {
      this.$.weatherPanel.style.height = '';
      this.$.weatherPanel.style.maxHeight = '';
      this.$.weatherPanel.style.transform = '';
    }
    document.body.classList.toggle("weather-panel-expanded", !isMin);
    if (this.$.panelMinimizeBtn) {
      this.$.panelMinimizeBtn.classList.toggle(
        "chevron-flipped",
        isMin,
      );
      this.$.panelMinimizeBtn.setAttribute("title", isMin ? "Expand panel" : "Minimize panel");
      this.$.panelMinimizeBtn.setAttribute("aria-label", isMin ? "Expand panel" : "Minimize panel");
    }
    if (this.$.mobileNavWeatherBtn && this.$.mobileNavMapBtn) {
      this.$.mobileNavWeatherBtn.classList.toggle("active", !isMin);
      this.$.mobileNavMapBtn.classList.toggle("active", isMin);
    }
    this.syncMobileBottomNavState();
  }

  /**
   * Toggles dedicated Full-Screen / Wide Mode for the weather panel.
   * On desktop: expands card to wide 2-column layout (780px) and persists preference.
   * On mobile: snaps between full-screen sheet and peek mode.
   */
  toggleWideWeatherPanel(force) {
    if (isMobileLayout()) {
      if (this.googleMapsMobile) {
        const isFull = this.googleMapsMobile.sheetState === 'full' || this.$.weatherPanel.classList.contains('sheet-full');
        const targetState = typeof force === 'boolean' ? (force ? 'full' : 'peek') : (isFull ? 'peek' : 'full');
        this.googleMapsMobile.snapSheet(targetState);
        this.updateWideButtonState(targetState === 'full');
      }
      return;
    }

    const isCurrentlyWide = this.$.weatherPanel.classList.contains("wide-mode");
    const becomeWide = typeof force === "boolean" ? force : !isCurrentlyWide;

    this.$.weatherPanel.classList.toggle("wide-mode", becomeWide);

    if (becomeWide) {
      // Un-minimize if it was minimized
      this.$.weatherPanel.classList.remove("minimized");
      if (this.$.panelMinimizeBtn) {
        this.$.panelMinimizeBtn.classList.remove("chevron-flipped");
        this.$.panelMinimizeBtn.setAttribute("title", "Minimize panel");
        this.$.panelMinimizeBtn.setAttribute("aria-label", "Minimize panel");
      }
      document.body.classList.add("weather-panel-expanded");

      // Boundary check: ensure panel stays within visible viewport
      const rect = this.$.weatherPanel.getBoundingClientRect();
      if (rect.right > window.innerWidth - 16) {
        const newLeft = Math.max(16, window.innerWidth - 800);
        this.$.weatherPanel.style.left = `${newLeft}px`;
      }
    } else {
      document.body.classList.remove("weather-panel-expanded");
      // Restore user-saved desktop position if set, or clear inline left so CSS layout applies
      try {
        const savedPos = localStorage.getItem("aurafisky_desktop_panel_pos");
        if (savedPos) {
          const parsed = JSON.parse(savedPos);
          if (parsed && typeof parsed.left === "number") {
            this.$.weatherPanel.style.left = `${parsed.left}px`;
          }
        } else {
          this.$.weatherPanel.style.left = "";
        }
      } catch (_) {}
    }

    this.updateWideButtonState(becomeWide);
    if (this.map) {
      setTimeout(() => this.map?.updateSize(), 320);
    }
    setTimeout(() => {
      this._sparklineDrawnWidth = 0;
      if (this.weatherData && this.activeWeatherTab === "hourly") {
        this.drawHourlySparkline(parseInt(this.$.timelineSlider?.value || 0, 10));
      }
    }, 320);

    try {
      localStorage.setItem("aurafisky_weather_wide", becomeWide ? "true" : "false");
    } catch (_) {}
  }

  /**
   * Updates icon, title, aria and active styling of the Dedicated Wide Mode toggle button.
   */
  updateWideButtonState(isWide) {
    if (!this.$.panelExpandWideBtn) return;
    this.$.panelExpandWideBtn.classList.toggle("active", isWide);
    this.$.panelExpandWideBtn.setAttribute("aria-pressed", isWide ? "true" : "false");
    this.$.panelExpandWideBtn.setAttribute("title", isWide ? "Exit wide mode (F or Shift+W)" : "Wide / Full-Screen mode (F or Shift+W)");
    this.$.panelExpandWideBtn.setAttribute("aria-label", isWide ? "Exit wide mode" : "Wide / Full-Screen mode");
    if (this.$.panelExpandWideIcon) {
      this.$.panelExpandWideIcon.classList.toggle("hidden", isWide);
      this.$.panelExpandWideIcon.style.setProperty("display", isWide ? "none" : "block", "important");
    }
    if (this.$.panelCompressWideIcon) {
      this.$.panelCompressWideIcon.classList.toggle("hidden", !isWide);
      this.$.panelCompressWideIcon.style.setProperty("display", isWide ? "block" : "none", "important");
    }
  }

  // ================================================================
  //  WEATHER PANEL TABS & MOBILE NAVIGATION
  // ================================================================

  /**
   * Initializes tab switching on the left-side weather card with horizontal scroll & gestures.
   */
  initWeatherPanelTabs() {
    this.activeWeatherTab = "overview";
    const tabBtns = document.querySelectorAll(".weather-tab-btn");
    const tabsContainer = this.$.weatherPanelTabs || document.getElementById("weatherPanelTabs");
    let hasDragged = false;

    if (tabsContainer) {
      // Horizontal mouse wheel scrolling: translate vertical wheel (deltaY) to horizontal scroll
      tabsContainer.addEventListener(
        "wheel",
        (e) => {
          if (e.deltaY !== 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
            e.preventDefault();
            tabsContainer.scrollLeft += e.deltaY;
          }
        },
        { passive: false }
      );

      // Desktop drag-to-scroll interaction
      let isDown = false;
      let startX = 0;
      let startScrollLeft = 0;

      tabsContainer.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        isDown = true;
        hasDragged = false;
        startX = e.pageX - tabsContainer.offsetLeft;
        startScrollLeft = tabsContainer.scrollLeft;
      });

      window.addEventListener("mouseup", () => {
        if (isDown) {
          isDown = false;
          tabsContainer.classList.remove("dragging");
          setTimeout(() => {
            hasDragged = false;
          }, 80);
        }
      });

      tabsContainer.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        const x = e.pageX - tabsContainer.offsetLeft;
        const walk = x - startX;
        if (Math.abs(walk) > 4) {
          hasDragged = true;
          tabsContainer.classList.add("dragging");
          tabsContainer.scrollLeft = startScrollLeft - walk;
        }
      });
    }

    tabBtns.forEach((btn, index) => {
      btn.addEventListener("click", (e) => {
        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const tabName = btn.dataset.tab;
        if (tabName) {
          this.switchWeatherTab(tabName);
          this._haptic("selection");
        }
      });

      btn.addEventListener("keydown", (e) => {
        let targetIndex = -1;
        if (e.key === "ArrowRight") {
          targetIndex = (index + 1) % tabBtns.length;
        } else if (e.key === "ArrowLeft") {
          targetIndex = (index - 1 + tabBtns.length) % tabBtns.length;
        }
        if (targetIndex !== -1) {
          e.preventDefault();
          const targetBtn = tabBtns[targetIndex];
          targetBtn.focus();
          targetBtn.click();
        }
      });
    });

    // Quick summary jump chips on overview tab
    const quickChips = document.querySelectorAll(".quick-chip-btn");
    quickChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const targetTab = chip.dataset.targetTab;
        if (targetTab) {
          this.switchWeatherTab(targetTab);
          this._haptic("selection");
        }
      });
    });

    // Explicitly activate overview tab on initialization
    this.switchWeatherTab("overview");

    // Mobile touch gestures: horizontal swipe across tabs & pull-to-minimize
    this.initMobileWeatherGestures();
  }

  /**
   * Initializes mobile touch gestures: horizontal swiping to cycle tabs,
   * and pull-down on header to toggle minimize.
   */
  initMobileWeatherGestures() {
    const content = this.$.weatherPanelContent;
    const tabNames = ["overview", "hourly", "daily", "metrics", "astronomy", "farm"];

    if (content) {
      let touchStartX = 0;
      let touchStartY = 0;
      let touchStartTime = 0;

      content.addEventListener(
        "touchstart",
        (e) => {
          if (!isMobileLayout() || e.touches.length !== 1) return;
          const touch = e.touches[0];
          touchStartX = touch.clientX;
          touchStartY = touch.clientY;
          touchStartTime = Date.now();
        },
        { passive: true }
      );

      content.addEventListener(
        "touchend",
        (e) => {
          if (!isMobileLayout() || e.changedTouches.length !== 1) return;
          const touch = e.changedTouches[0];
          const dx = touch.clientX - touchStartX;
          const dy = touch.clientY - touchStartY;
          const dt = Date.now() - touchStartTime;

          // Horizontal swipe: dx > 48px, horizontal dominance > 1.4x, duration < 500ms
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4 && dt < 500) {
            const currentIndex = tabNames.indexOf(this.activeWeatherTab || "overview");
            if (currentIndex !== -1) {
              if (dx < 0 && currentIndex < tabNames.length - 1) {
                // Swipe Left -> Next tab
                this.switchWeatherTab(tabNames[currentIndex + 1]);
                this._haptic("selection");
              } else if (dx > 0 && currentIndex > 0) {
                // Swipe Right -> Prev tab
                this.switchWeatherTab(tabNames[currentIndex - 1]);
                this._haptic("selection");
              }
            }
          }
        },
        { passive: true }
      );
    }

    // Pull-to-minimize & tap handle
    const header = this.$.weatherPanel?.querySelector(".flex-shrink-0");
    if (header) {
      let pullStartY = 0;
      let pullStartX = 0;
      let pullStartTime = 0;

      header.addEventListener(
        "touchstart",
        (e) => {
          if (!isMobileLayout() || e.touches.length !== 1) return;
          if (e.target.closest("button, a, select, input, [role='tab']")) return;
          const touch = e.touches[0];
          pullStartY = touch.clientY;
          pullStartX = touch.clientX;
          pullStartTime = Date.now();
        },
        { passive: true }
      );

      header.addEventListener(
        "touchend",
        (e) => {
          if (!isMobileLayout() || e.changedTouches.length !== 1) return;
          if (e.target.closest("button, a, select, input, [role='tab']")) return;
          const touch = e.changedTouches[0];
          const dy = touch.clientY - pullStartY;
          const dx = touch.clientX - pullStartX;
          const dt = Date.now() - pullStartTime;

          // Quick tap on handle/header toggles minimize
          if (Math.abs(dy) < 10 && Math.abs(dx) < 10 && dt < 300) {
            this.toggleMinimizeWeatherPanel();
            this._haptic("selection");
            return;
          }

          // Pull down gesture (> 48px)
          if (dy > 48 && Math.abs(dy) > Math.abs(dx)) {
            if (!this.$.weatherPanel?.classList.contains("minimized")) {
              this.toggleMinimizeWeatherPanel();
              this._haptic("light");
            }
          } else if (dy < -40 && Math.abs(dy) > Math.abs(dx)) {
            // Pull up gesture (< -40px)
            if (this.$.weatherPanel?.classList.contains("minimized")) {
              this.toggleMinimizeWeatherPanel();
              this._haptic("light");
            }
          }
        },
        { passive: true }
      );
    }
  }

  /**
   * Switches the active section tab in the weather card.
   * @param {string} tabName - 'overview' | 'hourly' | 'daily' | 'metrics' | 'astronomy'
   */
  switchWeatherTab(tabName) {
    this.activeWeatherTab = tabName;
    const tabBtns = document.querySelectorAll(".weather-tab-btn");
    const panels = document.querySelectorAll(".weather-tab-panel");

    tabBtns.forEach((btn) => {
      const isTarget = btn.dataset.tab === tabName;
      btn.classList.toggle("active", isTarget);
      btn.setAttribute("aria-selected", isTarget ? "true" : "false");
    });

    const targetPanelIdMap = {
      overview: "weatherTabOverview",
      hourly: "weatherTabHourly",
      daily: "weatherTabDaily",
      metrics: "weatherTabMetrics",
      astronomy: "weatherTabAstronomy",
      farm: "weatherTabFarm",
    };

    const targetPanelId = targetPanelIdMap[tabName] || "weatherTabOverview";
    panels.forEach((p) => {
      const isTarget = p.id === targetPanelId;
      p.classList.toggle("active", isTarget);
      p.classList.toggle("hidden", !isTarget);
    });

    // Feature panels render parts of their content from live data. Translate
    // the selected panel on entry, then ask the full-page fallback to pick up
    // any labels that do not have a first-party phrase yet.
    if (tabName === "astronomy" && typeof this.updateCelestialBodies === "function") {
      try { this.updateCelestialBodies(new Date()); } catch (_) {}
    }
    if (tabName === "farm" && typeof this.renderFarmTab === "function") {
      try { this.renderFarmTab(this); } catch (_) {}
    }

    const activePanel = document.getElementById(targetPanelId);
    if (activePanel) translateDOM(activePanel, this.language || detectLocale());
    refreshExternalTranslation(this.language || detectLocale());

    const activeBtn = document.querySelector(`.weather-tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }

    if (tabName === "hourly") {
      requestAnimationFrame(() => {
        this._sparklineDrawnWidth = 0;
        if (this.weatherData) {
          this.drawHourlySparkline(parseInt(this.$.timelineSlider?.value || 0, 10));
        }
      });
    }
  }

  /**
   * Updates quick statistics chips on the Overview tab (AQI, Wind, Humidity).
   * @param {Object} weather - Hourly weather point
   * @param {number|null} aqiVal - US AQI value
   */
  _updateOverviewChips(weather, aqiVal) {
    if (this.$.overviewAQIChip) {
      if (aqiVal != null) {
        const info = WeatherService.getAQIInfo(aqiVal);
        this.$.overviewAQIChip.textContent = `${Math.round(aqiVal)} · ${info.label}`;
      } else {
        this.$.overviewAQIChip.textContent = "--";
      }
    }
    if (this.$.overviewWindChip && weather) {
      this.$.overviewWindChip.textContent = `${WeatherService.formatWind(weather.windSpeed)} ${WeatherService.getWindDirection(weather.windDirection)}`;
    }
    if (this.$.overviewHumidityChip && weather) {
      this.$.overviewHumidityChip.textContent = `${weather.humidity ?? "--"}%`;
    }
  }

  /**
   * Renders the 2-hour minute-by-minute precipitation nowcast.
   * @param {number} [hourIndex=0]
   */
  _renderNowcast(hourIndex = 0) {
    if (!this.$.nowcastSection || !this.weatherData) return;
    const nowcast = WeatherService.getPrecipitationNowcast(this.weatherData, hourIndex);
    if (!nowcast || !nowcast.intervals?.length) {
      this.$.nowcastSection.classList.add("hidden");
      return;
    }

    this.$.nowcastSection.classList.remove("hidden");
    if (this.$.nowcastHeadline) {
      this.$.nowcastHeadline.textContent = nowcast.summary;
    }
    if (this.$.nowcastIcon) {
      this.$.nowcastIcon.textContent = nowcast.icon;
    }

    if (this.$.nowcastBars) {
      const maxMm = Math.max(0.5, ...nowcast.intervals.map((i) => i.mm || 0));
      this.$.nowcastBars.innerHTML = nowcast.intervals
        .map((interval) => {
          const heightPx = Math.max(4, Math.min(36, Math.round(((interval.mm || 0) / maxMm) * 36)));
          let colorClass = "bg-slate-200 dark:bg-slate-700";
          if (interval.intensity === "heavy") {
            colorClass = "bg-indigo-600 dark:bg-indigo-500";
          } else if (interval.intensity === "moderate") {
            colorClass = "bg-blue-500 dark:bg-blue-400";
          } else if (interval.intensity === "light") {
            colorClass = "bg-sky-400 dark:bg-sky-400";
          }
          return `<div class="flex-1 rounded-sm transition-all duration-300 ${colorClass}" style="height: ${heightPx}px" title="${interval.label}: ${(interval.mm || 0).toFixed(2)} mm (${interval.prob}% chance)" role="img" aria-label="${interval.label}: ${interval.intensity} precipitation"></div>`;
        })
        .join("");
    }
  }

  /**
   * Synchronizes mobile bottom navigation tab active indicators with actual UI state.
   */
  syncMobileBottomNavState() {
    const mapBtn = this.$.mobileNavMapBtn;
    const weatherBtn = this.$.mobileNavWeatherBtn;
    const routeBtn = this.$.mobileNavRouteBtn;
    const savedBtn = this.$.mobileNavSavedBtn;
    const layersBtn = this.$.mobileNavLayersBtn;
    if (!mapBtn) return;

    const routePanelOpen = document.getElementById("routePanel") && !document.getElementById("routePanel").classList.contains("hidden");
    const savedOpen = this.$.bookmarksDropdown && !this.$.bookmarksDropdown.classList.contains("hidden");
    const layersOpen = this.$.mapLayersFlyout && !this.$.mapLayersFlyout.classList.contains("hidden");
    const weatherOpen = this.$.weatherPanel?.classList.contains("open") && !this.$.weatherPanel?.classList.contains("minimized");

    [mapBtn, weatherBtn, routeBtn, savedBtn, layersBtn].forEach((btn) => btn?.classList.remove("active"));

    if (routePanelOpen && routeBtn) {
      routeBtn.classList.add("active");
    } else if (savedOpen && savedBtn) {
      savedBtn.classList.add("active");
    } else if (layersOpen && layersBtn) {
      layersBtn.classList.add("active");
    } else if (weatherOpen && weatherBtn) {
      weatherBtn.classList.add("active");
    } else if (mapBtn) {
      mapBtn.classList.add("active");
    }
  }

  /**
   * Toggles the Home Location dropdown options menu.
   */
  toggleHomeDropdown(forceState) {
    const dropdown = document.getElementById("homeDropdown");
    if (!dropdown) return;
    const isHidden = dropdown.classList.contains("hidden");
    const open = typeof forceState === "boolean" ? forceState : isHidden;
    if (open) {
      this.pushHistoryOverlay("home");
      this.updateHomeButton?.();
      dropdown.classList.remove("hidden");
    } else {
      this.popHistoryOverlay("home");
      dropdown.classList.add("hidden");
    }
  }

  /**
   * Sets up touch-friendly mobile bottom navigation bar listeners.
   */
  initMobileBottomNav() {
    const mapBtn = this.$.mobileNavMapBtn;
    const weatherBtn = this.$.mobileNavWeatherBtn;
    const routeBtn = this.$.mobileNavRouteBtn;
    const savedBtn = this.$.mobileNavSavedBtn;
    const layersBtn = this.$.mobileNavLayersBtn;

    const setActiveBtn = (targetBtn) => {
      [mapBtn, weatherBtn, routeBtn, savedBtn, layersBtn].forEach((btn) => {
        if (btn) btn.classList.toggle("active", btn === targetBtn);
      });
    };

    // Mobile Floating GPS FAB
    const mobileLocationFab = document.getElementById("mobileLocationFab");
    mobileLocationFab?.addEventListener("click", () => {
      this._haptic("selection");
      this.getMyLocation();
    });

    mapBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.$.bookmarksDropdown?.classList.add("hidden");
      this.toggleMapLayersFlyout(false);
      this.hideComparePanel();

      if (this.defaultLocation && this.defaultLocation.lat != null) {
        // Home is set! Show the Home options dropdown (Go to Home / Remove Home / Set current)
        setActiveBtn(mapBtn);
        this.toggleHomeDropdown();
      } else {
        // Home not set yet
        if (this.selectedLat != null && this.selectedLng != null) {
          this.setHomeLocation(this.selectedLat, this.selectedLng, this.selectedName);
        } else {
          this.showToast("📍 Tap any place on map or search a city, then tap 'Set Home' to save your home.", "info");
        }
      }
      this._haptic("light");
    });

    weatherBtn?.addEventListener("click", () => {
      setActiveBtn(weatherBtn);
      this.$.bookmarksDropdown?.classList.add("hidden");
      this.toggleMapLayersFlyout(false);
      this.toggleHomeDropdown(false);
      if (!this.$.weatherPanel?.classList.contains("open")) {
        if (this.selectedLat != null && this.selectedLng != null) {
          this.showWeatherPanel();
        } else if (this.defaultLocation && this.defaultLocation.lat != null) {
          this.selectLocation(this.defaultLocation.lat, this.defaultLocation.lng, this.defaultLocation.name);
        } else {
          this.getMyLocation();
        }
      } else if (this.$.weatherPanel?.classList.contains("minimized")) {
        this.toggleMinimizeWeatherPanel();
      } else {
        this.switchWeatherTab("overview");
        const content = this.$.weatherPanelContent;
        if (content) content.scrollTop = 0;
      }
      this._haptic("light");
    });

    routeBtn?.addEventListener("click", () => {
      setActiveBtn(routeBtn);
      this.hideWeatherPanel();
      this.toggleHomeDropdown(false);
      if (this.googleMapsMobile) {
        this.googleMapsMobile.sheetState = "dismissed";
        const pill = document.getElementById("restoreSheetPill");
        if (pill) pill.classList.add("hidden");
      }
      this.$.bookmarksDropdown?.classList.add("hidden");
      this.toggleMapLayersFlyout(false);
      if (typeof this.toggleRouteDropdown === "function") {
        this.toggleRouteDropdown();
      } else if (typeof this.openRouteStudio === "function") {
        this.openRouteStudio();
      } else if (typeof this.toggleRoute === "function") {
        this.toggleRoute();
      } else {
        this.$.routeBtn?.click();
      }
      this._haptic("light");
    });

    savedBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleMapLayersFlyout(false);
      this.toggleHomeDropdown(false);

      // 1. Display favorite locations on the map!
      this.showBookmarksOnMap = true;
      try { localStorage.setItem("aurafisky_show_bookmarks_map", "true"); } catch (_) {}
      this.updateBookmarksMapToggleUI?.();
      this.refreshBookmarkPins?.();

      // 2. Pan / fit to favorite locations on map
      if (this.bookmarks && this.bookmarks.length > 0) {
        const coords = this.bookmarks.map((b) => fromLonLat([b.lng, b.lat]));
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        coords.forEach(([x, y]) => {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        });
        if (this.bookmarks.length === 1) {
          this.map?.getView().animate({ center: coords[0], zoom: 10, duration: 600 });
        } else {
          this.map?.getView().fit([minX, minY, maxX, maxY], { padding: [80, 80, 160, 80], maxZoom: 12, duration: 600 });
        }
        this.showToast(`⭐ Displaying ${this.bookmarks.length} favorite ${this.bookmarks.length === 1 ? 'location' : 'locations'} on map`, "info");
      } else {
        this.showToast("⭐ No favorite locations yet. Tap the star icon on any place to add to favorites.", "info");
      }

      // 3. Open favorites list dropdown / sheet
      const isHidden = this.$.bookmarksDropdown?.classList.contains("hidden");
      if (isHidden) {
        setActiveBtn(savedBtn);
        if (typeof this.renderBookmarksList === "function") this.renderBookmarksList();
        this.updateBookmarksMapToggleUI?.();
        this.$.bookmarksDropdown?.classList.remove("hidden");
        this.pushHistoryOverlay("bookmarks");
      } else {
        this.$.bookmarksDropdown?.classList.add("hidden");
        this.syncMobileBottomNavState();
        this.popHistoryOverlay("bookmarks");
      }
      this._haptic("light");
    });

    layersBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.$.bookmarksDropdown?.classList.add("hidden");
      const isHidden = this.$.mapLayersFlyout?.classList.contains("hidden");
      if (isHidden) {
        setActiveBtn(layersBtn);
        this.toggleMapLayersFlyout(true);
      } else {
        this.toggleMapLayersFlyout(false);
        this.syncMobileBottomNavState();
      }
      this._haptic("light");
    });
  }

  /**
   * Intercepts mobile device back gesture/button (popstate) to close the topmost open
   * tab, sheet, modal, or panel instead of closing the web app.
   */
  initMobileHistoryBack() {
    if (typeof window === "undefined") return;
    window.addEventListener("popstate", () => {
      if (this._ignoreNextPopState) {
        this._ignoreNextPopState = false;
        return;
      }
      this.closeTopmostOverlay();
    });
  }

  pushHistoryOverlay(id) {
    if (typeof window === "undefined" || !window.history) return;
    try {
      const currentState = window.history.state || {};
      if (currentState.aurafiskyOverlay !== id) {
        window.history.pushState({ aurafiskyOverlay: id, depth: (currentState.depth || 0) + 1 }, "");
      }
    } catch (_) {}
  }

  popHistoryOverlay(id) {
    if (typeof window === "undefined" || !window.history) return;
    try {
      if (window.history.state && window.history.state.aurafiskyOverlay) {
        if (!id || window.history.state.aurafiskyOverlay === id) {
          this._ignoreNextPopState = true;
          window.history.back();
        }
      }
    } catch (_) {}
  }

  closeTopmostOverlay() {
    // 0. Live Sky Radar Fullscreen
    const celestialRadar = document.getElementById("celestialRadarSection");
    if (celestialRadar && celestialRadar.classList.contains("sky-radar-fullscreen")) {
      if (typeof this.toggleSkyRadarFullscreen === "function") {
        this.toggleSkyRadarFullscreen(false);
      } else {
        const btn = document.getElementById("expandSkyRadarBtn");
        btn?.click();
      }
      return true;
    }
    // 1. Settings Panel
    if (this.$.settingsPanel && !this.$.settingsPanel.classList.contains("hidden")) {
      this.toggleSettingsPanel(false);
      return true;
    }
    // 2. Aura Chatbot Modal
    const auraModal = document.getElementById("auraModal");
    if (auraModal && !auraModal.classList.contains("hidden")) {
      if (this.aura && typeof this.aura.close === "function") {
        this.aura.close();
      } else {
        auraModal.classList.add("hidden");
      }
      return true;
    }
    // 3. Share Modal
    const shareModal = document.getElementById("shareModal") || this.$.shareModal;
    if (shareModal && !shareModal.classList.contains("hidden")) {
      shareModal.classList.add("hidden");
      shareModal.classList.remove("flex");
      return true;
    }
    // 4. Account Dialog
    if (this.$.accountDialog && !this.$.accountDialog.classList.contains("hidden")) {
      this.toggleAccountDialog(false);
      return true;
    }
    // 5. Time Machine Modal
    const timeMachine = document.getElementById("timeMachineModal");
    if (timeMachine && !timeMachine.classList.contains("hidden")) {
      timeMachine.classList.add("hidden");
      return true;
    }
    // 6. Compare Panel
    const comparePanel = document.getElementById("comparePanel");
    if (comparePanel && !comparePanel.classList.contains("hidden")) {
      this.hideComparePanel?.();
      return true;
    }
    // 7. Bookmarks / Favorites Dropdown / Sheet
    if (this.$.bookmarksDropdown && !this.$.bookmarksDropdown.classList.contains("hidden")) {
      this.$.bookmarksDropdown.classList.add("hidden");
      this.syncMobileBottomNavState?.();
      return true;
    }
    // 8. Home Dropdown
    const homeDropdown = document.getElementById("homeDropdown");
    if (homeDropdown && !homeDropdown.classList.contains("hidden")) {
      this.toggleHomeDropdown?.(false);
      this.syncMobileBottomNavState?.();
      return true;
    }
    // 9. Route Dropdown
    const routeDropdown = document.getElementById("routeDropdown");
    if (routeDropdown && !routeDropdown.classList.contains("hidden")) {
      if (typeof this.toggleRouteDropdown === "function") {
        this.toggleRouteDropdown(false);
      } else {
        routeDropdown.classList.add("hidden");
      }
      return true;
    }
    // 10. Route Studio / Route Panel
    const routePanel = document.getElementById("routePanel");
    if (routePanel && !routePanel.classList.contains("hidden")) {
      if (typeof this.closeRouteStudio === "function") {
        this.closeRouteStudio();
      } else if (typeof this.hideRoutePanel === "function") {
        this.hideRoutePanel();
      } else {
        routePanel.classList.add("hidden");
      }
      this.syncMobileBottomNavState?.();
      return true;
    }
    // 11. Map Layers Flyout
    if (this.$.mapLayersFlyout && !this.$.mapLayersFlyout.classList.contains("hidden")) {
      this.toggleMapLayersFlyout(false);
      this.syncMobileBottomNavState?.();
      return true;
    }
    // 12. Radar Expanded Panel
    if (this.$.radarExpandedPanel && !this.$.radarExpandedPanel.classList.contains("hidden")) {
      this.$.radarExpandedPanel.classList.add("hidden");
      document.getElementById("radarBackdrop")?.classList.add("hidden");
      this.$.radarCollapsedBtn?.classList.remove("hidden");
      return true;
    }
    // 12. Weather tabs (if on secondary tab like hourly/daily/metrics/astronomy)
    if (this.currentWeatherTab && this.currentWeatherTab !== "overview" && this.$.weatherPanel?.classList.contains("open")) {
      this.switchWeatherTab("overview");
      return true;
    }
    // 13. Weather Panel (if open on mobile)
    if (this.$.weatherPanel && this.$.weatherPanel.classList.contains("open") && !this.$.weatherPanel.classList.contains("minimized")) {
      this.hideWeatherPanel();
      this.syncMobileBottomNavState?.();
      return true;
    }
    return false;
  }

  // ================================================================
  //  VOLUME CONTROLS
  // ================================================================
  // (relocated to features/audio.js -- see features/registry.js)

  // ================================================================
  //  CLIMATE TIME-MACHINE
  // ================================================================
  // (Full feature in features/timeMachine.js -- safe stubs provided here for startup)
  closeClimateTimeMachine() {
    if (this.$.timeMachineDrawer && this.$.timeMachineChevron) {
      this.$.timeMachineDrawer.classList.add("hidden");
      this.$.timeMachineChevron.classList.remove("rotate-180");
    }
  }

  async toggleClimateTimeMachine() {
    const mod = await import("./features/timeMachine.js");
    if (typeof mod.init === "function") mod.init(this);
    if (typeof this.toggleClimateTimeMachine === "function") {
      this.toggleClimateTimeMachine();
    }
  }

  hideComparePanel() {
    if (this.$.comparePanel) {
      this.$.comparePanel.classList.remove("open");
      setTimeout(() => this.$.comparePanel?.classList.add("hidden"), 400);
    }
  }

  // ================================================================
  //  ASTRONOMY & DAY CYCLES
  // ================================================================
  // (relocated to features/astronomy.js -- see features/registry.js)

  // ================================================================
  //  WEATHER ADVISORIES & FA VICONS
  // ================================================================
  // (relocated to features/advisories.js -- see features/registry.js)

  // ================================================================
  //  PWA SERVICE WORKER
  // ================================================================

  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (let registration of registrations) {
            registration.unregister();
          }
        });
        return;
      }
      let reloading = false;
      // When a new SW takes control, reload once so the new app shell /
      // assets (and fixes like the navigation fallback) actually run.
      //
      // `reloading` alone only guards within a single page lifetime, and it is
      // reset by the very reload it triggers — so a SW that keeps re-claiming
      // would spin the page in an endless reload loop. The timestamp below
      // survives the reload and breaks that loop, while still allowing a genuine
      // later update to reload the page (unlike a plain sessionStorage flag,
      // which would suppress every future update for the whole session).
      const RELOAD_COOLDOWN_MS = 10000;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        const last = parseInt(sessionStorage.getItem("sw_reload_at") || "0", 10);
        if (last && Date.now() - last < RELOAD_COOLDOWN_MS) {
          console.warn("Skipping SW reload — one just happened, avoiding a loop.");
          return;
        }
        reloading = true;
        try {
          sessionStorage.setItem("sw_reload_at", String(Date.now()));
        } catch (e) {
          /* private mode — the in-page `reloading` flag still applies */
        }
        // Small delay to let clients.claim() finish before reloading
        setTimeout(() => location.reload(), 300);
      });
      window.addEventListener("load", () => {
        navigator.serviceWorker
          // updateViaCache: 'none' makes the browser fetch sw.js from the
          // network on every navigation instead of serving a stale copy from
          // the HTTP cache. Without this, Chrome/Edge can keep an old SW for
          // up to 24h — the #1 cause of "browser persists older version".
          .register("./sw.js", { updateViaCache: "none" })
          .then((reg) => {
            // If a newer SW is already waiting, activate it immediately.
            if (reg.waiting) {
              reg.waiting.postMessage("skipWaiting");
            }
            reg.addEventListener("updatefound", () => {
              const newSW = reg.installing || reg.waiting;
              if (!newSW) return;
              newSW.addEventListener("statechange", () => {
                // Once the new SW is installed (and a previous controller
                // exists, meaning this is an update not a first install),
                // tell it to take control. This triggers controllerchange
                // below, which reloads the page with fresh assets.
                if (
                  newSW.state === "installed" &&
                  navigator.serviceWorker.controller
                ) {
                  // Post to waiting — it may have moved from installing→waiting
                  (reg.waiting || newSW).postMessage("skipWaiting");
                  // The controllerchange listener above will reload once.
                  // Show a toast so users on browsers that are slow to fire
                  // the reload know an update is in progress.
                  this.showToast(
                    "Updating Aurafisky…",
                    "info",
                  );
                }
              });
            });

            // ── Force SW update checks ──────────────────────────
            // Even with updateViaCache:'none', the browser only checks for a
            // new SW on navigation (or a 24h timer). A user who opens the app
            // from the home screen and keeps it open never navigates, so an
            // already-installed new version would never get picked up.
            // These listeners force an immediate update() check:
            //   1. On initial load (right after registration)
            //   2. When the tab becomes visible again (background -> foreground)
            //   3. When the window regains focus
            const forceCheck = () => reg.update().catch(() => {});
            document.addEventListener("visibilitychange", () => {
              if (document.visibilityState === "visible") forceCheck();
            });
            window.addEventListener("focus", forceCheck);
            forceCheck();
          })
          .catch((err) => {
            console.warn("Service Worker registration failed:", err);
            window.toastModule?.show("Offline support unavailable", "error");
          });
      });
    }
  }

  // ================================================================
  //  NEW FEATURES: Auto-Refresh, Temp Overlay, PWA, Compact, Shareable URL
  // ================================================================
  // (relocated to features/appToggles.js -- see features/registry.js)

  // ================================================================
  //  UV INDEX FORECAST CHART
  // ================================================================
  // (relocated to features/insights.js -- see features/registry.js)
  //  METRIC SEARCH
  // ================================================================
  //  CUSTOMIZABLE DASHBOARD (Drag-to-Reorder Metric Cards)
  // ================================================================
  // (relocated to features/dashboard.js -- see features/registry.js)

  // ================================================================
  //  KEYBOARD SHORTCUTS
  // ================================================================
  // (relocated to features/keyboardShortcuts.js -- see features/registry.js)

  // ================================================================
  //  SEVERE WEATHER ALERTS FOR BOOKMARKS
  // ================================================================
  // (relocated to features/bookmarks.js -- see features/registry.js)

  // ================================================================
  //  TOAST SYSTEM & OVERLAYS
  // ================================================================

  showToast(message, type = "info", duration) {
    window.toastModule?.show(message, type, duration);
  }

  hideLoadingOverlay() {
    const overlay = this.$.loadingOverlay;
    if (!overlay) return;
    // Drop pointer events immediately so the fading overlay never eats
    // clicks on the UI underneath it.
    overlay.style.pointerEvents = "none";
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 500);
  }

  showTermsModal() {
    if (!this.$.termsModal) return;
    this.$.termsModal.classList.remove("hidden");
    this.$.termsModal.style.display = "flex";
  }

  hideTermsModal() {
    if (!this.$.termsModal) return;
    this.$.termsModal.classList.add("hidden");
    this.$.termsModal.style.display = "none";
  }

  // ================================================================
  //  FIREBASE INTEGRATION & SECURITY
  // ================================================================

  async initFirebase() {
    try {
      if (!this.firebaseConfig?.apiKey) {
        console.warn("Firebase API key not configured. Cloud sync and auth are disabled.");
        return;
      }
      // Lazy-load Firebase only when needed
      const fbApp =
        await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js");
      const fbAuth =
        await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js");
      const fbFirestore =
        await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js");
      const fbMessaging =
        await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js");

      const app = fbApp.initializeApp(this.firebaseConfig);
      const auth = fbAuth.getAuth(app);
      let db;
      try {
        if (typeof fbFirestore.initializeFirestore === "function") {
          db = fbFirestore.initializeFirestore(app, {
            experimentalAutoDetectLongPolling: true,
          });
        } else {
          db = fbFirestore.getFirestore(app);
        }
      } catch {
        db = fbFirestore.getFirestore(app);
      }
      let messaging = null;
      try {
        if ("Notification" in window) messaging = fbMessaging.getMessaging(app);
      } catch (e) {
        console.warn("FCM messaging init skipped:", e);
      }
      this._fb = {
        app,
        auth,
        db,
        messaging,
        ...fbAuth,
        ...fbFirestore,
        ...fbMessaging,
      };

      // Track auth state shifts
      this._fb.onAuthStateChanged(this._fb.auth, (user) => {
        if (user) {
          this.user = user;
          this.onUserSignIn();
          // Re-sync any locally cached FCM token to the cloud doc
          localforage
            .getItem("fcmToken")
            .then((tok) => {
              if (tok) {
                this.fcmToken = tok;
                this.saveFcmTokenToCloud();
              }
            })
            .catch(() => {});
        } else {
          this.user = null;
          this.onUserSignOut();
        }
      });

      // Handle redirect result if user returning from Google sign-in redirect
      this._fb.getRedirectResult(this._fb.auth)
        .then((result) => {
          if (result && result.user) {
            this.showToast("Logged in successfully.", "success");
          }
        })
        .catch((error) => {
          console.error("Redirect sign-in error:", error);
          this.showToast("Sign-in failed: " + error.message, "error");
        });
    } catch (e) {
      console.warn("Firebase initialization failed:", e);
      this._fb = null;
    }
  }

  async signInWithGoogle() {
    if (!this.termsAccepted) {
      this.showToast("Please accept the Terms & Conditions first.", "info");
      this.showTermsModal();
      return;
    }
    if (!this._fb) {
      await this.initFirebase();
    }
    if (!this._fb) {
      this.showToast("Sign-in service is currently offline or loading.", "info");
      return;
    }
    const provider = new this._fb.GoogleAuthProvider();
    try {
      await this._fb.signInWithPopup(this._fb.auth, provider);
      this.showToast("Logged in successfully.", "success");
    } catch (e) {
      console.error("Google Sign-In failed:", e);
      this.showToast("Google Sign-In failed: " + (e.message || "Unknown error"), "error");
    }
  }

  async signOutUser() {
    if (!this._fb) {
      await this.initFirebase();
    }
    if (!this._fb) return;
    try {
      await this._fb.signOut(this._fb.auth);
      this.showToast("Logged out successfully.", "success");
      this.toggleAccountDialog(false);
    } catch (e) {
      console.error("Sign out failed:", e);
      this.showToast("Sign out failed: " + (e.message || "Unknown error"), "error");
    }
  }

  async onUserSignIn() {
    const name = this.user.displayName || "";
    const email = this.user.email || "";
    const initials = this._computeInitials(name, email);
    const photo = this.user.photoURL;

    // Top search bar profile button
    if (this.$.profileBtn) {
      this.$.profileBtn.title = name || email || "User Profile";
    }

    const showPersonIcon = () => {
      this.$.profileIconGeneric?.classList.remove("hidden");
      if (this.$.profileIconGeneric) this.$.profileIconGeneric.style.display = "";
      this.$.profileAvatarImg?.classList.add("hidden");
      if (this.$.profileAvatarImg) {
        this.$.profileAvatarImg.src = "";
        this.$.profileAvatarImg.style.display = "none";
      }
      this.$.profileAvatarFallback?.classList.add("hidden");
      if (this.$.profileAvatarFallback) this.$.profileAvatarFallback.style.display = "none";
      if (this.$.profileBtn) {
        this.$.profileBtn.className = "w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden flex items-center justify-center bg-slate-100/90 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 flex-shrink-0 cursor-pointer active:scale-95 transition-all shadow-xs ring-1 ring-slate-900/5 dark:ring-white/10";
      }
    };

    if (this.$.profileAvatarImg && !this._profileAvatarErrorBound) {
      this._profileAvatarErrorBound = true;
      this.$.profileAvatarImg.addEventListener("error", showPersonIcon);
    }

    if (photo && this.$.profileAvatarImg) {
      // Preload user's Gmail profile picture
      const preloader = new Image();
      preloader.referrerPolicy = "no-referrer";
      preloader.onload = () => {
        if (preloader.naturalWidth > 0 && preloader.naturalHeight > 0) {
          if (this.$.profileAvatarImg) {
            this.$.profileAvatarImg.src = photo;
            this.$.profileAvatarImg.classList.remove("hidden");
            this.$.profileAvatarImg.style.display = "block";
          }
          this.$.profileIconGeneric?.classList.add("hidden");
          if (this.$.profileIconGeneric) this.$.profileIconGeneric.style.display = "none";
          this.$.profileAvatarFallback?.classList.add("hidden");
          if (this.$.profileAvatarFallback) this.$.profileAvatarFallback.style.display = "none";
          if (this.$.profileBtn) {
            this.$.profileBtn.className = "w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden flex items-center justify-center border border-slate-200/80 dark:border-slate-700/80 ring-2 ring-teal-500/40 flex-shrink-0 cursor-pointer active:scale-95 transition-all shadow-xs";
          }
        } else {
          showPersonIcon();
        }
      };
      preloader.onerror = () => {
        showPersonIcon();
      };
      preloader.src = photo;
    } else {
      showPersonIcon();
    }

    if (this.$.accountLoggedOut)
      this.$.accountLoggedOut.classList.add("hidden");
    if (this.$.accountLoggedIn)
      this.$.accountLoggedIn.classList.remove("hidden");
    if (this.$.googleSignOutBtn)
      this.$.googleSignOutBtn.classList.remove("hidden");

    const initialsEl = document.getElementById("accountAvatarInitials");
    if (initialsEl) {
      initialsEl.textContent = initials;
    }

    if (this.$.accountAvatarImg) {
      if (photo) {
        const modalPreloader = new Image();
        modalPreloader.referrerPolicy = "no-referrer";
        modalPreloader.onload = () => {
          if (modalPreloader.naturalWidth > 0 && this.$.accountAvatarImg) {
            this.$.accountAvatarImg.src = photo;
            this.$.accountAvatarImg.classList.remove("hidden");
          } else if (this.$.accountAvatarImg) {
            this.$.accountAvatarImg.classList.add("hidden");
          }
        };
        modalPreloader.onerror = () => {
          this.$.accountAvatarImg?.classList.add("hidden");
        };
        modalPreloader.src = photo;
      } else {
        this.$.accountAvatarImg.classList.add("hidden");
      }
    }
    if (this.$.accountName)
      this.$.accountName.textContent = name || "Google User";
    if (this.$.accountEmail)
      this.$.accountEmail.textContent = email;

    await this.loadUserDataFromCloud();
  }

  _computeInitials(name, email) {
    if (name && typeof name === "string" && name.trim()) {
      const parts = name.trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      if (parts.length === 1) {
        const single = parts[0].replace(/[^a-zA-Z]/g, "");
        return single.length >= 2 ? single.slice(0, 2).toUpperCase() : single.toUpperCase() || "U";
      }
    }
    if (email && typeof email === "string" && email.trim()) {
      const userPart = email.split("@")[0].replace(/[^a-zA-Z]/g, "");
      if (userPart.length >= 2) {
        return userPart.slice(0, 2).toUpperCase();
      }
      if (userPart.length === 1) {
        return userPart.toUpperCase();
      }
    }
    return "U";
  }

  onUserSignOut() {
    if (this.$.profileIconGeneric) {
      this.$.profileIconGeneric.classList.remove("hidden");
      this.$.profileIconGeneric.style.display = "";
    }
    if (this.$.profileAvatarImg) {
      this.$.profileAvatarImg.src = "";
      this.$.profileAvatarImg.classList.add("hidden");
      this.$.profileAvatarImg.style.display = "none";
    }
    if (this.$.profileAvatarFallback) {
      this.$.profileAvatarFallback.textContent = "";
      this.$.profileAvatarFallback.classList.add("hidden");
      this.$.profileAvatarFallback.style.display = "none";
    }
    if (this.$.profileBtn) {
      this.$.profileBtn.title = "User Profile";
      this.$.profileBtn.className = "w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden flex items-center justify-center bg-slate-100/90 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/80 flex-shrink-0 cursor-pointer active:scale-95 transition-all shadow-xs ring-1 ring-slate-900/5 dark:ring-white/10";
    }

    if (this.$.accountLoggedOut)
      this.$.accountLoggedOut.classList.remove("hidden");
    if (this.$.accountLoggedIn) this.$.accountLoggedIn.classList.add("hidden");
    if (this.$.googleSignOutBtn)
      this.$.googleSignOutBtn.classList.add("hidden");

    this.defaultLocation = null;
    this.defaultLocationNotify = false;
    this.setupHourlyNotifications();

    localforage.setItem("defaultLocation", null);
    localforage.setItem("defaultLocationNotify", false);

    this.updateHomeButton();
    this.updateHomeMarker();
    this.loadBookmarks();
    this.updateSettingsUIFromLocal();

    if (this._unsubscribeUserDoc) {
      try { this._unsubscribeUserDoc(); } catch (_) {}
      this._unsubscribeUserDoc = null;
    }
  }

  async loadUserDataFromCloud(showToast = false) {
    if (!this.user) return;
    try {
      const userDocRef = this._fb.doc(this._fb.db, "users", this.user.uid);
      const userDoc = await this._fb.getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();

        if (data.bookmarks) {
          this.bookmarks = data.bookmarks;
          this.renderBookmarksList();
          this.updateStarUI();
          this.refreshBookmarkPins();
        }

        if (data.searchHistory) {
          this.searchHistory = data.searchHistory;
        }

        if (data.termsAccepted) {
          this.termsAccepted = true;
        }

        if (data.preferences) {
          const prefs = data.preferences;

          if (prefs.units) {
            this._cloudUnitsLoaded = true;
            WeatherService.setUnits(prefs.units);
            this.syncUnitLabel();
          }

          if (prefs.theme != null) {
            const wantDark = prefs.theme === "dark";
            if (wantDark !== this.isDark) {
              this.toggleDarkMode();
            }
          }

          if (prefs.compact != null) {
            document.documentElement.classList.remove("compact");
          }

          if (prefs.syncHistory != null) {
            this.syncHistory = prefs.syncHistory;
          }

          if (prefs.soundscapes != null) {
            this.audioActive = prefs.soundscapes;
            if (this.$.settingsSoundToggle) {
              this.$.settingsSoundToggle.checked = prefs.soundscapes;
            }
          }

          if (prefs.volume != null) {
            this.volumeLevel = prefs.volume;
            if (this.$.settingsVolumeSlider) {
              this.$.settingsVolumeSlider.value = Math.round(
                prefs.volume * 100,
              );
            }
          }

          if (prefs.timeline24h != null) {
            this.timeline24hMode = prefs.timeline24h;
            if (this.$.settingsTimeline24hToggle) {
              this.$.settingsTimeline24hToggle.checked = prefs.timeline24h;
            }
          }

          if (prefs.mapLanguage != null) {
            // A cloud-synced map preference must not undo the app locale
            // already selected on this device. Keep map labels aligned with
            // that locale; otherwise restore the separately saved map mode.
            this.mapLanguage = this.language && this.language !== "en"
              ? this.language
              : prefs.mapLanguage;
            this.updateMapLanguageUI();
            this._applyMapLanguage();
          }
        }

        if (data.defaultLocation) {
          this.defaultLocation = data.defaultLocation;
        } else {
          this.defaultLocation = null;
        }

        if (data.defaultLocationNotify != null) {
          this.defaultLocationNotify = data.defaultLocationNotify;
        } else {
          this.defaultLocationNotify = false;
        }

        if (data.notifyIntervalMin != null) {
          this.notifyIntervalMin = data.notifyIntervalMin;
        } else {
          this.notifyIntervalMin = 60;
        }

        // Alert rules — the cloud half of the promise features/alerts.js makes.
        // normalizeRules() is the same validator the local path uses, so a
        // malformed document can't inject rules the engine can't describe.
        if (Array.isArray(data.alertRules)) {
          const normalized = typeof this.normalizeAlertRules === "function"
            ? this.normalizeAlertRules(data.alertRules)
            : data.alertRules;
          this.alertRules = normalized;
          if (typeof this.persistAlertRules === "function") {
            this.persistAlertRules();
          }
          if (typeof this.renderAlertsPanel === "function") {
            this.renderAlertsPanel();
          }
        }

        this.setupHourlyNotifications();

        await Promise.all([
          localforage.setItem("defaultLocation", this.defaultLocation),
          localforage.setItem(
            "defaultLocationNotify",
            this.defaultLocationNotify,
          ),
          localforage.setItem("units", WeatherService.getUnits()),
        ]);

        this.updateHomeButton();
        this.updateHomeMarker();
        this.updateSettingsUIFromLocal();

        if (this.$.syncStatusTime) {
          this.$.syncStatusTime.textContent = new Date().toLocaleTimeString(this.language || "en");
        }
        if (showToast) {
          this.showToast("Cloud settings synchronized.", "success");
        }
      } else {
        await this.saveUserDataToCloud();
        this.updateHomeButton();
        this.updateHomeMarker();
        this.updateSettingsUIFromLocal();
      }

      // Live real-time Firestore sync: when favorites or home location change on another device,
      // update this device immediately without requiring a page reload.
      if (typeof this._fb?.onSnapshot === "function") {
        if (this._unsubscribeUserDoc) {
          try { this._unsubscribeUserDoc(); } catch (_) {}
          this._unsubscribeUserDoc = null;
        }
        this._unsubscribeUserDoc = this._fb.onSnapshot(userDocRef, (snap) => {
          if (!snap.exists() || snap.metadata?.hasPendingWrites) return;
          const liveData = snap.data();
          if (liveData.bookmarks && Array.isArray(liveData.bookmarks)) {
            if (JSON.stringify(liveData.bookmarks) !== JSON.stringify(this.bookmarks)) {
              this.bookmarks = liveData.bookmarks;
              this.renderBookmarksList();
              this.updateStarUI();
              this.refreshBookmarkPins();
            }
          }
          if (liveData.defaultLocation !== undefined) {
            if (JSON.stringify(liveData.defaultLocation) !== JSON.stringify(this.defaultLocation)) {
              this.defaultLocation = liveData.defaultLocation;
              this.updateHomeButton();
              this.updateHomeMarker();
              this.updateSettingsUIFromLocal();
            }
          }
        }, (err) => {
          console.warn("Real-time cloud sync listener notice:", err);
        });
      }
    } catch (e) {
      console.error("Error loading data from Firestore:", e);
      if (showToast) {
        this.showToast("Could not load cloud settings.", "error");
      }
    }
  }

  async saveUserDataToCloud() {
    const units = WeatherService.getUnits();
    const theme = this.isDark ? "dark" : "light";
    const searchHist = this.syncHistory ? [...this.searchHistory] : [];
    const dataToSave = {
      preferences: {
        units,
        theme,
        syncHistory: this.syncHistory,
        soundscapes: this.audioActive || false,
        volume: this.volumeLevel || 0.5,
        timeline24h: this.timeline24hMode,
        mapLanguage: this.mapLanguage,
      },
      bookmarks: this.bookmarks,
      searchHistory: searchHist,
      termsAccepted: this.termsAccepted,
      defaultLocation: this.defaultLocation,
      defaultLocationNotify: this.defaultLocationNotify,
      notifyIntervalMin: this.notifyIntervalMin || 60,
      // Alert rules. features/alerts.js has always claimed these "follow the
      // account across devices" and has always called this method after a
      // change — but the field was never included, so rules were silently
      // device-local despite the documented promise.
      alertRules: Array.isArray(this.alertRules) ? this.alertRules : [],
      updatedAt: new Date().toISOString(),
    };

    // Always persist essential settings locally (works without sign-in)
    try {
      await Promise.all([
        localforage.setItem("defaultLocation", this.defaultLocation),
        localforage.setItem(
          "defaultLocationNotify",
          this.defaultLocationNotify,
        ),
        localforage.setItem("notifyIntervalMin", this.notifyIntervalMin || 60),
        localforage.setItem("units", units),
        localforage.setItem("soundscapes", this.audioActive || false),
        localforage.setItem("volume", this.volumeLevel || 0.5),
        localforage.setItem("termsAccepted", this.termsAccepted),
        localforage.setItem("timeline24h", this.timeline24hMode),
      ]);
    } catch (e) {
      console.warn("Local settings save failed:", e);
    }

    if (!this.user) return;
    try {
      const userDocRef = this._fb.doc(this._fb.db, "users", this.user.uid);
      await this._fb.setDoc(userDocRef, dataToSave, { merge: true });
      if (this.$.syncStatusTime) {
        this.$.syncStatusTime.textContent = new Date().toLocaleTimeString(this.language || "en");
      }
    } catch (e) {
      console.error("Error writing settings to cloud:", e);
      this.showToast("Failed to save settings to cloud: " + (e.message || "Network error"), "error");
    }
  }

  async deleteCloudUserData() {
    if (!this.user) return;
    if (
      !confirm(
        "Are you sure you want to delete all your cloud data? This cannot be undone.",
      )
    )
      return;
    try {
      const userDocRef = this._fb.doc(this._fb.db, "users", this.user.uid);
      await this._fb.deleteDoc(userDocRef);
      this.showToast("Cloud data deleted successfully.", "success");
      this.toggleSettingsPanel(false);
      await this.signOutUser();
    } catch (e) {
      console.error("Error deleting cloud data:", e);
      this.showToast("Could not delete cloud data: " + (e.message || "Unknown error"), "error");
    }
  }

  toggleAccountDialog(force) {
    if (!this.$.accountDialog) return;
    const isHidden = this.$.accountDialog.classList.contains("hidden");
    const show = force !== undefined ? force : isHidden;
    if (show) {
      this.pushHistoryOverlay("account");
    } else {
      this.popHistoryOverlay("account");
    }
    this.$.accountDialog.classList.toggle("hidden", !show);
  }

  toggleSettingsPanel(force) {
    if (!this.$.settingsPanel) return;
    const isHidden = this.$.settingsPanel.classList.contains("hidden");
    const show = force !== undefined ? force : isHidden;
    if (show) {
      this.pushHistoryOverlay("settings");
      this.$.settingsPanel.classList.remove("hidden");
      if (typeof translateDOM === "function") {
        translateDOM(this.$.settingsPanel, this.language || detectLocale());
      }
      setTimeout(() => this.$.settingsPanel.classList.add("open"), 10);
    } else {
      this.popHistoryOverlay("settings");
      this.$.settingsPanel.classList.remove("open");
      setTimeout(() => this.$.settingsPanel.classList.add("hidden"), 400);
    }
  }

  toggleTimelineMinimized(minimize) {
    if (minimize) {
      this.$.timelineFullContent?.classList.add("hidden");
      this.$.timelineMinimizedTrigger?.classList.remove("hidden");
    } else {
      this.$.timelineFullContent?.classList.remove("hidden");
      this.$.timelineMinimizedTrigger?.classList.add("hidden");
    }
  }

  updateSettingsUIFromLocal() {
    if (this.$.settingsUnitsToggle) {
      this.$.settingsUnitsToggle.checked =
        WeatherService.getUnits() === "imperial";
    }
    if (this.$.settingsThemeToggle) {
      this.$.settingsThemeToggle.checked = this.isDark;
    }
    if (this.$.settingsSyncHistoryToggle) {
      this.$.settingsSyncHistoryToggle.checked = this.syncHistory;
    }
    if (this.$.settingsSoundToggle) {
      this.$.settingsSoundToggle.checked = this.audioActive || false;
    }
    if (this.$.settingsVolumeSlider) {
      this.$.settingsVolumeSlider.value = Math.round(
        (this.volumeLevel || 0.5) * 100,
      );
    }
    if (this.$.settingsTimeline24hToggle) {
      this.$.settingsTimeline24hToggle.checked = this.timeline24hMode;
    }

    const hasUser = !!this.user;
    if (this.$.setDefaultLocationBtn) {
      this.$.setDefaultLocationBtn.disabled = this.selectedLat == null;
      if (this.selectedLat != null) {
        this.$.setDefaultLocationBtn.classList.remove("hidden");
      } else {
        this.$.setDefaultLocationBtn.classList.add("hidden");
      }
    }
    if (this.$.defaultLocationNotifyContainer) {
      // Always visible; toggle disabled until a home location is set
      this.$.defaultLocationNotifyContainer.classList.remove("hidden");
    }
    if (this.$.defaultLocationNotifyToggle) {
      this.$.defaultLocationNotifyToggle.disabled = !this.defaultLocation;
      this.$.defaultLocationNotifyToggle.checked = this.defaultLocationNotify;
    }
    if (this.$.defaultLocationNotifyHint) {
      if (this.defaultLocation) {
        const sendingTpl = t("sending_hourly_updates", this.language) || "Sending hourly updates for %s.";
        this.$.defaultLocationNotifyHint.textContent = sendingTpl.includes("%s")
          ? sendingTpl.replace("%s", this.defaultLocation.name)
          : `${sendingTpl} ${this.defaultLocation.name}.`;
        this.$.defaultLocationNotifyHint.classList.remove("text-slate-500", "dark:text-slate-400");
        this.$.defaultLocationNotifyHint.classList.add("text-primary");
      } else {
        this.$.defaultLocationNotifyHint.textContent =
          t("set_home_to_enable_notifications", this.language) ||
          "Set a home location first to enable hourly weather notifications.";
        this.$.defaultLocationNotifyHint.classList.add("text-slate-500", "dark:text-slate-400");
        this.$.defaultLocationNotifyHint.classList.remove("text-primary");
      }
    }
    if (this.$.notifyIntervalSelect) {
      this.$.notifyIntervalSelect.value = String(this.notifyIntervalMin || 60);
      this.$.notifyIntervalSelect.disabled = !this.defaultLocationNotify;
    }
    if (this.$.defaultLocationStatus) {
      if (this.defaultLocation) {
        this.setSafeHTML(
          this.$.defaultLocationStatus,
          `<span class="text-emerald-500">📍</span> <strong>${this.defaultLocation.name}</strong> <span class="opacity-60">(${this.defaultLocation.lat.toFixed(2)}, ${this.defaultLocation.lng.toFixed(2)})</span>${hasUser ? "" : ' <span class="opacity-60">(local)</span>'}`,
        );
      } else {
        const noDefText = t("no_default_location_status", this.language) || "No default location set. Click map and set current.";
        this.$.defaultLocationStatus.textContent = `📍 ${noDefText.replace(/^📍\s*/, "")}`;
      }
    }
  }

  setupHourlyNotifications() {
    if (this.hourlyNotificationTimer) {
      clearInterval(this.hourlyNotificationTimer);
      this.hourlyNotificationTimer = null;
    }

    if (this.defaultLocation && this.defaultLocationNotify) {
      const intervalMs = (this.notifyIntervalMin || 60) * 60 * 1000;
      this.checkAndSendHourlyNotification();
      this.hourlyNotificationTimer = setInterval(() => {
        this.checkAndSendHourlyNotification();
      }, intervalMs);
      this.registerPeriodicSync();
    } else {
      this.unregisterPeriodicSync();
    }
  }

  async checkAndSendHourlyNotification(forceImmediate = false) {
    if (!this.defaultLocation || !this.defaultLocationNotify) return;
    if (!("Notification" in window) || Notification.permission !== "granted")
      return;

    const now = Date.now();
    const storageKey = "last_weather_notification_time";
    let lastNotified = localStorage.getItem(storageKey);
    if (!lastNotified) {
      const idbTime = await localforage.getItem(
        "last_weather_notification_time",
      );
      if (idbTime) lastNotified = idbTime.toString();
    }

    if (!forceImmediate && lastNotified) {
      const timeDiff = now - parseInt(lastNotified, 10);
      const minGap = (this.notifyIntervalMin || 60) * 60 * 1000;
      if (timeDiff < minGap - 5 * 60 * 1000) {
        return;
      }
    }

    try {
      const forecast = await WeatherService.fetchForecast(
        this.defaultLocation.lat,
        this.defaultLocation.lng,
      );
      const currentHourIdx = WeatherService.getCurrentHourIndex(forecast);
      const hourWeather = WeatherService.getHourlyAtIndex(
        forecast,
        currentHourIdx,
      );

      if (!hourWeather) return;

      const isFahrenheit = WeatherService.getUnits() === "imperial";
      const tempVal = isFahrenheit
        ? (hourWeather.temperature * 9) / 5 + 32
        : hourWeather.temperature;
      const tempStr = `${tempVal.toFixed(1)}°${isFahrenheit ? "F" : "C"}`;

      const dayTemps = forecast.daily?.temperature_2m_max ?? [];
      const nightTemps = forecast.daily?.temperature_2m_min ?? [];
      const todayHigh =
        dayTemps[0] != null
          ? isFahrenheit
            ? ((dayTemps[0] * 9) / 5 + 32).toFixed(1)
            : dayTemps[0].toFixed(1)
          : "--";
      const todayLow =
        nightTemps[0] != null
          ? isFahrenheit
            ? ((nightTemps[0] * 9) / 5 + 32).toFixed(1)
            : nightTemps[0].toFixed(1)
          : "--";

      const weatherInfo = WeatherService.getWeatherInfo(
        hourWeather.weatherCode,
        hourWeather.isDay,
      );
      const desc = weatherInfo ? weatherInfo.description : "Unknown conditions";
      const emoji = weatherInfo?.icon || "🌡️";

      const title = `Weather Update: ${this.defaultLocation.name}`;
      const options = {
        body: `${emoji} ${desc} | ${tempStr} (H:${todayHigh}° L:${todayLow}°) | Humidity: ${hourWeather.humidity}% | Wind: ${hourWeather.windSpeed} | UV: ${hourWeather.uvIndex} | Precip: ${hourWeather.precipProb}%`,
        icon: "favicon.svg",
        badge: "favicon.svg",
        tag: "aurafisky-hourly-weather",
        renotify: true,
      };

      if (
        "serviceWorker" in navigator &&
        Notification.permission === "granted"
      ) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(title, options);
        localStorage.setItem(storageKey, now.toString());
        await localforage.setItem("last_weather_notification_time", now);
      } else if (Notification.permission === "granted") {
        new Notification(title, options);
        localStorage.setItem(storageKey, now.toString());
        await localforage.setItem("last_weather_notification_time", now);
      }
    } catch (e) {
      console.error("Error fetching weather for notification:", e);
    }
  }

  async registerPeriodicSync() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ("periodicSync" in registration) {
          await registration.periodicSync.register("hourly-weather-update", {
            minInterval: (this.notifyIntervalMin || 60) * 60 * 1000,
          });
          console.log("Periodic sync registered successfully");
        }
      } catch (error) {
        const name = error?.name || "";
        const msg = String(error?.message || "");
        const ignorable =
          name === "UnknownError" ||
          name === "NotAllowedError" ||
          name === "InvalidStateError" ||
          /periodic sync/i.test(msg);
        if (!ignorable) {
          console.warn("Periodic sync registration failed:", error);
        }
      }
    }
  }

  async unregisterPeriodicSync() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ("periodicSync" in registration) {
          // Only log if a sync was actually registered (avoids noise on every
          // load when notifications/default-location aren't enabled).
          const tags = await registration.periodicSync.getTags();
          if (tags.includes("hourly-weather-update")) {
            await registration.periodicSync.unregister("hourly-weather-update");
            console.log("Periodic sync unregistered");
          }
        }
      } catch (error) {
        const name = error?.name || "";
        const msg = String(error?.message || "");
        const ignorable =
          name === "UnknownError" ||
          name === "NotAllowedError" ||
          name === "InvalidStateError" ||
          /periodic sync/i.test(msg);
        if (!ignorable) {
          console.warn("Periodic sync unregister failed:", error);
        }
      }
    }
  }

  // ── Web Push (FCM) ──────────────────────────────────────────
  // Registers an FCM token so a backend can send true background push
  // notifications (works on iOS Safari too, unlike Periodic Background Sync).
  async initPushNotifications() {
    if (!this._fb?.messaging) return;
    if (!this.firebaseConfig.vapidKey) {
      console.info(
        "FCM VAPID key not set — web push disabled. (This is normal for local development)",
      );
      return;
    }
    if (!("Notification" in window)) {
      console.warn("Notifications unsupported — web push disabled.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      this.fcmToken = await this._fb.getToken(this._fb.messaging, {
        vapidKey: this.firebaseConfig.vapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!this.fcmToken) return;
      await localforage.setItem("fcmToken", this.fcmToken);
      await this.saveFcmTokenToCloud();
      // Foreground (tab open): show a toast instead of a system notification
      this._fb.onMessage(this._fb.messaging, (payload) => {
        const title = payload?.notification?.title || "Aurafisky";
        const body =
          payload?.notification?.body ||
          payload?.data?.body ||
          "Weather update available";
        this.showToast(`${title}: ${body}`, "info");
      });
      this.showToast("Background push notifications enabled.", "success");
    } catch (e) {
      console.warn("FCM token registration failed:", e);
    }
  }

  async saveFcmTokenToCloud() {
    if (!this.user || !this.fcmToken) return;
    try {
      const userDocRef = this._fb.doc(this._fb.db, "users", this.user.uid);
      await this._fb.setDoc(
        userDocRef,
        { fcmTokens: [this.fcmToken] },
        { merge: true },
      );
    } catch (e) {
      console.warn("Failed to save FCM token to cloud:", e);
    }
  }

  getSavedMapLanguage() {
    try {
      const saved = localStorage.getItem("mapLanguage");
      if (saved) return saved;
    } catch (e) {
      // ignore
    }
    return null;
  }

  getNativeMapLanguage() {
    return this.language && this.language !== 'en' ? this.language : 'native';
  }

  setMapLanguage(lang) {
    this.mapLanguage = lang;
    try {
      localStorage.setItem("mapLanguage", lang);
    } catch (e) {
      // ignore
    }
    this.updateMapLanguageUI();
    this._applyMapLanguage();
    this.saveUserDataToCloud();
  }

  updateMapLanguageUI() {
    const isEnglish = this.mapLanguage === 'en';
    const langNames = {
      native: 'Native',
      kn: 'Kannada', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', mr: 'Marathi',
      bn: 'Bengali', gu: 'Gujarati', ml: 'Malayalam', pa: 'Punjabi', or: 'Odia',
      sa: 'Sanskrit', as: 'Assamese', ur: 'Urdu', ne: 'Nepali', si: 'Sinhala',
      zh: 'Chinese', 'zh-CN': 'Chinese', 'zh-TW': 'Chinese', ja: 'Japanese',
      ko: 'Korean', ar: 'Arabic', es: 'Spanish', fr: 'French', de: 'German',
      it: 'Italian', pt: 'Portuguese', ru: 'Russian', id: 'Indonesian', tr: 'Turkish',
      vi: 'Vietnamese', th: 'Thai', nl: 'Dutch', pl: 'Polish', uk: 'Ukrainian',
      el: 'Greek', he: 'Hebrew', sv: 'Swedish', sw: 'Swahili', tl: 'Filipino',
      ms: 'Malay', fa: 'Persian',
    };
    const mapLanguageName = isEnglish
      ? 'English'
      : (langNames[this.mapLanguage] || langNames[this.mapLanguage?.split(/[-_]/)[0]] || this.mapLanguage || 'Native');
    
    // Update settings panel checkbox
    if (this.$.settingsMapLanguageToggle) {
      this.$.settingsMapLanguageToggle.checked = !isEnglish; // checked = app locale or local names
      this.$.settingsMapLanguageToggle.setAttribute(
        'aria-label',
        `Map labels in ${isEnglish ? 'English' : mapLanguageName}`,
      );
      this.$.settingsMapLanguageToggle.title = `Map labels in ${isEnglish ? 'English' : mapLanguageName}`;
    }

    // Also update the legacy top bar button if it exists (for backwards compat)
    const btn = document.getElementById("mapLanguageToggle");
    if (btn) {
      btn.textContent = isEnglish ? '🌐 EN' : `🌐 ${mapLanguageName}`;
      btn.setAttribute('aria-label', isEnglish ? `Switch map labels to ${this.language && this.language !== 'en' ? mapLanguageName : 'native'}` : 'Switch map labels to English');
      btn.title = isEnglish ? `Map labels: English (click for ${mapLanguageName})` : `Map labels: ${mapLanguageName} (click for English)`;
    }
  }

  applyUniversalTranslation(lang) {
    if (!lang || typeof document === "undefined") return;
    const target = lang === "zh-CN" ? "zh-CN" : lang;

    // Set standard googtrans cookie so page and dynamic content are translated
    try {
      const host = window.location.hostname;
      document.cookie = `googtrans=/en/${target}; path=/;`;
      if (host && host !== "localhost") {
        document.cookie = `googtrans=/en/${target}; path=/; domain=.${host};`;
      }
    } catch (_) {}

    const syncWidgetLocale = (attempt = 0) => {
      const combo = document.querySelector(".goog-te-combo");
      if (combo) {
        // Read the latest selection here instead of capturing the language
        // from the first call while the translation widget is still loading.
        const activeLocale = detectLocale();
        if (combo.value !== activeLocale) {
          combo.value = activeLocale;
          combo.dispatchEvent(new Event("change"));
        }
      } else if (attempt < 40) {
        window.setTimeout(() => syncWidgetLocale(attempt + 1), 150);
      }
    };

    const combo = document.querySelector(".goog-te-combo");
    if (combo) {
      if (combo.value !== target) {
        combo.value = target;
        combo.dispatchEvent(new Event("change"));
      }
    } else if (target !== "en" && !window.__googleTranslateInitialized) {
      // Lazy load Google translation for prose and feature output that does
      // not yet have a first-party translation string.
      window.__googleTranslateInitialized = true;
      window.googleTranslateElementInit = () => {
        try {
          new window.google.translate.TranslateElement({
            pageLanguage: "en",
            autoDisplay: false,
            includedLanguages: supportedLocales().join(","),
          }, "google_translate_element");
          syncWidgetLocale();
        } catch (_) {}
      };
      const s = document.createElement("script");
      s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      s.async = true;
      document.head.appendChild(s);
    } else if (window.__googleTranslateInitialized) {
      // A prior language selection may have started loading the widget. Keep
      // polling briefly so rapid locale changes cannot leave it on an old one.
      syncWidgetLocale();
    }
  }

  applyLanguage(lang) {
    if (!lang) return;
    setLocale(lang);
    this.language = lang;
    try {
      localStorage.setItem("aurafisky_lang", lang);
    } catch (_) { /* ignore */ }
    document.documentElement.lang = lang;
    if (lang === "ar" || lang === "he" || lang === "fa" || lang === "ur") {
      document.documentElement.dir = "rtl";
    } else {
      document.documentElement.dir = "ltr";
    }

    // Keep vector-map labels in the selected app locale. Tiles that do not
    // carry that locale's translated name fall back to their local name and
    // then English (see modules/map-language.js).
    this.setMapLanguage(lang);

    const title = document.querySelector("title");
    if (title) title.textContent = `${t("app_name", lang)} — ${t("app_tagline", lang)}`;
    if (this.$.searchInput) {
      // Keep the source placeholder stable across language switches. Without
      // this, translateDOM can remember the first selected locale as the source
      // and leave the search field stuck in that language on later changes.
      this.$.searchInput.setAttribute("data-orig-placeholder", "Search a city...");
      this.$.searchInput.placeholder = t("search_placeholder", lang);
      this.$.searchInput.setAttribute("aria-label", t("search_placeholder", lang));
    }
    const voiceSearchBtn = document.getElementById("voiceSearchBtn");
    if (voiceSearchBtn) {
      voiceSearchBtn.title = t("search_by_voice", lang) || "Search by voice";
      voiceSearchBtn.setAttribute("aria-label", t("search_by_voice", lang) || "Search by voice");
    }

    // 1. Update Weather Tab Labels
    const tabMap = {
      overview: t("tab_overview", lang) || "Overview",
      hourly: t("tab_hourly", lang) || "Hourly",
      daily: t("tab_daily", lang) || "7-Day",
      metrics: t("tab_metrics", lang) || "Details & AQI",
      astronomy: t("tab_astronomy", lang) || "Astronomy",
      farm: t("tab_farm", lang) || "🌾 Farm",
    };
    document.querySelectorAll(".weather-tab-btn").forEach((btn) => {
      const tab = btn.dataset.tab;
      if (tabMap[tab]) btn.textContent = tabMap[tab];
    });

    // 2. Update Bottom Navigation Labels
    const homeLabel = document.querySelector("#mobileNavHomeBtn span.text-\\[11px\\]");
    if (homeLabel) homeLabel.textContent = t("nav_home", lang) || "Set Home";
    const routeLabel = document.querySelector("#mobileNavRouteBtn span.text-\\[11px\\]");
    if (routeLabel) routeLabel.textContent = t("nav_route", lang) || "Route Weather";
    const favLabel = document.querySelector("#mobileNavFavsBtn span.text-\\[11px\\]");
    if (favLabel) favLabel.textContent = t("nav_favs", lang) || "Favourites";

    // 3. Update Header quick chip pills
    const chipAskAura = document.querySelector('.mobile-quick-chip[data-category="aura"] span:last-child');
    if (chipAskAura) chipAskAura.textContent = t("chip_ask_aura", lang) || "Ask Aura";
    const chipRadar = document.querySelector('.mobile-quick-chip[data-category="radar"] span:last-child');
    if (chipRadar) chipRadar.textContent = t("chip_rain_radar", lang) || "Rain Radar";
    const chipRoute = document.querySelector('.mobile-quick-chip[data-category="route-weather"] span:last-child');
    if (chipRoute) chipRoute.textContent = t("chip_route_weather", lang) || "Route Weather";

    // 4. Update Settings Labels
    const appLangLabel = document.getElementById("settingsAppLanguageLabel");
    if (appLangLabel) appLangLabel.textContent = t("settings_app_language", lang) || "App language";
    const appLangSub = document.getElementById("settingsAppLanguageSub");
    if (appLangSub) appLangSub.textContent = t("settings_app_language_sub", lang) || "All features & tabs";

    // 5. Update Weather Card Actions and Header Titles
    const copyBtn = document.getElementById("copyAddressBtnText");
    if (copyBtn) copyBtn.textContent = t("copy", lang) || "Copy";
    const detailsBtn = document.getElementById("toggleAddressCardText");
    if (detailsBtn) detailsBtn.textContent = t("details", lang) || "Details";
    const briefingBtn = document.getElementById("briefingBtn");
    if (briefingBtn) briefingBtn.textContent = `📡 ${t("generate_briefing", lang) || "Generate Briefing"}`;
    const discHeader = document.getElementById("discoveriesHeaderTitle");
    if (discHeader) discHeader.textContent = t("live_weather_intelligence_safety", lang) || "Live Weather Intelligence & Safety";

    // 6. Sync Settings dropdown value
    const langSelect = this.$.settingsAppLanguageSelect || document.getElementById("settingsAppLanguageSelect");
    if (langSelect && langSelect.value !== lang) {
      langSelect.value = lang;
    }

    // 6b. Re-render Astronomy tab if initialized
    if (typeof this.updateCelestialBodies === "function") {
      try { this.updateCelestialBodies(new Date()); } catch (_) {}
    }

    // 7. Re-render active tab if Farm so crop guide updates
    if (typeof this.renderFarmTab === "function") {
      try { this.renderFarmTab(this); } catch (_) {}
    }

    // 8. Re-render weather display if forecast data is present
    if (this.weatherData && typeof this.updateWeatherDisplay === "function") {
      this.updateWeatherDisplay(typeof this.currentHourIndex === "number" ? this.currentHourIndex : 0);
    }

    // 8b. Re-render Smart To-dos with fresh translations
    if (typeof this.renderSmartTodos === "function") {
      try { this.renderSmartTodos(); } catch (_) {}
    }

    // 8c. Update Map Key & Legend UI
    if (typeof this.updateMapLegendUI === "function") {
      try { this.updateMapLegendUI(); } catch (_) {}
    }

    // 9. Re-render timeline if initialized
    if (this.weatherData && typeof this.initTimeline === "function") {
      this.initTimeline();
    }

    // 10. Run deep recursive DOM translation across the full active document
    if (typeof translateDOM === "function") {
      translateDOM(document.body, lang);
    }

    // 11. Re-translate Settings Panel if open or present
    if (this.$.settingsPanel && typeof translateDOM === "function") {
      translateDOM(this.$.settingsPanel, lang);
    }
    if (this.$.setDefaultLocationBtn) {
      this.$.setDefaultLocationBtn.textContent = t("set_here", lang) || "Set here";
    }
    const installBtnLabel = document.getElementById("installBtnLabel");
    if (installBtnLabel) {
      installBtnLabel.textContent = t("install_app", lang) || "Install Aurafisky App";
    }
    const termsTitle = document.getElementById("termsTitle");
    if (termsTitle) {
      termsTitle.textContent = t("terms_privacy", lang) || "Terms & Privacy";
    }

    // 11b. Update Settings UI local status and hints
    if (typeof this.updateSettingsUIFromLocal === "function") {
      this.updateSettingsUIFromLocal();
    }

    // 11c. Re-translate Route Studio if open
    const routePanel = document.getElementById("routePanel");
    if (routePanel && typeof translateDOM === "function") {
      translateDOM(routePanel, lang);
    }

    // UI panels and form fields are rendered lazily after startup. Translate
    // newly inserted content with the active app locale so fields stay in sync
    // without each feature needing its own language-change hook.
    if (!this._languageMutationObserver && typeof MutationObserver !== "undefined" && document.body) {
      this._languageMutationObserver = new MutationObserver((records) => {
        const addedNodes = new Set();
        const changedAttributes = new Set();
        for (const record of records) {
          if (record.type === "childList") {
            for (const node of record.addedNodes) addedNodes.add(node);
          } else if (record.type === "attributes") {
            changedAttributes.add(record.target);
          }
        }
        if (!this.language || typeof translateDOM !== "function") return;
        for (const node of addedNodes) {
          if (node.isConnected) translateDOM(node, this.language);
        }
        for (const node of changedAttributes) {
          if (!node.isConnected) continue;
          // App code can replace a field's source placeholder/title after it was
          // first translated. Refresh the saved source only when the new value
          // is not the active locale's translation of the saved source.
          for (const attr of ["placeholder", "title", "aria-label", "aria-description", "aria-placeholder", "alt", "value"]) {
            const current = node.getAttribute?.(attr);
            if (!current) continue;
            if (attr === "value" && !/^(button|submit)$/i.test(node.type || "")) continue;
            const originalKey = `data-orig-${attr}`;
            const savedSource = node.getAttribute(originalKey);
            if (savedSource && current !== translateText(savedSource, this.language)) {
              node.setAttribute(originalKey, current);
            }
          }
          translateDOM(node, this.language);
        }
      });
      this._languageMutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ["placeholder", "title", "aria-label", "aria-description", "aria-placeholder", "alt", "value"],
      });
    }

    // 12. Reset Aura if open
    if (this.aura && this.aura.isOpen) {
      this.aura.reset();
    }
  }

  setLanguage(lang) {
    if (!setLocale(lang)) return false;
    this.language = lang;
    this.applyLanguage(lang);
    this.applyUniversalTranslation(lang);
    if (typeof this.saveUserDataToCloud === "function") {
      this.saveUserDataToCloud();
    }
    const langNames = {
      en: "English", kn: "ಕನ್ನಡ (Kannada)", hi: "हिन्दी (Hindi)",
      ta: "தமிழ் (Tamil)", te: "తెలుగు (Telugu)", mr: "मराठी (Marathi)",
      bn: "বাংলা (Bengali)", gu: "ગુજરાતી (Gujarati)", ml: "മലയാളം (Malayalam)",
      es: "Español", fr: "Français", de: "Deutsch", ja: "日本語", ar: "العربية",
      pt: "Português", ru: "Русский", "zh-CN": "简体中文"
    };
    const selectedLanguageName = this.$.settingsAppLanguageSelect?.selectedOptions?.[0]?.textContent?.trim();
    this.showToast?.(`Language: ${langNames[lang] || selectedLanguageName || lang.toUpperCase()}`, "info");
    return true;
  }

  /**
   * Swap the active vector basemap layer group when light/dark theme
   * changes. Both groups were already styled (with the current language) in
   * initMap(), so this is just an add/remove — no re-fetching.
   */
  _switchBasemapTheme() {
    if (!this.map || !this.lightBasemap || !this.darkBasemap) return;
    if (this.isDark) {
      this.mapStyle = 'dark';
      try { localStorage.setItem("aurafisky_map_style", "dark"); } catch (_) {}
    } else {
      if (this.mapStyle === 'dark') {
        this.mapStyle = 'street';
        try { localStorage.setItem("aurafisky_map_style", "street"); } catch (_) {}
      }
    }
    this._updateActiveBasemap();
    this._updateMapStyleUI();
  }

  setMapStyle(style) {
    const validStyles = ['street', 'satellite', 'terrain', 'hillshade', 'opentopo', 'ocean', 'natgeo', 'dark'];
    if (!validStyles.includes(style)) style = 'street';
    this.mapStyle = style;
    try {
      localStorage.setItem("aurafisky_map_style", style);
    } catch (_) {}

    // Sync opacity slider if visible
    const opacitySlider = document.getElementById("mapOpacitySlider");
    const opacityValue = document.getElementById("mapOpacityValue");
    if (opacitySlider && opacityValue) {
      opacitySlider.value = Math.round(this.mapOpacity * 100);
      opacityValue.textContent = `${Math.round(this.mapOpacity * 100)}%`;
    }

    // Synchronize dark theme: only in darkmode tabs/UI should be in dark, not in other map modes
    if (style === "dark") {
      if (!this.isDark) {
        this.isDark = true;
        document.documentElement.classList.add("dark");
        document.documentElement.setAttribute("data-theme", "dark");
        try { localStorage.setItem("aurafisky_theme", "dark"); } catch (_) {}
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = "#0f172a";
        this.updateSettingsUIFromLocal?.();
        this.saveUserDataToCloud?.();
        this.syncBus?.syncTheme?.(true);
      }
    } else {
      if (this.isDark) {
        this.isDark = false;
        document.documentElement.classList.remove("dark");
        document.documentElement.removeAttribute("data-theme");
        try { localStorage.setItem("aurafisky_theme", "light"); } catch (_) {}
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.content = "#6366f1";
        this.updateSettingsUIFromLocal?.();
        this.saveUserDataToCloud?.();
        this.syncBus?.syncTheme?.(false);
      }
    }

    this._updateActiveBasemap();
    this._updateMapStyleUI();
    const styleNames = {
      street: "Default (Street)",
      satellite: "Satellite (Aerial)",
      terrain: "Terrain (Topographic)",
      hillshade: "Hillshade (Elevation)",
      opentopo: "OpenTopoMap",
      ocean: "Ocean (Bathymetry)",
      natgeo: "National Geographic",
      dark: "Dark"
    };
    this.showToast(`Map mode: ${styleNames[style] || style}`, "info");
  }

  _updateActiveBasemap() {
    if (!this.map) return;
    const styleGroups = {
      street: this.lightBasemap,
      dark: this.darkBasemap,
      satellite: this.satelliteBasemap,
      terrain: this.terrainBasemap,
      hillshade: this.hillshadeBasemap,
      opentopo: this.openTopoBasemap,
      ocean: this.oceanBasemap,
      natgeo: this.natGeoBasemap
    };
    const targetGroup = styleGroups[this.mapStyle] || (this.isDark ? this.darkBasemap : this.lightBasemap);
    const allGroups = [this.lightBasemap, this.darkBasemap, this.satelliteBasemap, this.terrainBasemap, this.hillshadeBasemap, this.openTopoBasemap, this.oceanBasemap, this.natGeoBasemap];
    const layers = this.map.getLayers();

    allGroups.forEach((g) => {
      if (g) {
        g.setVisible(false);
        while (layers.getArray().includes(g)) {
          layers.remove(g);
        }
      }
    });

    if (targetGroup) {
      targetGroup.setVisible(true);
      if (typeof targetGroup.getLayers === "function") {
        targetGroup.getLayers().forEach((l) => {
          if (typeof l.setVisible === "function") l.setVisible(true);
        });
      }
      layers.insertAt(0, targetGroup);
    }
    this.map.render();

    // Apply opacity and terrain overlay
    this._applyMapOpacity();
    this._applyTerrainOverlay();
  }

  /** Apply map opacity to all base layers */
  _applyMapOpacity() {
    if (!this.map) return;
    const opacity = (typeof this.mapOpacity === "number" && !isNaN(this.mapOpacity)) ? this.mapOpacity : 1;
    const layers = this.map.getLayers().getArray();
    layers.forEach(layer => {
      if (layer instanceof LayerGroup) {
        layer.getLayers().forEach((l) => {
          if (typeof l.setOpacity === "function") {
            l.setOpacity(opacity);
          }
        });
      }
    });
  }

  /** Apply terrain overlay layer */
  _applyTerrainOverlay() {
    if (!this.map) return;
    const layers = this.map.getLayers();

    if (this.terrainOverlayEnabled) {
      // Add terrain overlay layer on top of current base layer
      if (!this.terrainOverlayLayer) {
        this.terrainOverlayLayer = new LayerGroup({
          layers: [
            new TileLayer({
              source: new XYZ({
                url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
                maxZoom: 16,
                crossOrigin: "anonymous",
                attributions: "Tiles &copy; Esri &mdash; USGS, NGA, NASA, CGIAR, NCEAS, NLS, OS, NMA, Geodatastyrelsen, GSA, GSI, GIS, NOAA, NOAA NGDC"
              }),
              opacity: 0.4,
              preload: 1
            })
          ]
        });
      }
      // Add terrain overlay on top of basemap
      if (!layers.getArray().includes(this.terrainOverlayLayer)) {
        const insertIdx = Math.min(1, layers.getLength());
        layers.insertAt(insertIdx, this.terrainOverlayLayer);
      }
    } else {
      // Remove terrain overlay layer
      if (this.terrainOverlayLayer && layers.getArray().includes(this.terrainOverlayLayer)) {
        layers.remove(this.terrainOverlayLayer);
      }
    }
    this.map.render();
  }

  /** Toggle terrain overlay layer (alias for backward compatibility) */
  _toggleTerrainOverlay() {
    return this._applyTerrainOverlay();
  }

  _updateMapStyleUI() {
    const cards = document.querySelectorAll(".map-style-card");
    cards.forEach((card) => {
      const match = card.getAttribute("data-map-style") === this.mapStyle;
      card.classList.toggle("active", match);
      card.setAttribute("aria-selected", match ? "true" : "false");
    });

    if (this.$.settingsMapStyleSelect) {
      this.$.settingsMapStyleSelect.value = this.mapStyle;
    }

    if (this.$.mapLayersBtn) {
      const isCustom = this.mapStyle !== "street" && this.mapStyle !== "dark";
      this.$.mapLayersBtn.classList.toggle("layers-active", isCustom);
    }

    this._updateMapLayersActiveBadge();
    this._updateMapColorLegend?.();
  }

  toggleMapLayersFlyout(force) {
    if (!this.$.mapLayersFlyout) return;
    const isHidden = this.$.mapLayersFlyout.classList.contains("hidden");
    const open = force !== undefined ? force : isHidden;
    this.$.mapLayersFlyout.classList.toggle("hidden", !open);
    this.$.mapLayersBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    this.$.mobileNavLayersBtn?.classList.toggle("active", open);
    const backdrop = document.getElementById("mapLayersBackdrop");
    if (backdrop) {
      backdrop.classList.toggle("hidden", !open);
    }
    if (open) {
      this.$.mapLayersFlyout.classList.remove("minimized");
      this.pushHistoryOverlay("layers");
      this._updateMapStyleUI();
      this._updateMapLayersActiveBadge();
      if (this.selectedLat != null && this.selectedLng != null) {
        this.updateMarineFloodUI?.(this.selectedLat, this.selectedLng);
      }
    } else {
      this.popHistoryOverlay("layers");
    }
  }

  toggleMapLayersMinimized(force) {
    if (!this.$.mapLayersFlyout) return;
    const isMinimized = this.$.mapLayersFlyout.classList.contains("minimized");
    const target = force !== undefined ? force : !isMinimized;
    this.$.mapLayersFlyout.classList.toggle("minimized", target);
    this.mapLayersMinimized = target;
    try {
      localStorage.setItem("aurafisky_map_layers_minimized", String(target));
    } catch (_) {}
    const minBtn = this.$.minimizeMapLayersBtn;
    if (minBtn) {
      minBtn.setAttribute("title", target ? "Expand map modes" : "Minimize map modes");
      minBtn.setAttribute("aria-label", target ? "Expand map modes" : "Minimize map modes");
      minBtn.setAttribute("aria-expanded", target ? "false" : "true");
    }
    this._updateMapLayersActiveBadge();
    this._updateMapColorLegend?.();
  }

  _updateMapLayersActiveBadge() {
    const styleNames = {
      street: "🗺️ Default",
      satellite: "🛰️ Satellite",
      terrain: "🏔️ Terrain",
      hillshade: "⛰️ Hillshade",
      opentopo: "🧭 OpenTopo",
      ocean: "🌊 Ocean",
      natgeo: "🌍 NatGeo",
      dark: "🌙 Dark",
    };
    const badge = document.getElementById("mapLayersActiveBadge");
    if (badge) {
      badge.textContent = styleNames[this.mapStyle] || this.mapStyle || "Default";
    }
    const dropdown = document.getElementById("mapModeSelectDropdown");
    if (dropdown && dropdown.value !== this.mapStyle) {
      dropdown.value = this.mapStyle;
    }
  }

  cycleMapStyle(direction = 1) {
    const validStyles = ['street', 'satellite', 'terrain', 'hillshade', 'opentopo', 'ocean', 'natgeo', 'dark'];
    let idx = validStyles.indexOf(this.mapStyle);
    if (idx === -1) idx = 0;
    const nextIdx = (idx + direction + validStyles.length) % validStyles.length;
    this.setMapStyle(validStyles[nextIdx]);
  }

  /**
   * Re-style OpenFreeMap's OpenMapTiles vector labels for the selected app
   * locale. Where a requested-language field exists it is preferred, then
   * local and English names are used as fallbacks. See localizeGlStyle in
   * modules/map-language.js. This updates cities, roads, POIs and water
   * client-side without fetching new tiles.
   */
  _applyMapLanguage() {
    const theme = this.isDark ? "dark" : "light";
    const group = this.isDark ? this.darkBasemap : this.lightBasemap;
    const rawStyle = this._glStyles?.[theme];
    // Style hasn't finished loading yet — nothing to re-style. initMap()
    // already applies the current this.mapLanguage once the fetch resolves,
    // so there's no missed update, just nothing to do yet.
    if (!group || !rawStyle) return;

    const localized = localizeGlStyle(rawStyle, this.mapLanguage);
    for (const vtLayer of getMapboxLayers(group, "openmaptiles")) {
      applyMapboxLayerStyle(vtLayer, localized, "openmaptiles").catch((err) =>
        console.error("Map language re-style failed:", err),
      );
    }
  }

  /** Toggle live temperature grid overlay */
  toggleTemperatureOverlay(forceState) {
    if (typeof forceState === "boolean") {
      this.temperatureOverlayEnabled = forceState;
    } else {
      this.temperatureOverlayEnabled = !this.temperatureOverlayEnabled;
    }

    if (this.temperatureOverlayEnabled) {
      this.initTempOverlayLayers?.();
      this.showToast?.("🌡️ Live temperature grid loaded on map", "info");
    } else {
      this.clearTempOverlay?.();
      this.showToast?.("Temperature grid cleared", "info");
    }

    const toggle = document.getElementById("tempGridOverlayToggle");
    if (toggle) toggle.checked = this.temperatureOverlayEnabled;

    this._updateMapColorLegend();
  }

  /** Initialize the on-map color indication & legend widget */
  _initMapColorLegend() {
    this.$.mapLegendPillBtn = document.getElementById("mapLegendPillBtn");
    this.$.mapLegendCard = document.getElementById("mapLegendCard");
    this.$.mapLegendCloseBtn = document.getElementById("mapLegendCloseBtn");
    this.$.mapLegendSwitchModeBtn = document.getElementById("mapLegendSwitchModeBtn");
    this.$.mapColorLegendWidget = document.getElementById("mapColorLegendWidget");
    this.$.tempGridOverlayToggle = document.getElementById("tempGridOverlayToggle");
    this.$.toggleMapLegendCardBtn = document.getElementById("toggleMapLegendCardBtn");

    if (this.$.mapLegendPillBtn) {
      this.$.mapLegendPillBtn.addEventListener("click", () => {
        const isHidden = this.$.mapLegendCard?.classList.contains("hidden");
        this.$.mapLegendCard?.classList.toggle("hidden", !isHidden);
        this.$.mapLegendPillBtn?.setAttribute("aria-expanded", isHidden ? "true" : "false");
        this._haptic?.("selection");
      });
    }

    if (this.$.mapLegendCloseBtn) {
      this.$.mapLegendCloseBtn.addEventListener("click", () => {
        this.$.mapLegendCard?.classList.add("hidden");
        this.$.mapLegendPillBtn?.setAttribute("aria-expanded", "false");
        this._haptic?.("selection");
      });
    }

    if (this.$.mapLegendSwitchModeBtn) {
      this.$.mapLegendSwitchModeBtn.addEventListener("click", () => {
        this._haptic?.("selection");
        const isTempActive = Boolean(this.temperatureOverlayEnabled || (this.radarActive && this.overlayType === "temperature"));
        if (isTempActive) {
          this.toggleTemperatureOverlay(false);
          this.setMapStyle("opentopo");
        } else {
          this.toggleTemperatureOverlay(true);
        }
      });
    }

    this._updateMapColorLegend();
  }

  /** Update on-map color indication widget based on active layers & map modes */
  _updateMapColorLegend() {
    const widget = document.getElementById("mapColorLegendWidget");
    if (!widget) return;

    const isTempActive = Boolean(this.temperatureOverlayEnabled || (this.radarActive && this.overlayType === "temperature"));
    const isElevationActive = ["opentopo", "terrain", "hillshade"].includes(this.mapStyle) || Boolean(this.terrainOverlayEnabled);

    // Synchronize flyout toggle
    const tempToggle = document.getElementById("tempGridOverlayToggle");
    if (tempToggle) tempToggle.checked = isTempActive;

    // Synchronize flyout elevation hint
    const elevHint = document.getElementById("mapModeElevationHint");
    if (elevHint) {
      elevHint.classList.toggle("hidden", !isElevationActive && !["opentopo", "terrain", "hillshade"].includes(this.mapStyle));
    }

    const pillIcon = document.getElementById("mapLegendPillIcon");
    const pillTitle = document.getElementById("mapLegendPillTitle");
    const pillSwatches = document.getElementById("mapLegendPillSwatches");
    const cardIcon = document.getElementById("mapLegendCardIcon");
    const cardTitle = document.getElementById("mapLegendCardTitle");
    const cardSubtitle = document.getElementById("mapLegendCardSubtitle");
    const notification = document.getElementById("mapLegendNotification");
    const gradientBar = document.getElementById("mapLegendGradientBar");
    const gradientLabels = document.getElementById("mapLegendGradientLabels");
    const swatchesList = document.getElementById("mapLegendSwatchesList");
    const switchModeIcon = document.getElementById("mapLegendSwitchModeIcon");
    const switchModeText = document.getElementById("mapLegendSwitchModeText");

    if (isTempActive) {
      // ── Temperature Mode ──
      widget.classList.remove("hidden");
      if (pillIcon) pillIcon.textContent = "🌡️";
      if (pillTitle) pillTitle.textContent = "Temperature Scale";
      if (pillSwatches) {
        pillSwatches.innerHTML = `
          <span class="w-2.5 h-2.5 rounded-full bg-[#1d4ed8]" title="Cold (<10°C)"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#16a34a]" title="Mild (10-22°C)"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#eab308]" title="Warm (22-28°C)"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#ea580c]" title="Hot (28-35°C)"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#dc2626]" title="Extreme (>35°C)"></span>
        `;
      }
      if (cardIcon) cardIcon.textContent = "🌡️";
      if (cardTitle) cardTitle.textContent = "Live Temperature Scale";
      if (cardSubtitle) cardSubtitle.textContent = "Ground Air Temperature (°C)";
      if (notification) {
        notification.className = "px-2.5 py-1.5 rounded-xl bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/30 text-[11px] font-medium text-blue-900 dark:text-blue-200 leading-snug";
        notification.innerHTML = "<span>🌡️ <strong>Active:</strong> Color circles denote <strong>Air Temperature</strong> across the region.</span>";
      }
      if (gradientBar) {
        gradientBar.style.background = "linear-gradient(90deg, #1d4ed8, #0284c7, #16a34a, #eab308, #ea580c, #dc2626)";
      }
      if (gradientLabels) {
        gradientLabels.innerHTML = "<span>&lt; 5°C (Cold)</span><span>22°C (Mild)</span><span>&gt; 38°C (Extreme)</span>";
      }
      if (swatchesList) {
        swatchesList.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#1d4ed8] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">&lt; 10°C</strong> (&lt; 50°F) · Cold / Chilly</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#16a34a] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">10°C – 22°C</strong> (50°F – 72°F) · Mild &amp; Pleasant</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#eab308] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">22°C – 28°C</strong> (72°F – 82°F) · Warm</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#ea580c] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">28°C – 35°C</strong> (82°F – 95°F) · Hot</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#dc2626] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">&gt; 35°C</strong> (&gt; 95°F) · Very Hot / Extreme Heat</span>
          </div>
        `;
      }
      if (switchModeIcon) switchModeIcon.textContent = "🧭";
      if (switchModeText) switchModeText.textContent = "Switch to Elevation Relief";

    } else if (isElevationActive) {
      // ── Elevation Relief Mode ──
      widget.classList.remove("hidden");
      if (pillIcon) pillIcon.textContent = "🧭";
      if (pillTitle) pillTitle.textContent = "Elevation Key";
      if (pillSwatches) {
        pillSwatches.innerHTML = `
          <span class="w-2.5 h-2.5 rounded-full bg-[#388e3c]" title="Lowlands (0-200m)"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#8bc34a]" title="Hills (200-500m)"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#f57c00]" title="Plateaus (500-1000m)"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#d32f2f]" title="Peaks (>1000m)"></span>
        `;
      }
      if (cardIcon) cardIcon.textContent = "🧭";
      if (cardTitle) cardTitle.textContent = "Topographic Elevation";
      if (cardSubtitle) cardSubtitle.textContent = "Height Above Sea Level (Relief)";
      if (notification) {
        notification.className = "px-2.5 py-1.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-amber-900 dark:text-amber-200 leading-snug";
        notification.innerHTML = "<span>⚠️ <strong>Notice:</strong> Red, orange &amp; green shades denote <strong>Elevation</strong> above sea level, not temperature.</span>";
      }
      if (gradientBar) {
        gradientBar.style.background = "linear-gradient(90deg, #388e3c, #8bc34a, #fbc02d, #f57c00, #d32f2f, #795548)";
      }
      if (gradientLabels) {
        gradientLabels.innerHTML = "<span>0 m (Coast)</span><span>500 m</span><span>1,500 m+ (Peaks)</span>";
      }
      if (swatchesList) {
        swatchesList.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#388e3c] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">0 – 200 m</strong> (0 – 650 ft) · Coastal lowlands &amp; plains</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#8bc34a] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">200 – 500 m</strong> (650 – 1,600 ft) · Foothills &amp; river valleys</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#f57c00] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">500 – 1,000 m</strong> (1,600 – 3,300 ft) · Tablelands &amp; plateaus</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#d32f2f] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">&gt; 1,000 m</strong> (&gt; 3,300 ft) · Mountain ridges &amp; peaks</span>
          </div>
        `;
      }
      if (switchModeIcon) switchModeIcon.textContent = "🌡️";
      if (switchModeText) switchModeText.textContent = "Show Live Temperature Grid";

    } else {
      // ── Standard Basemap (Street/Satellite) ──
      widget.classList.remove("hidden");
      if (pillIcon) pillIcon.textContent = "🗺️";
      if (pillTitle) pillTitle.textContent = "Map Key";
      if (pillSwatches) {
        pillSwatches.innerHTML = `
          <span class="w-2.5 h-2.5 rounded-full bg-[#388e3c]" title="Lowlands"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#f57c00]" title="Plateau"></span>
          <span class="w-2.5 h-2.5 rounded-full bg-[#d32f2f]" title="Peaks"></span>
        `;
      }
      if (cardIcon) cardIcon.textContent = "🗺️";
      if (cardTitle) cardTitle.textContent = "Map Color Legend";
      if (cardSubtitle) cardSubtitle.textContent = "Elevation &amp; Temperature Keys";
      if (notification) {
        notification.className = "px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300 leading-snug";
        notification.innerHTML = "<span>Switch between <strong>Topographic Elevation</strong> relief and <strong>Live Temperature Grid</strong> overlays.</span>";
      }
      if (gradientBar) {
        gradientBar.style.background = "linear-gradient(90deg, #388e3c, #8bc34a, #fbc02d, #f57c00, #d32f2f, #795548)";
      }
      if (gradientLabels) {
        gradientLabels.innerHTML = "<span>0 m (Coast)</span><span>500 m</span><span>1,500 m+ (Peaks)</span>";
      }
      if (swatchesList) {
        swatchesList.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#388e3c] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">Green</strong>: Coastal plains &amp; lowlands (0-200m)</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#f57c00] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">Orange</strong>: Plateaus &amp; tablelands (500-1000m)</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#d32f2f] flex-shrink-0"></span>
            <span class="text-slate-600 dark:text-slate-300"><strong class="text-slate-900 dark:text-slate-100">Red</strong>: High mountain peaks (&gt;1000m)</span>
          </div>
        `;
      }
      if (switchModeIcon) switchModeIcon.textContent = "🌡️";
      if (switchModeText) switchModeText.textContent = "Show Live Temperature Grid";
    }

    if (this.language && this.language !== "en" && typeof translateDOM === "function") {
      translateDOM(widget, this.language);
    }
  }
}

// ── Instantiate App ─────────────────────────────────────────────
// app.js is an ES module (deferred), so DOMContentLoaded may have
// already fired by the time this evaluates. Instantiate immediately
// if the DOM is ready, otherwise wait for it.
function bootAurafisky() {
  try {
    window.app = new AurafiskyApp();
    window.addEventListener("beforeunload", () => {
      if (window.app?.destroy) window.app.destroy();
    });

    // ── Web Share Target ──────────────────────────────
    // Handle "Share → Aurafisky" from Google Maps / other apps.
    // The OS opens /share-target?text=...&url=... and we load that location.
    const shareParams = new URLSearchParams(window.location.search);
    const shareText = shareParams.get("text") || "";
    const shareUrl = shareParams.get("url") || "";

    if (shareText || shareUrl) {
      const mapsMatch = shareUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (mapsMatch) {
        // Google Maps URL with embedded coordinates — load directly
        window.app.selectLocation(
          parseFloat(mapsMatch[1]),
          parseFloat(mapsMatch[2]),
          shareText || "Shared location",
        );
      } else if (shareText) {
        // Place name — geocode via Open-Meteo
        const WS = typeof WeatherService !== "undefined" ? WeatherService : globalThis.WeatherService;
        if (WS?.searchLocations) {
          WS.searchLocations(shareText).then((results) => {
            if (results.length > 0) {
              const best = results[0];
              window.app.selectLocation(
                best.latitude,
                best.longitude,
                best.displayName || best.name,
              );
            } else {
              window.app.showToast?.(`Couldn't find "${shareText}"`, "error");
            }
          });
        }
      }
      // Clean the share-target params from the URL bar
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (err) {
    console.error("Failed to boot Aurafisky:", err);
    const ov = document.getElementById("loadingOverlay");
    if (ov) {
      ov.innerHTML = `<div class="text-center p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm mx-4"><p class="text-rose-500 font-semibold mb-2">Startup Error</p><p class="text-sm text-slate-600 dark:text-slate-400 mb-4">${err.message || 'An error occurred during startup.'}</p><button id="bootRetryBtn" class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90">Retry</button></div>`;
      ov.querySelector("#bootRetryBtn")?.addEventListener("click", () => location.reload());
    }
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAurafisky);
} else {
  bootAurafisky();
}
