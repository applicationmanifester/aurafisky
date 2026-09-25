/**
 * Automated weather briefing generation.
 */

import type { HourlyWeather, DailyForecast, PressureTendency, WindShift, AnomalyResult } from '../types.js';
import { formatTemp, formatWind, formatDateTime } from '../formatting/dates.js';
import { getWindDirection } from '../formatting/units.js';
import { getAQIInfo } from './aqi.js';
import { getComfortIndex, getComfortLabel } from './comfort.js';

/**
 * Generate a natural language weather briefing.
 */
export function generateBriefing(
  weather: HourlyWeather | null,
  daily: DailyForecast[],
  aqiVal: number | null,
  tendency: PressureTendency | null,
  windShift: WindShift | null,
  anomaly: AnomalyResult | null,
  timezone: string | undefined,
  utcOffsetSeconds: number
): string {
  if (!weather) return 'No weather data available.';

  const parts: string[] = [];
  const t = weather.temperature;
  const desc = weather.description;
  const time = formatDateTime(weather.time, timezone, utcOffsetSeconds);

  parts.push(`At ${time}, conditions at your location are ${desc} with ${formatTemp(t)}.`);

  if (weather.feelsLike != null && t != null && Math.abs(weather.feelsLike - t) > 3) {
    parts.push(`It feels like ${formatTemp(weather.feelsLike)} due to wind and humidity.`);
  }

  if (tendency) {
    if (tendency.direction === 'falling' && tendency.rate < -0.5) {
      parts.push(
        `Pressure is dropping rapidly at ${Math.abs(tendency.rate).toFixed(1)} hPa/h, suggesting an approaching low-pressure system — conditions may deteriorate within the next few hours.`
      );
    } else if (tendency.direction === 'rising') {
      parts.push(`Pressure is rising at ${tendency.rate.toFixed(1)} hPa/h, indicating clearing conditions.`);
    }
  }

  if (windShift) {
    parts.push(`A ${windShift.label} has been detected, consistent with a frontal passage.`);
  }

  if (weather.windSpeed != null && weather.windSpeed > 25) {
    parts.push(`Wind is ${formatWind(weather.windSpeed)} from ${getWindDirection(weather.windDirection)}. Secure loose outdoor items.`);
  }

  if (weather.precipProb != null && weather.precipProb > 50) {
    parts.push(`There is a ${weather.precipProb}% chance of precipitation.`);
  }

  if (aqiVal != null && aqiVal > 50) {
    const aqi = getAQIInfo(aqiVal);
    parts.push(`Air quality is ${aqi.label.toLowerCase()} at AQI ${Math.round(aqiVal)}.`);
  }

  if (anomaly) {
    parts.push(`Temperature anomaly: ${anomaly.label}.`);
  }

  if (daily.length > 0) {
    const today = daily[0];
    if (today) {
      parts.push(`Today's range: ${formatTemp(today.minTemp)} to ${formatTemp(today.maxTemp)}.`);
    }
  }

  const comfortScore = getComfortIndex(weather, aqiVal);
  parts.push(`Comfort index: ${getComfortLabel(comfortScore, weather).label}.`);

  return parts.join(' ');
}