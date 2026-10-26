// ============================================================================
// ROUTE STUDIO — Advanced Trip Weather Planner & Route Weather Intelligence
// ============================================================================
// - Interactive floating HUD with step-by-step guidance, Undo, and mode toggle
// - High-contrast numbered waypoint pins (Start A, Stop 2, Destination B)
// - Interactive Map Waypoint Popover with 1-click "Delete Stop"
// - 1-Click Delete on every stop card in the panel timeline (Start, Waypoint, Dest)
// - Multimodal travel planning:
//     🚗 Driving (snapped to real roads via OSRM)
//     🚲 Cycling (snapped to road network with cycling speed & energy estimates)
//     🚶 Walking (pedestrian route snapping with hiking/walking pacing)
//     ✈️ Flight (curved great-circle spherical geodesics with flight timing)
// - Time-aware travel weather: arrival ETAs and hourly forecasts per stop
// - Route Safety & Weather Hazard Engine (freezing rain, storms, wind, fog)
// - Pro actions: 1-click Turn-by-Turn Navigation handoff, GPX / GeoJSON export
// ============================================================================

import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import Overlay from "ol/Overlay.js";
import { Style, Stroke } from "ol/style.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { HtmlMarker } from "../modules/ol-marker.js";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const EARTH_RADIUS_M = 6371000;

let appRef = null;
let routeMode = false;
let pts = []; // [{ lat, lng, name, marker }]
let activeMarkers = []; // tracks all allocated HtmlMarker instances
let activePopoverOverlay = null; // currently open waypoint popover

let transportMode = "driving"; // "driving" | "cycling" | "walking" | "direct"
let departureOffsetHours = 0; // 0 = Now, 1 = +1h, 2 = +2h, etc.

let routeSource = null;
let routeLayer = null;
let routeGlowLayer = null;
let btn = null;

let hudEl = null;
let panelEl = null;
let activeRouteData = null; // cached analysis data
let isPanelOpen = false;
let activeRouteTab = "stops"; // 'stops' | 'weather' | 'analytics'
let lastLoadedStops = [];

// ============================================================================
//  MATH & MULTIMODAL ROUTE HELPERS (Exported for Unit Testing)
// ============================================================================

export function toRad(deg) {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Calculate realistic duration based on travel mode
 */
export function calculateModeDuration(distanceM, mode, osrmDurationS = null) {
  if (distanceM == null || distanceM <= 0) return 0;
  switch (mode) {
    case "driving":
      return osrmDurationS != null ? osrmDurationS : Math.round((distanceM / 1000 / 80) * 3600);
    case "cycling":
      // Average cycling speed: 18 km/h (5 m/s)
      return Math.round((distanceM / 1000 / 18) * 3600);
    case "walking":
      // Average walking pace: 4.8 km/h (1.33 m/s)
      return Math.round((distanceM / 1000 / 4.8) * 3600);
    case "direct":
      // Aviation: 800 km/h cruising + 30 min (1800s) airport / climb / descent
      return Math.round(1800 + (distanceM / 1000 / 800) * 3600);
    default:
      return Math.round((distanceM / 1000 / 60) * 3600);
  }
}

/**
 * Generate great-circle arc coordinates between two lat/lng points for realistic flight lines
 */
export function interpolateGreatCircle(lat1, lng1, lat2, lng2, numPoints = 25) {
  const phi1 = toRad(lat1);
  const lambda1 = toRad(lng1);
  const phi2 = toRad(lat2);
  const lambda2 = toRad(lng2);

  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((phi2 - phi1) / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin((lambda2 - lambda1) / 2) ** 2,
    ),
  );

  if (d < 1e-6) return [[lng1, lat1], [lng2, lat2]];

  const coords = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);

    const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
    const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
    const z = A * Math.sin(phi1) + B * Math.sin(phi2);

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * (180 / Math.PI);
    const lng = Math.atan2(y, x) * (180 / Math.PI);
    coords.push([lng, lat]);
  }
  return coords;
}

/**
 * Calculate initial forward bearing from (lat1, lng1) to (lat2, lng2) in degrees [0, 360)
 */
export function calculateBearing(lat1, lng1, lat2, lng2) {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lng2 - lng1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

/**
 * Convert azimuth degrees into 16-point compass label
 */
export function bearingToCompass(deg) {
  if (deg == null || !Number.isFinite(deg)) return "N";
  const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const val = Math.round(deg / 22.5) % 16;
  return directions[val];
}

/**
 * Aerodynamic relative wind decomposition:
 * Compares travel leg bearing with meteorological wind (direction wind is coming FROM).
 * Returns headwind (drag), tailwind (boost), crosswind (shear), and classification.
 */
export function calculateRelativeWind(legBearing, windSpeed, windDirection) {
  if (windSpeed == null || windSpeed <= 0 || windDirection == null || !Number.isFinite(legBearing)) {
    return {
      headwind: 0,
      tailwind: 0,
      crosswind: 0,
      classification: "calm",
      label: "Calm / Light Air",
      color: "text-slate-500 dark:text-slate-400",
      bg: "bg-slate-100 dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50",
      icon: "🍃",
    };
  }

  // Angle between where wind is blowing from and travel bearing
  const rad = toRad(windDirection - legBearing);
  const headwind = windSpeed * Math.cos(rad);
  const crosswind = Math.abs(windSpeed * Math.sin(rad));
  const tailwind = -headwind;

  let classification = "calm";
  let label = "Light Air";
  let color = "text-slate-500 dark:text-slate-400";
  let bg = "bg-slate-100 dark:bg-slate-800 border-slate-200/50 dark:border-slate-700/50";
  let icon = "🍃";

  if (windSpeed >= 5) {
    if (tailwind > 4 && tailwind > crosswind * 0.7) {
      classification = "tailwind";
      label = `Tailwind (+${Math.round(tailwind)} km/h)`;
      color = "text-emerald-700 dark:text-emerald-300";
      bg = "bg-emerald-500/15 border-emerald-500/30";
      icon = "🟢 💨";
    } else if (headwind > 4 && headwind > crosswind * 0.7) {
      classification = "headwind";
      label = `Headwind (-${Math.round(headwind)} km/h)`;
      color = "text-rose-700 dark:text-rose-300";
      bg = "bg-rose-500/15 border-rose-500/30";
      icon = "🔴 💨";
    } else {
      classification = "crosswind";
      label = `Crosswind (${Math.round(crosswind)} km/h)`;
      color = "text-amber-700 dark:text-amber-300";
      bg = "bg-amber-500/15 border-amber-500/30";
      icon = "🟡 💨";
    }
  }

  return {
    headwind: Math.round(headwind * 10) / 10,
    tailwind: Math.round(tailwind * 10) / 10,
    crosswind: Math.round(crosswind * 10) / 10,
    classification,
    label,
    color,
    bg,
    icon,
  };
}

/**
 * 2-Opt Traveling Salesperson (TSP) Local Search Optimizer
 * Untangles intermediate stops (indices 1 to N-2) while keeping Start (0)
 * and Destination (N-1) fixed in place to minimize total travel distance.
 */
export function solve2OptTSP(waypoints) {
  if (!Array.isArray(waypoints) || waypoints.length < 4) {
    return waypoints ? [...waypoints] : [];
  }

  let route = [...waypoints];
  const n = route.length;

  function totalDistance(r) {
    let d = 0;
    for (let i = 0; i < r.length - 1; i++) {
      d += haversineDistanceMeters(r[i].lat, r[i].lng, r[i + 1].lat, r[i + 1].lng);
    }
    return d;
  }

  let bestDist = totalDistance(route);
  let improved = true;
  let iterations = 0;
  const maxIterations = 50;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // Only swap intermediate points: i from 1 to n - 3, j from i + 1 to n - 2
    for (let i = 1; i <= n - 3; i++) {
      for (let j = i + 1; j <= n - 2; j++) {
        // Reverse sub-array between i and j
        const newRoute = [
          ...route.slice(0, i),
          ...route.slice(i, j + 1).reverse(),
          ...route.slice(j + 1),
        ];

        const newDist = totalDistance(newRoute);
        if (newDist < bestDist - 1e-3) {
          route = newRoute;
          bestDist = newDist;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  return route;
}


export function formatRouteDistance(meters, unitSystem = "metric") {
  if (meters == null || !Number.isFinite(meters)) return "--";
  if (unitSystem === "imperial") {
    const miles = meters * 0.000621371;
    if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
    return `${miles.toFixed(1)} mi`;
  }
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatRouteDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "--";
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h 0m` : `${h}h ${m}m`;
}

export function formatSpeed(kmh, unitSystem = "metric") {
  if (kmh == null || !Number.isFinite(kmh)) return "--";
  if (unitSystem === "imperial") {
    return `${Math.round(kmh * 0.621371)} mph`;
  }
  return `${Math.round(kmh)} km/h`;
}

export function formatTemp(celsius, unitSystem = "metric") {
  if (celsius == null || !Number.isFinite(celsius)) return "--";
  if (unitSystem === "imperial") {
    return `${Math.round((celsius * 9) / 5 + 32)}°F`;
  }
  return `${Math.round(celsius)}°C`;
}

export function formatPrecip(mm, unitSystem = "metric") {
  if (mm == null || !Number.isFinite(mm)) return "--";
  if (unitSystem === "imperial") {
    return `${(mm * 0.0393701).toFixed(2)} in`;
  }
  return `${mm.toFixed(1)} mm`;
}

/**
 * Distribute total route duration across waypoints proportionally to leg distances
 */
export function calculateETAs(waypoints, totalDurationS, departureDate = new Date()) {
  if (!waypoints || waypoints.length === 0) return [];
  if (waypoints.length === 1) {
    return [{ ...waypoints[0], eta: new Date(departureDate), cumulativeDurationS: 0 }];
  }

  const legDistances = [];
  let totalDist = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = haversineDistanceMeters(
      waypoints[i].lat,
      waypoints[i].lng,
      waypoints[i + 1].lat,
      waypoints[i + 1].lng,
    );
    legDistances.push(d);
    totalDist += d;
  }

  let cumulativeS = 0;
  const results = [
    {
      ...waypoints[0],
      eta: new Date(departureDate),
      cumulativeDurationS: 0,
      legDistanceM: 0,
    },
  ];

  for (let i = 0; i < legDistances.length; i++) {
    const fraction = totalDist > 0 ? legDistances[i] / totalDist : 1 / legDistances.length;
    const legDurationS = Math.round(fraction * totalDurationS);
    cumulativeS += legDurationS;
    const eta = new Date(departureDate.getTime() + cumulativeS * 1000);
    results.push({
      ...waypoints[i + 1],
      eta,
      cumulativeDurationS: cumulativeS,
      legDistanceM: legDistances[i],
    });
  }

  return results;
}

/**
 * Route Weather Hazard Detection Engine
 */
export function detectWeatherHazards({
  temperature,
  precipitation,
  weatherCode,
  windSpeed,
  visibility,
}) {
  const hazards = [];

  if (
    (temperature <= 0 && (precipitation > 0 || [56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(weatherCode))) ||
    [66, 67].includes(weatherCode)
  ) {
    hazards.push({
      type: "freezing",
      severity: "danger",
      icon: "❄️",
      title: "Freezing Road Conditions",
      message: "Sub-zero temperatures with precipitation risk black ice on roads.",
    });
  }

  if ([95, 96, 99].includes(weatherCode)) {
    hazards.push({
      type: "thunderstorm",
      severity: "danger",
      icon: "⛈️",
      title: "Severe Thunderstorm",
      message: "Lightning, torrential downpours, and gusty winds along path.",
    });
  } else if (precipitation >= 5 || [65, 82].includes(weatherCode)) {
    hazards.push({
      type: "heavy_rain",
      severity: "warning",
      icon: "🌧️",
      title: "Heavy Downpour",
      message: "Heavy rain may cause hydroplaning and low visibility.",
    });
  }

  if (windSpeed >= 50) {
    hazards.push({
      type: "wind",
      severity: "danger",
      icon: "💨",
      title: "Severe Gale Wind",
      message: `Dangerously high wind (${Math.round(windSpeed)} km/h) affects travel safety.`,
    });
  } else if (windSpeed >= 38) {
    hazards.push({
      type: "wind",
      severity: "warning",
      icon: "💨",
      title: "Strong Crosswinds",
      message: `High winds (${Math.round(windSpeed)} km/h). Exercise caution on open roads/paths.`,
    });
  }

  if (visibility != null && visibility < 1000) {
    hazards.push({
      type: "fog",
      severity: "warning",
      icon: "🌫️",
      title: "Dense Fog / Low Visibility",
      message: `Visibility reduced to ${Math.round(visibility)}m. Slow down and use fog lights.`,
    });
  } else if ([45, 48].includes(weatherCode)) {
    hazards.push({
      type: "fog",
      severity: "warning",
      icon: "🌫️",
      title: "Fog Alert",
      message: "Foggy conditions present along route.",
    });
  }

  if (temperature >= 38) {
    hazards.push({
      type: "heat",
      severity: "warning",
      icon: "☀️",
      title: "Extreme Heat",
      message: `Intense heat (${Math.round(temperature)}°C). Ensure adequate cooling and hydration.`,
    });
  }

  return hazards;
}

/**
 * Generate standard GPX 1.1 XML string
 */
export function generateGPX({ name = "Route Studio Plan", waypoints = [], coordinates = [] }) {
  const timeStr = new Date().toISOString();
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Aurafisky Route Studio" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name)}</name>
    <time>${timeStr}</time>
  </metadata>
`;

  waypoints.forEach((wpt, i) => {
    const label = wpt.name || `Stop ${i + 1}`;
    xml += `  <wpt lat="${wpt.lat.toFixed(6)}" lon="${wpt.lng.toFixed(6)}">\n    <name>${escapeXml(label)}</name>\n  </wpt>\n`;
  });

  xml += `  <trk>\n    <name>${escapeXml(name)}</name>\n    <trkseg>\n`;
  if (coordinates.length > 0) {
    coordinates.forEach(([lng, lat]) => {
      xml += `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"></trkpt>\n`;
    });
  } else {
    waypoints.forEach((wpt) => {
      xml += `      <trkpt lat="${wpt.lat.toFixed(6)}" lon="${wpt.lng.toFixed(6)}"></trkpt>\n`;
    });
  }
  xml += `    </trkseg>\n  </trk>\n</gpx>`;
  return xml;
}

/**
 * Generate GeoJSON FeatureCollection
 */
export function generateGeoJSON({ name = "Route Studio Plan", waypoints = [], coordinates = [] }) {
  const lineCoords = coordinates.length > 0
    ? coordinates
    : waypoints.map((w) => [w.lng, w.lat]);

  const features = waypoints.map((w, idx) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [w.lng, w.lat],
    },
    properties: {
      stopIndex: idx + 1,
      name: w.name || `Stop ${idx + 1}`,
      role: idx === 0 ? "start" : idx === waypoints.length - 1 ? "destination" : "waypoint",
    },
  }));

  if (lineCoords.length > 1) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: lineCoords,
      },
      properties: {
        name,
      },
    });
  }

  return {
    type: "FeatureCollection",
    properties: {
      name,
      generatedAt: new Date().toISOString(),
    },
    features,
  };
}

