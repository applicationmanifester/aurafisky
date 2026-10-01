// src/main.ts
import { log } from './utils/logger.ts';
import { mapController } from './controllers/MapController.ts';
import { getForecast } from './services/WeatherService.ts';
import { geocode } from './services/GeocodeService.ts';
import { bookmarkModule } from './modules/bookmark.ts';
import { showToast } from './utils/ui/toast.ts';
import { localAuthService } from './services/LocalAuthService.ts';
import { localSyncService } from './services/LocalSyncService.ts';
import { alertService } from './services/AlertService.ts';
import { historyService } from './services/HistoryService.ts';
import { entitlementService } from './services/EntitlementService.ts';
import { initPWA } from './utils/pwa.ts';
import BookmarkDrawer from './ui/BookmarkDrawer.ts';
import SearchBar from './ui/SearchBar.ts';
import AlertPanel from './ui/AlertPanel.ts';
import InsightsPanel from './ui/InsightsPanel.ts';
import UpgradeModal from './ui/UpgradeModal.ts';
import { initViewportResizeListener } from './modules/viewportHeight.ts';
import { destroyWeatherService } from './services/WeatherService.ts';
import { destroyGeocodeService } from './services/GeocodeService.ts';
import { destroyFirebaseCore } from './services/FirebaseCore.ts';
import { weatherCache } from './services/CacheService.ts';
/* ──────────────────────────────────────────────────────────────
 *  Utility helpers (together with imports) that were missing
 *  in the original code.
 *  ────────────────────────────────────────────────────────────── */

function updateUserUI(user: any): void {
  // TODO: implement UI updates based on user state
}

function updateSyncStatus(status: string): void {
  // TODO: show sync status to the user
}

function updateProFeatures(): void {
  // TODO: enable / disable UI based on Pro entitlement
}

/* ──────────────────────────────────────────────────────────────
 *  The application bootstrap
 * ────────────────────────────────────────────────────────────── */

class App {
  private mapManager: import('../modules/MapManager.js').MapManager | null = null;
  private forecast: import('../services/WeatherService.ts').WeatherData | null = null;
  private currentLocation: { lat: number; lon: number } | null = null;
  private user: any | null = null;

  // UI components
  private bookmarkDrawer: BookmarkDrawer | null = null;
  private searchBar: SearchBar | null = null;
  private alertPanel: AlertPanel | null = null;
  private insightsPanel: InsightsPanel | null = null;
  private upgradeModal: UpgradeModal | null = null;

  /* ------------------------------------------------------------------ */
  /*  Public API exposed to the window (for legacy code)              */
  /* ------------------------------------------------------------------ */
  public getBookmarks = () => bookmarkModule.getAll();

  public async signIn() {
    await localAuthService.signIn(); // assume method exists
    showToast('Signed in');
  }

  public async signOut() {
    await localAuthService.signOut(); // assume method exists
    showToast('Signed out');
  }

  public async upgradeToPro() {
    const res = await entitlementService.upgrade(); // assume method exists
    if (res.success) showToast('Upgrade successful');
    else showToast('Upgrade failed');
  }

  /* ------------------------------------------------------------------ */
  /*  Core initialization sequence                                   */
  /* ------------------------------------------------------------------ */
  public async init() {
    log('Initializing Aurafisky (local-first mode)...');

    initViewportResizeListener();

    await this.waitForAuth();
    this.subscribeToServices();

    await initPWA(); // No VAPID key needed for local mode

    this.mapManager = mapController.init('mapContainer');
    mapController.onWeatherUpdate = this.handleWeatherUpdate.bind(this);
    this.setupMapEvents();

    await this.initUI();

    const map = this.mapManager?.getMap();
    if (map) {
      const view = map.getView();
      const center = view.getCenter();
      if (center) {
        const [lon, lat] = center;
        await this.refreshWeather(lat, lon);
      }
    }

    // Initialize services that need explicit init
    await historyService.initialize();
    alertService.loadLocal();

    log('App initialized');
  }

  /* ------------------------------------------------------------------ */
  /*  Helper methods                                                  */
  /* ------------------------------------------------------------------ */
  private async waitForAuth(): Promise<void> {
    await localAuthService.ready();
    localAuthService.on('auth:changed', (user: any) => {
      this.user = user;
      updateUserUI(user);
      log('Auth state changed:', user ? `UID: ${user.uid}` : 'signed out');
    });
  }

  private subscribeToServices(): void {
    localSyncService.onStatusChange((status: string) =>
      updateSyncStatus(status)
    );
    alertService.subscribe(() => {
      /* alerts updated – hook UI updates here */
    });
    historyService.subscribe(() => {
      /* history updated – hook UI updates here */
    });
    entitlementService.subscribe(() => updateProFeatures());
  }

  private setupMapEvents(): void {
    const map = this.mapManager?.getMap();
    if (!map) return;
    map.on('click', (e: any) => {
      if (e.originalEvent?.shiftKey) {
        const coord = map.getCoordinateFromPixel(e.pixel);
        if (coord) {
          const [lon, lat] = coord;
          this.addBookmarkAtLocation(lat, lon);
        }
      }
    });
  }

