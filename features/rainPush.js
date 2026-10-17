// features/rainPush.js
// ── PROACTIVE RAIN PUSH ─────────────────────────────────────────────
//
// "Rain starting around 5 PM" — a heads-up notification BEFORE the rain,
// not just a threshold alert AFTER a rule trips.
//
// Complements features/alerts.js:
//   * alerts.js evaluates the CURRENT hour against user rules (pull-based).
//   * rainPush looks AHEAD in the same already-loaded forecast — zero extra
//     API calls — and notifies once when rain is imminent for the location
//     on screen.
//
// Constraints (same philosophy as alerts.js):
//   * Pull-based: evaluation runs when a fresh forecast lands (wrapped
//     updateWeatherDisplay), never on a timer.
//   * Opt-in: notifications fire only when the user has already granted
//     Notification permission (the alerts panel is the grant path), plus an
//     explicit one-tap enable offered inside Aura's rain answers.
//   * Rate-limited: at most one rain push per location per cooldown, so a
//     multi-day soaker can't spam the user.
//   * Pure helpers are exported for unit testing without a DOM.

export const RAIN_ENABLED_KEY = "aurafisky_rain_push_enabled";
export const RAIN_LAST_KEY = "aurafisky_rain_push_last";
export const RAIN_COOLDOWN_MS = 6 * 60 * 60 * 1000; // one push per place per 6h
export const RAIN_LOOKAHEAD_H = 6; // notify when rain starts within 6h
export const RAIN_PROB_THRESHOLD = 60; // % chance that counts as "arriving"
export const RAIN_MIN_MM = 0.2; // mm/h that counts as actual rain

// ────────────────── pure helpers ──────────────────

/**
 * Finds the first "rain arrival" hour in the forecast window.
 *
 * @param {Object|null} hourly - Open-Meteo hourly block ({time, precipitation, precipitation_probability})
 * @param {number} startIdx - index of the hour to scan from
 * @param {{windowH?:number, probThreshold?:number, minMm?:number}} [opts]
 * @returns {{index:number, time:string, hoursAway:number, prob:number, mm:number, rainingNow:boolean}|null}
 *   null when nothing wet is expected inside the window.
 */
export function findRainArrival(hourly, startIdx, opts = {}) {
  const windowH = opts.windowH ?? RAIN_LOOKAHEAD_H;
  const probThreshold = opts.probThreshold ?? RAIN_PROB_THRESHOLD;
  const minMm = opts.minMm ?? RAIN_MIN_MM;
  if (!hourly?.time?.length || !Array.isArray(hourly.precipitation)) return null;
  if (!Number.isFinite(startIdx) || startIdx < 0) return null;

  const prob = hourly.precipitation_probability || [];
  const mm = hourly.precipitation || [];
  const limit = Math.min(startIdx + windowH, hourly.time.length);

  for (let i = startIdx; i < limit; i++) {
    const wetMm = typeof mm[i] === "number" ? mm[i] : 0;
    const wetProb = typeof prob[i] === "number" ? prob[i] : 0;
    if (wetMm > minMm || wetProb >= probThreshold) {
      return {
        index: i,
        time: hourly.time[i],
        hoursAway: i - startIdx,
        prob: Math.round(wetProb),
        mm: wetMm,
        rainingNow: i === startIdx,
      };
    }
  }
  return null;
}

/**
 * Gate for actually firing a notification: arrival exists, inside the
 * notify window, and the per-location cooldown has elapsed.
 */
export function shouldNotifyRain(arrival, lastNotifiedAt, now, cooldownMs = RAIN_COOLDOWN_MS) {
  if (!arrival) return false;
  if (typeof lastNotifiedAt === "number" && now - lastNotifiedAt < cooldownMs) return false;
  return true;
}

/**
 * Human notification body. Plain string math — no WeatherService needed,
 * so tests stay dependency-free. mm values are shown with sensible precision.
 */
export function rainPushMessage(arrival, placeName) {
  if (!arrival) return "";
  const where = placeName ? `${placeName}: ` : "";
  if (arrival.rainingNow) {
    return `${where}it's raining now (${arrival.prob}% chance). Grab a jacket or umbrella.`;
  }
  const when = arrival.hoursAway === 1 ? "within the hour" : `in ~${arrival.hoursAway}h`;
  const mm =
    arrival.mm >= 1 ? `${arrival.mm.toFixed(1)} mm expected` : `${arrival.prob}% chance`;
  return `${where}${when} — around ${arrival.prob}% chance${arrival.mm >= 1 ? `, ${mm}` : ""}. Take an umbrella.`;
}

// ────────────────── module state ──────────────────

let appRef = null;

function readEnabled() {
  try {
    const raw = localStorage.getItem(RAIN_ENABLED_KEY);
    return raw === null ? true : raw === "true"; // default ON once permission exists
  } catch {
    return true;
  }
}

function writeEnabled(v) {
  try {
    localStorage.setItem(RAIN_ENABLED_KEY, v ? "true" : "false");
  } catch {
    /* storage unavailable */
  }
}

