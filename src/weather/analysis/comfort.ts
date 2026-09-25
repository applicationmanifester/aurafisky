/**
 * Comfort Index calculation and labeling.
 * Analyzes weather conditions to produce a 0-100 comfort score.
 */

import type { HourlyWeather } from '../types.js';
import { THRESHOLDS } from '../constants.js';

/**
 * Calculate comfort index (0-100) based on weather conditions.
 * Higher is more comfortable.
 */
export function getComfortIndex(
  weather: HourlyWeather | null,
  aqiVal: number | null
): number | null {
  if (!weather) return null;

  let score = 100;
  const { COMFORT } = THRESHOLDS;

  // Temperature: 18-26°C ideal
  const t = weather.temperature;
  if (t != null) {
    if (t < COMFORT.TEMP_IDEAL_MIN) score -= (COMFORT.TEMP_IDEAL_MIN - t) * 2;
    if (t > COMFORT.TEMP_IDEAL_MAX) score -= (t - COMFORT.TEMP_IDEAL_MAX) * 2;
    if (t < COMFORT.TEMP_EXTREME_COLD || t > COMFORT.TEMP_EXTREME_HOT) score -= 15;
  }

  // Humidity: 30-60% ideal
  const h = weather.humidity;
  if (h != null) {
    if (h < COMFORT.HUMIDITY_IDEAL_MIN) score -= (COMFORT.HUMIDITY_IDEAL_MIN - h) * 0.4;
    if (h > COMFORT.HUMIDITY_IDEAL_MAX) score -= (h - COMFORT.HUMIDITY_IDEAL_MAX) * 0.4;
    if (h > COMFORT.HUMIDITY_HIGH) score -= 10;
  }

  // Wind: 5-25 km/h ideal
  const w = weather.windSpeed;
  if (w != null) {
    if (w < COMFORT.WIND_IDEAL_MIN) score -= (COMFORT.WIND_IDEAL_MIN - w) * 1.5;
    if (w > COMFORT.WIND_IDEAL_MAX) score -= (w - COMFORT.WIND_IDEAL_MAX) * 0.6;
    if (w > COMFORT.WIND_HIGH) score -= 10;
  }

  // UV: <5 ideal
  const uv = weather.uvIndex;
  if (uv != null && uv > COMFORT.UV_IDEAL_MAX) score -= (uv - COMFORT.UV_IDEAL_MAX) * 4;

  // Precipitation
  if (weather.precipitation && weather.precipitation > 0) score -= 15;
  if (weather.precipProb && weather.precipProb > 50) score -= 8;

  // Cloud cover: <50% ideal
  const cc = weather.cloudCover;
  if (cc != null && cc > COMFORT.CLOUD_IDEAL_MAX) score -= (cc - COMFORT.CLOUD_IDEAL_MAX) * 0.15;

  // AQI
  if (aqiVal != null) {
    if (aqiVal > COMFORT.AQI_IDEAL_MAX) score -= (aqiVal - COMFORT.AQI_IDEAL_MAX) * 0.15;
    if (aqiVal > COMFORT.AQI_HIGH) score -= 10;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Map comfort score to label, color, and icon.
 * Cold-aware: distinguishes between heat and cold discomfort.
 */
export function getComfortLabel(
  score: number | null,
  weather?: HourlyWeather | null
): { label: string; color: string; icon: string } {
  if (score == null) return { label: '--', color: 'text-slate-400', icon: '❓' };
  if (score >= 85) return { label: 'Excellent', color: 'text-emerald-500', icon: '🌟' };
  if (score >= 70) return { label: 'Good', color: 'text-green-500', icon: '👍' };
  if (score >= 50) return { label: 'Fair', color: 'text-amber-500', icon: '😐' };

  // Below "Fair", discomfort has a direction (hot vs cold)
  const t = weather ? (weather.feelsLike ?? weather.temperature ?? null) : null;
  const cold = t != null && t < 0;

  if (score >= 30) {
    return cold
      ? { label: 'Bitter', color: 'text-sky-500', icon: '🥶' }
      : { label: 'Poor', color: 'text-orange-500', icon: '😣' };
  }

  if (cold) {
    return t != null && t <= -30
      ? { label: 'Extreme Freeze', color: 'text-cyan-400', icon: '🧊' }
      : { label: 'Shivering', color: 'text-sky-500', icon: '🥶' };
  }

  return { label: 'Miserable', color: 'text-red-500', icon: '🥵' };
}