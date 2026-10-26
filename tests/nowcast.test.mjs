// tests/nowcast.test.mjs
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { JSDOM } from "jsdom";
import WeatherService from "../weather.js";

describe("Minute-by-Minute Nowcast & UV Guidance (Phase 2)", () => {
  const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  describe("HTML Structure", () => {
    it("contains nowcastSection with headline, icon, and bars container", () => {
      const section = doc.getElementById("nowcastSection");
      expect(section).not.toBeNull();

      const headline = doc.getElementById("nowcastHeadline");
      expect(headline).not.toBeNull();

      const icon = doc.getElementById("nowcastIcon");
      expect(icon).not.toBeNull();

      const bars = doc.getElementById("nowcastBars");
      expect(bars).not.toBeNull();
    });

    it("contains panelUVBadge and panelUVAdvice in the UV metric card", () => {
      const panelUV = doc.getElementById("panelUV");
      expect(panelUV).not.toBeNull();

      const badge = doc.getElementById("panelUVBadge");
      expect(badge).not.toBeNull();

      const advice = doc.getElementById("panelUVAdvice");
      expect(advice).not.toBeNull();
    });
  });

  describe("WeatherService.getPrecipitationNowcast", () => {
    it("handles null or empty input safely", () => {
      expect(WeatherService.getPrecipitationNowcast(null)).toBeNull();
      expect(WeatherService.getPrecipitationNowcast({})).toBeNull();
    });

    it("evaluates minutely_15 data when rain is starting in ~30 minutes", () => {
      const now = new Date();
      const times = [];
      const precip = [];
      for (let i = 0; i < 16; i++) {
        const t = new Date(now.getTime() + i * 15 * 60 * 1000);
        times.push(t.toISOString());
        // Rain starting at +30m (index 2)
        precip.push(i >= 2 ? 1.8 : 0);
      }

      const mockData = {
        minutely_15: {
          time: times,
          precipitation: precip,
          precipitation_probability: precip.map((p) => (p > 0 ? 80 : 10)),
        },
      };

      const result = WeatherService.getPrecipitationNowcast(mockData, 0);
      expect(result).not.toBeNull();
      expect(result.hasPrecipitation).toBe(true);
      expect(result.isRainingNow).toBe(false);
      expect(result.rainStartMin).toBe(30);
      expect(result.summary).toContain("Precipitation starting in ~30 min");
      expect(result.intervals.length).toBe(8);
      expect(result.intervals[0].intensity).toBe("none");
      expect(result.intervals[2].intensity).toBe("moderate");
    });

    it("evaluates minutely_15 data when it is actively raining and stops", () => {
      const now = new Date();
      const times = [];
      const precip = [];
      for (let i = 0; i < 16; i++) {
        const t = new Date(now.getTime() + i * 15 * 60 * 1000);
        times.push(t.toISOString());
        // Actively raining, stops at +45m (index 3)
        precip.push(i < 3 ? 3.5 : 0);
      }

      const mockData = {
        minutely_15: {
          time: times,
          precipitation: precip,
        },
      };

      const result = WeatherService.getPrecipitationNowcast(mockData, 0);
      expect(result).not.toBeNull();
      expect(result.isRainingNow).toBe(true);
      expect(result.rainStopMin).toBe(45);
      expect(result.summary).toContain("Rain stopping in ~45 min");
    });

    it("falls back gracefully to hourly precipitation data when minutely_15 is absent", () => {
      const mockData = {
        hourly: {
          time: ["2026-10-26T12:00", "2026-10-26T13:00", "2026-10-26T14:00"],
          precipitation: [0.0, 2.5, 0.0],
          precipitation_probability: [10, 75, 20],
        },
      };

      const result = WeatherService.getPrecipitationNowcast(mockData, 0);
      expect(result).not.toBeNull();
      expect(result.hasPrecipitation).toBe(true);
      expect(result.intervals.length).toBe(5);
      expect(result.summary).toContain("Rain expected starting in ~1 hour");
    });

    it("cross-references hourly model when minutely_15 radar data is zero but weather code and hourly precip indicate rain (radar blindspot)", () => {
      const mockData = {
        utc_offset_seconds: -18000,
        hourly: {
          time: ["2026-10-26T14:00", "2026-10-26T15:00", "2026-10-26T16:00"],
          precipitation: [0.2, 0.1, 0.0],
          precipitation_probability: [79, 84, 20],
          weather_code: [51, 51, 3], // 51 = Drizzle
        },
        minutely_15: {
          time: [
            "2026-10-26T14:00", "2026-10-26T14:15", "2026-10-26T14:30", "2026-10-26T14:45",
            "2026-10-26T15:00", "2026-10-26T15:15", "2026-10-26T15:30", "2026-10-26T15:45",
          ],
          precipitation: [0, 0, 0, 0, 0, 0, 0, 0], // ground radar missing
          precipitation_probability: [80, 82, 84, 84, 83, 80, 60, 40],
        },
      };

      const result = WeatherService.getPrecipitationNowcast(mockData, 0);
      expect(result).not.toBeNull();
      expect(result.hasPrecipitation).toBe(true);
      expect(result.isRainingNow).toBe(true);
      expect(result.intervals[0].intensity).toBe("light");
      expect(result.intervals[0].mm).toBeGreaterThan(0);
      expect(result.summary).toContain("rain");
    });
  });

  describe("WeatherService.getUVGuidance", () => {
    it("handles null or negative values gracefully", () => {
      const g = WeatherService.getUVGuidance(null);
      expect(g.level).toBe("Unknown");
      expect(g.burnTime).toBe("N/A");

      const gNeg = WeatherService.getUVGuidance(-1);
      expect(gNeg.level).toBe("Unknown");
    });

    it("classifies Low UV (< 3)", () => {
      const g = WeatherService.getUVGuidance(1.5);
      expect(g.level).toBe("Low");
      expect(g.burnTime).toBe("60+ min");
      expect(g.advice).toContain("Minimal sun protection");
    });

    it("classifies Moderate UV (3 - 5.9)", () => {
      const g = WeatherService.getUVGuidance(4.2);
      expect(g.level).toBe("Moderate");
      expect(g.burnTime).toBe("~45 min");
      expect(g.advice).toContain("SPF 30+");
    });

    it("classifies High UV (6 - 7.9)", () => {
      const g = WeatherService.getUVGuidance(7.1);
      expect(g.level).toBe("High");
      expect(g.burnTime).toBe("~25-30 min");
      expect(g.advice).toContain("Protection essential");
    });

    it("classifies Very High and Extreme UV (>= 8)", () => {
      const gVeryHigh = WeatherService.getUVGuidance(9.5);
      expect(gVeryHigh.level).toBe("Very High");
      expect(gVeryHigh.burnTime).toBe("~15 min");

      const gExtreme = WeatherService.getUVGuidance(12.0);
      expect(gExtreme.level).toBe("Extreme");
      expect(gExtreme.burnTime).toBe("<10 min");
      expect(gExtreme.advice).toContain("Stay indoors");
    });
  });
});
