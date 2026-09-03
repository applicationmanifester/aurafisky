// src/utils/logger.js
export function log(...args) {
  console.log('[Map]', ...args);
}

export function warn(...args) {
  console.warn('[Map]', ...args);
}

export function error(...args) {
  console.error('[Map]', ...args);
}
