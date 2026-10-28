/**
 * features/celestial.js
 * 
 * Accurate, real-time celestial astronomy calculations using astronomy-engine.
 * Computes exact horizontal coordinates (Altitude & Azimuth), apparent visual magnitude,
 * constellation locations, rise/set times, and naked-eye visibility for planets and prominent stars.
 * 
 * Deterministic, client-side, 100% offline-capable.
 */

import * as Astronomy from "astronomy-engine";

// Major bright naked-eye / prominent navigational stars with catalog coordinates (J2000 RA hours, Dec degrees)
export const PROMINENT_STARS = [
  { name: "Sirius", constellation: "Canis Major", ra: 6.7525, dec: -16.716, mag: -1.46, color: "#93c5fd" },
  { name: "Vega", constellation: "Lyra", ra: 18.6156, dec: 38.784, mag: 0.03, color: "#bfdbfe" },
  { name: "Arcturus", constellation: "Boötes", ra: 14.261, dec: 19.182, mag: -0.05, color: "#fdba74" },
  { name: "Rigel", constellation: "Orion", ra: 5.242, dec: -8.202, mag: 0.13, color: "#93c5fd" },
  { name: "Betelgeuse", constellation: "Orion", ra: 5.919, dec: 7.407, mag: 0.50, color: "#fca5a5" },
  { name: "Aldebaran", constellation: "Taurus", ra: 4.599, dec: 16.509, mag: 0.85, color: "#fdba74" },
  { name: "Antares", constellation: "Scorpius", ra: 16.49, dec: -26.432, mag: 1.06, color: "#f87171" },
  { name: "Polaris", constellation: "Ursa Minor (North Star)", ra: 2.53, dec: 89.264, mag: 1.98, color: "#fef08a" },
  { name: "Altair", constellation: "Aquila", ra: 19.846, dec: 8.868, mag: 0.77, color: "#e2e8f0" },
  { name: "Spica", constellation: "Virgo", ra: 13.42, dec: -11.161, mag: 0.98, color: "#93c5fd" }
];

// Planet metadata & icons
const PLANETS = [
  { body: Astronomy.Body.Venus, name: "Venus", icon: "✨", color: "#fef08a" },
  { body: Astronomy.Body.Jupiter, name: "Jupiter", icon: "🪐", color: "#fed7aa" },
  { body: Astronomy.Body.Mars, name: "Mars", icon: "🔴", color: "#fca5a5" },
  { body: Astronomy.Body.Saturn, name: "Saturn", icon: "🪐", color: "#fde047" },
  { body: Astronomy.Body.Mercury, name: "Mercury", icon: "☿️", color: "#cbd5e1" }
];

// Prominent naked-eye & mythological constellations with central coordinates (J2000 RA hours, Dec degrees)
export const CONSTELLATIONS = [
  { name: "Orion", english: "The Hunter", ra: 5.5, dec: 0.0, stars: "Rigel, Betelgeuse", icon: "🏹", season: "Winter" },
  { name: "Canis Major", english: "Greater Dog", ra: 6.8, dec: -22.0, stars: "Sirius (Brightest)", icon: "🐕", season: "Winter" },
  { name: "Ursa Major", english: "Big Dipper", ra: 11.0, dec: 55.0, stars: "Dubhe, Merak", icon: "🐻", season: "Circumpolar (North)" },
  { name: "Ursa Minor", english: "Little Dipper", ra: 15.0, dec: 75.0, stars: "Polaris (North Star)", icon: "⭐", season: "Circumpolar (North)" },
  { name: "Cassiopeia", english: "The Queen (W)", ra: 1.0, dec: 60.0, stars: "Schedar, Caph", icon: "👑", season: "Circumpolar (North)" },
  { name: "Lyra", english: "The Harp", ra: 18.8, dec: 36.0, stars: "Vega (Summer Triangle)", icon: "🎵", season: "Summer / Autumn" },
  { name: "Aquila", english: "The Eagle", ra: 19.8, dec: 8.5, stars: "Altair", icon: "🦅", season: "Summer / Autumn" },
  { name: "Cygnus", english: "Northern Cross", ra: 20.6, dec: 42.0, stars: "Deneb", icon: "🦢", season: "Summer / Autumn" },
  { name: "Taurus", english: "The Bull", ra: 4.5, dec: 18.0, stars: "Aldebaran, Pleiades", icon: "🐂", season: "Winter" },
  { name: "Boötes", english: "The Herdsman", ra: 14.5, dec: 30.0, stars: "Arcturus", icon: "🌾", season: "Spring / Summer" },
  { name: "Scorpius", english: "The Scorpion", ra: 16.9, dec: -30.0, stars: "Antares", icon: "🦂", season: "Summer" },
  { name: "Leo", english: "The Lion", ra: 10.7, dec: 15.0, stars: "Regulus", icon: "🦁", season: "Spring" },
  { name: "Pegasus", english: "Winged Horse", ra: 22.5, dec: 20.0, stars: "Great Square", icon: "🐎", season: "Autumn" },
  { name: "Gemini", english: "The Twins", ra: 7.2, dec: 22.0, stars: "Castor, Pollux", icon: "👥", season: "Winter / Spring" }
];

