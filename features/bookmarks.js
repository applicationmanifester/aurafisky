// -- SAVED LOCATIONS / BOOKMARKS FAVORITES --
import { HtmlMarker } from "../modules/ol-marker.js";
import { fromLonLat } from "ol/proj.js";

async function loadBookmarks() {
    let cloudBookmarks = [];
    if (this._fb?.firestore && this.user?.uid) {
      cloudBookmarks = (await this._loadBookmarksFromStorage()) || [];
    }
    let localBookmarks = [];
    try {
      localBookmarks = JSON.parse(localStorage.getItem("aurafisky_local_bookmarks") || "[]");
    } catch (_) {}

    const merged = [...cloudBookmarks];
    localBookmarks.forEach((loc) => {
      if (!merged.some((b) => Math.abs(b.lat - loc.lat) < 0.0001 && Math.abs(b.lng - loc.lng) < 0.0001)) {
        merged.push(loc);
      }
    });

    this.bookmarks = merged;
    this.renderBookmarksList();
    this.refreshBookmarkPins();
  }

async function _loadBookmarksFromStorage() {
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

function saveBookmarks() {
    try {
      localStorage.setItem("aurafisky_local_bookmarks", JSON.stringify(this.bookmarks));
    } catch (_) {}
    this.renderBookmarksList();
    this.updateStarUI();
    this.refreshBookmarkPins();
    if (this.user) {
      this.saveUserDataToCloud();
    }
    this.syncBus?.syncBookmarks(this.bookmarks);
  }

function toggleFavoriteCurrentLocation() {
    if (this.selectedLat == null || this.selectedLng == null) return;

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
        name: this.selectedName || `${this.selectedLat.toFixed(2)}, ${this.selectedLng.toFixed(2)}`,
        lat: this.selectedLat,
        lng: this.selectedLng,
      });
      this.showToast("Saved location to bookmarks.", "success");
    }
    this.saveBookmarks();
  }

function isCurrentLocationFavorited() {
    if (this.selectedLat == null || this.selectedLng == null) return false;
    return this.bookmarks.some(
      (b) =>
        Math.abs(b.lat - this.selectedLat) < 0.0001 &&
        Math.abs(b.lng - this.selectedLng) < 0.0001,
    );
  }

function updateStarUI() {
    const isFav = this.isCurrentLocationFavorited();
    const btn = this.$.favoriteToggleBtn || document.getElementById("favoriteToggleBtn");
    const star = document.getElementById("favoriteStarIcon") || this.$.favoriteStarIcon;

    if (btn) {
      btn.setAttribute("aria-pressed", isFav ? "true" : "false");
      btn.title = isFav ? "Remove bookmark" : "Bookmark location";
      btn.classList.toggle("is-bookmarked", isFav);
    }

    if (star) {
      star.setAttribute("fill", isFav ? "#f59e0b" : "none");
      star.setAttribute("stroke", isFav ? "#f59e0b" : "currentColor");
      star.classList.toggle("text-amber-500", isFav);
      star.classList.toggle("text-slate-400", !isFav);
    }

    if (this.$.starOutlineIcon && this.$.starOutlineIcon !== star) {
      this.$.starOutlineIcon.classList.toggle("hidden", isFav);
      this.$.starOutlineIcon.style.display = isFav ? "none" : "";
    }
    if (this.$.starFilledIcon && this.$.starFilledIcon !== star) {
      this.$.starFilledIcon.classList.toggle("hidden", !isFav);
      this.$.starFilledIcon.style.display = isFav ? "" : "none";
    }

    const mobileStarIcon = document.getElementById("mobileNavStarIcon");
    if (mobileStarIcon) {
      mobileStarIcon.setAttribute("fill", isFav ? "currentColor" : "none");
    }
  }

function setHomeLocation(lat, lng, name) {
    this.defaultLocation = {
      lat,
      lng,
      name: name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    };
    try {
      localStorage.setItem("defaultLocation", JSON.stringify(this.defaultLocation));
    } catch (_) {}
    if (typeof localforage !== "undefined") {
      localforage.setItem("defaultLocation", this.defaultLocation);
    }
    this.updateHomeButton();
    this.updateHomeMarker();
    this.updateSettingsUIFromLocal?.();
    this.saveUserDataToCloud?.();
    this.showToast(`🏠 Home set to ${this.defaultLocation.name}`, "success");
  }

