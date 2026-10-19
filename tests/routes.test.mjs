// Tests for Route Studio (features/routes.js)
import { test, expect } from "vitest";
import assert from "node:assert/strict";
import {
  formatRouteDistance,
  formatRouteDuration,
  calculateETAs,
  detectWeatherHazards,
  generateGPX,
  generateGeoJSON,
  calculateModeDuration,
  interpolateGreatCircle,
  calculateBearing,
  bearingToCompass,
  calculateRelativeWind,
  solve2OptTSP,
  generateAuraCopilotBriefing,
} from "../features/routes.js";

test("formatRouteDistance correctly formats metric and imperial values", () => {
  assert.equal(formatRouteDistance(500, "metric"), "500 m");
  assert.equal(formatRouteDistance(12500, "metric"), "12.5 km");
  assert.equal(formatRouteDistance(1609.34, "imperial"), "1.0 mi");
  assert.equal(formatRouteDistance(32186.8, "imperial"), "20.0 mi");
  assert.equal(formatRouteDistance(null, "metric"), "--");
  assert.equal(formatRouteDistance(undefined, "imperial"), "--");
});

test("formatRouteDuration handles short and long trips", () => {
  assert.equal(formatRouteDuration(45), "1 min");
  assert.equal(formatRouteDuration(300), "5 min");
  assert.equal(formatRouteDuration(3600), "1h 0m");
  assert.equal(formatRouteDuration(5520), "1h 32m");
  assert.equal(formatRouteDuration(0), "0 min");
  assert.equal(formatRouteDuration(null), "--");
});

test("calculateModeDuration calculates realistic times for drive, bike, walk, and flight", () => {
  const dist36km = 36000; // 36 km

  // Drive (with OSRM duration provided)
  assert.equal(calculateModeDuration(dist36km, "driving", 2100), 2100);

  // Cycling: 36 km @ 18 km/h = 2.0 hours (7200s)
  assert.equal(calculateModeDuration(dist36km, "cycling"), 7200);

  // Walking: 36 km @ 4.8 km/h = 7.5 hours (27000s)
  assert.equal(calculateModeDuration(dist36km, "walking"), 27000);

  // Flight: 800 km @ 800 km/h = 1 hour + 30 min takeoff/climb (5400s)
  assert.equal(calculateModeDuration(800000, "direct"), 5400);
});

test("interpolateGreatCircle generates intermediate points along spherical arc", () => {
  // London (51.5, -0.12) to New York (40.7, -74.0)
  const arc = interpolateGreatCircle(51.5, -0.12, 40.7, -74.0, 10);
  assert.equal(arc.length, 11);
  assert.ok(Math.abs(arc[0][1] - 51.5) < 0.1);
  assert.ok(Math.abs(arc[10][1] - 40.7) < 0.1);
  // Midpoint latitude on great circle is further north than flat line (curves toward pole)
  assert.ok(arc[5][1] > (51.5 + 40.7) / 2);
});

test("calculateETAs distributes arrival times across waypoints", () => {
  const waypoints = [
    { lat: 40.7128, lng: -74.006 }, // New York
    { lat: 40.0, lng: -74.5 },
    { lat: 39.9526, lng: -75.1652 }, // Philadelphia
  ];
  const departure = new Date("2026-06-01T10:00:00Z");
  const totalDurationS = 7200; // 2 hours

  const etas = calculateETAs(waypoints, totalDurationS, departure);
  assert.equal(etas.length, 3);
  assert.equal(etas[0].eta.toISOString(), departure.toISOString());
  assert.ok(etas[1].eta > etas[0].eta);
  assert.equal(etas[2].eta.toISOString(), new Date("2026-06-01T12:00:00Z").toISOString());
});

