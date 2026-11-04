import { describe, it, expect } from 'vitest';
import { calculateBestOutdoorWindow, formatOutdoorWindowLabel } from '../features/activityWindow.js';
import { evaluateMarineHazard, evaluateFloodHazard } from '../features/marine.js';
import { WeatherService } from '../weather.js';

describe('Sprint 2: Environmental, Satellite Solar & CAMS AQI Suite', () => {
  describe('CAMS Air Quality, Pollen & Best 2-Hour Outdoor Window', () => {
    it('calculates the optimal 2-hour window minimizing composite penalty cost', () => {
      const mockWeather = {
        hourly: {
          time: [
            '2026-11-04T06:00',
            '2026-11-04T07:00',
            '2026-11-04T08:00',
            '2026-11-04T09:00',
            '2026-11-04T10:00',
            '2026-11-04T11:00',
          ],
          precipitation: [0, 0, 1.5, 2.0, 0, 0],
          precipitation_probability: [10, 10, 80, 90, 10, 10],
          uv_index: [0, 1, 3, 5, 8, 9],
          temperature_2m: [18, 19, 21, 25, 30, 32],
          apparent_temperature: [18, 19, 21, 25, 30, 32],
        },
      };

      const mockAirQuality = {
        hourly: {
          us_aqi: [30, 35, 45, 95, 120, 130],
          birch_pollen: [5, 5, 20, 40, 50, 60],
          grass_pollen: [2, 2, 10, 15, 20, 25],
        },
      };

      const window = calculateBestOutdoorWindow(mockWeather, mockAirQuality, 0);
      expect(window).not.toBeNull();
      // Hour 0 (06:00 to 08:00) has clean air (AQI 30-35), zero rain, low UV (0-1), and mild temp (18-19°C)
      expect(window.startHourIndex).toBe(0);
      expect(window.avgAqi).toBeLessThanOrEqual(40);
      expect(window.hasRain).toBe(false);

      const formatted = formatOutdoorWindowLabel(window);
      expect(formatted.badge).toBe('Prime');
      expect(formatted.tone).toBe('emerald');
      expect(formatted.detail).toContain('Clean Air');
      expect(formatted.detail).toContain('Low UV');
    });

    it('penalizes precipitation heavily and picks dry slot', () => {
      const mockWeather = {
        hourly: {
          time: [
            '2026-11-04T00:00',
            '2026-11-04T01:00',
            '2026-11-04T02:00',
            '2026-11-04T03:00',
          ],
          precipitation: [2.5, 2.0, 0, 0],
          precipitation_probability: [90, 85, 5, 5],
          uv_index: [0, 0, 0, 0],
          temperature_2m: [20, 20, 20, 20],
        },
      };

      const window = calculateBestOutdoorWindow(mockWeather, null, 0);
      expect(window).not.toBeNull();
      expect(window.startHourIndex).toBe(2); // indices 2 & 3 have zero rain
    });
  });

  describe('Satellite Solar Radiation & Rooftop PV Yield Estimation', () => {
    it('calculates instantaneous PV yield from direct and diffuse irradiance', () => {
      // 600 W/m² DNI, 150 W/m² diffuse, eta = 0.18, derate = 0.85
      // liveYield = 750 * 0.18 * 0.85 = 114.75 W/m²
      const result = WeatherService.getSolarPvYield(600, 150);
      expect(result.instantaneousYieldWatts).toBe(115);
      expect(result.directNormalWatts).toBe(600);
      expect(result.diffuseWatts).toBe(150);
      expect(result.totalIrradianceWatts).toBe(750);
      expect(result.efficiencyPct).toBe(18);
      expect(result.status).toBe('Moderate Generation');
      // 5kW residential array (~25m²): 114.75 * 25 ~ 2869W
      expect(result.arrayPowerWatts).toBe(2869);
    });

    it('returns zero and Idle / Night status in darkness', () => {
      const result = WeatherService.getSolarPvYield(0, 0);
      expect(result.instantaneousYieldWatts).toBe(0);
      expect(result.status).toBe('Idle / Night');
    });

    it('computes daily solar PV generation in kWh/m²', () => {
      const mockData = {
        hourly: {
          time: [
            '2026-11-04T08:00',
            '2026-11-04T09:00',
            '2026-11-04T10:00',
            '2026-11-04T11:00',
          ],
          direct_normal_irradiance: [300, 500, 700, 800],
          diffuse_radiation: [100, 150, 180, 200],
        },
      };

      const daily = WeatherService.getDailySolarPvYield(mockData, '2026-11-04');
      expect(daily.totalKwhM2).toBeGreaterThan(0);
      expect(daily.standardArrayTotalKwh).toBeGreaterThan(0);
      expect(daily.peakHourYieldWatts).toBeGreaterThan(100);
    });
  });

  describe('Golden Hour Atmospheric Scattering & Astrophotography Clarity', () => {
    it('scores high cloud scattering favorably for vibrant sunsets', () => {
      // Low clouds 5% (<15%), High cirrus 40% (20-60%)
      const aesthetics = WeatherService.getGoldenHourAesthetics(5, 20, 40, 45);
      expect(aesthetics.score).toBeGreaterThanOrEqual(80);
      expect(aesthetics.label).toBe('Vibrant Crimson Scattering');
      expect(aesthetics.icon).toBe('🌅');
    });

    it('penalizes thick low cloud overcast for sunset aesthetics', () => {
      const overcast = WeatherService.getGoldenHourAesthetics(90, 80, 50, 95);
      expect(overcast.score).toBeLessThanOrEqual(30);
      expect(overcast.label).toContain('Overcast');
    });

    it('computes astrophotography clarity combining lunar phase, clouds and AQI', () => {
      // Clear skies (0% clouds), new moon (phase 0.0 -> 0 illumination), clean air (AQI 25)
      const astro = WeatherService.getAstrophotographyClarity(0, 0.0, 25, 0);
      expect(astro.score).toBe(100);
      expect(astro.label).toBe('Pristine Deep-Sky Clarity');
      expect(astro.recommendation).toContain('Ideal for nebulae');

      // Full moon (phase 0.5 -> 100% illumination) washes out deep-sky objects
      const fullMoonAstro = WeatherService.getAstrophotographyClarity(0, 0.5, 25, 0);
      expect(fullMoonAstro.score).toBe(70);
      expect(fullMoonAstro.illuminationPct).toBe(100);
    });
  });

  describe('Coastal Marine Swell & GloFAS River Flood Hazards', () => {
    it('flags coastal surf hazard when swell period T > 12s with wave height H > 2.0m', () => {
      const mockHazardMarine = {
        current: {
          wave_height: 2.8,
          swell_wave_period: 15.0,
          swell_wave_height: 2.6,
        },
      };

      const result = evaluateMarineHazard(mockHazardMarine);
      expect(result.isCoastal).toBe(true);
      expect(result.isHazard).toBe(true);
      expect(result.level).toBe('HAZARD');
      expect(result.label).toBe('Massive Swell Hazard');
      expect(result.tone).toBe('rose');
    });

    it('reports calm coastal conditions for normal wave height and period', () => {
      const mockCalmMarine = {
        current: {
          wave_height: 0.8,
          swell_wave_period: 7.0,
          swell_wave_height: 0.6,
        },
      };

      const result = evaluateMarineHazard(mockCalmMarine);
      expect(result.isCoastal).toBe(true);
      expect(result.isHazard).toBe(false);
      expect(result.level).toBe('NORMAL');
      expect(result.label).toBe('Calm Coastal Waters');
    });

    it('recognizes inland locations with null wave height', () => {
      const mockInlandMarine = {
        current: {
          wave_height: null,
          swell_wave_period: null,
        },
      };

      const result = evaluateMarineHazard(mockInlandMarine);
      expect(result.isCoastal).toBe(false);
      expect(result.isHazard).toBe(false);
    });

    it('evaluates river basin GloFAS surge discharge hazard', () => {
      const mockSurgeFlood = {
        daily: {
          river_discharge: [400, 600, 800, 950, 700],
          river_discharge_max: [410, 620, 850, 980, 720],
        },
      };

      const result = evaluateFloodHazard(mockSurgeFlood);
      expect(result.hasBasin).toBe(true);
      expect(result.isHazard).toBe(true);
      expect(result.level).toBe('SURGE_WARNING');
      expect(result.label).toBe('Basin Surge Alert');
      expect(result.tone).toBe('rose');
    });
  });
});