/**
 * Generates an executive natural-language travel weather briefing for AuraCopilot
 */
export function generateAuraCopilotBriefing(routeData, stops, allHazards = [], mode = "driving") {
  if (!stops || stops.length < 2) return null;

  const temps = stops.map((s) => s.weather?.temperature).filter((t) => typeof t === "number");
  const minTemp = temps.length ? Math.min(...temps) : 20;
  const maxTemp = temps.length ? Math.max(...temps) : 20;

  const maxWind = stops.length ? Math.max(...stops.map((s) => s.weather?.windSpeed || 0)) : 0;

  // Compute leg wind profiles
  let tailwindLegs = 0;
  let headwindLegs = 0;
  let crosswindLegs = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const p1 = stops[i];
    const p2 = stops[i + 1];
    const bearing = calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng);
    const windAnalysis = calculateRelativeWind(bearing, p1.weather?.windSpeed, p1.weather?.windDirection);
    if (windAnalysis.classification === "tailwind") tailwindLegs++;
    else if (windAnalysis.classification === "headwind") headwindLegs++;
    else if (windAnalysis.classification === "crosswind") crosswindLegs++;
  }

  let verdictTitle = "Favorable Travel Window";
  let verdictBadge = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  let verdictIcon = "✨";
  let narrative = "";
  let tip = "";

  if (allHazards.some((h) => h.severity === "danger")) {
    verdictTitle = "Adverse Weather Alert";
    verdictBadge = "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
    verdictIcon = "⚠️";
    narrative = `Severe weather hazards detected along your path (${allHazards[0].title}). Exercise extreme caution or delay departure.`;
    tip = "Test the +1 hr / +2 hrs departure buttons below to see if the front clears.";
  } else if (allHazards.length > 0) {
    verdictTitle = "Caution Advised";
    verdictBadge = "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    verdictIcon = "⚡";
    narrative = `Moderate weather impacts anticipated (${allHazards[0].title}). Temperatures will span ${Math.round(minTemp)}°C to ${Math.round(maxTemp)}°C.`;
    tip = mode === "cycling" || mode === "walking" ? "Carry waterproof outerwear and wind protection." : "Maintain safe following distance.";
  } else {
    // Clean conditions
    if (tailwindLegs > headwindLegs && tailwindLegs > 0) {
      narrative = `Smooth journey ahead with favorable tailwind support across ${tailwindLegs} leg${tailwindLegs > 1 ? "s" : ""}. Temperatures hover comfortably between ${Math.round(minTemp)}°C and ${Math.round(maxTemp)}°C.`;
      tip = mode === "cycling" ? "Great pacing conditions with minimal aerodynamic drag." : "Efficient travel conditions with high visibility.";
    } else if (headwindLegs > 0) {
      narrative = `Stable skies ahead, though persistent headwinds (${Math.round(maxWind)} km/h peak) will generate added aerodynamic drag on ${headwindLegs} leg${headwindLegs > 1 ? "s" : ""}.`;
      tip = mode === "cycling" ? "Plan for ~15% extra physical effort or e-bike battery drain." : "Expect slightly higher fuel/battery consumption on open stretches.";
    } else {
      narrative = `Clear and calm conditions along your entire route. Temperature window is ${Math.round(minTemp)}°C to ${Math.round(maxTemp)}°C.`;
      tip = "Ideal departure window with no significant atmospheric resistance.";
    }
  }

  return {
    verdictTitle,
    verdictBadge,
    verdictIcon,
    narrative,
    tip,
  };
}


function escapeXml(unsafe) {
  return String(unsafe || "").replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
    }
  });
}

function weatherInfo(code) {
  return typeof WeatherService !== "undefined" && WeatherService.getWeatherInfo
    ? WeatherService.getWeatherInfo(code, true)
    : { icon: "❓", description: "Unknown" };
}

function getActiveUnits() {
  return typeof WeatherService !== "undefined" && WeatherService.getUnits
    ? WeatherService.getUnits()
    : "metric";
}

// ============================================================================
//  INITIALIZATION & CORE LIFECYCLE
// ============================================================================

function syncRouteChipState(isActive) {
  const routeChip = document.querySelector('.mobile-quick-chip[data-category="route-weather"]');
  const allChips = document.querySelectorAll('.mobile-quick-chip');
  if (isActive) {
    allChips.forEach((c) => c.classList.remove("active"));
    if (routeChip) routeChip.classList.add("active");
  } else {
    if (routeChip) routeChip.classList.remove("active");
  }

  const routeMobile = appRef?.googleMapsMobile || (typeof window !== "undefined" ? window.googleMapsMobile : null);
  if (routeMobile) {
    routeMobile.activeCategory = isActive ? "route-weather" : null;
  }
}

let pendingPickRole = null; // null | "origin" | "destination" | "stop"

export function toggleRouteDropdown(forceState) {
  const dropdown = document.getElementById("routeDropdown");
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains("hidden");
  const open = typeof forceState === "boolean" ? forceState : isHidden;
  if (open) {
    if (appRef) {
      appRef.toggleHomeDropdown?.(false);
      if (appRef.$.bookmarksDropdown) appRef.$.bookmarksDropdown.classList.add("hidden");
      appRef.toggleMapLayersFlyout?.(false);
    }
    updateRouteDropdownUI();
    dropdown.classList.remove("hidden");
  } else {
    dropdown.classList.add("hidden");
  }
}

export function updateRouteDropdownUI() {
  const dropdown = document.getElementById("routeDropdown");
  if (!dropdown) return;

  const originText = document.getElementById("routeDropdownOriginText");
  const destText = document.getElementById("routeDropdownDestText");
  const stopsCountText = document.getElementById("routeDropdownStopsCountText");
  const statusBadge = document.getElementById("routeDropdownStatusBadge");
  const useCurrentBtn = document.getElementById("routeDropdownUseCurrentBtn");
  const currentTitle = document.getElementById("routeDropdownCurrentPlaceTitle");
  const currentText = document.getElementById("routeDropdownCurrentPlaceText");
  const closeStudioBtn = document.getElementById("routeDropdownCloseStudioBtn");
  const deleteBtn = document.getElementById("routeDropdownDeleteLocationsBtn");
  const deleteSubtext = document.getElementById("routeDropdownDeleteSubtext");
  const locationsContainer = document.getElementById("routeDropdownLocationsContainer");
  const locationsList = document.getElementById("routeDropdownLocationsList");
  const stopsBadge = document.getElementById("routeDropdownStopsBadge");

  const hasStops = pts.length > 0;
  const studioActive = routeMode || isPanelOpen;

  // Status Badge
  if (statusBadge) {
    if (studioActive) {
      statusBadge.textContent = "Studio Active";
      statusBadge.className = "text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shrink-0";
    } else if (hasStops) {
      statusBadge.textContent = `${pts.length} stop${pts.length > 1 ? "s" : ""}`;
      statusBadge.className = "text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0";
    } else {
      statusBadge.textContent = "Ready";
      statusBadge.className = "text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20 shrink-0";
    }
  }

  // Origin (A) text
  if (originText) {
    if (pts.length > 0) {
      originText.textContent = pts[0].name || `Lat: ${pts[0].lat.toFixed(3)}, Lng: ${pts[0].lng.toFixed(3)}`;
      originText.className = "text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate";
    } else {
      originText.textContent = "Tap map to set origin";
      originText.className = "text-[10px] text-slate-500 dark:text-slate-400 truncate";
    }
  }

  // Destination (B) text
  if (destText) {
    if (pts.length >= 2) {
      const dest = pts[pts.length - 1];
      destText.textContent = dest.name || `Lat: ${dest.lat.toFixed(3)}, Lng: ${dest.lng.toFixed(3)}`;
      destText.className = "text-[10px] font-semibold text-rose-600 dark:text-rose-400 truncate";
    } else {
      destText.textContent = pts.length === 1 ? "Next: Tap map to set destination" : "Tap map to set destination";
      destText.className = "text-[10px] text-slate-500 dark:text-slate-400 truncate";
    }
  }

  // Intermediate stops text (brief: origin, stops, destination)
  if (stopsCountText) {
    if (pts.length === 0) {
      stopsCountText.textContent = "Origin, stops, destination • Tap map to add";
    } else if (pts.length === 1) {
      stopsCountText.textContent = "Origin set • Tap map for destination";
    } else if (pts.length === 2) {
      stopsCountText.textContent = "Route set • Tap map to add more stops";
    } else {
      stopsCountText.textContent = `${pts.length} points (Origin, ${pts.length - 2} stop${pts.length - 2 > 1 ? "s" : ""}, Destination)`;
    }
  }

  // Use currently selected place on map
  if (useCurrentBtn && appRef) {
    if (appRef.selectedLat != null && appRef.selectedLng != null) {
      useCurrentBtn.classList.remove("hidden");
      const placeName = (appRef.selectedName || "Selected location").split(",")[0].trim();
      if (currentTitle) {
        currentTitle.textContent = `Add "${placeName}"`;
      }
      if (currentText) {
        const targetRole = pts.length === 0 ? "as Origin (A)" : pts.length === 1 ? "as Destination (B)" : "as Next Stop";
        currentText.textContent = `Set ${targetRole}`;
      }
    } else {
      useCurrentBtn.classList.add("hidden");
    }
  }

  // Close Studio button (visible if studio opened)
  if (closeStudioBtn) {
    if (studioActive) {
      closeStudioBtn.classList.remove("hidden");
    } else {
      closeStudioBtn.classList.add("hidden");
    }
  }

  // Delete Locations button (visible if user selected locations)
  if (deleteBtn) {
    if (hasStops) {
      deleteBtn.classList.remove("hidden");
      if (deleteSubtext) {
        deleteSubtext.textContent = `Clear all ${pts.length} selected location${pts.length > 1 ? "s" : ""}`;
      }
    } else {
      deleteBtn.classList.add("hidden");
    }
  }

  // Selected Locations list
  if (locationsContainer && locationsList) {
    if (hasStops) {
      locationsContainer.classList.remove("hidden");
      if (stopsBadge) {
        stopsBadge.textContent = `${pts.length} stop${pts.length > 1 ? "s" : ""}`;
      }
      locationsList.innerHTML = "";
      pts.forEach((p, idx) => {
        const isStart = idx === 0;
        const isEnd = idx === pts.length - 1 && pts.length > 1;
        const badge = isStart ? "A" : isEnd ? "B" : `${idx + 1}`;
        const badgeColor = isStart
          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
          : isEnd
          ? "bg-rose-500/20 text-rose-600 dark:text-rose-400"
          : "bg-indigo-500/20 text-indigo-600 dark:text-indigo-400";

        const item = document.createElement("div");
        item.className = "flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs";
        item.innerHTML = `
          <div class="flex items-center gap-1.5 min-w-0 flex-1">
            <span class="w-4 h-4 rounded-full ${badgeColor} text-[9px] font-black flex items-center justify-center shrink-0">${badge}</span>
            <span class="truncate font-medium text-slate-700 dark:text-slate-200">${escapeXml(p.name || `Stop ${idx + 1}`)}</span>
          </div>
          <button type="button" class="route-del-single-btn p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors shrink-0 cursor-pointer" data-index="${idx}" title="Remove this stop" aria-label="Remove stop ${idx + 1}">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        `;
        item.querySelector(".route-del-single-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          removeStop(idx);
          updateRouteDropdownUI();
        });
        locationsList.appendChild(item);
      });
    } else {
      locationsContainer.classList.add("hidden");
      locationsList.innerHTML = "";
    }
  }
}

export function activateMapPickMode(role = "stop") {
  if (!appRef || !appRef.map) return;
  pendingPickRole = role;
  routeMode = true;
  appRef._routeModeActive = true;
  ensureRouteLayers();
  const targetEl = appRef.map.getTargetElement();
  if (targetEl) targetEl.style.cursor = "crosshair";
  appRef.map.un("click", onMapClick);
  appRef.map.on("click", onMapClick);
  window.removeEventListener("keydown", onKeyDown);
  window.addEventListener("keydown", onKeyDown);
  if (btn) {
    btn.classList.add("bg-indigo-600", "text-white", "ring-2", "ring-indigo-400/50");
  }
}

function initRouteDropdownListeners() {
  const closeBtn = document.getElementById("closeRouteDropdownBtn");
  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleRouteDropdown(false);
  });

  const selectOriginBtn = document.getElementById("routeDropdownSelectOriginBtn");
  selectOriginBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleRouteDropdown(false);
    activateMapPickMode("origin");
    appRef?.showToast?.("📍 Tap map to set Departure / Origin (A)", "info");
  });

  const selectDestBtn = document.getElementById("routeDropdownSelectDestBtn");
  selectDestBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleRouteDropdown(false);
    activateMapPickMode("destination");
    if (pts.length === 0) {
      appRef?.showToast?.("📍 Tap map to set Departure (A) first, then Destination (B)", "info");
    } else {
      appRef?.showToast?.("🏁 Tap map to set Destination (B)", "info");
    }
  });

  const addStopBtn = document.getElementById("routeDropdownAddStopBtn");
  addStopBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleRouteDropdown(false);
    activateMapPickMode("stop");
    if (pts.length === 0) {
      appRef?.showToast?.("📍 Tap map to set Departure / Origin (A)", "info");
    } else if (pts.length === 1) {
      appRef?.showToast?.("🏁 Tap map to set Destination (B)", "info");
    } else {
      appRef?.showToast?.("➕ Tap map to add stop to route", "info");
    }
  });

  const useCurrentBtn = document.getElementById("routeDropdownUseCurrentBtn");
  useCurrentBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (appRef && appRef.selectedLat != null && appRef.selectedLng != null) {
      const pt = {
        lat: appRef.selectedLat,
        lng: appRef.selectedLng,
        name: (appRef.selectedName || `Stop ${pts.length + 1}`).split(",")[0].trim(),
        marker: null,
      };
      pts.push(pt);
      renderWaypointMarkers();
      updateRouteGeometry();
      updateHUD();
      updateRouteDropdownUI();
      appRef.showToast?.(`Added "${pt.name}" to route`, "success");
      if (isPanelOpen && pts.length >= 2) {
        fetchAndRenderRoutePlan();
      }
    }
  });

  const openStudioBtn = document.getElementById("routeDropdownOpenStudioBtn");
  openStudioBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleRouteDropdown(false);
    openRouteStudio();
  });

  const closeStudioBtn = document.getElementById("routeDropdownCloseStudioBtn");
  closeStudioBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleRouteDropdown(false);
    closeRouteStudio();
    appRef?.showToast?.("Route Weather Studio closed", "info");
  });

  const deleteBtn = document.getElementById("routeDropdownDeleteLocationsBtn");
  deleteBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearRoute();
    updateRouteDropdownUI();
  });
}

