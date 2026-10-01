// src/services/CompareService.ts
// Compare Cities View — side-by-side weather comparison

import { getForecast, fetchAirQuality, getHourlyAtIndex, getCurrentHourIndex, formatTemp, formatWind } from './WeatherService.js';

interface CompareLocation {
  name: string;
  lat: number;
  lng: number;
}

interface CompareWeatherData {
  temperature: number;
  windSpeed: number;
  humidity: number | undefined;
  icon: string;
  description: string;
}

interface CompareResult {
  heading: string;
  locationA: {
    name: string;
    weather: CompareWeatherData;
    aqi: string | number;
  };
  locationB: {
    name: string;
    weather: CompareWeatherData;
    aqi: string | number;
  };
}

export async function compareLocations(
  activeLocation: CompareLocation,
  activeWeatherData: any,
  activeAirQualityData: any,
  timelineSliderValue: number,
  compareLocation: CompareLocation
): Promise<CompareResult> {
  // Prevent self-comparison
  const latDiff = Math.abs(activeLocation.lat - compareLocation.lat);
  const lngDiff = Math.abs(activeLocation.lng - compareLocation.lng);
  if (latDiff < 0.01 && lngDiff < 0.01) {
    throw new Error('Cannot compare a location with itself');
  }

  // Fetch comparison location data
  const [forecastB, airQualityB] = await Promise.all([
    getForecast(compareLocation.lat, compareLocation.lng),
    fetchAirQuality(compareLocation.lat, compareLocation.lng),
  ]);

  const idxA = parseInt(String(timelineSliderValue), 10);
  const idxB = getCurrentHourIndex(forecastB, forecastB?.utc_offset_seconds || 0);

  const wA = getHourlyAtIndex(activeWeatherData, idxA);
  const wB = getHourlyAtIndex(forecastB, idxB);

  const aqiA = activeAirQualityData?.hourly?.us_aqi?.[idxA] ?? '--';
  const aqiB = airQualityB?.hourly?.us_aqi?.[idxB] ?? '--';

  return {
    heading: `${activeLocation.name.split(',')[0]} vs ${compareLocation.name.split(',')[0]}`,
    locationA: {
      name: activeLocation.name.split(',')[0],
      weather: {
        temperature: wA.temperature,
        windSpeed: wA.windSpeed,
        humidity: wA.humidity,
        icon: wA.icon,
        description: wA.description,
      },
      aqi: aqiA,
    },
    locationB: {
      name: compareLocation.name.split(',')[0],
      weather: {
        temperature: wB.temperature,
        windSpeed: wB.windSpeed,
        humidity: wB.humidity,
        icon: wB.icon,
        description: wB.description,
      },
      aqi: aqiB,
    },
  };
}

export function formatCompareTemp(temp: number): string {
  return formatTemp(temp);
}

export function formatCompareWind(wind: number): string {
  return formatWind(wind);
}

export function formatCompareAQI(aqi: string | number): string {
  return String(aqi);
}

export function formatCompareHumidity(humidity: number | undefined): string {
  return `${humidity ?? '--'}%`;
}

export function formatCompareDesc(icon: string, description: string): string {
  return `${icon} ${description}`;
}
