// Unit tests for Aura's pure decision logic: the intent classifier, the place
// extractor, the escaping helper, and the action registry's fallback safety.
//
// These run without a DOM or the WeatherService global because everything under
// test is deliberately side-effect free.
import { test, expect, describe } from "vitest";
import {
  classify,
  extractPlace,
  extractTwoPlaces,
  buildCompareSummary,
  detectTimeScope,
  isBareTimeQuery,
  precipTypeFor,
  ACTIONS,
  AuraAssistant,
} from "../features/aura.js";

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
    ["is it good for cycling", "cycling"],
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
    ["should I bike instead", "cycling"],
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

  test("understands Hinglish weather words", () => {
    expect(classify("kya barish hogi")?.id).toBe("rain");
    expect(classify("baarish kab hogi")?.id).toBe("rain");
    expect(classify("kitni thand hai")?.id).toBe("temperature");
    expect(classify("garmi kitni hai")?.id).toBe("temperature");
    expect(classify("tez hawa chal rahi hai")?.id).toBe("wind");
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

  test("understands conversational follow-ups", () => {
    expect(extractPlace("what about Tokyo")).toBe("Tokyo");
    expect(extractPlace("what about Tokyo?")).toBe("Tokyo");
    expect(extractPlace("how about Paris")).toBe("Paris");
  });

  test("never mistakes a time word for a place", () => {
    expect(extractPlace("what about tomorrow")).toBeNull();
    expect(extractPlace("how about tonight?")).toBeNull();
    expect(extractPlace("what about the weekend")).toBeNull();
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

// ── Time scope ────────────────────────────────────────────────────

describe("detectTimeScope", () => {
  test("finds the most specific window", () => {
    expect(detectTimeScope("will it rain tomorrow")?.kind).toBe("tomorrow");
    expect(detectTimeScope("stargazing tonight")?.kind).toBe("tonight");
    expect(detectTimeScope("plan my weekend")?.kind).toBe("weekend");
    expect(detectTimeScope("how windy this morning")?.kind).toBe("morning");
    expect(detectTimeScope("uv this afternoon")?.kind).toBe("afternoon");
    expect(detectTimeScope("dinner in the evening")?.kind).toBe("evening");
  });

  test("weekend outranks vaguer scopes in the same query", () => {
    expect(detectTimeScope("tomorrow or this weekend")?.kind).toBe("weekend");
  });

  test("tonight outranks a bare evening mention", () => {
    expect(detectTimeScope("tonight or this evening")?.kind).toBe("tonight");
  });

  test("returns null when no time language is present", () => {
    expect(detectTimeScope("will it rain")).toBeNull();
    expect(detectTimeScope("plan my day")).toBeNull();
    expect(detectTimeScope("")).toBeNull();
  });
});

describe("isBareTimeQuery", () => {
  test("spots follow-ups that carry only a time scope", () => {
    expect(isBareTimeQuery("and tomorrow?")).toBe(true);
    expect(isBareTimeQuery("what about tonight")).toBe(true);
    expect(isBareTimeQuery("tomorrow")).toBe(true);
    expect(isBareTimeQuery("how about this weekend?")).toBe(true);
  });

  test("rejects queries with real content or nothing at all", () => {
    expect(isBareTimeQuery("will it rain tomorrow")).toBe(false);
    expect(isBareTimeQuery("hi")).toBe(false);
    expect(isBareTimeQuery("")).toBe(false);
    expect(isBareTimeQuery("and the wind?")).toBe(false);
  });
});

// ── Precipitation type ────────────────────────────────────────────

describe("precipTypeFor", () => {
  test("reads WMO codes before temperature", () => {
    expect(precipTypeFor(71, 5)).toBe("snow");
    expect(precipTypeFor(85, 2)).toBe("snow");
    expect(precipTypeFor(95, 20)).toBe("storm");
    expect(precipTypeFor(61, 20)).toBe("rain");
    expect(precipTypeFor(0, 20)).toBe("none");
  });

  test("calls rain near freezing a wintry mix", () => {
    expect(precipTypeFor(61, 0)).toBe("mix");
    expect(precipTypeFor(80, -2)).toBe("mix");
  });

  test("handles missing data without throwing", () => {
    expect(precipTypeFor(null, 20)).toBe("none");
    expect(precipTypeFor(undefined, undefined)).toBe("none");
    expect(precipTypeFor(61, null)).toBe("rain");
  });
});

// ── Conversation memory ───────────────────────────────────────────

describe("_resolveIntent", () => {
  // Bypass the constructor (it touches the DOM in jsdom) — the method
  // under test only reads this._lastIntent.
  const assistant = (lastIntent) =>
    Object.assign(Object.create(AuraAssistant.prototype), { _lastIntent: lastIntent });

  test("re-runs the previous intent for bare time follow-ups", () => {
    const r = assistant("rain")._resolveIntent("and tomorrow?");
    expect(r.match.id).toBe("rain");
    expect(r.match.viaMemory).toBe(true);
    expect(r.scope?.kind).toBe("tomorrow");
  });

  test("classifies fresh when there is no thread to continue", () => {
    const r = assistant(null)._resolveIntent("and tomorrow?");
    expect(r.match.id).toBe("forecast"); // "tomorrow" is a forecast phrase
    expect(r.match.viaMemory).toBeUndefined();
  });

  test("classifies fresh when the query has real content", () => {
    const r = assistant("rain")._resolveIntent("how windy is it");
    expect(r.match.id).toBe("wind");
  });

  test("does not re-run intents that gain nothing from a scope", () => {
    const r = assistant("help")._resolveIntent("and tomorrow?");
    expect(r.match.id).toBe("forecast");
  });

  test("still reports the scope alongside a fresh classification", () => {
    const r = assistant(null)._resolveIntent("will it rain tonight");
    expect(r.match.id).toBe("rain");
    expect(r.scope?.kind).toBe("tonight");
  });
});

// ── Two-city comparison ───────────────────────────────────────────

describe("extractTwoPlaces", () => {
  test("handles the common phrasings", () => {
    expect(extractTwoPlaces("delhi vs mumbai")).toEqual({ a: "delhi", b: "mumbai" });
    expect(extractTwoPlaces("Delhi versus Mumbai")).toEqual({ a: "Delhi", b: "Mumbai" });
    expect(extractTwoPlaces("compare Delhi and Mumbai")).toEqual({ a: "Delhi", b: "Mumbai" });
    expect(extractTwoPlaces("difference between Tokyo and Osaka")).toEqual({
      a: "Tokyo",
      b: "Osaka",
    });
    expect(extractTwoPlaces("weather in Paris vs London?")).toEqual({ a: "Paris", b: "London" });
  });

  test("returns null for non-comparison queries", () => {
    expect(extractTwoPlaces("will it rain")).toBeNull();
    expect(extractTwoPlaces("weather in Tokyo")).toBeNull();
    expect(extractTwoPlaces("")).toBeNull();
    expect(extractTwoPlaces("compare")).toBeNull();
  });
});

describe("buildCompareSummary", () => {
  const snap = (over) => ({
    name: "A",
    temperature: 20,
    feelsLike: 19,
    description: "Clear sky",
    icon: "☀️",
    humidity: 50,
    windSpeed: 10,
    windGusts: 15,
    windDirection: 180,
    prob6h: 10,
    prob24h: 20,
    todayMax: 24,
    todayMin: 14,
    ...over,
  });

  test("calls out the warmer city", () => {
    const { verdict } = buildCompareSummary(
      snap({ name: "Delhi", temperature: 34, feelsLike: 36 }),
      snap({ name: "Mumbai", temperature: 28, feelsLike: 31 }),
    );
    expect(verdict).toContain("Delhi is 6° warmer");
  });

  test("calls out the wetter city when the gap is meaningful", () => {
    const { verdict, bullets } = buildCompareSummary(
      snap({ name: "Mumbai", prob6h: 80, prob24h: 90 }),
      snap({ name: "Delhi", prob6h: 10, prob24h: 15 }),
    );
    expect(verdict).toContain("Mumbai is 70% wetter");
    expect(bullets.some((b) => b.tone === "warn")).toBe(true);
  });

  test("recommends the drier, milder city for outdoor plans", () => {
    const { verdict } = buildCompareSummary(
      snap({ name: "A", temperature: 22, prob6h: 5, windSpeed: 5 }),
      snap({ name: "B", temperature: 22, prob6h: 70, windSpeed: 40 }),
    );
    expect(verdict).toContain("A looks the better call");
  });

  test("both bullets name both cities' values", () => {
    const { bullets } = buildCompareSummary(
      snap({ name: "X", temperature: 30 }),
      snap({ name: "Y", temperature: 10 }),
    );
    const now = bullets.find((b) => b.k === "Now");
    expect(now.v).toContain("30°");
    expect(now.v).toContain("10°");
  });
});