export function init(app) {
  appRef = app;
  app.toggleRoute = toggleRoute;
  app.openRouteStudio = openRouteStudio;
  app.closeRouteStudio = closeRouteStudio;
  app.toggleRouteDropdown = toggleRouteDropdown;
  app.updateRouteDropdownUI = updateRouteDropdownUI;
  if (typeof window !== "undefined") {
    window.openRouteStudio = openRouteStudio;
    window.closeRouteStudio = closeRouteStudio;
    window.toggleRoute = toggleRoute;
    window.toggleRouteDropdown = toggleRouteDropdown;
    window.updateRouteDropdownUI = updateRouteDropdownUI;
  }
  btn = document.getElementById("routeBtn");
  if (btn) {
    btn.title = "Route Weather & Planner";
    btn.setAttribute("aria-label", "Route Weather & Planner");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleRouteDropdown();
    });
  }
  initRouteDropdownListeners();
  buildHUD();
  buildPanel();
}

/**
 * Fully exit and close Route Studio: hides HUD, panel, removes map listeners & keydown.
 */
export function closeRouteStudio() {
  closeWaypointPopover();
  routeMode = false;
  isPanelOpen = false;
  appRef?.popHistoryOverlay?.("route");

  if (appRef) {
    appRef._routeModeActive = false;
    if (appRef.map) {
      appRef.map.un("click", onMapClick);
      const targetEl = appRef.map.getTargetElement();
      if (targetEl) targetEl.style.cursor = "";
    }
  }
  window.removeEventListener("keydown", onKeyDown);

  if (btn) {
    btn.classList.remove("bg-indigo-600", "text-white", "ring-2", "ring-indigo-400/50");
    btn.title = "Route Weather & Planner";
  }

  hideHUD();
  hidePanel();
  syncRouteChipState(false);
  appRef?.syncMobileBottomNavState?.();
}

/**
 * Open Route Studio mode.
 */
export function openRouteStudio() {
  if (!appRef || !appRef.map) return;
  routeMode = true;
  appRef._routeModeActive = true;
  appRef.pushHistoryOverlay?.("route");

  const targetEl = appRef.map.getTargetElement();
  ensureRouteLayers();
  if (btn) {
    btn.classList.add("bg-indigo-600", "text-white", "ring-2", "ring-indigo-400/50");
    btn.title = "Exit Route Weather";
  }

  if (targetEl) targetEl.style.cursor = "crosshair";

  // Synchronize with mobile quick chips and Google Maps Mobile controller
  syncRouteChipState(true);

  // Crucially dismiss any active location weather panel on mobile/desktop
  if (appRef) {
    appRef.hideWeatherPanel?.();
    if (appRef.googleMapsMobile) {
      appRef.googleMapsMobile.sheetState = "dismissed";
    }
  }

  // Hide mobile restoreSheetPill while route studio is open
  const restorePill = document.getElementById("restoreSheetPill");
  if (restorePill) restorePill.classList.add("hidden");

  // If user already had a selected location and no stops exist yet, set it as Origin (A)
  if (pts.length === 0 && appRef.selectedLat != null && appRef.selectedLng != null) {
    const ptA = {
      lat: appRef.selectedLat,
      lng: appRef.selectedLng,
      name: (appRef.selectedName || "Departure Point").split(",")[0].trim(),
      marker: null,
    };
    pts.push(ptA);
    renderWaypointMarkers();
  }

  // On mobile: if user doesn't have 2+ stops yet, keep the map clear so they can tap Origin & Destination!
  if (isMobileLayout() && pts.length < 2) {
    showHUD();
    hidePanel();
    updateHUD();
  } else {
    hideHUD();
    showPanel();
    updateHUD();
    if (pts.length >= 2) {
      fetchAndRenderRoutePlan();
    } else {
      renderEmptyRoutePanel();
    }
  }

  appRef.map.on("click", onMapClick);
  window.addEventListener("keydown", onKeyDown);

  if (pts.length === 0) {
    appRef.showToast?.("🚗 Route Weather: Tap map to place Departure point (A)", "info");
  } else if (pts.length === 1) {
    appRef.showToast?.(`📍 Departure set: ${pts[0].name}. Tap map for Destination (B)`, "info");
  } else {
    appRef.showToast?.(`🚗 Route Weather: ${pts.length} stops ready.`, "info");
  }
}

/**
 * Toggle drawing mode on/off
 */
export function toggleRoute() {
  if (routeMode || isPanelOpen) {
    closeRouteStudio();
  } else {
    openRouteStudio();
  }
}

function onKeyDown(e) {
  if (!routeMode && !isPanelOpen) return;

  // Undo: Ctrl+Z or Cmd+Z
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undoLastStop();
    return;
  }

  // Escape: Close popover or exit Route Studio completely
  if (e.key === "Escape") {
    e.preventDefault();
    if (activePopoverOverlay) {
      closeWaypointPopover();
    } else {
      closeRouteStudio();
    }
    return;
  }

  // Enter: Finish & analyze
  if (e.key === "Enter" && pts.length >= 2) {
    e.preventDefault();
    finishRoute();
  }
}

// ============================================================================
//  MAP VECTOR LAYERS & WAYPOINT MARKERS
// ============================================================================

export function getRouteFeatureStyle(feature) {
  const hazard = feature?.get ? (feature.get("hazardLevel") || "default") : "default";
  let color = "#6366f1"; // Indigo default
  if (hazard === "danger") {
    color = "#ef4444"; // Rose for severe hazards (freezing, storm, gale)
  } else if (hazard === "warning") {
    color = "#f59e0b"; // Amber for caution (heavy rain, high wind)
  } else if (hazard === "clear") {
    color = "#10b981"; // Emerald for clear, safe travel conditions
  }
  return new Style({
    stroke: new Stroke({
      color,
      width: 4.5,
      lineCap: "round",
      lineJoin: "round",
    }),
  });
}

export function getRouteGlowFeatureStyle(feature) {
  const hazard = feature?.get ? (feature.get("hazardLevel") || "default") : "default";
  let color = "rgba(99, 102, 241, 0.35)";
  if (hazard === "danger") {
    color = "rgba(239, 68, 68, 0.4)";
  } else if (hazard === "warning") {
    color = "rgba(245, 158, 11, 0.4)";
  } else if (hazard === "clear") {
    color = "rgba(16, 185, 129, 0.35)";
  }
  return new Style({
    stroke: new Stroke({
      color,
      width: 9,
      lineCap: "round",
      lineJoin: "round",
    }),
  });
}

export function updateRouteSegmentColors(stops) {
  if (!routeSource) return;
  const features = routeSource.getFeatures();
  if (!features.length) return;

  const hasDanger = stops?.some((s) => s.hazards?.some((h) => h.severity === "danger"));
  const hasWarning = stops?.some((s) => s.hazards?.some((h) => h.severity === "warning"));
  const overallLevel = hasDanger ? "danger" : hasWarning ? "warning" : "clear";

  features.forEach((feat) => {
    feat.set("hazardLevel", overallLevel);
  });
  routeSource.changed();

  const badgeEl = hudEl ? hudEl.querySelector("#routeHudWeatherBadge") : document.getElementById("routeHudWeatherBadge");
  if (badgeEl) {
    badgeEl.classList.remove("hidden");
    if (overallLevel === "danger") {
      badgeEl.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 animate-pulse select-none";
      badgeEl.textContent = "🔴 Severe Weather";
    } else if (overallLevel === "warning") {
      badgeEl.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 select-none";
      badgeEl.textContent = "🟡 Weather Caution";
    } else {
      badgeEl.className = "px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 select-none";
      badgeEl.textContent = "🟢 Clear Route";
    }
  }
}

function ensureRouteLayers() {
  if (routeLayer) return;

  routeSource = new VectorSource();

  routeGlowLayer = new VectorLayer({
    source: routeSource,
    style: (feature) => getRouteGlowFeatureStyle(feature),
    zIndex: 399,
  });

  routeLayer = new VectorLayer({
    source: routeSource,
    style: (feature) => getRouteFeatureStyle(feature),
    zIndex: 400,
  });

  appRef.map.addLayer(routeGlowLayer);
  appRef.map.addLayer(routeLayer);
}

function closeWaypointPopover() {
  if (activePopoverOverlay && appRef && appRef.map) {
    try {
      appRef.map.removeOverlay(activePopoverOverlay);
    } catch (e) {}
    activePopoverOverlay = null;
  }
}

function clearWaypointMarkers() {
  closeWaypointPopover();

  // 1. Remove all OpenLayers overlays tagged for Route Studio
  if (appRef && appRef.map) {
    const overlays = appRef.map.getOverlays().getArray().slice();
    overlays.forEach((ov) => {
      if (ov.get("isRouteStudioMarker") || ov.get("isRouteStudioPopover")) {
        appRef.map.removeOverlay(ov);
      }
    });
  }

  // 2. Remove all tracked HtmlMarker instances
  activeMarkers.forEach((m) => {
    try {
      m.remove();
      if (m.element && m.element.parentNode) {
        m.element.parentNode.removeChild(m.element);
      }
    } catch (e) {}
  });
  activeMarkers = [];

  // 3. Fallback: Clean up any lingering DOM elements
  document.querySelectorAll(".route-studio-marker, .route-studio-popover").forEach((el) => el.remove());

  pts.forEach((p) => {
    p.marker = null;
  });
}

function renderWaypointMarkers() {
  clearWaypointMarkers();
  if (!appRef || !appRef.map) return;

  pts.forEach((pt, index) => {
    const isStart = index === 0;
    const isEnd = index === pts.length - 1 && pts.length > 1;

    let badgeText = `${index + 1}`;
    let bgGradient = "from-indigo-600 to-violet-600";
    let ringColor = "ring-indigo-300";

    if (isStart) {
      badgeText = "A";
      bgGradient = "from-emerald-600 to-teal-600";
      ringColor = "ring-emerald-300";
    } else if (isEnd) {
      badgeText = "B";
      bgGradient = "from-rose-600 to-pink-600";
      ringColor = "ring-rose-300";
    }

    const markerHtml = `
      <div class="relative group cursor-pointer" data-stop-idx="${index}" style="pointer-events: auto;">
        <div class="w-7 h-7 rounded-full bg-gradient-to-tr ${bgGradient} text-white font-black text-xs flex items-center justify-center shadow-lg ring-2 ${ringColor} transition-transform hover:scale-125 duration-150">
          ${badgeText}
        </div>
        <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-slate-900 rotate-45"></div>
      </div>
    `;

    const marker = new HtmlMarker(appRef.map, {
      lat: pt.lat,
      lng: pt.lng,
      html: markerHtml,
      className: "route-studio-marker",
      size: [28, 28],
      anchor: [14, 28],
      zIndex: 1100 + index,
      onClick: (e) => {
        if (e && e.stopPropagation) e.stopPropagation();
        showWaypointPopover(index);
      },
    });

    if (marker && marker.overlay) {
      marker.overlay.set("isRouteStudioMarker", true);
    }

    activeMarkers.push(marker);
    pt.marker = marker;
  });
}

/**
 * Asynchronously resolve real settlement / city name for a stop via reverse geocoding
 */
