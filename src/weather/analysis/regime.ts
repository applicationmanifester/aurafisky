/**
 * Weather regime classification.
 * Identifies synoptic-scale patterns from observations.
 */

import type { HourlyWeather, WeatherRegime, PressureTendency } from '../types.js';
import { isStormCode } from '../constants.js';

/**
 * Classify the current weather regime.
 */
export function classifyWeatherRegime(
  weather: HourlyWeather | null,
  tendency: PressureTendency | null
): WeatherRegime {
  if (!weather) return { regime: 'unknown', label: 'Unknown', icon: '❓' };

  const t = weather.temperature;
  const h = weather.humidity;
  const p = weather.pressure;
  const code = weather.weatherCode;
  const wind = weather.windSpeed;

  // Storm
  if (isStormCode(code)) return { regime: 'storm', label: 'Cyclonic / Storm', icon: '⛈️' };

  // Frontal: falling pressure + wind shift + precip
  if (tendency?.direction === 'falling' && tendency.rate < -0.5 && (wind ?? 0) > 15) {
    return { regime: 'frontal', label: 'Frontal Passage', icon: '🌊' };
  }

  // High pressure: rising pressure, clear skies
  if (tendency?.direction === 'rising' && (code === 0 || code === 1)) {
    return { regime: 'high', label: 'High Pressure Ridge', icon: '☀️' };
  }

  // Low pressure: falling pressure, cloudy
  if (tendency?.direction === 'falling' && code >= 2 && code <= 48) {
    return { regime: 'low', label: 'Low Pressure Trough', icon: '☁️' };
  }

  // Stable: steady pressure, mild conditions
  if (tendency?.direction === 'steady' || !tendency) {
    if (t != null && t >= 15 && t <= 28 && (h ?? 0) < 70)
      return { regime: 'stable', label: 'Stable / Fair', icon: '🌤️' };
    if ((h ?? 0) > 80) return { regime: 'humid', label: 'Humid / Muggy', icon: '💧' };
    if ((wind ?? 0) > 30) return { regime: 'windy', label: 'Windy', icon: '💨' };
  }

  // Precip
  if ((weather.precipitation ?? 0) > 0 || (weather.precipProb ?? 0) > 60) {
    return { regime: 'precip', label: 'Precipitation', icon: '🌧️' };
  }

  return { regime: 'transitional', label: 'Transitional', icon: '🌥️' };
}