/**
 * ============================================================
 * Aurafisky Application — app.ts (Leaflet + Immersive Features)
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
 * Dependencies: weather.ts (WeatherService module)
 * ============================================================
 */

import { WeatherService } from './weather';
import { initFeatures } from './features/registry';
import DOMPurify from 'dompurify';
import L from 'leaflet';
import localforage from 'localforage';

declare global {
  interface Window {
    FIREBASE_API_KEY?: string;
    FCM_VAPID_KEY?: string;
    DOMPurify: typeof DOMPurify;
  }
}

interface FirebaseConfig {
  projectId: string;
  appId: string;
  storageBucket: string;
  apiKey: string;
  authDomain: string;
  messagingSenderId: string;
  vapidKey: string;
}

interface LocationData {
  lat: number;
  lng: number;
  name: string;
  country?: string;
  admin1?: string;
}

interface WeatherData {
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    relative_humidity_2m: number[];
    surface_pressure: number[];
    cloud_cover: number[];
    uv_index: number[];
    visibility: number[];
    wind_gusts_10m?: number[];
    weather_code: number[];
    is_day: number[];
  };
  timezone: string;
  utc_offset_seconds: number;
}

interface AirQualityData {
  hourly: {
    us_aqi: number[];
    pm2_5: number[];
    pm10: number[];
    ozone: number[];
    birch_pollen?: number[];
    grass_pollen?: number[];
    mugwort_pollen?: number[];
    alder_pollen?: number[];
  };
}

interface HourlyWeather {
  time: string;
  temperature: number;
  precipitation: number;
  precipitationProbability: number;
  windSpeed: number;
  windDirection: number;
  humidity: number;
  pressure: number;
  clouds: number;
  uvIndex: number;
  visibility: number;
  windGusts?: number;
  weatherCode: number;
  isDay: number;
  feelsLike: number;
  icon: string;
  description: string;
}

interface CachedWeather {
  forecast: WeatherData;
  airQuality: AirQualityData;
  ts: number;
}

interface Bookmark {
  name: string;
  lat: number;
  lng: number;
  country?: string;
  admin1?: string;
}

interface SyncState {
  lastSync: number;
  pending: boolean;
}

class AurafiskyApp {
  // Firebase Configuration & State
  private firebaseConfig: FirebaseConfig;
  private fcmToken: string | null = null;
  private _fb: any = null;
  private user: any = null;
  private syncHistory = true;
  private defaultLocation: LocationData | null = null;
  private defaultLocationNotify = false;
  private notifyIntervalMin = 60;
  private hourlyNotificationTimer: ReturnType<typeof setTimeout> | null = null;

  // State
  private map: L.Map | null = null;
  private lightTiles: L.TileLayer | null = null;
  private darkTiles: L.TileLayer | null = null;
  private marker: L.Marker | null = null;
  private _mapClickDebounce = false;
  private _timelineRAF: number | null = null;

  // Datasets
  private weatherData: WeatherData | null = null;
  private airQualityData: AirQualityData | null = null;
  private currentHourIndex = 0;
  private selectedLat: number | null = null;
  private selectedLng: number | null = null;
  private selectedName = '';

  // UI States
  private isDark = false;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Bookmarks List
  private bookmarks: Bookmark[] = [];
  private searchHistory: string[] = [];

  // Radar/Satellite Sequence State
  private radarActive = false;
  private radarLayers: L.TileLayer[] = [];
  private radarTimestamps: string[] = [];
  private radarIndex = 0;
  private radarTimer: ReturnType<typeof setTimeout> | null = null;
  private radarPlaying = false;
  private overlayType: 'radar' | 'satellite' | 'temperature' | 'wind' = 'radar';
  private radarOpacity = 0.55;

  // Terms & Conditions
  private termsAccepted = false;

  // Soundscape State
  private audioActive = false;
  private audioContext: AudioContext | null = null;
  private audioNodes: Record<string, AudioNode> = {};
  private volumeLevel = 0.5;
  private activeSoundType: string | null = null;

  // Canvas Particles Overlay State
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private particles: any[] = [];
  private animationFrameId: number | null = null;
  private activeEffectType: 'rain' | 'snow' | 'wind' | 'storm' | 'none' = 'none';
  private lightningFlash = 0;

  // Network Offline State
  private isOffline = !navigator.onLine;

  // Search state
  private searchHistoryKey = 'weathermap_search_history';
  private searchHighlightIndex = -1;

  // Bookmark map markers
  private bookmarkMarkers: L.Marker[] = [];
  private showBookmarksOnMap = localStorage.getItem('aurafisky_show_bookmarks_map') !== 'false';

  // Sunrise countdown timer
  private sunCountdownTimer: ReturnType<typeof setTimeout> | null = null;

  // Minimal mode
  private minimalMode = false;

  // Advanced feature state
  private showSignal = false;
  private showConfidence = false;

  private freshnessTimestamp: number | null = null;
  private biasMap: Map<string, number> | null = null;
  private _historicalResults: any = null;

  // Shared audio noise buffer
  private _noiseBuffer: AudioBuffer | null = null;

  // Timeline throttle state
  private _timelinePending = false;

  // Cached signal/noise decomposition
  private _cachedDecomposition: any = null;

  // Temperature overlay state
  private tempOverlayLayers: L.TileLayer[] = [];
  private tempOverlayTimer: ReturnType<typeof setTimeout> | null = null;

  // PWA Install prompt
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  // Bookmark alert polling timer
  private _alertPollTimer: ReturnType<typeof setTimeout> | null = null;

  // Toast dedup tracking
  private _toastKeys = new Set<string>();

  // DOM References
  private $: Record<string, HTMLElement | null> = {};

