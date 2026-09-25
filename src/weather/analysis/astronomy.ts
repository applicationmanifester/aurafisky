/**
 * Moon phase calculation.
 */

import type { MoonPhase } from '../types.js';

/**
 * Calculate moon phase from a date using a simplified astronomical algorithm.
 * Returns phase (0-1), descriptive label, and emoji icon.
 */
export function getMoonPhase(date: Date = new Date()): MoonPhase {
  // Reference new moon: Jan 6, 2000 18:14 UTC (Julian Date 2451550.1)
  const REF_NEW_MOON = new Date('2000-01-06T18:14:00Z').getTime();
  const LUNAR_CYCLE_MS = 29.53058867 * 24 * 60 * 60 * 1000;

  const elapsed = date.getTime() - REF_NEW_MOON;
  let phase = ((elapsed % LUNAR_CYCLE_MS) / LUNAR_CYCLE_MS + 1) % 1;

  let label: string;
  let icon: string;

  if (phase < 0.0625)      { label = 'New Moon';        icon = '🌑'; }
  else if (phase < 0.1875) { label = 'Waxing Crescent'; icon = '🌒'; }
  else if (phase < 0.3125) { label = 'First Quarter';   icon = '🌓'; }
  else if (phase < 0.4375) { label = 'Waxing Gibbous';  icon = '🌔'; }
  else if (phase < 0.5625) { label = 'Full Moon';       icon = '🌕'; }
  else if (phase < 0.6875) { label = 'Waning Gibbous';  icon = '🌖'; }
  else if (phase < 0.8125) { label = 'Last Quarter';    icon = '🌗'; }
  else if (phase < 0.9375) { label = 'Waning Crescent'; icon = '🌘'; }
  else                     { label = 'New Moon';        icon = '🌑'; }

  return { phase, label, icon };
}

/**
 * Calculate upwind point given a location, wind direction, and speed.
 * Wind direction is where wind is COMING FROM (meteorological convention).
 * @param lat - Observer latitude (degrees)
 * @param lng - Observer longitude (degrees)
 * @param windDirDeg - Wind direction in degrees (from which wind blows)
 * @param windSpeedKmh - Wind speed in km/h (used for scaling look-back distance)
 * @param lookBackHours - How many hours back to trace (default 6h)
 */
export function getUpwindPoint(
  lat: number,
  lng: number,
  windDirDeg: number | null,
  windSpeedKmh: number | null,
  lookBackHours = 6
): { lat: number; lng: number } | null {
  if (windDirDeg == null) return null;

  const speed = windSpeedKmh ?? 20; // Use actual speed, fall back to 20 km/h
  const distanceKm = speed * lookBackHours;
  const KM_PER_DEGREE = 111.32;

  // Wind comes FROM windDirDeg — upwind point is OPPOSITE direction
  const upwindBearing = (windDirDeg + 180) % 360;
  const radBearing = (upwindBearing * Math.PI) / 180;

  const deltaLat = (distanceKm * Math.cos(radBearing)) / KM_PER_DEGREE;
  const deltaLng = (distanceKm * Math.sin(radBearing)) / (KM_PER_DEGREE * Math.cos((lat * Math.PI) / 180));

  return { lat: lat + deltaLat, lng: lng + deltaLng };
}
