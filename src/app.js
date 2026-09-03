// src/app.js
import { log } from './utils/logger.js';
import { mapController } from './controllers/MapController.js';
import { getForecast, toFahrenheit, toCelsius } from './services/WeatherService.js';
import { geocode } from './modules/search.js';
import { addBookmark, loadBookmarks, removeBookmark } from './modules/bookmark.js';
import { showToast } from './modules/toast.js';
import BookmarkDrawer from './ui/BookmarkDrawer.js';
import SearchBar from './ui/SearchBar.js';
import { initViewportResizeListener } from './modules/viewportHeight.js';
import { lifecycleManager } from './services/LifecycleManager.js';
import { FIREBASE_CONFIG } from './config/constants.js';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken } from 'firebase/messaging';

// --- Firebase ----------------------------------------------------
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const messaging = getMessaging(firebaseApp);

// --- App state -----------------------------------------------------
const app = {
  map: null,
  forecast: null,
  fcmToken: null,
  bookmarks: [],
};

// --- Viewport -----------------------------------------------------
initViewportResizeListener();

// --- Map -----------------------------------------------------------
app.map = mapController.init('mapContainer');

// --- UI Modules ---------------------------------------------------
const bookmarkDrawer = new BookmarkDrawer('bookmarkDrawer', mapController, { getForecast }, { addBookmark, loadBookmarks, removeBookmark, getBookmarks });
bookmarkDrawer.init();

const searchBar = new SearchBar('searchInput', 'searchBtn', mapController, { geocode }, { getForecast });
searchBar.init();

// --- Weather -------------------------------------------------------
async function refreshWeather(lat, lon) {
  try {
    const data = await getForecast(lat, lon, 'celsius');
    app.forecast = data;
    // TODO: render forecast into UI
    log('Weather data:', data);
  } catch (err) {
    log('Weather fetch error', err);
  }
}

app.map.on('moveend', () => {
  const center = app.map.getCenter();
  refreshWeather(center.lat, center.lng);
});

// Initial load
refreshWeather(app.map.getCenter().lat, app.map.getCenter().lng);

// --- Search --------------------------------------------------------
window.performSearch = async function (query) {
  try {
    const results = await geocode(query);
    if (results.length) {
      const { lat, lon } = results[0];
      mapController.setView(app.map, lat, lon);
      refreshWeather(lat, lon);
    } else {
      showToast('No results found');
    }
  } catch (e) {
    showToast('Search error');
    log('Search error', e);
  }
};

// --- Bookmarks -----------------------------------------------------
app.bookmarks = loadBookmarks();
window.addBookmark = addBookmark;
window.removeBookmark = removeBookmark;
window.getBookmarks = () => app.bookmarks;

// Toggle bookmark drawer
window.toggleBookmarkDrawer = () => bookmarkDrawer.toggle();

// --- Push notifications ------------------------------------------
async function requestPush() {
  try {
    const token = await getToken(messaging, { vapidKey: FIREBASE_CONFIG.vapidKey });
    log('FCM token', token);
    app.fcmToken = token;
    // TODO: send token to backend
  } catch (err) {
    log('Push registration failed', err);
  }
}
requestPush();

// --- Lifecycle ------------------------------------------------------
lifecycleManager.emit('app:ready');
log('App initialized');

export default app;