  private async initUI(): Promise<void> {
    this.bookmarkDrawer = new BookmarkDrawer(
      'bookmarkDrawer',
      mapController,
      { getForecast },
      bookmarkModule
    );
    this.bookmarkDrawer.init();

    this.searchBar = new SearchBar(
      'searchInput',
      'searchBtn',
      mapController,
      { geocode },
      { getForecast }
    );
    this.searchBar.init();

    this.alertPanel = new AlertPanel('alertPanel');
    this.alertPanel.init();

    this.insightsPanel = new InsightsPanel('insightsPanel');
    this.insightsPanel.init();

    this.upgradeModal = new UpgradeModal();
    await this.upgradeModal.init();

    /* expose legacy actions to window for backward‑compat */
    window.performSearch = this.performSearch.bind(this);
    window.addBookmark = this.addBookmark.bind(this);
    window.removeBookmark = this.removeBookmark.bind(this);
    window.getBookmarks = this.getBookmarks;
    window.toggleBookmarkDrawer = () => this.bookmarkDrawer?.toggle();
    window.openUpgradeModal = () => this.upgradeModal?.open();
    window.signIn = this.signIn.bind(this);
    window.signOut = this.signOut.bind(this);
    window.upgradeToPro = this.upgradeToPro.bind(this);

    bookmarkModule.subscribe(() => {
      this.bookmarkDrawer?.updateLocations?.();
      this.insightsPanel?.updateLocations?.();
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Weather handling                                                */
  /* ------------------------------------------------------------------ */
  private async refreshWeather(lat: number, lon: number): Promise<void> {
    try {
      const data = await getForecast(lat, lon, { units: 'celsius' });
      this.forecast = data;
      this.currentLocation = { lat, lon };
      const locationKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      historyService.triggerSnapshot(lat, lon, locationKey);
      this.renderForecast(data);
      log('Weather data updated:', data.current_weather);
    } catch (err) {
      log('Weather fetch error', err);
      showToast('Failed to load weather');
    }
  }

  private renderForecast(data: any): void {
    window.dispatchEvent(new CustomEvent('weather:update', { detail: data }));
  }

  private async performSearch(query: string): Promise<void> {
    try {
      const results = await geocode(query);
      if (!results.length) {
        showToast('No results found');
        return;
      }
      const { lat, lon, display_name } = results[0];
      mapController.setView(lat, lon);
      await this.refreshWeather(lat, lon);
      showToast(`Found: ${display_name.split(',')[0]}`);
    } catch (e) {
      showToast('Search error');
      log('Search error', e);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Bookmark handling                                              */
  /* ------------------------------------------------------------------ */
  private async addBookmark(item: any): Promise<void> {
    const canAdd = await entitlementService.canAddBookmark(
      bookmarkModule.getCount()
    );
    if (!canAdd) {
      showToast('Free tier limited to 3 bookmarks. Upgrade for unlimited.');
      this.upgradeModal?.open();
      return;
    }
    const bookmark = await bookmarkModule.add({
      ...item,
      name:
        item.name ?? `Location ${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}`,
    });
    showToast(`Saved "${bookmark.name}"`);
    this.bookmarkDrawer?.render?.();
    this.updateLocationBookmarkButton();
  }

  private async removeBookmark(id: string): Promise<void> {
    await bookmarkModule.remove(id);
    showToast('Bookmark removed');
    this.bookmarkDrawer?.render?.();
    this.updateLocationBookmarkButton();
  }

  private updateLocationBookmarkButton(): void {
    if (!this.currentLocation) return;
    const key = `${this.currentLocation.lat.toFixed(4)},${this.currentLocation.lon.toFixed(4)}`;
    const exists = bookmarkModule.getAll().some(
      (b) => `${b.lat.toFixed(4)},${b.lon.toFixed(4)}` === key
    );
    // TODO: enable/disable the bookmark‑button in the UI
  }

  /* ------------------------------------------------------------------ */
  /*  Internal helper to keep the map click in sync with bookmarks   */
  /* ------------------------------------------------------------------ */
  private async addBookmarkAtLocation(lat: number, lon: number): Promise<void> {
    await this.addBookmark({ lat, lon });
  }

  /* ------------------------------------------------------------------ */
  /*  Weather update propagation (used by MapController)               */
  /* ------------------------------------------------------------------ */
  private handleWeatherUpdate(data: any): void {
    this.renderForecast(data);
  }

  /**
   * Clean up all resources, timers, listeners, and subscriptions.
   * Call when the app is being torn down (e.g., page unload, auth change).
   */
  public destroy(): void {
    log('Destroying Aurafisky app...');

    // Destroy UI components
    this.bookmarkDrawer?.destroy();
    this.searchBar?.destroy();
    this.alertPanel?.destroy();
    this.insightsPanel?.destroy();
    this.upgradeModal?.destroy();

    // Destroy map controller (which destroys MapManager)
    mapController.destroy();

    // Destroy services
    localAuthService.destroy();
    localSyncService.destroy();
    alertService.destroy();
    historyService.destroy();
    weatherCache.destroy(); // from CacheService
    destroyGeocodeService();
    destroyWeatherService();
    destroyFirebaseCore();

    // Clear references
    this.mapManager = null;
    this.forecast = null;
    this.currentLocation = null;
    this.user = null;
    this.bookmarkDrawer = null;
    this.searchBar = null;
    this.alertPanel = null;
    this.insightsPanel = null;
    this.upgradeModal = null;

    log('App destroyed');
  }
}

/* -------------------------------------------------------------------- */
/*  Bootstrap the application                                         */
/* -------------------------------------------------------------------- */
const appInstance = new App();
appInstance.init().catch((e) => log('Fatal init error', e));

// Expose for debugging and cleanup
(window as any).AurafiskyApp = appInstance;