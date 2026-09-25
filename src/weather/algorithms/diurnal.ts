/**
 * Diurnal bias computation and temperature correction.
 *
 * NOTE: The original implementation computed bias from the same forecast data
 * it intended to correct — that does not correct model bias, it only centers
 * the data around its own mean. This refactored version preserves the same
 * behavior for API compatibility but documents the limitation. A genuine
 * bias correction would compare forecast values against an independent
 * observation source (e.g., weather station observations or the archive API).
 */

import type { WeatherAPIResponse, DiurnalBiasMap } from '../types.js';
import { THRESHOLDS } from '../constants.js';

/**
 * Compute average temperature by hour of day from hourly data.
 * Returns a map: hour ("0"-"23") -> average temperature, only for hours
 * with at least DIURNAL_MIN_SAMPLES valid samples.
 */
export function computeDiurnalBias(
  data: WeatherAPIResponse,
  _utcOffsetSeconds = 0
): DiurnalBiasMap | null {
  if (!data?.hourly?.temperature_2m) return null;

  const h = data.hourly;
  const tempsByHour: Record<number, number[]> = {};

  for (let i = 0; i < h.time.length; i++) {
    const temp = h.temperature_2m[i];
    if (temp == null) continue;

    // Parse hour from "YYYY-MM-DDTHH:mm" — a substring is faster than split()
    const tIndex = h.time[i].indexOf('T');
    if (tIndex === -1) continue;
    const hour = parseInt(h.time[i].substring(tIndex + 1, tIndex + 3), 10);
    if (isNaN(hour)) continue;

    (tempsByHour[hour] ??= []).push(temp);
  }

  const result: DiurnalBiasMap = {};
  for (const [hour, vals] of Object.entries(tempsByHour)) {
    if (vals.length >= THRESHOLDS.DIURNAL_MIN_SAMPLES) {
      result[hour] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
  }
  return result;
}

/**
 * Correct a temperature reading toward the overall mean using a bias map.
 * Corrected = temp - (hourBias - overallMean).
 */
export function correctTemperature(
  temp: number | null,
  hour: number | string,
  biasMap: DiurnalBiasMap | null
): number | null {
  if (temp == null || !biasMap || biasMap[String(hour)] == null) return temp;

  // Compute overall mean from bias map
  const vals = Object.values(biasMap);
  const overallMean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const hourBias = biasMap[String(hour)];

  return temp - (hourBias - overallMean);
}