function removeHomeLocation() {
    this.defaultLocation = null;
    this.defaultLocationNotify = false;
    try {
      localStorage.removeItem("defaultLocation");
    } catch (_) {}
    if (typeof localforage !== "undefined") {
      localforage.setItem("defaultLocation", null);
      localforage.setItem("defaultLocationNotify", false);
    }
    this.setupHourlyNotifications?.();
    this.updateHomeButton();
    this.updateHomeMarker();
    this.updateSettingsUIFromLocal?.();
    this.saveUserDataToCloud?.();
    this.showToast("Home location removed.", "success");
  }

function goToHomeLocation() {
    if (!this.defaultLocation || this.defaultLocation.lat == null) {
      this.showToast("No home location set.", "info");
      return;
    }
    const { lat, lng, name } = this.defaultLocation;
    if (this.map) {
      this.map.getView().animate({ center: fromLonLat([lng, lat]), zoom: 11, duration: 600 });
    }
    this.selectLocation(lat, lng, name);
    this.showToast(`📍 Opening Home: ${(name || 'Home').split(',')[0]}`, "info");
  }

function toggleHomeLocation() {
    if (this.selectedLat == null || this.selectedLng == null) return;

    if (
      this.defaultLocation &&
      Math.abs(this.defaultLocation.lat - this.selectedLat) < 0.0001 &&
      Math.abs(this.defaultLocation.lng - this.selectedLng) < 0.0001
    ) {
      this.removeHomeLocation();
    } else {
      this.setHomeLocation(this.selectedLat, this.selectedLng, this.selectedName);
    }
  }

function updateHomeButton() {
    const hasHome = !!(this.defaultLocation && this.defaultLocation.lat != null);
    const isHome =
      hasHome &&
      this.selectedLat != null &&
      Math.abs(this.defaultLocation.lat - this.selectedLat) < 0.0001 &&
      Math.abs(this.defaultLocation.lng - this.selectedLng) < 0.0001;

    const homeLabel = document.getElementById("mobileNavHomeLabel");
    if (homeLabel) {
      homeLabel.textContent = hasHome ? "Go to Home" : "Set Home";
    }
    const mobileHomeIcon = document.getElementById("mobileNavHomeIcon");
    if (mobileHomeIcon) {
      mobileHomeIcon.classList.toggle("text-teal-600", hasHome);
      mobileHomeIcon.classList.toggle("dark:text-teal-400", hasHome);
      mobileHomeIcon.classList.toggle("text-amber-500", isHome);
    }
    const mobileMapBtn = document.getElementById("mobileNavMapBtn");
    if (mobileMapBtn) {
      mobileMapBtn.title = hasHome ? `Go to Home (${this.defaultLocation.name || 'Home'})` : "Set home location";
      mobileMapBtn.setAttribute("aria-label", hasHome ? "Go to Home" : "Set home location");
    }

    if (this.$.homeOutlineIcon) {
      this.$.homeOutlineIcon.classList.toggle("text-amber-500", hasHome);
      this.$.homeOutlineIcon.classList.toggle("text-slate-400", !hasHome);
    }
    if (this.$.homeToggleBtn) {
      this.$.homeToggleBtn.title = hasHome
        ? `Home: ${this.defaultLocation.name} (Click for options)`
        : "Set as home location";
    }
    if (this.$.panelLocationName) {
      const internalBadge = this.$.panelLocationName.querySelector(".home-badge");
      if (internalBadge) internalBadge.remove();
    }
    const badge = document.getElementById("panelHomeBadge");
    if (badge) {
      badge.classList.toggle("hidden", !isHome);
    }

    // Update Home Dropdown elements
    const homeLocText = document.getElementById("homeDropdownLocationText");
    if (homeLocText) {
      homeLocText.textContent = hasHome ? this.defaultLocation.name : "Not set";
    }
    const homeCurrentText = document.getElementById("homeDropdownCurrentText");
    if (homeCurrentText) {
      homeCurrentText.textContent = this.selectedName || (this.selectedLat != null ? `${this.selectedLat.toFixed(2)}, ${this.selectedLng.toFixed(2)}` : "Select a place first");
    }
  }

