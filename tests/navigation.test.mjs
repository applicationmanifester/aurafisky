// Runs under Vitest (see vitest.config.ts `include`).
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  haversineMeters,
  bearingDegrees,
  distanceToRouteMeters,
  formatNavDistance,
  formatNavDuration,
  maneuverText,
  maneuverIcon,
} from "../features/navigation.js";

test("haversineMeters returns ~0 for identical points", () => {
  assert.ok(haversineMeters(51.5, -0.1, 51.5, -0.1) < 1);
});

test("haversineMeters returns a sane distance for a known short hop", () => {
  // Roughly 1.11 km per 0.01 degree of latitude.
  const d = haversineMeters(51.5, -0.1, 51.51, -0.1);
  assert.ok(d > 1000 && d < 1200, `expected ~1110m, got ${d}`);
});

test("bearingDegrees points due north as ~0", () => {
  const b = bearingDegrees(0, 0, 1, 0);
  assert.ok(Math.abs(b) < 1, `expected ~0, got ${b}`);
});

test("bearingDegrees points due east as ~90", () => {
  const b = bearingDegrees(0, 0, 0, 1);
  assert.ok(Math.abs(b - 90) < 1, `expected ~90, got ${b}`);
});

test("distanceToRouteMeters is ~0 for a point on the route", () => {
  const route = [
    [-0.1, 51.5],
    [-0.09, 51.5],
  ];
  const d = distanceToRouteMeters(51.5, -0.095, route);
  assert.ok(d < 5, `expected near 0, got ${d}`);
});

test("distanceToRouteMeters is large for a point far from the route", () => {
  const route = [
    [-0.1, 51.5],
    [-0.09, 51.5],
  ];
  const d = distanceToRouteMeters(51.6, -0.095, route);
  assert.ok(d > 5000, `expected a large distance, got ${d}`);
});

test("distanceToRouteMeters returns Infinity for a degenerate route", () => {
  assert.equal(distanceToRouteMeters(0, 0, []), Infinity);
  assert.equal(distanceToRouteMeters(0, 0, [[0, 0]]), Infinity);
});

test("formatNavDistance uses meters below 1km, km above", () => {
  assert.equal(formatNavDistance(150), "150 m");
  assert.equal(formatNavDistance(1500), "1.5 km");
  assert.equal(formatNavDistance(null), "--");
});

test("formatNavDuration switches from minutes to hours+minutes", () => {
  assert.equal(formatNavDuration(300), "5 min");
  assert.equal(formatNavDuration(5400), "1h 30m");
  assert.equal(formatNavDuration(undefined), "--");
});

test("maneuverText phrases a turn with the street name", () => {
  const text = maneuverText({
    maneuver: { type: "turn", modifier: "left" },
    name: "Main Street",
  });
  assert.equal(text, "Turn left onto Main Street");
});

test("maneuverText phrases arrival distinctly", () => {
  assert.equal(
    maneuverText({ maneuver: { type: "arrive" }, name: "" }),
    "You have arrived at your destination",
  );
  assert.equal(
    maneuverText({ maneuver: { type: "arrive", modifier: "right" }, name: "" }),
    "Arrive — your destination is on the right",
  );
});

test("maneuverText falls back to a generic continue for unknown types", () => {
  assert.equal(
    maneuverText({ maneuver: { type: "some future osrm type" }, name: "Elm St" }),
    "Continue on Elm St",
  );
});

test("maneuverIcon maps modifiers to arrows and special-cases arrive/depart", () => {
  assert.equal(maneuverIcon({ type: "arrive" }), "🏁");
  assert.equal(maneuverIcon({ type: "depart" }), "🚗");
  assert.equal(maneuverIcon({ type: "turn", modifier: "left" }), "⬅️");
  assert.equal(maneuverIcon({ type: "roundabout" }), "🔄");
});
