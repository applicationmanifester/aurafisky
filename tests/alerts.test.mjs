// Unit tests for the Weather Alerts feature's pure logic.
// These run without a DOM or the WeatherService global because the exported
// helpers are deliberately side-effect free.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  ALERT_TYPES,
  evaluateRule,
  describeRule,
  severityFor,
  alertMessage,
  normalizeRules,
} from "../features/alerts.js";

test("evaluateRule fires only when the threshold is crossed", () => {
  const above = { type: "temperature", condition: "above", value: 30, enabled: true };
  assert.equal(evaluateRule(above, { temperature: 31 }), true);
  assert.equal(evaluateRule(above, { temperature: 30 }), true); // inclusive
  assert.equal(evaluateRule(above, { temperature: 29 }), false);

  const below = { type: "temperature", condition: "below", value: 5, enabled: true };
  assert.equal(evaluateRule(below, { temperature: 4 }), true);
  assert.equal(evaluateRule(below, { temperature: 5 }), true);
  assert.equal(evaluateRule(below, { temperature: 6 }), false);
});

test("evaluateRule ignores disabled rules and missing metrics", () => {
  const rule = { type: "windSpeed", condition: "above", value: 40, enabled: false };
  assert.equal(evaluateRule(rule, { windSpeed: 90 }), false);

  const on = { ...rule, enabled: true };
  assert.equal(evaluateRule(on, {}), false); // no windSpeed
  assert.equal(evaluateRule(on, { windSpeed: null }), false);
  assert.equal(evaluateRule(on, { windSpeed: NaN }), false);
  assert.equal(evaluateRule(on, { windSpeed: "50" }), false); // non-number
});

test("evaluateRule rejects unknown rule types", () => {
  assert.equal(
    evaluateRule({ type: "earthquake", condition: "above", value: 1 }, { earthquake: 9 }),
    false,
  );
});

test("describeRule renders a readable sentence", () => {
  assert.equal(
    describeRule({ type: "temperature", condition: "below", value: 5 }),
    "Temperature drops below 5°",
  );
  assert.equal(
    describeRule({ type: "windSpeed", condition: "above", value: 50 }),
    "Wind speed rises above 50 km/h",
  );
});

test("severityFor escalates extreme thresholds", () => {
  assert.equal(severityFor({ type: "temperature", condition: "above", value: 42 }), "error");
  assert.equal(severityFor({ type: "temperature", condition: "above", value: 36 }), "warning");
  assert.equal(severityFor({ type: "temperature", condition: "above", value: 20 }), "info");
  assert.equal(severityFor({ type: "windSpeed", condition: "above", value: 90 }), "error");
  assert.equal(severityFor({ type: "aqi", condition: "above", value: 150 }), "warning");
});

test("alertMessage includes the place name when given", () => {
  const rule = { type: "precipProb", condition: "above", value: 70 };
  assert.equal(alertMessage(rule, "Mumbai"), "Mumbai: Rain chance is above 70%");
  assert.equal(alertMessage(rule, ""), "Rain chance is above 70%");
});

test("normalizeRules drops junk and coerces valid entries", () => {
  const raw = [
    { id: "a", type: "temperature", condition: "below", value: "5" },
    { type: "aqi", condition: "nonsense", value: 100 },
    { type: "unknownType", value: 1 },
    { type: "windSpeed", value: "not-a-number" },
    null,
    "garbage",
    { type: "precipProb", condition: "above", value: 60, enabled: false },
  ];
  const rules = normalizeRules(raw);
  assert.equal(rules.length, 3);
  assert.equal(rules[0].value, 5); // string coerced to number
  assert.equal(rules[1].condition, "above"); // invalid condition defaults
  assert.equal(rules[2].enabled, false);
});

test("normalizeRules tolerates non-array input", () => {
  assert.deepEqual(normalizeRules(null), []);
  assert.deepEqual(normalizeRules({}), []);
  assert.deepEqual(normalizeRules("nope"), []);
});

test("ALERT_TYPES exposes bounds for every supported metric", () => {
  for (const key of ["temperature", "precipProb", "windSpeed", "aqi"]) {
    const meta = ALERT_TYPES[key];
    assert.ok(meta, `missing metadata for ${key}`);
    assert.ok(meta.min < meta.max);
    assert.equal(typeof meta.label, "string");
    assert.equal(typeof meta.unit, "string");
  }
});