async function resolvePointName(pt) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pt.lat}&lon=${pt.lng}&zoom=14`;
    const res = await fetch(url, { headers: { "User-Agent": "Aurafisky/17.0.0", Accept: "application/json" } });
    if (!res.ok) return;
    const data = await res.json();
    const city =
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.hamlet ||
      data.address?.suburb ||
      data.address?.county;
    const state = data.address?.state;
    if (city) {
      pt.name = state ? `${city}, ${state}` : city;
      pt.shortName = city;
    } else if (data.name) {
      pt.name = data.name;
      pt.shortName = data.name;
    }

    // Refresh titles in DOM if open
    if (isPanelOpen) {
      const bodyEl = panelEl ? panelEl.querySelector("#routePanelBody") : document.getElementById("routePanelBody");
      bodyEl?.querySelectorAll(`[data-stop-title-idx]`).forEach((el) => {
        const idx = parseInt(el.dataset.stopTitleIdx, 10);
        if (pts[idx] === pt) el.textContent = pt.name;
      });
    }
  } catch (err) {
    // silent fallback
  }
}

/**
 * Fast place search for adding waypoints via autocomplete (Open-Meteo with Nominatim fallback)
 */
async function searchPlacesForRoute(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en&format=json`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length) {
        return data.results.map((r) => ({
          name: r.name,
          details: [r.admin1, r.country].filter(Boolean).join(", "),
          lat: r.latitude,
          lng: r.longitude,
        }));
      }
    }
  } catch (e) {}

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`;
    const res = await fetch(url, { headers: { "User-Agent": "Aurafisky/17.0.0", Accept: "application/json" } });
    if (res.ok) {
      const list = await res.json();
      return list.map((item) => ({
        name: item.name || item.display_name.split(",")[0],
        details: item.display_name,
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
      }));
    }
  } catch (e) {}

  return [];
}

/**
 * Add a stop programmatically by coordinates & optional name
 */
export async function addStop(lat, lng, name = null) {
  closeWaypointPopover();
  const pt = {
    lat,
    lng,
    name: name || `Stop ${pts.length + 1}`,
    marker: null,
  };
  pts.push(pt);
  renderWaypointMarkers();
  updateHUD();

  if (!name) {
    resolvePointName(pt);
  }

  if (isPanelOpen && pts.length >= 2) {
    showRoutePanelLoading();
  }

  await updateRouteGeometry();

  if (appRef?.map) {
    appRef.map.getView().animate({
      center: fromLonLat([lng, lat]),
      zoom: Math.max(appRef.map.getView().getZoom(), 8),
      duration: 600,
    });
  }

  if (isPanelOpen) {
    await fetchAndRenderRoutePlan();
  }
}

/**
 * Move stop from one position to another (custom reordering)
 */
export function moveStop(fromIndex, toIndex) {
  closeWaypointPopover();
  if (
    fromIndex < 0 ||
    fromIndex >= pts.length ||
    toIndex < 0 ||
    toIndex >= pts.length ||
    fromIndex === toIndex
  ) {
    return;
  }
  const [item] = pts.splice(fromIndex, 1);
  pts.splice(toIndex, 0, item);
  renderWaypointMarkers();
  updateRouteGeometry();
  updateHUD();
  appRef.showToast(`Moved stop to position ${toIndex + 1}`, "info");

  if (isPanelOpen) {
    fetchAndRenderRoutePlan();
  }
}

/**
 * Interactive on-map Waypoint Popover with reorder and delete controls
 */
function showWaypointPopover(index) {
  closeWaypointPopover();
  const pt = pts[index];
  if (!pt || !appRef || !appRef.map) return;

  const isStart = index === 0;
  const isEnd = index === pts.length - 1 && pts.length > 1;
  const roleLabel = isStart ? "Start (Departure)" : isEnd ? "Destination (Arrival)" : `Stop ${index + 1}`;
  const badgeColor = isStart ? "text-emerald-600 dark:text-emerald-400" : isEnd ? "text-rose-600 dark:text-rose-400" : "text-indigo-600 dark:text-indigo-400";
  const badgeBg = isStart ? "bg-emerald-500/10 border-emerald-500/30" : isEnd ? "bg-rose-500/10 border-rose-500/30" : "bg-indigo-500/10 border-indigo-500/30";

  const popoverEl = document.createElement("div");
  popoverEl.className =
    "route-studio-popover glass p-3 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 " +
    "text-xs min-w-[210px] space-y-2 pointer-events-auto backdrop-blur-2xl animate-fade-in";
  popoverEl.style.zIndex = "2500";

  popoverEl.innerHTML = `
    <div class="flex items-center justify-between gap-2 border-b border-slate-200/50 dark:border-slate-700/50 pb-2">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-bold ${badgeBg} ${badgeColor}">
        ${roleLabel}
      </span>
      <button type="button" class="route-popover-close text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg" aria-label="Close">✕</button>
    </div>

    <div>
      <div class="font-extrabold text-sm text-slate-900 dark:text-white truncate">${escapeXml(pt.name || `Stop ${index + 1}`)}</div>
      <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}</div>
    </div>

    <div class="flex items-center gap-1.5 pt-1">
      ${
        index > 0
          ? `
        <button type="button" class="route-popover-up flex-1 py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/70 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[11px] transition-all flex items-center justify-center gap-1">
          <span>↑</span><span>Earlier</span>
        </button>
      `
          : ""
      }
      ${
        index < pts.length - 1
          ? `
        <button type="button" class="route-popover-down flex-1 py-1.5 px-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/70 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[11px] transition-all flex items-center justify-center gap-1">
          <span>↓</span><span>Later</span>
        </button>
      `
          : ""
      }
    </div>

    <button type="button" class="route-popover-delete w-full py-1.5 px-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-600 hover:text-white border border-rose-500/20 font-bold text-xs flex items-center justify-center gap-1.5 transition-all">
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      <span>Remove Stop</span>
    </button>
  `;

  popoverEl.querySelector(".route-popover-close").addEventListener("click", (e) => {
    e.stopPropagation();
    closeWaypointPopover();
  });

  popoverEl.querySelector(".route-popover-delete").addEventListener("click", (e) => {
    e.stopPropagation();
    closeWaypointPopover();
    removeStop(index);
  });

  popoverEl.querySelector(".route-popover-up")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeWaypointPopover();
    moveStop(index, index - 1);
  });

  popoverEl.querySelector(".route-popover-down")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeWaypointPopover();
    moveStop(index, index + 1);
  });

  activePopoverOverlay = new Overlay({
    element: popoverEl,
    position: fromLonLat([pt.lng, pt.lat]),
    positioning: "bottom-center",
    offset: [0, -32],
    stopEvent: true,
  });
  activePopoverOverlay.set("isRouteStudioPopover", true);
  appRef.map.addOverlay(activePopoverOverlay);
}

// ============================================================================
//  MAP CLICK & ROUTE COMPUTATION (Road Snapping & Multimodal Routing)
// ============================================================================

async function onMapClick(e) {
  if (!routeMode) return;
  closeWaypointPopover();
  const [lng, lat] = toLonLat(e.coordinate);

  const role = pendingPickRole;
  pendingPickRole = null;

  const defaultName =
    role === "origin"
      ? "Departure Point"
      : role === "destination"
      ? "Destination Point"
      : `Stop ${pts.length + 1}`;

  const pt = {
    lat,
    lng,
    name: defaultName,
    marker: null,
  };

  if (role === "origin") {
    if (pts.length === 0) {
      pts.push(pt);
      appRef?.showToast?.("📍 Departure (A) set! Tap map for Destination (B)", "info");
    } else {
      if (pts[0].marker) {
        try { pts[0].marker.remove(); } catch (_) {}
      }
      pts[0] = pt;
      appRef?.showToast?.("📍 Departure (A) updated", "info");
    }
  } else if (role === "destination") {
    if (pts.length < 2) {
      pts.push(pt);
      appRef?.showToast?.(pts.length === 1 ? "📍 Departure set! Tap map for Destination (B)" : "🏁 Destination (B) set", "info");
    } else {
      if (pts[pts.length - 1].marker) {
        try { pts[pts.length - 1].marker.remove(); } catch (_) {}
      }
      pts[pts.length - 1] = pt;
      appRef?.showToast?.("🏁 Destination (B) updated", "info");
    }
  } else {
    pts.push(pt);
  }

  renderWaypointMarkers();
  updateHUD();
  updateRouteDropdownUI();

  resolvePointName(pt);

  if (isPanelOpen && pts.length >= 2) {
    showRoutePanelLoading();
  }

  await updateRouteGeometry();

  if (isPanelOpen) {
    await fetchAndRenderRoutePlan();
  } else {
    if (pts.length === 1) {
      appRef?.showToast?.("📍 Start point (A) set! Tap map for Destination (B)", "info");
    } else if (pts.length === 2) {
      appRef?.showToast?.("🏁 Destination (B) set! Route ready. Tap map to add more stops or tap 'Analyze'.", "success");
    } else if (pts.length > 2) {
      appRef?.showToast?.(`➕ Stop ${pts.length - 2} added to route`, "info");
    }
  }
}

/**
 * Recalculate route geometry:
 * - 🚗 Driving: real road geometry via OSRM + driving duration
 * - 🚲 Cycling: real road network geometry via OSRM + cycling duration (18 km/h)
 * - 🚶 Walking: real road/street network geometry via OSRM + walking duration (4.8 km/h)
 * - ✈️ Flight: curved great-circle spherical arc + flight cruising speed (800 km/h)
 */
async function updateRouteGeometry() {
  if (!appRef || !appRef.map) return;
  ensureRouteLayers();
  routeSource.clear();

  if (pts.length < 2) return;

  // 1. Flight / Direct Geodesic Curved Arc
  if (transportMode === "direct") {
    let allCoordinates = [];
    let totalDistM = 0;

    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const arc = interpolateGreatCircle(p1.lat, p1.lng, p2.lat, p2.lng, 25);
      if (i > 0) arc.shift();
      allCoordinates.push(...arc);
      totalDistM += haversineDistanceMeters(p1.lat, p1.lng, p2.lat, p2.lng);
    }

    const olCoords = allCoordinates.map((c) => fromLonLat(c));
    routeSource.addFeature(new Feature(new LineString(olCoords)));

    const durationS = calculateModeDuration(totalDistM, "direct");

    activeRouteData = {
      coordinates: allCoordinates,
      distanceM: totalDistM,
      durationS,
      mode: "direct",
    };

    updateHUD();
    return;
  }

  // 2. Road Network Routing (Drive / Bike / Walk)
  try {
    const coordsParam = pts.map((p) => `${p.lng},${p.lat}`).join(";");
    const url = `${OSRM_BASE}/${coordsParam}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("OSRM error");
    const data = await res.json();

    if (data.code === "Ok" && data.routes?.length) {
      const route = data.routes[0];
      const coordinates = route.geometry.coordinates; // [lng, lat]
      const olCoords = coordinates.map((c) => fromLonLat(c));

      routeSource.addFeature(new Feature(new LineString(olCoords)));

      const distanceM = route.distance;
      const durationS = calculateModeDuration(distanceM, transportMode, route.duration);

      activeRouteData = {
        coordinates,
        distanceM,
        durationS,
        mode: transportMode,
      };

      updateHUD();
      return;
    }
  } catch (err) {
    console.warn("OSRM road route unavailable or cross-ocean, falling back to direct line:", err);
  }

  // 3. Fallback to direct connection if road network fails
  let totalDistM = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    totalDistM += haversineDistanceMeters(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
  }

  const coordinates = pts.map((p) => [p.lng, p.lat]);
  const olCoords = pts.map((p) => fromLonLat([p.lng, p.lat]));
  routeSource.addFeature(new Feature(new LineString(olCoords)));

  const durationS = calculateModeDuration(totalDistM, transportMode);

  activeRouteData = {
    coordinates,
    distanceM: totalDistM,
    durationS,
    mode: transportMode,
  };

  updateHUD();
}

export function undoLastStop() {
  closeWaypointPopover();
  if (pts.length === 0) return;
  const removed = pts.pop();
  if (removed && removed.marker) {
    removed.marker.remove();
  }
  renderWaypointMarkers();
  updateRouteGeometry();
  updateHUD();
  updateRouteDropdownUI();
  appRef.showToast("Removed last stop", "info");

  if (isPanelOpen) {
    if (pts.length >= 2) {
      fetchAndRenderRoutePlan();
    } else {
      renderEmptyRoutePanel();
    }
  }
}

/**
 * Remove ANY stop by index (Start, Waypoint, or Destination)
 */
export function removeStop(index) {
  closeWaypointPopover();
  if (index < 0 || index >= pts.length) return;
  const [removed] = pts.splice(index, 1);
  if (removed && removed.marker) {
    removed.marker.remove();
  }
  renderWaypointMarkers();
  updateRouteGeometry();
  updateHUD();
  updateRouteDropdownUI();
  appRef.showToast(`Removed stop ${index + 1}`, "info");

  if (isPanelOpen) {
    if (pts.length >= 2) {
      fetchAndRenderRoutePlan();
    } else {
      renderEmptyRoutePanel();
    }
  }
}

export function reverseRoute() {
  closeWaypointPopover();
  if (pts.length < 2) return;
  pts.reverse();
  pts.forEach((p, idx) => {
    if (!p.name || /^Stop \d+$/.test(p.name)) {
      p.name = `Stop ${idx + 1}`;
    }
  });
  renderWaypointMarkers();
  updateRouteGeometry();
  updateHUD();
  updateRouteDropdownUI();
  appRef.showToast("Route reversed (swapped start & destination)", "info");

  if (isPanelOpen) {
    fetchAndRenderRoutePlan();
  }
}

/**
 * 1-Click 2-Opt Waypoint Optimizer:
 * Reorders intermediate stops to minimize total journey distance while
 * keeping Departure (A) and Destination (B) anchored.
 */
export async function optimizeWaypointOrder() {
  closeWaypointPopover();
  if (pts.length < 4) {
    if (appRef) appRef.showToast("Add at least 4 stops to optimize stop sequence", "info");
    return;
  }

  let origDist = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    origDist += haversineDistanceMeters(pts[i].lat, pts[i].lng, pts[i + 1].lat, pts[i + 1].lng);
  }

  const optimized = solve2OptTSP(pts);

  let newDist = 0;
  for (let i = 0; i < optimized.length - 1; i++) {
    newDist += haversineDistanceMeters(optimized[i].lat, optimized[i].lng, optimized[i + 1].lat, optimized[i + 1].lng);
  }

  pts = optimized;
  pts.forEach((p, idx) => {
    if (!p.name || /^Stop \d+$/.test(p.name)) {
      p.name = `Stop ${idx + 1}`;
    }
  });

  renderWaypointMarkers();
  await updateRouteGeometry();
  updateHUD();
  updateRouteDropdownUI();

  const savedM = origDist - newDist;
  const units = getActiveUnits();
  if (savedM > 100) {
    const savedStr = formatRouteDistance(savedM, units);
    if (appRef) appRef.showToast(`⚡ Route optimized! Saved ~${savedStr}`, "success");
  } else {
    if (appRef) appRef.showToast("⚡ Route is already in optimal sequence", "success");
  }

  if (isPanelOpen) {
    await fetchAndRenderRoutePlan();
  }
}

export function clearRoute() {
  closeWaypointPopover();
  pts = [];
  activeRouteData = null;
  if (routeSource) routeSource.clear();
  clearWaypointMarkers();
  updateHUD();
  updateRouteDropdownUI();
  const bodyEl = panelEl ? panelEl.querySelector("#routePanelBody") : document.getElementById("routePanelBody");
  if (bodyEl) renderEmptyRoutePanel();
  const panelStopsCountEl = document.getElementById("routePanelStopsCount") || panelEl?.querySelector("#routePanelStopsCount");
  if (panelStopsCountEl) panelStopsCountEl.textContent = "0";
  const badgeEl = hudEl ? hudEl.querySelector("#routeHudWeatherBadge") : document.getElementById("routeHudWeatherBadge");
  if (badgeEl) badgeEl.classList.add("hidden");
  if (appRef) appRef.showToast("Route cleared", "info");
}

// ============================================================================
//  FLOATING ROUTE STUDIO HUD (Heads-Up Display)
// ============================================================================

