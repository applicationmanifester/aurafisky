// features/sync.js
// ── CROSS-TAB / SEAMLESS SYNC ─────────────────────────────────────────
//
// Keeps every open tab of Aurafisky in sync without a page reload:
//
//   • Bookmarks added/removed/edited in one tab appear instantly in all
//     others (list + map pins + star UI).
//   • Location switches, theme toggles, unit changes and alert-rule edits
//     propagate to sibling tabs.
//   • Alert rules saved to the cloud follow the account AND the open tabs.
//
// Two transports, both same-origin (no network):
//
//   1. BroadcastChannel "aurafisky-sync" — tab-to-tab messages for actions
//      the user takes (bookmark toggle, location pick, theme/unit flip).
//   2. window "storage" event — localforage writes made by another tab
//      (or the same tab in a different window) are picked up here too.
//
// Every handler is defensive: unknown/shaped-wrong payloads are ignored,
// and a tab never syncs back a change it originated (echo suppression via
// a per-tab source id). Pure helpers are exported for unit testing.

export const SYNC_CHANNEL = "aurafisky-sync";

// Per-tab source id so we don't echo our own changes back to ourselves.
const SOURCE_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

let channel = null;
let appRef = null;

// ── Channel setup ────────────────────────────────────────────────────

function openChannel() {
  if (channel) return channel;
  try {
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(SYNC_CHANNEL);
    }
  } catch (e) {
    /* BroadcastChannel unavailable (private mode, older browser) —
       fall back to the storage-event path below only. */
    channel = null;
  }
  return channel;
}

function post(type, payload) {
  const ch = openChannel();
  if (!ch) return;
  try {
    ch.postMessage({ source: SOURCE_ID, type, payload, ts: Date.now() });
  } catch (e) {
    /* channel may have gone silent — ignore */
  }
}

// ── Outgoing: announce changes this tab made ─────────────────────────

/** Call after bookmarks change so other tabs refresh their list + pins. */
export function syncBookmarks(bookmarks) {
  post("bookmarks:changed", { bookmarks });
}

/** Call after the user picks a new location on the map / search. */
export function syncLocation(lat, lng, name) {
  post("location:changed", { lat, lng, name });
}

/** Call after a theme toggle. */
export function syncTheme(isDark) {
  post("theme:changed", { isDark });
}

/** Call after a units toggle. */
export function syncUnits(units) {
  post("units:changed", { units });
}

/** Call after alert rules are added/removed/toggled. */
export function syncAlertRules(alertRules) {
  post("alertRules:changed", { alertRules });
}

/** Call after the default location / notify settings change. */
export function syncDefaultLocation(defaultLocation, defaultLocationNotify, notifyIntervalMin) {
  post("defaultLocation:changed", { defaultLocation, defaultLocationNotify, notifyIntervalMin });
}

/** Call after the device profile changes (language, input type, etc.). */
export function syncDeviceProfile(profile) {
  post("deviceProfile:changed", profile);
}

// ── Incoming: apply changes from other tabs ──────────────────────────

