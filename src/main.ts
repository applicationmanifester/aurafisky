// src/main.ts
import { log } from './utils/logger.ts';
import { mapController } from './controllers/MapController.ts';
import { getForecast } from './services/WeatherService.ts';
import { geocode } from './services/GeocodeService.ts';
import { bookmarkModule } from './modules/bookmark.ts';
import { showToast } from './utils/ui/toast.ts';
import { localAuthService } from './services/LocalAuthService.ts';
import { localSyncService, SYNC_STATUS } from './services/LocalSyncService.ts';
import { alertService } from './services/AlertService.ts';
import { historyService } from './services/HistoryService.ts';
import { entitlementService, FEATURES } from './services/EntitlementService.ts';
import { initPWA } from './utils/pwa.ts';
import BookmarkDrawer from './ui/BookmarkDrawer.ts';
import SearchBar from './ui/SearchBar.ts';
import AlertPanel from './ui/AlertPanel.ts';
import InsightsPanel from './ui/InsightsPanel.ts';
import UpgradeModal from './ui/UpgradeModal.ts';
import { initViewportResizeListener } from './modules/viewportHeight.ts';

const app = {
  map: null as L.Map | null,
  forecast: null as any,
  currentLocation: null as { lat: number; lon: number } | null,
  user: null as any,
};

let bookmarkDrawer: BookmarkDrawer | null = null;
let searchBar: SearchBar | null = null;
let alertPanel: AlertPanel | null = null;
let insightsPanel: InsightsPanel | null = null;
let upgradeModal: UpgradeModal | null = null;

async function initializeApp() {
  log('Initializing Aurafisky (local-first mode)...');

  initViewportResizeListener();

  // Wait for auth to be ready
  await localAuthService.ready();

  localAuthService.on('auth:changed', (user) => {
    app.user = user;
    updateUserUI(user);
    log('Auth state changed:', user ? `UID: ${user.uid}` : 'signed out');
  });

  localSyncService.onStatusChange((status) => updateSyncStatus(status));

  alertService.subscribe(() => { /* alerts updated */ });

  historyService.subscribe(() => { /* history updated */ });

  entitlementService.subscribe(() => updateProFeatures());

  await initPWA(); // No VAPID key needed for local mode

  app.map = mapController.init('mapContainer');
  mapController.onWeatherUpdate = handleWeatherUpdate;
  setupMapEvents();

  await initializeUI();

  const center = app.map!.getCenter();
  await refreshWeather(center.lat, center.lng);

  log('App initialized');
}

function setupMapEvents() {
  if (!app.map) return;
  app.map.on('click', (e: L.LeafletMouseEvent) => {
    if (e.originalEvent.shiftKey) {
      addBookmarkAtLocation(e.latlng.lat, e.latlng.lng);
    }
  });
}

async function initializeUI() {
  bookmarkDrawer = new BookmarkDrawer('bookmarkDrawer', mapController, { getForecast }, bookmarkModule);
  bookmarkDrawer.init();

  searchBar = new SearchBar('searchInput', 'searchBtn', mapController, { geocode }, { getForecast });
  searchBar.init();

  alertPanel = new AlertPanel('alertPanel');
  alertPanel.init();

  insightsPanel = new InsightsPanel('insightsPanel');
  insightsPanel.init();

  upgradeModal = new UpgradeModal();
  await upgradeModal.init();

  window.performSearch = performSearch;
  window.addBookmark = addBookmark;
  window.removeBookmark = removeBookmark;
  window.getBookmarks = () => bookmarkModule.getAll();
  window.toggleBookmarkDrawer = () => bookmarkDrawer?.toggle();
  window.openUpgradeModal = () => upgradeModal?.open();
  window.signIn = signIn;
  window.signOut = signOut;
  window.upgradeToPro = upgradeToPro;

  bookmarkModule.subscribe(() => {
    bookmarkDrawer?.updateLocations?.();
    insightsPanel?.updateLocations?.();
  });
}

async function refreshWeather(lat: number, lon: number) {
  try {
    const data = await getForecast(lat, lon, { units: 'celsius' });
    app.forecast = data;
    app.currentLocation = { lat, lon };
    const locationKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    historyService.triggerSnapshot(lat, lon, locationKey);
    renderForecast(data);
    log('Weather data updated:', data.current_weather);
  } catch (err) {
    log('Weather fetch error', err);
    showToast('Failed to load weather');
  }
}

function renderForecast(data: any) {
  window.dispatchEvent(new CustomEvent('weather:update', { detail: data }));
}

async function performSearch(query: string) {
  try {
    const results = await geocode(query);
    if (results.length) {
      const { lat, lon, display_name } = results[0];
      mapController.setView(app.map!, lat, lon);
      await refreshWeather(lat, lon);
      showToast(`Found: ${display_name.split(',')[0]}`);
    } else {
      showToast('No results found');
    }
  } catch (e) {
    showToast('Search error');
    log('Search error', e);
  }
}

async function addBookmark(item: any) {
  const canAdd = await entitlementService.canAddBookmark(bookmarkModule.getCount());
  if (!canAdd) {
    showToast('Free tier limited to 3 bookmarks. Upgrade for unlimited.');
    upgradeModal?.open();
    return;
  }
  const bookmark = await bookmarkModule.add({ ...item, name: item.name || `Location ${item.lat.toFixed(2)}, ${item.lon.toFixed(2)}` });
  showToast(`Saved "${bookmark.name}"`);
  bookmarkDrawer?.render?.();
  updateLocationBookmarkButton();
}

