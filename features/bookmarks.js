// -- SAVED LOCATIONS / BOOKMARKS FAVORITES --
import { HtmlMarker } from "../modules/ol-marker.js";

async function loadBookmarks() {
    this.bookmarks = (await this._loadBookmarksFromStorage()) || [];
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
    this.renderBookmarksList();
    this.updateStarUI();
    this.refreshBookmarkPins();
    this.saveUserDataToCloud();
  }

function toggleFavoriteCurrentLocation() {
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
    this.$.starOutlineIcon.classList.toggle("hidden", isFav);
    this.$.starFilledIcon.classList.toggle("hidden", !isFav);
  }

function toggleHomeLocation() {
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

function updateHomeButton() {
    const isHome =
      this.defaultLocation &&
      this.selectedLat &&
      Math.abs(this.defaultLocation.lat - this.selectedLat) < 0.0001 &&
      Math.abs(this.defaultLocation.lng - this.selectedLng) < 0.0001;
    if (this.$.homeOutlineIcon) {
      this.$.homeOutlineIcon.classList.toggle("text-amber-500", isHome);
      this.$.homeOutlineIcon.classList.toggle("text-slate-400", !isHome);
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
    this.bookmarkMarkers.forEach((m) => m.remove());
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
    }

    // Render all bookmarks (mix of fresh + cached)
    this.bookmarks.forEach((b) => {
      // Don't render a duplicate bookmark pin on top of the active selected location marker card
      if (this.selectedLat != null && this.selectedLng != null) {
        const isSelected =
          Math.abs(b.lat - this.selectedLat) < 0.0001 &&
          Math.abs(b.lng - this.selectedLng) < 0.0001;
        if (isSelected) return;
      }

      const cached = pinCache[b.lat + "_" + b.lng];
      if (!cached || !cached.weather) return;

      const html = `
          <div class="flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 rounded-lg px-2 py-1 shadow-md border border-slate-200/40 dark:border-slate-600/30 cursor-pointer" style="white-space:nowrap;">
            <span class="text-sm">${cached.weather.icon}</span>
            <span class="text-[10px] font-bold text-slate-800 dark:text-white">${WeatherService.formatTemp(cached.weather.temperature)}</span>
          </div>
        `;

      const marker = new HtmlMarker(this.map, {
        lat: b.lat,
        lng: b.lng,
        html,
        className: "bookmark-pin-icon",
        size: [70, 28],
        anchor: [35, 14],
        tooltip: b.name,
        tooltipClassName: "location-tooltip",
        onClick: (domEvent) => {
          if (this._isDragGesture({ originalEvent: domEvent })) return;
          this.selectLocation(b.lat, b.lng, b.name);
        },
      });
      this.bookmarkMarkers.push(marker);
    });
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
