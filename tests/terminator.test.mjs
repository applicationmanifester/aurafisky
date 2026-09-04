// Runs under Vitest
import { test } from "vitest";
import assert from "node:assert/strict";
import {
  _parseToUtcDate,
  _solarPosition,
  _terminatorLat,
  _buildNightRings,
} from "../features/terminator.js";

test("_parseToUtcDate correctly handles naive ISO string with timezone offset", () => {
  // Chad: 2026-09-04T06:00 with UTC+1 (+3600 seconds)
  const dChad = _parseToUtcDate("2026-09-04T06:00", 3600);
  assert.equal(dChad.toISOString(), "2026-09-04T05:00:00.000Z");

  // New York EDT: 2026-09-04T12:00 with UTC-4 (-14400 seconds)
  const dNYC = _parseToUtcDate("2026-09-04T12:00", -14400);
  assert.equal(dNYC.toISOString(), "2026-09-04T16:00:00.000Z");

  // ISO string with explicit Z
  const dZ = _parseToUtcDate("2026-09-04T05:00:00Z", 0);
  assert.equal(dZ.toISOString(), "2026-09-04T05:00:00.000Z");

  // Date instance
  const directDate = new Date("2026-09-04T05:00:00Z");
  assert.equal(_parseToUtcDate(directDate).getTime(), directDate.getTime());
});

test("_solarPosition calculates realistic subsolar coordinates", () => {
  // At 05:00 UTC, the subsolar meridian should be around 105°E (Southeast Asia / Thailand / Indochina)
  const dChadUtc = new Date("2026-09-04T05:00:00Z");
  const { decDeg, subsolarLng } = _solarPosition(dChadUtc);

  // Early September: declination is positive (Northern hemisphere summer/autumn transition, ~7.5°)
  assert.ok(decDeg > 6 && decDeg < 9, `Expected declination between 6° and 9°, got ${decDeg}`);
  assert.ok(
    subsolarLng > 100 && subsolarLng < 110,
    `Expected subsolarLng around 105°E, got ${subsolarLng}`
  );
});

test("_terminatorLat clamps safely to Web Mercator bounds and avoids singularity", () => {
  // Equinox edge case (dec = 0)
  const latEquinoxNoon = _terminatorLat(0, 0, 0);
  const latEquinoxMidnight = _terminatorLat(180, 0, 0);
  assert.ok(latEquinoxNoon <= -85 && latEquinoxNoon >= -85);
  assert.ok(latEquinoxMidnight <= 85 && latEquinoxMidnight >= 85);

  // General latitude is clamped within [-85, 85]
  const latGeneral = _terminatorLat(45, 15, 0);
  assert.ok(latGeneral >= -85 && latGeneral <= 85);
  assert.ok(!Number.isNaN(latGeneral));
});

test("_buildNightRings generates 7 closed, non-NaN rings covering the night hemisphere", () => {
  const dChadUtc = new Date("2026-09-04T05:00:00Z");
  const rings = _buildNightRings(dChadUtc);

  // 7 world offsets for continuous scrolling
  assert.equal(rings.length, 7);

  for (const ring of rings) {
    assert.ok(ring.length > 50, "Ring should have sufficient sample points");
    // Ensure all coordinates are valid finite numbers
    for (const [lng, lat] of ring) {
      assert.ok(Number.isFinite(lng), `Longitude ${lng} must be finite`);
      assert.ok(Number.isFinite(lat), `Latitude ${lat} must be finite`);
      assert.ok(lat >= -85 && lat <= 85, `Latitude ${lat} must be within [-85, 85]`);
    }

    // Must be a closed linear ring: first coordinate equals last coordinate
    const first = ring[0];
    const last = ring[ring.length - 1];
    assert.equal(first[0], last[0], "Ring must close in longitude");
    assert.equal(first[1], last[1], "Ring must close in latitude");
  }
});