function updateHomeMarker() {
    if (this._homeMarker) {
      this._homeMarker.remove();
      this._homeMarker = null;
    }
    if (this.defaultLocation) {
      const html = `
          <span class="home-marker-shell" aria-hidden="true">
            <span class="home-marker-ring"></span>
            <span class="home-marker-pin">
              <span class="home-marker-core"></span>
            </span>
          </span>
        `;
      // Home is an anchor, not a scratch pin: once it is set it must stay put
      // until it is explicitly removed. It used to be draggable in Leaflet,
      // so a stray drag on the map silently relocated the user's home (and
      // pushed the new coordinates to the cloud) with only a toast to say
      // so — an ol.Overlay-backed marker has no drag interaction to begin
      // with, so that failure mode isn't reachable any more.
      this._homeMarker = new HtmlMarker(this.map, {
        lat: this.defaultLocation.lat,
        lng: this.defaultLocation.lng,
        html,
        className: "home-marker",
        size: [40, 56],
        anchor: [20, 50],
        zIndex: 1000,
        tooltip: this.defaultLocation.name,
        tooltipClassName: "home-tooltip",
        onClick: (domEvent) => {
          if (this._isDragGesture({ originalEvent: domEvent })) return;
          this.selectLocation(
            this.defaultLocation.lat,
            this.defaultLocation.lng,
            this.defaultLocation.name,
          );
        },
      });
    }
  }

function renderBookmarksList() {
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
        "flex items-center justify-between px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg group gap-2";

      // Item button
      const btn = document.createElement("button");
      btn.className =
        "bookmark-item-btn text-left truncate flex-1 min-w-0 font-semibold text-slate-700 dark:text-slate-200 hover:text-primary transition-colors cursor-pointer";
      btn.dataset.index = idx;
      btn.textContent = b.name;
      btn.title = b.name;
      btn.addEventListener("click", () => {
        this.$.bookmarksDropdown.classList.add("hidden");
        this.syncMobileBottomNavState?.();
        this.selectLocation(b.lat, b.lng, b.name);
      });
      container.appendChild(btn);

      // Action buttons container
      const actions = document.createElement("div");
      actions.className = "flex items-center gap-1.5 shrink-0 flex-shrink-0";

      // Compare button
      const compareBtn = document.createElement("button");
      compareBtn.className =
        "bookmark-compare-btn px-2 py-0.5 rounded text-[10px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition-colors shrink-0 cursor-pointer";
      compareBtn.dataset.index = idx;
      compareBtn.title = "Compare weather with active location";
      compareBtn.textContent = "Compare";
      compareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.$.bookmarksDropdown.classList.add("hidden");
        this.syncMobileBottomNavState?.();
        this.compareWeatherWithActive?.(this.bookmarks[idx]);
      });
      actions.appendChild(compareBtn);

      // Remove button - always visible with clear trash can icon
      const removeBtn = document.createElement("button");
      removeBtn.className =
        "bookmark-remove-btn w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors shrink-0 flex-shrink-0 cursor-pointer";
      removeBtn.dataset.index = idx;
      removeBtn.title = "Delete bookmark";
      removeBtn.setAttribute("aria-label", "Delete bookmark");
      removeBtn.innerHTML =
        '<svg class="w-4 h-4 shrink-0 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />' +
        "</svg>";
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

// -- BOOKMARK MAP PINS --

function updateBookmarksMapToggleUI() {
    const btn = this.$.toggleBookmarksMapBtn;
    if (!btn) return;
    if (this.showBookmarksOnMap) {
      btn.innerHTML = "🚫 Hide on Map";
    } else {
      btn.innerHTML = "👁️ Show on Map";
    }
  }

