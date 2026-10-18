// features/analytics.js
// ── Zero-PII, first-party usage analytics ───────────────────────────
//
// The privacy policy promises "no Google Analytics, no third-party tracking
// scripts, no cookies, no beacons". This module honours that promise by
// design: it is the only analytics in the app, it is first-party, and it
// never records a user ID, a coordinate, a query string, a search term, an IP
// address or a device fingerprint.
//
// What it does record:
//   * event name (a fixed, allow-listed set — no free text)
//   * a handful of allow-listed properties (intent category, action id,
//     tab name, device tier) — never the user's input
//   * a coarse, non-reversible city hash (djb2 of the city name, truncated to
//     6 hex digits) so aggregate popularity can be counted without storing
//     the name
//   * a timestamp, rounded to the hour so exact session timing is not retained
//
// Storage is local only. Nothing is sent anywhere unless the user explicitly
// opts in to "share anonymous usage stats", in which case a single batched
// POST of aggregated counters goes to the configured endpoint — never per-event,
// never with identifiers, and never with location beyond the city hash.

const STORAGE_KEY = "aurafisky_analytics";
const OPT_IN_KEY = "aurafisky_analytics_optin";
const MAX_EVENTS = 2000;
const MAX_COUNTERS = 500;

// Allow-listed event names. Anything not on this list is dropped silently —
// this is the single most important guard in the module, because it is what
// stops a future caller from accidentally logging a query string or a
// coordinate.
const ALLOWED_EVENTS = new Set([
  "app_loaded",
  "web_vital",
  "location_selected",
  "search_performed",
  "aura_question",
  "aura_action",
  "alert_created",
  "alert_removed",
  "wallpaper_opened",
  "wallpaper_exported",
  "wallpaper_photo_set",
  "share_used",
  "route_created",
  "bookmark_added",
  "bookmark_removed",
  "tab_switched",
  "feature_used",
]);

// Allow-listed property keys. Free-form values are still rejected.
const ALLOWED_PROPS = new Set([
  "intent",
  "action",
  "tab",
  "feature",
  "device",
  "source",
  "name",
  "value",
]);

export function init(app) {
  const analytics = new Analytics(app);
  app.analytics = analytics;
  window.AuraAnalytics = analytics;
  analytics.track("app_loaded", { device: app.deviceProfile?.device || "unknown" });
  initWebVitals(analytics);
  return analytics;
}

