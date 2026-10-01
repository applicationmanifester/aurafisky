// src/services/TimeMachineService.ts
// Climate Time Machine — historical weather comparison for same date in past years

import { getForecast, fetchHistoricalWeather, getWeatherInfo, findAnalogDay } from './WeatherService.js';

interface HistoricalResult {
  date: string;
  daily?: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weather_code: number[];
    precipitation_sum: number[];
  };
}

interface TimeMachineDataPoint {
  label: string;
  temp: number | null;
  maxTemp: number | null;
  minTemp: number | null;
  icon: string;
  description: string;
  precip: number;
  yearsAgo: number;
}

interface TimeMachineResult {
  dataPoints: TimeMachineDataPoint[];
  analogYear?: {
    year: number;
    icon: string;
    description: string;
    temp: number;
  };
}

const YEARS_PAST = [5, 10, 20];
const _climateCache = new Map<string, { results: HistoricalResult[]; ts: number }>();
const CLIMATE_CACHE_TTL = 3600000; // 1 hour

function cacheKey(lat: number, lng: number, month: string, day: string): string {
  return `climate_${lat.toFixed(3)}_${lng.toFixed(3)}_${month}-${day}`;
}

export async function loadTimeMachineData(
  lat: number,
  lng: number,
  month: string,
  day: string,
  currentTemp: number,
  currentWeatherData: any
): Promise<TimeMachineResult> {
  const key = cacheKey(lat, lng, month, day);
  const cached = _climateCache.get(key);
  if (cached && Date.now() - cached.ts < CLIMATE_CACHE_TTL) {
    return processResults(YEARS_PAST, cached.results, currentTemp, currentWeatherData);
  }
  if (cached) _climateCache.delete(key);

  const dates = YEARS_PAST.map(y => {
    const year = new Date().getFullYear() - y;
    return `${year}-${month}-${day}`;
  });

  const results = await Promise.all(
    dates.map(dateStr =>
      fetchHistoricalWeather(lat, lng, dateStr).catch(e => {
        console.warn(`Failed to fetch history for ${dateStr}:`, e);
        return null;
      })
    )
  ) as HistoricalResult[];

  _climateCache.set(key, { results, ts: Date.now() });
  return processResults(YEARS_PAST, results, currentTemp, currentWeatherData);
}

function processResults(
  yearsPast: number[],
  results: HistoricalResult[],
  currentTemp: number,
  currentWeatherData: any
): TimeMachineResult {
  const historyData: TimeMachineDataPoint[] = [];

  results.forEach((res, i) => {
    const yearsAgo = yearsPast[i];
    if (res && res.daily && res.daily.temperature_2m_max) {
      const d = res.daily;
      const max = d.temperature_2m_max[0];
      const min = d.temperature_2m_min[0];
      const avg = (max + min) / 2;
      const code = d.weather_code[0] ?? 0;
      const info = getWeatherInfo(code, true);
      const precip = d.precipitation_sum[0] ?? 0;

      historyData.push({
        label: `${yearsAgo} years ago`,
        temp: avg,
        maxTemp: max,
        minTemp: min,
        icon: info.icon,
        description: info.description,
        precip,
        yearsAgo,
      });
    } else {
      historyData.push({
        label: `${yearsAgo} years ago`,
        temp: null,
        maxTemp: null,
        minTemp: null,
        icon: '❓',
        description: 'Data unavailable',
        precip: 0,
        yearsAgo,
      });
    }
  });

  // Add current temp
  historyData.push({
    label: 'Now',
    temp: currentTemp,
    maxTemp: currentTemp,
    minTemp: currentTemp,
    icon: '📍',
    description: 'Active selection',
    precip: 0,
    yearsAgo: 0,
  });

  // Sort chronologically: 20 years, 10 years, 5 years, Now
  const chronData = [
    historyData[2], // 20 years
    historyData[1], // 10 years
    historyData[0], // 5 years
    historyData[3], // Now
  ];

  // Find analog year
  const analog = findAnalogDay(currentWeatherData, results);
  let analogYear: TimeMachineResult['analogYear'];
  if (analog) {
    analogYear = {
      year: analog.year,
      icon: analog.icon,
      description: analog.description,
      temp: Math.round(analog.temp),
    };
  }

  return { dataPoints: chronData, analogYear };
}

export function clearCache(): void {
  _climateCache.clear();
}

export function destroy(): void {
  _climateCache.clear();
}
