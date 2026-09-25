/**
 * Weather-specific formatting: WMO codes, descriptions, icons, CSS classes.
 */

import { WMO_CODES, COMPASS, isRainCode, isSnowCode, isStormCode } from '../constants.js';
import type { HourlyWeather } from '../types.js';

/** Weather code classification helpers — canonical definitions in constants.ts */
export { isRainCode, isSnowCode, isStormCode };

export function getWeatherCodeClass(code: number): string {
  if (isStormCode(code)) return 'storm';
  if (isSnowCode(code)) return 'snow';
  if (isRainCode(code)) return 'rain';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  return 'clear';
}

/**
 * Map a WMO weather code to description and icon.
 */
export function getWeatherInfo(
  code: number,
  isDay = true
): { description: string; icon: string; modelSrc: string } {
  const entry = WMO_CODES[code] || WMO_CODES[0];
  return {
    description: entry.description,
    icon: isDay ? entry.dayIcon : entry.nightIcon,
    modelSrc: 'ECMWF + GFS blended',
  };
}

/**
 * Extract a single hour's weather from the hourly arrays.
 */
export function getHourlyAtIndex(
  data: { hourly: Record<string, (number | null)[]> },
  index: number
): HourlyWeather | null {
  if (!data?.hourly?.time) return null;
  const h = data.hourly;
  if (index < 0 || index >= h.time.length) return null;

  const code = (h.weather_code[index] as number) ?? 0;
  const isDay = h.is_day[index] === 1;
  const info = getWeatherInfo(code, isDay);

  return {
    time: h.time[index],
    temperature: h.temperature_2m[index] ?? null,
    feelsLike: h.apparent_temperature[index] ?? null,
    humidity: h.relative_humidity_2m[index] ?? null,
    precipProb: h.precipitation_probability[index] ?? null,
    precipitation: h.precipitation[index] ?? null,
    weatherCode: code,
    cloudCover: h.cloud_cover[index] ?? null,
    windSpeed: h.wind_speed_10m[index] ?? null,
    windDirection: h.wind_direction_10m[index] ?? null,
    windGusts: h.wind_gusts_10m[index] ?? null,
    uvIndex: h.uv_index[index] ?? null,
    pressure: h.pressure_msl[index] ?? null,
    visibility: h.visibility[index] ?? null,
    isDay,
    description: info.description,
    icon: info.icon,
  };
}

/**
 * Find the hourly index closest to the current time.
 * Uses timezone-aware matching when possible.
 */
export function getCurrentHourIndex(
  data: { hourly: { time: string[] }; timezone?: string; utc_offset_seconds?: number },
  utcOffsetSeconds = 0
): number {
  if (!data?.hourly?.time || !data.hourly.time.length) return 0;
  const times = data.hourly.time;
  const tz = data.timezone;

  // Try timezone-aware matching first
  if (tz) {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      let year = '', month = '', day = '', hour = '';

      for (const p of parts) {
        if (p.type === 'year') year = p.value;
        else if (p.type === 'month') month = p.value;
        else if (p.type === 'day') day = p.value;
        else if (p.type === 'hour') {
          let h = parseInt(p.value, 10);
          if (h === 24) h = 0;
          hour = h.toString().padStart(2, '0');
        }
      }

      if (year && month && day && hour) {
        const targetStr = `${year}-${month}-${day}T${hour}:00`;
        const exactIdx = times.indexOf(targetStr);
        if (exactIdx !== -1) return exactIdx;

        const targetPrefix = `${year}-${month}-${day}T${hour}`;
        const prefixIdx = times.findIndex((t) => t.startsWith(targetPrefix));
        if (prefixIdx !== -1) return prefixIdx;
      }
    } catch {
      // Fall through to offset-based matching
    }
  }

  // Fallback: offset-based matching
  const now = new Date();
  const nowInLocation = now.getTime() + utcOffsetSeconds * 1000;
  let closest = 0;
  let minDiff = Infinity;

  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i] + 'Z').getTime();
    const diff = Math.abs(t - nowInLocation);
    if (diff < minDiff) {
      minDiff = diff;
      closest = i;
    }
  }
  return closest;
}

/**
 * Extract daily forecast summaries from the API data.
 */
export function getDailyForecast(data: { daily: Record<string, (number | string | null)[]> }): Array<{
  date: string;
  maxTemp: number | null;
  minTemp: number | null;
  weatherCode: number;
  description: string;
  icon: string;
  precipSum: number | null;
  precipProb: number | null;
  windMax: number | null;
  uvMax: number | null;
  sunrise: string | null;
  sunset: string | null;
}> {
  if (!data?.daily?.time) return [];
  const d = data.daily;
  return d.time.map((date: string, i: number) => {
    const code = (d.weather_code[i] as number) ?? 0;
    const info = getWeatherInfo(code, true);
    return {
      date,
      maxTemp: d.temperature_2m_max[i] as number | null,
      minTemp: d.temperature_2m_min[i] as number | null,
      weatherCode: code,
      description: info.description,
      icon: info.icon,
      precipSum: d.precipitation_sum[i] as number | null,
      precipProb: d.precipitation_probability_max[i] as number | null,
      windMax: d.wind_speed_10m_max[i] as number | null,
      uvMax: d.uv_index_max[i] as number | null,
      sunrise: (d.sunrise[i] as string) ?? null,
      sunset: (d.sunset[i] as string) ?? null,
    };
  });
}

/**
 * Get CSS class name for temperature color coding.
 */
export function getTempClass(temp: number | null | undefined): string {
  if (temp == null) return 'temp-neutral';
  if (temp <= 0) return 'temp-freezing';
  if (temp <= 10) return 'temp-cold';
  if (temp <= 20) return 'temp-mild';
  if (temp <= 30) return 'temp-warm';
  return 'temp-hot';
}

/**
 * Get weekly UV index data.
 */
export function getWeeklyUV(data: { daily: { time: string[]; uv_index_max?: (number | null)[] } }): Array<{
  date: string;
  uv: number | null;
}> | null {
  if (!data?.daily?.uv_index_max) return null;
  return data.daily.time.map((date: string, i: number) => ({
    date,
    uv: data.daily.uv_index_max![i] ?? null,
  }));
}