// Unit tests for the proactive rain push feature's pure logic.
// No DOM, no notifications, no WeatherService — just the forecast scanner,
// the rate-limit gate and the message builder.
import { test, expect, describe } from "vitest";
import {
  findRainArrival,
  shouldNotifyRain,
  rainPushMessage,
} from "../features/rainPush.js";

// ── fixtures ──
const hourly = (mm, prob, hours = 12) => ({
  time: Array.from({ length: hours }, (_, i) => `2026-10-16T${String(i).padStart(2, "0")}:00`),
  precipitation: mm,
  precipitation_probability: prob,
});

const HOUR = 60 * 60 * 1000;

describe("findRainArrival", () => {
  test("finds the first wet hour after a dry prefix", () => {
    const mm = [0, 0, 0, 0.5, 0.6];
    const prob = [0, 0, 0, 70, 80];
    const a = findRainArrival(hourly(mm, prob), 0);
    expect(a).not.toBeNull();
    expect(a.index).toBe(3);
    expect(a.hoursAway).toBe(3);
    expect(a.prob).toBe(70);
  });

  test("probability alone can mark an arrival", () => {
    const a = findRainArrival(hourly([0, 0, 0], [0, 0, 65]), 0);
    expect(a).not.toBeNull();
    expect(a.index).toBe(2);
    expect(a.mm).toBe(0);
  });

  test("returns null when the window stays dry", () => {
    expect(findRainArrival(hourly([0, 0, 0, 0], [5, 10, 20, 30]), 0)).toBeNull();
    expect(findRainArrival(hourly([], []), 0)).toBeNull();
  });

  test("respects the lookahead window", () => {
    // Rain at +8h, but window is 6h → not visible.
    const mm = [0, 0, 0, 0, 0, 0, 0, 0, 0.5];
    const prob = [0, 0, 0, 0, 0, 0, 0, 0, 70];
    expect(findRainArrival(hourly(mm, prob), 0, { windowH: 6 })).toBeNull();
    expect(findRainArrival(hourly(mm, prob), 0, { windowH: 9 }).index).toBe(8);
  });

  test("flags rain happening right now", () => {
    const a = findRainArrival(hourly([0.4, 0.5, 0.5], [80, 80, 80]), 0);
    expect(a.rainingNow).toBe(true);
    expect(a.hoursAway).toBe(0);
  });

  test("tolerates junk input", () => {
    expect(findRainArrival(null, 0)).toBeNull();
    expect(findRainArrival({}, 0)).toBeNull();
    expect(findRainArrival(hourly([0.5], [80]), NaN)).toBeNull();
  });
});

describe("shouldNotifyRain", () => {
  const arrival = { index: 3, hoursAway: 3, prob: 70, mm: 0.5, rainingNow: false };

  test("fires when there is no prior notification", () => {
    expect(shouldNotifyRain(arrival, undefined, Date.now())).toBe(true);
    expect(shouldNotifyRain(arrival, null, Date.now())).toBe(true);
  });

  test("holds the cooldown after a recent push", () => {
    const now = Date.now();
    expect(shouldNotifyRain(arrival, now - 1 * HOUR, now)).toBe(false);
    expect(shouldNotifyRain(arrival, now - 7 * HOUR, now)).toBe(true);
  });

  test("never fires without an arrival", () => {
    expect(shouldNotifyRain(null, undefined, Date.now())).toBe(false);
  });

  test("honours a custom cooldown", () => {
    const now = Date.now();
    expect(shouldNotifyRain(arrival, now - 30 * 60 * 1000, now, 20 * 60 * 1000)).toBe(true);
  });
});

describe("rainPushMessage", () => {
  test("describes an upcoming arrival with time and chance", () => {
    const msg = rainPushMessage(
      { index: 5, hoursAway: 2, prob: 70, mm: 1.2, rainingNow: false, time: "x" },
      "Mumbai",
    );
    expect(msg).toContain("Mumbai:");
    expect(msg).toContain("in ~2h");
    expect(msg).toContain("70%");
    expect(msg).toContain("1.2 mm");
    expect(msg.toLowerCase()).toContain("umbrella");
  });

  test("uses 'within the hour' for imminent rain", () => {
    const msg = rainPushMessage(
      { hoursAway: 1, prob: 65, mm: 0.3, rainingNow: false },
      "Pune",
    );
    expect(msg).toContain("within the hour");
  });

  test("has a distinct raining-now phrasing", () => {
    const msg = rainPushMessage({ hoursAway: 0, prob: 85, mm: 2, rainingNow: true }, "Goa");
    expect(msg).toContain("raining now");
  });

  test("handles a missing place name", () => {
    const msg = rainPushMessage({ hoursAway: 2, prob: 60, mm: 0.5, rainingNow: false }, "");
    expect(msg.startsWith("in ~2h")).toBe(true);
  });

  test("empty arrival yields an empty string", () => {
    expect(rainPushMessage(null, "X")).toBe("");
  });
});
