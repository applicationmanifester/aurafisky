// Unit tests for the retention bundle's pure logic: smart to-dos, the
// my-places glance picker/cache splitter, and the daily briefing builder.
// No DOM, no WeatherService — pure shaping only.
import { test, expect, describe } from "vitest";
import { computeTodos } from "../features/smartTodos.js";
import { pickPlaces, splitFreshAndStale } from "../features/myPlaces.js";
import {
  buildBriefingView,
  shouldFireNotification,
  briefingStoreKey,
} from "../features/dailyBriefing.js";

// ── Smart to-dos ──────────────────────────────────────────────────

describe("computeTodos", () => {
  const base = {
    temperature: 22,
    feelsLike: 22,
    humidity: 50,
    windSpeed: 10,
    gusts: 15,
    uvIndex: 3,
    prob6h: 10,
    prob24h: 20,
    precip24h: 0,
    aqi: 40,
  };

  test("umbrella comes first when rain risk is high", () => {
    const todos = computeTodos({ ...base, prob6h: 70 });
    expect(todos[0].icon).toBe("☔");
    expect(todos[0].title).toContain("umbrella");
  });

  test("sunscreen appears at high UV", () => {
    const todos = computeTodos({ ...base, uvIndex: 8 });
    expect(todos.some((t) => t.title.toLowerCase().includes("sunscreen"))).toBe(true);
  });

  test("laundry day needs dry air, light wind and no rain", () => {
    expect(
      computeTodos({ ...base, humidity: 40, windSpeed: 12, prob24h: 10 }).some(
        (t) => t.title.includes("laundry"),
      ),
    ).toBe(true);
    expect(
      computeTodos({ ...base, humidity: 40, windSpeed: 12, prob24h: 70 }).some(
        (t) => t.title.includes("laundry"),
      ),
    ).toBe(false);
    expect(
      computeTodos({ ...base, humidity: 80, windSpeed: 12 }).some((t) =>
        t.title.includes("laundry"),
      ),
    ).toBe(false);
  });

  test("frost warning covers the plants near freezing", () => {
    const todos = computeTodos({ ...base, temperature: 0 });
    expect(todos.some((t) => t.title.toLowerCase().includes("plants"))).toBe(true);
  });

  test("aqi alert todo carries an alert payload", () => {
    const todos = computeTodos({ ...base, aqi: 150 });
    const t = todos.find((x) => x.alert);
    expect(t?.alert).toEqual({ type: "aqi", condition: "above", value: 100 });
  });

  test("capped at 4 todos and tolerant of junk input", () => {
    const stormy = computeTodos({
      ...base,
      prob6h: 80,
      uvIndex: 9,
      temperature: 1,
      gusts: 60,
      aqi: 160,
    });
    expect(stormy.length).toBeLessThanOrEqual(4);
    expect(computeTodos(null)).toEqual([]);
    expect(computeTodos({})).toEqual([]);
  });
});

// ── My Places glance ──────────────────────────────────────────────

describe("pickPlaces", () => {
  const home = { name: "Home Base", lat: 19.076, lng: 72.8777 };
  const bookmarks = [
    { name: "Office", lat: 19.11, lng: 72.86 },
    { name: "Mumbai", lat: 19.076, lng: 72.8777 }, // same as home → deduped
    { name: "Pune", lat: 18.52, lng: 73.85 },
    { name: "Broken", lat: null, lng: 0 }, // skipped
  ];

  test("home first, deduped by rounded coords, capped", () => {
    const out = pickPlaces(bookmarks, home, 6);
    expect(out[0].name).toBe("Home Base");
    expect(out.some((p) => p.name === "Mumbai")).toBe(false);
    expect(out).toHaveLength(3);
  });

  test("caps at max and tolerates missing home/bookmarks", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      name: `P${i}`,
      lat: i,
      lng: i,
    }));
    expect(pickPlaces(many, home, 6)).toHaveLength(6);
    // Without home, "Mumbai" is no longer a duplicate — 3 valid places.
    const withoutHome = pickPlaces(bookmarks, null, 6);
    expect(withoutHome).toHaveLength(3);
    expect(withoutHome.some((p) => p.name === "Mumbai")).toBe(true);
    expect(pickPlaces(null, null, 6)).toEqual([]);
  });
});

