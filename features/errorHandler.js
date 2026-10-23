// features/errorHandler.js
// ── GLOBAL ERROR HANDLER & TELEMETRY BUFFER ──────────────────────────
//
// Catches unhandled errors and promise rejections that would otherwise
// silently break the UI. Stores the last N errors in a ring buffer
// (localStorage) so they can be inspected in the settings/debug panel
// or included in bug reports.
//
// Constraints:
//   * Zero network — everything stays local, no crash-reporting service.
//   * Graceful — never throws itself, never blocks the main thread.
//   * Size-capped — ring buffer holds at most MAX_ERRORS entries.
//   * Privacy — stack traces may include file paths; never logs user data,
//     coordinates, or search queries.

const STORAGE_KEY = "aurafisky_error_log";
const MAX_ERRORS = 50;

/**
 * A single error entry in the ring buffer.
 * @typedef {{ts: string, type: string, message: string, stack?: string, source?: string}} ErrorEntry
 */

/**
 * Read the current error log from localStorage.
 * @returns {ErrorEntry[]}
 */
export function getErrorLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Append an error entry to the ring buffer.
 * @param {ErrorEntry} entry
 */
export function logError(entry) {
  try {
    const log = getErrorLog();
    log.push(entry);
    // Keep only the last MAX_ERRORS entries
    while (log.length > MAX_ERRORS) log.shift();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch (_) {
    // localStorage unavailable or full — silently give up
  }
}

/** Clear the error log. */
export function clearErrorLog() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    // ignore
  }
}

/**
 * Build an ErrorEntry from various error shapes.
 * @param {string} type - "error" | "unhandledrejection" | "caught"
 * @param {unknown} error
 * @param {string} [source]
 * @returns {ErrorEntry}
 */
export function buildEntry(type, error, source) {
  const ts = new Date().toISOString();
  let message = "Unknown error";
  let stack;

  if (error instanceof Error) {
    message = error.message || String(error);
    stack = error.stack;
  } else if (typeof error === "string") {
    message = error;
  } else if (error && typeof error === "object") {
    message = error.message || error.reason?.message || JSON.stringify(error).slice(0, 300);
    stack = error.stack || error.reason?.stack;
  }

  return { ts, type, message, ...(stack ? { stack: String(stack).slice(0, 1000) } : {}), ...(source ? { source } : {}) };
}

/**
 * Install global listeners for uncaught errors and unhandled rejections.
 * Call once at app startup.
 *
 * @param {object} [app] - optional app reference (unused for now, reserved for future toast integration)
 */
export function init(app) {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    const entry = buildEntry("error", event.error || event.message, event.filename);
    logError(entry);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const entry = buildEntry("unhandledrejection", event.reason);
    logError(entry);
  });

  // Expose a helper on the app instance so feature modules can log caught errors
  // instead of swallowing them silently:
  //   catch (e) { app.logCaughtError(e, "myFeature"); }
  if (app) {
    app.logCaughtError = (error, source) => {
      logError(buildEntry("caught", error, source));
    };
  }
}
