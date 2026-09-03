/**
 * Type definitions for weather data structures
 * Based on Open-Meteo API response format
 */

/** Raw hourly data from Open-Meteo API */
export interface RawHourlyData {
  time: string[];
  temperature_2m: number[];
  relative_humidity_2m: number[];
  apparent_temperature: number[];
  precipitation_probability: number[];
  precipitation: number[];
  weather_code: number[];
  cloud_cover: number[];
  wind_speed_10m: number[];
  wind_direction_10m: number[];
  wind_gusts_10m: number[];
  uv_index: number[];
  pressure_msl: number[];
  visibility: number[];
  is_day: number[];
}

/** Raw daily data from Open-Meteo API */
export interface RawDailyData {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
  sunrise: string[];
  sunset: string[];
  uv_index_max: number[];
  precipitation_sum: number[];
  precipitation_probability_max: number[];
  wind_speed_10m_max: number[];
}

/** Complete raw API response */
export interface RawWeatherResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly: RawHourlyData;
  daily: RawDailyData;
  hourly_units: Record<string, string>;
  daily_units: Record<string, string>;
}

/** Processed hourly weather snapshot */
export interface HourlyWeather {
  time: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  precipProb: number;
  precipitation: number;
  weatherCode: number;
  weatherClass: WeatherClass;
  cloudCover: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  uvIndex: number;
  pressure: number;
  visibility: number;
  isDay: boolean;
  description: string;
  icon: string;
  comfortIndex?: number;
}

/** Weather classification for UI theming */
export type WeatherClass = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

/** Daily forecast summary */
export interface DailyForecast {
  date: string;
  weatherCode: number;
  weatherClass: WeatherClass;
  tempMax: number;
  tempMin: number;
  feelsMax: number;
  feelsMin: number;
  sunrise: string;
  sunset: string;
  uvMax: number;
  precipSum: number;
  precipProbMax: number;
  windMax: number;
  description: string;
  icon: string;
}

/** Complete processed weather data */
export interface WeatherData {
  latitude: number;
  longitude: number;
  timezone: string;
  timezoneAbbreviation: string;
  elevation: number;
  hourly: RawHourlyData & {
    comfortIndex?: number[];
    weatherClass?: WeatherClass[];
  };
  daily: RawDailyData;
  fetchedAt: number;
}

/** Current conditions snapshot */
export interface CurrentConditions {
  time: string;
  temperature: number;
  feelsLike: number;
  humidity: number;
  precipProb: number;
  precipitation: number;
  weatherCode: number;
  weatherClass: WeatherClass;
  cloudCover: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  uvIndex: number;
  pressure: number;
  visibility: number;
  isDay: boolean;
  description: string;
  icon: string;
}

/** Geocoding search result */
export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  feature_code: string;
  country_code: string;
  admin1_id?: number;
  admin2_id?: number;
  admin3_id?: number;
  admin4_id?: number;
  timezone: string;
  population?: number;
  country?: string;
  admin1?: string;
}

/** Geocoding API response */
export interface GeocodingResponse {
  results?: GeocodingResult[];
}

/** Unit system */
export type UnitSystem = 'metric' | 'imperial';

/** Comfort assessment result */
export interface ComfortAssessment {
  score: number; // 0-100
  level: 'excellent' | 'good' | 'fair' | 'poor' | 'dangerous';
  factors: {
    temperature: { value: number; score: number; ideal: boolean };
    humidity: { value: number; score: number; ideal: boolean };
    wind: { value: number; score: number; ideal: boolean };
    uv: { value: number; score: number; ideal: boolean };
    precipitation: { value: number; score: number; ideal: boolean };
  };
}

/** Outdoor activity window */
export interface OutdoorWindow {
  startHour: number; // hour of day (0-23)
  endHour: number;   // hour of day (0-23)
  durationHours: number;
  qualityScore: number; // 0-100
}