function buildHUD() {
  hudEl = document.getElementById("routeStudioHud");
  if (hudEl) return;

  hudEl = document.createElement("div");
  hudEl.id = "routeStudioHud";
  hudEl.className =
    "hidden fixed top-24 sm:top-28 left-1/2 -translate-x-1/2 " +
    "glass rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 " +
    "px-2.5 py-1.5 sm:px-3.5 sm:py-2 flex items-center gap-1.5 sm:gap-2.5 backdrop-blur-2xl animate-fade-in max-w-[96vw] overflow-x-auto hide-scrollbar pointer-events-auto";
  hudEl.style.zIndex = "1040";

  hudEl.innerHTML = `
    <!-- Route Weather Branding & Status -->
    <div class="flex items-center gap-1.5 flex-shrink-0 cursor-pointer min-w-0" id="routeHudSummaryPill" title="View stops & trip itinerary">
      <div class="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-600 dark:text-indigo-400 font-extrabold text-[11px] select-none flex-shrink-0">
        <span>🚗</span>
        <span class="tracking-tight hidden xs:inline font-bold">Route Weather</span>
      </div>
      <div class="relative flex h-2 w-2 flex-shrink-0">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
      </div>
      <div id="routeHudStatus" class="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[110px] sm:max-w-[200px]">
        Tap map to add start
      </div>
      <span id="routeHudWeatherBadge" class="hidden select-none"></span>
    </div>

    <!-- Divider -->
    <div class="h-4 w-px bg-slate-300 dark:bg-slate-700 flex-shrink-0"></div>

    <!-- Mode Selector -->
    <div class="flex items-center gap-0.5 bg-slate-100/90 dark:bg-slate-800/90 p-0.5 rounded-xl flex-shrink-0" id="routeHudModeGroup">
      <button type="button" data-mode="driving" class="route-mode-btn px-2 py-1 rounded-lg text-xs font-semibold transition-all bg-white dark:bg-indigo-600 shadow-xs text-indigo-600 dark:text-white flex items-center gap-1 cursor-pointer" title="Drive (Roads)">
        <span>🚗</span><span class="hidden md:inline text-[11px]">Drive</span>
      </button>
      <button type="button" data-mode="cycling" class="route-mode-btn px-2 py-1 rounded-lg text-xs font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer" title="Bike (Cycling)">
        <span>🚲</span><span class="hidden md:inline text-[11px]">Bike</span>
      </button>
      <button type="button" data-mode="walking" class="route-mode-btn px-2 py-1 rounded-lg text-xs font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer" title="Walk">
        <span>🚶</span><span class="hidden md:inline text-[11px]">Walk</span>
      </button>
      <button type="button" data-mode="direct" class="route-mode-btn px-2 py-1 rounded-lg text-xs font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer" title="Flight">
        <span>✈️</span><span class="hidden md:inline text-[11px]">Flight</span>
      </button>
    </div>

    <!-- Divider -->
    <div class="h-4 w-px bg-slate-300 dark:bg-slate-700 flex-shrink-0"></div>

    <!-- Action Buttons -->
    <div class="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
      <button type="button" id="routeHudAddSearch" class="p-1.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-slate-700/60 text-indigo-600 dark:text-indigo-400 transition-colors" title="Search place to add stop" aria-label="Add stop by search">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
      </button>

      <button type="button" id="routeHudUndo" class="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300 transition-colors" title="Undo last stop (Ctrl+Z)" aria-label="Undo">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a5 5 0 015 5v2m-15-7l4-4m-4 4l4 4"/></svg>
      </button>

      <button type="button" id="routeHudOptimize" class="p-1.5 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 transition-colors hidden" title="⚡ Optimize stop sequence (2-Opt TSP for 4+ stops)" aria-label="Optimize stops">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
      </button>

      <button type="button" id="routeHudReverse" class="p-1.5 rounded-xl hover:bg-slate-200/60 dark:hover:bg-slate-700/60 text-slate-600 dark:text-slate-300 transition-colors" title="Reverse route direction" aria-label="Reverse">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
      </button>

      <button type="button" id="routeHudClear" class="p-1.5 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-500 transition-colors" title="Clear all stops" aria-label="Clear">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      </button>

      <button type="button" id="routeHudFinish" class="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:brightness-110 active:scale-95 text-white text-xs font-bold shadow-sm shadow-indigo-500/25 transition-all flex items-center gap-1 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap cursor-pointer flex-shrink-0" title="Analyze route weather">
        <span>🌤️ Analyze</span>
      </button>

      <button type="button" id="routeHudExit" class="w-7 h-7 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors flex items-center justify-center font-bold text-sm cursor-pointer flex-shrink-0 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/40" title="Close Route Weather (Esc)" aria-label="Close Route Weather">✕</button>
    </div>
  `;

  document.body.appendChild(hudEl);

  hudEl.querySelectorAll(".route-mode-btn").forEach((b) => {
    b.addEventListener("click", () => {
      setTransportMode(b.dataset.mode);
    });
  });

  hudEl.querySelector("#routeHudAddSearch")?.addEventListener("click", () => {
    showPanel();
    activeRouteTab = "stops";
    if (pts.length >= 2) {
      fetchAndRenderRoutePlan();
    } else {
      renderEmptyRoutePanel();
    }
    setTimeout(() => {
      document.getElementById("routeSearchAddInput")?.focus();
    }, 100);
  });

  hudEl.querySelector("#routeHudSummaryPill")?.addEventListener("click", () => {
    if (pts.length >= 2) {
      finishRoute();
    } else {
      showPanel();
      renderEmptyRoutePanel();
    }
  });

  hudEl.querySelector("#routeHudUndo")?.addEventListener("click", undoLastStop);
  hudEl.querySelector("#routeHudOptimize")?.addEventListener("click", optimizeWaypointOrder);
  hudEl.querySelector("#routeHudReverse")?.addEventListener("click", reverseRoute);
  hudEl.querySelector("#routeHudClear")?.addEventListener("click", clearRoute);
  hudEl.querySelector("#routeHudFinish")?.addEventListener("click", finishRoute);
  hudEl.querySelector("#routeHudExit")?.addEventListener("click", closeRouteStudio);
}

function showHUD() {
  if (hudEl) {
    hudEl.classList.remove("hidden");
    hudEl.style.display = "flex";
  }
}

function hideHUD() {
  if (hudEl) {
    hudEl.classList.add("hidden");
    hudEl.style.display = "none";
  }
}

function setTransportMode(mode) {
  transportMode = mode;
  document.querySelectorAll(".route-mode-btn").forEach((b) => {
    if (b.dataset.mode === mode) {
      b.className =
        "route-mode-btn px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition-all bg-white dark:bg-indigo-600 shadow-xs text-indigo-600 dark:text-white flex items-center gap-1 cursor-pointer";
    } else {
      b.className =
        "route-mode-btn px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer";
    }
  });

  const modeIconEl = document.getElementById("routePanelModeIcon");
  if (modeIconEl) {
    let icon = "🚗";
    if (mode === "cycling") icon = "🚲";
    else if (mode === "walking") icon = "🚶";
    else if (mode === "direct") icon = "✈️";
    modeIconEl.textContent = icon;
  }

  updateRouteGeometry();
  if (isPanelOpen && pts.length >= 2) fetchAndRenderRoutePlan();
}

function updateHUD() {
  const units = getActiveUnits();
  const panelStopsCountEl = document.getElementById("routePanelStopsCount");
  if (panelStopsCountEl) panelStopsCountEl.textContent = String(pts.length);

  const panelOptimizeBtn = document.getElementById("routePanelOptimizeBtn");
  if (panelOptimizeBtn) {
    if (pts.length >= 4) {
      panelOptimizeBtn.classList.remove("hidden");
    } else {
      panelOptimizeBtn.classList.add("hidden");
    }
  }

  const liveStatsEl = document.getElementById("routePanelLiveStats");
  if (liveStatsEl) {
    if (pts.length >= 2) {
      const distStr = activeRouteData ? formatRouteDistance(activeRouteData.distanceM, units) : "--";
      const durStr = activeRouteData ? formatRouteDuration(activeRouteData.durationS) : "--";
      let modeIcon = "🚗";
      if (transportMode === "cycling") modeIcon = "🚲";
      else if (transportMode === "walking") modeIcon = "🚶";
      else if (transportMode === "direct") modeIcon = "✈️";
      liveStatsEl.innerHTML = `<span class="text-slate-500 dark:text-slate-400 font-medium">${pts.length} stops ·</span> ${modeIcon} ${durStr} · ${distStr}`;
    } else if (pts.length === 1) {
      liveStatsEl.textContent = "1 stop placed";
    } else {
      liveStatsEl.textContent = "Click map to start";
    }
  }

  if (hudEl) {
    const statusEl = hudEl.querySelector("#routeHudStatus");
    const finishBtn = hudEl.querySelector("#routeHudFinish");
    const optBtn = hudEl.querySelector("#routeHudOptimize");
    if (optBtn) {
      if (pts.length >= 4) optBtn.classList.remove("hidden");
      else optBtn.classList.add("hidden");
    }
    if (pts.length === 0) {
      if (statusEl) statusEl.textContent = "Tap map to add start";
      if (finishBtn) finishBtn.disabled = true;
    } else if (pts.length === 1) {
      if (statusEl) statusEl.textContent = "Tap map for destination";
      if (finishBtn) finishBtn.disabled = true;
    } else {
      const distStr = activeRouteData ? formatRouteDistance(activeRouteData.distanceM, units) : "--";
      const durStr = activeRouteData ? formatRouteDuration(activeRouteData.durationS) : "--";
      let modeIcon = "🚗";
      if (transportMode === "cycling") modeIcon = "🚲";
      else if (transportMode === "walking") modeIcon = "🚶";
      else if (transportMode === "direct") modeIcon = "✈️";
      if (statusEl) {
        statusEl.innerHTML = `<span class="font-extrabold text-indigo-600 dark:text-indigo-400">${pts.length} stops</span> · ${modeIcon} ${durStr} · ${distStr}`;
      }
      if (finishBtn) finishBtn.disabled = false;
    }
  }
}

// ============================================================================
//  ROUTE STUDIO PANEL (Drawer / Analysis View)
// ============================================================================

