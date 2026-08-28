import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WeatherService as WS } from '../weather-esm.js';

const {
  // Unit conversions
  cToF,
  kmhToMph,
  mmToIn,
  hpaToInhg,
  formatTemp,
  formatWind,
  formatPrecip,
  formatVisibility,
  formatPressure,
  calculateDewPoint,
  getWindDirection,
  setUnits,
  getUnits,
  // Weather code classification
  isRainCode,
  isSnowCode,
  isStormCode,
  getWeatherCodeClass,
  // WMO codes
  getWeatherInfo,
  WMO_CODES,
  // Formatting
  formatDayLabel,
  formatHourLabel,
  formatDateTime,
  getTempClass,
  // AQI & Pollen
  getAQIInfo,
  getPollenLevel,
  getWeeklyUV,
  // Advisories
  getAdvisories,
  // Outdoor window
  findBestOutdoorWindow,
  // Comfort index
  getComfortIndex,
  getComfortLabel,
  // Pressure tendency
  getPressureTendency,
  // Wind shift
  getWindShift,
  // Decisions
  getDecisions,
  // Timeline deltas
  getTimelineDeltas,
  // Next rain
  findNextRainHour,
  // Anomaly detection
  detectAnomaly,
  // Historical pattern
  getHistoricalPattern,
  // Upwind point
  getUpwindPoint,
  // Confidence bands
  getConfidenceBands,
  // Diurnal bias
  computeDiurnalBias,
  correctTemperature,
  // Percentile rank
  getPercentileRank,
  // Trust score
  computeTrustScore,
  // Signal/noise
  decomposeSignalNoise,
  // Cumulative precip
  getCumulativePrecipProb,
  // Weather momentum
  getWeatherMomentum,
  // Parameter importance
  getParameterImportance,
  // Freshness
  getFreshnessLabel,
  // Temporal compression
  getTemporalCompression,
  // Spatial gradient
  getSpatialGradient,
  // Moon phase
  getMoonPhase,
  // Briefing
  generateBriefing,
  // Analog day
  findAnalogDay,
  // Weather regime
  classifyWeatherRegime,
} = WS;

type HourlyWeather = WS.HourlyWeather;
type WeatherAPIResponse = WS.WeatherAPIResponse;
type DailyForecast = WS.DailyForecast;
type Advisory = WS.Advisory;
type OutdoorWindow = WS.OutdoorWindow;
type DecisionTip = WS.DecisionTip;
type TimelineDeltas = WS.TimelineDeltas;
type AnomalyResult = WS.AnomalyResult;
type HistoricalPattern = WS.HistoricalPattern;
type UpwindPoint = WS.UpwindPoint;
type ConfidenceBands = WS.ConfidenceBands;
type DiurnalBiasMap = WS.DiurnalBiasMap;
type TrustScore = WS.TrustScore;
type WeatherMomentum = WS.WeatherMomentum;
type ParameterImportance = WS.ParameterImportance;
type FreshnessLabel = WS.FreshnessLabel;
type TemporalCompression = WS.TemporalCompression;
type SpatialGradient = WS.SpatialGradient;
type WeatherRegime = WS.WeatherRegime;
type Briefing = WS.Briefing;
type AnalogDay = WS.AnalogDay;

// ── Test Helpers ────────────────────────────────────────────────

const createMockHourlyWeather = (overrides: Partial<HourlyWeather> = {}): HourlyWeather => ({
  time: '2024-01-15T12:00',
  temperature: 20,
  feelsLike: 19,
  humidity: 60,
  precipProb: 10,
  precipitation: 0,
  weatherCode: 0,
  cloudCover: 20,
  windSpeed: 10,
  windDirection: 180,
  windGusts: 15,
  uvIndex: 3,
  pressure: 1013,
  visibility: 10000,
  isDay: true,
  description: 'Clear sky',
  icon: '☀️',
  ...overrides,
});

