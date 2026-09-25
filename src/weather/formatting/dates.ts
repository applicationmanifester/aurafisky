/**
 * Date/time formatting utilities.
 * Handles timezone-aware parsing and display.
 */

import type { UnitSystem } from '../types.js';
import { getUnits } from '../constants.js';
import { cToF, kmhToMph, mmToIn, hpaToInhg } from './units.js';

/**
 * Parse ISO date/time string safely into a Date object.
 * Preserves local time interpretation (no UTC shift).
 */
export function parseIsoLocal(str: string | null | undefined): Date {
  if (!str) return new Date();
  const parts = String(str).split('T');
  const dateParts = parts[0].split('-').map((n) => parseInt(n, 10));
  if (dateParts.length < 3 || dateParts.some(isNaN)) return new Date(str);
  const timeParts = parts[1] ? parts[1].split(':').map((n) => parseInt(n, 10)) : [0, 0, 0];
  return new Date(dateParts[0], dateParts[1] - 1, dateParts[2], timeParts[0] || 0, timeParts[1] || 0);
}

/**
 * Format a date string into a short weekday label.
 */
export function formatDayLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = parseIsoLocal(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((targetDay.getTime() - today.getTime()) / 86_400_000);

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short' });
}

/**
 * Format an ISO time string to a readable hour label (12-hour format).
 */
export function formatHourLabel(timeStr: string | null | undefined, _utcOffsetSeconds = 0): string {
  if (!timeStr) return '';
  const tIndex = timeStr.indexOf('T');
  if (tIndex !== -1) {
    const hourStr = timeStr.substring(tIndex + 1, tIndex + 3);
    const hours = parseInt(hourStr, 10);
    if (!isNaN(hours)) {
      if (hours === 0) return '12 AM';
      if (hours === 12) return '12 PM';
      return hours > 12 ? `${hours - 12} PM` : `${hours} AM`;
    }
  }
  // Fallback
  const date = new Date(timeStr);
  const hours = date.getHours();
  if (hours === 0) return '12 AM';
  if (hours === 12) return '12 PM';
  return hours > 12 ? `${hours - 12} PM` : `${hours} AM`;
}

/**
 * Format a full datetime string for display.
 */
export function formatDateTime(
  timeStr: string | null | undefined,
  _timezone?: string,
  _utcOffsetSeconds = 0
): string {
  if (!timeStr) return '';
  const parts = timeStr.split('T');
  if (parts.length < 2) return timeStr;
  const dateParts = parts[0].split('-');
  const timeParts = parts[1].split(':');

  const localDate = new Date(
    parseInt(dateParts[0], 10),
    parseInt(dateParts[1], 10) - 1,
    parseInt(dateParts[2], 10),
    parseInt(timeParts[0], 10),
    parseInt(timeParts[1], 10)
  );

  return (
    localDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }) +
    ' · ' +
    localDate.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    })
  );
}

/**
 * Format an ISO time string to time-only string (timezone-independent).
 */
export function formatTimeOnly(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const parts = timeStr.split('T');
  if (parts.length < 2) return timeStr;
  const timeParts = parts[1].split(':');
  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const displayMinutes = String(minutes).padStart(2, '0');
  return `${displayHours}:${displayMinutes} ${ampm}`;
}

/**
 * Get formatted current local time at a location.
 */
export function getFormattedLocationCurrentTime(
  timezone?: string,
  utcOffsetSeconds = 0
): string {
  const now = new Date();
  if (timezone) {
    try {
      return now.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      // Fallback to offset calculation
    }
  }
  const locMs =
    now.getTime() + utcOffsetSeconds * 1000 + now.getTimezoneOffset() * 60 * 1000;
  const locDate = new Date(locMs);
  return locDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format temperature with unit awareness.
 */
export function formatTemp(temp: number | null | undefined): string {
  if (temp == null) return '--°';
  const units = getUnits();
  if (units === 'imperial') {
    return `${Math.round(cToF(temp))}°F`;
  }
  return `${Math.round(temp)}°C`;
}

/**
 * Format wind speed with unit awareness.
 */
export function formatWind(speed: number | null | undefined): string {
  if (speed == null) {
    return `-- ${getUnits() === 'imperial' ? 'mph' : 'km/h'}`;
  }
  if (getUnits() === 'imperial') {
    return `${Math.round(kmhToMph(speed))} mph`;
  }
  return `${Math.round(speed)} km/h`;
}

/**
 * Format precipitation with unit awareness.
 */
export function formatPrecip(precip: number | null | undefined): string {
  if (precip == null) {
    return `--${getUnits() === 'imperial' ? ' in' : ' mm'}`;
  }
  if (getUnits() === 'imperial') {
    return `${mmToIn(precip).toFixed(2)} in`;
  }
  return `${precip.toFixed(1)} mm`;
}

/**
 * Format visibility with unit awareness.
 */
export function formatVisibility(vis: number | null | undefined): string {
  if (vis == null) return '--';
  if (getUnits() === 'imperial') {
    const miles = vis * 0.000621371;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  const km = vis / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/**
 * Format pressure with unit awareness.
 */
export function formatPressure(pressure: number | null | undefined): string {
  if (pressure == null) {
    return `--${getUnits() === 'imperial' ? ' inHg' : ' hPa'}`;
  }
  if (getUnits() === 'imperial') {
    return `${hpaToInhg(pressure).toFixed(2)} inHg`;
  }
  return `${Math.round(pressure)} hPa`;
}

// Re-export unit conversions for convenience
export {
  cToF,
  fToC,
  kmhToMph,
  mphToKmh,
  mmToIn,
  inToMm,
  hpaToInhg,
  inhgToHpa,
  calculateDewPoint,
  getWindDirection,
} from './units.js';