function buildPanel() {
  panelEl = document.getElementById("routePanel");
  if (panelEl) return;

  panelEl = document.createElement("div");
  panelEl.id = "routePanel";
  panelEl.className =
    "hidden glass rounded-3xl shadow-2xl overflow-hidden fixed top-16 sm:top-20 right-3 sm:right-6 " +
    "w-[94vw] sm:w-[440px] max-h-[calc(100vh-100px)] flex flex-col " +
    "border border-slate-200/80 dark:border-slate-700/70 backdrop-blur-2xl animate-fade-in pointer-events-auto";
  panelEl.style.zIndex = "2000";

  panelEl.innerHTML = `
    <!-- Drag handle for mobile -->
    <div id="routePanelDragHandle" class="sm:hidden w-16 h-5 mx-auto mt-1 mb-0.5 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none" title="Drag to resize · Tap to toggle">
      <div class="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></div>
    </div>

    <!-- Header -->
    <div id="routePanelHeader" class="flex items-center justify-between px-4 py-2.5 sm:py-3 border-b border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-800/50 flex-shrink-0 sm:cursor-grab active:sm:cursor-grabbing select-none">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-indigo-500/20 flex-shrink-0" id="routePanelModeIcon">🚗</div>
        <div class="min-w-0">
          <h3 class="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 truncate" id="routePanelTitle">Route Weather Studio</h3>
          <div id="routePanelSubtitle" class="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">Trip Weather & Safety Intelligence</div>
        </div>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <button type="button" id="routePanelViewMapBtn" class="px-2.5 py-1 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200/50 dark:border-indigo-800/40 transition-colors sm:hidden flex items-center gap-1 cursor-pointer" title="View route on map">
          <span>🗺️</span><span>Map</span>
        </button>
        <button type="button" id="routePanelUndoBtn" class="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors" title="Undo last stop (Ctrl+Z)" aria-label="Undo">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 10h10a5 5 0 015 5v2m-15-7l4-4m-4 4l4 4"/></svg>
        </button>
        <button type="button" id="routePanelReverseBtn" class="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors" title="Reverse route direction" aria-label="Reverse">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
        </button>
        <button type="button" id="routePanelOptimizeBtn" class="px-2 py-1 rounded-lg text-xs font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-slate-700/50 transition-colors hidden" title="⚡ Optimize intermediate stops (2-Opt TSP)">⚡ Optimize</button>
        <button type="button" id="routePanelClearBtn" class="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-500 transition-colors" title="Clear entire route" aria-label="Clear">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
        </button>
        <button type="button" id="routePanelCloseBtn" class="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/50 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors ml-1 font-bold text-sm" aria-label="Close route panel">✕</button>
      </div>
    </div>

    <!-- Integrated Transport Modes & Live Trip Status Strip -->
    <div class="px-3.5 py-2 border-b border-slate-200/60 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between gap-2 flex-shrink-0">
      <!-- Mode buttons -->
      <div class="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800/80 p-0.5 rounded-xl flex-shrink-0" id="routePanelModeGroup">
        <button type="button" data-mode="driving" class="route-mode-btn px-2 sm:px-2.5 py-1 rounded-lg text-xs font-semibold transition-all bg-white dark:bg-indigo-600 shadow-xs text-indigo-600 dark:text-white flex items-center gap-1 cursor-pointer" title="Drive (Road network)">
          <span>🚗</span><span class="text-[11px]">Drive</span>
        </button>
        <button type="button" data-mode="cycling" class="route-mode-btn px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer" title="Bike (Cycling pace ~18 km/h)">
          <span>🚲</span><span class="text-[11px]">Bike</span>
        </button>
        <button type="button" data-mode="walking" class="route-mode-btn px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer" title="Walk (Hiking pace ~4.8 km/h)">
          <span>🚶</span><span class="text-[11px]">Walk</span>
        </button>
        <button type="button" data-mode="direct" class="route-mode-btn px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition-all text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1 cursor-pointer" title="Flight (Great circle arc)">
          <span>✈️</span><span class="text-[11px]">Flight</span>
        </button>
      </div>

      <!-- Live Trip Stats (Duration & Distance) -->
      <div id="routePanelLiveStats" class="text-right text-xs font-black text-indigo-600 dark:text-indigo-400 truncate min-w-0">
        --
      </div>
    </div>

    <!-- Tab Strip -->
    <div class="flex items-center border-b border-slate-200/60 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-900/60 px-3 py-1.5 gap-1.5 flex-shrink-0" id="routePanelTabStrip">
      <button type="button" data-route-tab="stops" class="route-tab-pill flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/60 dark:border-slate-700/60 cursor-pointer">
        🗺️ Stops (<span id="routePanelStopsCount">0</span>)
      </button>
      <button type="button" data-route-tab="weather" class="route-tab-pill flex-1 py-1.5 px-2 rounded-xl text-xs font-medium transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
        🌤️ Weather
      </button>
      <button type="button" data-route-tab="analytics" class="route-tab-pill flex-1 py-1.5 px-2 rounded-xl text-xs font-medium transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer">
        📊 Analytics
      </button>
    </div>

    <!-- Scrollable Content -->
    <div id="routePanelBody" class="overflow-y-auto custom-scrollbar p-3.5 space-y-3.5 text-slate-700 dark:text-slate-200 text-xs flex-1">
      <!-- Injected dynamically in finishRoute() or renderEmptyRoutePanel() -->
    </div>

    <!-- Pro Actions Footer -->
    <div class="px-3.5 py-3 border-t border-slate-200/60 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/60 flex flex-wrap gap-2 flex-shrink-0 justify-between">
      <button type="button" id="routeNavBtn" class="flex-1 min-w-[130px] py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-xs shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5 transition-all cursor-pointer">
        <span>🚗 Start Navigation</span>
      </button>

      <div class="flex items-center gap-1.5">
        <button type="button" id="routeExportGpxBtn" class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/60 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer" title="Export GPX file for Garmin/Strava/GPS">
          📥 GPX
        </button>
        <button type="button" id="routeShareBtn" class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/60 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer" title="Copy route itinerary & GeoJSON">
          📋 Share
        </button>
        <button type="button" id="routeSaveBtn" class="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/60 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors cursor-pointer" title="Save trip to favorite routes">
          💾 Save
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(panelEl);

  // Bind transport modes inside the merged panel
  panelEl.querySelectorAll(".route-mode-btn").forEach((b) => {
    b.addEventListener("click", () => {
      setTransportMode(b.dataset.mode);
    });
  });

  // Bind tab switching
  panelEl.querySelectorAll(".route-tab-pill").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => {
      activeRouteTab = tabBtn.dataset.routeTab;
      if (isMobileLayout() && routeSheetState === "peek") {
        snapRouteSheet("half");
      }
      panelEl.querySelectorAll(".route-tab-pill").forEach((b) => {
        if (b.dataset.routeTab === activeRouteTab) {
          b.className =
            "route-tab-pill flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200/60 dark:border-slate-700/60 cursor-pointer";
        } else {
          b.className =
            "route-tab-pill flex-1 py-1.5 px-2 rounded-xl text-xs font-medium transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer";
        }
      });
      const stopsView = panelEl.querySelector("#routeTabStopsContent");
      const weatherView = panelEl.querySelector("#routeTabWeatherContent");
      const analyticsView = panelEl.querySelector("#routeTabAnalyticsContent");
      if (stopsView) stopsView.classList.toggle("hidden", activeRouteTab !== "stops");
      if (weatherView) weatherView.classList.toggle("hidden", activeRouteTab !== "weather");
      if (analyticsView) analyticsView.classList.toggle("hidden", activeRouteTab !== "analytics");
    });
  });

  panelEl.querySelector("#routePanelUndoBtn")?.addEventListener("click", undoLastStop);
  panelEl.querySelector("#routePanelReverseBtn")?.addEventListener("click", reverseRoute);
  panelEl.querySelector("#routePanelViewMapBtn")?.addEventListener("click", () => {
    if (isMobileLayout()) {
      hidePanel();
      showHUD();
      updateHUD();
      appRef?.showToast?.("🗺️ Showing route on map. Tap 'Analyze' to return to full-screen view.", "info");
    }
  });
  panelEl.querySelector("#routePanelCloseBtn")?.addEventListener("click", closeRouteStudio);
  panelEl.querySelector("#routePanelClearBtn")?.addEventListener("click", clearRoute);
  panelEl.querySelector("#routePanelOptimizeBtn")?.addEventListener("click", optimizeWaypointOrder);

  panelEl.querySelector("#routeNavBtn")?.addEventListener("click", handoverToNavigation);
  panelEl.querySelector("#routeExportGpxBtn")?.addEventListener("click", exportGPXFile);
  panelEl.querySelector("#routeShareBtn")?.addEventListener("click", shareRouteItinerary);
  panelEl.querySelector("#routeSaveBtn")?.addEventListener("click", saveRouteToFavorites);

  initRoutePanelInteractions();
}

let routeSheetState = "half"; // 'peek' | 'half' | 'full'

export function isMobileLayout() {
  return typeof window !== "undefined" && window.innerWidth < 640;
}

export function snapRouteSheet(state = "half") {
  if (!panelEl) return;
  routeSheetState = state;
  const vh = window.innerHeight;
  panelEl.classList.remove("sheet-peek", "sheet-half", "sheet-full");
  panelEl.classList.add(`sheet-${state}`);
  panelEl.style.transition =
    "height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), max-height 0.35s cubic-bezier(0.2, 0.9, 0.3, 1), transform 0.35s cubic-bezier(0.2, 0.9, 0.3, 1)";
  panelEl.style.transform = "translateY(0)";

  if (state === "peek") {
    const targetHeight = 150;
    panelEl.style.setProperty("top", "auto", "important");
    panelEl.style.setProperty("bottom", "calc(3.5rem + env(safe-area-inset-bottom, 0px) + 0.5rem)", "important");
    panelEl.style.setProperty("left", "0.75rem", "important");
    panelEl.style.setProperty("right", "0.75rem", "important");
    panelEl.style.setProperty("width", "auto", "important");
    panelEl.style.setProperty("height", `${targetHeight}px`, "important");
    panelEl.style.setProperty("max-height", `${targetHeight}px`, "important");
    panelEl.style.setProperty("border-radius", "1.5rem", "important");
  } else if (state === "half") {
    const targetHeight = Math.round(vh * 0.52);
    panelEl.style.setProperty("top", "auto", "important");
    panelEl.style.setProperty("bottom", "calc(3.5rem + env(safe-area-inset-bottom, 0px) + 0.5rem)", "important");
    panelEl.style.setProperty("left", "0.75rem", "important");
    panelEl.style.setProperty("right", "0.75rem", "important");
    panelEl.style.setProperty("width", "auto", "important");
    panelEl.style.setProperty("height", `${targetHeight}px`, "important");
    panelEl.style.setProperty("max-height", `${targetHeight}px`, "important");
    panelEl.style.setProperty("border-radius", "1.5rem", "important");
  } else if (state === "full") {
    panelEl.style.setProperty("top", "0px", "important");
    panelEl.style.setProperty("bottom", "0px", "important");
    panelEl.style.setProperty("left", "0px", "important");
    panelEl.style.setProperty("right", "0px", "important");
    panelEl.style.setProperty("width", "100%", "important");
    panelEl.style.setProperty("height", "100dvh", "important");
    panelEl.style.setProperty("max-height", "100dvh", "important");
    panelEl.style.setProperty("border-radius", "0px", "important");
  }
}

function initRoutePanelInteractions() {
  const dragHandle = panelEl.querySelector("#routePanelDragHandle");
  const header = panelEl.querySelector("#routePanelHeader");
  if (!dragHandle || !header) return;

  // ── 1. Mobile Sheet Gesture & Touch Dragging ────────────────────────
  let isDraggingMobile = false;
  let startY = 0;
  let initialHeight = 0;
  let startTime = 0;

  const onTouchStart = (e) => {
    if (!isMobileLayout()) return;
    isDraggingMobile = true;
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    initialHeight = panelEl.getBoundingClientRect().height;
    startTime = Date.now();
    panelEl.style.transition = "none";
  };

  const onTouchMove = (e) => {
    if (!isDraggingMobile) return;
    const currentY = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = startY - currentY; // Up is positive (expand)
    const newHeight = initialHeight + deltaY;
    const vh = window.innerHeight;

    if (newHeight >= 140 && newHeight <= vh * 0.90) {
      panelEl.style.setProperty("height", `${newHeight}px`, "important");
      panelEl.style.setProperty("max-height", `${newHeight}px`, "important");
      panelEl.style.transform = "translateY(0)";
    } else if (newHeight < 140) {
      const overdrag = 140 - newHeight;
      panelEl.style.transform = `translateY(${overdrag * 0.5}px)`;
    }
  };

  const onTouchEnd = (e) => {
    if (!isDraggingMobile) return;
    isDraggingMobile = false;
    const endY =
      e.changedTouches && e.changedTouches[0]
        ? e.changedTouches[0].clientY
        : e.clientY;
    const deltaY = startY - endY;
    const duration = Date.now() - startTime;
    const velocity = deltaY / (duration || 1);

    if (velocity > 0.4) {
      if (routeSheetState === "peek") snapRouteSheet("half");
      else snapRouteSheet("full");
    } else if (velocity < -0.4) {
      if (routeSheetState === "full") snapRouteSheet("half");
      else snapRouteSheet("peek");
    } else {
      const currentHeight = panelEl.getBoundingClientRect().height;
      const vh = window.innerHeight;
      if (currentHeight < vh * 0.32) {
        snapRouteSheet("peek");
      } else if (currentHeight < vh * 0.70) {
        snapRouteSheet("half");
      } else {
        snapRouteSheet("full");
      }
    }
    appRef?._haptic?.("light");
  };

  // Drag handle events (touch & click toggle)
  dragHandle.addEventListener("touchstart", onTouchStart, { passive: true });
  dragHandle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!isMobileLayout()) return;
    appRef?._haptic?.("selection");
    if (routeSheetState === "peek") snapRouteSheet("half");
    else if (routeSheetState === "half") snapRouteSheet("full");
    else snapRouteSheet("peek");
  });

  // Header drag on mobile (ignores clicks on buttons)
  header.addEventListener(
    "touchstart",
    (e) => {
      if (e.target.closest("button") || e.target.closest("input")) return;
      onTouchStart(e);
    },
    { passive: true },
  );

  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });

  // ── 2. Desktop Floating Window Dragging (Move anywhere) ───────────
  let isDraggingDesktop = false;
  let dragOffset = { x: 0, y: 0 };

  header.addEventListener("pointerdown", (e) => {
    if (isMobileLayout()) return;
    if (e.target.closest("button") || e.target.closest("input")) return;
    isDraggingDesktop = true;
    header.classList.add("cursor-grabbing");
    header.classList.remove("cursor-grab");

    const rect = panelEl.getBoundingClientRect();
    dragOffset.x = e.clientX - rect.left;
    dragOffset.y = e.clientY - rect.top;

    panelEl.style.left = `${rect.left}px`;
    panelEl.style.top = `${rect.top}px`;
    panelEl.style.right = "auto";
    panelEl.style.bottom = "auto";
    panelEl.style.margin = "0";
    panelEl.style.transition = "none";

    header.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });

  window.addEventListener("pointermove", (e) => {
    if (!isDraggingDesktop) return;
    const maxX = window.innerWidth - panelEl.offsetWidth;
    const maxY = window.innerHeight - 80;
    const nextLeft = Math.max(8, Math.min(maxX - 8, e.clientX - dragOffset.x));
    const nextTop = Math.max(60, Math.min(maxY, e.clientY - dragOffset.y));

    panelEl.style.left = `${nextLeft}px`;
    panelEl.style.top = `${nextTop}px`;
  });

  const stopDesktopDrag = () => {
    if (!isDraggingDesktop) return;
    isDraggingDesktop = false;
    header.classList.remove("cursor-grabbing");
    header.classList.add("cursor-grab");
    panelEl.style.transition = "";
  };

  window.addEventListener("pointerup", stopDesktopDrag);
  window.addEventListener("pointercancel", stopDesktopDrag);

  // Resize listener to switch cleanly between mobile sheet and desktop card
  window.addEventListener("resize", () => {
    if (!isMobileLayout()) {
      panelEl.classList.remove("sheet-peek", "sheet-half", "sheet-full");
      panelEl.style.height = "";
      panelEl.style.maxHeight = "";
      panelEl.style.transform = "";
    } else {
      panelEl.style.left = "";
      panelEl.style.top = "";
      panelEl.style.right = "";
      panelEl.style.bottom = "";
      snapRouteSheet(routeSheetState || "full");
    }
  });
}

function showPanel() {
  if (panelEl) {
    panelEl.classList.remove("hidden");
    panelEl.style.display = "flex";
    isPanelOpen = true;
    if (isMobileLayout()) {
      snapRouteSheet("full");
    }
  }
}

function hidePanel() {
  if (panelEl) {
    panelEl.classList.add("hidden");
    panelEl.style.display = "none";
    isPanelOpen = false;
  }
}

export function isRoutePanelOpen() {
  return isPanelOpen;
}

function renderEmptyRoutePanel() {
  const bodyEl = panelEl ? panelEl.querySelector("#routePanelBody") : document.getElementById("routePanelBody");
  if (!bodyEl) return;

  const panelStopsCountEl = document.getElementById("routePanelStopsCount") || panelEl?.querySelector("#routePanelStopsCount");
  if (panelStopsCountEl) panelStopsCountEl.textContent = String(pts.length);

  const liveStatsEl = document.getElementById("routePanelLiveStats") || panelEl?.querySelector("#routePanelLiveStats");
  if (liveStatsEl) {
    liveStatsEl.textContent = pts.length === 1 ? "1 Stop (Need 2+)" : "--";
  }

  const singleStopCardHtml =
    pts.length === 1
      ? `
      <div class="rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 p-3 space-y-2 hover:border-indigo-400/50 transition-all shadow-xs">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider flex-shrink-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">Start (A)</span>
            <div class="min-w-0">
              <div class="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">${escapeXml(pts[0].name || "Departure Point")}</div>
              <div class="text-[10px] text-slate-400 font-mono">${pts[0].lat.toFixed(4)}, ${pts[0].lng.toFixed(4)}</div>
            </div>
          </div>

          <button type="button" class="route-delete-stop-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors cursor-pointer" data-delete-idx="0" title="Remove this stop" aria-label="Delete stop">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </div>
      </div>
    `
      : "";

  bodyEl.innerHTML = `
    <div class="space-y-3">
      <!-- Search Place to Add Stop -->
      <div class="relative">
        <div class="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all shadow-xs">
          <span class="text-slate-400 text-xs">🔍</span>
          <input type="text" id="routeSearchAddInput" placeholder="Add stop by city, address or landmark..." class="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none" autocomplete="off" />
          <div id="routeSearchAddSpinner" class="hidden w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin flex-shrink-0"></div>
        </div>
        <div id="routeSearchAddDropdown" class="hidden absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 p-1.5 z-50 max-h-52 overflow-y-auto custom-scrollbar"></div>
      </div>

      ${singleStopCardHtml}

      <div class="py-10 text-center space-y-3">
        <div class="text-4xl">🗺️</div>
        <div class="font-extrabold text-sm text-slate-800 dark:text-slate-100">
          ${pts.length === 0 ? "Place Departure Point" : "Add Destination Stop"}
        </div>
        <div class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-[280px] mx-auto">
          ${
            pts.length === 0
              ? "Click anywhere on the map or type a city in the search bar above to set your departure point (A)."
              : "Click the map or search above to set your destination point (B) or intermediate waypoints."
          }
        </div>
      </div>
    </div>
  `;

  bodyEl.querySelectorAll(".route-delete-stop-btn").forEach((delBtn) => {
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(delBtn.dataset.deleteIdx, 10);
      removeStop(idx);
    });
  });

  bindRouteSearchAddEvents(bodyEl);
}

/**
 * Binds autocomplete search input for quickly adding stops by place name
 */
function bindRouteSearchAddEvents(containerEl) {
  if (!containerEl) return;
  const inputEl = containerEl.querySelector("#routeSearchAddInput");
  const dropdownEl = containerEl.querySelector("#routeSearchAddDropdown");
  const spinnerEl = containerEl.querySelector("#routeSearchAddSpinner");
  if (!inputEl || !dropdownEl) return;

  let debounceTimer = null;

  inputEl.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    if (debounceTimer) clearTimeout(debounceTimer);

    if (val.length < 2) {
      dropdownEl.classList.add("hidden");
      dropdownEl.innerHTML = "";
      if (spinnerEl) spinnerEl.classList.add("hidden");
      return;
    }

    if (spinnerEl) spinnerEl.classList.remove("hidden");

    debounceTimer = setTimeout(async () => {
      try {
        const results = await searchPlacesForRoute(val);
        if (spinnerEl) spinnerEl.classList.add("hidden");

        if (!results || results.length === 0) {
          dropdownEl.innerHTML = `
            <div class="p-2.5 text-center text-xs text-slate-400">
              No matching places found
            </div>
          `;
          dropdownEl.classList.remove("hidden");
          return;
        }

        dropdownEl.innerHTML = results
          .map(
            (r, i) => `
          <button type="button" class="route-search-result-item w-full text-left p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors flex items-center justify-between gap-2 cursor-pointer group" data-idx="${i}">
            <div class="min-w-0">
              <div class="text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">${escapeXml(r.name)}</div>
              ${r.details ? `<div class="text-[10px] text-slate-400 truncate">${escapeXml(r.details)}</div>` : ""}
            </div>
            <span class="text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity font-bold">+ Add</span>
          </button>
        `,
          )
          .join("");

        dropdownEl.classList.remove("hidden");

        dropdownEl.querySelectorAll(".route-search-result-item").forEach((btn) => {
          btn.addEventListener("click", () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const item = results[idx];
            if (item) {
              dropdownEl.classList.add("hidden");
              inputEl.value = "";
              addStop(item.lat, item.lng, item.name);
            }
          });
        });
      } catch (err) {
        if (spinnerEl) spinnerEl.classList.add("hidden");
        dropdownEl.classList.add("hidden");
      }
    }, 280);
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      dropdownEl.classList.add("hidden");
    }
  });

  // Hide dropdown on click outside
  document.addEventListener(
    "click",
    (e) => {
      if (!containerEl.contains(e.target)) {
        dropdownEl.classList.add("hidden");
      }
    },
    { capture: true },
  );
}

// ============================================================================
//  ROUTE WEATHER SAMPLING & ARRIVAL ETA FORECAST
// ============================================================================

export async function finishRoute() {
  closeWaypointPopover();
  if (pts.length < 2) {
    showPanel();
    renderEmptyRoutePanel();
    appRef.showToast("Add at least 2 stops to analyze your trip", "info");
    return;
  }

  showPanel();
  hideHUD();
  updateHUD();
  showRoutePanelLoading();

  appRef.showToast("Fetching time-aware weather along route…", "info");

  try {
    await fetchAndRenderRoutePlan();
  } catch (err) {
    console.error("Route analysis failed:", err);
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="py-8 text-center text-rose-500 space-y-2">
          <div class="text-xl">⚠️</div>
          <div class="font-bold">Weather Analysis Failed</div>
          <div class="text-xs text-slate-400">Unable to reach weather services. Check network connection and retry.</div>
          <button type="button" id="routeRetryBtn" class="mt-2 px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs cursor-pointer">Retry</button>
        </div>
      `;
      panelEl.querySelector("#routeRetryBtn")?.addEventListener("click", finishRoute);
    }
  }
}