function loadLastMap() {
  try {
    const raw = localStorage.getItem(RAIN_LAST_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveLastMap(map) {
  try {
    localStorage.setItem(RAIN_LAST_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable */
  }
}

/** Short location key for cooldown bookkeeping ("Mumbai, India" → "mumbai|india"). */
function locKey(name) {
  return String(name || "location")
    .toLowerCase()
    .split(/,\s*/)
    .slice(0, 2)
    .join("|");
}

// ────────────────── runtime ──────────────────

/** Fire the notification + toast for an arrival. Returns true when sent. */
function sendRainPush(arrival) {
  const app = appRef;
  if (!app) return false;
  const place = String(app.selectedName || "").split(/,\s*/)[0] || "";
  const body = rainPushMessage(arrival, place);

  try {
    app.showToast?.(`🌧️ ${body}`, "info", 7000);
  } catch {
    /* toast optional */
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      const title = arrival.rainingNow ? "Raining now" : "Rain is on the way";
      new Notification(`🌧️ Aurafisky — ${title}`, {
        body,
        tag: `aurafisky-rain-${locKey(app.selectedName)}-${arrival.index}`,
        icon: "/icon-192.png",
      });
    }
  } catch {
    /* notification failed — toast already shown */
  }
  return true;
}

/**
 * Evaluate the loaded forecast for imminent rain and push if warranted.
 * Safe to call on every render — all gates are internal.
 * @returns {boolean} true when a push fired.
 */
function checkRainPush() {
  const app = appRef || this;
  if (!app) return false;
  if (!readEnabled()) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;

  const wd = app.weatherData;
  if (!wd?.hourly?.time?.length) return false;
  const S = globalThis.WeatherService;
  const idx =
    typeof app.currentHourIndex === "number"
      ? app.currentHourIndex
      : S?.getCurrentHourIndex
        ? S.getCurrentHourIndex(wd, wd.utc_offset_seconds || 0)
        : 0;

  const arrival = findRainArrival(wd.hourly, idx);
  if (!arrival) return false;

  const key = locKey(app.selectedName);
  const lastMap = loadLastMap();
  if (!shouldNotifyRain(arrival, lastMap[key], Date.now())) return false;

  const sent = sendRainPush(arrival);
  if (sent) {
    lastMap[key] = Date.now();
    // Prune stale cooldown entries so storage stays small.
    const cutoff = Date.now() - RAIN_COOLDOWN_MS * 4;
    for (const k of Object.keys(lastMap)) {
      if (typeof lastMap[k] === "number" && lastMap[k] < cutoff) delete lastMap[k];
    }
    saveLastMap(lastMap);
  }
  return sent;
}

/**
 * User-gesture enable path: request permission, flip the toggle on, and run
 * an immediate check so an already-imminent rain notifies right away.
 * @returns {Promise<boolean>} true when enabled + permission granted.
 */
async function enableRainPush() {
  const app = appRef;
  if (!app) return false;
  if (typeof Notification === "undefined") {
    app.showToast?.("Notifications are not supported here.", "error");
    return false;
  }
  let granted = Notification.permission === "granted";
  if (!granted && Notification.permission !== "denied") {
    try {
      granted = (await Notification.requestPermission()) === "granted";
    } catch {
      granted = false;
    }
  }
  if (!granted) {
    app.showToast?.("Notification permission is needed for rain heads-ups.", "error");
    return false;
  }
  writeEnabled(true);
  app.showToast?.("☔ Rain heads-ups enabled — I'll warn you before it pours.", "success");
  checkRainPush.call(app);
  return true;
}

function disableRainPush() {
  writeEnabled(false);
  appRef?.showToast?.("Rain heads-ups turned off.", "info");
}

function toggleRainPush(force) {
  const next = typeof force === "boolean" ? force : !readEnabled();
  if (next) return enableRainPush();
  disableRainPush();
  return Promise.resolve(false);
}

export function init(app) {
  appRef = app;

  app.rainPushEnabled = () => readEnabled();
  app.checkRainPush = checkRainPush;
  app.enableRainPush = enableRainPush;
  app.toggleRainPush = toggleRainPush;

  // Re-evaluate whenever a fresh forecast lands — same additive wrap the
  // alerts feature uses, so both coexist on updateWeatherDisplay.
  const originalUpdate =
    typeof app.updateWeatherDisplay === "function" ? app.updateWeatherDisplay : null;
  if (originalUpdate && !originalUpdate.__rainPushWrapped) {
    const wrapped = function (...args) {
      const result = originalUpdate.apply(this, args);
      try {
        checkRainPush.call(this);
      } catch (e) {
        console.warn("Rain push check failed:", e);
      }
      return result;
    };
    wrapped.__rainPushWrapped = true;
    app.updateWeatherDisplay = wrapped;
  }

  try {
    checkRainPush.call(app);
  } catch {
    /* ignore — data may not be ready at construction */
  }
}
