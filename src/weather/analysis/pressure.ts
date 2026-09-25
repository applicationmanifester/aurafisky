/**
 * Pressure tendency and wind shift analysis.
 */

import type { WeatherAPIResponse, HourlyWeather, PressureTendency, WindShift } from '../types.js';
import { THRESHOLDS } from '../constants.js';

/**
 * Compute pressure tendency from a WeatherAPIResponse or sequence of hourly pressure readings.
 * Returns trend direction ('rising' | 'falling' | 'steady'), rate (hPa/hr), and descriptive label.
 */
export function getPressureTendency(
  dataOrPressures: WeatherAPIResponse | (number | null)[],
  idxOrWindow = 3
): PressureTendency | null {
  let pressures: (number | null)[] | undefined;
  let idx: number;

  if (Array.isArray(dataOrPressures)) {
    pressures = dataOrPressures;
    idx = (idxOrWindow >= 0 && idxOrWindow < pressures.length)
      ? idxOrWindow
      : pressures.length - 1;
  } else if (dataOrPressures?.hourly?.pressure_msl) {
    pressures = dataOrPressures.hourly.pressure_msl;
    idx = typeof idxOrWindow === 'number' ? idxOrWindow : pressures.length - 1;
  } else {
    return null;
  }

  if (!pressures || pressures.length < 2 || idx < 1) return null;

  // Compare with reading from up to 3 hours ago (or earliest available)
  const lookback = Math.min(3, idx);
  const pCurrent = pressures[idx];
  const pPrev = pressures[idx - lookback];

  if (pCurrent == null || pPrev == null) return null;

  const rate = (pCurrent - pPrev) / lookback;

  const { PRESSURE_RISING = 0.5, PRESSURE_FALLING = -0.5 } = (THRESHOLDS as any) || {};

  let direction: 'rising' | 'falling' | 'steady';
  if (rate >= PRESSURE_RISING) {
    direction = 'rising';
  } else if (rate <= PRESSURE_FALLING) {
    direction = 'falling';
  } else {
    direction = 'steady';
  }

  const label = direction === 'rising' ? 'Rising' : direction === 'falling' ? 'Falling' : 'Steady';
  const icon = direction === 'rising' ? '⬆️' : direction === 'falling' ? '⬇️' : '➡️';
  const desc = direction === 'rising'
    ? `Pressure is rising at ${rate.toFixed(1)} hPa/hr — improving conditions likely.`
    : direction === 'falling'
      ? `Pressure is falling at ${Math.abs(rate).toFixed(1)} hPa/hr — deteriorating conditions possible.`
      : 'Pressure is steady — conditions are stable.';

  return { direction, rate, label, icon, desc };
}

/**
 * Detect a significant wind direction shift.
 * Supports:
 *   getWindShift(data: WeatherAPIResponse, idx: number)
 *   getWindShift(prevDirection: number, currDirection: number)
 */
export function getWindShift(
  dataOrPrev: WeatherAPIResponse | number | null,
  idxOrCurr?: number | null
): WindShift | null {
  let prevDirection: number | null = null;
  let currDirection: number | null = null;

  if (typeof dataOrPrev === 'number') {
    prevDirection = dataOrPrev;
    currDirection = typeof idxOrCurr === 'number' ? idxOrCurr : null;
  } else if (dataOrPrev && typeof dataOrPrev === 'object' && (dataOrPrev as WeatherAPIResponse).hourly?.wind_direction_10m) {
    const dirs = (dataOrPrev as WeatherAPIResponse).hourly.wind_direction_10m;
    const idx = typeof idxOrCurr === 'number' ? idxOrCurr : dirs.length - 1;
    if (idx < 1 || idx >= dirs.length) return null;
    currDirection = dirs[idx];
    // Check previous hour or earliest within 3-hour window
    prevDirection = dirs[idx - 1] ?? dirs[0];
  }

  if (prevDirection == null || currDirection == null) return null;

  // Angular difference normalized to -180..180
  let diff = (currDirection - prevDirection + 540) % 360 - 180;
  const absShift = Math.abs(diff);

  const threshold = THRESHOLDS.WIND_SHIFT_SIGNIFICANT ?? 45;
  if (absShift <= threshold) return null;

  const direction = diff > 0 ? 'clockwise' : 'counterclockwise';
  return {
    shift: absShift,
    direction,
    label: `${Math.round(absShift)}° ${direction} shift`,
    desc: `A significant ${direction} wind shift of ${Math.round(absShift)}° was detected — may indicate a frontal passage.`,
  };
}
