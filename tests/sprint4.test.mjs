import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinUCBBandit } from '../modules/aura-bandit.js';
import { AuraHealthEngine } from '../modules/aura-health.js';
import { AuraOutdoorPlanner } from '../modules/aura-planner.js';
import { AuraGridResilience } from '../modules/aura-grid.js';
import { AuraWorkflowEngine } from '../modules/aura-workflow.js';
import { BarometerKalmanFilter } from '../modules/aura-sensor-fusion.js';
import { ADWINDriftDetector } from '../modules/aura-drift.js';
import { classify } from '../features/aura.js';

describe('Sprint 4: LinUCB Contextual Bandit (Module 6.3)', () => {
  it('constructs a 6-dimensional normalized context vector', () => {
    const bandit = new LinUCBBandit();
    const ctx = bandit.buildContext({
      hour: 14,
      dayOfWeek: 3,
      precipProb: 40,
      aqi: 75,
      temperatureC: 25,
    });

    expect(ctx.length).toBe(6);
    expect(ctx[0]).toBeCloseTo(Math.sin((2 * Math.PI * 14) / 24));
    expect(ctx[1]).toBeCloseTo(Math.cos((2 * Math.PI * 14) / 24));
    expect(ctx[2]).toBeCloseTo(3 / 6);
    expect(ctx[3]).toBeCloseTo(0.4);
    expect(ctx[4]).toBeCloseTo(75 / 250);
  });

  it('ranks all arms and updates weights upon receiving engagement rewards', () => {
    const bandit = new LinUCBBandit({ arms: ['nowcast', 'routeStudio', 'healthAlerts'] });
    const x = [0.5, 0.5, 0.5, 0.1, 0.2, 0.1];

    const initialRanking = bandit.rank(x);
    expect(initialRanking.length).toBe(3);

    // Reward 'healthAlerts' arm multiple times
    for (let i = 0; i < 5; i++) {
      bandit.update('healthAlerts', x, 1.0);
    }

    const updatedRanking = bandit.rank(x);
    expect(updatedRanking[0].arm).toBe('healthAlerts');
  });
});

