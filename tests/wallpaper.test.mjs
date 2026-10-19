// Unit tests for the wallpaper scene generator's pure logic.
//
// The renderer itself needs a canvas, but everything that decides *what* the
// scene looks like — condition mapping, solar phase, and the location seed —
// is deterministic and testable without a DOM.
import { test, expect, describe } from "vitest";
import { sceneKey, sunPhase, seedFor, WALLPAPER_PRESETS, WallpaperRenderer } from "../features/wallpaper.js";

describe("sceneKey", () => {
  test("maps WMO codes onto the right scene", () => {
    expect(sceneKey(0, true)).toBe("clear_day");
    expect(sceneKey(0, false)).toBe("clear_night");
    expect(sceneKey(2, true)).toBe("cloudy_day");
    expect(sceneKey(3, false)).toBe("cloudy_night");
    expect(sceneKey(51, true)).toBe("rain");     // light drizzle
    expect(sceneKey(65, true)).toBe("rain");     // heavy rain
    expect(sceneKey(80, true)).toBe("rain");     // rain showers
    expect(sceneKey(95, true)).toBe("storm");    // thunderstorm
    expect(sceneKey(99, false)).toBe("storm");
    expect(sceneKey(71, true)).toBe("snow");     // snow fall
    expect(sceneKey(85, true)).toBe("snow");     // snow showers
    expect(sceneKey(45, true)).toBe("fog");
    expect(sceneKey(48, false)).toBe("fog");
  });

  test("unknown codes fall back to clear rather than throwing", () => {
    expect(sceneKey(999, true)).toBe("clear_day");
    expect(sceneKey(undefined, true)).toBe("clear_day");
  });
});

describe("sunPhase", () => {
  // Midday sunrise 06:00, sunset 18:00 local, expressed as naive ISO strings
  // (which is the shape Open-Meteo returns).
  const sunrise = "2026-10-15T06:00";
  const sunset = "2026-10-15T18:00";

  test("midday is the day phase with progress past halfway", () => {
    const r = sunPhase(new Date("2026-10-15T12:00"), sunrise, sunset);
    expect(r.phase).toBe("day");
    expect(r.progress).toBeCloseTo(0.5, 1);
  });

  test("just before sunrise is dawn", () => {
    expect(sunPhase(new Date("2026-10-15T05:30"), sunrise, sunset).phase).toBe("dawn");
  });

  test("just after sunset is dusk", () => {
    expect(sunPhase(new Date("2026-10-15T18:30"), sunrise, sunset).phase).toBe("dusk");
  });

  test("the small hours are night", () => {
    expect(sunPhase(new Date("2026-10-15T02:00"), sunrise, sunset).phase).toBe("night");
  });

  test("progress is clamped to 0..1 even outside the daylight window", () => {
    expect(sunPhase(new Date("2026-10-15T03:00"), sunrise, sunset).progress).toBe(0);
    expect(sunPhase(new Date("2026-10-15T22:00"), sunrise, sunset).progress).toBe(1);
  });

  test("missing or unparseable sunrise/sunset degrades instead of throwing", () => {
    expect(sunPhase(new Date(), null, null).phase).toMatch(/day|night/);
    expect(sunPhase(new Date(), "not-a-date", "also-bad").phase).toMatch(/day|night/);
  });

  test("a zero-length daylight window does not divide by zero", () => {
    const r = sunPhase(new Date("2026-10-15T12:00"), sunrise, sunrise);
    expect(Number.isFinite(r.progress)).toBe(true);
  });
});

describe("seedFor", () => {
  test("the same location always produces the same seed", () => {
    expect(seedFor(13.2803, 78.2909)).toBe(seedFor(13.2803, 78.2909));
  });

  test("different locations produce different seeds", () => {
    expect(seedFor(13.2803, 78.2909)).not.toBe(seedFor(12.9716, 77.5946));
  });

  test("handles missing coordinates without producing NaN", () => {
    const s = seedFor(undefined, null);
    expect(Number.isFinite(s)).toBe(true);
  });

  test("is a non-negative integer, as mulberry32 requires", () => {
    for (const [lat, lng] of [[13.2803, 78.2909], [-33.8688, 151.2093], [0, 0]]) {
      const s = seedFor(lat, lng);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("wallpaper presets & renderer", () => {
  test("defines all standard themes with tint configurations", () => {
    const required = ["none", "golden", "midnight", "sunrise", "forest", "desert", "aurora", "monochrome"];
    for (const key of required) {
      expect(WALLPAPER_PRESETS[key]).toBeDefined();
      expect(WALLPAPER_PRESETS[key].label).toBeTypeOf("string");
    }
    expect(WALLPAPER_PRESETS.golden.tint).toBeInstanceOf(Array);
    expect(WALLPAPER_PRESETS.midnight.tint).toBeInstanceOf(Array);
  });

  test("WallpaperRenderer setPreset updates presetName reliably", () => {
    const fakeApp = {
      wallpaperLocations: [],
      activeWallpaperIndex: 0,
    };
    const renderer = new WallpaperRenderer(fakeApp);
    expect(renderer.presetName).toBe("none");

    renderer.setPreset("golden");
    expect(renderer.presetName).toBe("golden");

    renderer.setPreset("midnight");
    expect(renderer.presetName).toBe("midnight");

    renderer.setPreset("invalid_preset_name");
    expect(renderer.presetName).toBe("none");

    renderer.setPreset("aurora");
    expect(renderer.presetName).toBe("aurora");
  });
});