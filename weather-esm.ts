/**
 * weather-esm.ts  (imported as weather-esm.js by Vite's TS resolution)
 * ──────────────────────────────────────────────────────────────────────
 * Public barrel export for the WeatherService namespace.
 * Consumed by tests/weather.test.ts and legacy feature modules.
 */

// ── Unit conversions ───────────────────────────────────────────────────────
export {
  cToF,
  fToC,
  kmhToMph,
  mphToKmh,
  mmToIn,
  inToMm,
  hpaToInhg,
  inhgToHpa,
  calculateDewPoint,
  getWindDirection,
} from './src/weather/formatting/units.js';

// ── Unit system state ──────────────────────────────────────────────────────
export { setUnits, getUnits, WMO_CODES } from './src/weather/constants.js';

// ── Weather code helpers ───────────────────────────────────────────────────
export { isRainCode, isSnowCode, isStormCode } from './src/weather/constants.js';

export {
  getWeatherCodeClass,
  getWeatherInfo,
  getTempClass,
  getWeeklyUV,
} from './src/weather/formatting/weather.js';

// ── Formatting ─────────────────────────────────────────────────────────────
export {
  formatTemp,
  formatWind,
  formatPrecip,
  formatVisibility,
  formatPressure,
  formatDayLabel,
  formatHourLabel,
  formatTimeOnly,
  formatDateTime,
  getFormattedLocationCurrentTime,
  getFormattedLocationCurrentDateTime,
  parseIsoLocal,
} from './src/weather/formatting/dates.js';

// ── AQI / pollen ───────────────────────────────────────────────────────────
export { getAQIInfo, getPollenLevel } from './src/weather/analysis/aqi.js';

// ── Advisories ─────────────────────────────────────────────────────────────
export { getAdvisories } from './src/weather/analysis/advisories.js';

// ── Outdoor window ─────────────────────────────────────────────────────────
export { findBestOutdoorWindow } from './src/weather/algorithms/signal.js';

// ── Comfort index ──────────────────────────────────────────────────────────
export { getComfortIndex, getComfortLabel } from './src/weather/analysis/comfort.js';

// ── Pressure tendency / wind shift ─────────────────────────────────────────
export { getPressureTendency, getWindShift } from './src/weather/analysis/pressure.js';

// ── Decisions ──────────────────────────────────────────────────────────────
export { getDecisions } from './src/weather/analysis/decisions.js';

// ── Signal processing ──────────────────────────────────────────────────────
export {
  getTimelineDeltas,
  findNextRainHour,
  getCumulativePrecipProb,
  getWeatherMomentum,
  decomposeSignalNoise,
} from './src/weather/algorithms/signal.js';

// ── Anomaly detection / historical ─────────────────────────────────────────
export { detectAnomaly, getHistoricalPattern } from './src/weather/analysis/anomaly.js';

// ── Statistical algorithms ─────────────────────────────────────────────────
export {
  getConfidenceBands,
  getPercentileRank,
  computeTrustScore,
} from './src/weather/algorithms/statistics.js';

// ── Diurnal bias ───────────────────────────────────────────────────────────
export { computeDiurnalBias, correctTemperature } from './src/weather/algorithms/diurnal.js';

// ── Advanced analysis ──────────────────────────────────────────────────────
export {
  getFreshnessLabel,
  getTemporalCompression,
  getSpatialGradient,
  findAnalogDay,
  getParameterImportance,
} from './src/weather/analysis/advanced.js';

// ── Astronomy ─────────────────────────────────────────────────────────────
export { getMoonPhase, getUpwindPoint } from './src/weather/analysis/astronomy.js';

// ── Stargazing ─────────────────────────────────────────────────────────────
export { getStargazingScore, getGoldenBlueHourWindows } from './src/weather/analysis/stargazing.js';

// ── Weather regime / briefing ──────────────────────────────────────────────
export { classifyWeatherRegime } from './src/weather/analysis/regime.js';
export { generateBriefing } from './src/weather/analysis/briefing.js';

// ── API functions ──────────────────────────────────────────────────────────
export { fetchForecast, fetchAirQuality, fetchHistoricalWeather, searchLocations } from './src/weather/api/forecast.js';

// ──────────────────────────────────────────────────────────────────────────
// WeatherService namespace object (used by tests as `import { WeatherService as WS }`)
// Also re-exported as default for legacy compat.
// ──────────────────────────────────────────────────────────────────────────

import {
  cToF, fToC, kmhToMph, mphToKmh, mmToIn, inToMm, hpaToInhg, inhgToHpa,
  calculateDewPoint, getWindDirection,
} from './src/weather/formatting/units.js';

import {
  setUnits, getUnits, WMO_CODES,
  isRainCode, isSnowCode, isStormCode,
} from './src/weather/constants.js';