async function removeBookmark(id: string) {
  await bookmarkModule.remove(id);
  showToast('Bookmark removed');
  bookmarkDrawer?.render?.();
  updateLocationBookmarkButton();
}

function updateLocationBookmarkButton() {
  if (!app.currentLocation) return;
  const key = `${app.currentLocation.lat.toFixed(4)},${app.currentLocation.lon.toFixed(4)}`;
  const exists = bookmarkModule.getAll().some(b => `${b.lat.toFixed(4)},${b.lon.toFixed(4)}` === key);
  const btn = document.getElementById('bookmarkCurrentBtn');
  if (btn) {
    btn.textContent = exists ? 'Saved' : 'Save Location';
    btn.classList.toggle('saved', exists);
    btn.onclick = exists ? () => removeCurrentBookmark(key) : () => addBookmarkAtLocation(app.currentLocation!.lat, app.currentLocation!.lon);
  }
}

function addBookmarkAtLocation(lat: number, lon: number) {
  const name = prompt('Enter a name for this location:', `Location ${lat.toFixed(2)}, ${lon.toFixed(2)}`);
  if (name) addBookmark({ lat, lon, name });
}

function removeCurrentBookmark(key: string) {
  const bookmarks = bookmarkModule.getAll();
  const bm = bookmarks.find(b => `${b.lat.toFixed(4)},${b.lon.toFixed(4)}` === key);
  if (bm) removeBookmark(bm.id);
}

function handleWeatherUpdate(data: any, center: { lat: number; lon: number }) {
  app.forecast = data;
  app.currentLocation = center;
  renderForecast(data);
  updateLocationBookmarkButton();
}

function updateUserUI(user: any) {
  const userMenu = document.getElementById('userMenu');
  const signInBtn = document.getElementById('signInBtn');
  const userAvatar = document.getElementById('userAvatar');
  const upgradeBtn = document.getElementById('upgradeBtn');

  if (user) {
    if (signInBtn) signInBtn.style.display = 'none';
    if (userAvatar) {
      userAvatar.style.display = 'flex';
      userAvatar.textContent = user.displayName?.[0] || user.email?.[0] || 'U';
      userAvatar.title = user.displayName || user.email || 'Anonymous';
    }
    if (userMenu) userMenu.style.display = 'block';
    if (upgradeBtn) upgradeBtn.style.display = user.isAnonymous ? 'block' : 'block';
  } else {
    if (signInBtn) signInBtn.style.display = 'block';
    if (userAvatar) userAvatar.style.display = 'none';
    if (userMenu) userMenu.style.display = 'none';
  }
}

async function signIn() {
  // In local mode, just prompt for a name/email
  const email = prompt('Enter email for local profile:');
  if (!email) return;
  
  try {
    const { user } = await localAuthService.signInWithEmail(email, '');
    showToast(`Welcome, ${user.displayName || 'User'}!`);
  } catch (err: any) {
    showToast('Sign in failed');
    log('Sign in error', err);
  }
}

async function signOut() {
  try {
    await localAuthService.signOut();
    showToast('Signed out (switched to anonymous)');
  } catch (err) { showToast('Sign out failed'); }
}

async function upgradeToPro() {
  try {
    await localAuthService.upgradeTier('pro');
    showToast('Upgraded to Pro! Unlimited bookmarks and alerts enabled.');
    updateProFeatures();
  } catch (err) {
    showToast('Upgrade failed');
    log('Upgrade error', err);
  }
}

function updateSyncStatus(status: typeof SYNC_STATUS[keyof typeof SYNC_STATUS]) {
  const indicator = document.getElementById('syncStatus');
  if (!indicator) return;
  const icons = { synced: '☁️', syncing: '🔄', offline: '📴', error: '⚠️' };
  const labels = { synced: 'Synced', syncing: 'Syncing...', offline: 'Offline', error: 'Sync Error' };
  indicator.innerHTML = `<span>${icons[status] || '❓'}</span><span>${labels[status] || status}</span>`;
  indicator.className = `sync-status ${status}`;
}

async function updateProFeatures() {
  const ent = await entitlementService.getAll();
  const isPro = ent.tier === 'pro' || ent.tier === 'trial';
  document.querySelectorAll('[data-pro]').forEach(el => (el as HTMLElement).style.display = isPro ? '' : 'none');
  document.querySelectorAll('[data-free]').forEach(el => (el as HTMLElement).style.display = isPro ? 'none' : '');

  const upgradeBtn = document.getElementById('upgradeBtn');
  if (upgradeBtn) {
    if (ent.tier === 'trial') {
      upgradeBtn.textContent = `Trial: ${ent.trialEndsAt ? Math.ceil((ent.trialEndsAt - Date.now()) / 86400000) : '?'} days left`;
      upgradeBtn.classList.add('trial');
    } else if (ent.tier === 'pro') {
      upgradeBtn.textContent = 'Pro Active';
      upgradeBtn.classList.add('pro');
      (upgradeBtn as HTMLButtonElement).disabled = true;
    } else {
      upgradeBtn.textContent = 'Upgrade to Pro';
      upgradeBtn.classList.remove('trial', 'pro');
      (upgradeBtn as HTMLButtonElement).disabled = false;
    }
  }
}

initializeApp().catch(err => {
  log('App initialization failed', err);
  showToast('Failed to initialize app');
});