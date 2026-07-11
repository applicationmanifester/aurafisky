/**
 * ============================================================
 * Aurafisky Application — app.js (Leaflet + Immersive Features)
 * ============================================================
 * Main application controller. Handles:
 *   - Leaflet.js Map initialization & theme-adaptive tiles
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

import { initFeatures } from "./features/registry.js";

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
      apiKey:
        window.FIREBASE_API_KEY || "AIzaSyCF0fSv5OUy05AnYZot4Y9Y07TnJjjNl1I", // Fallback to placeholder in dev
      authDomain: "aurafisky.firebaseapp.com",
      messagingSenderId: "206842187982",
      // Web Push VAPID key from Firebase Console → Project Settings → Cloud Messaging.
      // Set window.FCM_VAPID_KEY before app load, or replace the placeholder.
      vapidKey: window.FCM_VAPID_KEY || "",
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
    this.map = null; // Leaflet map instance
    this.lightTiles = null; // Light tile layer
    this.darkTiles = null; // Dark tile layer
    this.marker = null; // Leaflet marker instance
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

    // Terms & Conditions (cloud-only, defaults to not accepted)
    this.termsAccepted = false;

    // Soundscape State
    this.audioActive = false; // Audio mute state
    this.audioContext = null; // Web Audio Context
    this.audioNodes = {}; // Active synthesizer nodes
    this.volumeLevel = 0.5; // Sound volume level (0.0 to 1.0)
    this.activeSoundType = null; // Active sound type

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

    // Sunrise countdown timer
    this.sunCountdownTimer = null;

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
      bookmarksBtn: document.getElementById("bookmarksBtn"),
      bookmarksDropdown: document.getElementById("bookmarksDropdown"),
      bookmarksList: document.getElementById("bookmarksList"),
      weatherPanel: document.getElementById("weatherPanel"),
      panelCloseBtn: document.getElementById("panelCloseBtn"),
      favoriteToggleBtn: document.getElementById("favoriteToggleBtn"),
      starOutlineIcon: document.getElementById("starOutlineIcon"),
      starFilledIcon: document.getElementById("starFilledIcon"),
      homeToggleBtn: document.getElementById("homeToggleBtn"),
      homeOutlineIcon: document.getElementById("homeOutlineIcon"),
      homeFilledIcon: document.getElementById("homeFilledIcon"),
      timelineSlider: document.getElementById("timelineSlider"),
      timelineLabel: document.getElementById("timelineLabel"),
      timelineBadge: document.getElementById("timelineBadge"),
      timelineDays: document.getElementById("timelineDays"),
      nowIndicator: document.getElementById("nowIndicator"),
      timelineTooltip: document.getElementById("timelineTooltip"),
      timelineTicks: document.getElementById("timelineTicks"),
      loadingOverlay: document.getElementById("loadingOverlay"),
      toastContainer: document.getElementById("toastContainer"),
      offlineBanner: document.getElementById("offlineBanner"),
      weatherPanelSkeleton: document.getElementById("weatherPanelSkeleton"),
      weatherPanelContent: document.getElementById("weatherPanelContent"),

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
      topSettingsBtn: document.getElementById("topSettingsBtn"),
      googleSignOutBtn: document.getElementById("googleSignOutBtn"),
      settingsPanel: document.getElementById("settingsPanel"),
      settingsCloseBtn: document.getElementById("settingsCloseBtn"),
      settingsUnitsToggle: document.getElementById("settingsUnitsToggle"),
      settingsThemeToggle: document.getElementById("settingsThemeToggle"),
      settingsCompactToggle: document.getElementById("settingsCompactToggle"),
      settingsSyncHistoryToggle: document.getElementById(
        "settingsSyncHistoryToggle",
      ),
      settingsClearCacheBtn: document.getElementById("settingsClearCacheBtn"),
      settingsDeleteDataBtn: document.getElementById("settingsDeleteDataBtn"),
      settingsTermsBtn: document.getElementById("settingsTermsBtn"),
      termsModal: document.getElementById("termsModal"),
      termsAcceptBtn: document.getElementById("termsAcceptBtn"),
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
    // Global error boundary — surface unexpected errors without killing the app.
    window.addEventListener("error", (e) => {
      console.error("Unhandled error:", e.error || e.message);
    });
    window.addEventListener("unhandledrejection", (e) => {
      console.error("Unhandled promise rejection:", e.reason);
    });

    // Theme defaults to light (user sign-in will restore cloud preference)
    this.isDark = false;

    // Load bookmarks (in-memory until cloud sync)
    this.loadBookmarks();
    this.startBookmarkAlertPolling();

    // Setup Leaflet map viewport
    this.initLeafletMap();

    // Setup Particle Canvas Overlay
    this.initWeatherCanvas();

    // Bind event handlers
    this.bindEvents();
    this.initKeyboardShortcuts();

    // Lazy-load advanced feature modules (ensemble, routes, copilot)
    initFeatures(this).catch(() => {});

    // Register Service Worker for PWA
    this.registerServiceWorker();

    // Sync unit toggle label
    this.syncUnitLabel();

    // Keep the app consistent across browsers/users.
    // Only explicit share URLs should override the default view.
    setTimeout(() => this.readShareableUrl(), 0);

    // Load localforage cache first (settings, default location, last session)
    this._loadLocalCache().then(() => {
      this.updateSettingsUIFromLocal();
      this.updateHomeMarker();
      if (this._restoreSession()) {
        this.updateHomeButton();
      }
    });

    // Silent sweep of legacy per-location weather caches (capped to 30d).
    // Keeps localStorage tidy with zero user action.
    this._sweepStaleCache();

    // Initialize Firebase Auth & Firestore
    this.initFirebase();

    // Terms shown only on sign-in or via settings button / corner link
  }

  // ================================================================
  //  MAP INITIALIZATION & TILE SETUPS
  // ================================================================

  initLeafletMap() {
    try {
      this.map = L.map("map", {
        center: [20.0, 0.0],
        zoom: 3,
        minZoom: 2,
        zoomControl: false,
        attributionControl: true,
        worldCopyJump: false,
        maxBounds: [
          [-90, -180],
          [90, 180],
        ],
        maxBoundsViscosity: 1.0,
      });

      // CartoDB Voyager tile layer (fast CDN — replaces the slow/rate-limited OSM tile server)
      this.lightTiles = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        {
          attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
          subdomains: "abcd",
          maxZoom: 20,
          updateWhenIdle: false,
          updateWhenZooming: false,
          keepBuffer: 2,
          noWrap: true,
        },
      );

      // CartoDB Dark Matter tile layer
      this.darkTiles = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        {
          attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
          subdomains: "abcd",
          maxZoom: 20,
          updateWhenIdle: false,
          updateWhenZooming: false,
          keepBuffer: 2,
          noWrap: true,
        },
      );

      // Apply theme tile
      if (this.isDark) {
        this.darkTiles.addTo(this.map);
      } else {
        this.lightTiles.addTo(this.map);
      }

      // Hard-enforce map bounds so panning can never escape the map area
      // (esp. on mobile where inertia can outrun maxBoundsViscosity)
      const MAP_BOUNDS = [[-90, -180], [90, 180]];
      this.map.setMaxBounds(MAP_BOUNDS);
      this.map.on("moveend", () => {
        const c = this.map.getCenter();
        if (c.lat < -90 || c.lat > 90 || c.lng < -180 || c.lng > 180) {
          this.map.setView([20.0, 0.0], Math.max(this.map.getZoom(), 3));
        }
      });

      // Zoom controls are integrated into radar controls panel instead

      // Bind map click handler with debounce
      this.map.on("click", async (e) => {
        if (this._mapClickDebounce) return;
        // Check if click is near home pin (pixel distance)
        if (this._homeMarker && this.defaultLocation) {
          const markerPx = this.map.latLngToContainerPoint([
            this.defaultLocation.lat,
            this.defaultLocation.lng,
          ]);
          const dist = Math.hypot(
            e.containerPoint.x - markerPx.x,
            e.containerPoint.y - markerPx.y,
          );
          if (dist < 20) {
            this.selectLocation(
              this.defaultLocation.lat,
              this.defaultLocation.lng,
              this.defaultLocation.name,
            );
            return;
          }
        }
        this._mapClickDebounce = true;
        try {
          await this.handleMapClick(e.latlng.lat, e.latlng.lng);
        } catch (err) {
          console.error("Map click handler error:", err);
        } finally {
          setTimeout(() => (this._mapClickDebounce = false), 1000);
        }
      });

      this.refreshBookmarkPins();

      this.hideLoadingOverlay();
      this.showToast("Click anywhere or search for a city!", "info");

      // Staggered size invalidation checks to handle dynamic CSS/Tailwind runtime injection
      setTimeout(() => this.map && this.map.invalidateSize(), 100);
      setTimeout(() => this.map && this.map.invalidateSize(), 500);
      setTimeout(() => this.map && this.map.invalidateSize(), 1500);

      // Re-fit Leaflet tiles when the mobile URL bar shows/hides (visual viewport)
      if (window.visualViewport) {
        const onVV = () => this.map && this.map.invalidateSize();
        window.visualViewport.addEventListener("resize", onVV);
        window.visualViewport.addEventListener("scroll", onVV);
      }
    } catch (error) {
      console.error("Leaflet initialization failed:", error);
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
    });
    this.$.homeToggleBtn.addEventListener("click", () => {
      // Set/move/remove home to the currently selected location.
      // (Navigating to home uses the home marker click.)
      this.toggleHomeLocation();
    });
    this.$.favoriteToggleBtn.addEventListener("click", () =>
      this.toggleFavoriteCurrentLocation(),
    );

    // ── Map Controls ──────────────────────────────────────────
    // Dark mode toggle is in settings panel only
    this.$.myLocationBtn.addEventListener("click", () => this.getMyLocation());
    this.$.panelCloseBtn.addEventListener("click", () =>
      this.hideWeatherPanel(),
    );
    this.$.panelMinimizeBtn?.addEventListener("click", () =>
      this.toggleMinimizeWeatherPanel(),
    );
    this.$.compareCloseBtn.addEventListener("click", () =>
      this.hideComparePanel(),
    );

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
      });
    }
    if (this.$.settingsThemeToggle) {
      this.$.settingsThemeToggle.addEventListener("change", () => {
        this.toggleDarkMode();
        this.saveUserDataToCloud();
      });
    }
    if (this.$.settingsCompactToggle) {
      this.$.settingsCompactToggle.addEventListener("change", () => {
        this.toggleMinimalMode();
        this.saveUserDataToCloud();
      });
    }
    if (this.$.settingsSoundToggle) {
      this.$.settingsSoundToggle.addEventListener("change", (e) => {
        this.toggleAmbientSoundscape(e.target.checked);
        this.saveUserDataToCloud();
      });
    }
    if (this.$.settingsDeleteDataBtn) {
      this.$.settingsDeleteDataBtn.addEventListener("click", () =>
        this.deleteCloudUserData(),
      );
    }

    // ── Time Slider ───────────────────────────────────────────
    this.$.timelineSlider.addEventListener("input", (e) => {
      this.handleTimelineChange(parseInt(e.target.value, 10));
      this.updateTimelineTooltip(parseInt(e.target.value, 10));
    });
    this.$.timelineSlider.addEventListener("change", () => {
      if (this._tooltipHideTimer) clearTimeout(this._tooltipHideTimer);
      this._tooltipHideTimer = setTimeout(() => {
        if (this.$.timelineTooltip)
          this.$.timelineTooltip.classList.add("hidden");
      }, 2500);
    });

    // ── Weather Overlay controls ────────────────────────────────
    this.$.zoomInBtn?.addEventListener("click", () => this.map?.zoomIn());
    this.$.zoomOutBtn?.addEventListener("click", () => this.map?.zoomOut());
    this.$.resetViewBtn?.addEventListener("click", () => this.resetView());
    this.$.radarToggleBtn.addEventListener("click", () => this.toggleRadar());

    if (
      this.$.radarMinimizeBtn &&
      this.$.radarCollapsedBtn &&
      this.$.radarExpandedPanel
    ) {
      this.$.radarMinimizeBtn.addEventListener("click", () => {
        this.$.radarExpandedPanel.classList.add("hidden");
        this.$.radarCollapsedBtn.classList.remove("hidden");
      });
      this.$.radarCollapsedBtn.addEventListener("click", () => {
        this.$.radarCollapsedBtn.classList.add("hidden");
        this.$.radarExpandedPanel.classList.remove("hidden");
      });
    }
    this.$.layerTypeSelect.addEventListener("change", (e) => {
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
    this.$.radarPlayBtn.addEventListener("click", () =>
      this.toggleRadarPlayback(),
    );

    // ── Climate Time Machine trigger ─────────────────────────
    this.$.timeMachineTrigger.addEventListener("click", () =>
      this.toggleClimateTimeMachine(),
    );

    // ── Share Weather ────────────────────────────────────────
    this.$.shareWeatherBtn.addEventListener("click", () => this.shareWeather());

    // ── PWA Install Button ───────────────────────────────────
    this.$.installBtn.addEventListener("click", () => this.installPWA());

    // ── Next Rain Button ────────────────────────────────────
    this.$.nextRainBtn.addEventListener("click", () => this.jumpToNextRain());

    // ── Signal/Noise Toggle ─────────────────────────────────
    this.$.signalNoiseBtn.addEventListener("click", () =>
      this.toggleSignalNoiseView(),
    );

    // ── Briefing Button ─────────────────────────────────────
    this.$.briefingBtn.addEventListener("click", () => this.generateBriefing());

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
      e.preventDefault();
      this.deferredPrompt = e;
      this.$.installBtn.classList.remove("hidden");
      this._installBtnLabel && (this._installBtnLabel.textContent = "Install Aurafisky App");
      // If the user already trusts us after a successful interaction,
      // surface the install prompt immediately as a banner. Otherwise we
      // keep waiting for them to use the in-Settings install button.
      if (this._installPromptShown) {
        try {
          this.deferredPrompt.prompt();
        } catch (_) {
          /* prompt may not be available in this browser; Settings button still works */
        }
      }
    };
    window.addEventListener("beforeinstallprompt", this._boundBeforeInstall);

    // iOS Safari has no beforeinstallprompt — surface the manual
    // "Add to Home Screen" instruction instead so iPhone/iPad users
    // can still install the app.
    if (this._isIOS && !this._isInStandalone && this.$.installBtn) {
      this.$.installBtn.classList.remove("hidden");
      this._installBtnLabel &&
        (this._installBtnLabel.textContent = "Add to Home Screen");
    }

    window.addEventListener("appinstalled", () => {
      this.deferredPrompt = null;
      this.$.installBtn.classList.add("hidden");
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

    // ── Pull-to-refresh: detect downward swipe on map ────────
    this._pullStartY = 0;
    this._pullActive = false;
    this._pullNotified = false;
    document.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length !== 1) return;
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
        if (dy > 100 && !this._pullNotified && window.scrollY === 0) {
          this._pullNotified = true;
          this._pullActive = false;
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
      },
      { passive: true },
    );

    // ── Resize for canvas (RAF-throttled) ────────────────────
    this._resizeRAF = null;
    this._boundResize = () => {
      if (this._resizeRAF) return;
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = null;
        this.resizeWeatherCanvas();
        if (this.map) {
          this.map.invalidateSize();
        }
      });
    };
    window.addEventListener("resize", this._boundResize);
  }

  // ================================================================
  //  GEOLOCATION & REVERSE SEARCH (Nominatim)
  // ================================================================

  _persistSession(lat, lng, name) {
    localforage.setItem("_lastSession", { lat, lng, name }).catch(() => {});
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
    } catch (e) {
      console.warn("Local cache load error:", e);
    }
  }

  async handleMapClick(lat, lng) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      return;
    }
    let locationName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`,
        {
          headers: {
            "User-Agent": "AurafiskyApp/2.0",
          },
        },
      );
      if (response.ok) {
        const data = await response.json();
        const addr = data.address;
        if (addr) {
          const sanitize = (str) => {
            if (typeof DOMPurify !== "undefined" && DOMPurify.sanitize)
              return DOMPurify.sanitize(String(str || ""));
            return String(str || "").replace(/[<>&]/g, "");
          };
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
      }
    } catch (e) {
      console.warn("Nominatim reverse geocode lookup failed:", e);
    }

    await this.selectLocation(lat, lng, locationName);
  }

  async selectLocation(lat, lng, name) {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
      return;
    }
    if (this._isFetching) return;
    this._isFetching = true;
    try {
      this._persistSession(lat, lng, name);

      const wasMinimal = this.minimalMode;
      if (wasMinimal) {
        const panel = this.$.weatherPanel;
        this.setSafeHTML(panel, panel.dataset.fullContent || "");
        this.rebindPanelEvents();
        document.documentElement.classList.remove("compact");
        this.minimalMode = false;
      }

      this.selectedLat = lat;
      this.selectedLng = lng;
      this.selectedName = name;
      this.updateSettingsUIFromLocal();

      this._cachedDecomposition = null;

      // Center viewport (fix sequential Leaflet animation aborts)
      this.map.invalidateSize();
      const targetZoom = Math.max(this.map.getZoom(), 9);
      this.map.setView([lat, lng], targetZoom);

      // Refresh UI panel state
      this.$.panelLocationName.textContent = name;
      this.$.panelTimeLabel.textContent = "Fetching weather...";

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
        );

        // Compute diurnal bias from past days
        this.biasMap = WeatherService.computeDiurnalBias(forecast);

        // Store freshness timestamp
        this.freshnessTimestamp = Date.now();

        this.updateOfflineBadge(false);

        // Populate slider timeline tick boundaries
        this.initTimeline();

        // Sync slider thumb
        this.$.timelineSlider.value = this.currentHourIndex;
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
        this.createWeatherMarker(lat, lng);

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
          );

          this.updateOfflineBadge(true);
          this.showToast("Loaded cached offline weather details.", "info");

          this.initTimeline();
          this.$.timelineSlider.value = this.currentHourIndex;
          this.$.timelineSlider.disabled = false;

          this.updateWeatherDisplay(this.currentHourIndex);
          if (this._ensembleReady) this.renderEnsemble(lat, lng);
          this.createWeatherMarker(lat, lng);

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
              : "Could not fetch weather metrics.",
            "error",
          );
          this.hideWeatherPanel();
        }
      }

      this.updateHomeButton();
      this.updateHomeMarker();

      // Re-enter minimal mode if it was active
      if (wasMinimal) {
        document.documentElement.classList.add("compact");
        const panel = this.$.weatherPanel;
        // Preserve current HTML safely before switching to minimal view
        panel.dataset.fullContent = panel.innerHTML;
        const minimalHTML = `
         <div class="flex items-center justify-between px-5 pt-5 pb-3">
           <div class="min-w-0 flex-1">
             <h3 class="text-lg font-bold truncate text-slate-900 dark:text-white">${this.selectedName || "Weather"}</h3>
           </div>
           <button id="minimalExitBtn" class="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-600/40 transition-colors flex-shrink-0" aria-label="Exit minimal mode">
             <svg class="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
               <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
             </svg>
           </button>
         </div>
         <div class="flex-1 flex items-center justify-center px-5 pb-5">
           <div class="text-center">
             <div class="text-7xl mb-3">${this.$.panelIcon.textContent}</div>
             <div class="text-6xl font-extrabold text-slate-900 dark:text-white mb-2">${this.$.panelTemp.textContent}</div>
             <div class="text-lg text-slate-500 dark:text-slate-400 mb-1">${this.$.panelDescription.textContent}</div>
             <div class="text-sm text-slate-400">${WeatherService.formatDateTime(this.weatherData?.hourly?.time[parseInt(this.$.timelineSlider.value)], this.weatherData?.timezone, this.weatherData?.utc_offset_seconds)}</div>
           </div>
         </div>
       `;
        this.setSafeHTML(panel, minimalHTML);
        panel
          .querySelector("#minimalExitBtn")
          .addEventListener("click", () => this.toggleMinimalMode());
        this.minimalMode = true;
      }
    } finally {
      this._isFetching = false;
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

  _addCacheKey(key) {
    // No-op: caching removed
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
   * Builds a reusable Leaflet divIcon from a weather snapshot.
   * Single source of truth for the marker template (#4/#9).
   */
  _buildMarkerIcon(weather) {
    return L.divIcon({
      className: "custom-weather-marker-icon",
      html: `
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
      `,
      iconSize: [90, 60],
      iconAnchor: [45, 68],
    });
  }

  createWeatherMarker(lat, lng) {
    if (this.marker) {
      this.marker.remove();
      this.marker = null;
    }

    const weather = WeatherService.getHourlyAtIndex(
      this.weatherData,
      parseInt(this.$.timelineSlider.value, 10),
    );
    if (!weather) return;

    this.marker = L.marker([lat, lng], {
      icon: this._buildMarkerIcon(weather),
    }).addTo(this.map);
    this.marker.on("click", () => this.showWeatherPanel());
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
    this.$.panelLocationName.textContent = this.selectedName;
    const timezone = this.weatherData?.timezone;
    // Use the weather data's time for the selected hour, not current time
    const hourDate = new Date(weather.time);
    this.$.panelTimeLabel.textContent =
      hourDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: timezone,
      }) +
      " · " +
      hourDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone,
      });

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
    const comfortInfo = WeatherService.getComfortLabel(comfortScore);
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
        "text-[10px] font-bold text-indigo-500 dark:text-indigo-400";
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

    // Update bottom slider indicators
    const nowIdx = WeatherService.getCurrentHourIndex(this.weatherData);
    const isNow = Math.abs(hourIndex - nowIdx) <= 1;
    this.$.timelineBadge.classList.toggle("hidden", !isNow);
    this.$.timelineLabel.textContent = WeatherService.formatDateTime(
      weather.time,
      this.weatherData?.timezone,
      this.weatherData?.utc_offset_seconds,
    );

    // Synchronize marker bubble (uses shared template #4/#9)
    if (this.marker) {
      this.marker.setIcon(this._buildMarkerIcon(weather));
    }

    // Update shareable URL
    this.updateShareableUrl();

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
    const aqiVal = h.us_aqi[hourIndex];
    const pm25 = h.pm2_5[hourIndex];
    const pm10 = h.pm10[hourIndex];
    const ozone = h.ozone[hourIndex];

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
    if (!this.weatherData) return;

    const totalHours = this.weatherData.hourly.time.length;
    let startIdx = Math.max(0, selectedHourIndex - 12);
    let endIdx = Math.min(totalHours - 1, startIdx + 23);
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
          this.$.timelineSlider.value = p.idx;
          this.handleTimelineChange(p.idx);
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
        this.$.timelineSlider.value = p.idx;
        this.handleTimelineChange(p.idx);
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
        span.textContent = WeatherService.formatHourLabel(points[idx].time);
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
    const totalHours = hourlyTimes.length;

    this.$.timelineSlider.min = 0;
    this.$.timelineSlider.max = totalHours - 1;

    // Day boundaries mapping
    const dayMap = new Map();
    hourlyTimes.forEach((t, i) => {
      const dateStr = t.split("T")[0];
      if (!dayMap.has(dateStr)) {
        dayMap.set(dateStr, i);
      }
    });

    this.$.timelineDays.innerHTML = "";
    dayMap.forEach((startIdx, dateStr) => {
      const pct = (startIdx / (totalHours - 1)) * 100;
      const label = document.createElement("span");
      label.className = "absolute whitespace-nowrap";
      label.style.left = `${pct}%`;
      label.style.transform = "translateX(-50%)";
      label.textContent = WeatherService.formatDayLabel(dateStr);
      this.$.timelineDays.appendChild(label);
    });
    this.$.timelineDays.style.position = "relative";
    this.$.timelineDays.style.height = "16px";

    // Tick marks at 6-hour intervals
    this.$.timelineTicks.innerHTML = "";
    for (let i = 0; i < totalHours; i++) {
      const h = new Date(hourlyTimes[i] + "Z").getUTCHours();
      if (h % 6 === 0) {
        const tick = document.createElement("span");
        tick.className =
          "absolute text-[8px] text-slate-400 dark:text-slate-500 font-medium";
        tick.style.left = `${(i / (totalHours - 1)) * 100}%`;
        tick.style.transform = "translateX(-50%)";
        tick.style.top = "0";
        tick.textContent = `${h.toString().padStart(2, "0")}`;
        this.$.timelineTicks.appendChild(tick);
      }
    }

    const nowIdx = WeatherService.getCurrentHourIndex(this.weatherData);
    const nowPct = (nowIdx / (totalHours - 1)) * 100;

    this.$.nowIndicator.style.left = `${nowPct}%`;
    this.$.nowIndicator.classList.remove("hidden");
    this.$.timelineSlider.style.setProperty("--now-position", `${nowPct}%`);
    this.updateTrackColors();
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
    const date = new Date(timeStr + "Z");
    const timeLabel = date.toLocaleString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    const tempLabel = temp != null ? `${Math.round(temp)}°` : "--°";
    tip.textContent = `${timeLabel} • ${tempLabel}`;
    const slider = this.$.timelineSlider;
    const pct = hourIndex / (slider.max - slider.min);
    tip.style.left = `${pct * 100}%`;
    tip.classList.remove("hidden");
  }

  resetView() {
    if (!this.map) return;
    this.map.invalidateSize();
    this.map.setView([20.0, 0.0], 3, { animate: true });
    this.showToast("Map view reset", "info");
  }

  updateTrackColors() {
    if (!this.weatherData?.hourly?.weather_code) return;
    const totalHours = this.weatherData.hourly.time.length;
    const colors = [];
    for (let i = 0; i < totalHours; i++) {
      const code = this.weatherData.hourly.weather_code[i];
      let color;
      if (code >= 95) color = "#dc2626";
      else if (code >= 71 && code <= 77) color = "#e0e7ff";
      else if (code >= 51 && code <= 67) color = "#60a5fa";
      else if (code >= 80 && code <= 86) color = "#3b82f6";
      else if (code >= 61 && code <= 66) color = "#2563eb";
      else if (code >= 45 && code <= 48) color = "#94a3b8";
      else if (code >= 3 && code <= 4) color = "#94a3b8";
      else if (code === 2) color = "#cbd5e1";
      else color = "#fbbf24";
      colors.push(color);
    }
    const stops = colors
      .map((c, i) => `${c} ${(i / (totalHours - 1)) * 100}%`)
      .join(", ");
    this.$.timelineSlider.style.setProperty(
      "--track-colors",
      `linear-gradient(to right, ${stops})`,
    );
    this.$.timelineSlider.style.background = `linear-gradient(to right, ${stops})`;
  }

  handleTimelineChange(hourIndex) {
    if (!this.weatherData || this._timelinePending) return;

    this._timelinePending = true;

    // Cancel any existing animation frame to prevent queue buildup
    if (this._timelineRAF) {
      cancelAnimationFrame(this._timelineRAF);
    }

    this._timelineRAF = requestAnimationFrame(() => {
      // Invalidate cached decomposition on hour change
      this._cachedDecomposition = null;
      this._isFetching = false;
      this.updateWeatherDisplay(hourIndex);
      // Keep the minimised card in sync with the selected hour
      if (this.minimalMode) this.enterMinimalMode();
      this.updateTimelineTooltip(hourIndex);
      this.updateTrackColors();
      this._timelinePending = false;
      this._timelineRAF = null;
    });
  }

  // ================================================================
  //  WEATHER RADAR & SATELLITE OVERLAYS (RainViewer API)
  // ================================================================

  async toggleRadar() {
    this.radarActive = !this.radarActive;

    this.$.radarDot.classList.toggle("active", this.radarActive);

    if (this.overlayType === "temperature" || this.overlayType === "wind") {
      this.$.radarPlayback.classList.add("hidden");
    } else {
      this.$.radarPlayback.classList.toggle("hidden", !this.radarActive);
    }
    this.$.radarExtras.classList.toggle("hidden", !this.radarActive);

    if (this.radarActive) {
      if (this.overlayType === "temperature") {
        this.showToast("Loading temperature overlay...", "info");
        this.stopRadarPlayback();
        this.clearRadarLayers();
        this.clearTempOverlay();
        this.activeEffectType = "none";
        if (this.$.legendPrecip) this.$.legendPrecip.classList.add("hidden");
        if (this.$.legendTemp) this.$.legendTemp.classList.remove("hidden");
        await this.initTempOverlayLayers();
      } else if (this.overlayType === "wind") {
        this.showToast("Wind flow overlay active", "info");
        this.stopRadarPlayback();
        this.clearRadarLayers();
        this.clearTempOverlay();
        this.activeEffectType = "wind";
        this.initWindParticles();
        if (this.$.legendPrecip) this.$.legendPrecip.classList.add("hidden");
        if (this.$.legendTemp) this.$.legendTemp.classList.add("hidden");
        if (!this.animationFrameId) this.runWeatherCanvasLoop();
      } else {
        this.showToast(
          `Loading weather ${this.overlayType === "radar" ? "radar" : "satellite"} frames...`,
          "info",
        );
        this.clearTempOverlay();
        this.activeEffectType = "none";
        if (this.$.legendPrecip) this.$.legendPrecip.classList.remove("hidden");
        if (this.$.legendTemp) this.$.legendTemp.classList.add("hidden");
        await this.initRadarLayers();
        this.startRadarPlayback();
      }
    } else {
      this.stopRadarPlayback();
      this.clearRadarLayers();
      this.clearTempOverlay();
      this.activeEffectType = "none";
      if (this.$.legendPrecip) this.$.legendPrecip.classList.remove("hidden");
      if (this.$.legendTemp) this.$.legendTemp.classList.add("hidden");
    }

    // Expand/collapse the control panel to match radar state
    if (this.$.radarExpandedPanel) {
      this.$.radarExpandedPanel.classList.toggle("hidden", !this.radarActive);
    }
    if (this.$.radarCollapsedBtn) {
      this.$.radarCollapsedBtn.classList.toggle("hidden", this.radarActive);
    }
  }

  async initRadarLayers() {
    try {
      const response = await fetch(
        "https://api.rainviewer.com/public/weather-maps.json",
      );
      if (!response.ok) throw new Error("RainViewer API request failed");

      const data = await response.json();

      // Hide satellite option if no satellite data available
      const hasSatellite = data.satellite?.infrared?.length > 0;
      const satOption = this.$.layerTypeSelect.querySelector(
        'option[value="satellite"]',
      );
      if (satOption) satOption.hidden = !hasSatellite;
      if (this.overlayType === "satellite" && !hasSatellite) {
        this.overlayType = "radar";
        this.$.layerTypeSelect.value = "radar";
      }

      // Reset opacity from slider
      this.radarOpacity = parseInt(this.$.radarOpacitySlider.value, 10) / 100;

      let allFrames = [];
      if (this.overlayType === "radar") {
        const pastFrames = data.radar.past || [];
        const nowcastFrames = data.radar.nowcast || [];
        allFrames = [...pastFrames, ...nowcastFrames];
      } else {
        allFrames = (data.satellite.infrared || []).slice(-8);
      }

      this.clearRadarLayers();
      this.radarTimestamps = allFrames.map((f) => f.time);
      this._radarFrameData = allFrames;
      this.radarLayers = [];
      this.radarIndex = -1;
      this.setRadarFrame(0);

      this.$.radarOpacitySlider.oninput = () => {
        this.radarOpacity = parseInt(this.$.radarOpacitySlider.value, 10) / 100;
        if (this.radarLayers[this.radarIndex]) {
          this.radarLayers[this.radarIndex].setOpacity(this.radarOpacity);
        }
      };

      this._frameCache = new Map();
    } catch (error) {
      console.error("Radar init error:", error);
      this.showToast("Could not load map overlays.", "error");
      if (this.radarActive) this.toggleRadar();
    }
  }

  _getOrCreateRadarLayer(index) {
    const layer = this.radarLayers[index];
    if (layer) return layer;
    const frame = this._radarFrameData?.[index];
    if (!frame) return null;
    const newLayer = L.tileLayer(
      `https://tilecache.rainviewer.com${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
      {
        opacity: 0.0,
        zIndex: 500,
        maxZoom: 18,
        maxNativeZoom: 7,
        noWrap: true,
      },
    );
    this.radarLayers[index] = newLayer;
    return newLayer;
  }

  setRadarFrame(newIndex) {
    if (!this.radarLayers.length && this._radarFrameData?.length) {
      this.radarLayers = new Array(this._radarFrameData.length).fill(null);
    }
    if (this.radarLayers.length === 0) return;

    // Hide old active layer
    const oldActiveLayer = this._getLayerAt(this.radarIndex);
    if (oldActiveLayer && this.radarIndex !== newIndex) {
      oldActiveLayer.setOpacity(0.0);
      if (this.map.hasLayer(oldActiveLayer))
        this.map.removeLayer(oldActiveLayer);
    }

    this.radarIndex = newIndex;
    const newActiveLayer = this._getOrCreateRadarLayer(newIndex);
    if (newActiveLayer) {
      if (!this.map.hasLayer(newActiveLayer)) newActiveLayer.addTo(this.map);
      newActiveLayer.setOpacity(this.radarOpacity);
    }

    // Lazy-create and pre-load next layer
    const nextIndex =
      (this.radarIndex + 1) % (this._radarFrameData?.length || 0);
    const nextLayer = this._getOrCreateRadarLayer(nextIndex);
    if (nextLayer) {
      if (!this.map.hasLayer(nextLayer)) nextLayer.addTo(this.map);
      nextLayer.setOpacity(0.0);
    }

    // Prune: remove all other layers (free tile requests & memory)
    this.radarLayers.forEach((layer, idx) => {
      if (layer && idx !== newIndex && idx !== nextIndex) {
        if (this.map.hasLayer(layer)) this.map.removeLayer(layer);
      }
    });

    this.updateRadarTimeLabel();
  }

  _getLayerAt(index) {
    if (index < 0) return null;
    return this.radarLayers[index] ?? null;
  }

  toggleRadarPlayback() {
    if (this.radarPlaying) {
      this.pauseRadarPlayback();
    } else {
      this.startRadarPlayback();
    }
  }

  startRadarPlayback() {
    if (this.radarLayers.length === 0) return;
    if (this.radarTimer) clearInterval(this.radarTimer);

    this.setRadarFrame(this.radarIndex);
    this.radarPlaying = true;
    this.$.radarPlayIcon.classList.add("hidden");
    this.$.radarPauseIcon.classList.remove("hidden");

    this.radarTimer = setInterval(() => {
      const nextIdx = (this.radarIndex + 1) % this.radarLayers.length;
      this.setRadarFrame(nextIdx);
    }, 1000);
  }

  pauseRadarPlayback() {
    this.radarPlaying = false;
    this.$.radarPlayIcon.classList.remove("hidden");
    this.$.radarPauseIcon.classList.add("hidden");
    clearInterval(this.radarTimer);
  }

  stopRadarPlayback() {
    this.pauseRadarPlayback();
    this.setRadarFrame(this.radarLayers.length - 1);
  }

  clearRadarLayers() {
    // Clear radar timer to prevent memory leaks
    if (this.radarTimer) {
      clearInterval(this.radarTimer);
      this.radarTimer = null;
    }

    // Remove all radar layers from map
    this.radarLayers.forEach((layer) => {
      if (layer && this.map.hasLayer(layer)) {
        this.map.removeLayer(layer);
      }
    });
    this.radarLayers = [];
    this.radarTimestamps = [];
  }

  updateRadarTimeLabel() {
    if (this.radarTimestamps[this.radarIndex]) {
      const timestamp = this.radarTimestamps[this.radarIndex];
      const date = new Date(timestamp * 1000);
      this.$.radarTimeLabel.textContent = date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      this.$.radarTimeLabel.textContent = "--:--";
    }
  }

  // ================================================================
  //  SAVED LOCATIONS / BOOKMARKS FAVORITES
  // ================================================================

  async loadBookmarks() {
    this.bookmarks = (await this._loadBookmarksFromStorage()) || [];
    this.renderBookmarksList();
    this.refreshBookmarkPins();
  }

  async _loadBookmarksFromStorage() {
    if (!this._fb?.firestore) return [];
    try {
      const snapshot = await this._fb.firestore
        .collection(`users/${this.user?.uid}/bookmarks`)
        .get();
      return snapshot.docs.map((doc) => doc.data());
    } catch (e) {
      console.error("Failed to load bookmarks:", e);
      return [];
    }
  }

  saveBookmarks() {
    this.renderBookmarksList();
    this.updateStarUI();
    this.refreshBookmarkPins();
    this.saveUserDataToCloud();
  }

  toggleFavoriteCurrentLocation() {
    if (this.selectedLat == null || this.selectedLng == null) return;

    if (!this.user) {
      this.toggleAccountDialog(true);
      this.showToast("Sign in with Google to save bookmarks", "info");
      return;
    }

    const isFav = this.isCurrentLocationFavorited();
    if (isFav) {
      this.bookmarks = this.bookmarks.filter(
        (b) =>
          Math.abs(b.lat - this.selectedLat) > 0.0001 ||
          Math.abs(b.lng - this.selectedLng) > 0.0001,
      );
      this.showToast("Removed location from bookmarks.", "success");
    } else {
      this.bookmarks.push({
        name: this.selectedName,
        lat: this.selectedLat,
        lng: this.selectedLng,
      });
      this.showToast("Saved location to bookmarks.", "success");
    }
    this.saveBookmarks();
  }

  isCurrentLocationFavorited() {
    if (this.selectedLat == null || this.selectedLng == null) return false;
    return this.bookmarks.some(
      (b) =>
        Math.abs(b.lat - this.selectedLat) < 0.0001 &&
        Math.abs(b.lng - this.selectedLng) < 0.0001,
    );
  }

  updateStarUI() {
    const isFav = this.isCurrentLocationFavorited();
    this.$.starOutlineIcon.classList.toggle("hidden", isFav);
    this.$.starFilledIcon.classList.toggle("hidden", !isFav);
  }

  toggleHomeLocation() {
    if (this.selectedLat == null || this.selectedLng == null) return;

    if (
      this.defaultLocation &&
      Math.abs(this.defaultLocation.lat - this.selectedLat) < 0.0001 &&
      Math.abs(this.defaultLocation.lng - this.selectedLng) < 0.0001
    ) {
      this.defaultLocation = null;
      this.defaultLocationNotify = false;
      this.setupHourlyNotifications();
      this.showToast("Home location removed.", "success");
    } else {
      this.defaultLocation = {
        lat: this.selectedLat,
        lng: this.selectedLng,
        name:
          this.selectedName ||
          `${this.selectedLat.toFixed(4)}, ${this.selectedLng.toFixed(4)}`,
      };
      this.showToast(`Home set to ${this.defaultLocation.name}`, "success");
    }

    this.updateHomeButton();
    this.updateHomeMarker();
    this.updateSettingsUIFromLocal();
    this.saveUserDataToCloud();
  }

  updateHomeButton() {
    const isHome =
      this.defaultLocation &&
      this.selectedLat &&
      Math.abs(this.defaultLocation.lat - this.selectedLat) < 0.0001 &&
      Math.abs(this.defaultLocation.lng - this.selectedLng) < 0.0001;
    if (this.$.homeOutlineIcon && this.$.homeFilledIcon) {
      this.$.homeOutlineIcon.classList.toggle("hidden", isHome);
      this.$.homeFilledIcon.classList.toggle("hidden", !isHome);
    }
    if (this.$.homeToggleBtn) {
      this.$.homeToggleBtn.title = isHome
        ? "Remove home location"
        : "Set as home location";
    }
    if (this.$.panelLocationName && isHome) {
      const badge = this.$.panelLocationName.querySelector(".home-badge");
      if (!badge) {
        const el = document.createElement("span");
        el.className =
          "home-badge text-[10px] font-bold text-amber-600 dark:text-amber-400 ml-1";
        el.textContent = "🏠 Home";
        this.$.panelLocationName.appendChild(el);
      }
    } else if (this.$.panelLocationName) {
      const badge = this.$.panelLocationName.querySelector(".home-badge");
      if (badge) badge.remove();
    }
  }

  updateHomeMarker() {
    if (this._homeMarker) {
      this._homeMarker.remove();
      this._homeMarker = null;
    }
    if (this.defaultLocation) {
      const icon = L.divIcon({
        className: "home-marker",
        html: '<div style="font-size:22px;line-height:1;text-align:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.4))">🏠</div>',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      this._homeMarker = L.marker(
        [this.defaultLocation.lat, this.defaultLocation.lng],
        { icon, zIndexOffset: 1000 },
      ).addTo(this.map);
      this._homeMarker.bindTooltip(this.defaultLocation.name, {
        direction: "top",
        offset: L.point(0, -14),
        className: "home-tooltip",
      });
      this._homeMarker.on("click", () => {
        this.selectLocation(
          this.defaultLocation.lat,
          this.defaultLocation.lng,
          this.defaultLocation.name,
        );
      });
    }
  }

  renderBookmarksList() {
    // Clear existing content to avoid duplicate event listeners
    this.$.bookmarksList.innerHTML = "";

    if (this.bookmarks.length === 0) {
      this.$.bookmarksList.innerHTML = `
                <div class="px-3 py-3 text-xs text-slate-400 text-center">No saved locations</div>
            `;
      return;
    }

    // Create DOM elements without innerHTML to avoid XSS
    this.bookmarks.forEach((b, idx) => {
      const container = document.createElement("div");
      container.className =
        "flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg group";

      // Item button
      const btn = document.createElement("button");
      btn.className =
        "bookmark-item-btn text-left truncate flex-1 font-semibold text-slate-700 dark:text-slate-200";
      btn.dataset.index = idx;
      btn.textContent = b.name;
      btn.addEventListener("click", () => {
        this.$.bookmarksDropdown.classList.add("hidden");
        this.selectLocation(b.lat, b.lng, b.name);
      });
      container.appendChild(btn);

      // Action buttons container
      const actions = document.createElement("div");
      actions.className = "flex items-center gap-1.5";

      // Compare button
      const compareBtn = document.createElement("button");
      compareBtn.className =
        "bookmark-compare-btn px-1.5 py-0.5 rounded text-[10px] font-bold text-primary dark:text-primary-light hover:bg-primary/10 transition-colors";
      compareBtn.dataset.index = idx;
      compareBtn.title = "Compare weather with active location";
      compareBtn.textContent = "Compare";
      compareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.$.bookmarksDropdown.classList.add("hidden");
        this.compareWeatherWithActive(this.bookmarks[idx]);
      });
      actions.appendChild(compareBtn);

      // Remove button
      const removeBtn = document.createElement("button");
      removeBtn.className =
        "bookmark-remove-btn p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity";
      removeBtn.dataset.index = idx;
      removeBtn.title = "Delete bookmark";

      const icon = document.createElement("svg");
      icon.className = "w-4 h-4";
      icon.setAttribute("fill", "none");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "2");
      icon.innerHTML =
        '<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />';

      removeBtn.appendChild(icon);
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.bookmarks.splice(idx, 1);
        this.saveBookmarks();
      });
      actions.appendChild(removeBtn);
      container.appendChild(actions);

      this.$.bookmarksList.appendChild(container);
    });
  }

  // ================================================================
  //  COMPARE CITIES VIEW
  // ================================================================

  async compareWeatherWithActive(favLocation) {
    if (!this.weatherData || !this.selectedLat || !this.selectedLng) {
      this.showToast(
        "Please select a main location on the map first.",
        "error",
      );
      return;
    }

    const latDiff = Math.abs(this.selectedLat - favLocation.lat);
    const lngDiff = Math.abs(this.selectedLng - favLocation.lng);
    if (latDiff < 0.01 && lngDiff < 0.01) {
      this.showToast(
        "You cannot compare a location with itself. Select a different location on the map first.",
        "warning",
      );
      return;
    }

    this.showToast(`Comparing with ${favLocation.name}...`, "info");

    try {
      // Fetch details of target comparison location
      const [forecastB, airQualityB] = await Promise.all([
        WeatherService.fetchForecast(favLocation.lat, favLocation.lng),
        WeatherService.fetchAirQuality(favLocation.lat, favLocation.lng),
      ]);

      const idxA = parseInt(this.$.timelineSlider.value, 10);
      const idxB = WeatherService.getCurrentHourIndex(forecastB);

      const wA = WeatherService.getHourlyAtIndex(this.weatherData, idxA);
      const wB = WeatherService.getHourlyAtIndex(forecastB, idxB);

      // Extract AQIs
      const aqiA = this.airQualityData?.hourly?.us_aqi[idxA] ?? "--";
      const aqiB = airQualityB?.hourly?.us_aqi[idxB] ?? "--";

      // Populate text comparisons
      this.$.compareHeading.textContent = `${this.selectedName.split(",")[0]} vs ${favLocation.name.split(",")[0]}`;
      this.$.compareTempA.textContent = WeatherService.formatTemp(
        wA.temperature,
      );
      this.$.compareTempB.textContent = WeatherService.formatTemp(
        wB.temperature,
      );

      this.$.compareWindA.textContent = WeatherService.formatWind(wA.windSpeed);
      this.$.compareWindB.textContent = WeatherService.formatWind(wB.windSpeed);

      this.$.compareAQIA.textContent = aqiA;
      this.$.compareAQIB.textContent = aqiB;

      this.$.compareHumidityA.textContent = `${wA.humidity ?? "--"}%`;
      this.$.compareHumidityB.textContent = `${wB.humidity ?? "--"}%`;

      this.$.compareDescA.textContent = `${wA.icon} ${wA.description}`;
      this.$.compareDescB.textContent = `${wB.icon} ${wB.description}`;

      // Open compare panel
      this.showComparePanel();
    } catch (e) {
      console.error("Compare fetch failed:", e);
      this.showToast("Could not load comparison data.", "error");
    }
  }

  showComparePanel() {
    this.$.comparePanel.classList.remove("hidden");
    setTimeout(() => {
      this.$.comparePanel.classList.add("open");
      if (
        window.innerWidth < 640 &&
        this.$.radarExpandedPanel &&
        !this.$.radarExpandedPanel.classList.contains("hidden")
      ) {
        this.$.radarExpandedPanel.classList.add("hidden");
        this.$.radarCollapsedBtn.classList.remove("hidden");
      }
    }, 50);
  }

  hideComparePanel() {
    this.$.comparePanel.classList.remove("open");
    setTimeout(() => this.$.comparePanel.classList.add("hidden"), 400);
  }

  // ================================================================
  //  UNIT TOGGLE (°C/°F, km/h/mph)
  // ================================================================

  toggleUnits() {
    const current = WeatherService.getUnits();
    const next = current === "metric" ? "imperial" : "metric";
    WeatherService.setUnits(next);
    this.syncUnitLabel();

    // Re-render all weather data
    if (this.weatherData) {
      this.updateWeatherDisplay(parseInt(this.$.timelineSlider.value, 10));
      this.createWeatherMarker(this.selectedLat, this.selectedLng);
    }

    this.showToast(
      `Switched to ${next === "imperial" ? "°F / mph" : "°C / km/h"}`,
      "success",
    );
    this.updateSettingsUIFromLocal();
    this.saveUserDataToCloud();
  }

  syncUnitLabel() {
    // Unit label was in the top bar (removed — now only in settings)
  }

  // ================================================================
  //  SHARE WEATHER
  // ================================================================

  async shareWeather() {
    if (!this.weatherData) {
      this.showToast("No weather data to share.", "error");
      return;
    }

    const weather = WeatherService.getHourlyAtIndex(
      this.weatherData,
      parseInt(this.$.timelineSlider.value, 10),
    );
    if (!weather) return;

    const time = WeatherService.formatDateTime(
      weather.time,
      this.weatherData?.timezone,
      this.weatherData?.utc_offset_seconds,
    );
    const aqiVal =
      this.airQualityData?.hourly?.us_aqi[
        parseInt(this.$.timelineSlider.value, 10)
      ];
    const aqiText = aqiVal != null ? ` | AQI: ${Math.round(aqiVal)}` : "";
    const gust =
      weather.windGusts != null
        ? ` | Gusts: ${WeatherService.formatWind(weather.windGusts)}`
        : "";
    const pressure =
      weather.pressure != null
        ? ` | Pressure: ${WeatherService.formatPressure(weather.pressure)}`
        : "";
    const uv =
      weather.uvIndex != null ? ` | UV: ${weather.uvIndex.toFixed(1)}` : "";
    const vis =
      weather.visibility != null
        ? ` | Visibility: ${WeatherService.formatVisibility(weather.visibility)}`
        : "";
    const clouds =
      weather.cloudCover != null ? ` | Clouds: ${weather.cloudCover}%` : "";
    const precip =
      weather.precipProb != null && weather.precipProb > 0
        ? ` | Precip: ${weather.precipProb}%`
        : "";

    const text = `${this.selectedName} — ${WeatherService.formatTemp(weather.temperature)} ${weather.icon} ${weather.description}
${time}
Feels like ${WeatherService.formatTemp(weather.feelsLike)} | Humidity: ${weather.humidity}%
Wind: ${WeatherService.formatWind(weather.windSpeed)} ${WeatherService.getWindDirection(weather.windDirection)}${gust}${pressure}${uv}${vis}${clouds}${precip}${aqiText}`;

    // Try native share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: "Aurafisky", text: text });
        return;
      } catch (e) {
        // User cancelled or API failed, fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
      this.showToast("Weather copied to clipboard!", "success");
    } catch (e) {
      this.showToast("Could not copy to clipboard.", "error");
    }
  }

  // ================================================================
  //  HOURLY FORECAST SCROLL STRIP
  // ================================================================

  renderHourlyStrip(currentIdx) {
    if (!this.weatherData || !this.weatherData.hourly) return;

    const h = this.weatherData.hourly;
    const nowIdx = WeatherService.getCurrentHourIndex(this.weatherData);
    const limit = Math.min(h.time.length, nowIdx + 48);

    const allHours = [];
    for (let i = nowIdx; i < limit; i++) {
      allHours.push(i);
    }

    this.renderHourlyTabContent(allHours, nowIdx);
  }

  renderHourlyTabContent(hours, nowIdx) {
    const container = this.$.hourlyTabContent;
    if (!container) return;
    const h = this.weatherData.hourly;

    const hourlyHTML = hours
      .map((i) => {
        const temp = h.temperature_2m[i];
        const code = h.weather_code[i];
        const isDay = h.is_day ? h.is_day[i] : 1;
        const info = WeatherService.getWeatherInfo(code, isDay);
        const precipProb = h.precipitation_probability?.[i] || 0;
        const wind = h.wind_speed_10m?.[i];
        const humidity = h.relative_humidity_2m?.[i];
        const isNow = i === nowIdx;
        const timeStr = new Date(h.time[i]).toLocaleTimeString([], {
          hour: "numeric",
          hour12: true,
        });

        return `<button class="hourly-row w-full flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-left transition-colors ${isNow ? "bg-primary/10 border border-primary/20" : "hover:bg-slate-100/60 dark:hover:bg-slate-800/40 border border-transparent"}" data-idx="${i}" aria-label="${isNow ? "Now" : timeStr}: ${info.description}">
<span class="w-7 sm:w-10 text-[9px] sm:text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex-shrink-0">${isNow ? "Now" : timeStr}</span>
<span class="text-base sm:text-lg flex-shrink-0 w-5 sm:w-7 text-center">${info.icon}</span>
<span class="w-7 sm:w-10 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex-shrink-0">${WeatherService.formatTemp(temp)}</span>
${precipProb > 0 ? `<span class="text-[9px] sm:text-[10px] text-blue-500 font-semibold w-7 sm:w-10 flex-shrink-0">${precipProb}%</span>` : '<span class="w-7 sm:w-10 flex-shrink-0"></span>'}
<span class="text-[9px] sm:text-[10px] text-slate-400 flex-1 min-w-0 truncate">${wind != null ? `💨 ${WeatherService.formatWind(wind)}` : ""}</span>
<span class="text-[9px] sm:text-[10px] text-slate-400 w-7 sm:w-10 flex-shrink-0 text-right">${humidity != null ? `💧${humidity}%` : ""}</span>
</button>`;
      })
      .join("");

    container.querySelectorAll(".hourly-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this.$.timelineSlider.value = idx;
        this.handleTimelineChange(idx);
      });
    });
  }

  // ================================================================
  //  BEST OUTDOOR WINDOW
  // ================================================================

  renderBestOutdoorWindow(startIdx) {
    const bestWindow = WeatherService.findBestOutdoorWindow(
      this.weatherData,
      startIdx,
    );

    if (!bestWindow) {
      this.$.bestWindowCard.classList.add("hidden");
      return;
    }

    const startTime = new Date(bestWindow.startTime).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const endTime = new Date(bestWindow.endTime).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    this.$.bestWindowText.textContent = `${startTime} – ${endTime} (${bestWindow.hours}h, avg ${WeatherService.formatTemp(bestWindow.avgTemp)}, no rain)`;
    this.$.bestWindowCard.classList.remove("hidden");
  }

  // ================================================================
  //  TEMPORAL COMPRESSION GRID
  // ================================================================

  renderTemporalGrid(matrices) {
    if (!matrices || !this.$.dailyForecast) return;
    const todayStr = new Date().toLocaleDateString("en-CA");
    const future = matrices.filter((m) => m.date >= todayStr).slice(0, 7);

    if (future.length === 0) return;

    const gridRows = future
      .map((day) => {
        const isToday = day.date === todayStr;
        const dayLabel = isToday
          ? "Today"
          : WeatherService.formatDayLabel(day.date);
        const cols = day.blocks
          .map(
            (b) =>
              `<div class="temporal-block" style="background:${this._blockColor(b.code, b.hour)}" title="${b.hour}:00 - ${b.hour + 3}:00">${b.icon}</div>`,
          )
          .join("");
        return `
        <div class="flex flex-col">
          <div class="temporal-day-label">${dayLabel}</div>
          <div class="temporal-grid">${cols}</div>
          <div class="text-[8px] text-slate-400 text-center mt-0.5">${WeatherService.formatTemp(day.minTemp)}-${WeatherService.formatTemp(day.maxTemp)}</div>
        </div>
      `;
      })
      .join("");

    const dailyHTML = `
       <div class="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">${gridRows}</div>
     `;
    this.setSafeHTML(this.$.dailyForecast, dailyHTML);
  }

  _blockColor(code, hour) {
    const isDay = hour >= 6 && hour < 18;
    if (code === 0 || code === 1)
      return isDay ? "rgba(253,224,71,0.15)" : "rgba(148,163,184,0.1)";
    if (code >= 2 && code <= 3) return "rgba(148,163,184,0.2)";
    if (code >= 45 && code <= 48) return "rgba(148,163,184,0.15)";
    if (code >= 51 && code <= 57) return "rgba(96,165,250,0.2)";
    if (code >= 61 && code <= 67) return "rgba(59,130,246,0.25)";
    if (code >= 71 && code <= 77) return "rgba(167,243,208,0.2)";
    if (code >= 80 && code <= 82) return "rgba(59,130,246,0.3)";
    if (code >= 85 && code <= 86) return "rgba(167,243,208,0.25)";
    if (code >= 95) return "rgba(168,85,247,0.25)";
    return isDay ? "rgba(253,224,71,0.08)" : "rgba(148,163,184,0.05)";
  }

  // ================================================================
  //  COMFORT INDEX DISPLAY
  // ================================================================

  updateComfortDisplay(score, info) {
    if (score == null || !info) {
      this.$.comfortIndex.textContent = "--";
      this.$.comfortLabel.textContent = "";
      return;
    }
    this.$.comfortIndex.textContent = `${score}`;
    this.$.comfortIndex.className = `text-lg font-extrabold ${info.color}`;
    this.$.comfortLabel.textContent = `${info.icon} ${info.label}`;
    this.$.comfortLabel.className = `text-[10px] font-semibold ${info.color}`;
  }

  // ================================================================
  //  PRESSURE TENDENCY
  // ================================================================

  updatePressureTendency(tendency) {
    if (!tendency) {
      this.$.pressureTendency.textContent = "";
      return;
    }
    const emoji =
      tendency.direction === "falling"
        ? "📉"
        : tendency.direction === "rising"
          ? "📈"
          : "➡️";
    this.$.pressureTendency.textContent = `${emoji} ${tendency.label} (${tendency.rate.toFixed(1)} hPa/h) — ${tendency.desc}`;
    this.$.pressureTendency.className = `text-[10px] font-medium mt-0.5 ${
      tendency.direction === "falling"
        ? "text-red-500"
        : tendency.direction === "rising"
          ? "text-emerald-500"
          : "text-slate-400"
    }`;
  }

  updateTempDelta(hourIndex) {
    if (!this.weatherData || hourIndex <= 0) {
      this.$.panelTempDelta.classList.add("hidden");
      return;
    }
    const prev = WeatherService.getHourlyAtIndex(
      this.weatherData,
      hourIndex - 1,
    );
    const curr = WeatherService.getHourlyAtIndex(this.weatherData, hourIndex);
    if (
      !prev ||
      !curr ||
      curr.temperature == null ||
      prev.temperature == null
    ) {
      this.$.panelTempDelta.classList.add("hidden");
      return;
    }
    const diff = curr.temperature - prev.temperature;
    if (Math.abs(diff) < 0.5) {
      this.$.panelTempDelta.classList.add("hidden");
      return;
    }
    const arrow = diff > 0 ? "▲" : "▼";
    const cls = diff > 0 ? "text-red-500" : "text-blue-500";
    this.$.panelTempDelta.textContent = `${arrow} ${diff > 0 ? "+" : ""}${diff.toFixed(1)}°`;
    this.$.panelTempDelta.className = `text-xs font-semibold ${cls}`;
    this.$.panelTempDelta.classList.remove("hidden");
  }

  // ================================================================
  //  TIMELINE DELTAS (rate of change)
  // ================================================================

  renderTimelineDeltas(deltas) {
    if (!deltas) {
      this.$.timelineDelta.textContent = "";
      return;
    }
    const parts = [];
    if (deltas.tempDiff != null) {
      const sign = deltas.tempDiff > 0 ? "+" : "";
      const cls =
        deltas.tempDiff > 0
          ? "text-red-400"
          : deltas.tempDiff < 0
            ? "text-blue-400"
            : "text-slate-400";
      parts.push(
        `<span class="${cls}">${sign}${deltas.tempDiff.toFixed(1)}°C/h</span>`,
      );
    }
    if (deltas.windDiff != null) {
      const sign = deltas.windDiff > 0 ? "+" : "";
      parts.push(
        `<span class="text-slate-400">${sign}${deltas.windDiff.toFixed(0)} km/h wind</span>`,
      );
    }
    if (deltas.pressureDiff != null) {
      const sign = deltas.pressureDiff > 0 ? "+" : "";
      const cls =
        deltas.pressureDiff > 0.3
          ? "text-emerald-500"
          : deltas.pressureDiff < -0.3
            ? "text-red-500"
            : "text-slate-400";
      parts.push(
        `<span class="${cls}">${sign}${deltas.pressureDiff.toFixed(1)} hPa</span>`,
      );
    }
    this.$.timelineDelta.innerHTML = parts.join(" · ");
    this.$.timelineDelta.className = "text-[10px] font-medium flex gap-2";
  }

  // ================================================================
  //  NEXT RAIN BUTTON
  // ================================================================

  updateNextRainButton(currentIdx) {
    const nextRain = WeatherService.findNextRainHour(
      this.weatherData,
      currentIdx,
    );
    if (nextRain != null) {
      this.$.nextRainBtn.classList.remove("hidden");
      const timeStr = new Date(
        this.weatherData.hourly.time[nextRain],
      ).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      // Use textContent to avoid innerHTML injection
      this.$.nextRainBtn.textContent = `🌧️ Next rain ${timeStr}`;
      // Store the target index for the click handler (#2)
      this.$.nextRainBtn.dataset.rainIdx = nextRain;
    } else {
      this.$.nextRainBtn.classList.add("hidden");
    }
  }

  /** Jumps timeline to the next forecasted rain hour (#2). */
  jumpToNextRain() {
    const idx = parseInt(this.$.nextRainBtn.dataset.rainIdx, 10);
    if (!isNaN(idx)) {
      this.$.timelineSlider.value = idx;
      this.handleTimelineChange(idx);
    }
  }

  // ================================================================
  //  PREDICTIVE ARRIVAL (weather coming your way)
  // ================================================================

  async updatePredictiveArrival(weather, hourIndex) {
    if (!weather || !this.weatherData || !this.$.predictiveArrival) return;
    const windDir = weather.windDirection;
    if (windDir == null || windDir < 0) {
      this.$.predictiveArrival.classList.add("hidden");
      return;
    }
    const upwind = WeatherService.getUpwindPoint(
      this.selectedLat,
      this.selectedLng,
      windDir,
    );
    if (!upwind) {
      this.$.predictiveArrival.classList.add("hidden");
      return;
    }

    const lastWinder = this._lastPredictiveWindDir;
    if (lastWinder != null && Math.abs(windDir - lastWinder) < 22.5) {
      const lastData = this._lastPredictiveUpwindData;
      if (
        lastData &&
        lastData.lat === upwind.lat &&
        lastData.lng === upwind.lng
      ) {
        const nowIdx = WeatherService.getCurrentHourIndex(lastData.data);
        const upwindWeather = WeatherService.getHourlyAtIndex(
          lastData.data,
          nowIdx,
        );
        if (upwindWeather) {
          const travelHours = 2;
          const predHTML = `<span class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">🌬️ Coming your way</span><span class="text-xs text-slate-600 dark:text-slate-300">${upwindWeather.icon} ${upwindWeather.description}, ${WeatherService.formatTemp(upwindWeather.temperature)} arriving in ~${travelHours}h from the ${WeatherService.getWindDirection(windDir)}</span>`;
          this.setSafeHTML(this.$.predictiveArrival, predHTML);
          this.$.predictiveArrival.classList.remove("hidden");
          return;
        }
      }
    }
    this._lastPredictiveWindDir = windDir;

    let upwindData = null;
    try {
      upwindData = await WeatherService.fetchForecast(upwind.lat, upwind.lng);
    } catch {
      this.$.predictiveArrival.classList.add("hidden");
      return;
    }
    this._lastPredictiveUpwindData = {
      data: upwindData,
      lat: upwind.lat,
      lng: upwind.lng,
    };

    const nowIdx = WeatherService.getCurrentHourIndex(upwindData);
    const upwindWeather = WeatherService.getHourlyAtIndex(upwindData, nowIdx);
    if (!upwindWeather) {
      this.$.predictiveArrival.classList.add("hidden");
      return;
    }

    const travelHours = 2;
    const predHTML = `<span class="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">🌬️ Coming your way</span><span class="text-xs text-slate-600 dark:text-slate-300">${upwindWeather.icon} ${upwindWeather.description}, ${WeatherService.formatTemp(upwindWeather.temperature)} arriving in ~${travelHours}h from the ${WeatherService.getWindDirection(windDir)}</span>`;
    this.setSafeHTML(this.$.predictiveArrival, predHTML);
    this.$.predictiveArrival.classList.remove("hidden");
  }

  // ================================================================
  //  DATA EXPORT
  // ================================================================

  // ================================================================
  //  EXTREME MINIMAL MODE
  // ================================================================

  enterMinimalMode() {
    document.documentElement.classList.add("compact");
    const panel = this.$.weatherPanel;
    // Snapshot the full panel only once (first minimize), so re-entering
    // minimal mode never overwrites the full content with the minified card.
    if (!panel.dataset.fullContent) panel.dataset.fullContent = panel.innerHTML;
    const minimalHTML = `
      <div class="flex items-center justify-between px-5 pt-5 pb-3">
        <div class="min-w-0 flex-1">
          <h3 class="text-lg font-bold truncate text-slate-900 dark:text-white">${this.selectedName || "Weather"}</h3>
        </div>
        <button id="minimalExitBtn" class="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-600/40 transition-colors flex-shrink-0" aria-label="Exit minimal mode">
          <svg class="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>
      <div class="flex-1 flex items-center justify-center px-5 pb-5">
        <div class="text-center">
          <div class="text-7xl mb-3">${this.$.panelIcon.textContent}</div>
          <div class="text-6xl font-extrabold text-slate-900 dark:text-white mb-2">${this.$.panelTemp.textContent}</div>
          <div class="text-lg text-slate-500 dark:text-slate-400 mb-1">${this.$.panelDescription.textContent}</div>
          <div class="text-sm text-slate-400">${WeatherService.formatDateTime(this.weatherData?.hourly?.time[parseInt(this.$.timelineSlider.value)], this.weatherData?.timezone, this.weatherData?.utc_offset_seconds)}</div>
        </div>
      </div>
    `;
    this.setSafeHTML(panel, minimalHTML);
    panel
      .querySelector("#minimalExitBtn")
      .addEventListener("click", () => this.toggleMinimalMode());
  }

  toggleMinimalMode() {
    this.minimalMode = !this.minimalMode;
    if (this.minimalMode) {
      this.enterMinimalMode();
    } else {
      const panel = this.$.weatherPanel;
      panel.innerHTML = panel.dataset.fullContent || "";
      this.rebindPanelEvents();
      // Ensure the full panel is shown (re-entry from minimal mode may have
      // left the original .open class, but re-add to be safe so the card is visible)
      panel.classList.add("open");
      panel.classList.remove("minimized");
      document.documentElement.classList.remove("compact");
      this.updateHomeButton();
      this.updateHomeMarker();
    }
    this.updateSettingsUIFromLocal();
    this.saveUserDataToCloud();
  }

  rebindPanelEvents() {
    const ids = [
      "panelCloseBtn",
      "panelMinimizeBtn",
      "homeToggleBtn",
      "homeOutlineIcon",
      "homeFilledIcon",
      "favoriteToggleBtn",
      "starOutlineIcon",
      "starFilledIcon",
      "shareWeatherBtn",
      "panelLocationName",
      "panelTempDelta",
      "panelTimeLabel",
      "panelIcon",
      "panelTemp",
      "panelDescription",
      "panelFeelsLike",
      "panelHumidity",
      "panelWind",
      "windArrow",
      "panelDewPoint",
      "panelWindGusts",
      "panelVisibility",
      "panelPressure",
      "pressureTendency",
      "panelClouds",
      "panelUV",
      "panelPrecip",
      "aqiCard",
      "panelAQILabel",
      "panelAQIMetrics",
      "panelAQIBadge",
      "advisoryBanner",
      "advisoryIcon",
      "advisoryTitle",
      "advisoryDesc",
      "comfortIndex",
      "comfortLabel",
      "hourlyStrip",
      "bestWindowCard",
      "bestWindowText",
      "dailyForecast",
      "trendSvg",
      "chartHours",
      "chartLine",
      "chartArea",
      "chartPoints",
      "timeMachineTrigger",
      "timeMachineChevron",
      "timeMachineDrawer",
      "timeMachineSvg",
      "timeMachineLine",
      "timeMachinePoints",
      "timeMachineRows",
      "offlineTimeMachineBadge",
      "predictiveArrival",
      "anomalyLabel",
      "patternLabel",
      "nextRainBtn",
      "timelineDelta",
      "sunArcPassed",
      "sunArcDot",
      "sunSunrise",
      "sunSunset",
      "sunDayLength",
      "sunCountdown",
      "moonLitPath",
      "moonPhaseLabel",
      "moonPhasePercent",
      "moonPhaseDesc",
      "confidenceToggle",
      "signalNoiseBtn",
      "percentileLabel",
      "trustScore",
      "momentumLabel",
      "cumulativeCurve",
      "paramImportance",
      "freshnessLabel",
      "briefingBtn",
      "briefingContent",
      "regimeLabel",
      "spatialGradLabel",
      "analogLabel",
      "weatherPanelSkeleton",
      "weatherPanelContent",
      "pollenCard",
      "pollenBirch",
      "pollenGrass",
      "pollenMugwort",
      "pollenAlder",
      "uvChart",
      "zoomInBtn",
      "zoomOutBtn",
    ];

    // Detach old listeners before rebinding to prevent duplicates
    if (this._rebindCleanups) {
      this._rebindCleanups.forEach((fn) => fn());
    }
    this._rebindCleanups = [];

    const addSafe = (el, event, handler) => {
      if (!el) return;
      el.addEventListener(event, handler);
      this._rebindCleanups.push(() => el.removeEventListener(event, handler));
    };

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) this.$[id] = el;
    });

    addSafe(this.$.panelCloseBtn, "click", () => this.hideWeatherPanel());
    addSafe(this.$.panelMinimizeBtn, "click", () =>
      this.toggleMinimizeWeatherPanel(),
    );
    addSafe(this.$.homeToggleBtn, "click", () => this.toggleHomeLocation());
    addSafe(this.$.favoriteToggleBtn, "click", () =>
      this.toggleFavoriteCurrentLocation(),
    );
    addSafe(this.$.shareWeatherBtn, "click", () => this.shareWeather());
    addSafe(this.$.timeMachineTrigger, "click", () =>
      this.toggleClimateTimeMachine(),
    );
    addSafe(this.$.nextRainBtn, "click", () => this.jumpToNextRain());
    this.$.installBtn?.addEventListener("click", () => this.installPWA());
    addSafe(this.$.zoomInBtn, "click", () => this.map.zoomIn());
    addSafe(this.$.zoomOutBtn, "click", () => this.map.zoomOut());
    addSafe(this.$.signalNoiseBtn, "click", () => this.toggleSignalNoiseView());
    addSafe(this.$.confidenceToggle, "click", () => {
      this.showConfidence = !this.showConfidence;
      this.$.confidenceToggle?.classList.toggle(
        "toggle-active",
        this.showConfidence,
      );
      if (this.weatherData)
        this.drawHourlySparkline(parseInt(this.$.timelineSlider.value, 10));
    });
    addSafe(this.$.briefingBtn, "click", () => this.generateBriefing());
    this.initDashboardDrag();
  }

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

    const header = createElement(
      "div",
      { className: "search-history-label" },
      createElement("svg", {
        className: "w-3 h-3",
        innerHTML:
          '<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>',
      }),
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

  async refreshBookmarkPins() {
    // Clear existing bookmark markers
    this.bookmarkMarkers.forEach((m) => m.remove());
    this.bookmarkMarkers = [];

    if (!this.map || this.bookmarks.length === 0) return;

    // Use cached data if recent (< 5 min)
    const pinCache = this._getBookmarkPinCache();
    const now = Date.now();
    const needsFetch = this.bookmarks.filter((b) => {
      const cached = pinCache[b.lat + "_" + b.lng];
      return !cached || now - cached.ts > 300000;
    });

    if (needsFetch.length > 0) {
      // Stagger fetches to prevent API rate-limiting (#8)
      for (const b of needsFetch) {
        try {
          const forecast = await WeatherService.fetchForecast(b.lat, b.lng);
          const idx = WeatherService.getCurrentHourIndex(forecast);
          const w = WeatherService.getHourlyAtIndex(forecast, idx);
          pinCache[b.lat + "_" + b.lng] = { weather: w, ts: Date.now() };
          // 150ms delay between bookmark fetches
          await new Promise((resolve) => setTimeout(resolve, 150));
        } catch {
          // Briefly cache failure to avoid aggressive re-tries
          pinCache[b.lat + "_" + b.lng] = { weather: null, ts: Date.now() };
        }
      }
      this._saveBookmarkPinCache(pinCache);
    }

    // Render all bookmarks (mix of fresh + cached)
    this.bookmarks.forEach((b) => {
      const cached = pinCache[b.lat + "_" + b.lng];
      if (!cached || !cached.weather) return;

      const icon = L.divIcon({
        className: "bookmark-pin-icon",
        html: `
          <div class="flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 rounded-lg px-2 py-1 shadow-md border border-slate-200/40 dark:border-slate-600/30 cursor-pointer" style="white-space:nowrap;">
            <span class="text-sm">${cached.weather.icon}</span>
            <span class="text-[10px] font-bold text-slate-800 dark:text-white">${WeatherService.formatTemp(cached.weather.temperature)}</span>
          </div>
        `,
        iconSize: [70, 28],
        iconAnchor: [35, 14],
      });

      const marker = L.marker([b.lat, b.lng], { icon }).addTo(this.map);
      marker.on("click", () => this.selectLocation(b.lat, b.lng, b.name));
      this.bookmarkMarkers.push(marker);
    });
  }

  _getBookmarkPinCache() {
    return this._pinCache || {};
  }

  _saveBookmarkPinCache(cache) {
    this._pinCache = cache;
  }

  // ================================================================
  //  MAP CANVAS WEATHER EFFECTS (Rain, Snow, Windy, Storm animations)
  // ================================================================

  initWeatherCanvas() {
    this.canvas = document.getElementById("weatherCanvas");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");

    // Resize canvas to cover map exactly
    this.resizeWeatherCanvas();

    // Connect resize triggers to Leaflet zoom/move bounds
    this.map.on("zoomstart movestart", () => {
      this.canvas.style.opacity = "0"; // Hide effects during transition
    });
    this.map.on("zoomend moveend", () => {
      this.resizeWeatherCanvas();
      this.canvas.style.opacity = "1";
    });

    // Start the animation loop
    this.runWeatherCanvasLoop();
  }

  resizeWeatherCanvas() {
    if (!this.canvas) return;
    const rect = this.$.map.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  updateWeatherCanvasOverlayEffect(code, windSpeed, windDirection) {
    this.currentWindSpeed = windSpeed || 0;
    this.currentWindDirection = windDirection || 0;

    // Don't override the manual wind flow overlay
    if (this.overlayType === "wind" && this.radarActive) {
      this.initWindParticles();
      return;
    }

    let effect = "none";

    if (WeatherService.isRainCode(code)) {
      effect = "rain";
    } else if (WeatherService.isStormCode(code)) {
      effect = "storm";
    } else if (WeatherService.isSnowCode(code)) {
      effect = "snow";
    } else if (windSpeed > 25) {
      effect = "wind";
    }

    if (this.activeEffectType === effect) return;
    const wasIdle = this.activeEffectType === "none";
    this.activeEffectType = effect;
    this.particles = []; // Clear current particle arrays

    // Restart animation loop if it was paused (perf #7)
    if (wasIdle && effect !== "none" && !this.animationFrameId) {
      this.runWeatherCanvasLoop();
    }

    // Initialize particle arrays
    const w = this.canvas.width;
    const h = this.canvas.height;

    if (effect === "rain" || effect === "storm") {
      const count = effect === "storm" ? 120 : 70;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h - h,
          vyBase: 6 + Math.random() * 8,
          len: 12 + Math.random() * 16,
          opacity: 0.15 + Math.random() * 0.35,
        });
      }
    } else if (effect === "snow") {
      const count = 45;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          r: 1.5 + Math.random() * 3,
          vyBase: 0.6 + Math.random() * 1.2,
          opacity: 0.2 + Math.random() * 0.5,
          swingSpeed: 0.02 + Math.random() * 0.03,
          swingRange: 1 + Math.random() * 2,
          swingOffset: Math.random() * Math.PI,
        });
      }
    } else if (effect === "wind") {
      const count = 12;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: Math.random() * w - 100,
          y: Math.random() * h,
          vBase: 3 + Math.random() * 4,
          len: 80 + Math.random() * 140,
          opacity: 0.08 + Math.random() * 0.15,
          curveOffset: Math.random() * Math.PI,
        });
      }
    }
  }

  runWeatherCanvasLoop() {
    if (this.animationFrameId) return;
    const TWO_PI = Math.PI * 2;
    const draw = (now) => {
      if (this.activeEffectType === "none" && this.lightningFlash === 0) {
        this.animationFrameId = null;
        return;
      }

      const ctx = this.ctx;
      const w = this.canvas.width;
      const h = this.canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Lightning flash (rare, fast path)
      if (this.activeEffectType === "storm") {
        if (Math.random() < 0.004) this.lightningFlash = 0.8;
        if (this.lightningFlash > 0.01) {
          ctx.fillStyle = `rgba(255,255,255,${this.lightningFlash})`;
          ctx.fillRect(0, 0, w, h);
          this.lightningFlash *= 0.88;
        }
      }

      // Wind vectors (shared for all effects)
      const theta = (((this.currentWindDirection || 0) - 90) * Math.PI) / 180;
      const windIntensity = (this.currentWindSpeed || 0) / 10;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const windDx = cosT * windIntensity;
      const windDy = sinT * windIntensity;

      const particles = this.particles;
      const len = particles.length;

      if (
        this.activeEffectType === "rain" ||
        this.activeEffectType === "storm"
      ) {
        ctx.strokeStyle = this.isDark
          ? "rgba(129,140,248,0.45)"
          : "rgba(59,130,246,0.35)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const p = particles[i];
          const vx = windDx * 1.5 - 0.5;
          const vy = p.vyBase + (windDy > 0 ? windDy * 0.2 : 0);
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + vx, p.y + p.len);
          p.x += vx;
          p.y += vy;
          if (p.y > h) {
            p.y = -p.len;
            p.x = Math.random() * w;
          }
          if (p.x < -20) p.x = w + 20;
          else if (p.x > w + 20) p.x = -20;
        }
        ctx.stroke();
      } else if (this.activeEffectType === "snow") {
        ctx.fillStyle = this.isDark
          ? "rgba(255,255,255,0.85)"
          : "rgba(156,163,175,0.7)";
        const t = now * 0.001;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const p = particles[i];
          const vx =
            windDx * 0.6 + Math.sin(t * p.swingSpeed + p.swingOffset) * 0.2;
          const vy = p.vyBase + (windDy > 0 ? windDy * 0.05 : 0);
          ctx.moveTo(p.x, p.y);
          ctx.arc(p.x, p.y, p.r, 0, TWO_PI);
          p.y += vy;
          p.x += vx;
          if (p.y > h) {
            p.y = -p.r * 2;
            p.x = Math.random() * w;
          }
          if (p.x < -20) p.x = w + 20;
          else if (p.x > w + 20) p.x = -20;
        }
        ctx.fill();
      } else if (this.activeEffectType === "wind") {
        ctx.strokeStyle = this.isDark
          ? "rgba(255,255,255,0.2)"
          : "rgba(148,163,184,0.35)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < len; i++) {
          const p = particles[i];
          const startX = p.x;
          const startY = p.y;
          const vx = cosT * p.vBase;
          const vy = sinT * p.vBase;
          ctx.moveTo(startX, startY);
          ctx.lineTo(
            startX - cosT * p.len,
            startY -
              sinT * p.len +
              Math.sin(startX * 0.008 + p.curveOffset) * 10,
          );
          p.x += vx;
          p.y += vy;
          if (p.x > w + 200 || p.x < -300 || p.y > h + 200 || p.y < -200) {
            p.x = Math.random() * w - 50;
            p.y = Math.random() * h;
          }
        }
        ctx.stroke();
      }

      this.animationFrameId = requestAnimationFrame(draw);
    };

    this.animationFrameId = requestAnimationFrame(draw);
  }

  // ================================================================
  //  IMMERSIVE AUDIO WEATHER SOUNDSCAPES (Web Audio Synthesizer)
  // ================================================================

  toggleAmbientSoundscape(forceState) {
    if (forceState !== undefined) {
      this.audioActive = forceState;
    } else {
      this.audioActive = !this.audioActive;
    }

    if (this.$.settingsSoundToggle) {
      this.$.settingsSoundToggle.checked = this.audioActive;
    }

    if (this.audioActive) {
      if (!this.audioContext) {
        this.audioContext = new (
          window.AudioContext || window.webkitAudioContext
        )();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }
      this.showToast("Weather ambient soundscapes active.", "success");

      if (this.weatherData) {
        const weather = WeatherService.getHourlyAtIndex(
          this.weatherData,
          parseInt(this.$.timelineSlider.value, 10),
        );
        if (weather) {
          this.updateAmbientSoundscapeSynthesizer(
            weather.weatherCode,
            weather.windSpeed,
          );
        }
      }
    } else {
      this.stopAllSounds();
    }
  }

  updateAmbientSoundscapeSynthesizer(code, windSpeed) {
    if (!this.audioActive || !this.audioContext) return;

    let soundType = "calm";

    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
      soundType = "rain";
    } else if (code >= 95 && code <= 99) {
      soundType = "storm";
    } else if (windSpeed > 25) {
      soundType = "windy";
    }

    if (this.activeSoundType === soundType) return;
    this.activeSoundType = soundType;

    this.stopAllSounds();

    const ctx = this.audioContext;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(
      this.volumeLevel * 0.24,
      ctx.currentTime + 1.5,
    );
    masterGain.connect(ctx.destination);
    this.audioNodes.master = masterGain;

    // Shared noise buffer — allocate once and reuse
    if (!this._noiseBuffer) {
      const bufSize = 2 * ctx.sampleRate;
      this._noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = this._noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    if (soundType === "rain") {
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = this._noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1000;
      filter.Q.value = 1;

      whiteNoise.connect(filter);
      filter.connect(masterGain);
      whiteNoise.start();

      this.audioNodes.whiteNoise = whiteNoise;
      this.audioNodes.filter = filter;
    } else if (soundType === "storm") {
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = this._noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 800;

      whiteNoise.connect(filter);
      filter.connect(masterGain);
      whiteNoise.start();

      this.audioNodes.whiteNoise = whiteNoise;
      this.audioNodes.filter = filter;

      this.thunderInterval = setInterval(() => {
        this.triggerSynthesizedThunder(ctx, masterGain);
      }, 9000);

      this.triggerSynthesizedThunder(ctx, masterGain);
    } else if (soundType === "windy") {
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = this._noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 350;
      filter.Q.value = 3.0;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12;

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      whiteNoise.connect(filter);
      filter.connect(masterGain);

      lfo.start();
      whiteNoise.start();

      this.audioNodes.whiteNoise = whiteNoise;
      this.audioNodes.lfo = lfo;
      this.audioNodes.filter = filter;
    } else {
      this.birdsInterval = setInterval(() => {
        this.triggerBirdChirp(ctx, masterGain);
      }, 6000);

      this.triggerBirdChirp(ctx, masterGain);
    }
  }

  triggerSynthesizedThunder(ctx, destinationGain) {
    if (!this.audioActive || !ctx) return;

    const thunderOsc = ctx.createOscillator();
    thunderOsc.type = "triangle";
    thunderOsc.frequency.setValueAtTime(60, ctx.currentTime);
    thunderOsc.frequency.exponentialRampToValueAtTime(
      12,
      ctx.currentTime + 3.0,
    );

    const thunderGain = ctx.createGain();
    thunderGain.gain.setValueAtTime(0.001, ctx.currentTime);
    thunderGain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.1);
    thunderGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.0);

    thunderOsc.connect(thunderGain);
    thunderGain.connect(destinationGain);

    thunderOsc.start();
    thunderOsc.stop(ctx.currentTime + 3.5);
  }

  triggerBirdChirp(ctx, destinationGain) {
    if (!this.audioActive || !ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = "sine";

    osc.frequency.setValueAtTime(2200, now);
    osc.frequency.exponentialRampToValueAtTime(3200, now + 0.1);
    osc.frequency.setValueAtTime(2400, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(3600, now + 0.25);

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.08, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gainNode);
    gainNode.connect(destinationGain);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  stopAllSounds() {
    if (this.thunderInterval) {
      clearInterval(this.thunderInterval);
      this.thunderInterval = null;
    }
    if (this.birdsInterval) {
      clearInterval(this.birdsInterval);
      this.birdsInterval = null;
    }

    Object.keys(this.audioNodes).forEach((key) => {
      const node = this.audioNodes[key];
      if (node) {
        try {
          node.stop();
        } catch {}
        try {
          node.disconnect();
        } catch {}
      }
    });
    this.audioNodes = {};
    this.activeSoundType = null;
  }

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

    if (this.isDark) {
      if (this.map.hasLayer(this.lightTiles)) {
        this.map.removeLayer(this.lightTiles);
      }
      this.darkTiles.addTo(this.map);
    } else {
      if (this.map.hasLayer(this.darkTiles)) {
        this.map.removeLayer(this.darkTiles);
      }
      this.lightTiles.addTo(this.map);
    }

    // Update theme-color meta tag for browser chrome
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = this.isDark ? "#0f172a" : "#6366f1";
    this.updateSettingsUIFromLocal();
    this.saveUserDataToCloud();
  }

  // ================================================================
  //  MY LOCATION
  // ================================================================

  getMyLocation() {
    if (!navigator.geolocation) {
      this.showToast("Geolocation is not supported by your browser.", "error");
      return;
    }

    this.showToast("Finding your location...", "info");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        this.handleMapClick(latitude, longitude);
      },
      (err) => {
        const messages = {
          1: "Location permission denied.",
          2: "Location unavailable.",
          3: "Location request timed out.",
        };
        this.showToast(
          messages[err.code] || "Could not get your location.",
          "error",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  // ================================================================
  //  ADVANCED FEATURE METHODS
  // ================================================================

  updateTrustScore(trust) {
    if (!this.$.trustScore) return;
    if (!trust) {
      this.$.trustScore.textContent = "";
      return;
    }
    const color =
      trust.overall >= 80
        ? "text-emerald-500"
        : trust.overall >= 60
          ? "text-amber-500"
          : "text-red-500";
    this.$.trustScore.textContent = `🎯 ${trust.overall}% trust (temp ${trust.temp}%, wind ${trust.wind}%, precip ${trust.precip}%)`;
    this.$.trustScore.className = `text-[9px] font-semibold ${color}`;
  }

  updateParamImportance(importance) {
    if (!importance || importance.length === 0 || !this.$.paramImportance) {
      this.$.paramImportance.textContent = "";
      return;
    }
    this.$.paramImportance.innerHTML =
      "🔍 " +
      importance
        .map(
          (p) =>
            `<span class="font-bold ${p.impact > 10 ? "text-red-500" : "text-amber-500"}">${p.key}</span>`,
        )
        .join(" > ") +
      " limiting comfort";
    this.$.paramImportance.className = "text-[10px] text-slate-400";
  }

  toggleSignalNoiseView() {
    this.showSignal = !this.showSignal;
    this.$.signalNoiseBtn.classList.toggle("toggle-active", this.showSignal);
    if (this.weatherData) {
      this.drawHourlySparkline(parseInt(this.$.timelineSlider.value, 10));
    }
  }

  generateBriefing() {
    const hourIdx = parseInt(this.$.timelineSlider.value, 10);
    const weather = WeatherService.getHourlyAtIndex(this.weatherData, hourIdx);
    if (!weather) return;
    const aqiVal = this.airQualityData?.hourly?.us_aqi[hourIdx];
    const tendency = WeatherService.getPressureTendency(
      this.weatherData,
      hourIdx,
    );
    const windShift = WeatherService.getWindShift(this.weatherData, hourIdx);
    const anomaly = WeatherService.detectAnomaly(
      weather.temperature,
      this._historicalResults,
    );
    const daily = WeatherService.getDailyForecast(this.weatherData);
    const briefing = WeatherService.generateBriefing(
      weather,
      daily,
      aqiVal,
      tendency,
      windShift,
      anomaly,
      this.weatherData?.timezone,
      this.weatherData?.utc_offset_seconds,
    );
    if (this.$.briefingContent) {
      this.$.briefingContent.textContent = briefing;
      this.$.briefingContent.classList.remove("hidden");
    }
    this.showToast("📡 Briefing generated", "success");
  }

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
  }

  showWeatherPanel() {
    this.$.weatherPanel.classList.add("open");
    this.$.weatherPanel.classList.remove("minimized");
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

  handleVolumeChange(volume) {
    this.volumeLevel = volume;
    if (this.audioActive && this.audioNodes.master && this.audioContext) {
      this.audioNodes.master.gain.setValueAtTime(
        volume * 0.24,
        this.audioContext.currentTime,
      );
    }
  }

  // ================================================================
  //  CLIMATE TIME-MACHINE
  // ================================================================

  toggleClimateTimeMachine() {
    const drawer = this.$.timeMachineDrawer;
    const chevron = this.$.timeMachineChevron;
    const isClosed = drawer.classList.contains("hidden");

    if (isClosed) {
      drawer.classList.remove("hidden");
      chevron.classList.add("rotate-180");
      this.loadClimateTimeMachineData();
    } else {
      this.closeClimateTimeMachine();
    }
  }

  closeClimateTimeMachine() {
    this.$.timeMachineDrawer.classList.add("hidden");
    this.$.timeMachineChevron.classList.remove("rotate-180");
  }

  async loadClimateTimeMachineData() {
    const activeHourIdx = parseInt(this.$.timelineSlider.value, 10);
    const weather = WeatherService.getHourlyAtIndex(
      this.weatherData,
      activeHourIdx,
    );
    if (!weather) return;

    const currentDate = new Date(weather.time);
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");

    const yearsPast = [5, 10, 20];
    const dates = yearsPast.map((y) => `${year - y}-${month}-${day}`);

    const cacheKey = `climate_${this.selectedLat.toFixed(3)}_${this.selectedLng.toFixed(3)}_${month}-${day}`;
    if (this._climateCache?.key === cacheKey) {
      this.renderClimateTimeMachineData(dates, this._climateCache.results);
      return;
    }

    this.$.timeMachineRows.innerHTML = `
      <div class="flex items-center justify-center py-4">
        <div class="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    `;
    this.$.timeMachinePoints.innerHTML = "";
    this.$.timeMachineLine.setAttribute("d", "");

    try {
      // Fetch past records in parallel (deduplicated via in-memory cache in WeatherService)
      const results = await Promise.all(
        dates.map((dateStr) =>
          WeatherService.fetchHistoricalWeather(
            this.selectedLat,
            this.selectedLng,
            dateStr,
          ).catch((e) => {
            console.warn(`Failed to fetch history for ${dateStr}:`, e);
            return null;
          }),
        ),
      );

      this._climateCache = { key: cacheKey, results };
      this._historicalResults = results;
      this.renderClimateTimeMachine(yearsPast, results, weather.temperature);

      // Find analog year
      const analog = WeatherService.findAnalogDay(this.weatherData, results);
      if (analog && this.$.analogLabel) {
        this.$.analogLabel.textContent = `📅 Most like ${analog.year} years ago: ${analog.icon} ${analog.desc}, ${Math.round(analog.temp)}°C`;
        this.$.analogLabel.className =
          "text-[10px] font-semibold text-emerald-500 dark:text-emerald-400 mt-1";
        this.$.analogLabel.classList.remove("hidden");
      }
    } catch (e) {
      console.error("Time machine load error:", e);
      this.$.timeMachineRows.innerHTML = `<div class="text-[10px] text-red-500 text-center py-2">Failed to load climate history.</div>`;
    }
  }

  renderClimateTimeMachine(yearsPast, results, currentTemp) {
    const historyData = [];

    results.forEach((res, i) => {
      const yearsAgo = yearsPast[i];
      if (res && res.daily && res.daily.temperature_2m_max) {
        const d = res.daily;
        const max = d.temperature_2m_max[0];
        const min = d.temperature_2m_min[0];
        const avg = (max + min) / 2;
        const code = d.weather_code[0] ?? 0;
        const info = WeatherService.getWeatherInfo(code, true);
        const precip = d.precipitation_sum[0] ?? 0;

        historyData.push({
          label: `${yearsAgo} years ago`,
          temp: avg,
          maxTemp: max,
          minTemp: min,
          icon: info.icon,
          description: info.description,
          precip: precip,
        });
      } else {
        historyData.push({
          label: `${yearsAgo} years ago`,
          temp: null,
          maxTemp: null,
          minTemp: null,
          icon: "❓",
          description: "Data unavailable",
          precip: 0,
        });
      }
    });

    // Add current temp
    historyData.push({
      label: "Now",
      temp: currentTemp,
      maxTemp: currentTemp,
      minTemp: currentTemp,
      icon: "📍",
      description: "Active selection",
      precip: 0,
    });

    // Sort chronologically left-to-right: 20 years, 10 years, 5 years, Now
    const chronData = [
      historyData[2], // 20 years
      historyData[1], // 10 years
      historyData[0], // 5 years
      historyData[3], // Now
    ];

    // Render list rows
    const rowsHTML = chronData
      .map((d) => {
        if (d.temp == null) {
          return `
          <div class="flex justify-between items-center text-[10px] text-slate-400 py-0.5">
            <span class="font-medium">${d.label}</span>
            <span>Data unavailable</span>
          </div>
        `;
        }
        return `
        <div class="flex justify-between items-center text-[10px] py-1 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 px-1.5 rounded-md">
          <span class="font-semibold text-slate-500 dark:text-slate-400 w-20 flex-shrink-0">${d.label}</span>
          <span class="text-sm mr-2">${d.icon}</span>
          <span class="text-slate-600 dark:text-slate-300 flex-1 truncate mr-2">${d.description}</span>
          <span class="font-bold text-slate-800 dark:text-slate-100">${Math.round(d.temp)}°C</span>
          <span class="text-[9px] text-slate-400 dark:text-slate-500 ml-1.5 w-12 text-right">${d.precip > 0 ? d.precip.toFixed(1) + "mm" : "Dry"}</span>
        </div>
      `;
      })
      .join("");
    this.setSafeHTML(this.$.timeMachineRows, rowsHTML);

    // Draw mini SVG trend line
    const validTemps = chronData
      .filter((d) => d.temp != null)
      .map((d) => d.temp);
    if (validTemps.length >= 2) {
      const minT = Math.min(...validTemps);
      const maxT = Math.max(...validTemps);
      const tRange = Math.max(1, maxT - minT);

      const width = 200;
      const height = 40;
      const padLeft = 15;
      const padRight = 15;
      const padTop = 10;
      const padBottom = 10;

      const chartW = width - padLeft - padRight;
      const chartH = height - padTop - padBottom;

      const svgPoints = chronData.map((d, idx) => {
        if (d.temp == null) return null;
        const x = padLeft + (idx / 3) * chartW;
        const y = padTop + chartH - ((d.temp - minT) / tRange) * chartH;
        return { x, y, temp: d.temp, label: d.label };
      });

      const cleanPoints = svgPoints.filter((p) => p !== null);

      let pathCmd = `M ${cleanPoints[0].x} ${cleanPoints[0].y}`;
      for (let i = 1; i < cleanPoints.length; i++) {
        pathCmd += ` L ${cleanPoints[i].x} ${cleanPoints[i].y}`;
      }
      this.$.timeMachineLine.setAttribute("d", pathCmd);

      this.$.timeMachinePoints.innerHTML = "";
      cleanPoints.forEach((p) => {
        const circle = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        circle.setAttribute("cx", p.x);
        circle.setAttribute("cy", p.y);
        circle.setAttribute("r", "2.5");
        circle.setAttribute("class", "tm-point");
        circle.setAttribute("title", `${p.label}: ${Math.round(p.temp)}°C`);
        this.$.timeMachinePoints.appendChild(circle);

        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text",
        );
        text.setAttribute("x", p.x);
        text.setAttribute("y", p.y - 4.5);
        text.setAttribute("class", "tm-text");
        text.textContent = `${Math.round(p.temp)}°`;
        this.$.timeMachinePoints.appendChild(text);
      });
    }

    // Anomaly detection
    const anomaly = WeatherService.detectAnomaly(currentTemp, results);
    if (anomaly && this.$.anomalyLabel) {
      this.$.anomalyLabel.textContent = `⚠️ ${anomaly.label}`;
      this.$.anomalyLabel.className = `text-[10px] font-semibold mt-2 ${
        anomaly.severity === "extreme"
          ? "text-red-500"
          : anomaly.severity === "significant"
            ? "text-orange-500"
            : "text-amber-500"
      }`;
      this.$.anomalyLabel.classList.remove("hidden");
    }

    // Historical pattern mining
    const pattern = WeatherService.getHistoricalPattern(
      this.weatherData,
      results,
    );
    if (pattern && this.$.patternLabel) {
      this.$.patternLabel.textContent = `📊 ${pattern.label}`;
      this.$.patternLabel.className =
        "text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 mt-1";
      this.$.patternLabel.classList.remove("hidden");
    }
  }

  // ================================================================
  //  ASTRONOMY & DAY CYCLES
  // ================================================================

  updateAstronomyWidget(weather, hourIndex) {
    if (!this.weatherData) return;

    try {
      const dateStr = weather.time.split("T")[0];
      const daily = WeatherService.getDailyForecast(this.weatherData);
      const currentDayData = daily.find((d) => d.date === dateStr) || daily[0];

      if (
        !currentDayData ||
        !currentDayData.sunrise ||
        !currentDayData.sunset
      ) {
        return;
      }

      const sunriseTime = new Date(currentDayData.sunrise);
      const sunsetTime = new Date(currentDayData.sunset);
      const currentTime = new Date(weather.time);

      const diffMs = sunsetTime - sunriseTime;
      const diffHours = Math.floor(diffMs / 3600000);
      const diffMins = Math.floor((diffMs % 3600000) / 60000);
      this.$.sunDayLength.textContent = `${diffHours}h ${diffMins}m`;

      this.$.sunSunrise.textContent = sunriseTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      this.$.sunSunset.textContent = sunsetTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Live sunrise/sunset countdown timer
      if (this.$.sunCountdown) {
        const updateCountdown = () => {
          const tTime = new Date(weather.time);
          if (tTime >= sunriseTime && tTime <= sunsetTime) {
            const diff = sunsetTime - tTime;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            this.$.sunCountdown.textContent = `Sunset in ${h}h ${m}m`;
            this.$.sunCountdown.className =
              "text-[7px] text-amber-500 dark:text-amber-400 font-bold mt-0.5";
          } else {
            let nextSunrise = sunriseTime;
            if (tTime > sunsetTime) {
              nextSunrise = new Date(
                sunriseTime.getTime() + 24 * 60 * 60 * 1000,
              );
            }
            const diff = nextSunrise - tTime;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            this.$.sunCountdown.textContent = `Sunrise in ${h}h ${m}m`;
            this.$.sunCountdown.className =
              "text-[7px] text-emerald-500 dark:text-emerald-400 font-bold mt-0.5";
          }
        };
        updateCountdown();
      }

      // Calculate Sun Arc Dot position
      if (currentTime >= sunriseTime && currentTime <= sunsetTime) {
        const frac = (currentTime - sunriseTime) / (sunsetTime - sunriseTime);
        const angle = Math.PI - frac * Math.PI; // Semicircular bend from PI to 0 radians

        const cx = 50 + 45 * Math.cos(angle);
        const cy = 45 - 45 * Math.sin(angle);

        this.$.sunArcDot.setAttribute("cx", cx);
        this.$.sunArcDot.setAttribute("cy", cy);
        this.$.sunArcDot.setAttribute("fill", "#f59e0b");
        this.$.sunArcDot.setAttribute("r", "4");

        if (this.$.sunArcPassed) {
          this.$.sunArcPassed.setAttribute(
            "d",
            `M 5,45 A 45,45 0 0,1 ${cx} ${cy}`,
          );
        }
      } else {
        // Night position
        const isBeforeSunrise = currentTime < sunriseTime;
        this.$.sunArcDot.setAttribute("cx", isBeforeSunrise ? 5 : 95);
        this.$.sunArcDot.setAttribute("cy", 45);
        this.$.sunArcDot.setAttribute("fill", "#94a3b8");
        this.$.sunArcDot.setAttribute("r", "3");
        if (this.$.sunArcPassed) {
          this.$.sunArcPassed.setAttribute("d", "M 5,45 A 45,45 0 0,1 5,45");
        }
      }

      // Moon Phase widget update
      const moon = WeatherService.getMoonPhase(currentTime);
      this.$.moonPhaseLabel.textContent = moon.label;
      this.$.moonPhasePercent.textContent = `${Math.round(moon.phase * 100)}%`;
      this.$.moonPhaseDesc.textContent = `${moon.icon} Phase fraction: ${moon.phase.toFixed(2)}`;

      // Draw custom SVG moon shadowing
      const d = this.getMoonSvgPath(moon.phase);
      this.$.moonLitPath.setAttribute("d", d);
    } catch (e) {
      console.warn("Astronomy widget update failed:", e);
    }
  }

  getMoonSvgPath(p) {
    const r = 18;
    const cx = 20;

    if (p <= 0.03 || p >= 0.97) {
      return ""; // New Moon - completely dark
    }
    if (p >= 0.47 && p <= 0.53) {
      return `M 20 2 A 18 18 0 0 1 20 38 A 18 18 0 0 1 20 2`; // Full Moon
    }

    if (p < 0.5) {
      // Lit on the right side
      const rx = r - 4 * r * p;
      const sweep = rx < 0 ? 1 : 0;
      return `M 20 2 A 18 18 0 0 1 20 38 A ${Math.abs(rx)} 18 0 0 ${sweep} 20 2`;
    } else {
      // Lit on the left side
      const rx = r - 4 * r * (p - 0.5);
      const sweep = rx < 0 ? 0 : 1;
      return `M 20 2 A 18 18 0 0 0 20 38 A ${Math.abs(rx)} 18 0 0 ${sweep} 20 2`;
    }
  }

  // ================================================================
  //  WEATHER ADVISORIES & FA VICONS
  // ================================================================

  renderAdvisoryBanner(advisories) {
    if (!advisories || advisories.length === 0) {
      this.$.advisoryBanner.classList.add("hidden");
      return;
    }

    const severityPrecedence = {
      extreme: 4,
      severe: 3,
      warning: 2,
      advisory: 1,
    };
    advisories.sort(
      (a, b) => severityPrecedence[b.severity] - severityPrecedence[a.severity],
    );

    const topAlert = advisories[0];

    this.$.advisoryBanner.className = `mb-4 rounded-xl p-3 border shadow-sm flex items-start gap-2.5 transition-all duration-300 alert-${topAlert.severity}`;
    this.$.advisoryIcon.textContent =
      topAlert.type === "aqi"
        ? "🍃"
        : topAlert.type === "wind"
          ? "💨"
          : topAlert.type === "heat"
            ? "☀️"
            : "⚠️";
    this.$.advisoryTitle.textContent = topAlert.title;
    this.$.advisoryDesc.textContent = topAlert.desc;

    this.$.advisoryBanner.classList.remove("hidden");
  }

  updateWeatherFavicon(weatherCode, isDay = true) {
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      document.head.appendChild(favicon);
    }
    // Use IconSystem to generate a proper SVG favicon with the weather icon
    if (
      window.IconSystem &&
      typeof IconSystem.getDynamicFavicon === "function"
    ) {
      favicon.href = IconSystem.getDynamicFavicon(weatherCode, isDay);
    } else {
      // Fallback to original emoji-based favicon
      const iconSvg = WeatherIcons.getIcon(weatherCode, isDay);
      const inner = iconSvg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
      const content = inner ? inner[1] : iconSvg;
      favicon.href = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><g transform='scale(2) translate(26,26)'>${encodeURIComponent(content)}</g></svg>`;
    }
  }

  // ================================================================
  //  PWA SERVICE WORKER
  // ================================================================

  registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("./sw.js")
          .then((reg) => {
            reg.addEventListener("updatefound", () => {
              const newSW = reg.installing || reg.waiting;
              if (newSW) {
                newSW.addEventListener("statechange", () => {
                  if (
                    newSW.state === "installed" &&
                    navigator.serviceWorker.controller
                  ) {
                    this.showToast(
                      "New version available — refresh for the latest features",
                      "info",
                    );
                  }
                });
              }
            });
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

  readShareableUrl() {
    const params = new URLSearchParams(window.location.search);
    const lat = parseFloat(params.get("lat"));
    const lng = parseFloat(params.get("lng"));
    const name = params.get("name") || "Shared location";
    if (!isNaN(lat) && !isNaN(lng)) {
      this.selectLocation(lat, lng, name);
    }
  }

  updateShareableUrl() {
    if (!this.selectedLat || !this.selectedLng) return;
    const params = new URLSearchParams();
    params.set("lat", this.selectedLat.toFixed(4));
    params.set("lng", this.selectedLng.toFixed(4));
    params.set("name", this.selectedName);
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", url);
  }

  installPWA() {
    // iOS Safari: no programmatic install — guide the user to the
    // Share sheet → "Add to Home Screen".
    if (this._isIOS || !this.deferredPrompt) {
      this.showToast(
        "Tap ⑆ Share, then “Add to Home Screen” to install.",
        "info",
        5000,
      );
      return;
    }
    this.deferredPrompt.prompt();
    this.deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        this.showToast("Aurafisky installed!", "success");
      }
      this.deferredPrompt = null;
      this.$.installBtn.classList.add("hidden");
    });
  }

  async initTempOverlayLayers() {
    this.clearTempOverlay();
    if (!this.selectedLat || !this.selectedLng) return;

    const lat = this.selectedLat;
    const lng = this.selectedLng;
    const offsets = [-0.5, -0.25, 0, 0.25, 0.5];
    const points = [];
    for (const dlat of offsets) {
      for (const dlng of offsets) {
        points.push({
          lat: lat + dlat,
          lng: lng + dlng + (dlat === 0 && dlng === 0 ? 0 : 0),
        });
      }
    }

    try {
      const latsParam = points.map((p) => p.lat.toFixed(4)).join(",");
      const lngsParam = points.map((p) => p.lng.toFixed(4)).join(",");
      let results = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latsParam}&longitude=${lngsParam}&current=temperature_2m,weather_code&timezone=auto`,
      )
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch weather grid");
          return res.json();
        })
        .catch((err) => {
          console.error("Weather grid fetch error:", err);
          return [];
        });

      if (!Array.isArray(results)) {
        results = [results];
      }

      const tempMin = Math.min(
        ...results
          .filter((r) => r?.current?.temperature_2m != null)
          .map((r) => r.current.temperature_2m),
      );
      const tempMax = Math.max(
        ...results
          .filter((r) => r?.current?.temperature_2m != null)
          .map((r) => r.current.temperature_2m),
      );
      const tempRange = Math.max(1, tempMax - tempMin);

      results.forEach((data, i) => {
        if (!data?.current?.temperature_2m) return;
        const temp = data.current.temperature_2m;
        const pt = points[i];
        const frac = (temp - tempMin) / tempRange;
        const color = this.tempToColor(frac);
        const circle = L.circleMarker([pt.lat, pt.lng], {
          radius: 18,
          color: color,
          fillColor: color,
          fillOpacity: 0.5,
          weight: 1,
          opacity: 0.7,
        }).addTo(this.map);
        circle.bindTooltip(`${temp.toFixed(1)}°C`, {
          permanent: true,
          direction: "center",
          className: "temp-tooltip",
        });
        this.tempOverlayLayers.push(circle);
      });
    } catch (e) {
      console.warn("Temperature overlay fetch failed:", e);
    }
  }

  tempToColor(frac) {
    const r = Math.min(255, Math.round(255 * frac));
    const b = Math.round(255 * (1 - frac));
    const g = Math.round(120 * (1 - Math.abs(frac - 0.5) * 2));
    return `rgb(${r},${g},${b})`;
  }

  clearTempOverlay() {
    this.tempOverlayLayers.forEach((layer) => {
      if (layer.remove) layer.remove();
    });
    this.tempOverlayLayers = [];
  }

  initWindParticles() {
    const w = this.canvas?.width || 400;
    const h = this.canvas?.height || 400;
    const dir = ((this.currentWindDirection || 0) * Math.PI) / 180;
    this.particles = [];
    for (let i = 0; i < 25; i++) {
      this.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vBase: 2 + Math.random() * 4,
        len: 40 + Math.random() * 80,
        opacity: 0.08 + Math.random() * 0.18,
        curveOffset: Math.random() * Math.PI * 2,
        dir: dir + (Math.random() - 0.5) * 0.6,
      });
    }
  }

  // ================================================================
  //  UV INDEX FORECAST CHART
  // ================================================================

  renderUVChart() {
    const data = WeatherService.getWeeklyUV(this.weatherData);
    const svg = this.$.uvChart;
    if (!data || data.length < 2 || !svg) return;
    const maxUV = Math.max(...data.map((d) => d.uv), 1);
    const w = 280,
      h = 80,
      pad = 4;
    const cw = (w - pad * 2) / (data.length - 1);
    const bars = data.map((d, i) => ({
      x: pad + i * cw,
      h: (d.uv / maxUV) * (h - pad * 2 - 8),
      uv: d.uv,
      label: new Date(d.date)
        .toLocaleDateString("en", { weekday: "short" })
        .slice(0, 2),
    }));
    svg.innerHTML = bars
      .map(
        (b, i) =>
          `<rect x="${b.x}" y="${h - pad - b.h}" width="${Math.max(4, cw - 4)}" height="${b.h}" rx="2" fill="${b.uv >= 6 ? "#f59e0b" : b.uv >= 3 ? "#fbbf24" : "#10b981"}" opacity="0.8"/>
       <text x="${b.x + cw / 2}" y="${h - 2}" font-size="7" fill="#94a3b8" text-anchor="middle" font-weight="600">${b.label}</text>
       <text x="${b.x + cw / 2}" y="${h - pad - b.h - 3}" font-size="7" fill="#64748b" text-anchor="middle" font-weight="700">${b.uv.toFixed(1)}</text>`,
      )
      .join("");
  }

  // ================================================================
  //  METRIC SEARCH
  // ================================================================
  //  CUSTOMIZABLE DASHBOARD (Drag-to-Reorder Metric Cards)
  // ================================================================

  initDashboardDrag() {
    const grid = document.querySelector(".grid-cols-2.gap-2\\.5");
    if (!grid) return;
    let dragEl = null;
    const onStart = (e) => {
      const card = e.target.closest(".metric-card");
      if (
        !card ||
        card.closest("#aqiCard") ||
        card.closest("#pollenCard") ||
        (card.closest(".col-span-2") && !card.classList.contains("metric-card"))
      )
        return;
      dragEl = card;
      dragEl.style.opacity = "0.5";
      dragEl.style.transform = "scale(1.02)";
    };
    const onEnd = (e) => {
      if (!dragEl) return;
      dragEl.style.opacity = "";
      dragEl.style.transform = "";
      const target = e.target.closest(".metric-card");
      if (target && target !== dragEl) {
        grid.insertBefore(dragEl, target.nextSibling);
      }
      dragEl = null;
    };
    grid.querySelectorAll(".metric-card").forEach((card) => {
      card.draggable = true;
      card.addEventListener("dragstart", onStart);
      card.addEventListener("dragend", onEnd);
    });
  }

  // ================================================================
  //  KEYBOARD SHORTCUTS
  // ================================================================

  initKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Don't trigger if typing in an input
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
        if (e.key === "Escape") {
          e.target.blur();
          this.$.searchDropdown.classList.remove("open");
        }
        return;
      }
      // Close app info modal on Escape
      if (
        e.key === "Escape" &&
        this.$.appInfoModal &&
        this.$.appInfoModal.style.display !== "none"
      ) {
        this.toggleAppInfoModal();
        return;
      }
      switch (e.key.toLowerCase()) {
        case "?":
          e.preventDefault();
          this.toggleAppInfoModal();
          break;
        case "d":
          e.preventDefault();
          this.toggleDarkMode();
          break;
        case "r":
          e.preventDefault();
          this.toggleRadar();
          break;
        case "m":
          e.preventDefault();
          this.toggleMinimalMode();
          break;
        case "/":
          e.preventDefault();
          this.$.searchInput?.focus();
          break;
        case "g":
          e.preventDefault();
          this.getMyLocation();
          break;
      }
    });
    if (this.$.shortcutsCloseBtn) {
      this.$.shortcutsCloseBtn.addEventListener("click", () =>
        this.toggleShortcutsModal(),
      );
    }
    if (this.$.shortcutsModal) {
      this.$.shortcutsModal.addEventListener("click", (e) => {
        if (e.target === this.$.shortcutsModal) this.toggleShortcutsModal();
      });
    }
    // ── App Info Modal ──────────────────────────────────────
    if (this.$.appInfoCloseBtn) {
      this.$.appInfoCloseBtn.addEventListener("click", () =>
        this.toggleAppInfoModal(),
      );
    }
    if (this.$.appInfoModal) {
      this.$.appInfoModal.addEventListener("click", (e) => {
        if (e.target === this.$.appInfoModal) this.toggleAppInfoModal();
      });
    }
    if (this.$.logoBtn) {
      this.$.logoBtn.addEventListener("click", () => this.toggleAppInfoModal());
    }
  }

  toggleShortcutsModal() {
    if (!this.$.shortcutsModal) return;
    const isHidden =
      this.$.shortcutsModal.style.display === "none" ||
      !this.$.shortcutsModal.style.display;
    this.$.shortcutsModal.style.display = isHidden ? "flex" : "none";
    this.$.shortcutsModal.classList.toggle("hidden", !isHidden);
  }

  toggleAppInfoModal() {
    if (!this.$.appInfoModal) return;
    const isHidden =
      this.$.appInfoModal.style.display === "none" ||
      !this.$.appInfoModal.style.display;
    this.$.appInfoModal.style.display = isHidden ? "flex" : "none";
    this.$.appInfoModal.classList.toggle("hidden", !isHidden);
  }

  // ================================================================
  //  SEVERE WEATHER ALERTS FOR BOOKMARKS
  // ================================================================

  async checkBookmarkAlerts() {
    if (!this.bookmarks?.length) return;
    for (const bm of this.bookmarks) {
      try {
        const data = await WeatherService.fetchForecast(bm.lat, bm.lng);
        if (!data?.hourly) continue;
        const nowIdx = WeatherService.getCurrentHourIndex(data);
        const w = WeatherService.getHourlyAtIndex(data, nowIdx);
        if (!w) continue;
        const aqi = await WeatherService.fetchAirQuality(bm.lat, bm.lng);
        const aqiVal = aqi?.hourly?.us_aqi?.[nowIdx];
        const advisories = WeatherService.getAdvisories(w, aqiVal);
        if (advisories?.length) {
          const severe = advisories.filter(
            (a) => a.severity === "extreme" || a.severity === "severe",
          );
          if (severe.length) {
            this.showToast(`⚠️ ${bm.name}: ${severe[0].title}`, "error");
          }
        }
      } catch (e) {
        console.warn("Bookmark alert check failed for", bm.name, e);
      }
    }
  }

  startBookmarkAlertPolling() {
    if (this._alertPollTimer) clearInterval(this._alertPollTimer);
    this.checkBookmarkAlerts();
    this._alertPollTimer = setInterval(
      () => this.checkBookmarkAlerts(),
      600000,
    );
  }

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

      // Bind UI auth triggers
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
        this.$.profileBtn.addEventListener("click", () =>
          this.toggleAccountDialog(),
        );
      }
      if (this.$.accountCloseBtn) {
        this.$.accountCloseBtn.addEventListener("click", () =>
          this.toggleAccountDialog(false),
        );
      }
      if (this.$.accountSettingsBtn) {
        this.$.accountSettingsBtn.addEventListener("click", () => {
          this.toggleAccountDialog(false);
          this.toggleSettingsPanel(true);
        });
      }
      if (this.$.topSettingsBtn) {
        this.$.topSettingsBtn.addEventListener("click", () =>
          this.toggleSettingsPanel(true),
        );
      }
      if (this.$.settingsCloseBtn) {
        this.$.settingsCloseBtn.addEventListener("click", () =>
          this.toggleSettingsPanel(false),
        );
      }

      // Settings triggers (Firestore-dependent only)
      if (this.$.settingsSyncHistoryToggle) {
        this.$.settingsSyncHistoryToggle.addEventListener("change", (e) => {
          this.syncHistory = e.target.checked;
          this.saveUserDataToCloud();
        });
      }
      if (this.$.setDefaultLocationBtn) {
        this.$.setDefaultLocationBtn.addEventListener("click", async () => {
          if (this.selectedLat == null || this.selectedLng == null) {
            this.showToast(
              "Please select a location on the map first.",
              "info",
            );
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
      if (this.$.settingsClearCacheBtn) {
        this.$.settingsClearCacheBtn.addEventListener("click", () => {
          this.clearLocalCaches();
        });
      }
      if (this.$.settingsDeleteDataBtn) {
        this.$.settingsDeleteDataBtn.addEventListener("click", () =>
          this.deleteCloudUserData(),
        );
      }
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
      if (this.$.termsAcceptBtn) {
        this.$.termsAcceptBtn.addEventListener("click", () => {
          this.termsAccepted = true;
          this.hideTermsModal();
          this.saveUserDataToCloud();
          this.showToast("Terms & Conditions accepted.", "success");
        });
      }
      if (this.$.termsModal) {
        this.$.termsModal.addEventListener("click", (e) => {
          if (e.target === this.$.termsModal && this.termsAccepted) {
            this.hideTermsModal();
          }
        });
      }
      if (this.$.copyContactEmailBtn) {
        this.$.copyContactEmailBtn.addEventListener("click", () => {
          navigator.clipboard
            .writeText("applicationmanifester@gmail.com")
            .then(() => {
              this.showToast("Email copied to clipboard!", "success");
            })
            .catch(() => {
              this.showToast("Could not copy email.", "error");
            });
        });
      }

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
    } catch (e) {
      console.error("Firebase initialization failed:", e);
      this.showToast("Firebase connection failed.", "error");
    }
  }

  async signInWithGoogle() {
    if (!this.termsAccepted) {
      this.showToast("Please accept the Terms & Conditions first.", "info");
      this.showTermsModal();
      return;
    }
    if (!this._fb) return;
    const provider = new this._fb.GoogleAuthProvider();
    try {
      await this._fb.signInWithPopup(this._fb.auth, provider);
      this.showToast("Logged in successfully.", "success");
    } catch (e) {
      console.error("Google Sign-In failed:", e);
      this.showToast("Google Sign-In failed.", "error");
    }
  }

  async signOutUser() {
    if (!this._fb) return;
    try {
      await this._fb.signOut(this._fb.auth);
      this.showToast("Logged out successfully.", "success");
      this.toggleAccountDialog(false);
    } catch (e) {
      console.error("Sign out failed:", e);
      this.showToast("Sign out failed.", "error");
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
    if (this.$.accountAvatarImg)
      this.$.accountAvatarImg.src = this.user.photoURL || "";
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

  async loadUserDataFromCloud() {
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
          this.$.syncStatusTime.textContent =
            "Last synced: " + new Date().toLocaleTimeString();
        }
        this.showToast("Cloud settings synchronized.", "success");
      } else {
        await this.saveUserDataToCloud();
        this.updateHomeButton();
        this.updateHomeMarker();
        this.updateSettingsUIFromLocal();
      }
    } catch (e) {
      console.error("Error loading data from Firestore:", e);
      this.showToast("Could not load cloud settings.", "error");
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
      ]);
    } catch (e) {
      console.warn("Local settings save failed:", e);
    }

    if (!this.user) return;
    try {
      const userDocRef = this._fb.doc(this._fb.db, "users", this.user.uid);
      await this._fb.setDoc(userDocRef, dataToSave, { merge: true });
      if (this.$.syncStatusTime) {
        this.$.syncStatusTime.textContent =
          "Last synced: " + new Date().toLocaleTimeString();
      }
    } catch (e) {
      console.error("Error writing settings to cloud:", e);
      this.showToast("Failed to save settings to cloud.", "error");
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
      this.showToast("Could not delete cloud data.", "error");
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
        body: `${emoji} ${desc} | ${tempStr} (H:${todayHigh}° L:${todayLow}°) | Humidity: ${hourWeather.humidity}%`,
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
        console.warn("Periodic sync registration failed:", error);
      }
    }
  }

  async unregisterPeriodicSync() {
    if ("serviceWorker" in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        if ("periodicSync" in registration) {
          await registration.periodicSync.unregister("hourly-weather-update");
          console.log("Periodic sync unregistered");
        }
      } catch (error) {
        console.warn("Periodic sync unregistration failed:", error);
      }
    }
  }

  // ── Web Push (FCM) ──────────────────────────────────────────
  // Registers an FCM token so a backend can send true background push
  // notifications (works on iOS Safari too, unlike Periodic Background Sync).
  async initPushNotifications() {
    if (!this._fb?.messaging) return;
    if (!this.firebaseConfig.vapidKey) {
      console.warn(
        "FCM VAPID key not set — web push disabled. Set window.FCM_VAPID_KEY.",
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
