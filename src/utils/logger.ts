// src/utils/logger.ts
const isDev = import.meta.env.DEV;

export function log(...args: any[]) {
  if (isDev) console.log('[Aurafisky]', new Date().toISOString(), ...args);
}

export function error(...args: any[]) {
  console.error('[Aurafisky Error]', new Date().toISOString(), ...args);
}

export function warn(...args: any[]) {
  if (isDev) console.warn('[Aurafisky Warn]', new Date().toISOString(), ...args);
}