// Unit tests for the enhanced location search helpers in weather.js.
// These exercise the pure ranking / formatting logic without any network.
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { WeatherService } from "../weather.js";

const {
  getCountryFlag,
  getFeatureLabel,
  formatPopulation,
  rankAndDedupeResults,
} = WeatherService;

describe("getCountryFlag", () => {
  test("converts ISO-3166 alpha-2 codes to flag emoji", () => {
    assert.equal(getCountryFlag("GB"), "🇬🇧");
    assert.equal(getCountryFlag("US"), "🇺🇸");
    assert.equal(getCountryFlag("IN"), "🇮🇳");
  });

  test("is case-insensitive", () => {
    assert.equal(getCountryFlag("gb"), "🇬🇧");
    assert.equal(getCountryFlag("jp"), "🇯🇵");
  });

  test("falls back to a pin for full country names", () => {
    // Full names cannot be mapped without a lookup table — the geocoder
    // supplies ISO codes, so names must degrade gracefully.
    assert.equal(getCountryFlag("United Kingdom"), "📍");
    assert.equal(getCountryFlag("Coordinates"), "📍");
  });

  test("falls back to a pin for missing or invalid input", () => {
    assert.equal(getCountryFlag(""), "📍");
    assert.equal(getCountryFlag(null), "📍");
    assert.equal(getCountryFlag(undefined), "📍");
    assert.equal(getCountryFlag("USA"), "📍"); // 3-letter codes unsupported
    assert.equal(getCountryFlag("G1"), "📍"); // non-alpha
  });
});

describe("getFeatureLabel", () => {
  test("maps GeoNames feature codes to human labels", () => {
    assert.equal(getFeatureLabel("PPLC"), "Capital");
    assert.equal(getFeatureLabel("PPL"), "City");
    assert.equal(getFeatureLabel("PPLL"), "Village");
    assert.equal(getFeatureLabel("ISL"), "Island");
    assert.equal(getFeatureLabel("MT"), "Mountain");
    assert.equal(getFeatureLabel("AIRP"), "Airport");
  });

  test("returns empty string for unknown or missing codes", () => {
    assert.equal(getFeatureLabel("ZZZZ"), "");
    assert.equal(getFeatureLabel(""), "");
    assert.equal(getFeatureLabel(null), "");
    assert.equal(getFeatureLabel(undefined), "");
  });
});

describe("formatPopulation", () => {
  test("formats millions with one decimal", () => {
    assert.equal(formatPopulation(8808000), "8.8M");
    assert.equal(formatPopulation(2161000), "2.2M");
  });

  test("rounds to whole millions at 10M+", () => {
    assert.equal(formatPopulation(14047000), "14M");
    assert.equal(formatPopulation(12440000), "12M");
  });

  test("formats thousands compactly", () => {
    assert.equal(formatPopulation(940000), "940k");
    assert.equal(formatPopulation(1000), "1k");
  });

  test("returns empty for small or missing values", () => {
    assert.equal(formatPopulation(999), "");
    assert.equal(formatPopulation(0), "");
    assert.equal(formatPopulation(null), "");
    assert.equal(formatPopulation(undefined), "");
  });
});

describe("rankAndDedupeResults", () => {
  const mk = (name, admin1, country, extra = {}) => ({
    name,
    admin1,
    country,
    latitude: 10,
    longitude: 10,
    ...extra,
  });

  test("removes duplicates by name + region + country", () => {
    const results = [
      mk("London", "England", "United Kingdom", { latitude: 51.5 }),
      mk("London", "England", "United Kingdom", { latitude: 51.501 }),
      mk("London", "Ontario", "Canada"),
    ];
    const out = rankAndDedupeResults(results, "London");
    assert.equal(out.length, 2);
  });

  test("ranks a prefix match on a megacity above an exact match on a tiny hamlet", () => {
    // Typing "lon" should surface London, not the village of Lon.
    const results = [
      mk("Lon", "Ratanakiri", "Cambodia", { population: null }),
      mk("London", "England", "United Kingdom", { population: 8900000 }),
    ];
    const out = rankAndDedupeResults(results, "lon");
    assert.equal(out[0].name, "London");
  });

  test("exact match still wins when populations are comparable", () => {
    const results = [
      mk("London", "Ontario", "Canada", { population: 500000 }),
      mk("Londontown", "Maryland", "United States", { population: 8900000 }),
    ];
    const out = rankAndDedupeResults(results, "London");
    assert.equal(out[0].name, "London");
  });

  test("breaks ties by population", () => {
    const results = [
      mk("Springfield", "Illinois", "United States", { population: 110000 }),
      mk("Springfield", "Missouri", "United States", { population: 160000 }),
    ];
    const out = rankAndDedupeResults(results, "Springfield");
    assert.equal(out[0].admin1, "Missouri");
  });

  test("boosts capital cities", () => {
    const results = [
      mk("Paris", "Texas", "United States", { population: 25000 }),
      mk("Paris", "Île-de-France", "France", {
        population: 2100000,
        featureCode: "PPLC",
      }),
    ];
    const out = rankAndDedupeResults(results, "Paris");
    assert.equal(out[0].country, "France");
  });

  test("drops entries without coordinates", () => {
    const results = [
      { name: "Broken", admin1: "", country: "", latitude: null, longitude: null },
      mk("Fine", "", ""),
    ];
    const out = rankAndDedupeResults(results, "x");
    assert.equal(out.length, 1);
    assert.equal(out[0].name, "Fine");
  });

  test("handles empty input", () => {
    assert.deepEqual(rankAndDedupeResults([], "London"), []);
    assert.deepEqual(rankAndDedupeResults(null, "London"), []);
  });
});
