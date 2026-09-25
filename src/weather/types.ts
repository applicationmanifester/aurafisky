/**
 * TypeScript type definitions for the Weather Service.
 * Centralized to avoid circular dependencies and enable proper typing.
 */

/** Open-Meteo API response structure */
export interface WeatherAPIResponse {
  latitude: number;
  longitude: number;
  generationtime_ms: number;
  utc_offset_seconds: number;
  timezone: string;
  timezone_abbreviation: string;
  elevation: number;
  hourly: HourlyData;
  daily: DailyData;
}

export interface HourlyData {
  time: string[];
  temperature_2m: (number | null)[];
  relative_humidity_2m: (number | null)[];
  apparent_temperature: (number | null)[];
  precipitation_probability: (number | null)[];
  precipitation: (number | null)[];
  weather_code: (number | null)[];
  cloud_cover: (number | null)[];
  wind_speed_10m: (number | null)[];
  wind_direction_10m: (number | null)[];
  wind_gusts_10m: (number | null)[];
  uv_index: (number | null)[];
  pressure_msl: (number | null)[];
  visibility: (number | null)[];
  is_day: (number | null)[];
}

export interface DailyData {
  time: string[];
  weather_code: (number | null)[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  apparent_temperature_max: (number | null)[];
  apparent_temperature_min: (number | null)[];
  sunrise: (string | null)[];
  sunset: (string | null)[];
  uv_index_max: (number | null)[];
  precipitation_sum: (number | null)[];
  precipitation_probability_max: (number | null)[];
  wind_speed_10m_max: (number | null)[];
}

/** Parsed hourly weather snapshot */
export interface HourlyWeather {
  time: string;
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  precipProb: number | null;
  precipitation: number | null;
  weatherCode: number;
  cloudCover: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGusts: number | null;
  uvIndex: number | null;
  pressure: number | null;
  visibility: number | null;
  isDay: boolean;
  description: string;
  icon: string;
}

/** Daily forecast summary */
export interface DailyForecast {
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
}

/** Location search result */
export interface LocationResult {
  name: string;
  country: string;
  admin1: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

/** Advisory/alert */
export interface Advisory {
  type: 'heat' | 'frost' | 'wind-chill' | 'extreme-cold' | 'wind' | 'storm' | 'rain' | 'aqi';
  title: string;
  desc: string;
  severity: 'advisory' | 'warning' | 'severe' | 'extreme';
}

/** Best outdoor window */
export interface OutdoorWindow {
  startIdx: number;
  endIdx: number;
  startTime: string;
  endTime: string;
  hours: number;
  avgTemp: number;
}

/** Decision helper */
export interface DecisionTip {
  icon: string;
  text: string;
  type: 'great' | 'caution' | 'warning';
}

/** Timeline deltas (rate of change) */
export interface TimelineDeltas {
  tempDiff: number | null;
  windDiff: number | null;
  pressureDiff: number | null;
  precipProbDiff: number | null;
}

/** Anomaly detection result */
export interface AnomalyResult {
  diff: number;
  label: string;
  severity: 'extreme' | 'significant' | 'noticeable';
}

/** Historical pattern comparison */
export interface HistoricalPattern {
  weekAvg: number;
  histAvg: number;
  diff: number;
  label: string;
}

/** Upwind point calculation */
export interface UpwindPoint {
  lat: number;
  lng: number;
}

/** Confidence bands (rolling std dev) */
export interface ConfidenceBands {
  bands: (number | null)[];
  window: number;
}

/** Diurnal bias map: hour -> average temperature */
export interface DiurnalBiasMap {
  [hour: string]: number;
}

/** Trust score per parameter */
export interface TrustScore {
  overall: number;
  temp: number;
  precip: number;
  wind: number;
}

/** Weather momentum (velocity/acceleration) */
export interface WeatherMomentum {
  velocity: number;
  acceleration: number;
}

/** Parameter importance ranking */
export interface ParameterImportance {
  key: string;
  value: number;
  impact: number;
}

/** Data freshness metadata */
export interface FreshnessLabel {
  label: string;
  opacity: number;
  ageMinutes: number;
  isStale: boolean;
  isExpired: boolean;
}

/** Temporal compression result */
export interface TemporalCompression {
  compressed: number[];
  originalLength: number;
  compressionRatio: number;
}

/** Spatial gradient point */
export interface SpatialGradientPoint {
  label: string;
  lat: number;
  lng: number;
  estTemp: number;
  dir: string;
}

/** Spatial gradient array with .points alias */
export interface SpatialGradient extends Array<SpatialGradientPoint> {
  points: SpatialGradientPoint[];
}

/** Moon phase */
export interface MoonPhase {
  phase: number; // 0-1
  label: string;
  icon: string;
}

/** Stargazing score */
export interface StargazingScore {
  score: number;
  label: string;
  icon: string;
  illumination: number;
}

/** Golden/Blue hour window */
export interface GoldenBlueHourWindow {
  label: string;
  start: Date;
  end: Date;
}

/** Briefing text */
export type Briefing = string;

/** Analog day match */
export interface AnalogDay {
  year: number;
  temp: number;
  icon: string;
  desc: string;
  precip: number;
  max: number;
  min: number;
}

/** Weather regime classification */
export interface WeatherRegime {
  regime: 'storm' | 'frontal' | 'high' | 'low' | 'stable' | 'humid' | 'windy' | 'precip' | 'transitional' | 'unknown';
  label: string;
  icon: string;
}

/** Comfort label */
export interface ComfortLabel {
  label: string;
  color: string;
  icon: string;
}

/** AQI info */
export interface AQIInfo {
  label: string;
  colorClass: string;
  bgClass: string;
}

/** Pollen level */
export interface PollenLevel {
  level: string;
  color: string;
  icon: string;
}

/** Weekly UV entry */
export interface WeeklyUV {
  date: string;
  uv: number | null;
}

/** Pressure tendency */
export interface PressureTendency {
  direction: 'rising' | 'falling' | 'steady';
  rate: number;
  label: string;
  icon: string;
  desc: string;
}

/** Wind shift */
export interface WindShift {
  shift: number;
  direction: 'clockwise' | 'counterclockwise';
  label: string;
  desc: string;
}

/** Unit system */
export type UnitSystem = 'metric' | 'imperial';

/** Cache entry */
export interface CacheEntry<T> {
  data: T;
  ts: number;
}

/** Fetch options with retry */
export interface FetchOptions {
  retries?: number;
  signal?: AbortSignal;
  timeout?: number;
}