test("detectWeatherHazards flags freezing conditions, heavy rain, thunderstorms, and winds", () => {
  // Freezing rain condition
  const freezingAlert = detectWeatherHazards({
    temperature: -2,
    precipitation: 2.5,
    weatherCode: 66, // Freezing Rain: Light
    windSpeed: 15,
    visibility: 5000,
  });
  assert.ok(freezingAlert.some((h) => h.type === "freezing" || h.type === "ice"));

  // Severe thunderstorm
  const stormAlert = detectWeatherHazards({
    temperature: 24,
    precipitation: 8.0,
    weatherCode: 95, // Thunderstorm
    windSpeed: 25,
    visibility: 4000,
  });
  assert.ok(stormAlert.some((h) => h.type === "thunderstorm"));

  // High gale winds
  const windAlert = detectWeatherHazards({
    temperature: 15,
    precipitation: 0,
    weatherCode: 1,
    windSpeed: 65, // km/h
    visibility: 10000,
  });
  assert.ok(windAlert.some((h) => h.type === "wind"));

  // Dense fog / poor visibility
  const fogAlert = detectWeatherHazards({
    temperature: 8,
    precipitation: 0,
    weatherCode: 45, // Fog
    windSpeed: 5,
    visibility: 400, // < 1000m
  });
  assert.ok(fogAlert.some((h) => h.type === "fog"));

  // Calm sunny day - no hazards
  const calm = detectWeatherHazards({
    temperature: 21,
    precipitation: 0,
    weatherCode: 0,
    windSpeed: 12,
    visibility: 15000,
  });
  assert.equal(calm.length, 0);
});