async function refreshBookmarkPins() {
    // Clear existing bookmark markers
    (this.bookmarkMarkers || []).forEach((m) => m?.remove?.());
    this.bookmarkMarkers = [];

    if (!this.map || this.bookmarks.length === 0) return;
    if (!this.showBookmarksOnMap) return;

    // Use cached data if recent (< 5 min)
    const pinCache = this._getBookmarkPinCache();
    const now = Date.now();
    const needsFetch = this.bookmarks.filter((b) => {
      const cached = pinCache[b.lat + "_" + b.lng];
      return !cached || now - cached.ts > 300000;
    });

    // Helper to render pins from pinCache or fallbacks
    const renderPins = () => {
      this.bookmarkMarkers.forEach((m) => m.remove());
      this.bookmarkMarkers = [];
      this.bookmarks.forEach((b) => {
        // Don't render a duplicate bookmark pin on top of the active selected location marker card
        if (this.selectedLat != null && this.selectedLng != null) {
          const isSelected =
            Math.abs(b.lat - this.selectedLat) < 0.0001 &&
            Math.abs(b.lng - this.selectedLng) < 0.0001;
          if (isSelected) return;
        }

        const cached = pinCache[b.lat + "_" + b.lng];
        const icon = cached?.weather ? cached.weather.icon : "⭐";
        const tempText = cached?.weather ? WeatherService.formatTemp(cached.weather.temperature) : (b.name ? b.name.split(',')[0] : "Saved");

        const html = `
            <div class="flex items-center gap-1.5 bg-white/95 dark:bg-slate-800/95 rounded-full px-2.5 py-1 shadow-md border-2 border-amber-500 cursor-pointer transition-transform hover:scale-105" style="white-space:nowrap;">
              <span class="text-xs text-amber-500 font-bold">${icon}</span>
              <span class="text-[11px] font-bold text-slate-800 dark:text-white">${tempText}</span>
            </div>
          `;

        const marker = new HtmlMarker(this.map, {
          lat: b.lat,
          lng: b.lng,
          html,
          className: "bookmark-pin-icon",
          size: [80, 30],
          anchor: [40, 15],
          tooltip: b.name,
          tooltipClassName: "location-tooltip",
          onClick: (domEvent) => {
            if (this._isDragGesture({ originalEvent: domEvent })) return;
            this.selectLocation(b.lat, b.lng, b.name);
          },
        });
        this.bookmarkMarkers.push(marker);
      });
    };

    // Render pins immediately so user sees them on the map without waiting
    renderPins();

    if (needsFetch.length > 0) {
      await Promise.all(
        needsFetch.map(async (b) => {
          try {
            const forecast = await WeatherService.fetchForecast(b.lat, b.lng);
            const idx = WeatherService.getCurrentHourIndex(
              forecast,
              forecast?.utc_offset_seconds || 0,
            );
            const w = WeatherService.getHourlyAtIndex(forecast, idx);
            pinCache[b.lat + "_" + b.lng] = { weather: w, ts: Date.now() };
          } catch {
            // Briefly cache failure to avoid aggressive re-tries
            pinCache[b.lat + "_" + b.lng] = { weather: null, ts: Date.now() };
          }
        })
      );
      this._saveBookmarkPinCache(pinCache);
      // Re-render pins with loaded weather data
      renderPins();
    }
  }

function _getBookmarkPinCache() {
    return this._pinCache || {};
  }

function _saveBookmarkPinCache(cache) {
    this._pinCache = cache;
  }

// -- SEVERE WEATHER ALERTS FOR BOOKMARKS --

async function checkBookmarkAlerts() {
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

function startBookmarkAlertPolling() {
    if (this._alertPollTimer) clearInterval(this._alertPollTimer);
    this.checkBookmarkAlerts();
    this._alertPollTimer = setInterval(
      () => this.checkBookmarkAlerts(),
      600000,
    );
  }

export function init(app) {
  app.loadBookmarks = loadBookmarks;
  app._loadBookmarksFromStorage = _loadBookmarksFromStorage;
  app.saveBookmarks = saveBookmarks;
  app.toggleFavoriteCurrentLocation = toggleFavoriteCurrentLocation;
  app.isCurrentLocationFavorited = isCurrentLocationFavorited;
  app.updateStarUI = updateStarUI;
  app.setHomeLocation = setHomeLocation;
  app.removeHomeLocation = removeHomeLocation;
  app.goToHomeLocation = goToHomeLocation;
  app.toggleHomeLocation = toggleHomeLocation;
  app.updateHomeButton = updateHomeButton;
  app.updateHomeMarker = updateHomeMarker;
  app.renderBookmarksList = renderBookmarksList;
  app.updateBookmarksMapToggleUI = updateBookmarksMapToggleUI;
  app.refreshBookmarkPins = refreshBookmarkPins;
  app._getBookmarkPinCache = _getBookmarkPinCache;
  app._saveBookmarkPinCache = _saveBookmarkPinCache;
  app.checkBookmarkAlerts = checkBookmarkAlerts;
  app.startBookmarkAlertPolling = startBookmarkAlertPolling;
}
