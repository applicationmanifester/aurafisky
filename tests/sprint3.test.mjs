import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import { HapticEngine } from '../modules/haptics.js';
import { buildSparklinePillSvg, SpringScrubber } from '../modules/timeline-physics.js';
import { ScreenWakeLockManager } from '../modules/wake-lock.js';

describe('Sprint 3: Haptic Engine & Tactile Feedback Standards', () => {
  let mockVibrate;

  beforeEach(() => {
    mockVibrate = vi.fn().mockReturnValue(true);
    global.navigator = {
      vibrate: mockVibrate,
      userActivation: { hasBeenActive: true },
    };
  });

  it('triggers specification vibration patterns for core interactions', () => {
    const engine = new HapticEngine();

    // Hourly tick: 8ms
    engine.trigger('hourlyTick');
    expect(mockVibrate).toHaveBeenCalledWith([8]);

    // Map pin drop / waypoint snap: 15ms
    mockVibrate.mockClear();
    engine.trigger('mapWaypointSnap');
    expect(mockVibrate).toHaveBeenCalledWith([15]);

    // Weather threshold cross: [20, 40, 20] double pulse
    mockVibrate.mockClear();
    engine.trigger('weatherThresholdCross');
    expect(mockVibrate).toHaveBeenCalledWith([20, 40, 20]);

    // Severe alert: [40, 60, 80] escalating alert
    mockVibrate.mockClear();
    engine.trigger('severeAlert');
    expect(mockVibrate).toHaveBeenCalledWith([40, 60, 80]);
  });

  it('throttles high-frequency hourly scrubber ticks to <= 12 Hz', () => {
    const engine = new HapticEngine();
    let firedCount = 0;

    mockVibrate = vi.fn(() => {
      firedCount++;
      return true;
    });
    global.navigator.vibrate = mockVibrate;

    // Simulate 5 rapid scrubber events within 10ms
    for (let i = 0; i < 5; i++) {
      engine.trigger('hourlyTick');
    }

    // Only the first one should fire immediately
    expect(firedCount).toBe(1);
  });

  it('suppresses haptics when prefers-reduced-motion is active', () => {
    const engine = new HapticEngine();
    engine._mediaQuery = { matches: true };

    const result = engine.trigger('hourlyTick');
    expect(result).toBe(false);
    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it('detects hazardous weather thresholds and triggers double pulse haptic', () => {
    const engine = new HapticEngine();
    const trackEl = {
      classList: {
        add: vi.fn(),
        remove: vi.fn(),
      },
      offsetWidth: 100,
    };

    // Extreme UV >= 8
    const firedUv = engine.checkWeatherThresholds({ uv: 9, windSpeed: 10, precipitation: 0 }, 1, trackEl);
    expect(firedUv).toBe(true);
    expect(mockVibrate).toHaveBeenCalledWith([20, 40, 20]);

    // High wind > 50 km/h
    mockVibrate.mockClear();
    const firedWind = engine.checkWeatherThresholds({ uv: 2, windSpeed: 62, precipitation: 0 }, 2, trackEl);
    expect(firedWind).toBe(true);
    expect(mockVibrate).toHaveBeenCalledWith([20, 40, 20]);

    // Heavy rain > 5 mm/h
    mockVibrate.mockClear();
    const firedRain = engine.checkWeatherThresholds({ uv: 1, windSpeed: 15, precipitation: 8.5 }, 3, trackEl);
    expect(firedRain).toBe(true);
    expect(mockVibrate).toHaveBeenCalledWith([20, 40, 20]);
  });
});

describe('Sprint 3: Timeline Physics & Sparkline Preview Pill', () => {
  const sampleWeather = {
    hourly: {
      time: [
        '2026-11-06T00:00',
        '2026-11-06T01:00',
        '2026-11-06T02:00',
        '2026-11-06T03:00',
        '2026-11-06T04:00',
        '2026-11-06T05:00',
        '2026-11-06T06:00',
        '2026-11-06T07:00',
      ],
      temperature_2m: [18, 17, 16, 16, 15, 17, 20, 22],
      precipitation_probability: [0, 0, 10, 20, 45, 10, 0, 0],
      precipitation: [0, 0, 0.2, 0.5, 1.2, 0.1, 0, 0],
      wind_speed_10m: [12, 14, 15, 18, 22, 19, 14, 11],
      wind_direction_10m: [180, 190, 210, 220, 240, 230, 200, 180],
      uv_index: [0, 0, 0, 0, 0, 1, 3, 5],
    },
  };

  it('renders SVG sparkline pill markup with temp, precip, wind rotation and SVG path', () => {
    const html = buildSparklinePillSvg(sampleWeather, 4, 'metric');
    expect(html).toContain('sparkline-pill');
    expect(html).toContain('15°C');
    expect(html).toContain('45%');
    expect(html).toContain('22 km/h');
    expect(html).toContain('rotate(240deg)');
    expect(html).toContain('<svg');
    expect(html).toContain('<path');
  });

  it('renders hazard badge when extreme weather conditions are reached', () => {
    const severeWeather = {
      hourly: {
        time: ['2026-11-06T12:00'],
        temperature_2m: [35],
        precipitation_probability: [90],
        precipitation: [12.5], // > 5 mm/h
        wind_speed_10m: [65],  // > 50 km/h
        wind_direction_10m: [90],
        uv_index: [9],         // >= 8
      },
    };
    const html = buildSparklinePillSvg(severeWeather, 0, 'metric');
    expect(html).toContain('HAZARD');
  });

  it('initializes SpringScrubber with stiffness 280 and damping 26', () => {
    const mockSlider = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      getBoundingClientRect: vi.fn().mockReturnValue({ width: 300, left: 10 }),
    };
    const scrubber = new SpringScrubber({
      sliderEl: mockSlider,
      totalHours: 240,
    });

    expect(scrubber.k).toBe(280);
    expect(scrubber.c).toBe(26);
    expect(mockSlider.addEventListener).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    scrubber.destroy();
  });
});

describe('Sprint 3: Screen Wake Lock Manager', () => {
  it('acquires and releases wake locks deterministically', async () => {
    const mockRelease = vi.fn().mockResolvedValue(undefined);
    const mockRequest = vi.fn().mockResolvedValue({
      addEventListener: vi.fn(),
      release: mockRelease,
    });

    global.navigator.wakeLock = { request: mockRequest };

    const manager = new ScreenWakeLockManager();
    const acquired = await manager.acquire('radarPlayback');
    expect(acquired).toBe(true);
    expect(manager.isActive).toBe(true);
    expect(mockRequest).toHaveBeenCalledWith('screen');

    await manager.release('radarPlayback');
    expect(manager.isActive).toBe(false);
    expect(mockRelease).toHaveBeenCalled();
  });
});

describe('Celestial Radar Dropdown Stacking & Timeline Tick Anti-Collision', () => {
  it('guarantees timeline ticks adaptively space >= 24h on multi-day views to prevent collisions', () => {
    const appCode = fs.readFileSync('app.js', 'utf8');

    // Code must enforce 24h intervals on multi-day timelines (totalHours > 48)
    expect(appCode).toMatch(/if\s*\(totalHours\s*>\s*48\)\s*\{\s*tickStep\s*=\s*\(!isMobile/);
    // Code must calculate minimum hours per tick to prevent label collision
    expect(appCode).toMatch(/minHoursForClearTicks\s*=\s*Math\.ceil\(\(40\s*\/\s*Math\.max\(280,\s*trackWidth\)\)\s*\*\s*totalHours\)/);
  });

  it('guarantees side panel dropdown displays over timeline and has deep bottom scrolling', () => {
    const styles = fs.readFileSync('styles.css', 'utf8');
    const polish = fs.readFileSync('css/aura-polish.css', 'utf8');

    // styles.css must hide and lower timeline when dropdown is open
    expect(styles).toMatch(/body\.sky-radar-fullscreen-active\.sky-panel-dropdown-open\s+#timelineBar[^{]*\{[^}]*visibility:\s*hidden\s*!important/s);
    expect(styles).toMatch(/body\.sky-radar-fullscreen-active\.sky-panel-dropdown-open\s+#timelineBar[^{]*\{[^}]*opacity:\s*0\s*!important/s);

    // css/aura-polish.css must also hide and disable pointer-events on timelineBar
    expect(polish).toMatch(/body\.sky-radar-fullscreen-active\.sky-panel-dropdown-open\s+#timelineBar[^{]*\{[^}]*opacity:\s*0\s*!important/s);
    expect(polish).toMatch(/body\.sky-radar-fullscreen-active\.sky-panel-dropdown-open\s+#timelineBar[^{]*\{[^}]*visibility:\s*hidden\s*!important/s);

    // Side panel active pane must have generous bottom padding for Lyra/Taurus/Gemini
    expect(styles).toMatch(/#celestialRadarSection\.sky-radar-fullscreen\s+\.sky-radar-side-panel\.panel-open-mobile\s+\.sky-tab-pane\.active\s*\{[^}]*padding-bottom:\s*5rem\s*!important/s);
  });
});