const createMockWeatherAPIResponse = (overrides: Partial<WeatherAPIResponse> = {}): WeatherAPIResponse => ({
  latitude: 40.7128,
  longitude: -74.006,
  generationtime_ms: 100,
  utc_offset_seconds: -18000,
  timezone: 'America/New_York',
  timezone_abbreviation: 'EST',
  elevation: 10,
  hourly: {
    time: ['2024-01-15T00:00', '2024-01-15T01:00', '2024-01-15T02:00'],
    temperature_2m: [15, 14, 13],
    relative_humidity_2m: [70, 75, 80],
    apparent_temperature: [14, 13, 12],
    precipitation_probability: [0, 0, 5],
    precipitation: [0, 0, 0],
    weather_code: [0, 0, 1],
    cloud_cover: [10, 15, 20],
    wind_speed_10m: [5, 5, 10],
    wind_direction_10m: [180, 180, 190],
    wind_gusts_10m: [8, 8, 12],
    uv_index: [0, 0, 0],
    pressure_msl: [1015, 1014, 1013],
    visibility: [10000, 10000, 10000],
    is_day: [0, 0, 0],
  },
  daily: {
    time: ['2024-01-15', '2024-01-16'],
    weather_code: [0, 1],
    temperature_2m_max: [20, 18],
    temperature_2m_min: [10, 8],
    apparent_temperature_max: [19, 17],
    apparent_temperature_min: [9, 7],
    sunrise: ['2024-01-15T07:00', '2024-01-16T07:01'],
    sunset: ['2024-01-15T17:00', '2024-01-16T17:01'],
    uv_index_max: [3, 2],
    precipitation_sum: [0, 0.5],
    precipitation_probability_max: [0, 30],
    wind_speed_10m_max: [15, 20],
  },
  ...overrides,
});

const createMockHistoricalResponse = (tempMax: number, tempMin: number) => ({
  daily: {
    time: ['2023-01-15'],
    weather_code: [0],
    temperature_2m_max: [tempMax],
    temperature_2m_min: [tempMin],
    precipitation_sum: [0],
  },
});

// ── Tests ────────────────────────────────────────────────────────

