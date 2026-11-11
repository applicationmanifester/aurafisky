// -- NEW FEATURES: Auto-Refresh, Temp Overlay, PWA, Compact, Shareable URL --
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import { Style, Circle as CircleStyle, Fill, Stroke, Text } from "ol/style.js";
import { fromLonLat } from "ol/proj.js";
import { guardedOpenMeteoFetch } from "../modules/openmeteo-guard.js";

let tempOverlaySource = null;
let tempOverlayLayer = null;
let tempOverlayRequestId = 0;

function ensureTempOverlayLayer(app) {
  if (tempOverlayLayer) return;
  tempOverlaySource = new VectorSource();
  tempOverlayLayer = new VectorLayer({ source: tempOverlaySource, zIndex: 450 });
  app.map.addLayer(tempOverlayLayer);
}

// Leaflet's circleMarker took separate fill/stroke opacities; ol/style bakes
// alpha into the color itself, so parse-and-reapply on the rgb(...) strings
// tempToColor() produces.
function withAlpha(rgbColor, alpha) {
  const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgbColor);
  return m ? `rgba(${m[1]},${m[2]},${m[3]},${alpha})` : rgbColor;
}

  // NOTE: readShareableUrl()/updateShareableUrl() used to live here. They were
  // superseded by _checkUrlParamsOnStartup() and _updateUrlParams(), which
  // additionally validate the lat/lng ranges, preserve any unrelated query
  // params, and guard with `!= null` rather than a falsy check (the old code
  // silently refused to write a URL for any location on the equator or the
  // prime meridian, where lat or lng is exactly 0).

function installPWA() {
    // iOS Safari: no programmatic install — guide the user to the
    // Share sheet → "Add to Home Screen".
    if (this._isIOS || !this.deferredPrompt) {
      this.showToast(
        "Tap ⑆ Share, then “Add to Home Screen” to install.",
        "info",
        5000,
      );
      return;
    }
    this.deferredPrompt.prompt();
    this.deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        this.showToast("Aurafisky installed!", "success");
      }
      this.deferredPrompt = null;
      this.$.installBtn?.classList.add("hidden");
    });
  }