test("generateGPX outputs valid GPX 1.1 XML structure", () => {
  const waypoints = [
    { lat: 51.5074, lng: -0.1278, name: "London" },
    { lat: 51.752, lng: -1.2577, name: "Oxford" },
  ];
  const gpx = generateGPX({
    name: "London to Oxford Trip",
    waypoints,
    coordinates: [
      [-0.1278, 51.5074],
      [-0.5, 51.6],
      [-1.2577, 51.752],
    ],
  });

  assert.ok(gpx.includes('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(gpx.includes('<gpx version="1.1"'));
  assert.ok(gpx.includes('lat="51.507400" lon="-0.127800"'));
  assert.ok(gpx.includes("<trk>"));
  assert.ok(gpx.includes("<trkpt"));
});

test("generateGeoJSON outputs valid GeoJSON FeatureCollection", () => {
  const waypoints = [
    { lat: 48.8566, lng: 2.3522, name: "Paris" },
    { lat: 45.764, lng: 4.8357, name: "Lyon" },
  ];
  const geojson = generateGeoJSON({
    name: "Paris to Lyon",
    waypoints,
    coordinates: [
      [2.3522, 48.8566],
      [4.8357, 45.764],
    ],
  });

  assert.equal(geojson.type, "FeatureCollection");
  assert.equal(geojson.features.length, 3);
  assert.equal(geojson.features[2].geometry.type, "LineString");
});

test("calculateBearing and bearingToCompass accurately compute travel headings", () => {
  // Due North: lat 0, lng 0 -> lat 10, lng 0
  const north = calculateBearing(0, 0, 10, 0);
  assert.equal(Math.round(north), 0);
  assert.equal(bearingToCompass(north), "N");

  // Due East: lat 0, lng 0 -> lat 0, lng 10
  const east = calculateBearing(0, 0, 0, 10);
  assert.equal(Math.round(east), 90);
  assert.equal(bearingToCompass(east), "E");

  // Due South: lat 10, lng 0 -> lat 0, lng 0
  const south = calculateBearing(10, 0, 0, 0);
  assert.equal(Math.round(south), 180);
  assert.equal(bearingToCompass(south), "S");

  // Due West: lat 0, lng 10 -> lat 0, lng 0
  const west = calculateBearing(0, 10, 0, 0);
  assert.equal(Math.round(west), 270);
  assert.equal(bearingToCompass(west), "W");
});

test("calculateRelativeWind decomposes headwind, tailwind, and crosswinds", () => {
  // Heading North (0 deg), Wind blowing FROM North (0 deg) -> Direct headwind
  const headwindRes = calculateRelativeWind(0, 20, 0);
  assert.equal(headwindRes.classification, "headwind");
  assert.equal(headwindRes.headwind, 20);
  assert.ok(headwindRes.label.includes("Headwind"));

  // Heading North (0 deg), Wind blowing FROM South (180 deg) -> Direct tailwind
  const tailwindRes = calculateRelativeWind(0, 25, 180);
  assert.equal(tailwindRes.classification, "tailwind");
  assert.equal(tailwindRes.tailwind, 25);
  assert.ok(tailwindRes.label.includes("Tailwind"));

  // Heading North (0 deg), Wind blowing FROM East (90 deg) -> Pure crosswind
  const crosswindRes = calculateRelativeWind(0, 18, 90);
  assert.equal(crosswindRes.classification, "crosswind");
  assert.ok(crosswindRes.crosswind > 17);
  assert.ok(crosswindRes.label.includes("Crosswind"));

  // Light air / calm (< 5 km/h)
  const calmRes = calculateRelativeWind(0, 3, 45);
  assert.equal(calmRes.classification, "calm");
});

test("solve2OptTSP untangles zigzag routes to minimize total distance", () => {
  // 4 collinear points along equator: P0 (0,0), P1 (0,1), P2 (0,2), P3 (0,3)
  const P0 = { lat: 0, lng: 0, name: "Start" };
  const P1 = { lat: 0, lng: 1, name: "Stop 1" };
  const P2 = { lat: 0, lng: 2, name: "Stop 2" };
  const P3 = { lat: 0, lng: 3, name: "Destination" };

  // Suboptimal zigzag order: P0 -> P2 -> P1 -> P3
  // Distances: (0 to 2 = 2) + (2 to 1 = 1) + (1 to 3 = 2) = 5 units
  const zigzag = [P0, P2, P1, P3];

  const optimized = solve2OptTSP(zigzag);

  // Expected untangled order: P0 -> P1 -> P2 -> P3
  // Distances: (0 to 1 = 1) + (1 to 2 = 1) + (2 to 3 = 1) = 3 units
  assert.equal(optimized.length, 4);
  assert.equal(optimized[0].name, "Start");
  assert.equal(optimized[1].name, "Stop 1");
  assert.equal(optimized[2].name, "Stop 2");
  assert.equal(optimized[3].name, "Destination");

  // Arrays with < 4 items should return as-is
  assert.equal(solve2OptTSP([P0, P1, P3]).length, 3);
});

test("generateAuraCopilotBriefing produces coherent travel and aerodynamic advice", () => {
  const stops = [
    {
      lat: 40.7128,
      lng: -74.006,
      weather: { temperature: 22, windSpeed: 15, windDirection: 200, precipitation: 0, precipitationProb: 10 },
      hazards: [],
    },
    {
      lat: 40.0,
      lng: -74.5,
      weather: { temperature: 24, windSpeed: 18, windDirection: 200, precipitation: 0, precipitationProb: 15 },
      hazards: [],
    },
    {
      lat: 39.9526,
      lng: -75.1652,
      weather: { temperature: 23, windSpeed: 16, windDirection: 200, precipitation: 0, precipitationProb: 5 },
      hazards: [],
    },
  ];

  const briefing = generateAuraCopilotBriefing({ distanceM: 150000, durationS: 7200 }, stops, [], "driving");
  assert.ok(briefing != null);
  assert.ok(briefing.verdictTitle.length > 0);
  assert.ok(briefing.narrative.length > 0);
  assert.ok(briefing.tip.length > 0);

  // With a severe danger hazard
  const dangerBriefing = generateAuraCopilotBriefing(
    { distanceM: 150000, durationS: 7200 },
    stops,
    [{ type: "thunderstorm", severity: "danger", title: "Severe Thunderstorm" }],
    "driving",
  );
  assert.equal(dangerBriefing.verdictTitle, "Adverse Weather Alert");
  assert.ok(dangerBriefing.narrative.includes("Severe weather hazards"));
});

test("removeStop and clearRoute do not close Route Weather Studio", async () => {
  const fs = await import("fs");
  const routesCode = fs.readFileSync("features/routes.js", "utf-8");

  // In removeStop(index), when pts.length < 2, it must NOT call hidePanel()
  const removeStopFunc = routesCode.slice(
    routesCode.indexOf("export function removeStop("),
    routesCode.indexOf("export function reverseRoute()")
  );
  expect(removeStopFunc).not.toContain("hidePanel()");
  expect(removeStopFunc).toContain("renderEmptyRoutePanel()");

  // In removeLastStop(), when pts.length < 2, it must NOT call hidePanel()
  const removeLastStopFunc = routesCode.slice(
    routesCode.indexOf("export function undoLastStop()"),
    routesCode.indexOf("export function removeStop(")
  );
  expect(removeLastStopFunc).not.toContain("hidePanel()");
  expect(removeLastStopFunc).toContain("renderEmptyRoutePanel()");

  // In clearRoute(), it must NOT call hidePanel()
  const clearRouteFunc = routesCode.slice(
    routesCode.indexOf("export function clearRoute()"),
    routesCode.indexOf("function buildHUD()")
  );
  expect(clearRouteFunc).not.toContain("hidePanel()");
});

test("Route Weather Studio provides movable bottom sheet states and drag handles", () => {
  const fs = require("fs");
  const routesCode = fs.readFileSync("features/routes.js", "utf-8");
  const css = fs.readFileSync("styles.css", "utf-8");

  // Drag handle and header exists
  expect(routesCode).toContain('id="routePanelDragHandle"');
  expect(routesCode).toContain('id="routePanelHeader"');

  // Sheet states
  expect(routesCode).toContain('export function snapRouteSheet(');
  expect(routesCode).toContain('initRoutePanelInteractions();');

  // CSS sheet states for route panel
  expect(css).toContain("#routePanel.sheet-peek");
  expect(css).toContain("#routePanel.sheet-half");
  expect(css).toContain("#routePanel.sheet-full");
});

test("Route Weather & Planner Dropdown exists with all required options", () => {
  const fs = require("fs");
  const html = fs.readFileSync("index.html", "utf-8");
  const routesCode = fs.readFileSync("features/routes.js", "utf-8");
  const css = fs.readFileSync("styles.css", "utf-8");

  // Dropdown markup in index.html - streamlined to single unified "Add Stop on Map" action
  expect(html).toContain('id="routeDropdown"');
  expect(html).not.toContain('id="routeDropdownSelectOriginBtn"');
  expect(html).not.toContain('id="routeDropdownSelectDestBtn"');
  expect(html).toContain('id="routeDropdownAddStopBtn"');
  expect(html).toContain('Origin, stops, destination');
  expect(html).toContain('id="routeDropdownOpenStudioBtn"');
  expect(html).toContain('id="routeDropdownCloseStudioBtn"');
  expect(html).toContain('id="routeDropdownDeleteLocationsBtn"');

  // Logic in routes.js
  expect(routesCode).toContain("export function toggleRouteDropdown(");
  expect(routesCode).toContain("export function updateRouteDropdownUI()");

  // CSS in styles.css
  expect(css).toContain("#routeDropdown");
});

test("Driving and flight durations in analytics are calculated separately", () => {
  const dist56km = 56000;
  const flightSec = calculateModeDuration(dist56km, "direct");
  // For driving, when not in driving mode, it calculates road driving time independently rather than copying flight time
  const driveSec = calculateModeDuration(dist56km, "driving", null);
  expect(driveSec).toBeGreaterThan(0);
  expect(flightSec).toBeGreaterThan(0);
  // Flight includes 30 min takeoff/climb + 800km/h cruise; drive is 80 km/h
  // Ensure they are not arbitrarily forced equal
  expect(driveSec).not.toEqual(flightSec);
});