function showRoutePanelLoading() {
  const bodyEl = panelEl ? panelEl.querySelector("#routePanelBody") : document.getElementById("routePanelBody");
  if (!bodyEl) return;

  const panelStopsCountEl = document.getElementById("routePanelStopsCount") || panelEl?.querySelector("#routePanelStopsCount");
  if (panelStopsCountEl) panelStopsCountEl.textContent = String(pts.length);

  const liveStatsEl = document.getElementById("routePanelLiveStats") || panelEl?.querySelector("#routePanelLiveStats");
  if (liveStatsEl) liveStatsEl.textContent = "Loading data…";

  bodyEl.innerHTML = `
    <div class="py-10 px-4 text-center space-y-4">
      <div class="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/40 text-2xl shadow-sm mx-auto">
        <span class="animate-spin inline-block">🧭</span>
      </div>
      <div class="space-y-1">
        <div class="font-extrabold text-sm text-slate-900 dark:text-slate-100">Loading Route & Weather Data…</div>
        <div class="text-xs text-slate-500 dark:text-slate-400">Computing road navigation & live weather along ${pts.length} stops…</div>
      </div>
      <div class="space-y-2.5 pt-2 max-w-[340px] mx-auto">
        <div class="p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-3 animate-pulse">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-indigo-500/20"></div>
            <div class="space-y-1.5 text-left">
              <div class="h-3 w-28 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
              <div class="h-2 w-16 bg-slate-200/60 dark:bg-slate-700/40 rounded-md"></div>
            </div>
          </div>
          <div class="h-6 w-14 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
        </div>
        <div class="p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-3 animate-pulse">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-indigo-500/20"></div>
            <div class="space-y-1.5 text-left">
              <div class="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
              <div class="h-2 w-20 bg-slate-200/60 dark:bg-slate-700/40 rounded-md"></div>
            </div>
          </div>
          <div class="h-6 w-14 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
        </div>
        <div class="p-3 rounded-2xl bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-3 animate-pulse">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-7 h-7 rounded-lg bg-indigo-500/20"></div>
            <div class="space-y-1.5 text-left">
              <div class="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded-md"></div>
              <div class="h-2 w-14 bg-slate-200/60 dark:bg-slate-700/40 rounded-md"></div>
            </div>
          </div>
          <div class="h-6 w-14 bg-slate-200 dark:bg-slate-700 rounded-lg"></div>
        </div>
      </div>
    </div>
  `;
}

