// -- TURN-BY-TURN NAVIGATION --
//
// Real road-following directions + live position tracking, layered on top
// of the existing weather map. Routing comes from OSRM's public demo
// server (router.project-osrm.org) — free, no API key, but a shared demo
// instance with no uptime guarantee and (per OSRM's own docs) only the
// "driving" road network actually routed on that server; this app doesn't
// offer a walking/cycling toggle because testing showed the demo silently
// returns the same car route for those profile names rather than a real
// foot/bike network, and presenting that as a walking route would be
// wrong. Swap OSRM_BASE for a GraphHopper/OpenRouteService/self-hosted
// OSRM endpoint (with an API key) if this needs production-grade uptime.
//
// features/routes.js (the existing "Draw a route" button) is a different,
// older feature: a hand-drawn straight-line path sampled for weather at
// each stop. This module is unrelated to it — real roads, real turns, a
// live GPS dot — and deliberately uses a "nav" prefix throughout to avoid
// any naming collision with it.

import LineString from "ol/geom/LineString.js";
import Feature from "ol/Feature.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { Style, Stroke } from "ol/style.js";
import { fromLonLat, toLonLat } from "ol/proj.js";
import { HtmlMarker } from "../modules/ol-marker.js";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const EARTH_RADIUS_M = 6371000;

const STEP_ADVANCE_METERS = 25; // "close enough" to a maneuver to call it done
const OFF_ROUTE_METERS = 45; // cross-track distance that counts as "off route"
const OFF_ROUTE_STRIKES_TO_REROUTE = 2; // consecutive off-route fixes before rerouting
const REROUTE_COOLDOWN_MS = 15000; // don't hammer the demo server on noisy GPS
const ANNOUNCE_APPROACH_M = 400;
const ANNOUNCE_IMMINENT_M = 50;
const MANUAL_PAN_GRACE_MS = 6000; // pause auto-follow this long after the user touches the map

let navRouteSource = null;
let navRouteLayer = null;
let liveMarker = null;

// ================================================================
//  GEO MATH — haversine distance, equirectangular cross-track distance
// ================================================================

function _toRad(deg) {
  return (deg * Math.PI) / 180;
}

