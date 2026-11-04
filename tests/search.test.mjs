// Unit tests for the enhanced location search helpers in weather.js and app search UX.
import { test, describe } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
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

describe("Search UI Structure & Category Filter Bar", () => {
  test("index.html contains searchFilterBar with all, favorites, recents, and popular chips", () => {
    const html = fs.readFileSync("index.html", "utf8");
    assert.ok(html.includes('id="searchFilterBar"'), "searchFilterBar element exists");
    assert.ok(html.includes('data-filter="all"'), "All filter chip exists");
    assert.ok(html.includes('data-filter="favorites"'), "Saved favorites filter chip exists");
    assert.ok(html.includes('data-filter="recents"'), "Recents filter chip exists");
    assert.ok(html.includes('data-filter="popular"'), "Popular filter chip exists");
  });

  test("styles.css contains rules for search-filter-bar, shortcuts grid, and action buttons", () => {
    const css = fs.readFileSync("styles.css", "utf8");
    assert.ok(css.includes(".search-filter-bar"), "Styles search-filter-bar");
    assert.ok(css.includes(".search-filter-chip.active"), "Styles active search-filter-chip");
    assert.ok(css.includes(".search-shortcuts-grid"), "Styles search-shortcuts-grid");
    assert.ok(css.includes(".search-action-btn"), "Styles search-action-btn");
    assert.ok(css.includes(".search-temp-badge"), "Styles search-temp-badge");
  });

  test("app.js implements removeFromSearchHistory, clearSearchHistory, and setSearchFilter", () => {
    const appCode = fs.readFileSync("app.js", "utf8");
    assert.ok(appCode.includes("removeFromSearchHistory("), "Implements removeFromSearchHistory");
    assert.ok(appCode.includes("clearSearchHistory("), "Implements clearSearchHistory");
    assert.ok(appCode.includes("setSearchFilter("), "Implements setSearchFilter");
    assert.ok(appCode.includes("_renderSearchShortcuts("), "Implements _renderSearchShortcuts");
    assert.ok(appCode.includes("_getCachedTempForLocation("), "Implements _getCachedTempForLocation");
  });
});

describe("Coordinate Query Matching", () => {
  const coordRegex = /^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/;

  test("matches comma-separated decimal coordinates", () => {
    const match = "40.7128, -74.0060".match(coordRegex);
    assert.ok(match);
    assert.equal(parseFloat(match[1]), 40.7128);
    assert.equal(parseFloat(match[2]), -74.006);
  });

  test("matches space-separated decimal coordinates", () => {
    const match = "12.9716 77.5946".match(coordRegex);
    assert.ok(match);
    assert.equal(parseFloat(match[1]), 12.9716);
    assert.equal(parseFloat(match[2]), 77.5946);
  });

  test("does not match non-coordinate place names", () => {
    assert.equal("Tokyo, Japan".match(coordRegex), null);
    assert.equal("London 10 Downing".match(coordRegex), null);
  });
});
