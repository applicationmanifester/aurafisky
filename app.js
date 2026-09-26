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
      // `define` + .env.example) with valid aurafisky default fallback.
      apiKey:
        typeof __FIREBASE_API_KEY__ !== "undefined" && __FIREBASE_API_KEY__
          ? __FIREBASE_API_KEY__
          : "AIzaSyCF0fSv5OUy05AnYZot4Y9Y07TnJjjNl1I",
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

    // Initialize Firebase integrations & bind user profile / settings triggers
    this.initFirebase();

    // Register the Service Worker. This is the single registration path — the
    // inline <script> in index.html and vite-plugin-pwa's injected registerSW.js
    // were both removed in favour of this one, which additionally sets
    // updateViaCache:'none' and forces update checks on focus/visibility.
    this.registerServiceWorker();

    // Load initial startup location (shared URL link first, then restored session, home, or geolocation)
    this._loadInitialStartupLocation();
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
      this.satelliteBasemap = new LayerGroup({
        layers: [
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 19,
              crossOrigin: "anonymous",
              attributions: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
            }),
            preload: 1
          }),
          new TileLayer({
            source: new XYZ({
              url: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
              maxZoom: 19,
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
              maxZoom: 19,
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

  _checkUrlParamsOnStartup() {
    try {
      const params = new URLSearchParams(window.location.search);
      const latStr = params.get("lat");
      const lngStr = params.get("lng");
      const nameStr = params.get("name");

      if (latStr != null && lngStr != null) {
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          const name = nameStr ? decodeURIComponent(nameStr) : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          this.selectLocation(lat, lng, name);
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
    if (this._isFetching) return;
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
      const targetZoom = Math.max(view.getZoom(), 9);
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


    } finally {
      this._isFetching = false;
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

  updateOnlineStatus(online) {
    this.isOffline = !online;
    if (online) {
      this.$.offlineBanner.classList.add("hidden");
      this.showToast("Device connected back online.", "success");
    } else {
      this.$.offlineBanner.classList.remove("hidden");
      this.showToast(
        "Device disconnected. Running in offline cache mode.",
        "error",
      );
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
  }

  toggleMinimizeWeatherPanel() {
    this.$.weatherPanel.classList.toggle("minimized");
    if (this.$.panelMinimizeBtn) {
      this.$.panelMinimizeBtn.classList.toggle(
        "chevron-flipped",
        this.$.weatherPanel.classList.contains("minimized"),
      );
    }
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
  window.app = new AurafiskyApp();
  window.addEventListener("beforeunload", () => {
    if (window.app?.destroy) window.app.destroy();
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootAurafisky);
} else {
  bootAurafisky();
}