function _haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = _toRad(lat2 - lat1);
  const dLng = _toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(_toRad(lat1)) * Math.cos(_toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

function _bearingDegrees(lat1, lng1, lat2, lng2) {
  const y = Math.sin(_toRad(lng2 - lng1)) * Math.cos(_toRad(lat2));
  const x =
    Math.cos(_toRad(lat1)) * Math.sin(_toRad(lat2)) -
    Math.sin(_toRad(lat1)) * Math.cos(_toRad(lat2)) * Math.cos(_toRad(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Shortest distance from a point to a route, in meters — used to detect
 * "the driver left the route" (off-route rerouting).
 *
 * Projects each route segment into a local flat (equirectangular) frame
 * centered on the point being tested. Route segments here are always
 * short (tens to low hundreds of meters between OSRM geometry vertices),
 * so the flat-earth approximation error is centimeters, not something a
 * 45m off-route threshold will ever notice.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {Array<[number, number]>} routeLngLat - [lng, lat] pairs
 * @returns {number} meters
 */
function _distanceToRouteMeters(lat, lng, routeLngLat) {
  if (!routeLngLat || routeLngLat.length < 2) return Infinity;
  const cosLat = Math.cos(_toRad(lat));
  const toXY = ([vLng, vLat]) => [
    (vLng - lng) * cosLat * (Math.PI / 180) * EARTH_RADIUS_M,
    (vLat - lat) * (Math.PI / 180) * EARTH_RADIUS_M,
  ];

  let min = Infinity;
  for (let i = 0; i < routeLngLat.length - 1; i++) {
    const [ax, ay] = toXY(routeLngLat[i]);
    const [bx, by] = toXY(routeLngLat[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? -(ax * dx + ay * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const dist = Math.hypot(px, py);
    if (dist < min) min = dist;
  }
  return min;
}

function _formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return "--";
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function _formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "--";
  const totalMin = Math.round(seconds / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

// ================================================================
//  MANEUVER TEXT & ICONS
// ================================================================

const MODIFIER_ICON = {
  straight: "⬆️",
  "slight right": "↗️",
  right: "➡️",
  "sharp right": "↘️",
  uturn: "🔄",
  "sharp left": "↙️",
  left: "⬅️",
  "slight left": "↖️",
};

function _maneuverIcon(maneuver) {
  if (maneuver.type === "arrive") return "🏁";
  if (maneuver.type === "depart") return "🚗";
  if (maneuver.type?.startsWith("roundabout") || maneuver.type === "rotary") return "🔄";
  return MODIFIER_ICON[maneuver.modifier] || "⬆️";
}

/**
 * Turns one OSRM route step into human-readable text. OSRM's maneuver
 * vocabulary (see their Step Maneuver Object docs) has more types than any
 * app bothers to phrase individually — the ones below cover what a driving
 * route actually produces; anything else falls back to a plain "Continue
 * on <road>" rather than showing an internal type string to the driver.
 *
 * @param {Object} step - one OSRM route.legs[].steps[] entry
 * @returns {string}
 */
function _maneuverText(step) {
  const m = step.maneuver || {};
  const name = step.name || "the road";

  switch (m.type) {
    case "depart":
      return `Head out on ${name}`;
    case "arrive":
      return m.modifier
        ? `Arrive — your destination is on the ${m.modifier}`
        : "You have arrived at your destination";
    case "turn":
      return m.modifier ? `Turn ${m.modifier} onto ${name}` : `Turn onto ${name}`;
    case "new name":
      return `Continue onto ${name}`;
    case "merge":
      return `Merge onto ${name}`;
    case "on ramp":
      return `Take the ramp onto ${name}`;
    case "off ramp":
      return `Take the exit onto ${name}`;
    case "fork":
      return `Keep ${m.modifier || "straight"} onto ${name}`;
    case "end of road":
      return `At the end of the road, turn ${m.modifier || ""} onto ${name}`.replace(/\s+/g, " ");
    case "continue":
      return m.modifier && m.modifier !== "straight"
        ? `Continue ${m.modifier} onto ${name}`
        : `Continue straight on ${name}`;
    case "roundabout":
    case "rotary":
      return m.exit
        ? `At the roundabout, take exit ${m.exit} onto ${name}`
        : `Enter the roundabout onto ${name}`;
    case "roundabout turn":
      return `At the roundabout, turn ${m.modifier || ""} onto ${name}`.replace(/\s+/g, " ");
    default:
      return `Continue on ${name}`;
  }
}

// ================================================================
//  MAP LAYER + LIVE MARKER
// ================================================================

function _ensureNavRouteLayer() {
  if (navRouteLayer) return;
  navRouteSource = new VectorSource();
  navRouteLayer = new VectorLayer({
    source: navRouteSource,
    zIndex: 340,
    style: new Style({
      stroke: new Stroke({ color: "#4f46e5", width: 5, lineCap: "round", lineJoin: "round" }),
    }),
  });
  this.map.addLayer(navRouteLayer);
}

function _drawNavRoute(coordsLngLat) {
  this._ensureNavRouteLayer();
  navRouteSource.clear();
  navRouteSource.addFeature(
    new Feature(new LineString(coordsLngLat.map((c) => fromLonLat(c)))),
  );
}

function _liveMarkerHtml(headingDeg) {
  const rotation = Number.isFinite(headingDeg) ? headingDeg : 0;
  return `
    <div style="position:relative;width:28px;height:28px;">
      <div style="position:absolute;inset:0;border-radius:9999px;background:rgba(79,70,229,0.25);animation:nav-pulse 2s ease-out infinite;"></div>
      <div style="position:absolute;inset:6px;border-radius:9999px;background:#4f46e5;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);transform:rotate(${rotation}deg);display:flex;align-items:center;justify-content:center;">
        <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid #fff;margin-top:-2px;"></div>
      </div>
    </div>`;
}

function _placeLiveMarker(lat, lng, headingDeg) {
  if (!liveMarker) {
    liveMarker = new HtmlMarker(this.map, {
      lat,
      lng,
      html: _liveMarkerHtml(headingDeg),
      className: "nav-live-marker",
      size: [28, 28],
      anchor: [14, 14],
      zIndex: 1100,
    });
  } else {
    liveMarker.setPosition(lat, lng);
    liveMarker.setHtml(_liveMarkerHtml(headingDeg));
  }
}

function _removeLiveMarker() {
  liveMarker?.remove();
  liveMarker = null;
}

// ================================================================
//  ROUTE FETCH
// ================================================================

/**
 * @param {{lat:number,lng:number}} from
 * @param {{lat:number,lng:number}} to
 * @returns {Promise<{distanceM:number, durationS:number, coords:Array<[number,number]>, steps:Array}>}
 */
async function _fetchOsrmRoute(from, to) {
  const url = `${OSRM_BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OSRM request failed (${res.status})`);
  const data = await res.json();
  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error(data.message || "No route found");
  }
  const route = data.routes[0];
  const steps = route.legs.flatMap((leg) => leg.steps);
  return {
    distanceM: route.distance,
    durationS: route.duration,
    coords: route.geometry.coordinates, // [lng, lat] pairs
    steps,
  };
}

// ================================================================
//  NAVIGATION STATE MACHINE
// ================================================================

function _resetNavState() {
  this._navRoute = null;
  this._navStepIndex = 0;
  this._navAnnounced = {}; // stepIndex -> { approach: bool, imminent: bool }
  this._navOffRouteStrikes = 0;
  this._navLastRerouteTs = 0;
  this._navRerouting = false;
  this._navOrigin = null;
  this._navLastManualPanTs = 0;
}

/**
 * Step 1: locate the user, fetch a preview route to the currently selected
 * location, and show the preview card. Doesn't start GPS tracking yet —
 * that only begins once the user taps "Start Navigation", so the
 * geolocation *watch* (continuous, battery-relevant) isn't requested until
 * they've actually committed.
 */
async function startNavigationPreview() {
  if (this.selectedLat == null || this.selectedLng == null) {
    this.showToast("Pick a location first.", "info");
    return;
  }
  if (!("geolocation" in navigator)) {
    this.showToast("This browser doesn't support geolocation.", "error");
    return;
  }

  this._resetNavState();
  this._navDestination = {
    lat: this.selectedLat,
    lng: this.selectedLng,
    name: this.selectedName || "destination",
  };

  this.$.navPanel?.classList.remove("hidden");
  this.$.navPreview?.classList.remove("hidden");
  this.$.navActive?.classList.add("hidden");
  if (this.$.navPreviewDestination) {
    this.$.navPreviewDestination.textContent = this._navDestination.name;
  }
  if (this.$.navPreviewStats) {
    this.$.navPreviewStats.textContent = "Finding your location…";
  }
  if (this.$.navStartBtn) this.$.navStartBtn.disabled = true;

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      this._navOrigin = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (this.$.navPreviewStats) this.$.navPreviewStats.textContent = "Routing…";

      try {
        const route = await this._fetchOsrmRoute(this._navOrigin, this._navDestination);
        this._navRoute = route;
        this._drawNavRoute(route.coords);
        if (this.$.navPreviewStats) {
          this.$.navPreviewStats.textContent = `${this._formatDistance(route.distanceM)} · ${this._formatDuration(route.durationS)} by car`;
        }
        if (this.$.navStartBtn) this.$.navStartBtn.disabled = false;
      } catch (e) {
        console.warn("Navigation route fetch failed:", e);
        if (this.$.navPreviewStats) {
          this.$.navPreviewStats.textContent =
            "Couldn't reach the routing service. Try again shortly.";
        }
      }
    },
    (err) => {
      console.warn("Geolocation failed:", err);
      if (this.$.navPreviewStats) {
        this.$.navPreviewStats.textContent =
          err.code === err.PERMISSION_DENIED
            ? "Location permission is needed for directions."
            : "Couldn't get your location.";
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
  );
}

/** Step 2: the user tapped Start — begin the live GPS watch and voice guidance. */
function beginTurnByTurn() {
  if (!this._navRoute) return;

  this.$.navPreview?.classList.add("hidden");
  this.$.navActive?.classList.remove("hidden");

  // Lock into a close-in follow zoom, remembering the prior view to restore
  // on stop rather than leaving the user zoomed into a random street.
  const view = this.map.getView();
  this._navPreZoom = view.getZoom();
  this._navPreCenter = view.getCenter();
  view.animate({ zoom: Math.max(view.getZoom(), 16), duration: 400 });

  this._navFollowHandler = () => {
    this._navLastManualPanTs = Date.now();
  };
  this.map.on("pointerdown", this._navFollowHandler);

  this._renderCurrentStep();

  this._navWatchId = navigator.geolocation.watchPosition(
    (pos) => this._onNavPosition(pos),
    (err) => console.warn("Navigation position watch error:", err),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 },
  );

  this.showToast("Navigation started", "success", 2000);
}

function _renderCurrentStep() {
  const step = this._navRoute?.steps?.[this._navStepIndex];
  if (!step) return;

  if (this.$.navManeuverIcon) this.$.navManeuverIcon.textContent = this._maneuverIcon(step.maneuver);
  if (this.$.navManeuverText) this.$.navManeuverText.textContent = this._maneuverText(step);
  if (this.$.navManeuverDistance) {
    this.$.navManeuverDistance.textContent = this._formatDistance(step.distance);
  }
}

function _updateEtaAndRemaining() {
  if (!this._navRoute) return;
  const remainingSteps = this._navRoute.steps.slice(this._navStepIndex);
  const remainingDistance = remainingSteps.reduce((sum, s) => sum + s.distance, 0);
  const remainingDuration = remainingSteps.reduce((sum, s) => sum + s.duration, 0);

  if (this.$.navRemainingDistance) {
    this.$.navRemainingDistance.textContent = this._formatDistance(remainingDistance);
  }
  if (this.$.navEta) {
    const eta = new Date(Date.now() + remainingDuration * 1000);
    this.$.navEta.textContent = `${_formatDuration(remainingDuration)} (${eta.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})`;
  }
}

function _speak(text) {
  if (this._navMuted) return;
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel(); // don't stack overlapping cues
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    // speech synthesis can throw on some locked-down/embedded browsers —
    // navigation should keep working visually either way
    console.warn("Speech synthesis failed:", e);
  }
}

function _maybeAnnounce(step, distanceToManeuver) {
  const idx = this._navStepIndex;
  if (!this._navAnnounced[idx]) this._navAnnounced[idx] = {};
  const flags = this._navAnnounced[idx];
  const text = this._maneuverText(step);

  if (!flags.approach && distanceToManeuver <= ANNOUNCE_APPROACH_M) {
    flags.approach = true;
    this._speak(`In ${this._formatDistance(distanceToManeuver)}, ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
  }
  if (!flags.imminent && distanceToManeuver <= ANNOUNCE_IMMINENT_M) {
    flags.imminent = true;
    this._speak(text);
  }
}

async function _onNavPosition(pos) {
  if (!this._navRoute) return;
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const heading = Number.isFinite(pos.coords.heading) ? pos.coords.heading : null;

  // Fall back to the bearing from the last fix if the device doesn't report
  // a heading (common indoors / on some laptops with no compass) but has
  // moved enough for the direction of travel to be meaningful.
  let displayHeading = heading;
  if (displayHeading == null && this._navLastFix) {
    const moved = _haversineMeters(this._navLastFix.lat, this._navLastFix.lng, lat, lng);
    if (moved > 3) {
      displayHeading = _bearingDegrees(this._navLastFix.lat, this._navLastFix.lng, lat, lng);
    }
  }
  this._navLastFix = { lat, lng };

  this._placeLiveMarker(lat, lng, displayHeading);

  // Auto-follow, paused briefly after the user manually touches the map.
  if (Date.now() - this._navLastManualPanTs > MANUAL_PAN_GRACE_MS) {
    this.map.getView().animate({ center: fromLonLat([lng, lat]), duration: 600 });
  }

  const step = this._navRoute.steps[this._navStepIndex];
  if (!step) return;

  const [mLng, mLat] = step.maneuver.location;
  const distanceToManeuver = _haversineMeters(lat, lng, mLat, mLng);

  if (step.maneuver.type === "arrive") {
    if (distanceToManeuver <= STEP_ADVANCE_METERS) {
      this._speak("You have arrived at your destination.");
      this.showToast(`Arrived at ${this._navDestination?.name || "your destination"}`, "success");
      this.cancelNavigation();
      return;
    }
    if (this.$.navManeuverDistance) {
      this.$.navManeuverDistance.textContent = this._formatDistance(distanceToManeuver);
    }
  } else if (distanceToManeuver <= STEP_ADVANCE_METERS) {
    this._navStepIndex++;
    this._renderCurrentStep();
  } else if (this.$.navManeuverDistance) {
    this.$.navManeuverDistance.textContent = this._formatDistance(distanceToManeuver);
  }

  this._maybeAnnounce(step, distanceToManeuver);
  this._updateEtaAndRemaining();

  // Off-route detection / rerouting — debounced by a strike counter (avoid
  // reacting to one noisy GPS fix) and a cooldown (avoid hammering OSRM's
  // shared demo server if the signal stays bad).
  const offRouteDist = _distanceToRouteMeters(lat, lng, this._navRoute.coords);
  if (offRouteDist > OFF_ROUTE_METERS) {
    this._navOffRouteStrikes++;
  } else {
    this._navOffRouteStrikes = 0;
    this.$.navOffRouteBanner?.classList.add("hidden");
  }

  if (
    this._navOffRouteStrikes >= OFF_ROUTE_STRIKES_TO_REROUTE &&
    !this._navRerouting &&
    Date.now() - this._navLastRerouteTs > REROUTE_COOLDOWN_MS
  ) {
    this.$.navOffRouteBanner?.classList.remove("hidden");
    this._reroute(lat, lng);
  }
}

async function _reroute(lat, lng) {
  this._navRerouting = true;
  this._navLastRerouteTs = Date.now();
  this.$.navRerouteBanner?.classList.remove("hidden");

  try {
    const route = await this._fetchOsrmRoute({ lat, lng }, this._navDestination);
    this._navRoute = route;
    this._navStepIndex = 0;
    this._navAnnounced = {};
    this._navOffRouteStrikes = 0;
    this._drawNavRoute(route.coords);
    this._renderCurrentStep();
    this._updateEtaAndRemaining();
  } catch (e) {
    console.warn("Reroute failed:", e);
    this.showToast("Couldn't reroute — still tracking the original route.", "error");
  } finally {
    this._navRerouting = false;
    this.$.navRerouteBanner?.classList.add("hidden");
    this.$.navOffRouteBanner?.classList.add("hidden");
  }
}

function toggleNavMute(force) {
  this._navMuted = force ?? !this._navMuted;
  if (this._navMuted && "speechSynthesis" in window) window.speechSynthesis.cancel();
  this.$.navMuteBtn?.setAttribute("aria-pressed", String(this._navMuted));
  this.$.navMuteIcon?.classList.toggle("text-red-500", this._navMuted);
}

/** Cancels a preview or an active session and tears everything down. */
function cancelNavigation() {
  if (this._navWatchId != null) {
    navigator.geolocation.clearWatch(this._navWatchId);
    this._navWatchId = null;
  }
  if (this._navFollowHandler) {
    this.map.un("pointerdown", this._navFollowHandler);
    this._navFollowHandler = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();

  this._removeLiveMarker();
  navRouteSource?.clear();

  if (this._navPreZoom != null && this._navPreCenter) {
    this.map.getView().animate({
      center: this._navPreCenter,
      zoom: this._navPreZoom,
      duration: 400,
    });
  }

  this.$.navPanel?.classList.add("hidden");
  this._resetNavState();
}

export function init(app) {
  app._formatDistance = _formatDistance;
  app._formatDuration = _formatDuration;
  app._maneuverIcon = _maneuverIcon;
  app._maneuverText = _maneuverText;
  app._ensureNavRouteLayer = _ensureNavRouteLayer;
  app._drawNavRoute = _drawNavRoute;
  app._placeLiveMarker = _placeLiveMarker;
  app._removeLiveMarker = _removeLiveMarker;
  app._fetchOsrmRoute = _fetchOsrmRoute;
  app._resetNavState = _resetNavState;
  app._renderCurrentStep = _renderCurrentStep;
  app._updateEtaAndRemaining = _updateEtaAndRemaining;
  app._speak = _speak;
  app._maybeAnnounce = _maybeAnnounce;
  app._onNavPosition = _onNavPosition;
  app._reroute = _reroute;
  app.startNavigationPreview = startNavigationPreview;
  app.beginTurnByTurn = beginTurnByTurn;
  app.toggleNavMute = toggleNavMute;
  app.cancelNavigation = cancelNavigation;
  app._navMuted = false;
}

// Pure functions exported for unit testing, same pattern as
// features/isobars.js's marchingSquaresContour.
export {
  _haversineMeters as haversineMeters,
  _bearingDegrees as bearingDegrees,
  _distanceToRouteMeters as distanceToRouteMeters,
  _formatDistance as formatNavDistance,
  _formatDuration as formatNavDuration,
  _maneuverText as maneuverText,
  _maneuverIcon as maneuverIcon,
};