describe("splitFreshAndStale", () => {
  const places = [
    { name: "A", lat: 1, lng: 1 },
    { name: "B", lat: 2, lng: 2 },
  ];
  const now = Date.now();

  test("fresh hits pass through, stale keys flagged", () => {
    const cache = {
      "1,1": { ts: now - 1000, temp: 24, icon: "☀️" },
      "2,2": { ts: now - 60 * 60 * 1000, temp: 30, icon: "🔥" }, // expired
    };
    const { fresh, staleKeys } = splitFreshAndStale(places, cache, now);
    expect(fresh[0].stale).toBe(false);
    expect(fresh[0].temp).toBe(24);
    expect(fresh[1].stale).toBe(true);
    expect(staleKeys).toEqual(["2,2"]);
  });

  test("places never cached are stale", () => {
    const { staleKeys } = splitFreshAndStale(places, {}, now);
    expect(staleKeys).toHaveLength(2);
  });
});

// ── Daily briefing ────────────────────────────────────────────────

describe("buildBriefingView", () => {
  const data = {
    placeName: "Mumbai",
    temperature: 31,
    feelsLike: 36,
    description: "Partly cloudy",
    icon: "⛅",
    prob6h: 55,
    prob24h: 70,
    firstRainTime: "5:00 PM",
    bestWindow: { startTime: "7:00 AM", endTime: "11:00 AM", hours: 4 },
    todayMax: 33,
    todayMin: 27,
    sunrise: "6:32 AM",
    sunset: "6:15 PM",
    comfort: 58,
    comfortLabel: "Fair",
    advisoryTitle: null,
    aqi: 60,
    goldenLabel: null,
    goldenStart: null,
    goldenEnd: null,
  };

  test("headline leads with rain timing when rain is coming", () => {
    const v = buildBriefingView(data);
    expect(v.headline).toContain("5:00 PM");
    expect(v.bullets.some((b) => b.tone === "warn")).toBe(true);
  });

  test("headline leads with the outdoor window when it's dry", () => {
    const v = buildBriefingView({ ...data, firstRainTime: null, prob6h: 5 });
    expect(v.headline).toContain("7:00 AM");
  });

  test("includes comfort, daylight and the best window", () => {
    const v = buildBriefingView(data);
    const kinds = v.bullets.map((b) => b.k);
    expect(kinds).toContain("Comfort");
    expect(kinds).toContain("Daylight");
    expect(kinds).toContain("Best outdoor window");
  });

  test("surfaces an advisory when present", () => {
    const v = buildBriefingView({ ...data, firstRainTime: null, advisoryTitle: "Heat advisory" });
    expect(v.bullets.some((b) => b.tone === "warn" && b.v === "Heat advisory")).toBe(true);
  });

  test("labels windows that cross midnight as overnight", () => {
    const v = buildBriefingView({
      ...data,
      firstRainTime: null,
      bestWindow: { startTime: "11:00 PM", endTime: "9:00 AM", hours: 10, overnight: true },
    });
    expect(v.headline).toContain("overnight");
    expect(v.bullets.find((b) => b.k === "Best outdoor window").v).toContain("overnight");
  });

  test("handles missing data gracefully", () => {
    const v = buildBriefingView(null);
    expect(v.headline).toContain("unavailable");
    expect(buildBriefingView({})).toBeTruthy();
  });
});

describe("shouldFireNotification", () => {
  const today = "2026-10-16";

  test("fires at/after the preferred hour, once per day", () => {
    expect(shouldFireNotification(null, today, 8, 8)).toBe(true);
    expect(shouldFireNotification(null, today, 9, 8)).toBe(true);
    expect(shouldFireNotification(null, today, 7, 8)).toBe(false);
  });

  test("never fires twice on the same day", () => {
    expect(shouldFireNotification(today, today, 10, 8)).toBe(false);
  });

  test("stops firing far past the window (afternoon catch-up)", () => {
    // Only a 6h window after the preferred hour, so 3pm doesn't fire an 8am brief.
    expect(shouldFireNotification(null, today, 15, 8)).toBe(false);
  });

  test("guards empty inputs", () => {
    expect(shouldFireNotification(null, null, 9, 8)).toBe(false);
  });
});

describe("briefingStoreKey", () => {
  test("scopes to place and day", () => {
    expect(briefingStoreKey("2026-10-16", "mumbai|india")).toBe(
      "aurafisky_briefing_mumbai|india_2026-10-16",
    );
  });
});
