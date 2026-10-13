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

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
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
import { fromLonLat, toLonLat } from "ol/proj.js";
import { apply as applyMapboxStyle, applyStyle as applyMapboxLayerStyle, getLayers as getMapboxLayers } from "ol-mapbox-style";
import { HtmlMarker } from "./modules/ol-marker.js";
import { localizeGlStyle } from "./modules/map-language.js";
import localforage from "localforage";
import DOMPurify from "dompurify";

localforage.config({
  name: "aurafisky",
  storeName: "aurafisky_store",
  description: "Aurafisky bookmarks, settings, and cached weather data",
});

if (typeof window !== "undefined") {
  if (!window.localforage) window.localforage = localforage;
  if (!window.DOMPurify) window.DOMPurify = DOMPurify;
}

import './weather.js';
import './modules/dom-utils.js';
import './modules/toast.js';
import './src/icons.js';
import { initFeatures } from './features/registry.js';

const WEATHER_WALLPAPERS = {
  clear_day: [
    "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80",
  ],
  clear_night: [
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1509773896068-7fd415d91e2e?auto=format&fit=crop&w=1920&q=80",
  ],
  cloudy_day: [
    "https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1499346030926-9a72daac6c63?auto=format&fit=crop&w=1920&q=80",
  ],
  cloudy_night: [
    "https://images.unsplash.com/photo-1532978379173-523e16f371f2?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=1920&q=80",
  ],
  rain: [
    "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1534274988757-a28bf1a57c17?auto=format&fit=crop&w=1920&q=80",
  ],
  storm: [
    "https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1509114397022-ed747cca3f65?auto=format&fit=crop&w=1920&q=80",
  ],
  snow: [
    "https://images.unsplash.com/photo-1483921020237-2ff51e8e4b22?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1491002052546-bf38f186af56?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1516431883659-655d41c09bf9?auto=format&fit=crop&w=1920&q=80",
  ],
  fog: [
    "https://images.unsplash.com/photo-1487621167305-5d248087c724?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1485236715568-ddc5ee6ca227?auto=format&fit=crop&w=1920&q=80",
    "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1920&q=80",
  ],
};

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
    this.searchHighlightIndex = -1; // Keyboard nav index in search results

    // Bookmark map markers
    this.bookmarkMarkers = []; // Leaflet markers for bookmarked locations
    this.showBookmarksOnMap = localStorage.getItem("aurafisky_show_bookmarks_map") !== "false";

    // Sunrise countdown timer
    this.sunCountdownTimer = null;
    this.thunderInterval = null;
    this.birdsInterval = null;

    // Minimal mode
    this.minimalMode = false;

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
    this.wallpaperPhotoEnabled = true; // Scenic photo background (enabled by default with silky transitions)
    this._activePhotoLayer = "A"; // Active cross-fade photo layer ("A" or "B")
    this._currentWallpaperUrl = ""; // Current wallpaper URL to prevent redundant transitions
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
      compactExpandBtn: document.getElementById("compactExpandBtn"),
      favoriteToggleBtn: document.getElementById("favoriteToggleBtn"),
      starOutlineIcon: document.getElementById("starOutlineIcon"),
      starFilledIcon: document.getElementById("starFilledIcon"),
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
      weatherPanelContent: document.getElementById("weatherPanelContent"),
      weatherPanelTabs: document.getElementById("weatherPanelTabs"),
      overviewAQIChip: document.getElementById("overviewAQIChip"),
      overviewWindChip: document.getElementById("overviewWindChip"),
      overviewHumidityChip: document.getElementById("overviewHumidityChip"),
      mobileBottomNav: document.getElementById("mobileBottomNav"),
      mobileNavMapBtn: document.getElementById("mobileNavMapBtn"),
      mobileNavWeatherBtn: document.getElementById("mobileNavWeatherBtn"),
      mobileNavRouteBtn: document.getElementById("mobileNavRouteBtn"),
      mobileNavSavedBtn: document.getElementById("mobileNavSavedBtn"),
      mobileNavLayersBtn: document.getElementById("mobileNavLayersBtn"),

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

      // SVG Sparkline
      trendSvg: document.getElementById("trendSvg"),
      chartHours: document.getElementById("chartHours"),
      chartLine: document.getElementById("chartLine"),
      chartArea: document.getElementById("chartArea"),
      chartPoints: document.getElementById("chartPoints"),

      // Panel details
      panelLocationName: document.getElementById("panelLocationName"),
      panelCoordinates: document.getElementById("panelCoordinates"),
      panelTimeLabel: document.getElementById("panelTimeLabel"),
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
      wallpaperPhotoA: document.getElementById("wallpaperPhotoA"),
      wallpaperPhotoB: document.getElementById("wallpaperPhotoB"),
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
      settingsCompactToggle: document.getElementById("settingsCompactToggle"),
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
    window.addEventListener("error", (e) => {
      console.error("Unhandled error:", e.error || e.message);
    });
    window.addEventListener("unhandledrejection", (e) => {
      const msg = e.reason?.message || String(e.reason || "");
      if (
        msg.includes("message channel closed") ||
        msg.includes("listener indicated an asynchronous response")
      ) {
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
      initialDark = localStorage.getItem("aurafisky_theme") === "dark";
    } catch (e) {
      // ignore — storage unavailable, fall back to light
    }
    this.isDark = initialDark;
    document.documentElement.classList.toggle("dark", this.isDark);

    // Attach feature-module methods (radar, bookmarks, audio, canvas effects, etc.)
    // eagerly and synchronously, before anything below binds an event handler or
    // calls one directly — avoids a load-order race where a listener could fire
    // before its handler method exists (see features/registry.js).
    initFeatures(this);

    // Load bookmarks (in-memory until cloud sync)
    this.loadBookmarks();
    this.startBookmarkAlertPolling();

    // Setup OpenLayers map viewport
    this.initMap();

    // Setup Particle Canvas Overlay
    this.initWeatherCanvas();

    // Bind event handlers
    this.bindEvents();
    this.initKeyboardShortcuts();
    this.initWeatherPanelTabs();
    this.initMobileBottomNav();

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

  // Set --app-height to the true visible viewport height so layout using
  // var(--app-height, 100vh) is never clipped behind mobile browser chrome.
  _updateAppHeight() {
    const h = window.visualViewport
      ? window.visualViewport.height
      : window.innerHeight;
    document.documentElement.style.setProperty("--app-height", `${h}px`);
    // Also set visual viewport height for search dropdown
    document.documentElement.style.setProperty("--visual-viewport-height", `${h}px`);
    this.map?.updateSize();
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
        // This is a weather map, not a navigation tool — nothing in the UI
        // ever rotates it back, so an accidental two-finger twist on mobile
        // or Alt+Shift-drag on desktop just leaves the map stuck sideways
        // with no way back short of a reload. Drop both rotate gestures;
        // every other default interaction (pan, zoom, keyboard) stays.
        interactions: defaultInteractions({
          altShiftDragRotate: false,
          pinchRotate: false,
        }),
      });

      // Language preference: 'en' for English, 'native' for each place's local name
      this.mapLanguage = this.getSavedMapLanguage() || 'en';

      // Map style preference: 'street' | 'satellite' | 'terrain' | 'dark'
      const savedMapStyle = localStorage.getItem("aurafisky_map_style");
      this.mapStyle = savedMapStyle || (this.isDark ? "dark" : "street");

      this.lightBasemap = new LayerGroup();
      this.darkBasemap = new LayerGroup();

      // Satellite basemap: High-resolution Esri World Imagery + Reference Boundaries & Places
      // maxZoom is set to 18 so OpenLayers oversamples high-res imagery instead of requesting
      // level 19+ tiles from Esri which lack global coverage and serve "Map data not yet available" placeholders.
      this.satelliteBasemap = new LayerGroup({
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 18,
              crossOrigin: "anonymous",
              attributions: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
              tileLoadFunction: (tile, src) => {
                fetch(src)
                  .then((res) => {
                    if (!res.ok) throw new Error("Tile fetch failed");
                    return res.blob();
                  })
                  .then((blob) => {
                    // Esri serves a ~2521 byte dummy tile with "Map data not yet available"
                    // when coverage is absent at extreme zooms. Intercept and replace with transparent pixel.
                    if (blob.size <= 3200 && blob.type.includes("jpeg")) {
                      tile.getImage().src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
                    } else {
                      tile.getImage().src = URL.createObjectURL(blob);
                    }
                  })
                  .catch(() => {
                    tile.getImage().src = src;
                  });
              }
            }),
            preload: 1
          }),
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 18,
              crossOrigin: "anonymous"
            }),
            opacity: 0.95,
            preload: 1
          })
        ]
      });

      // Terrain basemap: Esri World Topo Map with mountain hillshading, contours, and physical relief
      this.terrainBasemap = new LayerGroup({
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 18,
              crossOrigin: "anonymous",
              attributions: "Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, USGS, FAO, NPS, NRCAN"
            }),
            preload: 1
          })
        ]
      });

      const initialGroup = {
        street: this.lightBasemap,
        dark: this.darkBasemap,
        satellite: this.satelliteBasemap,
        terrain: this.terrainBasemap
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

      // Belt-and-braces for browsers without ResizeObserver, and for CSS that
      // lands between construction and the observer's first callback.
      setTimeout(() => this.map && this.map.updateSize(), 100);
      setTimeout(() => this.map && this.map.updateSize(), 500);
      setTimeout(() => this.map && this.map.updateSize(), 1500);

      // Re-fit the map when the mobile URL bar shows/hides (visual viewport)
      if (window.visualViewport) {
        const onVV = () => {
          this.map && this.map.updateSize();
          // Update CSS variable for search dropdown positioning
          document.documentElement.style.setProperty('--visual-viewport-height', `${window.visualViewport.height}px`);
        };
        window.visualViewport.addEventListener("resize", onVV);
        window.visualViewport.addEventListener("scroll", onVV);
        // Initial set
        onVV();
      }
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

    // ── Bookmarks Favorites ───────────────────────────────────
    this.$.bookmarksBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.$.bookmarksDropdown.classList.toggle("hidden");
      this._haptic('selection');
    });

    // Map Language Toggle
    this.$.mapLanguageToggle?.addEventListener("click", () => {
      const newLang = this.mapLanguage === 'en' ? 'native' : 'en';
      this.setMapLanguage(newLang);
      this._haptic('selection');
    });

    this.$.closeBookmarksBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.$.bookmarksDropdown.classList.add("hidden");
      this._haptic('selection');
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
    this.$.homeToggleBtn.addEventListener("click", () => {
      // Set/move/remove home to the currently selected location.
      // (Navigating to home uses the home marker click.)
      this.toggleHomeLocation();
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
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 300000 }
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
    this.$.panelMinimizeBtn?.addEventListener("click", () => {
      this.toggleMinimizeWeatherPanel();
      this._haptic('selection');
    });
    // Compact expand button — exits compact mode
    this.$.compactExpandBtn?.addEventListener("click", () => {
      this.toggleMinimalMode();
      this._haptic('light');
    });
    this.$.compareCloseBtn.addEventListener("click", () => {
      this.hideComparePanel();
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
    if (this.$.settingsCompactToggle) {
      this.$.settingsCompactToggle.addEventListener("change", () => {
        this.toggleMinimalMode();
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
        const newLang = e.target.checked ? 'native' : 'en';
        this.setMapLanguage(newLang);
        this._haptic('selection');
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
      // Light haptic on slider snap points (every 6 hours)
      if (Math.abs(val - _lastSliderVal) >= 6) {
        this._haptic('selection');
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
    this.$.resetViewBtn?.addEventListener("click", () => this.resetView());
    this.$.radarToggleBtn.addEventListener("click", () => {
      this.toggleRadar();
      this._haptic('light');
    });

    this.$.navigateHereBtn?.addEventListener("click", () => {
      this.startNavigationPreview();
      this._haptic('light');
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
        this.$.radarCollapsedBtn.classList.remove("hidden");
        this._haptic('selection');
      });
      this.$.radarCollapsedBtn.addEventListener("click", () => {
        this.$.radarCollapsedBtn.classList.add("hidden");
        this.$.radarExpandedPanel.classList.remove("hidden");
        this._haptic('selection');
      });
    }
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
    this.$.timeMachineTrigger.addEventListener("click", () => {
      this.toggleClimateTimeMachine();
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

    // ── Keyboard Shortcuts ───────────────────────────────────
    this.$.searchInput.addEventListener("keydown", (e) =>
      this.handleSearchKeyboard(e),
    );
    this._boundKeydown = (e) => {
      if (e.key === "Escape") {
        this.$.searchDropdown.classList.remove("open");
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
      } else if (this.$.searchResults.children.length > 0) {
        this.$.searchDropdown.classList.add("open");
      }
    };
    this.$.searchInput.addEventListener("focus", this._boundSearchFocus);

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
    this._boundBeforeInstall = (e) => {
      e.preventDefault(); // store prompt for manual trigger from Settings
      this.deferredPrompt = e;
      this.$.installBtn?.classList.remove("hidden");
      if (this.$.installBtnLabel) this.$.installBtnLabel.textContent = "Install Aurafisky App";
    };
    window.addEventListener("beforeinstallprompt", this._boundBeforeInstall);

    // iOS Safari has no beforeinstallprompt — surface the manual
    // "Add to Home Screen" instruction instead so iPhone/iPad users
    // can still install the app.
    if (this._isIOS && !this._isInStandalone && this.$.installBtn) {
      this.$.installBtn.classList.remove("hidden");
      if (this.$.installBtnLabel) this.$.installBtnLabel.textContent = "Add to Home Screen";
    }

    window.addEventListener("appinstalled", () => {
      this.deferredPrompt = null;
      this.$.installBtn?.classList.add("hidden");
    });

    // ── Document click (close overlays) ─────────────────────
    this._boundDocClick = (e) => {
      if (
        !e.target.closest("#searchInput") &&
        !e.target.closest("#searchDropdown")
      ) {
        this.$.searchDropdown.classList.remove("open");
      }
      if (
        !e.target.closest("#bookmarksBtn") &&
        !e.target.closest("#bookmarksDropdown")
      ) {
        this.$.bookmarksDropdown.classList.add("hidden");
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
        const isMapTouch = e.target.closest("#map") || e.target.closest("#weatherPanel");
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

    // ── Swipe-down to dismiss weather panel (mobile) ─────────────
    this._panelTouchStartY = 0;
    this._panelTouchActive = false;
    const panel = this.$.weatherPanel;
    if (panel) {
      panel.addEventListener(
        "touchstart",
        (e) => {
          if (e.touches.length !== 1) return;
          this._panelTouchStartY = e.touches[0].clientY;
          this._panelTouchActive = true;
        },
        { passive: true },
      );
      panel.addEventListener(
        "touchmove",
        (e) => {
          if (!this._panelTouchActive || e.touches.length !== 1) return;
          const dy = e.touches[0].clientY - this._panelTouchStartY;
          // Don't drag if panel is minimized
          if (this.$.weatherPanel.classList.contains("minimized")) return;
          // Only handle if panel is open and at top of scroll
          if (
            this.$.weatherPanel.classList.contains("open") &&
            this.$.weatherPanelContent.scrollTop === 0 &&
            dy > 0
          ) {
            e.preventDefault();
            this.$.weatherPanel.style.transform = `translateY(${dy}px)`;
            this.$.weatherPanel.style.transition = "none";
            // Add dragging class for visual feedback
            if (dy > 20) {
              this.$.weatherPanel.classList.add("dragging");
            }
          }
        },
        { passive: false },
      );
      panel.addEventListener(
        "touchend",
        (e) => {
          if (!this._panelTouchActive) return;
          const dy = e.changedTouches[0].clientY - this._panelTouchStartY;
          this._panelTouchActive = false;
          this.$.weatherPanel.style.transition = "";
          this.$.weatherPanel.classList.remove("dragging");
          // If minimized, don't apply drag-to-dismiss
          if (this.$.weatherPanel.classList.contains("minimized")) return;
          if (dy > 100) {
            this.hideWeatherPanel();
          } else {
            this.$.weatherPanel.style.transform = "";
          }
        },
        { passive: true },
      );
    }

    // Initialize desktop panel dragging & position persistence
    this.initDesktopPanelDragging();

    // ── Haptic feedback helper ─────────────────────────────────────
    this._haptic = (type = 'light') => {
      if (!navigator.vibrate) return;
      const patterns = {
        light: [5],
        medium: [10],
        heavy: [20],
        selection: [2],
        success: [10, 50, 10],
        warning: [20, 50, 20],
        error: [30, 30, 30, 30, 50],
      };
      navigator.vibrate(patterns[type] || patterns.light);
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
      });
    };
    window.addEventListener("resize", this._boundResize);
  }

  // ── Desktop Panel Dragging & Position Persistence ──────────────
  initDesktopPanelDragging() {
    const panel = this.$.weatherPanel;
    if (!panel) return;

    this._restoreDesktopPanelPosition();

    const dragHandle = document.getElementById("panelDragHandle") || panel.firstElementChild;
    if (!dragHandle) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onMouseDown = (e) => {
      if (window.innerWidth < 768 || e.button !== 0) return;
      if (e.target.closest("button, input, a, select")) return;

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

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      const maxLeft = window.innerWidth - panel.offsetWidth - 10;
      const maxTop = window.innerHeight - panel.offsetHeight - 10;

      newLeft = Math.max(10, Math.min(newLeft, maxLeft));
      newTop = Math.max(10, Math.min(newTop, maxTop));

      panel.style.left = `${newLeft}px`;
      panel.style.top = `${newTop}px`;
    };

    const onMouseUp = () => {
      if (!isDragging) return;
      isDragging = false;
      panel.classList.remove("dragging-desktop");
      document.body.style.userSelect = "";

      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      const pos = { left: parseInt(panel.style.left, 10), top: parseInt(panel.style.top, 10) };
      localStorage.setItem("aurafisky_desktop_panel_pos", JSON.stringify(pos));
    };

    dragHandle.addEventListener("mousedown", onMouseDown);

    // Double-click drag handle to reset panel position to default
    dragHandle.addEventListener("dblclick", (e) => {
      if (window.innerWidth < 768) return;
      if (e.target.closest("button, input, a, select")) return;
      localStorage.removeItem("aurafisky_desktop_panel_pos");
      panel.style.left = "";
      panel.style.top = "";
      panel.style.right = "";
      panel.style.bottom = "";
      this.showToast("Restored weather card to default position", "info");
    });
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
          const maxLeft = window.innerWidth - 380;
          const maxTop = window.innerHeight - 300;
          const left = Math.max(10, Math.min(pos.left, maxLeft));
          const top = Math.max(10, Math.min(pos.top, maxTop));

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
   */
  updateOnlineStatus(isOnline) {
    this.isOffline = !isOnline;
    const banner = this.$.offlineBanner;
    if (banner) {
      if (isOnline) {
        banner.classList.add("hidden");
        banner.className = "hidden fixed top-20 left-0 right-0 z-[1004] bg-amber-600 text-white text-center py-2 px-4 text-sm font-medium shadow-lg";
        if (this.selectedLat != null && !this._isFetching) {
          this.showToast("⚡ Network reconnected — refreshing weather...", "info");
          this.selectLocation(this.selectedLat, this.selectedLng, this.selectedName);
        }
      } else {
        const freshness = WeatherService.getFreshnessLabel(this.freshnessTimestamp);
        if (freshness.isExpired) {
          banner.textContent = `🚨 Offline: Weather data expired (${freshness.label}). Reconnect to update.`;
          banner.className = "fixed top-20 left-0 right-0 z-[1004] bg-rose-600 text-white text-center py-2 px-4 text-sm font-semibold shadow-lg";
        } else {
          banner.textContent = `⚠️ You are offline — showing cached data (${freshness.label})`;
          banner.className = "fixed top-20 left-0 right-0 z-[1004] bg-amber-600 text-white text-center py-2 px-4 text-sm font-medium shadow-lg";
        }
        banner.classList.remove("hidden");
      }
    }
  }

  // ================================================================
  //  GEOLOCATION & REVERSE SEARCH (Nominatim)
  // ================================================================

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
        }
        window.history.replaceState(null, "", url.toString());
      }
    } catch (e) {
      console.warn("Could not update URL search params:", e);
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
      if (changed) {
        window.history.replaceState(null, "", url.toString());
      }
    } catch (e) {
      console.warn("Could not clear URL search params:", e);
    }
  }

  _checkUrlParamsOnStartup() {
    try {
      const params = new URLSearchParams(window.location.search);
      const latStr = params.get("lat");
      const lngStr = params.get("lng");
      const nameStr = params.get("name");
      const wallpaperStr = params.get("wallpaper");

      if (latStr != null && lngStr != null) {
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          const name = nameStr ? decodeURIComponent(nameStr) : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          this.selectLocation(lat, lng, name);
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
    await this._loadLocalCache();

    // 1. Priority 1: Check if page was opened via a shared link URL (?lat=...&lng=...&name=...)
    if (this._checkUrlParamsOnStartup()) {
      return;
    }

    // 2. Priority 2: Restored previous session
    if (this._restoreSession()) {
      return;
    }

    // 3. Priority 3: Default Home location
    if (this.defaultLocation && this.defaultLocation.lat != null) {
      this.selectLocation(this.defaultLocation.lat, this.defaultLocation.lng, this.defaultLocation.name);
      return;
    }

    // 4. Priority 4: Geolocation fallback
    this.getMyLocation();
  }

  _restoreSession() {
    const saved = this._localCache?._lastSession;
    if (saved && saved.lat != null && saved.lng != null) {
      this.selectLocation(
        saved.lat,
        saved.lng,
        saved.name || `${saved.lat.toFixed(4)}, ${saved.lng.toFixed(4)}`,
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

  /**
   * Coarse geographic descriptor for a coordinate with no reverse-geocode
   * result — open ocean, ice sheet, empty desert.
   *
   * Deliberately coarse. Without a coastline dataset we cannot tell ice shelf
   * from sea at 85°S, so the polar cases say "Region" rather than inventing a
   * landmass, and the ocean basins use the rough IHO longitude boundaries.
   * The goal is a readable label, not a survey-grade one.
   *
   * @param {number} lat
   * @param {number} lng
   * @returns {string}
   */
  _describeCoordinates(lat, lng) {
    if (lat <= -60) return "Antarctic Region";
    if (lat >= 66.5) return "Arctic Region";

    // Normalise to -180..180 — the view is multiWorld, so a click three
    // worlds to the right arrives here as lng 900.
    const lon = ((((lng + 180) % 360) + 360) % 360) - 180;

    let basin;
    if (lon >= -70 && lon < 20) basin = "Atlantic Ocean";
    else if (lon >= 20 && lon < (lat < 0 ? 147 : 100)) basin = "Indian Ocean";
    else basin = "Pacific Ocean";

    if (basin === "Indian Ocean") return basin;
    return `${lat >= 0 ? "North" : "South"} ${basin}`;
  }

  async handleMapClick(lat, lng) {
      if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
        return;
      }
      const defaultName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      // Call selectLocation IMMEDIATELY on click so weather card opens/updates instantly (1st click)
      const selectPromise = this.selectLocation(lat, lng, defaultName);

      // Perform reverse geocoding asynchronously in background
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        // Nominatim serves permissive CORS headers, so call it directly. Routing
        // through a third-party proxy both violates our connect-src CSP and hands
        // the user's coordinates to an unaffiliated service.
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`,
          { signal: controller.signal },
        );
        clearTimeout(timeoutId);
        if (response.ok) {
          const data = await response.json();
          const addr = data.address;
          const sanitize = (str) => {
            if (typeof DOMPurify !== "undefined" && DOMPurify.sanitize)
              return DOMPurify.sanitize(String(str || ""));
            return String(str || "").replace(/[<>&]/g, "");
          };

          let locationName = "";
          if (addr) {
            const city = sanitize(
              addr.city ||
                addr.town ||
                addr.village ||
                addr.municipality ||
                addr.suburb ||
                addr.hamlet,
            );
            const state = sanitize(addr.state || addr.region || addr.county);
            const country = sanitize(addr.country);
            locationName =
              [city, state, country].filter(Boolean).join(", ") ||
              sanitize(data.display_name);
          }

          // Two thirds of the planet has no street address. Nominatim returns
          // nothing at all for open ocean and most of Antarctica, and the old
          // code just left the raw decimals in place — so the header, the
          // page title and the search bar all read "-85.0272, 52.8210". Fall
          // back to the geographic region so the location at least reads as a
          // place.
          if (!locationName) {
            locationName = sanitize(data.name) || this._describeCoordinates(lat, lng);
          }

          if (locationName && this.selectedLat === lat && this.selectedLng === lng) {
            this.selectedName = locationName;
            this._updateHeaderLocationAndCoords(locationName, lat, lng);
            this.updateOfflineBadge(false);
            this._persistSession(lat, lng, locationName);
          }
        }
      } catch (e) {
        console.warn("Nominatim reverse geocode lookup failed or timed out:", e);
      }

      await selectPromise;
    }

  _updateHeaderLocationAndCoords(name, lat, lng) {
    const targetName = name || this.selectedName || "Unknown Location";
    const targetLat = lat ?? this.selectedLat;
    const targetLng = lng ?? this.selectedLng;

    if (this.$.panelLocationName) {
      const existingBadge = this.$.panelLocationName.querySelector(".home-badge");
      this.$.panelLocationName.textContent = targetName;
      this.$.panelLocationName.title = targetName;
      if (existingBadge) {
        this.$.panelLocationName.appendChild(existingBadge);
      }
    }

    if (this.$.panelCoordinates && targetLat != null && targetLng != null && !isNaN(targetLat) && !isNaN(targetLng)) {
      const latDir = targetLat >= 0 ? "N" : "S";
      const lngDir = targetLng >= 0 ? "E" : "W";
      const latFormatted = Math.abs(targetLat).toFixed(4);
      const lngFormatted = Math.abs(targetLng).toFixed(4);
      this.$.panelCoordinates.textContent = `📍 ${latFormatted}° ${latDir}, ${lngFormatted}° ${lngDir}`;
      this.$.panelCoordinates.title = `Latitude: ${targetLat}, Longitude: ${targetLng}`;
    }
  }

  async selectLocation(lat, lng, name) {
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

      let weatherPopulated = false;

      this.selectedLat = lat;
      this.selectedLng = lng;
      this.selectedName = name;
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
      const targetZoom = Math.min(Math.max(view.getZoom(), 9), 17);
      view.animate({ center: fromLonLat([lng, viewCenterLat]), zoom: targetZoom });

      // Refresh UI panel state
      this._updateHeaderLocationAndCoords(name, lat, lng);
      this.$.panelTimeLabel.textContent = "Fetching weather...";

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

      // Show loading skeleton (#13)
      if (this.$.weatherPanelSkeleton && this.$.weatherPanelContent) {
        this.$.weatherPanelContent.classList.add("hidden");
        this.$.weatherPanelSkeleton.classList.remove("hidden");
      }

      this.showWeatherPanel();
      this.updateStarUI();

      // Close Time-Machine drawer when switching cities
      this.closeClimateTimeMachine();

      const cacheKey = `weathermap_cache_${lat.toFixed(3)}_${lng.toFixed(3)}`;

      try {
        if (this.isOffline) {
          throw new Error("Device is offline");
        }

        // Fetch forecast and Air Quality in parallel
        const [forecast, airQuality] = await Promise.all([
          WeatherService.fetchForecast(lat, lng),
          WeatherService.fetchAirQuality(lat, lng),
        ]);

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
        this._persistWeatherCache(cacheKey, {
          forecast,
          airQuality,
          ts: this.freshnessTimestamp,
          name,
        });

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

        // Refresh home badge and marker
        this.updateHomeButton();
        this.updateHomeMarker();

        // Hide loading skeleton and show main content (#13)
        if (this.$.weatherPanelSkeleton && this.$.weatherPanelContent) {
          this.$.weatherPanelContent.classList.remove("hidden");
          this.$.weatherPanelSkeleton.classList.add("hidden");
          requestAnimationFrame(() => {
            this.$.weatherPanelContent.scrollTop = 0;
          });
        }
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

          // Hide loading skeleton and show content even for cached recovery
          if (this.$.weatherPanelSkeleton && this.$.weatherPanelContent) {
            this.$.weatherPanelContent.classList.remove("hidden");
            this.$.weatherPanelSkeleton.classList.add("hidden");
            requestAnimationFrame(() => {
              this.$.weatherPanelContent.scrollTop = 0;
            });
          }
        } else {
          this.showToast(
            this.isOffline
              ? "You are offline and no cached data is available for this city."
              : "Could not fetch weather metrics. Please try again.",
            "error",
          );

          if (this.weatherData) {
            // Restore previous content view instead of leaving it stuck in skeleton
            if (this.$.weatherPanelSkeleton && this.$.weatherPanelContent) {
              this.$.weatherPanelContent.classList.remove("hidden");
              this.$.weatherPanelSkeleton.classList.add("hidden");
            }
          } else {
            this.hideWeatherPanel();
          }
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
    let nearestKey = null;
    let minDistance = 0.05;

    const cacheKeys = this._getCacheKeyList();
    for (const key of cacheKeys) {
      const parts = key.replace("weathermap_cache_", "").split("_");
      const cLat = parseFloat(parts[0]);
      const cLng = parseFloat(parts[1]);
      const distance = Math.hypot(cLat - lat, cLng - lng);
      if (distance < minDistance) {
        minDistance = distance;
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
        if (key && key.startsWith("weathermap_cache_")) localStorage.removeItem(key);
      }
      localStorage.removeItem("last_weather_notification_time");
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
          if (data.ts == null || data.ts < cutoff) localStorage.removeItem(key);
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
    return `
        <div class="weather-marker relative bg-white dark:bg-slate-800 rounded-2xl px-3.5 py-2.5 shadow-lg
                    border border-slate-200/60 dark:border-slate-600/30 text-center min-w-[80px]">
          <button type="button" class="marker-close-btn absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-100 hover:bg-rose-500 dark:bg-slate-700 dark:hover:bg-rose-500 text-slate-400 hover:text-white dark:text-slate-300 dark:hover:text-white flex items-center justify-center shadow-md transition-all border border-slate-200/80 dark:border-slate-600/80 cursor-pointer z-20" title="Close location" aria-label="Close location">
            <svg class="w-3 h-3 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
          <div class="text-2xl leading-none mb-1">${weather.icon}</div>
          <div class="text-lg font-bold text-slate-800 dark:text-white leading-tight">
            ${WeatherService.formatTemp(weather.temperature)}
          </div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-[90px]">
            ${weather.description}
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
        size: [90, 60],
        anchor: [45, 68],
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
    const weather = WeatherService.getHourlyAtIndex(
      this.weatherData,
      hourIndex,
    );
    if (!weather) return;

    // Header labels
    this._updateHeaderLocationAndCoords(this.selectedName, this.selectedLat, this.selectedLng);
    // Use the weather data's time for the selected hour, not current time
    this.$.panelTimeLabel.textContent = WeatherService.formatDateTime(
      weather.time,
      this.weatherData?.timezone,
      this.weatherData?.utc_offset_seconds
    );
    // Sync compact widget date/time display
    const compactDt = document.getElementById("compactDatetime");
    if (compactDt) compactDt.textContent = this.$.panelTimeLabel.textContent;

    // Weather type display (emoji — consistent with share/hourly/bookmark surfaces)
    this.$.panelIcon.textContent = weather.icon;
    this.$.panelTemp.textContent = WeatherService.formatTemp(
      weather.temperature,
    );
    this.$.panelTemp.className = `text-4xl font-extrabold ${WeatherService.getTempClass(weather.temperature)}`;
    this.$.panelDescription.textContent = weather.description;
    this.$.panelFeelsLike.textContent = `Feels like ${WeatherService.formatTemp(weather.feelsLike)}`;

    // Sync compact mode stats chips
    const highTemp = this.weatherData?.daily?.temperature_2m_max?.[0];
    const lowTemp = this.weatherData?.daily?.temperature_2m_min?.[0];
    const compactHighLow = document.getElementById("compactHighLow");
    if (compactHighLow) {
      if (highTemp != null && lowTemp != null) {
        compactHighLow.textContent = `H: ${WeatherService.formatTemp(highTemp)} · L: ${WeatherService.formatTemp(lowTemp)}`;
        compactHighLow.style.display = "";
      } else {
        compactHighLow.style.display = "none";
      }
    }
    const compactQuickStats = document.getElementById("compactQuickStats");
    if (compactQuickStats) {
      compactQuickStats.textContent = `💧 ${weather.humidity ?? "--"}% · 💨 ${WeatherService.formatWind(weather.windSpeed)}`;
    }

    // Grid panels (unit-aware)
    this.$.panelHumidity.textContent = `${weather.humidity ?? "--"}%`;
    this.$.panelWind.textContent = `${WeatherService.formatWind(weather.windSpeed)} ${WeatherService.getWindDirection(weather.windDirection)}`;
    this.$.panelPressure.textContent = WeatherService.formatPressure(
      weather.pressure,
    );
    this.$.panelClouds.textContent = `${weather.cloudCover ?? "--"}%`;
    this.$.panelUV.textContent =
      weather.uvIndex != null ? weather.uvIndex.toFixed(1) : "--";
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
    const advisories = WeatherService.getAdvisories(weather, aqiVal);
    this.renderAdvisoryBanner(advisories);

    // Sync Overview Quick Stats Chips
    this._updateOverviewChips(weather, aqiVal);

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

    // Wind shift detection
    const windShift = WeatherService.getWindShift(this.weatherData, hourIndex);
    if (windShift) {
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
      this.$.freshnessLabel.textContent = `📡 ${fresh.label}`;
      this.$.freshnessLabel.style.opacity = fresh.opacity;
    }

    // 15. Phase-space regime classifier
    const regime = WeatherService.classifyWeatherRegime(weather, tendency);
    if (regime && this.$.regimeLabel) {
      this.$.regimeLabel.textContent = `${regime.icon} ${regime.label}`;
      this.$.regimeLabel.className =
        "text-[10px] font-bold text-teal-500 dark:text-teal-400";
    }

    // 14. Spatial gradient
    const gradient = WeatherService.getSpatialGradient(
      this.selectedLat,
      this.selectedLng,
      weather.windDirection,
    );
    if (gradient && this.$.spatialGradLabel) {
      const warmDir = gradient.reduce((a, b) =>
        a.estTemp > b.estTemp ? a : b,
      );
      const coldDir = gradient.reduce((a, b) =>
        a.estTemp < b.estTemp ? a : b,
      );
      this.$.spatialGradLabel.textContent = `🌡️ ${warmDir.estTemp}°C ${warmDir.dir} → ${coldDir.estTemp}°C ${coldDir.dir} (est. gradient)`;
      this.$.spatialGradLabel.className = "text-[10px] text-slate-400";
    }

    // Update browser tab favicon + title dynamically
    this.updateWeatherFavicon(weather.weatherCode, weather.isDay);
    document.title = `${WeatherService.formatTemp(weather.temperature)} ${weather.icon} ${this.selectedName.split(",")[0]} — Aurafisky`;

    // Draw Astronomy Widget (Solar Arc + Moon Phase)
    this.updateAstronomyWidget(weather, hourIndex);

    // Keep the day/night terminator (if enabled) synced to whatever
    // instant the timeline is showing, not just wall-clock "now".
    if (this.terminatorEnabled) {
      this.updateDayNightTerminator(weather.time, this.weatherData?.utc_offset_seconds);
    }

    // Apply smooth color gradient theme depending on climate
    this.applyPanelWeatherTheme(weather.weatherCode, weather.isDay);

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

    // Temporal compression grid (replaces daily forecast with 3h block matrix)
    const matrices = WeatherService.getTemporalCompression(this.weatherData);
    this.renderTemporalGrid(matrices);

    // UV Index Forecast Chart
    this.renderUVChart();

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
    if (this.radarActive && this.overlayType === "temperature") {
      this.clearTempOverlay();
      this.initTempOverlayLayers();
    }

    // Init dashboard drag after weather data loads
    this.initDashboardDrag();

    // Keep the 🏠 Home badge in sync (panelLocationName text was reset above)
    this.updateHomeButton();
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

    const lat = this.selectedLat ?? 0;
    const lng = this.selectedLng ?? 0;
    const bgUrl = this.getWeatherWallpaperUrl(code, isDay, lat, lng);
    const panelBg = this.$.panelWeatherBg || document.getElementById("panelWeatherBg");
    if (panelBg) {
      panelBg.style.backgroundImage = `url("${bgUrl}")`;
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
      this.$.chartPoints.childNodes.length > 0
    )
      return;
    this._sparklineStart = startIdx;
    this._sparklineEnd = endIdx;

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

    const width = 300;
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

    this.$.timelineDays.innerHTML = "";
    dayMap.forEach((startIdx, dateStr) => {
      const pct = (startIdx / (totalHours - 1)) * 100;
      const label = document.createElement("span");
      const dayText = WeatherService.formatDayLabel(dateStr);
      const isToday = dayText === "Today";
      label.className = isToday
        ? "absolute whitespace-nowrap px-2 py-0.5 rounded-full bg-primary/10 text-primary dark:bg-primary-light/15 dark:text-primary-light font-bold"
        : "absolute whitespace-nowrap px-1.5 py-0.5 rounded-full bg-slate-200/60 dark:bg-slate-700/60";
      label.style.left = `${pct}%`;
      label.style.transform = "translateX(-50%)";
      label.textContent = dayText;
      this.$.timelineDays.appendChild(label);
    });
    this.$.timelineDays.style.position = "relative";
    this.$.timelineDays.style.height = "22px";

    // Tick marks formatting
    this.$.timelineTicks.innerHTML = "";
    for (let i = 0; i < totalHours; i++) {
      const actualIdx = i + timeOffset;
      const timePart = hourlyTimes[actualIdx]?.split("T")[1];
      if (!timePart) continue;
      const h = parseInt(timePart.split(":")[0], 10);

      // Weekly: 00, 06, 12, 18. 24h mode: 00, 01, 02... 24
      const isTickHour = this.timeline24hMode ? true : (h % 6 === 0);

      if (isTickHour) {
        const tick = document.createElement("span");
        tick.className = this.timeline24hMode
          ? "absolute text-[8px] sm:text-[10px] text-slate-400 dark:text-slate-500 font-semibold select-none"
          : "absolute text-[10px] text-slate-400 dark:text-slate-500 font-semibold select-none";
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
    const temp = this.weatherData.hourly.temperature_2m?.[hourIndex];
    if (!timeStr) {
      tip.classList.add("hidden");
      return;
    }

    // Parse location-local ISO time string (e.g. "2026-07-24T02:00")
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
    const tempLabel = temp != null ? `${Math.round(temp)}°` : "--°";

    tip.textContent = `${dayName} ${timeFormatted} • ${tempLabel}`;

    // Calculate position based on slider index for 24h mode / weekly mode
    const slider = this.$.timelineSlider;
    const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
    const sliderIndex = hourIndex - timeOffset;
    const min = parseInt(slider.min, 10) || 0;
    const max = parseInt(slider.max, 10) || 1;
    const pct = Math.max(0, Math.min(1, (sliderIndex - min) / (max - min)));
    tip.style.left = `${pct * 100}%`;
    tip.classList.remove("hidden");
  }


  resetView() {
    if (!this.map) return;
    this.map.updateSize();
    this.map.getView().animate({ center: fromLonLat([0.0, 20.0]), zoom: 3 });
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
    // Remove duplicate if exists
    this.searchHistory = this.searchHistory.filter(
      (h) => h.displayName !== result.displayName,
    );
    // Add to front
    this.searchHistory.unshift({
      displayName: result.displayName || result.name,
      latitude: result.latitude || result.lat,
      longitude: result.longitude || result.lng,
    });
    // Keep last 5
    this.searchHistory = this.searchHistory.slice(0, 5);
    this._saveSearchHistory();
  }

  showSearchHistory() {
    const history = this.getSearchHistory();
    if (history.length === 0) return;
    const { createElement, clearElement } = window.domUtils;
    const container = this.$.searchResults;
    clearElement(container);

    const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("class", "w-3 h-3");
    svgEl.setAttribute("viewBox", "0 0 24 24");
    svgEl.setAttribute("fill", "none");
    svgEl.setAttribute("stroke", "currentColor");
    svgEl.setAttribute("stroke-width", "2");
    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("stroke-linecap", "round");
    pathEl.setAttribute("stroke-linejoin", "round");
    pathEl.setAttribute("d", "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z");
    svgEl.appendChild(pathEl);

    const header = createElement(
      "div",
      { className: "search-history-label" },
      svgEl,
      createElement("span", { textContent: "Recent" }),
      createElement("button", {
        className:
          "ml-auto text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors",
        textContent: "Clear",
        title: "Clear search history",
      }),
    );
    header.querySelector("button").addEventListener("click", (e) => {
      e.stopPropagation();
      this.searchHistory = [];
      this._saveSearchHistory();
      this.$.searchDropdown.classList.remove("open");
    });
    container.appendChild(header);

    history.forEach((r, i) => {
      const btn = createElement(
        "button",
        {
          className:
            "search-result-item w-full text-left px-4 py-2.5 flex items-center gap-3 cursor-pointer",
          "data-index": String(i),
        },
        createElement("span", {
          className: "text-sm flex-shrink-0",
          textContent: "🕐",
        }),
        createElement("span", {
          className: "text-xs text-slate-700 dark:text-slate-200 truncate",
          textContent: r.displayName,
        }),
      );
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.$.searchDropdown.classList.remove("open");
        this.$.searchInput.value = r.displayName;
        this.$.searchClearBtn.classList.remove("hidden");
        this.selectLocation(r.latitude, r.longitude, r.displayName);
      });
      container.appendChild(btn);
    });

    this.$.searchDropdown.classList.add("open");
    this.searchHighlightIndex = -1;
  }

  // ================================================================
  //  BOOKMARK MAP PINS
  // ================================================================
  // (relocated to features/bookmarks.js -- see features/registry.js)

  // ================================================================
  //  MAP CANVAS WEATHER EFFECTS (Rain, Snow, Windy, Storm animations)
  // ================================================================
  // (relocated to features/canvasEffects.js -- see features/registry.js)

  // ================================================================
  //  IMMERSIVE AUDIO WEATHER SOUNDSCAPES (Web Audio Synthesizer)
  // ================================================================
  // (relocated to features/audio.js -- see features/registry.js)

  // ================================================================
  //  SEARCH INPUTS (Open-Meteo Geocoding Falls)
  // ================================================================

  handleSearchInput() {
    const query = this.$.searchInput.value.trim();
    this.$.searchClearBtn.classList.toggle("hidden", query.length === 0);

    clearTimeout(this.searchDebounceTimer);

    // Abort any in-flight request from a previous keystroke so stale
    // responses can't overwrite newer ones.
    if (this.searchAbortController) {
      this.searchAbortController.abort();
      this.searchAbortController = null;
    }

    if (query.length < 2) {
      this.$.searchDropdown.classList.remove("open");
      this.$.searchResults.innerHTML = "";
      return;
    }

    this.searchDebounceTimer = setTimeout(() => this.performSearch(query), 300);
  }

  async performSearch(query) {
    this.$.searchSpinner.classList.remove("hidden");

    // Each search gets its own AbortController; a new keystroke aborts it.
    const controller = new AbortController();
    this.searchAbortController = controller;

    try {
      const results = await WeatherService.searchLocations(
        query,
        controller.signal,
      );
      // Ignore results delivered for a request that's no longer current.
      if (this.searchAbortController !== controller) return;
      this.renderSearchResults(results);
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
    } finally {
      this.$.searchSpinner.classList.add("hidden");
    }
  }

  renderSearchResults(results) {
    const { createElement, clearElement } = window.domUtils;
    const container = this.$.searchResults;
    clearElement(container);

    if (!results || results.length === 0) {
      container.appendChild(
        createElement("div", {
          className: "px-4 py-3 text-sm text-slate-400 dark:text-slate-500",
          textContent: "No results found",
        }),
      );
      this.$.searchDropdown.classList.add("open");
      return;
    }

    this.searchHighlightIndex = -1;

    results.forEach((r, i) => {
      let flagEmoji = "📍";
      if (r.country && r.country.length === 2) {
        try {
          const codePoints = r.country
            .toUpperCase()
            .split("")
            .map((char) => 127397 + char.charCodeAt(0));
          flagEmoji = String.fromCodePoint(...codePoints);
        } catch {}
      }

      const btn = createElement(
        "button",
        {
          className:
            "search-result-item w-full text-left px-4 py-2.5 flex items-center gap-3 cursor-pointer",
          "data-index": String(i),
        },
        createElement("span", {
          className: "text-sm flex-shrink-0",
          textContent: flagEmoji,
        }),
        createElement("span", {
          className: "text-xs text-slate-700 dark:text-slate-200 truncate",
          textContent: r.displayName,
        }),
      );

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        this.selectSearchResult(results[idx]);
      });

      container.appendChild(btn);
    });

    this.$.searchDropdown.classList.add("open");
  }

  async selectSearchResult(result) {
    this.$.searchDropdown.classList.remove("open");
    this.$.searchInput.value = result.displayName;
    this.$.searchClearBtn.classList.remove("hidden");

    if (result.latitude && result.longitude) {
      this.addToSearchHistory(result);
      await this.selectLocation(
        result.latitude,
        result.longitude,
        result.displayName,
      );
    }
  }

  clearSearch() {
    this.$.searchInput.value = "";
    this.$.searchClearBtn.classList.add("hidden");
    this.$.searchDropdown.classList.remove("open");
    this.$.searchResults.innerHTML = "";
    this.$.searchInput.focus();
  }

  // ================================================================
  //  THEME ADJUSTMENTS & MAP TILES
  // ================================================================

  toggleDarkMode() {
    this.isDark = !this.isDark;

    document.documentElement.classList.toggle("dark", this.isDark);
    try {
      localStorage.setItem("aurafisky_theme", this.isDark ? "dark" : "light");
    } catch (e) {
      // ignore — storage unavailable
    }

    // Swap basemap style (handles language preference)
    this._switchBasemapTheme();

    // Update theme-color meta tag for browser chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = this.isDark ? "#0f172a" : "#6366f1";
    this.updateSettingsUIFromLocal();
    this.saveUserDataToCloud();
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
      const shortName = (tab.name || "").split(",")[0].trim();
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
        document.title = `${WeatherService.formatTemp(weather.temperature)} ${weather.icon} ${this.selectedName.split(",")[0]} — Aurafisky`;
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
          span.textContent = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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
    const timeLabel = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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
    const moonPhase = WeatherService.getMoonPhase(new Date());
    if (this.$.wallpaperMoonLitPath) {
      // Upper limb arc from the top of the circle, swept by the phase fraction.
      const phase = moonPhase.phase;
      const largeArc = phase > 0.5 ? 1 : 0;
      const endAngle = phase * 2 * Math.PI;
      // Circle center (30,30), radius 27, top point (30,3)
      const x2 = 30 + 27 * Math.sin(endAngle);
      const y2 = 30 - 27 * Math.cos(endAngle);
      this.$.wallpaperMoonLitPath.setAttribute(
        "d",
        `M 30 3 A 27 27 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L 30 30 Z`
      );
    }
    if (this.$.wallpaperMoonPhaseLabel) {
      this.$.wallpaperMoonPhaseLabel.textContent = moonPhase.label;
    }
    if (this.$.wallpaperMoonPhasePercent) {
      const illumination = Math.round((1 - Math.cos(moonPhase.phase * 2 * Math.PI)) / 2 * 100);
      this.$.wallpaperMoonPhasePercent.textContent = `${illumination}% lit`;
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

    document.title = `${WeatherService.formatTemp(weather.temperature)} ${weather.icon} ${activeTab.name.split(",")[0]} — Aurafisky Wallpaper`;

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
  getWeatherWallpaperUrl(weatherCode = 0, isDay = true, lat = 0, lng = 0) {
    let category = "clear_day";
    const code = Number(weatherCode);

    if (WeatherService.isStormCode(code)) {
      category = "storm";
    } else if (WeatherService.isSnowCode(code)) {
      category = "snow";
    } else if (WeatherService.isRainCode(code)) {
      category = "rain";
    } else if (code === 45 || code === 48) {
      category = "fog";
    } else if (code === 2 || code === 3) {
      category = isDay ? "cloudy_day" : "cloudy_night";
    } else {
      category = isDay ? "clear_day" : "clear_night";
    }

    const list = WEATHER_WALLPAPERS[category] || WEATHER_WALLPAPERS.clear_day;
    const hash = Math.abs(Math.round((Number(lat) * 100) + (Number(lng) * 100))) % list.length;
    return list[hash] || list[0];
  }

  /**
   * Silky dual-layer crossfade between wallpaperPhotoA and wallpaperPhotoB.
   * Preloads incoming photo so there is never a white or black flash.
   */
  transitionWallpaperPhoto(targetUrl) {
    if (!targetUrl || targetUrl === this._currentWallpaperUrl) return;
    this._currentWallpaperUrl = targetUrl;

    const layerA = this.$.wallpaperPhotoA || document.getElementById("wallpaperPhotoA");
    const layerB = this.$.wallpaperPhotoB || document.getElementById("wallpaperPhotoB");
    if (!layerA || !layerB) {
      if (this.$.wallpaperPhotoBg) {
        this.$.wallpaperPhotoBg.style.backgroundImage = `url("${targetUrl}")`;
      }
      return;
    }

    const currentLayer = (this._activePhotoLayer === "B") ? layerB : layerA;
    const nextLayer = (this._activePhotoLayer === "B") ? layerA : layerB;
    const nextLayerName = (this._activePhotoLayer === "B") ? "A" : "B";

    // Immediate display if initial load or neither layer has an image yet
    if (!layerA.style.backgroundImage && !layerB.style.backgroundImage) {
      layerA.style.backgroundImage = `url("${targetUrl}")`;
      layerA.classList.add("active");
      layerB.classList.remove("active");
      this._activePhotoLayer = "A";
      return;
    }

    const img = new Image();
    img.onload = () => {
      nextLayer.style.backgroundImage = `url("${targetUrl}")`;
      nextLayer.classList.add("active");
      currentLayer.classList.remove("active");
      this._activePhotoLayer = nextLayerName;
    };
    img.onerror = () => {
      nextLayer.style.backgroundImage = `url("${targetUrl}")`;
      nextLayer.classList.add("active");
      currentLayer.classList.remove("active");
      this._activePhotoLayer = nextLayerName;
    };
    img.src = targetUrl;
  }

  /**
   * Shows a curated online scenic photo wallpaper suited to the active tab's
   * weather conditions with smooth dual-layer crossfade.
   */
  showWallpaperPhotoBg() {
    if (!this.wallpaperPhotoEnabled || !this.$.wallpaperPhotoBg) return;
    const activeTab = this.wallpaperLocations[this.activeWallpaperIndex] || {
      lat: this.currentLat ?? 13.2803,
      lng: this.currentLng ?? 78.2909,
    };

    this.$.wallpaperPhotoBg.classList.remove("hidden");

    let code = 0;
    let isDay = true;
    const weatherSource = this.wallpaperWeatherData || this.weatherData;
    if (weatherSource) {
      const idx = this.wallpaperWeatherData ? this.wallpaperCurrentHourIndex : this.currentHourIndex;
      const weather = WeatherService.getHourlyAtIndex(weatherSource, idx);
      if (weather) {
        code = weather.weatherCode;
        isDay = weather.isDay;
      }
    }

    const targetUrl = this.getWeatherWallpaperUrl(code, isDay, activeTab.lat, activeTab.lng);
    this.transitionWallpaperPhoto(targetUrl);
  }

  /**
   * Hides the scenic photo background.
   */
  hideWallpaperPhotoBg() {
    this.$.wallpaperPhotoBg?.classList.add("hidden");
    const layerA = this.$.wallpaperPhotoA || document.getElementById("wallpaperPhotoA");
    const layerB = this.$.wallpaperPhotoB || document.getElementById("wallpaperPhotoB");
    if (layerA) layerA.classList.remove("active");
    if (layerB) layerB.classList.remove("active");
    this._currentWallpaperUrl = "";
  }

  /**
   * Opens the modern Add Location modal for wallpaper tabs.
   */
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
          const shortName = (b.name || "").split(",")[0].trim();
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
  exportWallpaperImage() {
    if (!this.wallpaperWeatherData || !this.wallpaperLocations.length) {
      this.showToast("No wallpaper data to export", "info");
      return;
    }
    const activeTab = this.wallpaperLocations[this.activeWallpaperIndex];
    const weather = WeatherService.getHourlyAtIndex(
      this.wallpaperWeatherData,
      this.wallpaperCurrentHourIndex,
    );
    if (!weather || !activeTab) return;

    const W = 1080;
    const H = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      this.showToast("Could not render the image.", "error");
      return;
    }

    // Background gradient (stormy-purple → near-black, matches the overlay)
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#1e1b3a");
    bg.addColorStop(1, "#0a0a14");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Header: location + coords + time
    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 26px Inter, sans-serif";
    ctx.fillText(`${activeTab.lat.toFixed(4)}° ${activeTab.lat >= 0 ? "N" : "S"}, ${activeTab.lng.toFixed(4)}° ${activeTab.lng >= 0 ? "E" : "W"}`, 60, 90);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 64px Inter, sans-serif";
    ctx.fillText(activeTab.name, 60, 170);

    // Big temp + description
    ctx.font = "800 220px Inter, sans-serif";
    ctx.fillText(WeatherService.formatTemp(weather.temperature), 60, 430);
    ctx.font = "500 40px Inter, sans-serif";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText(weather.description, 64, 500);
    ctx.font = "400 30px Inter, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`Feels like ${WeatherService.formatTemp(weather.feelsLike)}`, 64, 550);

    // Key metrics row (4 cards)
    const metrics = [
      { label: "HUMIDITY", value: `${weather.humidity ?? "--"}%` },
      { label: "WIND", value: WeatherService.formatWind(weather.windSpeed) },
      { label: "PRESSURE", value: WeatherService.formatPressure(weather.pressure) },
      { label: "UV INDEX", value: weather.uvIndex != null ? weather.uvIndex.toFixed(1) : "--" },
    ];
    // ctx.roundRect is Chrome 99+/Safari 16+ only — fall back to a plain rect
    const roundedRect = (x, y, w, h, r) => {
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, w, h, r);
      } else {
        ctx.rect(x, y, w, h);
      }
    };
    const cardW = (W - 60 * 2 - 24 * 3) / 4;
    metrics.forEach((m, i) => {
      const x = 60 + i * (cardW + 24);
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      roundedRect(x, 620, cardW, 150, 20);
      ctx.fill();
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 20px Inter, sans-serif";
      ctx.fillText(m.label, x + 24, 665);
      ctx.fillStyle = "#ffffff";
      ctx.font = "700 40px Inter, sans-serif";
      ctx.fillText(m.value, x + 24, 720);
    });

    // 7-day strip
    const daily = this.wallpaperWeatherData.daily;
    if (daily?.time?.length) {
      ctx.fillStyle = "#94a3b8";
      ctx.font = "600 22px Inter, sans-serif";
      ctx.fillText("7-DAY FORECAST", 60, 860);
      const dayW = (W - 60 * 2 - 16 * 6) / 7;
      daily.time.slice(0, 7).forEach((date, i) => {
        const code = daily.weather_code?.[i] ?? 0;
        const info = WeatherService.getWeatherInfo(code, true);
        const maxTemp = daily.temperature_2m_max?.[i];
        const minTemp = daily.temperature_2m_min?.[i];
        const x = 60 + i * (dayW + 16);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.beginPath();
        roundedRect(x, 890, dayW, 130, 16);
        ctx.fill();
        ctx.fillStyle = i === 0 ? "#14b8a6" : "#94a3b8";
        ctx.font = "700 22px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(WeatherService.formatDayLabel(date), x + dayW / 2, 930);
        ctx.fillStyle = "#ffffff";
        ctx.font = "600 26px Inter, sans-serif";
        ctx.fillText(`${maxTemp != null ? Math.round(maxTemp) : "--"}° ${minTemp != null ? Math.round(minTemp) : "--"}°`, x + dayW / 2, 970);
        ctx.textAlign = "left";
      });
    }

    // Footer: brand
    ctx.fillStyle = "#64748b";
    ctx.font = "500 22px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("Aurafisky · Open-Meteo", W - 60, H - 50);
    ctx.textAlign = "left";

    // Download
    try {
      const finish = (blobOrUrl) => {
        const url = typeof blobOrUrl === "string" ? blobOrUrl : URL.createObjectURL(blobOrUrl);
        const a = document.createElement("a");
        a.href = url;
        a.download = `aurafisky-wallpaper-${(activeTab.name || "location").split(",")[0].trim().replace(/[^\w-]+/g, "-").toLowerCase()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (typeof blobOrUrl !== "string") setTimeout(() => URL.revokeObjectURL(url), 4000);
        this.showToast("Wallpaper image saved", "success");
      };
      if (canvas.toBlob) {
        canvas.toBlob((blob) => finish(blob), "image/png");
      } else {
        finish(canvas.toDataURL("image/png"));
      }
    } catch (e) {
      this.showToast("Could not save the image.", "error");
    }
    this._haptic('medium');
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
    this.audioContext?.close().catch(() => {});
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.stopAllSounds();
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
  }

  showWeatherPanel() {
    this.$.weatherPanel.classList.add("open");
    this.$.weatherPanel.classList.remove("minimized");
    this.$.weatherPanel.removeAttribute("inert");
    if (this.$.panelMinimizeBtn) {
      this.$.panelMinimizeBtn.classList.remove("chevron-flipped");
    }
    if (this.$.mobileNavWeatherBtn) {
      this.$.mobileNavWeatherBtn.classList.add("active");
      this.$.mobileNavMapBtn?.classList.remove("active");
    }
    // Mobile: collapse radar panel to avoid overlap
    if (
      window.innerWidth < 640 &&
      this.$.radarExpandedPanel &&
      !this.$.radarExpandedPanel.classList.contains("hidden")
    ) {
      this.$.radarExpandedPanel.classList.add("hidden");
      this.$.radarCollapsedBtn.classList.remove("hidden");
    }
  }

  hideWeatherPanel() {
    this.$.weatherPanel.classList.remove("open", "minimized");
    this.$.weatherPanel.setAttribute("inert", "");
    if (this.$.mobileNavMapBtn) {
      this.$.mobileNavMapBtn.classList.add("active");
      this.$.mobileNavWeatherBtn?.classList.remove("active");
    }
    // NOTE: 'compact' class on <html> is a persistent user preference — do not remove it here.
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
    this.$.weatherPanel.classList.toggle("minimized");
    const isMin = this.$.weatherPanel.classList.contains("minimized");
    if (this.$.panelMinimizeBtn) {
      this.$.panelMinimizeBtn.classList.toggle(
        "chevron-flipped",
        isMin,
      );
    }
    if (this.$.mobileNavWeatherBtn && this.$.mobileNavMapBtn) {
      this.$.mobileNavWeatherBtn.classList.toggle("active", !isMin);
      this.$.mobileNavMapBtn.classList.toggle("active", isMin);
    }
  }

  // ================================================================
  //  WEATHER PANEL TABS & MOBILE NAVIGATION
  // ================================================================

  /**
   * Initializes tab switching on the left-side weather card.
   */
  initWeatherPanelTabs() {
    this.activeWeatherTab = "overview";
    const tabBtns = document.querySelectorAll(".weather-tab-btn");

    tabBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabName = btn.dataset.tab;
        if (tabName) {
          this.switchWeatherTab(tabName);
          this._haptic('selection');
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
          this._haptic('selection');
        }
      });
    });
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
    };

    const targetPanelId = targetPanelIdMap[tabName] || "weatherTabOverview";
    panels.forEach((p) => {
      const isTarget = p.id === targetPanelId;
      p.classList.toggle("active", isTarget);
    });

    const activeBtn = document.querySelector(`.weather-tab-btn[data-tab="${tabName}"]`);
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
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

    mapBtn?.addEventListener("click", () => {
      setActiveBtn(mapBtn);
      if (this.$.weatherPanel?.classList.contains("open") && !this.$.weatherPanel?.classList.contains("minimized")) {
        this.toggleMinimizeWeatherPanel();
      }
      this.$.bookmarksDropdown?.classList.add("hidden");
      this.hideComparePanel();
      this._haptic('light');
    });

    weatherBtn?.addEventListener("click", () => {
      setActiveBtn(weatherBtn);
      if (!this.$.weatherPanel?.classList.contains("open")) {
        this.showWeatherPanel();
      } else if (this.$.weatherPanel?.classList.contains("minimized")) {
        this.toggleMinimizeWeatherPanel();
      } else {
        this.switchWeatherTab("overview");
        const content = this.$.weatherPanelContent;
        if (content) content.scrollTop = 0;
      }
      this._haptic('light');
    });

    routeBtn?.addEventListener("click", () => {
      setActiveBtn(routeBtn);
      this.$.routeBtn?.click();
      this._haptic('light');
    });

    savedBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = this.$.bookmarksDropdown?.classList.contains("hidden");
      if (isHidden) {
        setActiveBtn(savedBtn);
        this.$.bookmarksDropdown?.classList.remove("hidden");
      } else {
        this.$.bookmarksDropdown?.classList.add("hidden");
        setActiveBtn(this.$.weatherPanel?.classList.contains("open") && !this.$.weatherPanel?.classList.contains("minimized") ? weatherBtn : mapBtn);
      }
      this._haptic('light');
    });

    layersBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const isHidden = this.$.mapLayersFlyout?.classList.contains("hidden");
      if (isHidden) {
        setActiveBtn(layersBtn);
        this.toggleMapLayersFlyout(true);
      } else {
        this.toggleMapLayersFlyout(false);
        setActiveBtn(this.$.weatherPanel?.classList.contains("open") && !this.$.weatherPanel?.classList.contains("minimized") ? weatherBtn : mapBtn);
      }
      this._haptic('light');
    });
  }

  // ================================================================
  //  VOLUME CONTROLS
  // ================================================================
  // (relocated to features/audio.js -- see features/registry.js)

  // ================================================================
  //  CLIMATE TIME-MACHINE
  // ================================================================
  // (relocated to features/timeMachine.js -- see features/registry.js)

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
      const db = fbFirestore.getFirestore(app);
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
    if (this.$.profileIconGeneric)
      this.$.profileIconGeneric.classList.add("hidden");
    if (this.$.profileAvatarImg) {
      this.$.profileAvatarImg.src = this.user.photoURL || "";
      this.$.profileAvatarImg.classList.remove("hidden");
    }

    if (this.$.accountLoggedOut)
      this.$.accountLoggedOut.classList.add("hidden");
    if (this.$.accountLoggedIn)
      this.$.accountLoggedIn.classList.remove("hidden");
    if (this.$.googleSignOutBtn)
      this.$.googleSignOutBtn.classList.remove("hidden");

    const initialsEl = document.getElementById("accountAvatarInitials");
    if (initialsEl) {
      const name = this.user.displayName || "User";
      initialsEl.textContent = name.charAt(0).toUpperCase();
    }

    if (this.$.accountAvatarImg) {
      if (this.user.photoURL) {
        this.$.accountAvatarImg.src = this.user.photoURL;
        this.$.accountAvatarImg.onerror = () => {
          this.$.accountAvatarImg.classList.add("hidden");
        };
        this.$.accountAvatarImg.onload = () => {
          this.$.accountAvatarImg.classList.remove("hidden");
        };
      } else {
        this.$.accountAvatarImg.classList.add("hidden");
      }
    }
    if (this.$.accountName)
      this.$.accountName.textContent = this.user.displayName || "Google User";
    if (this.$.accountEmail)
      this.$.accountEmail.textContent = this.user.email || "";

    await this.loadUserDataFromCloud();
  }

  onUserSignOut() {
    if (this.$.profileIconGeneric)
      this.$.profileIconGeneric.classList.remove("hidden");
    if (this.$.profileAvatarImg) {
      this.$.profileAvatarImg.src = "";
      this.$.profileAvatarImg.classList.add("hidden");
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
            const wantCompact = prefs.compact;
            if (wantCompact !== this.minimalMode) {
              this.toggleMinimalMode();
            }
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
            this.mapLanguage = prefs.mapLanguage;
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
          this.$.syncStatusTime.textContent = new Date().toLocaleTimeString();
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
    const compact = this.minimalMode || false;
    const searchHist = this.syncHistory ? [...this.searchHistory] : [];

    const dataToSave = {
      preferences: {
        units,
        theme,
        compact,
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
        this.$.syncStatusTime.textContent = new Date().toLocaleTimeString();
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
    this.$.accountDialog.classList.toggle("hidden", !show);
  }

  toggleSettingsPanel(force) {
    if (!this.$.settingsPanel) return;
    const isHidden = this.$.settingsPanel.classList.contains("hidden");
    const show = force !== undefined ? force : isHidden;
    if (show) {
      this.$.settingsPanel.classList.remove("hidden");
      setTimeout(() => this.$.settingsPanel.classList.add("open"), 10);
    } else {
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
    if (this.$.settingsCompactToggle) {
      this.$.settingsCompactToggle.checked = this.minimalMode || false;
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
        this.$.defaultLocationNotifyHint.textContent = `Sending hourly updates for ${this.defaultLocation.name}.`;
        this.$.defaultLocationNotifyHint.classList.remove("text-slate-500", "dark:text-slate-400");
        this.$.defaultLocationNotifyHint.classList.add("text-primary");
      } else {
        this.$.defaultLocationNotifyHint.textContent =
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
        this.$.defaultLocationStatus.textContent =
          "📍 No default location set. Click map and set current.";
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
    
    // Update settings panel checkbox
    if (this.$.settingsMapLanguageToggle) {
      this.$.settingsMapLanguageToggle.checked = !isEnglish; // checked = native
    }

    // Also update the legacy top bar button if it exists (for backwards compat)
    const btn = document.getElementById("mapLanguageToggle");
    if (btn) {
      btn.textContent = isEnglish ? '🌐 EN' : '🌐 Native';
      btn.setAttribute('aria-label', isEnglish ? 'Switch to native language labels' : 'Switch to English labels');
      btn.title = isEnglish ? 'Map labels: English (click for native)' : 'Map labels: Native (click for English)';
    }
  }

  /**
   * Swap the active vector basemap layer group when light/dark theme
   * changes. Both groups were already styled (with the current language) in
   * initMap(), so this is just an add/remove — no re-fetching.
   */
  _switchBasemapTheme() {
    if (!this.map || !this.lightBasemap || !this.darkBasemap) return;
    if (this.isDark) {
      if (this.mapStyle === 'street') this.mapStyle = 'dark';
    } else {
      if (this.mapStyle === 'dark') this.mapStyle = 'street';
    }
    this._updateActiveBasemap();
    this._updateMapStyleUI();
  }

  setMapStyle(style) {
    const validStyles = ['street', 'satellite', 'terrain', 'dark'];
    if (!validStyles.includes(style)) style = 'street';
    this.mapStyle = style;
    try {
      localStorage.setItem("aurafisky_map_style", style);
    } catch (_) {}

    // Synchronize dark theme if user picked dark or street explicitly
    if (style === "dark" && !this.isDark) {
      this.toggleDarkMode();
      return;
    } else if (style === "street" && this.isDark) {
      this.toggleDarkMode();
      return;
    }

    this._updateActiveBasemap();
    this._updateMapStyleUI();
    const styleNames = {
      street: "Default (Street)",
      satellite: "Satellite (Aerial)",
      terrain: "Terrain (Topographic)",
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
      terrain: this.terrainBasemap
    };
    const targetGroup = styleGroups[this.mapStyle] || (this.isDark ? this.darkBasemap : this.lightBasemap);
    const allGroups = [this.lightBasemap, this.darkBasemap, this.satelliteBasemap, this.terrainBasemap];
    const layers = this.map.getLayers();

    allGroups.forEach((g) => {
      if (g && g !== targetGroup && layers.getArray().includes(g)) {
        layers.remove(g);
      }
    });

    if (targetGroup && !layers.getArray().includes(targetGroup)) {
      layers.insertAt(0, targetGroup);
    }
    this.map.render();
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
      const isCustom = this.mapStyle === "satellite" || this.mapStyle === "terrain";
      this.$.mapLayersBtn.classList.toggle("layers-active", isCustom);
    }
  }

  toggleMapLayersFlyout(force) {
    if (!this.$.mapLayersFlyout) return;
    const isHidden = this.$.mapLayersFlyout.classList.contains("hidden");
    const open = force !== undefined ? force : isHidden;
    this.$.mapLayersFlyout.classList.toggle("hidden", !open);
    this.$.mapLayersBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    this.$.mobileNavLayersBtn?.classList.toggle("active", open);
    if (open) {
      this._updateMapStyleUI();
    }
  }

  /**
   * Real map-language switching. OpenFreeMap's vector tiles (OpenMapTiles
   * schema) carry both a local `name` field and an English `name_en` field
   * per feature — confirmed by inspecting the live liberty/dark style JSON's
   * label layers, all of which build text-field as a "case"/"coalesce"
   * expression over exactly those two fields (see localizeGlStyle in
   * modules/map-language.js). Re-styling the vector-tile layer for the
   * `openmaptiles` source re-labels the whole map (cities, roads, POIs,
   * water) instantly, client-side — no new tile requests.
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
  } catch (err) {
    console.error("Failed to boot Aurafisky:", err);
    const ov = document.getElementById("loadingOverlay");
    if (ov) {
      ov.innerHTML = `<div class="text-center p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-xl max-w-sm mx-4"><p class="text-rose-500 font-semibold mb-2">Startup Error</p><p class="text-sm text-slate-600 dark:text-slate-400 mb-4">${err.message || 'An error occurred during startup.'}</p><button onclick="location.reload()" class="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90">Retry</button></div>`;
    }
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAurafisky);
} else {
  bootAurafisky();
}
