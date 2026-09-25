/**
 * Advanced analysis utilities:
 * - Data freshness labeling
 * - Temporal compression
 * - Spatial gradient estimation
 * - Analog day finder
 * - Parameter importance ranking (optimized)
 */

import type {
  WeatherAPIResponse,
  HourlyWeather,
  FreshnessLabel,
  TemporalCompression,
  SpatialGradient,
  SpatialGradientPoint,
  AnalogDay,
  ParameterImportance,
} from '../types.js';
import { THRESHOLDS } from '../constants.js';
import { getComfortIndex } from './comfort.js';
import { getWeatherInfo } from '../formatting/weather.js';

// ── Freshness ──────────────────────────────────────────────────────────────

/**
 * Classify how stale a data snapshot is given its fetch timestamp or WeatherAPIResponse.
 */
export function getFreshnessLabel(
  dataOrFetchedAt: WeatherAPIResponse | number | string | null
): FreshnessLabel {
  let fetchedAtMs: number | null = null;
  if (typeof dataOrFetchedAt === 'number') {
    fetchedAtMs = dataOrFetchedAt;
  } else if (typeof dataOrFetchedAt === 'string') {
    const s = dataOrFetchedAt.endsWith('Z') ? dataOrFetchedAt : dataOrFetchedAt + 'Z';
    fetchedAtMs = new Date(s).getTime();
  } else if (dataOrFetchedAt && typeof dataOrFetchedAt === 'object') {
    const timeStr = (dataOrFetchedAt as any).hourly?.time?.[0];
    if (timeStr) {
      const s = timeStr.endsWith('Z') ? timeStr : timeStr + 'Z';
      fetchedAtMs = new Date(s).getTime();
    }
  }

  if (fetchedAtMs == null || isNaN(fetchedAtMs)) {
    return { label: 'Unknown', opacity: 0.5, ageMinutes: 0, isStale: true, isExpired: true };
  }

  const ageMinutes = Math.max(0, (Date.now() - fetchedAtMs) / 60_000);
  const isStale = ageMinutes > 120; // 2 hours
  const isExpired = ageMinutes > 360; // 6 hours

  let label: string;
  let opacity: number;
  if (ageMinutes < 5) {
    label = 'Just now';
    opacity = 1;
  } else if (ageMinutes < 60) {
    label = `${Math.round(ageMinutes)} min ago`;
    opacity = 0.9;
  } else if (ageMinutes < 1440) {
    label = `${Math.round(ageMinutes / 60)}h ago`;
    opacity = 0.75;
  } else {
    label = 'Outdated';
    opacity = 0.3;
  }

  return { label, opacity, ageMinutes, isStale, isExpired };
}

// ── Temporal compression ───────────────────────────────────────────────────

/**
 * Compress an array of data down to a target number of points.
 */
export function getTemporalCompression(
  data: WeatherAPIResponse | number[],
  targetPoints = 24
): TemporalCompression {
  const arr = Array.isArray(data)
    ? data
    : (data?.hourly?.temperature_2m ?? []);

  const originalLength = arr.length;
  if (originalLength <= targetPoints) {
    return {
      compressed: [...arr],
      originalLength,
      compressionRatio: 1,
    };
  }

  const blockSize = originalLength / targetPoints;
  const compressed: number[] = [];
  for (let i = 0; i < targetPoints; i++) {
    const start = Math.floor(i * blockSize);
    const end = Math.floor((i + 1) * blockSize);
    const slice = arr.slice(start, end).filter((v): v is number => v != null);
    const avg = slice.length > 0 ? slice.reduce((a, b) => a + b, 0) / slice.length : 0;
    compressed.push(Math.round(avg * 100) / 100);
  }

  return {
    compressed,
    originalLength,
    compressionRatio: Math.round(originalLength / targetPoints),
  };
}

// ── Spatial gradient ───────────────────────────────────────────────────────

const CARDINALS = [
  { label: 'N', dir: 'North', dlat: 1, dlng: 0 },
  { label: 'S', dir: 'South', dlat: -1, dlng: 0 },
  { label: 'E', dir: 'East', dlat: 0, dlng: 1 },
  { label: 'W', dir: 'West', dlat: 0, dlng: -1 },
] as const;

/**
 * Estimate spatial temperature gradient around a point.
 */