  // --- Initialization ---
  constructor() {
    this.firebaseConfig = {
      projectId: 'aurafisky',
      appId: '1:206842187982:web:994268ad1fa6290b45409f',
      storageBucket: 'aurafisky.firebasestorage.app',
      apiKey: window.FIREBASE_API_KEY || 'AIzaSyCF0fSv5OUy05AnYZot4Y9Y07TnJjjNl1I',
      authDomain: 'aurafisky.firebaseapp.com',
      messagingSenderId: '206842187982',
      vapidKey: window.FCM_VAPID_KEY || '',
    };

    this.searchHistory = this._loadSearchHistory();

    // Initialize after DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  // Helper to set innerHTML safely using DOMPurify
  setSafeHTML(el: HTMLElement | null, html: string): void {
    if (!el) return;
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
      el.innerHTML = DOMPurify.sanitize(html);
    } else {
      el.textContent = html.replace(/<[^>]*>/g, '');
    }
  }

  async init(): Promise<void> {
    const panelEl = document.getElementById('weatherPanel');
    if (panelEl) this._weatherPanelTemplate = panelEl.outerHTML;

    window.addEventListener('error', (e) => console.error('Unhandled error:', e.error || e.message));
    window.addEventListener('unhandledrejection', (e) => console.error('Unhandled promise rejection:', e.reason));

    this.isDark = false;
    this.loadBookmarks();
    this.startBookmarkAlertPolling();

    this.initLeafletMap();
    this.initWeatherCanvas();
    this.bindEvents();
    this.initKeyboardShortcuts();

    this._initFeaturesLazy();
    this.registerServiceWorker();
    this.syncUnitLabel();

    setTimeout(() => this.readShareableUrl(), 0);

    this._updateAppHeight();
    window.addEventListener('resize', () => this._updateAppHeight());
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this._updateAppHeight());
      window.visualViewport.addEventListener('scroll', () => this._updateAppHeight());
    }

    await this._loadLocalCache();
    this.updateSettingsUIFromLocal();
    this.updateHomeMarker();
    if (this._restoreSession()) this.updateHomeButton();

    this._sweepStaleCache();
    this.initFirebase();
  }

  private _weatherPanelTemplate = '';

  private _updateAppHeight(): void {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${h}px`);
  }

  // ================================================================
  //  MAP INITIALIZATION & TILE SETUPS
  // ================================================================
  private initLeafletMap(): void {
    try {
      this.map = L.map('map', {
        center: [20.0, 0.0],
        zoom: 3,
        minZoom: 2,
        zoomControl: false,
        attributionControl: true,
        worldCopyJump: true,
        maxBounds: [[-85, -10000], [85, 10000]],
        maxBoundsViscosity: 1.0,
      });

      this.lightTiles = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 20,
          updateWhenIdle: false,
          updateWhenZooming: false,
          keepBuffer: 2,
          noWrap: false,
          bounds: [[-85, -180], [85, 180]],
        }
      );

      this.darkTiles = L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        {
          attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
          subdomains: 'abcd',
          maxZoom: 20,
          updateWhenIdle: false,
          updateWhenZooming: false,
          keepBuffer: 2,
          noWrap: false,
          bounds: [[-85, -180], [85, 180]],
        }
      );

      if (this.isDark) this.darkTiles.addTo(this.map);
      else this.lightTiles.addTo(this.map);

      const MAP_BOUNDS = [[-85, -10000], [85, 10000]];
      this.map.setMaxBounds(MAP_BOUNDS);
      this.map.on('moveend', () => {
        const c = this.map!.getCenter();
        if (c.lat < -85 || c.lat > 85) {
          this.map!.setView([Math.max(Math.min(c.lat, 85), -85), c.lng], this.map!.getZoom());
        }
      });

      this.map.on('click', async (e: L.LeafletMouseEvent) => {
        if (this._mapClickDebounce) return;
        if (this._homeMarker && this.defaultLocation) {
          const markerPx = this.map!.latLngToContainerPoint([this.defaultLocation.lat, this.defaultLocation.lng]);
          const dist = Math.hypot(e.containerPoint.x - markerPx.x, e.containerPoint.y - markerPx.y);
          if (dist < 20) {
            this.selectLocation(this.defaultLocation.lat, this.defaultLocation.lng, this.defaultLocation.name);
            return;
          }
        }
        this._mapClickDebounce = true;
        try {
          await this.handleMapClick(e.latlng.lat, e.latlng.lng);
        } catch (err) {
          console.error('Map click handler error:', err);
        } finally {
          setTimeout(() => (this._mapClickDebounce = false), 1000);
        }
      });

      this.refreshBookmarkPins();
      this.hideLoadingOverlay();
      this.showToast('Click anywhere or search for a city!', 'info');

      setTimeout(() => this.map?.invalidateSize(), 100);
      setTimeout(() => this.map?.invalidateSize(), 500);
      setTimeout(() => this.map?.invalidateSize(), 1500);

      if (window.visualViewport) {
        const onVV = () => this.map?.invalidateSize();
        window.visualViewport.addEventListener('resize', onVV);
        window.visualViewport.addEventListener('scroll', onVV);
      }
    } catch (error) {
      console.error('Leaflet initialization failed:', error);
      this.hideLoadingOverlay();
      this.showToast('Failed to load map. Refresh the page.', 'error');
    }
  }

  // ================================================================
  //  UI INTERACTION & ACTION BINDINGS
  // ================================================================
  private bindEvents(): void {
    this.$.searchInput?.addEventListener('input', () => this.handleSearchInput());
    this.$.searchClearBtn?.addEventListener('click', () => this.clearSearch());

    this.$.bookmarksBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.$.bookmarksDropdown?.classList.toggle('hidden');
    });
    if (this.$.toggleBookmarksMapBtn) {
      this.$.toggleBookmarksMapBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showBookmarksOnMap = !this.showBookmarksOnMap;
        localStorage.setItem('aurafisky_show_bookmarks_map', String(this.showBookmarksOnMap));
        this.updateBookmarksMapToggleUI();
        this.refreshBookmarkPins();
      });
      this.updateBookmarksMapToggleUI();
    }
    if (this.$.closeBookmarksBtn) {
      this.$.closeBookmarksBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.$.bookmarksDropdown?.classList.add('hidden');
      });
    }
    this.$.homeToggleBtn?.addEventListener('click', () => this.toggleHomeLocation());
    this.$.favoriteToggleBtn?.addEventListener('click', () => this.toggleFavoriteCurrentLocation());

    this.$.myLocationBtn?.addEventListener('click', () => this.getMyLocation());
    this.$.panelCloseBtn?.addEventListener('click', () => this.hideWeatherPanel());
    this.$.panelMinimizeBtn?.addEventListener('click', () => this.toggleMinimizeWeatherPanel());
    this.$.compareCloseBtn?.addEventListener('click', () => this.hideComparePanel());

    if (this.$.settingsVolumeSlider) {
      this.$.settingsVolumeSlider.addEventListener('input', (e: Event) => {
        this.handleVolumeChange(parseInt((e.target as HTMLInputElement).value, 10) / 100);
      });
      this.$.settingsVolumeSlider.addEventListener('change', () => this.saveUserDataToCloud());
    }

    if (this.$.settingsUnitsToggle) {
      this.$.settingsUnitsToggle.addEventListener('change', (e: Event) => {
        const useFahrenheit = (e.target as HTMLInputElement).checked;
        WeatherService.setUnits(useFahrenheit ? 'imperial' : 'metric');
        this.syncUnitLabel();
        if (this.weatherData) this.updateWeatherDisplay(parseInt(this.$.timelineSlider?.value as string, 10));
        this.saveUserDataToCloud();
      });
    }
    if (this.$.settingsThemeToggle) {
      this.$.settingsThemeToggle.addEventListener('change', () => {
        this.toggleDarkMode();
        this.saveUserDataToCloud();
      });
    }
    if (this.$.settingsCompactToggle) {
      this.$.settingsCompactToggle.addEventListener('change', () => {
        this.toggleMinimalMode();
        this.saveUserDataToCloud();
      });
    }
    if (this.$.settingsSoundToggle) {
      this.$.settingsSoundToggle.addEventListener('change', (e: Event) => {
        this.toggleAmbientSoundscape((e.target as HTMLInputElement).checked);
        this.saveUserDataToCloud();
      });
    }
    if (this.$.settingsDeleteDataBtn) {
      this.$.settingsDeleteDataBtn.addEventListener('click', () => this.deleteCloudUserData());
    }

    this.$.timelineSlider?.addEventListener('input', (e: Event) => {
      this.handleTimelineChange(parseInt((e.target as HTMLInputElement).value, 10));
      this.updateTimelineTooltip(parseInt((e.target as HTMLInputElement).value, 10));
    });
    this.$.timelineSlider?.addEventListener('change', () => {
      if (this._tooltipHideTimer) clearTimeout(this._tooltipHideTimer);
      this._tooltipHideTimer = setTimeout(() => {
        if (this.$.timelineTooltip) this.$.timelineTooltip.classList.add('hidden');
      }, 2500);
    });

    this.$.zoomInBtn?.addEventListener('click', () => this.map?.zoomIn());
    this.$.zoomOutBtn?.addEventListener('click', () => this.map?.zoomOut());
    this.$.radarToggleBtn?.addEventListener('click', () => this.toggleRadar());

    if (this.$.radarMinimizeBtn && this.$.radarCollapsedBtn && this.$.radarExpandedPanel) {
      this.$.radarMinimizeBtn.addEventListener('click', () => {
        this.$.radarExpandedPanel?.classList.add('hidden');
        this.$.radarCollapsedBtn?.classList.remove('hidden');
      });
      this.$.radarCollapsedBtn.addEventListener('click', () => {
        this.$.radarCollapsedBtn?.classList.add('hidden');
        this.$.radarExpandedPanel?.classList.remove('hidden');
      });
    }
    this.$.layerTypeSelect?.addEventListener('change', (e: Event) => {
      this.overlayType = (e.target as HTMLSelectElement).value as any;
      if (this.radarActive) {
        if (this.overlayType === 'temperature') {
          this.stopRadarPlayback();
          this.clearTempOverlay();
          this.initTempOverlayLayers();
          this.$.radarPlayback?.classList.add('hidden');
          this.$.legendPrecip?.classList.add('hidden');
          this.$.legendTemp?.classList.remove('hidden');
          this.radarActive = true;
          this.activeEffectType = 'none';
        } else if (this.overlayType === 'wind') {
          this.stopRadarPlayback();
          this.clearRadarLayers();
          this.clearTempOverlay();
          this.$.radarPlayback?.classList.add('hidden');
          this.$.legendPrecip?.classList.add('hidden');
          this.$.legendTemp?.classList.add('hidden');
          this.activeEffectType = 'wind';
          this.radarActive = true;
          this.initWindParticles();
          if (!this.animationFrameId) this.runWeatherCanvasLoop();
        } else {
          this.clearTempOverlay();
          this.activeEffectType = 'none';
          this.$.legendPrecip?.classList.remove('hidden');
          this.$.legendTemp?.classList.add('hidden');
          this.$.radarPlayback?.classList.remove('hidden');
          this.initRadarLayers().then(() => this.startRadarPlayback());
        }
      }
    });
    this.$.radarPlayBtn?.addEventListener('click', () => this.toggleRadarPlayback());

    this.$.timeMachineTrigger?.addEventListener('click', () => this.toggleClimateTimeMachine());

    this.$.shareWeatherBtn?.addEventListener('click', () => this.shareWeather());

    this.$.installBtn?.addEventListener('click', () => this.installPWA());

    this.$.nextRainBtn?.addEventListener('click', () => this.jumpToNextRain());

    this.$.signalNoiseBtn?.addEventListener('click', () => this.toggleSignalNoiseView());

    this.$.briefingBtn?.addEventListener('click', () => this.generateBriefing());

    this.$.confidenceToggle?.addEventListener('click', () => {
      this.showConfidence = !this.showConfidence;
      this.$.confidenceToggle?.classList.toggle('bg-primary/20', this.showConfidence);
      if (this.weatherData) this.drawHourlySparkline(parseInt(this.$.timelineSlider?.value as string, 10));
    });

    this.$.searchInput?.addEventListener('keydown', (e) => this.handleSearchKeyboard(e));
    this._boundKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.$.searchDropdown?.classList.remove('open');
        if (this.$.weatherPanel?.classList.contains('open')) this.hideWeatherPanel();
      }
    };
    document.addEventListener('keydown', this._boundKeydown);

    this._boundSearchFocus = () => {
      const query = this.$.searchInput?.value.trim() || '';
      if (query.length < 2) this.showSearchHistory();
      else if (this.$.searchResults?.children.length) this.$.searchDropdown?.classList.add('open');
    };
    this.$.searchInput?.addEventListener('focus', this._boundSearchFocus);

    this._boundOnline = () => this.updateOnlineStatus(true);
    this._boundOffline = () => this.updateOnlineStatus(false);
    window.addEventListener('online', this._boundOnline);
    window.addEventListener('offline', this._boundOffline);

    this._boundRefocus = () => {
      if (document.visibilityState === 'hidden') return;
      const stale = !this.freshnessTimestamp || Date.now() - this.freshnessTimestamp > 300000;
      if (stale && this.selectedLat != null && !this._isFetching && !this.isOffline) {
        this.selectLocation(this.selectedLat, this.selectedLng, this.selectedName);
      }
    };
    document.addEventListener('visibilitychange', this._boundRefocus);
    window.addEventListener('focus', this._boundRefocus);

    this._isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this._isInStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
    this._boundBeforeInstall = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.$.installBtn?.classList.remove('hidden');
      if (this._installBtnLabel) this._installBtnLabel.textContent = 'Install Aurafisky App';
      if (this._installPromptShown) {
        try { this.deferredPrompt.prompt(); } catch { /* prompt may not be available */ }
      }
    };
    window.addEventListener('beforeinstallprompt', this._boundBeforeInstall);

    if (this._isIOS && !this._isInStandalone && this.$.installBtn) {
      this.$.installBtn.classList.remove('hidden');
      this._installBtnLabel && (this._installBtnLabel.textContent = 'Add to Home Screen');
    }

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.$.installBtn?.classList.add('hidden');
    });

    this._boundDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#searchInput') && !target.closest('#searchDropdown')) {
        this.$.searchDropdown?.classList.remove('open');
      }
      if (!target.closest('#bookmarksBtn') && !target.closest('#bookmarksDropdown')) {
        this.$.bookmarksDropdown?.classList.add('hidden');
      }
    };
    document.addEventListener('click', this._boundDocClick);

    this._pullStartY = 0;
    this._pullActive = false;
    this._pullNotified = false;
    document.addEventListener('touchstart', (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      this._pullStartY = e.touches[0].clientY;
      this._pullActive = true;
      this._pullNotified = false;
    }, { passive: true });
    document.addEventListener('touchmove', (e: TouchEvent) => {
      if (!this._pullActive || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - this._pullStartY;
      if (dy > 100 && !this._pullNotified && window.scrollY === 0) {
        this._pullNotified = true;
        this._pullActive = false;
        this.showToast('Refreshing weather...', 'info');
        if (this.selectedLat && this.selectedLng && this.selectedName) {
          this.selectLocation(this.selectedLat, this.selectedLng, this.selectedName);
        } else {
          this.getMyLocation();
        }
      }
    }, { passive: true });
    document.addEventListener('touchend', () => { this._pullActive = false; }, { passive: true });

    this._resizeRAF = null;
    this._boundResize = () => {
      if (this._resizeRAF) return;
      this._resizeRAF = requestAnimationFrame(() => {
        this._resizeRAF = null;
        this.resizeWeatherCanvas();
        if (this.map) this.map.invalidateSize();
      });
    };
    window.addEventListener('resize', this._boundResize);
  }

  // ================================================================
  //  GEOLOCATION & REVERSE SEARCH (Nominatim)
  // ================================================================
  private _persistSession(lat: number, lng: number, name: string): void {
    localforage.setItem('_lastSession', { lat, lng, name }).catch(() => {});
  }

  private _restoreSession(): boolean {
    const saved = this._localCache?._lastSession;
    if (saved && saved.lat != null && saved.lng != null) {
      this.selectLocation(saved.lat, saved.lng, saved.name || `${saved.lat.toFixed(4)}, ${saved.lng.toFixed(4)}`);
      return true;
    }
    return false;
  }

  private async _loadLocalCache(): Promise<void> {
    try {
      const keys = ['_lastSession', 'defaultLocation', 'defaultLocationNotify', 'units'];
      const results = await Promise.all(keys.map(k => localforage.getItem(k)));
      this._localCache = {};
      keys.forEach((k, i) => { this._localCache[k] = results[i]; });

      if (this._localCache.defaultLocation) this.defaultLocation = this._localCache.defaultLocation;
      if (this._localCache.defaultLocationNotify != null) this.defaultLocationNotify = this._localCache.defaultLocationNotify;
      if (this._localCache.notifyIntervalMin != null) this.notifyIntervalMin = this._localCache.notifyIntervalMin;
      if (this._localCache.units && !this._cloudUnitsLoaded) {
        WeatherService.setUnits(this._localCache.units);
        this.syncUnitLabel();
      }
    } catch (e) { console.warn('Local cache load error:', e); }
  }

  async handleMapClick(lat: number, lng: number): Promise<void> {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    let locationName = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`,
        { headers: { 'User-Agent': 'AurafiskyApp/2.0' } }
      );
      if (response.ok) {
        const data = await response.json();
        const addr = data.address;
        if (addr) {
          const sanitize = (str: string | undefined) => {
            if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) return DOMPurify.sanitize(String(str || ''));
            return String(str || '').replace(/[<>&]/g, '');
          };
          const city = sanitize(addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.hamlet);
          const state = sanitize(addr.state || addr.region || addr.county);
          const country = sanitize(addr.country);
          locationName = [city, state, country].filter(Boolean).join(', ') || sanitize(data.display_name);
        }
      }
    } catch (e) { console.warn('Nominatim reverse geocode lookup failed:', e); }

    await this.selectLocation(lat, lng, locationName);
  }

  async selectLocation(lat: number, lng: number, name: string): Promise<void> {
    if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    if (this._isFetching) return;
    this._isFetching = true;
    try {
      this._persistSession(lat, lng, name);

      const wasMinimal = this.minimalMode;
      let weatherPopulated = false;
      if (wasMinimal) {
        const panel = this.$.weatherPanel;
        if (panel) { this.setSafeHTML(panel, panel.dataset.fullContent || ''); this.rebindPanelEvents(); }
        document.documentElement.classList.remove('compact');
        this.minimalMode = false;
      }

      this.selectedLat = lat;
      this.selectedLng = lng;
      this.selectedName = name;
      this.updateSettingsUIFromLocal();

      this._cachedDecomposition = null;

      this.map?.invalidateSize();
      const targetZoom = Math.max(this.map?.getZoom() || 0, 9);
      this.map?.setView([lat, lng], targetZoom);

      this.$.panelLocationName!.textContent = name;
      this.$.panelTimeLabel!.textContent = 'Fetching weather...';

      this.$.panelAQILabel!.textContent = 'Loading AQI...';
      this.$.panelAQIBadge!.textContent = '--';
      this.$.panelAQIBadge.className = 'text-[10px] font-bold px-2.5 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-500 uppercase tracking-wider text-center min-w-[70px] flex-shrink-0';

      if (this.$.weatherPanelSkeleton && this.$.weatherPanelContent) {
        this.$.weatherPanelContent.classList.add('hidden');
        this.$.weatherPanelSkeleton.classList.remove('hidden');
      }

      this.showWeatherPanel();
      this.updateStarUI();

      this.closeClimateTimeMachine();

      const cacheKey = `weathermap_cache_${lat.toFixed(3)}_${lng.toFixed(3)}`;

      try {
        if (this.isOffline) throw new Error('Device is offline');

        const [forecast, airQuality] = await Promise.all([
          WeatherService.fetchForecast(lat, lng),
          WeatherService.fetchAirQuality(lat, lng),
        ]);

        this.weatherData = forecast;
        this.airQualityData = airQuality;
        this.currentHourIndex = WeatherService.getCurrentHourIndex(this.weatherData, this.weatherData?.utc_offset_seconds || 0);

        this.biasMap = WeatherService.computeDiurnalBias(forecast, forecast?.utc_offset_seconds || 0);

        this.freshnessTimestamp = Date.now();
        this.updateOfflineBadge(false);
        weatherPopulated = true;

        this.initTimeline();
        (this.$.timelineSlider as HTMLInputElement).value = String(this.currentHourIndex);
        (this.$.timelineSlider as HTMLInputElement).disabled = false;

        this.updateWeatherDisplay(this.currentHourIndex);
        if (this._ensembleReady) this.renderEnsemble(lat, lng);

        if (this.deferredPrompt && !this._installPromptShown) {
          this._installPromptShown = true;
          this.showToast('Tip: install Aurafisky from Settings for offline access anytime.', 'info', 6000);
        }

        this.createWeatherMarker(lat, lng);
        this.updateHomeButton();
        this.updateHomeMarker();

        if (this.$.weatherPanelSkeleton && this.$.weatherPanelContent) {
          this.$.weatherPanelContent.classList.remove('hidden');
          this.$.weatherPanelSkeleton.classList.add('hidden');
          requestAnimationFrame(() => { if (this.$.weatherPanelContent) this.$.weatherPanelContent.scrollTop = 0; });
        }
      } catch (error) {
        console.warn('Live weather fetch failed, attempting cache recovery:', error);

        const cached = this.getNearestCachedLocation(lat, lng);
        if (cached) {
          this.weatherData = cached.forecast;
          this.airQualityData = cached.airQuality;
          this.currentHourIndex = WeatherService.getCurrentHourIndex(this.weatherData, this.weatherData?.utc_offset_seconds || 0);

          this.updateOfflineBadge(true);
          this.showToast('Loaded cached offline weather details.', 'info');
          weatherPopulated = true;

          this.initTimeline();
          (this.$.timelineSlider as HTMLInputElement).value = String(this.currentHourIndex);
          (this.$.timelineSlider as HTMLInputElement).disabled = false;

          this.updateWeatherDisplay(this.currentHourIndex);
          if (this._ensembleReady) this.renderEnsemble(lat, lng);
          this.createWeatherMarker(lat, lng);
          this.updateHomeButton();
          this.updateHomeMarker();

          if (this.$.weatherPanelSkeleton && this.$.weatherPanelContent) {
            this.$.weatherPanelContent.classList.remove('hidden');
            this.$.weatherPanelSkeleton.classList.add('hidden');
            requestAnimationFrame(() => { if (this.$.weatherPanelContent) this.$.weatherPanelContent.scrollTop = 0; });
          }
        } else {
          this.showToast(
            this.isOffline
              ? 'You are offline and no cached data is available for this city.'
              : 'Could not fetch weather metrics.',
            'error'
          );
          this.hideWeatherPanel();
        }
      }

      this.updateHomeButton();
      this.updateHomeMarker();

      if (wasMinimal && weatherPopulated) {
        document.documentElement.classList.add('compact');
        const panel = this.$.weatherPanel;
        if (panel.querySelector('#weatherPanelContent')) panel.dataset.fullContent = panel.innerHTML;
        const minimalHTML = `
          <div class="flex items-center justify-between px-5 pt-5 pb-3">
            <div class="min-w-0 flex-1">
              <h3 class="text-lg font-bold truncate text-slate-900 dark:text-white">${this.selectedName || 'Weather'}</h3>
            </div>
            <button id="minimalExitBtn" class="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-600/40 transition-colors flex-shrink-0" aria-label="Exit minimal mode">
              <svg class="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
          <div class="flex-1 flex items-center justify-center px-5 pb-5">
            <div class="text-center">
              <div class="text-7xl mb-3">${this.$.panelIcon?.textContent}</div>
              <div class="text-6xl font-extrabold text-slate-900 dark:text-white mb-2">${this.$.panelTemp?.textContent}</div>
              <div class="text-lg text-slate-500 dark:text-slate-400 mb-1">${this.$.panelDescription?.textContent}</div>
              <div class="text-sm text-slate-400">${WeatherService.formatDateTime(this.weatherData?.hourly?.time[parseInt((this.$.timelineSlider as HTMLInputElement).value)], this.weatherData?.timezone, this.weatherData?.utc_offset_seconds)}</div>
            </div>
          </div>
        `;
        this.setSafeHTML(panel, minimalHTML);
        panel.querySelector('#minimalExitBtn')?.addEventListener('click', () => this.toggleMinimalMode());
        this.minimalMode = true;
      }
    } finally {
      this._isFetching = false;
    }
  }

  // ================================================================
  //  BOOKMARKS & FAVORITES
  // ================================================================
  private loadBookmarks(): void {
    try { this.bookmarks = JSON.parse(localStorage.getItem('aurafisky_bookmarks') || '[]'); } catch { this.bookmarks = []; }
    this.renderBookmarks();
  }

  private saveBookmarks(): void {
    localStorage.setItem('aurafisky_bookmarks', JSON.stringify(this.bookmarks));
  }

  private renderBookmarks(): void {
    const list = this.$.bookmarksList;
    if (!list) return;
    list.innerHTML = '';
    if (this.bookmarks.length === 0) {
      list.innerHTML = '<div class="px-3 py-3 text-xs text-slate-400 text-center">No saved locations</div>';
      return;
    }
    this.bookmarks.forEach((b, i) => {
      const item = document.createElement('div');
      item.className = 'px-3 py-2 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg transition-colors';
      item.innerHTML = `
        <span class="truncate max-w-[200px]" title="${b.name}">${b.name}</span>
        <button class="ml-2 p-1 text-slate-400 hover:text-red-500 transition-colors" data-remove="${i}" aria-label="Remove ${b.name}">✕</button>
      `;
      item.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).matches('[data-remove]')) {
          this.removeBookmark(i);
        } else {
          this.selectLocation(b.lat, b.lng, b.name);
          this.$.bookmarksDropdown?.classList.add('hidden');
        }
      });
      list.appendChild(item);
    });
  }

  private addBookmark(lat: number, lng: number, name: string): void {
    if (this.bookmarks.some(b => Math.abs(b.lat - lat) < 0.001 && Math.abs(b.lng - lng) < 0.001)) return;
    this.bookmarks.unshift({ name, lat, lng });
    if (this.bookmarks.length > 50) this.bookmarks.pop();
    this.saveBookmarks();
    this.renderBookmarks();
    this.updateStarUI();
  }

  private removeBookmark(index: number): void {
    this.bookmarks.splice(index, 1);
    this.saveBookmarks();
    this.renderBookmarks();
    this.updateStarUI();
  }

  private toggleFavoriteCurrentLocation(): void {
    if (this.selectedLat == null || this.selectedLng == null || !this.selectedName) return;
    const exists = this.bookmarks.some(b => Math.abs(b.lat - this.selectedLat!) < 0.001 && Math.abs(b.lng - this.selectedLng!) < 0.001);
    if (exists) this.removeBookmark(this.bookmarks.findIndex(b => Math.abs(b.lat - this.selectedLat!) < 0.001 && Math.abs(b.lng - this.selectedLng!) < 0.001));
    else this.addBookmark(this.selectedLat, this.selectedLng, this.selectedName);
    this.updateStarUI();
  }

  private updateStarUI(): void {
    const isFav = this.bookmarks.some(b => Math.abs(b.lat - (this.selectedLat || 0)) < 0.001 && Math.abs(b.lng - (this.selectedLng || 0)) < 0.001);
    this.$.starOutlineIcon?.classList.toggle('hidden', isFav);
    this.$.starFilledIcon?.classList.toggle('hidden', !isFav);
  }

  private toggleHomeLocation(): void {
    if (this.selectedLat == null || this.selectedLng == null || !this.selectedName) return;
    const exists = this.defaultLocation && Math.abs(this.defaultLocation.lat - this.selectedLat!) < 0.001 && Math.abs(this.defaultLocation.lng - this.selectedLng!) < 0.001;
    if (exists) { this.defaultLocation = null; this.defaultLocationNotify = false; localStorage.removeItem('aurafisky_default_location'); }
    else { this.defaultLocation = { lat: this.selectedLat!, lng: this.selectedLng!, name: this.selectedName }; localStorage.setItem('aurafisky_default_location', JSON.stringify(this.defaultLocation)); }
    this.updateHomeButton();
    this.updateHomeMarker();
    this.saveUserDataToCloud();
  }

  private updateHomeButton(): void {
    const isHome = this.defaultLocation && Math.abs(this.defaultLocation.lat - (this.selectedLat || 0)) < 0.001 && Math.abs(this.defaultLocation.lng - (this.selectedLng || 0)) < 0.001;
    this.$.homeOutlineIcon?.classList.toggle('hidden', isHome);
    (this.$.homeToggleBtn as HTMLButtonElement)?.classList.toggle('bg-primary/10', isHome);
  }

  private updateHomeMarker(): void {
    if (this._homeMarker) { this._homeMarker.remove(); this._homeMarker = null; }
    if (!this.defaultLocation) return;
    this._homeMarker = L.marker([this.defaultLocation.lat, this.defaultLocation.lng], {
      icon: L.divIcon({ className: 'home-marker', html: '<div class="home-marker-shell">...</div>', iconSize: [40, 56], iconAnchor: [20, 56] })
    }).addTo(this.map!);
    this._homeMarker.bindTooltip(this.defaultLocation.name, { permanent: false, direction: 'top', offset: [0, -56], className: 'home-tooltip' });
  }

  private refreshBookmarkPins(): void {
    this.bookmarkMarkers.forEach(m => m.remove());
    this.bookmarkMarkers = [];
    if (!this.showBookmarksOnMap) return;
    this.bookmarks.forEach(b => {
      const marker = L.marker([b.lat, b.lng], {
        icon: L.divIcon({ className: 'bookmark-marker', html: '<div class="bookmark-pin">★</div>', iconSize: [28, 28], iconAnchor: [14, 28] })
      }).addTo(this.map!);
      marker.bindTooltip(b.name, { permanent: false, direction: 'top', offset: [0, -28] });
      marker.on('click', () => this.selectLocation(b.lat, b.lng, b.name));
      this.bookmarkMarkers.push(marker);
    });
  }

  private updateBookmarksMapToggleUI(): void {
    const btn = this.$.toggleBookmarksMapBtn;
    if (btn) btn.textContent = this.showBookmarksOnMap ? '🚫 Hide on Map' : '👁 Show on Map';
  }

  // ================================================================
  //  SEARCH HISTORY & INPUT HANDLING
  // ================================================================
  private _loadSearchHistory(): string[] {
    try { return JSON.parse(localStorage.getItem(this.searchHistoryKey) || '[]'); } catch { return []; }
  }

  private _saveSearchHistory(): void {
    localStorage.setItem(this.searchHistoryKey, JSON.stringify(this.searchHistory));
  }

  private showSearchHistory(): void {
    const results = this.$.searchResults;
    if (!results) return;
    if (this.searchHistory.length === 0) {
      results.innerHTML = '<div class="px-3 py-3 text-xs text-slate-400 text-center">No recent searches</div>';
    } else {
      results.innerHTML = `
        <div class="px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-slate-200/30 dark:border-slate-700/30">
          <span>Recent Searches</span>
        </div>
        ${this.searchHistory.map((h, i) => `
          <button class="search-history-item w-full px-3 py-2 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 flex items-center gap-2" data-index="${i}">
            <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <span class="truncate">${h}</span>
          </button>
        `).join('')}
      `;
      results.querySelectorAll('.search-history-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt((btn as HTMLElement).dataset.index || '0', 10);
          this.$.searchInput!.value = this.searchHistory[idx];
          this.handleSearchInput();
        });
      });
    }
    this.$.searchDropdown?.classList.add('open');
  }

  private addToSearchHistory(query: string): void {
    const trimmed = query.trim();
    if (!trimmed) return;
    this.searchHistory = [trimmed, ...this.searchHistory.filter(h => h !== trimmed)].slice(0, 10);
    this._saveSearchHistory();
  }

  private handleSearchInput(): void {
    const query = this.$.searchInput?.value.trim() || '';
    this.$.searchClearBtn?.classList.toggle('hidden', query.length === 0);
    this.$.searchSpinner?.classList.add('hidden');

    if (query.length < 2) {
      this.showSearchHistory();
      return;
    }

    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(async () => {
      this.$.searchSpinner?.classList.remove('hidden');
      try {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`);
        if (!response.ok) throw new Error('Geocoding failed');
        const data = await response.json();
        const results = (data.results || []).map((r: any) => ({
          name: r.name,
          country: r.country || '',
          admin1: r.admin1 || '',
          latitude: r.latitude,
          longitude: r.longitude,
        }));
        this.renderSearchResults(results);
      } catch (e) {
        console.warn('Search failed:', e);
        this.renderSearchResults([]);
      } finally {
        this.$.searchSpinner?.classList.add('hidden');
      }
    }, 250);
  }

  private renderSearchResults(results: any[]): void {
    const container = this.$.searchResults;
    if (!container) return;
    if (results.length === 0) {
      container.innerHTML = '<div class="px-3 py-3 text-xs text-slate-400 text-center">No results found</div>';
    } else {
      container.innerHTML = results.map((r, i) => `
        <button class="search-result-item w-full px-3 py-2 text-left text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 flex items-center gap-2" data-result="${i}">
          <svg class="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <span class="truncate">${r.name}${r.admin1 ? `, ${r.admin1}` : ''}${r.country ? `, ${r.country}` : ''}</span>
        </button>
      `).join('');
      container.querySelectorAll('.search-result-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt((btn as HTMLElement).dataset.result || '0', 10);
          const r = results[idx];
          this.selectLocation(r.latitude, r.longitude, `${r.name}${r.admin1 ? `, ${r.admin1}` : ''}${r.country ? `, ${r.country}` : ''}`);
          this.addToSearchHistory(`${r.name}${r.admin1 ? `, ${r.admin1}` : ''}${r.country ? `, ${r.country}` : ''}`);
          this.$.searchInput!.value = '';
          this.clearSearch();
        });
      });
    }
    this.$.searchDropdown?.classList.add('open');
  }

  private clearSearch(): void {
    this.$.searchInput!.value = '';
    this.$.searchClearBtn?.classList.add('hidden');
    this.$.searchDropdown?.classList.remove('open');
  }

  private handleSearchKeyboard(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = this.$.searchInput?.value.trim();
      if (query) {
        this.addToSearchHistory(query);
        this.handleSearchInput();
      }
    }
  }

  // ================================================================
  //  TOAST NOTIFICATIONS
  // ================================================================
  private _tooltipHideTimer: ReturnType<typeof setTimeout> | null = null;
  private showToast(message: string, type: 'info' | 'success' | 'error' = 'info', duration = 4000): void {
    const key = `${type}:${message}`;
    if (this._toastKeys.has(key)) return;
    this._toastKeys.add(key);

    const container = this.$.toastContainer;
    if (!container) return;
    const toast = document.createElement('div');
    const icons = { info: 'ℹ️', success: '✅', error: '❌' };
    const colors = { info: 'bg-blue-600', success: 'bg-emerald-600', error: 'bg-red-600' };
    toast.className = `toast pointer-events-auto ${colors[type]} text-white px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium flex items-center gap-2 animate-in slide-in-from-bottom-4`;
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding', 'animate-out', 'slide-out-to-top-2', 'fade-out');
      toast.addEventListener('animationend', () => { toast.remove(); this._toastKeys.delete(key); });
    }, duration);
  }

  // ================================================================
  //  WEATHER PANEL VISIBILITY
  // ================================================================
  private showWeatherPanel(): void {
    this.$.weatherPanel?.classList.add('open');
    this.$.weatherPanel?.classList.remove('minimized');
    if (this.$.panelMinimizeBtn) this.$.panelMinimizeBtn.classList.remove('chevron-flipped');
    if (window.innerWidth < 640 && this.$.radarExpandedPanel && !this.$.radarExpandedPanel.classList.contains('hidden')) {
      this.$.radarExpandedPanel.classList.add('hidden');
      this.$.radarCollapsedBtn?.classList.remove('hidden');
    }
    this.stopAllSounds();
    if (this.audioActive) this.toggleAmbientSoundscape();
    this.activeEffectType = 'none';
    this.particles = [];
    if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private hideWeatherPanel(): void {
    this.$.weatherPanel?.classList.remove('open', 'minimized');
    document.documentElement.classList.remove('compact');
    if (this.$.panelMinimizeBtn) this.$.panelMinimizeBtn.classList.remove('chevron-flipped');
    this.stopAllSounds();
    if (this.audioActive) this.toggleAmbientSoundscape();
    this.activeEffectType = 'none';
    this.particles = [];
    if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; }
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private toggleMinimizeWeatherPanel(): void {
    this.$.weatherPanel?.classList.toggle('minimized');
    if (this.$.panelMinimizeBtn) {
      this.$.panelMinimizeBtn.classList.toggle('chevron-flipped', this.$.weatherPanel?.classList.contains('minimized') || false);
    }
  }

  private toggleMinimalMode(): void {
    this.minimalMode = !this.minimalMode;
    document.documentElement.classList.toggle('compact', this.minimalMode);
    const panel = this.$.weatherPanel;
    if (this.minimalMode) {
      if (panel.querySelector('#weatherPanelContent')) panel.dataset.fullContent = panel.innerHTML;
      const minimalHTML = `...`; // truncated for brevity
      this.setSafeHTML(panel, minimalHTML);
      panel.querySelector('#minimalExitBtn')?.addEventListener('click', () => this.toggleMinimalMode());
    } else {
      this.setSafeHTML(panel, panel.dataset.fullContent || '');
      this.rebindPanelEvents();
    }
    this.saveUserDataToCloud();
  }

  private rebindPanelEvents(): void {
    this.$.panelCloseBtn?.addEventListener('click', () => this.hideWeatherPanel());
    this.$.panelMinimizeBtn?.addEventListener('click', () => this.toggleMinimizeWeatherPanel());
    this.$.favoriteToggleBtn?.addEventListener('click', () => this.toggleFavoriteCurrentLocation());
    this.$.shareWeatherBtn?.addEventListener('click', () => this.shareWeather());
    this.$.briefingBtn?.addEventListener('click', () => this.generateBriefing());
    this.$.signalNoiseBtn?.addEventListener('click', () => this.toggleSignalNoiseView());
    this.$.confidenceToggle?.addEventListener('click', () => {
      this.showConfidence = !this.showConfidence;
      this.$.confidenceToggle?.classList.toggle('bg-primary/20', this.showConfidence);
      if (this.weatherData) this.drawHourlySparkline(parseInt((this.$.timelineSlider as HTMLInputElement).value, 10));
    });
  }

  // ================================================================
  //  WEATHER PANEL UPDATE & RENDERING (abbreviated)
  // ================================================================
  private updateWeatherDisplay(hourIndex: number): void {
    // ... (implementation preserved from original)
  }

  private drawHourlySparkline(selectedHourIndex: number): void {
    // ... (implementation preserved from original)
  }

  private renderHourlyStrip(selectedHourIndex: number): void {
    // ... (implementation preserved from original)
  }

  private renderBestOutdoorWindow(hourIndex: number): void {
    // ... (implementation preserved from original)
  }

  private renderDailyForecast(): void {
    // ... (implementation preserved from original)
  }

  private renderUVChart(): void {
    // ... (implementation preserved from original)
  }

  // ================================================================
  //  SERVICE WORKER & PWA
  // ================================================================
  private registerServiceWorker(): void {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('SW registered:', reg.scope))
        .catch(err => console.warn('SW registration failed:', err));
    }
  }

  private installPWA(): void {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then(() => { this.deferredPrompt = null; this.$.installBtn?.classList.add('hidden'); });
    } else if (this._isIOS) {
      this.showToast('Tap the Share button, then "Add to Home Screen"', 'info', 6000);
    }
  }

  // ================================================================
  //  UTILITY METHODS (abbreviated)
  // ================================================================
  private syncUnitLabel(): void { /* ... */ }
  private updateTimelineTooltip(hourIndex: number): void { /* ... */ }
  private handleTimelineChange(hourIndex: number): void { /* ... */ }
  private initTimeline(): void { /* ... */ }
  private updateTimelineDays(): void { /* ... */ }
  private updateSettingsUIFromLocal(): void { /* ... */ }
  private getMyLocation(): void { /* ... */ }
  private readShareableUrl(): void { /* ... */ }
  private updateShareableUrl(): void { /* ... */ }
  private shareWeather(): void { /* ... */ }
  private jumpToNextRain(): void { /* ... */ }
  private toggleSignalNoiseView(): void { /* ... */ }
  private toggleRadar(): void { /* ... */ }
  private initRadarLayers(): Promise<void> { return Promise.resolve(); }
  private startRadarPlayback(): void { /* ... */ }
  private stopRadarPlayback(): void { /* ... */ }
  private toggleRadarPlayback(): void { /* ... */ }
  private toggleDarkMode(): void { /* ... */ }
  private toggleAmbientSoundscape(enabled?: boolean): void { /* ... */ }
  private handleVolumeChange(volume: number): void { /* ... */ }
  }

// ================================================================
//  INSTANCE BOOTSTRAP
// ================================================================

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { window.app = new AurafiskyApp(); });
} else {
  window.app = new AurafiskyApp();
}
