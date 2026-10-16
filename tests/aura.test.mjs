// Unit tests for Aura's pure decision logic: the intent classifier, the place
// extractor, the escaping helper, and the action registry's fallback safety.
//
// These run without a DOM or the WeatherService global because everything under
// test is deliberately side-effect free.
import { test, expect, describe } from "vitest";
import { classify, extractPlace, ACTIONS } from "../features/aura.js";

// ── Intent classification ───────────────────────────────────────────

describe("classify", () => {
  const cases = [
    ["will it rain", "rain"],
    ["should I carry an umbrella", "rain"],
    ["is it going to drizzle tonight", "rain"],
    ["how is traffic on my commute", "commute"],
    ["should I drive or take the train", "commute"],
    ["road grip on the highway", "commute"],
    ["can I go for a run", "outdoor"],
    ["best time for a workout today", "outdoor"],
    ["is it good for cycling", "outdoor"],
    ["restaurant recommendations nearby", "dining"],
    ["where should I have dinner", "dining"],
    ["good coffee place", "dining"],
    ["is the air quality bad", "air"],
    ["should I wear sunscreen", "uv"],
    ["when is sunset tonight", "astronomy"],
    ["stargazing tonight", "astronomy"],
    ["when is golden hour", "astronomy"],
    ["plan my day", "plan"],
    ["what should I do this weekend", "plan"],
    ["what's the 7 day forecast", "forecast"],
    ["notify me if it rains", "alert"],
    ["alert me when AQI goes above 100", "alert"],
    ["show me the radar", "layers"],
    ["how windy is it", "wind"],
    ["is there a thunderstorm", "thunderstorm"],
    ["how humid is it", "humidity"],
    ["how hot is it", "temperature"],
    ["how bad is the visibility", "visibility"],
    ["what can you do", "help"],
    ["help", "help"],
    ["who are you", "help"],
    ["hi", "greeting"],
    ["hello there", "greeting"],
  ];

  // Natural phrasings that previously fell through to the generic fallback.
  for (const [query, expected] of [
    ["is the air safe", "air"],
    ["safe to breathe outside", "air"],
    ["should I bring a jacket", "clothing"],
    ["what should I wear", "clothing"],
    ["is it good for solar panels", "solar"],
    ["pollen count today", "pollen"],
    ["is there flood risk", "hazard"],
    ["is it nice out", "overview"],
    ["is it going to pour", "rain"],
    ["should I bike instead", "outdoor"],
    ["is it good for photos", "astronomy"],
    ["any good cafes nearby", "dining"],
    ["will it freeze", "temperature"],
    ["what time does the sun set", "astronomy"],
    ["feels hotter than it is", "temperature"],
  ]) {
    cases.push([query, expected]);
  }

  for (const [query, expected] of cases) {
    test(`"${query}" → ${expected}`, () => {
      expect(classify(query)?.id).toBe(expected);
    });
  }

  test("returns null when nothing matches so the fallback can answer", () => {
    expect(classify("zzzz qqqq")).toBeNull();
    expect(classify("")).toBeNull();
  });

  test("single words respect word boundaries", () => {
    // "rain" must not fire inside "drain"/"training".
    expect(classify("drain the training pool")?.id).not.toBe("rain");
  });

  test("single words accept -s/-ing inflections", () => {
    expect(classify("any good cafes nearby")?.id).toBe("dining");
    expect(classify("is it good for photos")?.id).toBe("astronomy");
    expect(classify("what should I wear")?.id).toBe("clothing");
  });

  test("short words are NOT inflected (so 'hi' can't match 'his')", () => {
    // 'hi' is 2 chars and 'uv' is 2 — both matched literally by design.
    expect(classify("his forecast")?.id).not.toBe("greeting");
  });

  test("multi-word phrases outrank bare keywords", () => {
    // "best outdoor window" (3) must beat the bare word "outdoor" (2).
    expect(classify("best outdoor window")?.id).toBe("outdoor");
    expect(classify("what should i do")?.id).toBe("plan");
  });

  test("higher priority breaks an exact score tie", () => {
    // "thunder" (2) and "wind" (2) tie; thunderstorm outranks wind.
    expect(classify("thunder and wind tonight")?.id).toBe("thunderstorm");
    // "storm" is a wind keyword, not a thunderstorm one.
    expect(classify("is there a storm coming")?.id).toBe("wind");
  });
});

// ── Place extraction ────────────────────────────────────────────────

describe("extractPlace", () => {
  const cases = [
    ["weather in Tokyo", "Tokyo"],
    ["what's the weather in Tokyo tomorrow?", "Tokyo"],
    ["how is it in New York", "New York"],
    ["forecast for San Francisco", "San Francisco"],
    ["weather in St. Petersburg", "St. Petersburg"],
  ];

  for (const [query, expected] of cases) {
    test(`"${query}" → "${expected}"`, () => {
      expect(extractPlace(query)).toBe(expected);
    });
  }

  test("returns null when no place is named", () => {
    expect(extractPlace("will it rain")).toBeNull();
    expect(extractPlace("plan my day")).toBeNull();
  });

  test("does not swallow a trailing time word", () => {
    expect(extractPlace("weather in Tokyo tomorrow")).not.toContain("tomorrow");
  });
});

// ── Action registry ─────────────────────────────────────────────────

describe("ACTIONS", () => {
  test("every action has a label and a runner", () => {
    for (const [id, def] of Object.entries(ACTIONS)) {
      expect(typeof def.run, `${id}.run`).toBe("function");
      expect(def.label, `${id}.label`).toBeTruthy();
    }
  });

  test("every action tolerates a bare app object (optional-chained)", () => {
    // Aura must never throw when a feature module hasn't attached its method.
    for (const [id, def] of Object.entries(ACTIONS)) {
      expect(() => def.run({}, {}, {}), id).not.toThrow();
    }
  });

  test("the alert action forwards its payload to addAlertRule", () => {
    const calls = [];
    const app = { addAlertRule: (...args) => calls.push(args) };
    ACTIONS.alert.run(app, { type: "precipProb", condition: "above", value: 60 }, {});
    expect(calls).toEqual([["precipProb", "above", 60]]);
  });
});