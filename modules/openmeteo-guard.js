/**
 * Shared Open-Meteo rate-limit circuit breaker and Retry-After parser.
 *
 * Prevents cascading HTTP 429 storms when multiple tabs/modules (main forecast,
 * ensemble models, farm soil/agro, bookmarks, myPlaces, overlays) run in the
 * same browser session. Bound onto globalThis.OpenMeteoGuard so UMD/CJS scripts
 * like weather.js share the exact same cooldown state as ES module features.
 */

export const OPEN_METEO_COOLDOWN_KEY = "aurafisky_om_cooldown_v1";

const BASE_COOLDOWN_MS = 60_000;
const MAX_AUTO_COOLDOWN_MS = 300_000;
const MIN_RETRY_AFTER_MS = 30_000;
const MAX_RETRY_AFTER_MS = 15 * 60_000;
const STREAK_DEBOUNCE_MS = 5_000;

let _state = {
  until: 0,
  streak: 0,
  lastRecordedAt: 0,
};

function _getSessionStorage() {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

function _persistState(state) {
  const storage = _getSessionStorage();
  if (!storage) return;
  try {
    if (state.until > Date.now()) {
      storage.setItem(OPEN_METEO_COOLDOWN_KEY, JSON.stringify(state));
    } else {
      storage.removeItem(OPEN_METEO_COOLDOWN_KEY);
    }
  } catch {
    // Storage unavailable or blocked cleanly ignored
  }
}

function _hydrateState() {
  const now = Date.now();
  if (_state.until > now) return _state;

  const storage = _getSessionStorage();
  if (storage) {
    try {
      const raw = storage.getItem(OPEN_METEO_COOLDOWN_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Number.isFinite(parsed.until) && parsed.until > now) {
          _state = {
            until: parsed.until,
            streak: Number.isFinite(parsed.streak) ? parsed.streak : 1,
            lastRecordedAt: Number.isFinite(parsed.lastRecordedAt) ? parsed.lastRecordedAt : 0,
          };
          return _state;
        }
        storage.removeItem(OPEN_METEO_COOLDOWN_KEY);
      }
    } catch {
      // Ignore corrupt storage entries
    }
  }

  _state = { until: 0, streak: 0, lastRecordedAt: 0 };
  return _state;
}

/**
 * Parses an HTTP Retry-After header value (delta seconds or HTTP date) into ms.
 * Returns null when the header is missing, CORS-hidden, or unparseable.
 */
export function parseRetryAfterMs(response) {
  const header = response?.headers?.get?.("Retry-After");
  if (!header) return null;
  const trimmed = String(header).trim();
  if (!trimmed) return null;

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null;
  }

  const parsedDate = Date.parse(trimmed);
  if (Number.isFinite(parsedDate)) {
    const delta = parsedDate - Date.now();
    return delta > 0 ? delta : null;
  }

  return null;
}

/** Returns remaining cooldown duration in milliseconds (0 when healthy). */
export function getOpenMeteoCooldownMs() {
  const state = _hydrateState();
  return Math.max(0, state.until - Date.now());
}

/** Returns true when Open-Meteo requests must pause due to a recent HTTP 429. */
export function isOpenMeteoCoolingDown() {
  return getOpenMeteoCooldownMs() > 0;
}

/**
 * Records an HTTP 429 response (or explicit ms duration) and activates cooldown
 * across all Open-Meteo consumers for this session.
 */
export function recordOpenMeteoRateLimit(responseOrMs = null) {
  const now = Date.now();
  const prev = _hydrateState();
  const withinSameBurst = now - prev.lastRecordedAt < STREAK_DEBOUNCE_MS;
  const streak = withinSameBurst ? Math.max(1, prev.streak) : prev.streak + 1;

  let explicitMs = null;
  if (typeof responseOrMs === "number" && Number.isFinite(responseOrMs) && responseOrMs > 0) {
    explicitMs = responseOrMs;
  } else if (responseOrMs && typeof responseOrMs === "object") {
    explicitMs = parseRetryAfterMs(responseOrMs);
  }

  const cooldownMs = explicitMs
    ? Math.min(Math.max(explicitMs, MIN_RETRY_AFTER_MS), MAX_RETRY_AFTER_MS)
    : Math.min(BASE_COOLDOWN_MS * Math.pow(2, Math.min(streak - 1, 2)), MAX_AUTO_COOLDOWN_MS);

  const until = Math.max(prev.until, now + cooldownMs);
  _state = { until, streak, lastRecordedAt: now };
  _persistState(_state);
  return { until, cooldownMs, streak };
}

/** Clears active 429 cooldown once Open-Meteo serves a healthy 2xx response. */
export function clearOpenMeteoRateLimit() {
  _state = { until: 0, streak: 0, lastRecordedAt: 0 };
  const storage = _getSessionStorage();
  if (storage) {
    try {
      storage.removeItem(OPEN_METEO_COOLDOWN_KEY);
    } catch {
      // Ignore storage error
    }
  }
}

/** Builds an HTTP 429 rate-limit Error with consistent status metadata. */
export function createRateLimitError(
  message = "Rate limit exceeded (429): Please wait before requesting again.",
  status = 429,
  retryAfterMs = null,
) {
  const err = new Error(message);
  err.status = status;
  err.isRateLimited = true;
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    err.retryAfterMs = retryAfterMs;
  }
  return err;
}

/** Resets guard state (for test suites). */
export function resetOpenMeteoGuard() {
  clearOpenMeteoRateLimit();
}

/**
 * Wrapper around fetch() for api.open-meteo.com endpoints that blocks requests
 * during an active 429 cooldown, records HTTP 429 responses, and clears cooldown
 * once a 2xx response succeeds.
 */
export async function guardedOpenMeteoFetch(url, fetchOptions = {}, guardOptions = {}) {
  if (!guardOptions.bypassCooldown && isOpenMeteoCoolingDown()) {
    throw createRateLimitError(
      "Open-Meteo rate limit active (429); paused briefly before retrying.",
      429,
      getOpenMeteoCooldownMs(),
    );
  }
  const response = await fetch(url, fetchOptions);
  if (response?.status === 429) {
    recordOpenMeteoRateLimit(response);
  } else if (response?.ok) {
    clearOpenMeteoRateLimit();
  }
  return response;
}

const guardApi = {
  OPEN_METEO_COOLDOWN_KEY,
  parseRetryAfterMs,
  getOpenMeteoCooldownMs,
  isOpenMeteoCoolingDown,
  recordOpenMeteoRateLimit,
  clearOpenMeteoRateLimit,
  createRateLimitError,
  resetOpenMeteoGuard,
  guardedOpenMeteoFetch,
};

if (typeof globalThis !== "undefined") {
  globalThis.OpenMeteoGuard = guardApi;
}