import {
  getWeatherCodeClass, getWeatherInfo, getTempClass, getWeeklyUV,
} from './src/weather/formatting/weather.js';

import {
  formatTemp, formatWind, formatPrecip, formatVisibility, formatPressure,
  formatDayLabel, formatHourLabel, formatTimeOnly, formatDateTime,
  getFormattedLocationCurrentTime, getFormattedLocationCurrentDateTime, parseIsoLocal,
} from './src/weather/formatting/dates.js';

import { getAQIInfo, getPollenLevel } from './src/weather/analysis/aqi.js';
import { getAdvisories } from './src/weather/analysis/advisories.js';
import { findBestOutdoorWindow } from './src/weather/algorithms/signal.js';
import { getComfortIndex, getComfortLabel } from './src/weather/analysis/comfort.js';
import { getPressureTendency, getWindShift } from './src/weather/analysis/pressure.js';
import { getDecisions } from './src/weather/analysis/decisions.js';

import {
  getTimelineDeltas, findNextRainHour, getCumulativePrecipProb,
  getWeatherMomentum, decomposeSignalNoise,
} from './src/weather/algorithms/signal.js';

import { detectAnomaly, getHistoricalPattern } from './src/weather/analysis/anomaly.js';

import {
  getConfidenceBands, getPercentileRank, computeTrustScore,
} from './src/weather/algorithms/statistics.js';

import { computeDiurnalBias, correctTemperature } from './src/weather/algorithms/diurnal.js';

import {
  getFreshnessLabel, getTemporalCompression, getSpatialGradient,
  findAnalogDay, getParameterImportance,
} from './src/weather/analysis/advanced.js';

import { getMoonPhase, getUpwindPoint } from './src/weather/analysis/astronomy.js';
import { getStargazingScore, getGoldenBlueHourWindows } from './src/weather/analysis/stargazing.js';
import { classifyWeatherRegime } from './src/weather/analysis/regime.js';
import { generateBriefing } from './src/weather/analysis/briefing.js';
import {
  fetchForecast, fetchAirQuality, fetchHistoricalWeather, searchLocations,
} from './src/weather/api/forecast.js';

// Re-export all types for the `WS.SomeType` namespace pattern used in tests
export type {
  HourlyWeather,
  WeatherAPIResponse,
  DailyForecast,
  Advisory,
  OutdoorWindow,
  DecisionTip,
  TimelineDeltas,
  AnomalyResult,
  HistoricalPattern,
  UpwindPoint,
  ConfidenceBands,
  DiurnalBiasMap,
  TrustScore,
  WeatherMomentum,
  ParameterImportance,
  FreshnessLabel,
  TemporalCompression,
  SpatialGradient,
  WeatherRegime,
  Briefing,
  AnalogDay,
  ComfortLabel,
  AQIInfo,
  PollenLevel,
  PressureTendency,
  WindShift,
  MoonPhase,
  StargazingScore,
  GoldenBlueHourWindow,
  UnitSystem,
} from './src/weather/types.js';

export const WeatherService = {
  // Conversions
  cToF, fToC, kmhToMph, mphToKmh, mmToIn, inToMm, hpaToInhg, inhgToHpa,
  calculateDewPoint, getWindDirection,

  // Units state
  setUnits, getUnits, WMO_CODES,

  // Code classifiers
  isRainCode, isSnowCode, isStormCode, getWeatherCodeClass, getWeatherInfo,

  // Formatting
  formatTemp, formatWind, formatPrecip, formatVisibility, formatPressure,
  formatDayLabel, formatHourLabel, formatTimeOnly, formatDateTime,
  getFormattedLocationCurrentTime, getFormattedLocationCurrentDateTime, parseIsoLocal,
  getTempClass, getWeeklyUV,

  // AQI / Pollen
  getAQIInfo, getPollenLevel,

  // Analysis
  getAdvisories, findBestOutdoorWindow, getComfortIndex, getComfortLabel,
  getPressureTendency, getWindShift, getDecisions,

  // Timeline
  getTimelineDeltas, findNextRainHour, getCumulativePrecipProb,
  getWeatherMomentum, decomposeSignalNoise,

  // Anomaly / Historical
  detectAnomaly, getHistoricalPattern,

  // Statistics
  getConfidenceBands, getPercentileRank, computeTrustScore,

  // Diurnal
  computeDiurnalBias, correctTemperature,

  // Advanced
  getFreshnessLabel, getTemporalCompression, getSpatialGradient,
  findAnalogDay, getParameterImportance,

  // Astronomy
  getMoonPhase, getUpwindPoint,

  // Stargazing
  getStargazingScore, getGoldenBlueHourWindows,

  // Regime / Briefing
  classifyWeatherRegime, generateBriefing,

  // API
  fetchForecast, fetchAirQuality, fetchHistoricalWeather, searchLocations,
};

export default WeatherService;