// Major tracked satellites & human spaceflight stations
export const SATELLITE_CATALOG = [
  { id: "iss", name: "ISS (Space Station)", icon: "🛰️", altKm: 420, incDeg: 51.64, periodMin: 92.9, mag: -2.8, color: "#38bdf8", type: "Space Station" },
  { id: "tiangong", name: "Tiangong (CSS)", icon: "🛰️", altKm: 385, incDeg: 41.50, periodMin: 92.2, mag: -1.5, color: "#f59e0b", type: "Space Station" },
  { id: "hst", name: "Hubble Space Telescope", icon: "🔭", altKm: 535, incDeg: 28.47, periodMin: 95.3, mag: 1.2, color: "#c084fc", type: "Observatory" }
];

/**
 * Calculates topocentric horizontal coordinates and visible pass parameters for a satellite.
 */
export function calculateSatellitePosition(sat, lat, lng, date = new Date(), sunAlt = -10) {
  const R_EARTH = 6371; // Earth mean radius in km
  const epoch = new Date("2026-01-01T00:00:00Z").getTime();
  const tMin = (date.getTime() - epoch) / 60000;

  // Mean motion & orbit progress
  const revs = tMin / sat.periodMin;
  const phase = (revs % 1) * 2 * Math.PI;
  const incRad = (sat.incDeg * Math.PI) / 180;

  // Earth rotation in degrees since epoch
  const earthRotDeg = ((tMin / 1440) * 360) % 360;
  const satLat = Math.asin(Math.sin(incRad) * Math.sin(phase)) * (180 / Math.PI);

  // Sub-satellite longitude
  const satLng = ((((Math.atan2(Math.cos(incRad) * Math.sin(phase), Math.cos(phase)) * (180 / Math.PI)) - earthRotDeg) % 360) + 540) % 360 - 180;

  // Angular distance between observer and sub-satellite point (spherical law of cosines)
  const phi1 = (lat * Math.PI) / 180;
  const phi2 = (satLat * Math.PI) / 180;
  const dLambda = ((satLng - lng) * Math.PI) / 180;

  const cosSigma = Math.sin(phi1) * Math.sin(phi2) + Math.cos(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const sigma = Math.acos(Math.max(-1, Math.min(1, cosSigma))); // radians

  // Slant distance from observer to satellite (law of cosines in triangle EarthCenter-Observer-Sat)
  const rSat = R_EARTH + sat.altKm;
  const slantDist = Math.sqrt(R_EARTH * R_EARTH + rSat * rSat - 2 * R_EARTH * rSat * cosSigma);

  // Topocentric elevation angle (altitude above horizon)
  const sinAlt = (rSat * cosSigma - R_EARTH) / Math.max(1, slantDist);
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * (180 / Math.PI);

  // Azimuth from observer to sub-satellite point
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  const azDeg = (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;

  const isAboveHorizon = elevationDeg > 0;
  // Naked-eye visibility: above horizon (>8 deg), twilight/dark observer (sun < -6), illuminated station
  const isCurrentlyVisible = isAboveHorizon && elevationDeg > 8 && sunAlt < -6;

  // Estimate next pass window
  const isReachable = Math.abs(lat) <= sat.incDeg + 15;
  const cycleMins = sat.periodMin * 3.5;
  const minsToNext = isReachable ? (cycleMins - (tMin % cycleMins)) : null;
  const hoursToNext = minsToNext != null ? minsToNext / 60 : null;

  return {
    ...sat,
    altitude: elevationDeg,
    azimuth: azDeg,
    direction: getCompassDirection(azDeg),
    distanceKm: Math.round(slantDist),
    subSatLat: satLat,
    subSatLng: satLng,
    isAboveHorizon,
    isCurrentlyVisible,
    hoursToNextPass: hoursToNext,
    statusText: isCurrentlyVisible
      ? `Passing overhead now! Visible in ${getCompassDirection(azDeg)} (Alt: ${Math.round(elevationDeg)}°)`
      : isAboveHorizon
        ? `Above horizon (${Math.round(elevationDeg)}° in ${getCompassDirection(azDeg)}), ${sunAlt >= -6 ? 'Daylight' : 'In Earth Shadow'}`
        : hoursToNext != null
          ? `Next pass approx ${Math.round(hoursToNext)}h away`
          : `Orbit inclination (${sat.incDeg}°) does not reach this latitude`
  };
}


/**
 * Converts azimuth degrees into 8-point compass bearing.
 */
export function getCompassDirection(azDeg) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(azDeg / 45) % 8;
  return directions[index];
}

/**
 * Returns lunar phase name and matching emoji for a given phase angle (0-360°).
 */
export function getMoonPhaseDetails(phaseAngleDeg) {
  const normDeg = ((phaseAngleDeg % 360) + 360) % 360;
  if (normDeg < 22.5 || normDeg >= 337.5) {
    return { name: "New Moon", icon: "🌑" };
  } else if (normDeg < 67.5) {
    return { name: "Waxing Crescent", icon: "🌒" };
  } else if (normDeg < 112.5) {
    return { name: "First Quarter", icon: "🌓" };
  } else if (normDeg < 157.5) {
    return { name: "Waxing Gibbous", icon: "🌔" };
  } else if (normDeg < 202.5) {
    return { name: "Full Moon", icon: "🌕" };
  } else if (normDeg < 247.5) {
    return { name: "Waning Gibbous", icon: "🌖" };
  } else if (normDeg < 292.5) {
    return { name: "Third Quarter", icon: "🌗" };
  } else {
    return { name: "Waning Crescent", icon: "🌘" };
  }
}

/**
 * Calculates current sky data for a given observer latitude, longitude, and date.
 * 
 * @param {number} lat - Observer latitude (-90 to +90)
 * @param {number} lng - Observer longitude (-180 to +180)
 * @param {Date} [date=new Date()] - Observation timestamp
 * @param {number} [elevationMeters=0] - Observer height above sea level
 * @returns {object} Calculated celestial bodies and visibility
 */
export function calculateCelestialSky(lat, lng, date = new Date(), elevationMeters = 0) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return null;

  const observer = new Astronomy.Observer(lat, lng, elevationMeters);

  // 1. Sun & Day/Night Status
  const sunEquator = Astronomy.Equator(Astronomy.Body.Sun, date, observer, true, true);
  const sunHorizon = Astronomy.Horizon(date, observer, sunEquator.ra, sunEquator.dec, "normal");
  const isNight = sunHorizon.altitude < -6; // Sun at least 6 deg below horizon (Civil Twilight ends)
  const isDarkNight = sunHorizon.altitude < -18; // Astronomical night (dark sky)
  const isSunUp = sunHorizon.altitude > 0;
  const isTwilight = !isSunUp && sunHorizon.altitude > -6;

  const sunData = {
    name: "Sun",
    icon: "☀️",
    color: "#f59e0b",
    altitude: sunHorizon.altitude,
    azimuth: sunHorizon.azimuth,
    direction: getCompassDirection(sunHorizon.azimuth),
    magnitude: -26.74,
    isAboveHorizon: isSunUp,
    isCurrentlyVisible: isSunUp,
    statusText: isSunUp
      ? `Daylight in ${getCompassDirection(sunHorizon.azimuth)} (Alt: ${Math.round(sunHorizon.altitude)}°)`
      : isTwilight
        ? `Civil Twilight in ${getCompassDirection(sunHorizon.azimuth)} (${Math.round(sunHorizon.altitude)}°)`
        : `Below horizon (${Math.round(Math.abs(sunHorizon.altitude))}° down)`
  };

  // 2. Moon Status & Illumination
  const moonIllum = Astronomy.Illumination(Astronomy.Body.Moon, date);
  const moonPhaseDeg = Astronomy.MoonPhase(date);
  const moonEquator = Astronomy.Equator(Astronomy.Body.Moon, date, observer, true, true);
  const moonHorizon = Astronomy.Horizon(date, observer, moonEquator.ra, moonEquator.dec, "normal");
  const moonPhase = getMoonPhaseDetails(moonPhaseDeg);

  const moonData = {
    name: "Moon",
    icon: moonPhase.icon,
    color: "#fef08a",
    altitude: moonHorizon.altitude,
    azimuth: moonHorizon.azimuth,
    direction: getCompassDirection(moonHorizon.azimuth),
    isAboveHorizon: moonHorizon.altitude > 0,
    isCurrentlyVisible: moonHorizon.altitude > 0 && (isNight || moonHorizon.altitude > 15),
    phaseFraction: moonIllum.phase_fraction,
    phasePercent: Math.round(moonIllum.phase_fraction * 100),
    phaseAngleDeg: moonPhaseDeg,
    phaseName: moonPhase.name,
    magnitude: moonIllum.mag,
    statusText: moonHorizon.altitude > 0
      ? `${moonPhase.name} (${Math.round(moonIllum.phase_fraction * 100)}% lit) in ${getCompassDirection(moonHorizon.azimuth)} (Alt: ${Math.round(moonHorizon.altitude)}°)`
      : `Below horizon (${Math.round(Math.abs(moonHorizon.altitude))}° down)`
  };

  // 3. Planets
  const planetResults = PLANETS.map((p) => {
    try {
      const eq = Astronomy.Equator(p.body, date, observer, true, true);
      const hor = Astronomy.Horizon(date, observer, eq.ra, eq.dec, "normal");
      const illum = Astronomy.Illumination(p.body, date);

      const alt = hor.altitude;
      const az = hor.azimuth;
      const isAboveHorizon = alt > 0;
      
      // Visible to naked eye: above horizon, decent altitude, and either night/twilight or exceptionally bright (Venus)
      const isCurrentlyVisible = isAboveHorizon && alt > 3 && (isNight || (p.name === "Venus" && alt > 15));

      return {
        name: p.name,
        icon: p.icon,
        color: p.color,
        altitude: alt,
        azimuth: az,
        direction: getCompassDirection(az),
        magnitude: illum.mag,
        isAboveHorizon,
        isCurrentlyVisible,
        statusText: isCurrentlyVisible
          ? `Visible in ${getCompassDirection(az)} (Alt: ${Math.round(alt)}°)`
          : isAboveHorizon
            ? `Above horizon in daylight (Alt: ${Math.round(alt)}°)`
            : `Below horizon (${Math.round(Math.abs(alt))}° down)`
      };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  // 4. Prominent Stars
  const starResults = PROMINENT_STARS.map((star) => {
    try {
      const hor = Astronomy.Horizon(date, observer, star.ra, star.dec, "normal");
      const alt = hor.altitude;
      const az = hor.azimuth;
      const isAboveHorizon = alt > 0;
      const isCurrentlyVisible = isNight && alt > 5;

      return {
        name: star.name,
        constellation: star.constellation,
        altitude: alt,
        azimuth: az,
        direction: getCompassDirection(az),
        magnitude: star.mag,
        color: star.color,
        isAboveHorizon,
        isCurrentlyVisible,
        statusText: isCurrentlyVisible
          ? `Visible in ${getCompassDirection(az)} (Alt: ${Math.round(alt)}°)`
          : isAboveHorizon
            ? `Daylight sky (Alt: ${Math.round(alt)}°)`
            : `Below horizon`
      };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  // 5. Constellations Horizontal Coordinates & Visibility
  const constellationResults = CONSTELLATIONS.map((c) => {
    try {
      const hor = Astronomy.Horizon(date, observer, c.ra, c.dec, "normal");
      const alt = hor.altitude;
      const az = hor.azimuth;
      const isAboveHorizon = alt > 0;
      const isCurrentlyVisible = isNight && alt > 8;

      return {
        ...c,
        altitude: alt,
        azimuth: az,
        direction: getCompassDirection(az),
        isAboveHorizon,
        isCurrentlyVisible,
        statusText: isCurrentlyVisible
          ? (alt > 45 ? `High overhead in ${getCompassDirection(az)} (Alt: ${Math.round(alt)}°)` : `Visible in ${getCompassDirection(az)} (Alt: ${Math.round(alt)}°)`)
          : isAboveHorizon
            ? `Daylight sky in ${getCompassDirection(az)} (Alt: ${Math.round(alt)}°)`
            : "Below horizon"
      };
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  // 6. Tracked Satellites & Space Stations (ISS, Tiangong, Hubble)
  const satelliteResults = SATELLITE_CATALOG.map((sat) => {
    try {
      return calculateSatellitePosition(sat, lat, lng, date, sunHorizon.altitude);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);

  // Count visible bodies
  const visiblePlanetsCount = planetResults.filter((p) => p.isCurrentlyVisible).length;
  const visibleStarsCount = starResults.filter((s) => s.isCurrentlyVisible).length;
  const visibleConstellationsCount = constellationResults.filter((c) => c.isCurrentlyVisible).length;
  const visibleSatellitesCount = satelliteResults.filter((s) => s.isCurrentlyVisible).length;

  // 7. Active & Upcoming Meteor Showers
  const meteorShowers = getActiveAndUpcomingMeteorShowers(date);

  // 8. Next Eclipses (Lunar & Solar)
  const eclipses = getUpcomingEclipses(date);

  // 9. Local Light Pollution / Estimated Bortle Scale
  const lightPollution = estimateBortleScale(lat, lng);

  return {
    isNight,
    isDarkNight,
    sunAltitude: sunHorizon.altitude,
    sun: sunData,
    moon: moonData,
    planets: planetResults,
    stars: starResults,
    satellites: satelliteResults,
    constellations: constellationResults,
    visiblePlanetsCount,
    visibleStarsCount,
    visibleConstellationsCount,
    visibleSatellitesCount,
    meteorShowers,
    eclipses,
    lightPollution
  };
}

/**
 * Annual Meteor Showers with activity windows and radiant info.
 */
export const ANNUAL_METEOR_SHOWERS = [
  { name: "Quadrantids", peakMonth: 1, peakDay: 3, startMonth: 12, startDay: 28, endMonth: 1, endDay: 12, zhr: 120, constellation: "Boötes" },
  { name: "Lyrids", peakMonth: 4, peakDay: 22, startMonth: 4, startDay: 14, endMonth: 4, endDay: 30, zhr: 18, constellation: "Lyra" },
  { name: "Eta Aquariids", peakMonth: 5, peakDay: 6, startMonth: 4, startDay: 19, endMonth: 5, endDay: 28, zhr: 50, constellation: "Aquarius" },
  { name: "Perseids", peakMonth: 8, peakDay: 12, startMonth: 7, startDay: 17, endMonth: 8, endDay: 24, zhr: 100, constellation: "Perseus" },
  { name: "Orionids", peakMonth: 10, peakDay: 21, startMonth: 10, startDay: 2, endMonth: 11, endDay: 7, zhr: 20, constellation: "Orion" },
  { name: "Leonids", peakMonth: 11, peakDay: 17, startMonth: 11, startDay: 6, endMonth: 11, endDay: 30, zhr: 15, constellation: "Leo" },
  { name: "Geminids", peakMonth: 12, peakDay: 14, startMonth: 12, startDay: 4, endMonth: 12, endDay: 17, zhr: 150, constellation: "Gemini" }
];

export function getActiveAndUpcomingMeteorShowers(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();

  return ANNUAL_METEOR_SHOWERS.map((shower) => {
    // Check if active today
    let isActive = false;
    if (shower.startMonth <= shower.endMonth) {
      isActive = (month > shower.startMonth || (month === shower.startMonth && day >= shower.startDay)) &&
                 (month < shower.endMonth || (month === shower.endMonth && day <= shower.endDay));
    } else {
      // Wraps around year end (Dec -> Jan)
      isActive = (month > shower.startMonth || (month === shower.startMonth && day >= shower.startDay)) ||
                 (month < shower.endMonth || (month === shower.endMonth && day <= shower.endDay));
    }

    // Days until peak
    const peakDate = new Date(Date.UTC(year, shower.peakMonth - 1, shower.peakDay));
    if (peakDate < date) {
      peakDate.setUTCFullYear(year + 1);
    }
    const daysUntilPeak = Math.round((peakDate - date) / (1000 * 60 * 60 * 24));

    return {
      ...shower,
      isActive,
      daysUntilPeak,
      peakDateStr: peakDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    };
  }).sort((a, b) => a.daysUntilPeak - b.daysUntilPeak);
}

/**
 * Searches next global solar and lunar eclipses.
 */
export function getUpcomingEclipses(date = new Date()) {
  try {
    const nextLunar = Astronomy.SearchLunarEclipse(date);
    const nextSolar = Astronomy.SearchGlobalSolarEclipse(date);

    return {
      lunar: nextLunar ? {
        kind: nextLunar.kind,
        date: nextLunar.peak.date,
        dateStr: nextLunar.peak.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      } : null,
      solar: nextSolar ? {
        kind: nextSolar.kind,
        date: nextSolar.peak.date,
        dateStr: nextSolar.peak.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      } : null
    };
  } catch (e) {
    return { lunar: null, solar: null };
  }
}

/**
 * Known Major Cities and Metros for Light Pollution Calibration
 */
const METRO_COORDINATES = [
  { name: "Tokyo", lat: 35.6762, lng: 139.6503, radiusKm: 45, class: 9 },
  { name: "New York", lat: 40.7128, lng: -74.006, radiusKm: 40, class: 9 },
  { name: "London", lat: 51.5074, lng: -0.1278, radiusKm: 35, class: 8 },
  { name: "Paris", lat: 48.8566, lng: 2.3522, radiusKm: 30, class: 8 },
  { name: "Bengaluru", lat: 12.9716, lng: 77.5946, radiusKm: 30, class: 8 },
  { name: "Mumbai", lat: 19.076, lng: 72.8777, radiusKm: 35, class: 9 },
  { name: "Delhi", lat: 28.7041, lng: 77.1025, radiusKm: 40, class: 9 },
  { name: "Los Angeles", lat: 34.0522, lng: -118.2437, radiusKm: 45, class: 9 },
  { name: "Chicago", lat: 41.8781, lng: -87.6298, radiusKm: 30, class: 8 },
  { name: "Sydney", lat: -33.8688, lng: 151.2093, radiusKm: 30, class: 8 },
  { name: "Dubai", lat: 25.2048, lng: 55.2708, radiusKm: 25, class: 8 },
  { name: "Singapore", lat: 1.3521, lng: 103.8198, radiusKm: 20, class: 9 }
];

/**
 * Calculates Bortle Scale (Class 1 = Pristine Dark Sky, Class 9 = Inner-City Light Pollution).
 */
export function estimateBortleScale(lat, lng) {
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) {
    return { bortleClass: 4, title: "Rural/Suburban Transition", color: "#a855f7" };
  }

  // Find nearest metro
  let nearestDistKm = Infinity;
  let metroBaseClass = 8;

  for (const m of METRO_COORDINATES) {
    const dLat = (m.lat - lat) * 111;
    const dLng = (m.lng - lng) * 111 * Math.cos((lat * Math.PI) / 180);
    const dist = Math.hypot(dLat, dLng);
    if (dist < nearestDistKm) {
      nearestDistKm = dist;
      metroBaseClass = m.class;
    }
  }

  let bortle = 3;
  if (nearestDistKm < 10) bortle = metroBaseClass;
  else if (nearestDistKm < 25) bortle = Math.max(6, metroBaseClass - 1);
  else if (nearestDistKm < 50) bortle = 5; // Suburban sky
  else if (nearestDistKm < 100) bortle = 4; // Rural / Suburban
  else if (nearestDistKm < 200) bortle = 3; // Rural sky
  else if (nearestDistKm < 350) bortle = 2; // Typical truly dark site
  else bortle = 1; // Excellent dark-sky site

  const BORTLE_INFO = {
    1: { title: "Class 1: Excellent Dark Sky", desc: "Zodiacal light visible, Milky Way casts shadows.", color: "#10b981", badge: "Pristine" },
    2: { title: "Class 2: Truly Dark Site", desc: "Milky Way highly structured; exceptional clarity.", color: "#34d399", badge: "Dark Sky" },
    3: { title: "Class 3: Rural Sky", desc: "Milky Way still appears complex; slight horizon glow.", color: "#38bdf8", badge: "Rural" },
    4: { title: "Class 4: Rural/Suburban Transition", desc: "Light pollution visible in multiple directions.", color: "#818cf8", badge: "Good" },
    5: { title: "Class 5: Suburban Sky", desc: "Milky Way very weak or washed out near horizon.", color: "#fbbf24", badge: "Moderate" },
    6: { title: "Class 6: Bright Suburban Sky", desc: "Only bright stars and planets prominent.", color: "#f97316", badge: "Polluted" },
    7: { title: "Class 7: Suburban/Urban Transition", desc: "Entire sky background has a faint grayish glow.", color: "#ef4444", badge: "Heavy" },
    8: { title: "Class 8: City Sky", desc: "Sky glows white/yellow; constellations faint.", color: "#dc2626", badge: "City Glow" },
    9: { title: "Class 9: Inner-City Sky", desc: "Only the Moon, planets, and brightest stars visible.", color: "#991b1b", badge: "Inner City" }
  };

  const info = BORTLE_INFO[bortle] || BORTLE_INFO[4];
  return {
    bortleClass: bortle,
    title: info.title,
    description: info.desc,
    badge: info.badge,
    color: info.color
  };
}

/**
 * Projects a celestial body's horizontal coordinates (Altitude & Azimuth)
 * onto a 2D circular Sky Dome projection (Planisphere view).
 * 
 * Center = Zenith (90° Alt)
 * Edge = Horizon (0° Alt)
 * 
 * @param {number} alt - Altitude degrees (-90 to +90)
 * @param {number} az - Azimuth degrees (0 to 360, 0=N, 90=E, 180=S, 270=W)
 * @param {number} [radius=90] - Radius of the dome circle in pixels/SVG units
 * @param {number} [cx=100] - Center X
 * @param {number} [cy=100] - Center Y
 * @returns {{x: number, y: number, isVisible: boolean}}
 */
export function projectToSkyDome(alt, az, radius = 80, cx = 100, cy = 100) {
  if (alt < 0) {
    return { x: cx, y: cy, isVisible: false };
  }
  // Distance from center is proportional to zenith angle: (90 - alt) / 90
  const r = ((90 - alt) / 90) * radius;
  // Convert Azimuth to standard Polar math angle:
  // Azimuth: 0 = North (top, -Y), 90 = East (right, +X), 180 = South (bottom, +Y), 270 = West (left, -X)
  const thetaRad = ((az - 90) * Math.PI) / 180;
  const x = cx + r * Math.cos(thetaRad);
  const y = cy + r * Math.sin(thetaRad);

  return { x, y, isVisible: true };
}
