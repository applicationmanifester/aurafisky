// -- DAY/NIGHT TERMINATOR OVERLAY --
//
// Draws the solar terminator (the sunlight/darkness boundary) as a
// translucent night-side polygon on the OpenLayers map, the way any
// "living satellite" globe view does. Purely client-side: the sun's
// position is computed from the reference time alone (Spencer 1971's
// approximate solar-position series — the same public-domain formula
// behind NOAA's solar calculator and most open day/night map plugins),
// no network request involved.
//
// The overlay tracks whatever time the rest of the app is showing: it
// redraws on every updateWeatherDisplay() call (see updateAstronomyWidget's
// call site in app.js), so scrubbing the timeline 18 hours into the future
// slides the terminator to match, and a 5-minute interval keeps it live
// when the timeline is parked on "now".

import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import MultiPolygon from "ol/geom/MultiPolygon.js";
import { Style, Fill } from "ol/style.js";
import { fromLonLat } from "ol/proj.js";

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
// One ring per world copy the multiWorld view can be panned to. Three
// worlds either side covers any pan distance a user gets to by scrolling
// rather than teleporting.
const WORLD_OFFSETS = [-1080, -720, -360, 0, 360, 720, 1080];
const LNG_STEP = 4; // degrees between sampled terminator points — smooth
                     // enough that the curve doesn't facet at low zoom,
                     // cheap enough to recompute every few minutes.

let terminatorSource = null;
let terminatorLayer = null;

/**
 * Parses any reference date/time representation into a reliable UTC Date.
 * Handles naive local ISO strings (e.g. "2026-09-04T06:00" from Open-Meteo)
 * by applying the forecast location's utcOffsetSeconds so that browser local
 * time offset does not distort solar longitude.
 *
 * @param {Date|string|number} [ref]
 * @param {number} [utcOffsetSeconds=0]
 * @returns {Date}
 */
export function _parseToUtcDate(ref, utcOffsetSeconds = 0) {
  if (ref instanceof Date) return ref;
  if (typeof ref === "number") return new Date(ref);
  if (!ref) return new Date(); // Wall-clock "now" is globally absolute UTC

  if (typeof ref === "string") {
    // If explicit timezone offset or UTC "Z" is already specified
    if (ref.includes("Z") || /([+-]\d{2}:?\d{2})$/.test(ref)) {
      return new Date(ref);
    }
    // Naive local datetime string formatted as "YYYY-MM-DDTHH:MM..."
    const [datePart, timePart] = ref.split("T");
    if (datePart && timePart) {
      const [year, month, day] = datePart.split("-").map(Number);
      const [hour, min = 0, sec = 0] = timePart.split(":").map(Number);
      const offsetMs = (Number(utcOffsetSeconds) || 0) * 1000;
      // Subtracting location offset from local nominal timestamp yields true UTC ms
      const utcMs = Date.UTC(year, month - 1, day, hour, min, sec) - offsetMs;
      return new Date(utcMs);
    }
    return new Date(ref);
  }
  return new Date();
}

/**
 * Sun's declination and subsolar longitude for an instant, via Spencer's
 * (1971) truncated Fourier series — accurate to within about a degree,
 * which is more than the polygon's own 4°-step sampling can resolve
 * anyway.
 *
 * @param {Date} date
 * @returns {{ decDeg: number, subsolarLng: number }}
 */
export function _solarPosition(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
  const utcHours =
    date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear + (utcHours - 12) / 24);

  const dec =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  // The point directly under the sun sits where local solar time is noon.
  // 1 minute of equation-of-time offset = 0.25° of longitude.
  let subsolarLng = -15 * (utcHours - 12) - eqTimeMin / 4;
  subsolarLng = ((subsolarLng + 180) % 360 + 360) % 360 - 180;

  return { decDeg: dec * RAD, subsolarLng };
}

/**
 * Latitude of the terminator at a given longitude.
 *
 * Derived from the solar-zenith-angle-equals-90° condition
 * (sin(lat)sin(dec) + cos(lat)cos(dec)cos(H) = 0), solved for lat:
 * tan(lat) = -cos(H) / tan(dec). At the equinox (dec ≈ 0) this correctly
 * degenerates to the two meridians 90° from the subsolar point — tan(dec)
 * heads to 0, tan(lat) to ±Infinity, and Math.atan saturates at ±90°
 * without needing a special-cased branch.
 *
 * Clamped to ±85° to respect Web Mercator (EPSG:3857) valid bounds.
 *
 * @param {number} lngDeg
 * @param {number} decDeg
 * @param {number} subsolarLng
 * @returns {number} latitude in degrees
 */
export function _terminatorLat(lngDeg, decDeg, subsolarLng) {
  let h = lngDeg - subsolarLng;
  h = ((h + 180) % 360 + 360) % 360 - 180;
  const safeDec = Math.abs(decDeg) < 1e-4 ? (decDeg >= 0 ? 1e-4 : -1e-4) : decDeg;
  const tanLat = -Math.cos(h * DEG) / Math.tan(safeDec * DEG);
  const lat = Math.atan(tanLat) * RAD;
  return Math.max(-85, Math.min(85, lat));
}