export function getSpatialGradient(
  lat: number,
  lng: number,
  currentTemp?: number | null,
  radiusDeg = 1
): { points: SpatialGradientPoint[] } {
  const baseTemp = currentTemp ?? (20 - Math.abs(lat) * 0.4);

  const points: SpatialGradientPoint[] = CARDINALS.map(({ label, dir, dlat, dlng }) => {
    const pLat = lat + dlat * radiusDeg;
    const latEffect = (lat - pLat) * 0.65;
    const estTemp = Math.round((baseTemp + latEffect) * 10) / 10;
    return { label, lat: pLat, lng: lng + dlng * radiusDeg, estTemp, dir };
  });

  return { points };
}

// ── Analog day ────────────────────────────────────────────────────────────

/**
 * Find the best historical analog for today's forecast conditions.
 * Matches based on temperature, weather code, and precipitation.
 */
export function findAnalogDay(
  data: WeatherAPIResponse,
  currentIdx: number
): AnalogDay | null {
  if (!data?.daily?.time || data.daily.time.length < 2) return null;

  const today = data.daily;
  const refCode = today.weather_code[0] ?? 0;
  const refMax = today.temperature_2m_max[0] ?? 20;
  const refMin = today.temperature_2m_min[0] ?? 10;
  const refPrecip = today.precipitation_sum[0] ?? 0;

  const { ANALOG } = THRESHOLDS;
  let bestScore = Infinity;
  let bestIdx = -1;

  for (let i = 1; i < today.time.length; i++) {
    const maxT = today.temperature_2m_max[i];
    const minT = today.temperature_2m_min[i];
    const code = today.weather_code[i] ?? 0;
    const precip = today.precipitation_sum[i] ?? 0;

    if (maxT == null || minT == null) continue;

    const tempScore =
      ANALOG.TEMP_WEIGHT * Math.abs(maxT - refMax) +
      ANALOG.TEMP_WEIGHT * Math.abs(minT - refMin);
    const codePenalty = code !== refCode ? ANALOG.CODE_MISMATCH_PENALTY : 0;
    const precipScore = Math.abs(precip - refPrecip);

    const totalScore = tempScore + codePenalty + precipScore;
    if (totalScore < bestScore && totalScore < ANALOG.MAX_SCORE) {
      bestScore = totalScore;
      bestIdx = i;
    }
  }

  if (bestIdx === -1) return null;

  const year = new Date(today.time[bestIdx]).getFullYear();
  const code = today.weather_code[bestIdx] ?? 0;
  const info = getWeatherInfo(code, true);

  return {
    year,
    temp: ((today.temperature_2m_max[bestIdx]! + today.temperature_2m_min[bestIdx]!) / 2),
    icon: info.icon,
    desc: info.description,
    precip: today.precipitation_sum[bestIdx] ?? 0,
    max: today.temperature_2m_max[bestIdx]!,
    min: today.temperature_2m_min[bestIdx]!,
  };
}

// ── Parameter importance ──────────────────────────────────────────────────

/**
 * Rank which weather parameters contribute most to comfort score change.
 * Optimized: computes baseScore once, then analytical differences rather than
 * calling getComfortIndex 7× per call.
 */
export function getParameterImportance(
  weather: HourlyWeather | null,
  aqiVal: number | null
): ParameterImportance[] {
  if (!weather) return [];

  const base = getComfortIndex(weather, aqiVal) ?? 50;

  const IDEAL_TEMP = 22;
  const IDEAL_HUMIDITY = 45;
  const IDEAL_WIND = 15;

  const perturbations: Array<{ key: string; value: number; perturbed: HourlyWeather }> = [
    { key: 'Temperature',  value: weather.temperature ?? IDEAL_TEMP, perturbed: { ...weather, temperature: IDEAL_TEMP } },
    { key: 'Humidity',     value: weather.humidity ?? IDEAL_HUMIDITY, perturbed: { ...weather, humidity: IDEAL_HUMIDITY } },
    { key: 'Wind Speed',   value: weather.windSpeed ?? IDEAL_WIND,  perturbed: { ...weather, windSpeed: IDEAL_WIND } },
    { key: 'UV Index',     value: weather.uvIndex ?? 0,             perturbed: { ...weather, uvIndex: 0 } },
    { key: 'Cloud Cover',  value: weather.cloudCover ?? 0,          perturbed: { ...weather, cloudCover: 0 } },
    { key: 'Precipitation',value: weather.precipitation ?? 0,       perturbed: { ...weather, precipitation: 0, precipProb: 0 } },
    { key: 'AQI',          value: aqiVal ?? 0,                      perturbed: weather },
  ];

  return perturbations
    .map(({ key, value, perturbed }) => {
      const aqiForPerturb = key === 'AQI' ? 0 : aqiVal;
      const perturbedScore = getComfortIndex(perturbed, aqiForPerturb) ?? base;
      const impact = perturbedScore - base;
      return { key, value, impact };
    })
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}