function handleMessage(event) {
  const { source, type, payload } = event.data || {};
  if (!type || source === SOURCE_ID) return; // ignore ourself / malformed

  const app = appRef;
  if (!app) return;

  try {
    switch (type) {
      case "bookmarks:changed":
        if (Array.isArray(payload.bookmarks)) {
          app.bookmarks = payload.bookmarks;
          if (typeof app.renderBookmarksList === "function") app.renderBookmarksList();
          if (typeof app.updateStarUI === "function") app.updateStarUI();
          if (typeof app.refreshBookmarkPins === "function") app.refreshBookmarkPins();
          if (typeof app.showToast === "function") {
            // subtle — don't toast every bookmark sync; only log
          }
        }
        break;

      case "location:changed":
        if (
          payload.lat != null &&
          payload.lng != null &&
          (payload.lat !== app.selectedLat || payload.lng !== app.selectedLng)
        ) {
          // Don't re-fetch weather here — let the user decide. Just mirror
          // the selection UI so tabs agree on what's "selected".
          if (typeof app._updateHeaderLocationAndCoords === "function") {
            app._updateHeaderLocationAndCoords(
              payload.name,
              payload.lat,
              payload.lng,
            );
          }
          if (typeof app.updateStarUI === "function") app.updateStarUI();
        }
        break;

      case "theme:changed":
        if (typeof payload.isDark === "boolean" && payload.isDark !== app.isDark) {
          if (typeof app.toggleDarkMode === "function") app.toggleDarkMode();
        }
        break;

      case "units:changed":
        if (payload.units && WeatherService.getUnits() !== payload.units) {
          if (typeof WeatherService.setUnits === "function") {
            WeatherService.setUnits(payload.units);
          }
          if (typeof app.syncUnitLabel === "function") app.syncUnitLabel();
          if (typeof app.updateWeatherDisplay === "function") {
            app.updateWeatherDisplay(app.currentHourIndex);
          }
        }
        break;

      case "alertRules:changed":
        if (Array.isArray(payload.alertRules)) {
          const normalized = typeof app.normalizeAlertRules === "function"
            ? app.normalizeAlertRules(payload.alertRules)
            : payload.alertRules;
          app.alertRules = normalized;
          if (typeof app.persistAlertRules === "function") app.persistAlertRules();
          if (typeof app.renderAlertsPanel === "function") app.renderAlertsPanel();
        }
        break;

      case "defaultLocation:changed":
        if (payload.defaultLocation) {
          app.defaultLocation = payload.defaultLocation;
        }
        if (typeof payload.defaultLocationNotify === "boolean") {
          app.defaultLocationNotify = payload.defaultLocationNotify;
        }
        if (typeof payload.notifyIntervalMin === "number") {
          app.notifyIntervalMin = payload.notifyIntervalMin;
        }
        if (typeof app.updateHomeButton === "function") app.updateHomeButton();
        if (typeof app.updateHomeMarker === "function") app.updateHomeMarker();
        if (typeof app.updateSettingsUIFromLocal === "function") {
          app.updateSettingsUIFromLocal();
        }
        break;

      default:
        // Unknown message type — ignore forward-compatibly.
        break;
    }
  } catch (e) {
    /* never let a sync message break the receiving tab */
    console.warn("Aurafisky sync: failed to apply message", type, e);
  }
}

function handleStorageEvent(event) {
  // localforage writes dispatch standard storage events same-origin.
  const app = appRef;
  if (!app || !event.key) return;

  // defaultLocation changes made in another tab.
  if (event.key === "defaultLocation") {
    try {
      const val = event.newValue ? JSON.parse(event.newValue) : null;
      if (val && val.lat != null && val.lng != null) {
        app.defaultLocation = val;
        if (typeof app.updateHomeButton === "function") app.updateHomeButton();
        if (typeof app.updateHomeMarker === "function") app.updateHomeMarker();
      }
    } catch {
      /* ignore malformed */
    }
    return;
  }

  // alertRules changes persisted by another tab.
  if (event.key === "aurafisky_alert_rules") {
    try {
      const val = event.newValue ? JSON.parse(event.newValue) : null;
      if (Array.isArray(val)) {
        const normalized = typeof app.normalizeAlertRules === "function"
          ? app.normalizeAlertRules(val)
          : val;
        app.alertRules = normalized;
        if (typeof app.renderAlertsPanel === "function") app.renderAlertsPanel();
      }
    } catch {
      /* ignore malformed */
    }
    return;
  }
}

// ── Public API ───────────────────────────────────────────────────────

export function init(app) {
  appRef = app;

  // Start listening for messages from sibling tabs.
  const ch = openChannel();
  if (ch) {
    ch.addEventListener("message", handleMessage);
  }

  // Listen for localforage writes from other tabs / windows.
  if (typeof window !== "undefined") {
    window.addEventListener("storage", handleStorageEvent);
  }

  // Announce our existing state so late-joining tabs converge.
  // Defer slightly so the other tab finishes registering its listener.
  setTimeout(() => {
    if (app.bookmarks && app.bookmarks.length) syncBookmarks(app.bookmarks);
    if (app.selectedLat != null)
      syncLocation(app.selectedLat, app.selectedLng, app.selectedName);
    syncTheme(app.isDark);
    syncUnits(WeatherService.getUnits());
    if (Array.isArray(app.alertRules)) syncAlertRules(app.alertRules);
  }, 300);

  // Expose for other features to publish.
  app.syncBus = { post, syncBookmarks, syncLocation, syncTheme, syncUnits, syncAlertRules, syncDefaultLocation };

  // Cleanup on page unload.
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", () => {
      if (ch) {
        try { ch.close(); } catch { /* ignore */ }
        channel = null;
      }
      window.removeEventListener("storage", handleStorageEvent);
    });
  }
}