async function initTempOverlayLayers() {
    this.clearTempOverlay();
    const requestId = ++tempOverlayRequestId;
    if (!Number.isFinite(this.selectedLat) || !Number.isFinite(this.selectedLng)) return;

    const lat = this.selectedLat;
    const lng = this.selectedLng;
    const offsets = [-0.5, -0.25, 0, 0.25, 0.5];
    const points = [];
    for (const dlat of offsets) {
      for (const dlng of offsets) {
        points.push({
          lat: Math.max(-90, Math.min(90, lat + dlat)),
          lng: ((lng + dlng + 180) % 360 + 360) % 360 - 180,
        });
      }
    }

    try {
      const latsParam = points.map((p) => p.lat.toFixed(4)).join(",");
      const lngsParam = points.map((p) => p.lng.toFixed(4)).join(",");
      let results = await guardedOpenMeteoFetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latsParam}&longitude=${lngsParam}&current=temperature_2m,weather_code&timezone=auto`,
      )
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch weather grid");
          return res.json();
        })
        .catch((err) => {
          console.error("Weather grid fetch error:", err);
          return [];
        });

      if (!Array.isArray(results)) {
        results = [results];
      }

      // A slower request for the previous map point must not paint over the
      // latest selection.
      if (requestId !== tempOverlayRequestId) return;

      const validResults = results
        .map((data, i) => ({ data, point: points[i], temp: data?.current?.temperature_2m }))
        .filter((item) => Number.isFinite(item.temp) && item.point);
      if (!validResults.length) return;

      const temperatures = validResults.map((item) => item.temp);
      const tempMin = Math.min(...temperatures);
      const tempMax = Math.max(...temperatures);
      const tempRange = Math.max(1, tempMax - tempMin);

      validResults.forEach(({ temp, point: pt }) => {
        const color = this.tempToColor(temp);
        ensureTempOverlayLayer(this);
        const feature = new Feature(new Point(fromLonLat([pt.lng, pt.lat])));
        feature.setStyle(
          new Style({
            image: new CircleStyle({
              radius: 20,
              fill: new Fill({ color: withAlpha(color, 0.72) }),
              stroke: new Stroke({ color: withAlpha(color, 0.95), width: 1.5 }),
            }),
            text: new Text({
              text: `${temp.toFixed(1)}°`,
              font: "bold 11px sans-serif",
              fill: new Fill({ color: "#ffffff" }),
              stroke: new Stroke({ color: "#0f172a", width: 2.5 }),
            }),
          }),
        );
        tempOverlaySource.addFeature(feature);
        this.tempOverlayLayers.push(feature);
      });
    } catch (e) {
      console.warn("Temperature overlay fetch failed:", e);
    }
  }

function tempToColor(val, isFraction = false) {
    let frac;
    if (isFraction || (typeof val === "number" && val >= 0 && val <= 1 && arguments.length > 1 && isFraction)) {
      frac = Math.max(0, Math.min(1, val));
    } else if (typeof val === "number") {
      // Map Celsius temperature (-5°C to 42°C) onto 0..1 scale
      frac = Math.max(0, Math.min(1, (val - (-5)) / (42 - (-5))));
    } else {
      frac = 0.5;
    }

    // Meteorological temperature scale: Blue -> Cyan -> Green -> Yellow -> Orange -> Red
    const stops = [
      { f: 0.0, r: 29, g: 78, b: 216 },   // Cold (< 0°C)
      { f: 0.2, r: 2, g: 132, b: 199 },   // Chilly (0-10°C)
      { f: 0.4, r: 22, g: 163, b: 74 },   // Mild / Green (10-22°C)
      { f: 0.6, r: 234, g: 179, b: 8 },   // Warm / Yellow (22-28°C)
      { f: 0.8, r: 234, g: 88, b: 12 },   // Hot / Orange (28-35°C)
      { f: 1.0, r: 220, g: 38, b: 38 },   // Extreme / Red (> 35°C)
    ];

    for (let i = 0; i < stops.length - 1; i++) {
      const s1 = stops[i];
      const s2 = stops[i + 1];
      if (frac >= s1.f && frac <= s2.f) {
        const t = (frac - s1.f) / (s2.f - s1.f);
        const r = Math.round(s1.r + t * (s2.r - s1.r));
        const g = Math.round(s1.g + t * (s2.g - s1.g));
        const b = Math.round(s1.b + t * (s2.b - s1.b));
        return `rgb(${r},${g},${b})`;
      }
    }
    return "rgb(220,38,38)";
  }

function clearTempOverlay() {
    // Invalidate any in-flight fetch before clearing the currently drawn grid.
    tempOverlayRequestId++;
    if (tempOverlaySource) tempOverlaySource.clear();
    this.tempOverlayLayers = [];
  }

function initWindParticles() {
    const w = this.canvas?.width || 400;
    const h = this.canvas?.height || 400;
    const dir = ((this.currentWindDirection || 0) * Math.PI) / 180;
    this.particles = [];
    for (let i = 0; i < 25; i++) {
      this.particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vBase: 2 + Math.random() * 4,
        len: 40 + Math.random() * 80,
        opacity: 0.08 + Math.random() * 0.18,
        curveOffset: Math.random() * Math.PI * 2,
        dir: dir + (Math.random() - 0.5) * 0.6,
      });
    }
  }

export function init(app) {
  app.installPWA = installPWA;
  app.initTempOverlayLayers = initTempOverlayLayers;
  app.tempToColor = tempToColor;
  app.clearTempOverlay = clearTempOverlay;
  app.initWindParticles = initWindParticles;
}
