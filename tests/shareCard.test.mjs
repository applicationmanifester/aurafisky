// Unit tests for the Share-as-Image feature's pure helpers.
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  pickGradient,
  conditionEmoji,
  buildStatItems,
  formatCardDate,
  buildCardModel,
  CARD_WIDTH,
  CARD_HEIGHT,
} from "../features/shareCard.js";

test("pickGradient maps weather codes to distinct palettes", () => {
  const clear = pickGradient(0);
  const rain = pickGradient(63);
  const storm = pickGradient(95);
  assert.notEqual(clear.from, rain.from);
  assert.equal(storm.dark, true); // storm palette is dark → white text
  assert.ok(/^#/.test(clear.from));
});

test("pickGradient falls back safely for unknown codes", () => {
  const g = pickGradient(NaN);
  assert.ok(g && typeof g.from === "string" && typeof g.to === "string");
});

test("conditionEmoji is day/night aware for clear skies", () => {
  assert.equal(conditionEmoji(0, true), "☀️");
  assert.equal(conditionEmoji(0, false), "🌙");
  assert.equal(conditionEmoji(63), "🌧️");
  assert.equal(conditionEmoji(95), "⛈️");
});

test("buildStatItems produces at most four labelled chips", () => {
  const items = buildStatItems(
    { feelsLike: 28, humidity: 64, windSpeed: 12, precipProb: 30 },
    { temp: (n) => `${n}°`, wind: (n) => `${n} km/h` },
  );
  assert.equal(items.length, 4);
  assert.deepEqual(items[0], { label: "Feels like", value: "28°" });
  assert.deepEqual(items[3], { label: "Rain", value: "30%" });
});

test("buildStatItems omits missing metrics and uses defaults without fmt", () => {
  const items = buildStatItems({ humidity: 50 });
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], { label: "Humidity", value: "50%" });
});

test("formatCardDate renders a stable, human string", () => {
  const d = new Date(2026, 8, 25, 13, 7); // Fri 25 Sep 2026, 1:07 PM
  const s = formatCardDate(d);
  assert.ok(s.startsWith("Fri, 25 Sep"));
  assert.ok(s.includes("1:07 PM"));
});

test("formatCardDate returns empty string for invalid dates", () => {
  assert.equal(formatCardDate("not-a-date"), "");
});

test("buildCardModel assembles a complete draw model", () => {
  const model = buildCardModel({
    placeName: "Mumbai",
    timeLabel: "Fri, 25 Sep · 1:37 AM",
    weather: {
      weatherCode: 63,
      isDay: true,
      tempText: "27°C",
      description: "Moderate rain",
      feelsLike: 30,
      humidity: 80,
      windSpeed: 15,
      precipProb: 90,
    },
    daily: [
      { label: "Mon", weatherCode: 0, maxText: "31°C", minText: "24°C" },
      { label: "Tue", weatherCode: 63, maxText: "29°C", minText: "23°C" },
    ],
  });
  assert.equal(model.placeName, "Mumbai");
  assert.equal(model.width, CARD_WIDTH);
  assert.equal(model.height, CARD_HEIGHT);
  assert.equal(model.days.length, 2);
  assert.equal(model.days[0].emoji, "☀️");
  assert.equal(model.stats.length, 4);
});

test("buildCardModel caps the day strip at seven days", () => {
  const daily = Array.from({ length: 12 }, (_, i) => ({ label: `D${i}`, weatherCode: i }));
  const model = buildCardModel({ placeName: "X", weather: {}, daily });
  assert.equal(model.days.length, 7);
});

test("buildCardModel preserves full 24 hours for hourly forecast", () => {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    label: `${i % 12 || 12}${i >= 12 ? "p" : "a"}`,
    weatherCode: 0,
    tempText: `${20 + (i % 5)}°C`,
    precipProb: i % 2 === 0 ? 10 : 0,
  }));
  const model = buildCardModel({
    placeName: "Simpson",
    variant: "hourly",
    weather: { weatherCode: 0, tempText: "22°C" },
    hours,
  });
  assert.equal(model.variant, "hourly");
  assert.equal(model.forecastTitle, "NEXT 24 HOURS");
  assert.equal(model.hours.length, 24);
  assert.equal(model.hours[0].label, "12a");
  assert.equal(model.hours[23].label, "11p");
});
