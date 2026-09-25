/**
 * Signal processing: signal/noise decomposition, momentum, cumulative probability.
 * Uses O(n) sliding-window algorithms.
 */

import type { WeatherAPIResponse, WeatherMomentum } from '../types.js';
import { rollingStats } from './statistics.js';

/**
 * Decompose a temperature series into signal (smoothed) and noise (residual).
 * O(n) implementation using rollingStats instead of naive O(n×window).
 */
export function decomposeSignalNoise(
  data: WeatherAPIResponse,
  window = 3
): { signal: (number | null)[]; noise: (number | null)[] } | null {
  if (!data?.hourly?.temperature_2m) return null;

  const t = data.hourly.temperature_2m;
  const { mean: signal } = rollingStats(t, window * 2 + 1);

  const noise = t.map((v, i) => (v != null && signal[i] != null ? v - signal[i]! : null));

  return { signal, noise };
}

/**
 * Calculate weather momentum: velocity (first derivative) and
 * acceleration (second derivative) of temperature at an index.
 */
export function getWeatherMomentum(
  data: WeatherAPIResponse,
  idx: number
): WeatherMomentum | null {
  if (!data?.hourly?.temperature_2m || idx < 2) return null;

  const h = data.hourly.temperature_2m;
  const prev1 = h[idx - 1];
  const prev2 = h[idx - 2];
  const curr = h[idx];

  if (curr == null || prev1 == null || prev2 == null) return null;

  // Velocity (first difference), Acceleration (second difference)
  const vel = curr - prev1;
  const accel = vel - (prev1 - prev2);

  return { velocity: vel, acceleration: accel };
}

/**
 * Timeline deltas: hour-over-hour rate of change for key parameters.
 */
export function getTimelineDeltas(
  data: WeatherAPIResponse,
  idx: number
): {
  tempDiff: number | null;
  windDiff: number | null;
  pressureDiff: number | null;
  precipProbDiff: number | null;
} | null {
  if (!data?.hourly || idx <= 0) return null;

  const h = data.hourly;

  const diff = (arr: (number | null)[] | undefined): number | null =>
    arr && arr[idx] != null && arr[idx - 1] != null
      ? arr[idx]! - arr[idx - 1]!
      : null;

  return {
    tempDiff: diff(h.temperature_2m),
    windDiff: diff(h.wind_speed_10m),
    pressureDiff: diff(h.pressure_msl),
    precipProbDiff: diff(h.precipitation_probability),
  };
}

/**
 * Cumulative probability curve for precipitation over a time window.
 * Assumes independence between hourly probabilities (standard approximation).
 */
export function getCumulativePrecipProb(
  data: WeatherAPIResponse,
  startIdx: number,
  hours = 12
): Array<{ hour: number; hourlyProb: number; cumProb: number }> | null {
  if (!data?.hourly?.precipitation_probability) return null;

  const pp = data.hourly.precipitation_probability;
  const limit = Math.min(startIdx + hours, pp.length - 1);

  let noRainProb = 1;
  const curve: Array<{ hour: number; hourlyProb: number; cumProb: number }> = [];

  for (let i = startIdx; i <= limit; i++) {
    const hourlyProb = pp[i] ?? 0;
    noRainProb *= 1 - hourlyProb / 100;
    curve.push({
      hour: i,
      hourlyProb,
      cumProb: Math.round((1 - noRainProb) * 100),
    });
  }
  return curve;
}

/**
 * Find the next hour with expected precipitation.
 */
export function findNextRainHour(
  data: WeatherAPIResponse,
  startIdx: number
): number | null {
  if (!data?.hourly?.precipitation) return null;

  const p = data.hourly.precipitation;
  const pp = data.hourly.precipitation_probability;
  const limit = Math.min(startIdx + 48, p.length);

  for (let i = startIdx + 1; i < limit; i++) {
    if ((p[i] ?? 0) > 0.1 || (pp?.[i] ?? 0) > 60) return i;
  }
  return null;
}

/**
 * Find the best contiguous outdoor window in the next 24 hours.
 */
export function findBestOutdoorWindow(
  data: WeatherAPIResponse,
  startIdx: number
): {
  startIdx: number;
  endIdx: number;
  startTime: string;
  endTime: string;
  hours: number;
  avgTemp: number;
} | null {
  if (!data?.hourly) return null;

  const { OUTDOOR } = { OUTDOOR: { TEMP_MIN: 14, TEMP_MAX: 32, PRECIP_MAX: 0.5, PRECIP_PROB_MAX: 40, WIND_MAX: 30, UV_MAX: 9, MIN_HOURS: 2 } };
  const h = data.hourly;
  const endIdx = Math.min(startIdx + 24, h.time.length);

  let bestStart = -1;
  let bestEnd = -1;
  let bestLen = 0;
  let curStart = -1;

  const isGoodHour = (i: number): boolean => {
    const temp = h.temperature_2m[i];
    return (
      temp != null &&
      temp >= OUTDOOR.TEMP_MIN &&
      temp <= OUTDOOR.TEMP_MAX &&
      (h.precipitation[i] ?? 0) < OUTDOOR.PRECIP_MAX &&
      (h.precipitation_probability[i] ?? 0) < OUTDOOR.PRECIP_PROB_MAX &&
      (h.wind_speed_10m[i] ?? 0) < OUTDOOR.WIND_MAX &&
      (h.uv_index[i] ?? 0) < OUTDOOR.UV_MAX
    );
  };

  for (let i = startIdx; i < endIdx; i++) {
    if (isGoodHour(i)) {
      if (curStart === -1) curStart = i;
    } else if (curStart !== -1) {
      const len = i - curStart;
      if (len > bestLen) {
        bestStart = curStart;
        bestEnd = i - 1;
        bestLen = len;
      }
      curStart = -1;
    }
  }

  // Window extending to the end of the range
  if (curStart !== -1) {
    const len = endIdx - curStart;
    if (len > bestLen) {
      bestStart = curStart;
      bestEnd = endIdx - 1;
      bestLen = len;
    }
  }

  if (bestStart === -1 || bestLen < OUTDOOR.MIN_HOURS) return null;

  let tempSum = 0;
  let tempCount = 0;
  for (let i = bestStart; i <= bestEnd; i++) {
    const temp = h.temperature_2m[i];
    if (temp != null) {
      tempSum += temp;
      tempCount++;
    }
  }
  const avgTemp = tempCount > 0 ? tempSum / tempCount : 0;

  return {
    startIdx: bestStart,
    endIdx: bestEnd,
    startTime: h.time[bestStart],
    endTime: h.time[bestEnd],
    hours: bestLen,
    avgTemp,
  };
}