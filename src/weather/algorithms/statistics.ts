/**
 * Statistical algorithms with O(n) sliding window implementations.
 * Replaces O(n×window) naive implementations.
 */

import type { ConfidenceBands, TrustScore } from '../types.js';
import type { WeatherAPIResponse } from '../types.js';
import { THRESHOLDS } from '../constants.js';

/**
 * Rolling mean and standard deviation using Welford's online algorithm.
 * O(n) time, O(window) space.
 */
export function rollingStats(
  values: (number | null)[],
  window: number
): { mean: (number | null)[]; stdDev: (number | null)[] } {
  const n = values.length;
  const mean = new Array<number | null>(n);
  const stdDev = new Array<number | null>(n);

  // Circular buffer for window values
  const buf = new Array<number>(window);
  let count = 0;
  let m = 0; // Running mean
  let s = 0; // Running sum of squares of differences

  for (let i = 0; i < n; i++) {
    const val = values[i];
    if (val == null) {
      mean[i] = null;
      stdDev[i] = null;
      continue;
    }

    // Add new value
    const idx = i % window;
    const oldVal = count === window ? buf[idx] : null;

    if (oldVal != null) {
      // Remove old value from running stats (Welford's removal)
      count = window; // Keep at window size
      const delta = oldVal - m;
      m -= delta / count;
      s -= delta * (oldVal - m);
    } else {
      count = Math.min(count + 1, window);
    }

    // Add new value
    buf[idx] = val;
    const deltaNew = val - m;
    m += deltaNew / count;
    s += deltaNew * (val - m);

    mean[i] = m;
    stdDev[i] = count > 1 ? Math.sqrt(s / count) : 0;
  }

  return { mean, stdDev };
}

/**
 * Get confidence bands (rolling standard deviation) for temperature.
 * O(n) implementation using rollingStats.
 */
export function getConfidenceBands(
  data: WeatherAPIResponse,
  window = 5
): (number | null)[] {
  if (!data?.hourly?.temperature_2m) {
    return [];
  }

  const { stdDev } = rollingStats(data.hourly.temperature_2m, window * 2 + 1);
  const result = [...stdDev] as (number | null)[] & { bands?: (number | null)[]; window?: number };
  result.bands = stdDev;
  result.window = window;
  return result;
}

/**
 * Calculate percentile rank of a value within a distribution.
 */
export function getPercentileRank(value: number | null, distribution: number[]): number | null {
  if (value == null || !distribution || distribution.length === 0) return null;

  const sorted = [...distribution].sort((a, b) => a - b);
  let count = 0;
  for (const v of sorted) {
    if (v <= value) count++;
  }
  return Math.round((count / sorted.length) * 100);
}

/**
 * Compute forecast trust score based on lead time and data completeness.
 */
export function computeTrustScore(
  data: WeatherAPIResponse,
  currentIndex: number
): TrustScore | null {
  if (!data?.hourly?.temperature_2m) return null;

  const h = data.hourly;
  const total = h.time.length;
  const idx = Math.min(Math.max(0, currentIndex), total - 1);

  const leadTimeH = idx; // hours since forecast was issued
  const maxLead = Math.min(total, 168); // cap at 7 days

  // Model skill curves (based on ECMWF/GFS benchmarks)
  function skillCurve(hoursAhead: number): number {
    const h = Math.max(0, hoursAhead);
    if (h <= 6) return 92 - h * 0.3;
    if (h <= 24) return 90 - (h - 6) * 0.55;
    if (h <= 72) return 76 - (h - 24) * 0.35;
    if (h <= 144) return 65 - (h - 72) * 0.18;
    return Math.max(42, 53 - (h - 144) * 0.08);
  }

  const tempSkill = skillCurve(leadTimeH);
  const precipSkill = Math.max(30, tempSkill - 10);
  const windSkill = Math.max(35, tempSkill - 7);

  // Penalize data gaps around current index
  const gapWindow = 3;
  const gapPenalty = (arr: (number | null)[]) => {
    let penalty = 0;
    for (let i = Math.max(0, idx - gapWindow); i <= Math.min(total - 1, idx + gapWindow); i++) {
      if (arr[i] == null) penalty += 4;
    }
    return Math.min(penalty, 15);
  };

  const tempP = Math.max(0, Math.min(100, Math.round(tempSkill - gapPenalty(h.temperature_2m))));
  const precipP = Math.max(0, Math.min(100, Math.round(precipSkill - gapPenalty(h.precipitation_probability ?? []) - 5)));
  const windP = Math.max(0, Math.min(100, Math.round(windSkill - gapPenalty(h.wind_speed_10m ?? []) - 3)));

  const overall = Math.round(tempP * 0.4 + precipP * 0.3 + windP * 0.3);

  return { overall, temp: tempP, precip: precipP, wind: windP };
}