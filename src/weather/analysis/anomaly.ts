/**
 * Anomaly detection and historical pattern comparison.
 */

import type { WeatherAPIResponse, AnomalyResult, HistoricalPattern } from '../types.js';
import { THRESHOLDS } from '../constants.js';

/**
 * Detect temperature anomaly compared to historical averages.
 */
export function detectAnomaly(
  currentTemp: number | null,
  historicalResults: WeatherAPIResponse[]
): AnomalyResult | null {
  if (currentTemp == null || !historicalResults || historicalResults.length === 0) return null;

  const { ANOMALY } = THRESHOLDS;

  const validHistorical = historicalResults
    .filter((r) => r?.daily?.temperature_2m_max?.[0] != null)
    .map((r) => (r.daily.temperature_2m_max[0] + r.daily.temperature_2m_min[0]) / 2);

  if (validHistorical.length === 0) return null;

  const histAvg = validHistorical.reduce((a, b) => a + b, 0) / validHistorical.length;
  const diff = currentTemp - histAvg;

  if (Math.abs(diff) < ANOMALY.MIN_DIFF) return null;

  return {
    diff,
    label:
      diff > 0
        ? `${Math.round(diff)}°C warmer than historical avg`
        : `${Math.round(Math.abs(diff))}°C cooler than historical avg`,
    severity:
      Math.abs(diff) > ANOMALY.EXTREME
        ? 'extreme'
        : Math.abs(diff) > ANOMALY.SIGNIFICANT
          ? 'significant'
          : 'noticeable',
  };
}

/**
 * Compare current week forecast to historical averages.
 */
export function getHistoricalPattern(
  data: WeatherAPIResponse | null,
  historicalResults: WeatherAPIResponse[]
): HistoricalPattern | null {
  if (!data?.daily || !historicalResults || historicalResults.length === 0) return null;

  const daily = data.daily;
  const thisWeek: number[] = [];

  for (let i = 0; i < Math.min(7, daily.time.length); i++) {
    if (daily.temperature_2m_max[i] != null && daily.temperature_2m_min[i] != null) {
      thisWeek.push((daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2);
    }
  }

  if (thisWeek.length === 0) return null;

  const weekAvg = thisWeek.reduce((a, b) => a + b, 0) / thisWeek.length;

  const validHistorical = historicalResults
    .filter((r) => r?.daily?.temperature_2m_max?.[0] != null)
    .map((r) => (r.daily.temperature_2m_max[0] + r.daily.temperature_2m_min[0]) / 2);

  if (validHistorical.length === 0) return null;

  const histAvg = validHistorical.reduce((a, b) => a + b, 0) / validHistorical.length;
  const diff = weekAvg - histAvg;

  // Note: The original code assumed 5 years per entry, but this is not guaranteed.
  // We now report the number of historical samples instead.
  return {
    weekAvg,
    histAvg,
    diff,
    label:
      diff > 0
        ? `This week is ${Math.round(diff)}°C warmer than the ${validHistorical.length}-sample average`
        : diff < 0
          ? `This week is ${Math.round(Math.abs(diff))}°C cooler than the ${validHistorical.length}-sample average`
          : 'This week matches historical averages',
  };
}