describe('Sprint 4: Predictive Health & Encrypted Symptom Logger (Module 6.4)', () => {
  const sampleWeather = {
    hourly: {
      time: Array.from({ length: 24 }, (_, i) => `2026-11-06T${String(i).padStart(2, '0')}:00`),
      temperature_2m: [24, 25, 26, 28, 30, 32, 34, 35, 33, 30, 28, 26, 24, 23, 22, 21, 20, 20, 21, 22, 23, 24, 24, 24],
      surface_pressure: [1016, 1015, 1014, 1012, 1010, 1008, 1006, 1004, 1003, 1002, 1004, 1006, 1008, 1010, 1011, 1012, 1013, 1014, 1014, 1015, 1015, 1016, 1016, 1016],
      relative_humidity_2m: [50, 52, 55, 60, 65, 70, 75, 80, 80, 75, 70, 65, 60, 55, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50],
      uv_index: [0, 0, 0, 1, 3, 6, 8.5, 9, 7, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    },
  };

  it('detects rapid barometric drops and raises high migraine warning', () => {
    const engine = new AuraHealthEngine();
    // At hour index 6, pressure dropped from 1016 to 1006 (-10 hPa in 6 hours)
    const report = engine.evaluateHealthRisks(sampleWeather, 6);

    expect(report.migraineRisk).toBe('high');
    expect(report.alerts.some((a) => a.type === 'migraine')).toBe(true);
    expect(report.uvBurnMinutes).toBeLessThanOrEqual(20);
  });

  it('calculates wet-bulb temperature accurately and alerts on heat stress', () => {
    const engine = new AuraHealthEngine();
    // At hour index 7: temp 35°C, humidity 80%
    const report = engine.evaluateHealthRisks(sampleWeather, 7);

    expect(report.wetBulbTempC).toBeGreaterThan(28);
    expect(report.heatRisk).toBe('critical');
    expect(report.alerts.some((a) => a.type === 'heat')).toBe(true);
  });
});

describe('Sprint 4: Multi-Objective Pareto Outdoor Activity Planner (Module 6.5)', () => {
  const weekForecast = {
    hourly: {
      time: Array.from({ length: 48 }, (_, i) => `2026-11-06T${String(i % 24).padStart(2, '0')}:00`),
      temperature_2m: Array.from({ length: 48 }, (_, i) => 15 + Math.sin(i / 4) * 6),
      precipitation_probability: Array.from({ length: 48 }, (_, i) => (i >= 12 && i <= 18 ? 80 : 5)),
      precipitation: Array.from({ length: 48 }, (_, i) => (i >= 12 && i <= 18 ? 4.5 : 0)),
      wind_speed_10m: Array.from({ length: 48 }, (_, i) => 10 + (i % 6)),
      cloud_cover: Array.from({ length: 48 }, (_, i) => (i < 6 || i > 22 ? 5 : 50)),
    },
  };

  it('finds top 3 non-overlapping windows for runners and astrophotographers', () => {
    const planner = new AuraOutdoorPlanner();

    // Runner prefers daylight, zero rain, low wind
    const runnerWindows = planner.findOptimalWindows(weekForecast, 'runner', 3);
    expect(runnerWindows.length).toBeGreaterThan(0);
    expect(runnerWindows.length).toBeLessThanOrEqual(3);
    expect(runnerWindows[0].score).toBeGreaterThan(60);

    // Astrophotographer prefers night hours (hour < 6 or >= 20) with low cloud cover
    const astroWindows = planner.findOptimalWindows(weekForecast, 'astrophotographer', 3);
    expect(astroWindows.length).toBeGreaterThan(0);
    const startHour = parseInt(astroWindows[0].startTime.split('T')[1].split(':')[0], 10);
    expect(startHour < 6 || startHour >= 20).toBe(true);
  });
});

describe('Sprint 4: Home Energy Grid Resilience & Surge Alerts (Module 6.6)', () => {
  it('evaluates severe thunderstorm CAPE and high winds for voltage surge risks', () => {
    const grid = new AuraGridResilience();
    const stormWeather = {
      hourly: {
        time: ['2026-11-06T14:00', '2026-11-06T15:00'],
        temperature_2m: [39, 38], // Extreme heat > 38°C
        wind_gusts_10m: [85, 90], // Extreme gusts > 75 km/h
        cape: [1800, 2200],       // CAPE > 1500 J/kg
        weather_code: [95, 96],   // Severe thunderstorm
      },
    };

    const result = grid.evaluateGridStrain(stormWeather, 0);
    expect(result.strainLevel).toBe('critical');
    expect(result.status).toBe('alert');
    expect(result.recommendations.some((r) => r.includes('Unplug sensitive electronics'))).toBe(true);
  });
});

describe('Sprint 4: RFC 5545 iCalendar (.ics) Generator (Module 6.7)', () => {
  it('generates standard RFC 5545 iCalendar file content', () => {
    const ics = AuraWorkflowEngine.generateIcs({
      title: 'Morning 10k Run Window',
      description: 'Ideal 16°C and zero rain probability',
      startTime: '2026-11-07T07:00:00Z',
      endTime: '2026-11-07T09:00:00Z',
      location: 'Central Park',
      lat: 40.785091,
      lng: -73.968285,
    });

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Morning 10k Run Window');
    expect(ics).toContain('GEO:40.785091;-73.968285');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('END:VCALENDAR');
  });
});

describe('Sprint 4: Barometer Kalman Filter & ADWIN Drift Detection (Modules 6.9 & 6.10)', () => {
  it('smooths sensor noise and detects rapid barometric rate of change', () => {
    const kf = new BarometerKalmanFilter({ initialPressure: 1012.0 });

    // Step filter forward with falling pressure sequence
    let state;
    for (let i = 0; i < 5; i++) {
      kf.predict(1 / 60);
      state = kf.update(1012.0 - i * 0.8);
    }

    expect(state.rateHpaPerHour).toBeLessThan(0);
    expect(state.pressure).toBeLessThan(1012.0);
  });

  it('detects concept drift when error residuals undergo statistical shift', () => {
    const detector = new ADWINDriftDetector({ delta: 0.05, maxBuckets: 40 });

    // Stream stationary distribution (small errors)
    for (let i = 0; i < 15; i++) {
      detector.add(0.2);
    }
    expect(detector.lastDriftDetected).toBe(false);

    // Inject massive shift (high error residual)
    let driftFound = false;
    for (let i = 0; i < 20; i++) {
      if (detector.add(8.5)) {
        driftFound = true;
        break;
      }
    }

    expect(driftFound).toBe(true);
  });
});

describe('Sprint 4: Aura AI Assistant Natural Language Intent Parsing', () => {
  it('classifies health, outdoor planner, grid resilience, and calendar queries', () => {
    // Health & migraine
    const healthIntent = classify('will i get a migraine today from pressure?');
    expect(healthIntent?.id).toBe('healthAlerts');

    // Outdoor planning
    const runIntent = classify('when is the best running window today?');
    expect(runIntent?.id).toBe('outdoorPlanner');

    // Grid resilience
    const gridIntent = classify('is there a power outage or blackout risk?');
    expect(gridIntent?.id).toBe('gridResilience');

    // Calendar export
    const calIntent = classify('add to calendar invite and export ics');
    expect(calIntent?.id).toBe('calendarWorkflow');
  });
});