/**
 * Builds the night-hemisphere polygon rings (one per world copy) for a
 * reference instant.
 *
 * @param {Date} date
 * @returns {Array<Array<[number, number]>>} rings of [lng, lat] pairs
 */
export function _buildNightRings(date) {
  const { decDeg, subsolarLng } = _solarPosition(date);
  // Whichever pole the sun's declination points away from is in polar
  // night — that's the pole the ring closes around.
  // Clamped to ±85° (Web Mercator boundary) to prevent coordinate projection overflow.
  const darkPoleLat = decDeg >= 0 ? -85 : 85;

  const curve = [];
  for (let lng = -180; lng <= 180; lng += LNG_STEP) {
    curve.push([lng, _terminatorLat(lng, decDeg, subsolarLng)]);
  }

  const baseRing = [
    ...curve,
    [180, darkPoleLat],
    [-180, darkPoleLat],
    curve[0], // Ensure explicitly closed linear ring
  ];

  return WORLD_OFFSETS.map((offset) =>
    baseRing.map(([lng, lat]) => [lng + offset, lat]),
  );
}

function _ensureLayer() {
  if (terminatorLayer) return;
  terminatorSource = new VectorSource();
  terminatorLayer = new VectorLayer({
    source: terminatorSource,
    zIndex: 300,
    style: new Style({
      // Flat translucent fill — no stroke, so the pole-closing edges at
      // the anti-meridian don't draw a visible seam line across the map.
      fill: new Fill({ color: "rgba(8, 12, 32, 0.35)" }),
    }),
  });
  this.map.addLayer(terminatorLayer);
}

/**
 * Recomputes and redraws the terminator for a reference instant.
 *
 * @param {Date|string|number} [ref] - Defaults to now. Pass the scrubbed
 *   timeline's timestamp to keep the overlay in sync with the panel.
 * @param {number} [utcOffsetSeconds] - Location timezone offset in seconds.
 */
function updateDayNightTerminator(ref, utcOffsetSeconds) {
  if (!this.terminatorEnabled || !this.map) return;
  this._ensureTerminatorLayer();

  const offset = utcOffsetSeconds ?? this.weatherData?.utc_offset_seconds ?? 0;
  const date = _parseToUtcDate(ref, offset);
  if (!Number.isFinite(date.getTime())) return;

  terminatorSource.clear();
  const rings = _buildNightRings(date);
  // MultiPolygon: Each world copy is an independent polygon with its own exterior ring,
  // preventing OpenLayers from treating world repetitions as interior cutouts (holes).
  const feature = new Feature(
    new MultiPolygon(
      rings.map((ring) => [ring.map(([lng, lat]) => fromLonLat([lng, lat]))]),
    ),
  );
  terminatorSource.addFeature(feature);
}

function toggleDayNightTerminator(force) {
  this.terminatorEnabled = force ?? !this.terminatorEnabled;
  try {
    localStorage.setItem(
      "aurafisky_terminator",
      this.terminatorEnabled ? "1" : "0",
    );
  } catch (e) {
    // storage unavailable — the toggle still works for this session
  }

  if (this.$.terminatorToggleBtn) {
    this.$.terminatorToggleBtn.setAttribute(
      "aria-pressed",
      String(this.terminatorEnabled),
    );
    this.$.terminatorToggleBtn.classList.toggle(
      "terminator-active",
      this.terminatorEnabled,
    );
  }

  if (this.terminatorEnabled) {
    // Sync to whatever instant the timeline is currently showing, falling
    // back to "now" before any location/weather has been selected.
    const shownTime = this.weatherData
      ? WeatherService.getHourlyAtIndex(this.weatherData, this.currentHourIndex)
          ?.time
      : null;
    this.updateDayNightTerminator(shownTime || undefined, this.weatherData?.utc_offset_seconds);
    if (!this._terminatorTimer) {
      this._terminatorTimer = setInterval(() => {
        // Periodic tick keeps live overlay accurate
        if (this.terminatorEnabled) {
          const curTime = this.weatherData
            ? WeatherService.getHourlyAtIndex(this.weatherData, this.currentHourIndex)?.time
            : null;
          this.updateDayNightTerminator(curTime || undefined, this.weatherData?.utc_offset_seconds);
        }
      }, 5 * 60000);
    }
  } else if (terminatorSource) {
    terminatorSource.clear();
  }
}

export function init(app) {
  app._ensureTerminatorLayer = _ensureLayer;
  app.updateDayNightTerminator = updateDayNightTerminator;
  app.toggleDayNightTerminator = toggleDayNightTerminator;

  // Restore the last session's preference. Left off by default — this is
  // a purely additive visual layer, so it shouldn't change what a returning
  // user sees until they opt in once.
  try {
    app.terminatorEnabled = localStorage.getItem("aurafisky_terminator") === "1";
  } catch (e) {
    app.terminatorEnabled = false;
  }
}