describe('WeatherService', () => {
  beforeEach(() => {
    setUnits('metric');
  });

  // ─── Unit Conversions ──────────────────────────────────────────

  describe('Unit Conversions', () => {
    it('cToF converts Celsius to Fahrenheit', () => {
      expect(cToF(0)).toBe(32);
      expect(cToF(100)).toBe(212);
      expect(cToF(-40)).toBe(-40);
      expect(cToF(20)).toBeCloseTo(68);
    });

    it('kmhToMph converts km/h to mph', () => {
      expect(kmhToMph(100)).toBeCloseTo(62.1371);
      expect(kmhToMph(0)).toBe(0);
    });

it('mmToIn converts mm to inches', () => {
      expect(mmToIn(25.4)).toBeCloseTo(1, 5);
      expect(mmToIn(0)).toBe(0);
    });

    it('hpaToInhg converts hPa to inHg', () => {
      expect(hpaToInhg(1013.25)).toBeCloseTo(29.92, 1);
    });
  });

  // ─── Format Functions (metric) ─────────────────────────────────

  describe('Format Functions (metric)', () => {
    beforeEach(() => setUnits('metric'));

    it('formatTemp returns °C', () => {
      expect(formatTemp(20)).toBe('20°C');
      expect(formatTemp(0)).toBe('0°C');
      expect(formatTemp(-5)).toBe('-5°C');
      expect(formatTemp(null)).toBe('--°');
    });

    it('formatWind returns km/h', () => {
      expect(formatWind(10)).toBe('10 km/h');
      expect(formatWind(null)).toBe('-- km/h');
    });

    it('formatPrecip returns mm', () => {
      expect(formatPrecip(5)).toBe('5.0 mm');
      expect(formatPrecip(null)).toBe('-- mm');
    });

    it('formatVisibility returns km', () => {
      expect(formatVisibility(10000)).toBe('10 km');
      expect(formatVisibility(500)).toBe('0.5 km');
      expect(formatVisibility(null)).toBe('--');
    });

    it('formatPressure returns hPa', () => {
      expect(formatPressure(1013)).toBe('1013 hPa');
      expect(formatPressure(null)).toBe('-- hPa');
    });
  });

  // ─── Format Functions (imperial) ───────────────────────────────

  describe('Format Functions (imperial)', () => {
    beforeEach(() => setUnits('imperial'));

    it('formatTemp returns °F', () => {
      expect(formatTemp(20)).toBe('68°F');
      expect(formatTemp(0)).toBe('32°F');
    });

    it('formatWind returns mph', () => {
      expect(formatWind(10)).toBe('6 mph');
    });

    it('formatPrecip returns in', () => {
      expect(formatPrecip(25.4)).toBe('1.00 in');
    });

    it('formatVisibility returns mi', () => {
      expect(formatVisibility(1609)).toBe('1.0 mi');
    });

it('formatPressure returns inHg', () => {
      expect(formatPressure(1013)).toBe('29.91 inHg');
    });
  });

  // ─── Weather Code Classification ───────────────────────────────

  describe('Weather Code Classification', () => {
    it('isRainCode identifies rain codes', () => {
      expect(isRainCode(51)).toBe(true);
      expect(isRainCode(61)).toBe(true);
      expect(isRainCode(80)).toBe(true);
      expect(isRainCode(0)).toBe(false);
      expect(isRainCode(71)).toBe(false);
    });

    it('isSnowCode identifies snow codes', () => {
      expect(isSnowCode(71)).toBe(true);
      expect(isSnowCode(85)).toBe(true);
      expect(isSnowCode(61)).toBe(false);
    });

    it('isStormCode identifies storm codes', () => {
      expect(isStormCode(95)).toBe(true);
      expect(isStormCode(99)).toBe(true);
      expect(isStormCode(61)).toBe(false);
    });

    it('getWeatherCodeClass returns correct class', () => {
      expect(getWeatherCodeClass(0)).toBe('clear');
      expect(getWeatherCodeClass(51)).toBe('rain');
      expect(getWeatherCodeClass(71)).toBe('snow');
      expect(getWeatherCodeClass(95)).toBe('storm');
      expect(getWeatherCodeClass(3)).toBe('cloudy');
      expect(getWeatherCodeClass(45)).toBe('fog');
    });
  });

  // ─── WMO Weather Codes ─────────────────────────────────────────

  describe('WMO Weather Codes', () => {
    it('getWeatherInfo returns correct info for known codes', () => {
      const clear = getWeatherInfo(0, true);
      expect(clear.description).toBe('Clear sky');
      expect(clear.icon).toBe('☀️');

      const rain = getWeatherInfo(61, true);
      expect(rain.description).toBe('Slight rain');
      expect(rain.icon).toBe('🌦️');

      const night = getWeatherInfo(0, false);
      expect(night.icon).toBe('🌙');
    });

    it('falls back to clear sky for unknown codes', () => {
      const unknown = getWeatherInfo(999, true);
      expect(unknown.description).toBe('Clear sky');
    });
  });

  // ─── Wind Direction ────────────────────────────────────────────

  describe('Wind Direction', () => {
    it('getWindDirection returns correct compass points', () => {
      expect(getWindDirection(0)).toBe('N');
      expect(getWindDirection(45)).toBe('NE');
      expect(getWindDirection(90)).toBe('E');
      expect(getWindDirection(180)).toBe('S');
      expect(getWindDirection(270)).toBe('W');
      expect(getWindDirection(360)).toBe('N');
      expect(getWindDirection(null)).toBe('--');
    });
  });

  // ─── Dew Point ─────────────────────────────────────────────────

  describe('Dew Point Calculation', () => {
    it('calculateDewPoint returns correct values', () => {
      const dp = calculateDewPoint(20, 50);
      expect(dp).toBeCloseTo(9.3, 1);

      expect(calculateDewPoint(30, 100)).toBeCloseTo(30, 0);

      expect(calculateDewPoint(null, 50)).toBeNull();
      expect(calculateDewPoint(20, null)).toBeNull();
    });
  });

  // ─── Date/Time Formatting ──────────────────────────────────────

  describe('Date/Time Formatting', () => {
    it('formatDayLabel returns relative labels', () => {
      const formatLocal = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const date = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${date}`;
      };

      const today = formatLocal(new Date());
      expect(formatDayLabel(today)).toBe('Today');

      const tomorrow = formatLocal(new Date(Date.now() + 86400000));
      expect(formatDayLabel(tomorrow)).toBe('Tomorrow');

      const yesterday = formatLocal(new Date(Date.now() - 86400000));
      expect(formatDayLabel(yesterday)).toBe('Yesterday');
    });

    it('formatHourLabel formats hours correctly', () => {
      // Use UTC offset to ensure consistent results regardless of test environment timezone
      expect(formatHourLabel('2024-01-15T00:00', 0)).toBe('12 AM');
      expect(formatHourLabel('2024-01-15T12:00', 0)).toBe('12 PM');
      expect(formatHourLabel('2024-01-15T13:00', 0)).toBe('1 PM');
      expect(formatHourLabel('2024-01-15T23:00', 0)).toBe('11 PM');
    });

    it('formatDateTime returns formatted string', () => {
      const result = formatDateTime('2024-01-15T12:00', 'America/New_York', -18000);
      expect(result).toContain('Jan');
      expect(result).toContain('15');
    });
  });

  // ─── Temperature Class ─────────────────────────────────────────

  describe('Temperature CSS Classes', () => {
    it('getTempClass returns correct classes', () => {
      expect(getTempClass(-5)).toBe('temp-freezing');
      expect(getTempClass(5)).toBe('temp-cold');
      expect(getTempClass(15)).toBe('temp-mild');
      expect(getTempClass(25)).toBe('temp-warm');
      expect(getTempClass(35)).toBe('temp-hot');
      expect(getTempClass(null)).toBe('temp-neutral');
    });
  });

  // ─── AQI Info ──────────────────────────────────────────────────

  describe('AQI Info', () => {
    it('getAQIInfo returns correct severity', () => {
      expect(getAQIInfo(25).label).toBe('Good');
      expect(getAQIInfo(75).label).toBe('Moderate');
      expect(getAQIInfo(125).label).toBe('Unhealthy (Sensitive)');
      expect(getAQIInfo(175).label).toBe('Unhealthy');
      expect(getAQIInfo(250).label).toBe('Very Unhealthy');
      expect(getAQIInfo(350).label).toBe('Hazardous');
      expect(getAQIInfo(null).label).toBe('Unknown');
    });
  });

  // ─── Pollen Level ──────────────────────────────────────────────

  describe('Pollen Level', () => {
    it('getPollenLevel returns correct levels', () => {
      expect(getPollenLevel(10).level).toBe('Low');
      expect(getPollenLevel(30).level).toBe('Moderate');
      expect(getPollenLevel(75).level).toBe('High');
      expect(getPollenLevel(150).level).toBe('Very High');
      expect(getPollenLevel(null).level).toBe('Unknown');
    });
  });

  // ─── Weekly UV ─────────────────────────────────────────────────

  describe('Weekly UV', () => {
    it('getWeeklyUV extracts UV data', () => {
      const data = createMockWeatherAPIResponse();
      const uv = getWeeklyUV(data);
      expect(uv).toHaveLength(2);
      expect(uv![0]).toEqual({ date: '2024-01-15', uv: 3 });
    });

    it('returns null for missing data', () => {
      expect(getWeeklyUV({ ...createMockWeatherAPIResponse(), daily: {} })).toBeNull();
    });
  });

  // ─── Advisories ────────────────────────────────────────────────

  describe('Advisories', () => {
    it('getAdvisories returns heat warning for high temp', () => {
      const weather = createMockHourlyWeather({ temperature: 40 });
      const advisories = getAdvisories(weather, null);
      expect(advisories.some((a: any) => a.type === 'heat')).toBe(true);
    });

    it('getAdvisories returns frost advisory for low temp', () => {
      const weather = createMockHourlyWeather({ temperature: -5 });
      const advisories = getAdvisories(weather, null);
      expect(advisories.some((a: any) => a.type === 'frost')).toBe(true);
    });

    it('getAdvisories returns wind warning for high wind', () => {
      const weather = createMockHourlyWeather({ windSpeed: 50 });
      const advisories = getAdvisories(weather, null);
      expect(advisories.some((a: any) => a.type === 'wind')).toBe(true);
    });

    it('getAdvisories returns storm warning for storm code', () => {
      const weather = createMockHourlyWeather({ weatherCode: 95 });
      const advisories = getAdvisories(weather, null);
      expect(advisories.some((a: any) => a.type === 'storm')).toBe(true);
    });

    it('getAdvisories returns rain alert for heavy precipitation', () => {
      const weather = createMockHourlyWeather({ precipitation: 10 });
      const advisories = getAdvisories(weather, null);
      expect(advisories.some((a: any) => a.type === 'rain')).toBe(true);
    });

    it('getAdvisories returns AQI alert for poor air quality', () => {
      const weather = createMockHourlyWeather();
      const advisories = getAdvisories(weather, 150);
      expect(advisories.some((a: any) => a.type === 'aqi')).toBe(true);
    });

    it('returns empty array for null weather', () => {
      expect(getAdvisories(null, null)).toEqual([]);
    });
  });

  // ─── Best Outdoor Window ───────────────────────────────────────

  describe('Best Outdoor Window', () => {
    it('findBestOutdoorWindow finds good window', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          time: Array.from({ length: 25 }, (_, i) => `2024-01-15T${String(i).padStart(2, '0')}:00`),
          temperature_2m: Array.from({ length: 25 }, (_, i) => 20 + Math.sin(i) * 2),
          precipitation: Array(25).fill(0),
          precipitation_probability: Array(25).fill(10),
          wind_speed_10m: Array(25).fill(5),
          uv_index: Array(25).fill(3),
          cloud_cover: Array(25).fill(20),
        },
      });
      const window = findBestOutdoorWindow(data, 0);
      expect(window).not.toBeNull();
      expect(window!.hours).toBeGreaterThanOrEqual(2);
    });

    it('returns null when no good window exists', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          time: ['2024-01-15T00:00', '2024-01-15T01:00'],
          temperature_2m: [40, 40],
          precipitation: [10, 10],
          precipitation_probability: [100, 100],
          wind_speed_10m: [50, 50],
          uv_index: [10, 10],
          cloud_cover: [100, 100],
        },
      });
      expect(findBestOutdoorWindow(data, 0)).toBeNull();
    });
  });

  // ─── Comfort Index ─────────────────────────────────────────────

  describe('Comfort Index', () => {
    it('getComfortIndex returns 100 for perfect conditions', () => {
      const weather = createMockHourlyWeather({
        temperature: 22,
        humidity: 45,
        windSpeed: 10,
        uvIndex: 3,
        precipitation: 0,
        precipProb: 0,
        cloudCover: 20,
      });
      const score = getComfortIndex(weather, 20);
      expect(score).toBeGreaterThan(85);
    });

    it('getComfortIndex penalizes extreme heat', () => {
      const weather = createMockHourlyWeather({ temperature: 40 });
      const score = getComfortIndex(weather, null);
      expect(score).toBeLessThan(60);
    });

    it('getComfortIndex penalizes high humidity', () => {
      const weather = createMockHourlyWeather({ humidity: 90 });
      const score = getComfortIndex(weather, null);
      expect(score).toBeLessThan(80);
    });

    it('getComfortIndex penalizes high wind', () => {
      const weather = createMockHourlyWeather({ windSpeed: 50 });
      const score = getComfortIndex(weather, null);
      expect(score).toBeLessThan(80);
    });

    it('getComfortIndex returns null for null weather', () => {
      expect(getComfortIndex(null, null)).toBeNull();
    });

    it('getComfortLabel returns correct labels', () => {
      expect(getComfortLabel(90)).toEqual({ label: 'Excellent', color: 'text-emerald-500', icon: '🌟' });
      expect(getComfortLabel(75)).toEqual({ label: 'Good', color: 'text-green-500', icon: '👍' });
      expect(getComfortLabel(55)).toEqual({ label: 'Fair', color: 'text-amber-500', icon: '😐' });
      expect(getComfortLabel(35)).toEqual({ label: 'Poor', color: 'text-orange-500', icon: '😣' });
      expect(getComfortLabel(20)).toEqual({ label: 'Miserable', color: 'text-red-500', icon: '🥵' });
      expect(getComfortLabel(null)).toEqual({ label: '--', color: 'text-slate-400', icon: '❓' });
    });
  });

  // ─── Pressure Tendency ─────────────────────────────────────────

  describe('Pressure Tendency', () => {
    it('getPressureTendency detects rising pressure', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          pressure_msl: [1010, 1011, 1012, 1013, 1014, 1015, 1016],
        },
      });
      const tendency = getPressureTendency(data, 6);
      expect(tendency).not.toBeNull();
      expect(tendency!.direction).toBe('rising');
    });

    it('getPressureTendency detects falling pressure', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          pressure_msl: [1020, 1019, 1018, 1017, 1016, 1015, 1014],
        },
      });
      const tendency = getPressureTendency(data, 6);
      expect(tendency).not.toBeNull();
      expect(tendency!.direction).toBe('falling');
    });

    it('getPressureTendency returns steady for small changes', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          pressure_msl: [1013, 1013.1, 1013.2, 1013.1, 1013, 1013, 1013],
        },
      });
      const tendency = getPressureTendency(data, 6);
      expect(tendency).not.toBeNull();
      expect(tendency!.direction).toBe('steady');
    });
  });

  // ─── Wind Shift ────────────────────────────────────────────────

  describe('Wind Shift Detection', () => {
    it('getWindShift detects significant shift', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          wind_direction_10m: [180, 180, 180, 270],
        },
      });
      const shift = getWindShift(data, 3);
      expect(shift).not.toBeNull();
      expect(shift!.shift).toBeGreaterThan(45);
    });

    it('returns null for small shifts', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          wind_direction_10m: [180, 185, 190, 195],
        },
      });
      expect(getWindShift(data, 3)).toBeNull();
    });
  });

  // ─── Decisions ─────────────────────────────────────────────────

  describe('Decision Intelligence', () => {
    it('getDecisions returns painting advice', () => {
      const weather = createMockHourlyWeather({ temperature: 20, humidity: 50, windSpeed: 10, precipitation: 0, precipProb: 0 });
      const decisions = getDecisions(weather, 20, new Date());
      const paint = decisions.find((d: any) => d.icon.includes('🖌️'));
      expect(paint).toBeDefined();
    });

    it('getDecisions returns kite flying advice', () => {
      const weather = createMockHourlyWeather({ windSpeed: 20, precipitation: 0, precipProb: 0, weatherCode: 0 });
      const decisions = getDecisions(weather, 20, new Date());
      const kite = decisions.find((d: any) => d.icon.includes('🪁'));
      expect(kite).toBeDefined();
    });

    it('getDecisions returns laundry advice', () => {
      const weather = createMockHourlyWeather({ humidity: 50, windSpeed: 10, temperature: 15, precipitation: 0, precipProb: 0 });
      const decisions = getDecisions(weather, 20, new Date());
      const laundry = decisions.find((d: any) => d.icon.includes('👕'));
      expect(laundry).toBeDefined();
    });
  });

  // ─── Timeline Deltas ───────────────────────────────────────────

  describe('Timeline Deltas', () => {
    it('getTimelineDeltas calculates changes', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          temperature_2m: [15, 16, 18],
          wind_speed_10m: [5, 7, 10],
          pressure_msl: [1013, 1014, 1015],
          precipitation_probability: [0, 10, 30],
        },
      });
      const deltas = getTimelineDeltas(data, 2);
      expect(deltas).not.toBeNull();
      expect(deltas!.tempDiff).toBe(2);
      expect(deltas!.windDiff).toBe(3);
      expect(deltas!.pressureDiff).toBe(1);
      expect(deltas!.precipProbDiff).toBe(20);
    });

    it('returns null for first index', () => {
      const data = createMockWeatherAPIResponse();
      expect(getTimelineDeltas(data, 0)).toBeNull();
    });
  });

  // ─── Next Rain Hour ────────────────────────────────────────────

  describe('Next Rain Hour', () => {
    it('findNextRainHour finds next precipitation', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          precipitation: [0, 0, 0.5, 0, 0],
          precipitation_probability: [0, 0, 70, 0, 0],
        },
      });
      const nextRain = findNextRainHour(data, 0);
      expect(nextRain).toBe(2);
    });

    it('returns null when no rain expected', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          precipitation: [0, 0, 0, 0],
          precipitation_probability: [0, 0, 0, 0],
        },
      });
      expect(findNextRainHour(data, 0)).toBeNull();
    });
  });

  // ─── Anomaly Detection ─────────────────────────────────────────

  describe('Anomaly Detection', () => {
    it('detectAnomaly finds warmer than historical', () => {
      const historical = [
        createMockHistoricalResponse(15, 5),
        createMockHistoricalResponse(16, 6),
        createMockHistoricalResponse(14, 4),
      ];
      const anomaly = detectAnomaly(20, historical);
      expect(anomaly).not.toBeNull();
      expect(anomaly!.diff).toBeGreaterThan(5);
      expect(anomaly!.severity).toBe('extreme');
    });

    it('returns null for normal temps', () => {
      const historical = [
        createMockHistoricalResponse(20, 10),
        createMockHistoricalResponse(21, 11),
      ];
      expect(detectAnomaly(16, historical)).toBeNull();
    });

    it('returns null for empty historical', () => {
      expect(detectAnomaly(20, [])).toBeNull();
    });
  });

  // ─── Historical Pattern ────────────────────────────────────────

  describe('Historical Pattern', () => {
    it('getHistoricalPattern compares week to history', () => {
      const data = createMockWeatherAPIResponse({
        daily: {
          time: ['2024-01-15', '2024-01-16', '2024-01-17'],
          temperature_2m_max: [25, 26, 24],
          temperature_2m_min: [15, 16, 14],
        },
      });
      const historical = [
        createMockHistoricalResponse(15, 5),
        createMockHistoricalResponse(16, 6),
      ];
      const pattern = getHistoricalPattern(data, historical);
      expect(pattern).not.toBeNull();
      expect(pattern!.diff).toBeGreaterThan(5);
    });
  });

  // ─── Upwind Point ──────────────────────────────────────────────

  describe('Upwind Point', () => {
    it('getUpwindPoint calculates upwind location', () => {
      const point = getUpwindPoint(40.7128, -74.006, 180, 2);
      expect(point).not.toBeNull();
      expect(point!.lat).toBeGreaterThan(40.7128);
    });

    it('returns null for null wind direction', () => {
      expect(getUpwindPoint(40.7128, -74.006, null)).toBeNull();
    });
  });

  // ─── Confidence Bands ──────────────────────────────────────────

  describe('Confidence Bands', () => {
    it('getConfidenceBands returns standard deviations', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          temperature_2m: [15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
        },
      });
      const bands = getConfidenceBands(data, 2);
      expect(bands).toHaveLength(10);
      expect(bands[5]).not.toBeNull();
      expect(typeof bands[5]).toBe('number');
    });
  });

  // ─── Diurnal Bias ──────────────────────────────────────────────

  describe('Diurnal Bias Correction', () => {
    it('computeDiurnalBias creates hour->temp map', () => {
      // Need at least 3 samples per hour for the bias calculation
      const data = createMockWeatherAPIResponse({
        hourly: {
          time: [
            '2024-01-15T00:00', '2024-01-15T06:00', '2024-01-15T12:00', '2024-01-15T18:00',
            '2024-01-16T00:00', '2024-01-16T06:00', '2024-01-16T12:00', '2024-01-16T18:00',
            '2024-01-17T00:00', '2024-01-17T06:00', '2024-01-17T12:00', '2024-01-17T18:00',
          ],
          temperature_2m: [10, 8, 20, 15, 11, 9, 21, 16, 12, 10, 22, 17],
        },
      });
      const bias = computeDiurnalBias(data, 0);
      expect(bias['0']).toBeCloseTo(11, 0);
      expect(bias['12']).toBeCloseTo(21, 0);
    });

    it('correctTemperature adjusts toward mean', () => {
      const biasMap: DiurnalBiasMap = { '12': 25, '0': 10 };
      const corrected = correctTemperature(30, 12, biasMap);
      expect(corrected).toBeLessThan(30);
    });
  });

  // ─── Percentile Rank ───────────────────────────────────────────

  describe('Percentile Rank', () => {
    it('getPercentileRank calculates percentile', () => {
      const dist = [10, 12, 14, 16, 18, 20];
      expect(getPercentileRank(14, dist)).toBe(50);
      expect(getPercentileRank(10, dist)).toBe(17);
      expect(getPercentileRank(20, dist)).toBe(100);
      expect(getPercentileRank(null, dist)).toBeNull();
    });
  });

  // ─── Trust Score ───────────────────────────────────────────────

  describe('Trust Score', () => {
    it('computeTrustScore returns scores', () => {
      const data = createMockWeatherAPIResponse();
      const score = computeTrustScore(data, 10);
      expect(score).not.toBeNull();
      expect(score!.overall).toBeGreaterThan(0);
      expect(score!.overall).toBeLessThanOrEqual(100);
      expect(score!.temp).toBeGreaterThan(0);
      expect(score!.precip).toBeGreaterThan(0);
      expect(score!.wind).toBeGreaterThan(0);
    });
  });

  // ─── Signal/Noise Decomposition ────────────────────────────────

  describe('Signal/Noise Decomposition', () => {
    it('decomposeSignalNoise separates signal and noise', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          temperature_2m: [15, 16, 17, 18, 19, 20, 21, 22, 23, 24],
        },
      });
      const { signal, noise } = decomposeSignalNoise(data, 1);
      expect(signal).toHaveLength(10);
      expect(noise).toHaveLength(10);
      expect(signal[5]).not.toBeNull();
      expect(noise[5]).not.toBeNull();
    });
  });

  // ─── Cumulative Precipitation ──────────────────────────────────

  describe('Cumulative Precipitation Probability', () => {
    it('getCumulativePrecipProb calculates curve', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          precipitation_probability: [0, 10, 20, 30, 40, 50],
        },
      });
      const curve = getCumulativePrecipProb(data, 0, 5);
      expect(curve).not.toBeNull();
      expect(curve!).toHaveLength(6);
      expect(curve![0].cumProb).toBe(0);
      expect(curve![5].cumProb).toBeGreaterThan(0);
    });
  });

  // ─── Weather Momentum ──────────────────────────────────────────

  describe('Weather Momentum', () => {
    it('getWeatherMomentum calculates velocity and acceleration', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          temperature_2m: [15, 16, 18],
        },
      });
      const momentum = getWeatherMomentum(data, 2);
      expect(momentum).not.toBeNull();
      expect(momentum!.velocity).toBe(2);
      expect(momentum!.acceleration).toBe(1);
    });

    it('returns null for insufficient data', () => {
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          temperature_2m: [15, 16],
        },
      });
      expect(getWeatherMomentum(data, 1)).toBeNull();
    });
  });

  // ─── Parameter Importance ──────────────────────────────────────

  describe('Parameter Importance', () => {
    it('getParameterImportance returns ranked parameters', () => {
      const weather = createMockHourlyWeather({ temperature: 20, humidity: 60, windSpeed: 10 });
      const importance = getParameterImportance(weather, 20);
      expect(importance).toHaveLength(7);
      importance.forEach((p: any) => {
        expect(p).toHaveProperty('key');
        expect(p).toHaveProperty('value');
        expect(p).toHaveProperty('impact');
      });
    });
  });

  // ─── Freshness Label ───────────────────────────────────────────

  describe('Freshness Label', () => {
    it('getFreshnessLabel returns label and staleness', () => {
      const now = Date.now();
      // Use format without trailing Z since function adds Z
      const hourAgo = new Date(now - 3600000).toISOString().replace('Z', '');
      const data = createMockWeatherAPIResponse({
        hourly: {
          ...createMockWeatherAPIResponse().hourly,
          time: [hourAgo],
        },
      });
      const freshness = getFreshnessLabel(data);
      expect(freshness.ageMinutes).toBeGreaterThan(50);
      expect(freshness.ageMinutes).toBeLessThan(70);
      expect(freshness.isStale).toBe(false);
    });
  });

  // ─── Temporal Compression ──────────────────────────────────────

  describe('Temporal Compression', () => {
    it('getTemporalCompression compresses data', () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const compressed = getTemporalCompression(data, 10);
      expect(compressed.compressed).toHaveLength(10);
      expect(compressed.originalLength).toBe(100);
      expect(compressed.compressionRatio).toBe(10);
    });

    it('returns original if shorter than target', () => {
      const data = [1, 2, 3];
      const compressed = getTemporalCompression(data, 10);
      expect(compressed.compressed).toEqual(data);
      expect(compressed.compressionRatio).toBe(1);
    });
  });

  // ─── Spatial Gradient ──────────────────────────────────────────

  describe('Spatial Gradient', () => {
    it('getSpatialGradient returns temperature estimates', () => {
      const gradient = getSpatialGradient(40.7128, -74.006);
      expect(gradient.points).toHaveLength(4);
      gradient.points.forEach((p: any) => {
        expect(p).toHaveProperty('label');
        expect(p).toHaveProperty('lat');
        expect(p).toHaveProperty('lng');
        expect(p).toHaveProperty('estTemp');
        expect(p).toHaveProperty('dir');
      });
    });
  });

  // ─── Moon Phase ────────────────────────────────────────────────

  describe('Moon Phase', () => {
    it('getMoonPhase returns correct phase for known dates', () => {
      const newMoon = getMoonPhase(new Date('2024-01-11T00:00:00Z'));
      expect(newMoon.label).toBe('New Moon');
      expect(newMoon.icon).toBe('🌑');

      const fullMoon = getMoonPhase(new Date('2024-01-25T00:00:00Z'));
      expect(fullMoon.label).toBe('Full Moon');
      expect(fullMoon.icon).toBe('🌕');
    });
  });

  // ─── Weather Regime ────────────────────────────────────────────

  describe('Weather Regime Classification', () => {
    it('classifyWeatherRegime identifies storm', () => {
      const weather = createMockHourlyWeather({ weatherCode: 95 });
      const tendency = { direction: 'falling' as const, rate: -1, label: 'Falling', icon: '📉', desc: '' };
      const regime = classifyWeatherRegime(weather, tendency);
      expect(regime.regime).toBe('storm');
    });

    it('classifyWeatherRegime identifies frontal', () => {
      const weather = createMockHourlyWeather({ windSpeed: 20, weatherCode: 61 });
      const tendency = { direction: 'falling' as const, rate: -1, label: 'Falling', icon: '📉', desc: '' };
      const regime = classifyWeatherRegime(weather, tendency);
      expect(regime.regime).toBe('frontal');
    });

    it('classifyWeatherRegime identifies high pressure', () => {
      const weather = createMockHourlyWeather({ weatherCode: 0 });
      const tendency = { direction: 'rising' as const, rate: 1, label: 'Rising', icon: '📈', desc: '' };
      const regime = classifyWeatherRegime(weather, tendency);
      expect(regime.regime).toBe('high');
    });

    it('classifyWeatherRegime identifies stable', () => {
      const weather = createMockHourlyWeather({ temperature: 20, humidity: 50, windSpeed: 10 });
      const tendency = { direction: 'steady' as const, rate: 0, label: 'Steady', icon: '➡️', desc: '' };
      const regime = classifyWeatherRegime(weather, tendency);
      expect(regime.regime).toBe('stable');
    });
  });
});