async function fetchAndRenderRoutePlan() {
  if (isPanelOpen) {
    showRoutePanelLoading();
  }
  const units = getActiveUnits();
  const totalDurationS = activeRouteData?.durationS || 3600;
  const departureDate = new Date(Date.now() + departureOffsetHours * 3600 * 1000);

  const etaWaypoints = calculateETAs(pts, totalDurationS, departureDate);

  const weatherPromises = etaWaypoints.map(async (wpt) => {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${wpt.lat}&longitude=${wpt.lng}` +
        `&current=temperature_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m` +
        `&hourly=temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,visibility` +
        `&timezone=auto`;
      const r = await fetch(url);
      if (!r.ok) return null;
      const data = await r.json();

      const etaIsoHour = wpt.eta.toISOString().slice(0, 13);
      let sampled = null;

      if (data.hourly && data.hourly.time) {
        let matchIdx = data.hourly.time.findIndex((t) => t.startsWith(etaIsoHour));
        if (matchIdx === -1) matchIdx = 0;

        sampled = {
          temperature: data.hourly.temperature_2m?.[matchIdx],
          precipitationProb: data.hourly.precipitation_probability?.[matchIdx] ?? 0,
          precipitation: data.hourly.precipitation?.[matchIdx] ?? 0,
          weatherCode: data.hourly.weather_code?.[matchIdx] ?? data.current?.weather_code ?? 0,
          windSpeed: data.hourly.wind_speed_10m?.[matchIdx] ?? data.current?.wind_speed_10m ?? 0,
          windDirection: data.hourly.wind_direction_10m?.[matchIdx] ?? data.current?.wind_direction_10m ?? 0,
          visibility: data.hourly.visibility?.[matchIdx] ?? 10000,
        };
      } else {
        sampled = {
          temperature: data.current?.temperature_2m ?? 20,
          precipitationProb: 0,
          precipitation: data.current?.precipitation ?? 0,
          weatherCode: data.current?.weather_code ?? 0,
          windSpeed: data.current?.wind_speed_10m ?? 10,
          windDirection: data.current?.wind_direction_10m ?? 0,
          visibility: 10000,
        };
      }

      const hazards = detectWeatherHazards(sampled);

      return {
        ...wpt,
        weather: sampled,
        hazards,
      };
    } catch (e) {
      console.warn("Stop weather fetch failed:", wpt, e);
      return {
        ...wpt,
        weather: {
          temperature: 20,
          precipitationProb: 0,
          precipitation: 0,
          weatherCode: 0,
          windSpeed: 10,
          visibility: 10000,
        },
        hazards: [],
      };
    }
  });

  const stopResults = await Promise.all(weatherPromises);
  const validStops = stopResults.filter(Boolean);

  renderRoutePanelContent(validStops, units);
}

function renderRoutePanelContent(stops, units) {
  const bodyEl = panelEl ? panelEl.querySelector("#routePanelBody") : document.getElementById("routePanelBody");
  if (!bodyEl) return;

  lastLoadedStops = stops;
  updateRouteSegmentColors(stops);

  const totalDistanceM = activeRouteData?.distanceM || 0;
  const totalDurationS = activeRouteData?.durationS || 0;
  const allHazards = stops.flatMap((s) => s.hazards);
  const rainyStopsCount = stops.filter((s) => s.weather.precipitation > 0 || s.weather.precipitationProb >= 50).length;

  const temps = stops.map((s) => s.weather.temperature).filter((t) => typeof t === "number");
  const minTemp = temps.length ? Math.min(...temps) : 20;
  const maxTemp = temps.length ? Math.max(...temps) : 20;
  const maxWind = stops.length ? Math.max(...stops.map((s) => s.weather.windSpeed || 0)) : 0;

  // Update header mode indicator
  let modeName = "Driving";
  let modeEmoji = "🚗";
  if (transportMode === "cycling") {
    modeName = "Cycling";
    modeEmoji = "🚲";
  } else if (transportMode === "walking") {
    modeName = "Walking";
    modeEmoji = "🚶";
  } else if (transportMode === "direct") {
    modeName = "Flight";
    modeEmoji = "✈️";
  }

  const modeIconEl = panelEl?.querySelector("#routePanelModeIcon");
  if (modeIconEl) modeIconEl.textContent = modeEmoji;

  const subtitleEl = panelEl?.querySelector("#routePanelSubtitle");
  if (subtitleEl) subtitleEl.textContent = `${modeName} Trip Weather & Safety Intelligence`;

  // Update stop count in panel tab strip
  const panelStopsCountEl = document.getElementById("routePanelStopsCount");
  if (panelStopsCountEl) panelStopsCountEl.textContent = String(stops.length);

  // Toggle Header Optimize Button if 4+ stops exist
  const panelOptBtn = panelEl ? panelEl.querySelector("#routePanelOptimizeBtn") : document.getElementById("routePanelOptimizeBtn");
  if (panelOptBtn) {
    if (stops.length >= 4) {
      panelOptBtn.classList.remove("hidden");
    } else {
      panelOptBtn.classList.add("hidden");
    }
  }

  // AuraCopilot Smart Environmental Briefing
  const copilotBriefing = generateAuraCopilotBriefing(activeRouteData, stops, allHazards, transportMode);
  let copilotHtml = "";
  if (copilotBriefing) {
    copilotHtml = `
      <div class="rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-slate-900/10 p-3 space-y-2 backdrop-blur-md">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1.5 font-bold text-xs text-indigo-700 dark:text-indigo-300">
            <span class="text-sm">✨</span>
            <span>AuraCopilot™ Briefing</span>
          </div>
          <span class="px-2 py-0.5 rounded-full border text-[10px] font-bold ${copilotBriefing.verdictBadge}">
            ${copilotBriefing.verdictIcon} ${copilotBriefing.verdictTitle}
          </span>
        </div>
        <p class="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
          ${copilotBriefing.narrative}
        </p>
        <div class="pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50 flex items-start gap-1.5 text-[10px] text-slate-600 dark:text-slate-400">
          <span class="font-bold text-indigo-500 dark:text-indigo-400 flex-shrink-0">PRO TIP:</span>
          <span>${copilotBriefing.tip}</span>
        </div>
      </div>
    `;
  }

  // Hazard Banner
  let hazardHtml = "";
  if (allHazards.length > 0) {
    const worst = allHazards[0];
    const isDanger = allHazards.some((h) => h.severity === "danger");
    const bannerBg = isDanger
      ? "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300"
      : "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300";

    hazardHtml = `
      <div class="rounded-2xl border p-3 flex items-start gap-2.5 ${bannerBg}">
        <span class="text-xl leading-none flex-shrink-0">${worst.icon}</span>
        <div>
          <div class="font-bold text-xs">${worst.title}</div>
          <div class="text-[11px] mt-0.5 leading-relaxed opacity-90">${worst.message}</div>
          ${allHazards.length > 1 ? `<div class="text-[10px] mt-1 font-semibold underline">+${allHazards.length - 1} more hazard alerts along route</div>` : ""}
        </div>
      </div>
    `;
  } else {
    hazardHtml = `
      <div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
        <span class="text-base">✨</span>
        <div class="font-medium text-[11px]">Clear travelling conditions — no severe weather hazards detected.</div>
      </div>
    `;
  }

  // Departure Time Chips
  const departureChips = [
    { label: "Leave Now", offset: 0 },
    { label: "+1 hr", offset: 1 },
    { label: "+2 hrs", offset: 2 },
    { label: "+4 hrs", offset: 4 },
  ]
    .map(
      (c) => `
      <button type="button" data-offset="${c.offset}" class="route-departure-chip px-2.5 py-1 rounded-xl text-[11px] font-semibold transition-all cursor-pointer ${
        departureOffsetHours === c.offset
          ? "bg-indigo-600 text-white shadow-sm"
          : "bg-slate-200/60 dark:bg-slate-700/60 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
      }">
        ${c.label}
      </button>
    `,
    )
    .join("");

  // =========================================================================
  // TAB 1: STOPS & LEGS ITINERARY
  // =========================================================================
  const stopsCardsHtml = stops
    .map((stop, i) => {
      const isStart = i === 0;
      const isEnd = i === stops.length - 1;
      const roleLabel = isStart ? "Start (A)" : isEnd ? "Destination (B)" : `Stop ${i + 1}`;
      const roleBadgeBg = isStart
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
        : isEnd
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
        : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30";

      const info = weatherInfo(stop.weather.weatherCode);
      const etaStr = stop.eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      // Aerodynamic leg connector between consecutive stops
      let legConnectorHtml = "";
      if (i < stops.length - 1) {
        const nextStop = stops[i + 1];
        const bearing = calculateBearing(stop.lat, stop.lng, nextStop.lat, nextStop.lng);
        const compass = bearingToCompass(bearing);
        const relWind = calculateRelativeWind(bearing, stop.weather.windSpeed, stop.weather.windDirection);
        const legDist = haversineDistanceMeters(stop.lat, stop.lng, nextStop.lat, nextStop.lng);
        const legDistStr = formatRouteDistance(legDist, units);

        legConnectorHtml = `
          <div class="flex items-center gap-2 py-1 px-2.5 text-[10px] text-slate-500 dark:text-slate-400">
            <div class="flex flex-col items-center">
              <div class="w-0.5 h-2.5 bg-slate-300 dark:bg-slate-700"></div>
              <div class="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-600"></div>
              <div class="w-0.5 h-2.5 bg-slate-300 dark:bg-slate-700"></div>
            </div>
            <div class="flex-1 flex items-center justify-between gap-1 flex-wrap">
              <span class="font-medium font-mono text-[10px] text-slate-600 dark:text-slate-400">Leg ${i + 1}: ${legDistStr} · ${compass} (${Math.round(bearing)}°)</span>
              <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold border text-[10px] ${relWind.bg} ${relWind.color}">
                <span>${relWind.icon}</span>
                <span>${relWind.label}</span>
              </span>
            </div>
          </div>
        `;
      }

      return `
        <div class="rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 p-3 space-y-2 hover:border-indigo-400/50 transition-all shadow-xs" data-stop-card="${i}">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider flex-shrink-0 ${roleBadgeBg}">${roleLabel}</span>
              <div class="min-w-0">
                <div class="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate" data-stop-title-idx="${i}">
                  ${escapeXml(stop.name || roleLabel)}
                </div>
                <div class="text-[10px] text-slate-400 font-mono">${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}</div>
              </div>
            </div>

            <div class="flex items-center gap-1 flex-shrink-0">
              <button type="button" class="route-move-up-btn p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer ${i === 0 ? "invisible pointer-events-none" : ""}" data-move-up="${i}" title="Move earlier in trip" aria-label="Move stop up">
                ↑
              </button>
              <button type="button" class="route-move-down-btn p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors cursor-pointer ${i === stops.length - 1 ? "invisible pointer-events-none" : ""}" data-move-down="${i}" title="Move later in trip" aria-label="Move stop down">
                ↓
              </button>
              <button type="button" class="route-delete-stop-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors cursor-pointer" data-delete-idx="${i}" title="Remove this stop" aria-label="Delete stop">
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            </div>
          </div>

          <div class="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50 text-[11px] cursor-pointer" data-zoom-stop="${i}">
            <span class="font-bold text-indigo-600 dark:text-indigo-400">ETA ${etaStr}</span>
            <span class="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 font-medium">
              <span>${info.icon}</span>
              <span>${formatTemp(stop.weather.temperature, units)}</span>
              <span class="opacity-75">· ${info.description}</span>
            </span>
          </div>
        </div>
        ${legConnectorHtml}
      `;
    })
    .join("");

  // =========================================================================
  // TAB 2: DETAILED WEATHER & ARRIVAL TIMELINE
  // =========================================================================
  const weatherTimelineHtml = stops
    .map((stop, i) => {
      const isStart = i === 0;
      const isEnd = i === stops.length - 1;
      const roleLabel = isStart ? "Start (A)" : isEnd ? "Destination (B)" : `Stop ${i + 1}`;
      const roleBadgeBg = isStart
        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
        : isEnd
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
        : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30";

      const info = weatherInfo(stop.weather.weatherCode);
      const etaStr = stop.eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const hazardTags = stop.hazards
        .map(
          (h) => `
        <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-700 dark:text-rose-300">
          ${h.icon} ${h.title}
        </span>
      `,
        )
        .join("");

      return `
        <div class="rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 p-3 space-y-2 hover:border-indigo-400/50 transition-all cursor-pointer shadow-xs" data-zoom-stop="${i}">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${roleBadgeBg}">${roleLabel}</span>
              <span class="font-extrabold text-slate-900 dark:text-slate-100 text-xs">${etaStr}</span>
            </div>
            <div class="flex items-center gap-1 text-base leading-none" title="${info.description}">
              ${info.icon}
            </div>
          </div>

          <div class="flex items-center justify-between text-xs">
            <div class="text-slate-600 dark:text-slate-300 text-[11px] font-medium truncate max-w-[190px]">
              ${escapeXml(stop.name || info.description)}
            </div>
            <div class="font-black text-sm text-slate-900 dark:text-white">
              ${formatTemp(stop.weather.temperature, units)}
            </div>
          </div>

          <div class="flex items-center justify-between pt-1 border-t border-slate-200/50 dark:border-slate-700/50 text-[10px] text-slate-500 dark:text-slate-400">
            <span class="flex items-center gap-1">💨 ${formatSpeed(stop.weather.windSpeed, units)}</span>
            <span class="flex items-center gap-1">🌧️ ${stop.weather.precipitationProb}% (${formatPrecip(stop.weather.precipitation, units)})</span>
          </div>

          ${hazardTags ? `<div class="flex flex-wrap gap-1 pt-0.5">${hazardTags}</div>` : ""}
        </div>
      `;
    })
    .join("");

  const driveSec = calculateModeDuration(
    totalDistanceM,
    "driving",
    transportMode === "driving" ? totalDurationS : null
  );
  const bikeSec = calculateModeDuration(totalDistanceM, "cycling");
  const walkSec = calculateModeDuration(totalDistanceM, "walking");
  const flightSec = calculateModeDuration(totalDistanceM, "direct");

  // Relative Wind Tally
  let tailwindLegs = 0;
  let headwindLegs = 0;
  let crosswindLegs = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const p1 = stops[i];
    const p2 = stops[i + 1];
    const bearing = calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng);
    const relWind = calculateRelativeWind(bearing, p1.weather?.windSpeed, p1.weather?.windDirection);
    if (relWind.classification === "tailwind") tailwindLegs++;
    else if (relWind.classification === "headwind") headwindLegs++;
    else if (relWind.classification === "crosswind") crosswindLegs++;
  }

  let aeroVerdict = "Neutral Aerodynamic Resistance";
  let aeroColor = "text-slate-600 dark:text-slate-300";
  if (tailwindLegs > headwindLegs) {
    aeroVerdict = "🟢 Net Tailwind Boost (+3-5% efficiency)";
    aeroColor = "text-emerald-600 dark:text-emerald-400";
  } else if (headwindLegs > tailwindLegs) {
    aeroVerdict = "🔴 Net Headwind Drag (-4-8% range impact)";
    aeroColor = "text-rose-600 dark:text-rose-400";
  }

  // Inject full 3-tab layout into body
  bodyEl.innerHTML = `
    <!-- TAB 1: STOPS & LEGS -->
    <div id="routeTabStopsContent" class="${activeRouteTab === "stops" ? "" : "hidden"} space-y-3">
      <!-- Search Place to Add Stop -->
      <div class="relative">
        <div class="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/70 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 focus-within:ring-2 focus-within:ring-indigo-500/50 transition-all shadow-xs">
          <span class="text-slate-400 text-xs">🔍</span>
          <input type="text" id="routeSearchAddInput" placeholder="Add stop by city, address or landmark..." class="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none" autocomplete="off" />
          <div id="routeSearchAddSpinner" class="hidden w-3.5 h-3.5 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin flex-shrink-0"></div>
        </div>
        <div id="routeSearchAddDropdown" class="hidden absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 p-1.5 z-50 max-h-52 overflow-y-auto custom-scrollbar"></div>
      </div>

      <!-- Stop Cards List -->
      <div class="space-y-2">
        ${stopsCardsHtml}
      </div>

      <!-- Quick Actions at bottom of Stops Tab -->
      <div class="pt-2 flex items-center gap-2 flex-wrap">
        <button type="button" id="routePanelTabAddMapBtn" class="flex-1 py-1.5 px-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-400 font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer">
          <span>+ Add from Map</span>
        </button>
        <button type="button" id="routePanelTabReverseBtn" class="py-1.5 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-bold text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer" title="Reverse trip direction">
          <span>🔄 Reverse</span>
        </button>
      </div>
    </div>

    <!-- TAB 2: DETAILED WEATHER & ARRIVAL TIMELINE -->
    <div id="routeTabWeatherContent" class="${activeRouteTab === "weather" ? "" : "hidden"} space-y-3">
      <!-- AuraCopilot Briefing -->
      ${copilotHtml}

      <!-- Hazard Banner -->
      ${hazardHtml}

      <!-- Departure Time Selector -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">Departure Time</span>
          <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">Updates arrival weather</span>
        </div>
        <div class="flex items-center gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
          ${departureChips}
        </div>
      </div>

      <!-- Weather Cards Timeline -->
      <div class="space-y-2 pt-1">
        <div class="text-[11px] font-bold text-slate-700 dark:text-slate-300">Stop Arrival Forecasts</div>
        <div class="space-y-2">
          ${weatherTimelineHtml}
        </div>
      </div>
    </div>

    <!-- TAB 3: TRIP ANALYTICS -->
    <div id="routeTabAnalyticsContent" class="${activeRouteTab === "analytics" ? "" : "hidden"} space-y-3">
      <!-- Key Trip KPIs -->
      <div class="grid grid-cols-2 gap-2">
        <div class="bg-slate-100/70 dark:bg-slate-800/70 p-2.5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
          <div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Total Distance</div>
          <div class="text-sm font-black text-slate-900 dark:text-white mt-0.5">${formatRouteDistance(totalDistanceM, units)}</div>
        </div>
        <div class="bg-slate-100/70 dark:bg-slate-800/70 p-2.5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
          <div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">${modeEmoji} ${modeName} Time</div>
          <div class="text-sm font-black text-slate-900 dark:text-white mt-0.5">${formatRouteDuration(totalDurationS)}</div>
        </div>
        <div class="bg-slate-100/70 dark:bg-slate-800/70 p-2.5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
          <div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Temp Range</div>
          <div class="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">${formatTemp(minTemp, units)} – ${formatTemp(maxTemp, units)}</div>
        </div>
        <div class="bg-slate-100/70 dark:bg-slate-800/70 p-2.5 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
          <div class="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Max Wind / Rain</div>
          <div class="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">${formatSpeed(maxWind, units)} · ${rainyStopsCount} rainy</div>
        </div>
      </div>

      <!-- Multimodal Travel Comparisons -->
      <div class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/40 p-3 space-y-2">
        <div class="text-[11px] font-bold text-slate-800 dark:text-slate-200">Multimodal Pacing & Energy</div>
        <div class="space-y-1.5 text-xs">
          <div class="flex items-center justify-between p-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-700/40">
            <span class="flex items-center gap-1.5 font-medium"><span>🚗</span><span>Driving</span></span>
            <span class="font-bold">${formatRouteDuration(driveSec)}</span>
          </div>
          <div class="flex items-center justify-between p-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-700/40">
            <span class="flex items-center gap-1.5 font-medium"><span>🚲</span><span>Cycling (~18 km/h)</span></span>
            <span class="font-bold">${formatRouteDuration(bikeSec)} <span class="text-[10px] text-slate-400 font-normal">(~${Math.round((totalDistanceM / 1000) * 28)} kcal)</span></span>
          </div>
          <div class="flex items-center justify-between p-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-700/40">
            <span class="flex items-center gap-1.5 font-medium"><span>🚶</span><span>Walking (~4.8 km/h)</span></span>
            <span class="font-bold">${formatRouteDuration(walkSec)} <span class="text-[10px] text-slate-400 font-normal">(~${Math.round((totalDistanceM / 1000) * 1300).toLocaleString()} steps)</span></span>
          </div>
          <div class="flex items-center justify-between p-1.5 rounded-xl bg-slate-100/80 dark:bg-slate-700/40">
            <span class="flex items-center gap-1.5 font-medium"><span>✈️</span><span>Direct Geodesic</span></span>
            <span class="font-bold">${formatRouteDuration(flightSec)}</span>
          </div>
        </div>
      </div>

      <!-- Aerodynamic Wind & Efficiency -->
      <div class="rounded-2xl border border-slate-200/60 dark:border-slate-700/60 bg-white/40 dark:bg-slate-800/40 p-3 space-y-2">
        <div class="text-[11px] font-bold text-slate-800 dark:text-slate-200">Aerodynamics & Wind Resistance</div>
        <div class="text-xs font-semibold ${aeroColor}">
          ${aeroVerdict}
        </div>
        <div class="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/40 dark:border-slate-700/40">
          <span>Tailwind: ${tailwindLegs} legs</span>
          <span>Headwind: ${headwindLegs} legs</span>
          <span>Crosswind: ${crosswindLegs} legs</span>
        </div>
      </div>
    </div>
  `;

  // Bind Autocomplete search in Stops tab
  bindRouteSearchAddEvents(bodyEl);

  // Bind Departure time chips
  bodyEl.querySelectorAll(".route-departure-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      departureOffsetHours = parseInt(chip.dataset.offset, 10) || 0;
      fetchAndRenderRoutePlan();
    });
  });

  // Bind Move Up and Move Down buttons
  bodyEl.querySelectorAll(".route-move-up-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.moveUp, 10);
      if (idx > 0) moveStop(idx, idx - 1);
    });
  });

  bodyEl.querySelectorAll(".route-move-down-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.moveDown, 10);
      if (idx < stops.length - 1) moveStop(idx, idx + 1);
    });
  });

  // Bind individual delete stop buttons
  bodyEl.querySelectorAll(".route-delete-stop-btn").forEach((delBtn) => {
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(delBtn.dataset.deleteIdx, 10);
      removeStop(idx);
    });
  });

  // Bind stop card click to zoom to waypoint
  bodyEl.querySelectorAll("[data-zoom-stop]").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = parseInt(card.dataset.zoomStop, 10);
      const stop = stops[idx];
      if (stop && appRef && appRef.map) {
        appRef.map.getView().animate({
          center: fromLonLat([stop.lng, stop.lat]),
          zoom: 12,
          duration: 600,
        });
      }
    });
  });

  // Bind quick buttons at bottom of stops tab
  bodyEl.querySelector("#routePanelTabAddMapBtn")?.addEventListener("click", () => {
    hidePanel();
    showHUD();
    routeMode = true;
    if (appRef) {
      appRef._routeModeActive = true;
      if (appRef.map) {
        appRef.map.on("click", onMapClick);
        const targetEl = appRef.map.getTargetElement();
        if (targetEl) targetEl.style.cursor = "crosshair";
      }
    }
    updateHUD();
    if (appRef) appRef.showToast("Click map to add stop. Click 'Analyze Route' when done.", "info");
  });

  bodyEl.querySelector("#routePanelTabReverseBtn")?.addEventListener("click", reverseRoute);

  // Bind autocomplete search input inside the Stops tab
  bindRouteSearchAddEvents(bodyEl);
}

// ============================================================================
//  PRO TRIP ACTIONS
// ============================================================================

function handoverToNavigation() {
  if (pts.length < 2) return;
  const destination = pts[pts.length - 1];

  appRef.selectedLat = destination.lat;
  appRef.selectedLng = destination.lng;
  appRef.selectedName = destination.name || "Route Destination";

  hidePanel();

  if (typeof appRef.startNavigationPreview === "function") {
    appRef.startNavigationPreview();
    appRef.showToast("Starting turn-by-turn navigation…", "success");
  } else {
    appRef.showToast("Navigation is ready for destination", "info");
  }
}

function exportGPXFile() {
  if (pts.length < 2) return;
  const gpxXml = generateGPX({
    name: `Aurafisky Trip (${pts.length} stops)`,
    waypoints: pts,
    coordinates: activeRouteData?.coordinates || [],
  });

  const blob = new Blob([gpxXml], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `route-studio-${Date.now()}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  appRef.showToast("GPX file downloaded successfully", "success");
}

async function shareRouteItinerary() {
  if (pts.length < 2) return;
  const geojson = generateGeoJSON({
    name: `Aurafisky Trip (${pts.length} stops)`,
    waypoints: pts,
    coordinates: activeRouteData?.coordinates || [],
  });

  const textSummary =
    `🧭 Aurafisky Trip Plan (${transportMode.toUpperCase()})\n` +
    `Stops: ${pts.length}\n` +
    `Total Distance: ${formatRouteDistance(activeRouteData?.distanceM, getActiveUnits())}\n` +
    `Est. Duration: ${formatRouteDuration(activeRouteData?.durationS)}\n` +
    `Start: [${pts[0].lat.toFixed(4)}, ${pts[0].lng.toFixed(4)}]\n` +
    `Destination: [${pts[pts.length - 1].lat.toFixed(4)}, ${pts[pts.length - 1].lng.toFixed(4)}]`;

  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(JSON.stringify(geojson, null, 2));
      appRef.showToast("GeoJSON route copied to clipboard", "success");
    } else {
      copyFallback(textSummary);
    }
  } catch (err) {
    copyFallback(textSummary);
  }
}

function copyFallback(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  appRef.showToast("Trip summary copied to clipboard", "success");
}

function saveRouteToFavorites() {
  if (pts.length < 2) return;
  try {
    const saved = JSON.parse(localStorage.getItem("aurafisky_saved_routes") || "[]");
    saved.push({
      id: `route_${Date.now()}`,
      createdAt: new Date().toISOString(),
      stopsCount: pts.length,
      waypoints: pts.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name })),
      distanceM: activeRouteData?.distanceM,
      durationS: activeRouteData?.durationS,
      mode: transportMode,
    });
    localStorage.setItem("aurafisky_saved_routes", JSON.stringify(saved));
    appRef.showToast("Route saved to favorites", "success");
  } catch (e) {
    console.warn("Failed to save route to localStorage:", e);
    appRef.showToast("Could not save route", "error");
  }
}