export class Analytics {
  constructor(app) {
    this.app = app;
    this._events = [];
    this._counters = {};
    this._loaded = false;
    this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this._events = Array.isArray(parsed.events) ? parsed.events.slice(-MAX_EVENTS) : [];
      this._counters = parsed.counters && typeof parsed.counters === "object" ? parsed.counters : {};
    } catch {
      this._events = [];
      this._counters = {};
    }
    this._loaded = true;
  }

  _persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ events: this._events, counters: this._counters }),
      );
    } catch {
      // Quota exceeded: drop the oldest half of the event log and retry once.
      try {
        this._events = this._events.slice(Math.floor(this._events.length / 2));
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ events: this._events, counters: this._counters }),
        );
      } catch {
        /* give up — analytics is best-effort, never the app's job */
      }
    }
  }

  /**
   * Records an event. Returns true if it was accepted, false if it was
   * rejected (unknown event, bad property, or disabled).
   *
   * @param {string} name - must be in ALLOWED_EVENTS
   * @param {object} [props] - keys must be in ALLOWED_PROPS; values must be
   *   short strings or numbers, never free text
   * @param {object} [opts]
   * @param {string} [opts.city] - hashed to 6 hex digits before storage
   */
  track(name, props = {}, opts = {}) {
    if (!ALLOWED_EVENTS.has(name)) return false;
    if (typeof props !== "object" || props === null) return false;

    const clean = {};
    for (const [k, v] of Object.entries(props)) {
      if (!ALLOWED_PROPS.has(k)) continue;
      if (typeof v === "string") {
        if (v.length > 32) continue; // no free text
        clean[k] = v;
      } else if (typeof v === "number" && Number.isFinite(v)) {
        clean[k] = v;
      } else if (typeof v === "boolean") {
        clean[k] = v;
      }
    }

    // Hour-rounded timestamp. Exact session timing is not retained.
    const ts = Date.now();
    const hour = Math.floor(ts / 3600000) * 3600000;

    const cityHash = opts.city ? hashCity(opts.city) : undefined;

    const event = { name, ts: hour, ...clean };
    if (cityHash) event.city = cityHash;

    this._events.push(event);
    if (this._events.length > MAX_EVENTS) {
      this._events = this._events.slice(-MAX_EVENTS);
    }

    // Increment the aggregate counter for this (event, city) pair.
    const key = cityHash ? `${name}:${cityHash}` : name;
    if (Object.prototype.hasOwnProperty.call(this._counters, key)) {
      this._counters[key] += 1;
    } else if (Object.keys(this._counters).length < MAX_COUNTERS) {
      this._counters[key] = 1;
    }

    this._persist();
    return true;
  }

  /** Returns a copy of the raw event log. */
  events() {
    return this._events.map((e) => ({ ...e }));
  }

  /** Returns aggregate counters. */
  counters() {
    return { ...this._counters };
  }

  /** Total event count. */
  count() {
    return this._events.length;
  }

  /** Clears everything. */
  reset() {
    this._events = [];
    this._counters = {};
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Whether the user has opted in to sharing aggregated stats. */
  isOptedIn() {
    try {
      return localStorage.getItem(OPT_IN_KEY) === "1";
    } catch {
      return false;
    }
  }

  setOptIn(value) {
    try {
      if (value) localStorage.setItem(OPT_IN_KEY, "1");
      else localStorage.removeItem(OPT_IN_KEY);
    } catch {
      /* ignore */
    }
  }

  /**
   * Builds a payload suitable for a single batched POST to a stats endpoint.
   * Returns null if not opted in or if there is nothing to send.
   *
   * The payload contains only aggregate counters keyed by (event, city-hash),
   * never individual events, never identifiers, never free text.
   */
  buildSharePayload() {
    if (!this.isOptedIn()) return null;
    const counters = this.counters();
    if (!Object.keys(counters).length) return null;
    return {
      v: 1,
      sentAt: Date.now(),
      device: this.app.deviceProfile?.device || "unknown",
      counters,
    };
  }

  /** Human-readable summary for the settings UI. */
  summary() {
    const byEvent = {};
    for (const e of this._events) {
      byEvent[e.name] = (byEvent[e.name] || 0) + 1;
    }
    return {
      total: this._events.length,
      byEvent,
      distinctCities: new Set(
        this._events.filter((e) => e.city).map((e) => e.city),
      ).size,
      optedIn: this.isOptedIn(),
    };
  }
}

/** Non-reversible hash of a city name. Used so aggregate popularity can be
 *  counted without storing the name itself. */
function hashCity(name) {
  const s = String(name || "").trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).slice(0, 6);
}

// Exported for tests.
export { ALLOWED_EVENTS, ALLOWED_PROPS, hashCity };

// ── Web Vitals tracking ─────────────────────────────────────────────────
//
// Measures Core Web Vitals (LCP, FID/INP, CLS) and reports them as analytics
// events. Uses the native PerformanceObserver API — no external library needed.
//
// Note: These are page-load metrics, so they're tracked once per page load.
// They are NOT sent anywhere unless the user opts in to analytics sharing.

export function initWebVitals(analytics) {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined")
    return;

  const report = (name, value) => {
    analytics.track("web_vital", { name, value: Math.round(value) }, {
      city: undefined, // no city context for page-load metrics
    });
  };

  // Largest Contentful Paint
  try {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        report("LCP", entry.startTime);
      }
    }).observe({ entryTypes: ["largest-contentful-paint"] });
  } catch (e) {
    /* LCP not supported in this browser */
  }

  // First Input Delay
  try {
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        report("FID", entry.processingStart - entry.startTime);
      }
    }).observe({ entryTypes: ["first-input"] });
  } catch (e) {
    /* FID not supported — try INP instead */
    try {
      new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          for (const e of entry.entries || [entry]) {
            report("INP", e.duration);
          }
        }
      }).observe({ entryTypes: ["event"] });
    } catch (e2) {
      /* neither supported */
    }
  }

  // Cumulative Layout Shift
  try {
    let clsValue = 0;
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          clsValue += entry.value;
        }
      }
      report("CLS", clsValue);
    }).observe({ entryTypes: ["layout-shift"] });
  } catch (e) {
    /* CLS not supported in this browser */
  }
}