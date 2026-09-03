// Feature: Route / Travel Weather — draw a line on the map and sample the
// forecast at each stop (drive / run / bike / road-trip). Uses the existing
// OpenLayers map and Open-Meteo along-point requests. No backend required.
//
// Shows a per-stop timeline and an aggregate weather card in a floating
// panel styled to match the rest of the app (glass card, Tailwind classes).
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import { Style, Stroke } from "ol/style.js";
import { fromLonLat, toLonLat } from "ol/proj.js";

let appRef = null;
let routeMode = false;
let pts = []; // array of [lat, lng]
let routeSource = null; // ol/source/Vector holding the drawn line
let routeLayer = null; // ol/layer/Vector

let btn = null;
let panelEl = null; // wrapping floating panel (holds timeline + card)
let headerEl = null;
let timelineEl = null; // <ul> for per-stop details
let cardEl = null; // <div> for the aggregate card

/**
 * Initialise the feature – called from the main app.
 * @param {Object} app – the main app object (must have .map, .showToast)
 */
export function init(app) {
  appRef = app;
  btn = document.getElementById("routeBtn");
  if (btn) btn.addEventListener("click", toggleRoute);
  buildPanel();
}

/**
 * Build the floating panel once. Placed top-right, below the top toolbar and
 * above the bottom timeline strip, so it doesn't collide with either — the
 * previous version appended (or tried to append) to a `container` property
 * that never existed on the app, so nothing was ever visible.
 */
function buildPanel() {
  panelEl = document.getElementById("routePanel");
  if (panelEl) {
    headerEl = panelEl.querySelector("[data-role='route-header']");
    timelineEl = document.getElementById("routeTimeline");
    cardEl = document.getElementById("routeWeatherCard");
    return;
  }

  panelEl = document.createElement("div");
  panelEl.id = "routePanel";
  panelEl.className =
    "hidden glass rounded-2xl shadow-2xl overflow-hidden fixed top-20 right-4 z-[1001] " +
    "w-72 max-h-[calc(100vh-140px)] flex flex-col " +
    "border border-slate-200/60 dark:border-slate-600/30";

  headerEl = document.createElement("div");
  headerEl.setAttribute("data-role", "route-header");
  headerEl.className =
    "flex items-center justify-between px-3.5 py-2.5 border-b border-slate-200/50 dark:border-slate-700/40 flex-shrink-0";
  headerEl.innerHTML = `
    <span class="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">🧭 Route Weather</span>
    <button type="button" data-role="route-close" aria-label="Close route weather" class="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-700/40 text-slate-400 transition-colors">✕</button>
  `;
  headerEl
    .querySelector("[data-role='route-close']")
    .addEventListener("click", () => {
      panelEl.classList.add("hidden");
    });

  const body = document.createElement("div");
  body.className = "overflow-y-auto custom-scrollbar px-3.5 py-3 space-y-3";

  timelineEl = document.createElement("ul");
  timelineEl.id = "routeTimeline";
  timelineEl.className = "space-y-1.5 list-none p-0 m-0";

  cardEl = document.createElement("div");
  cardEl.id = "routeWeatherCard";
  cardEl.className =
    "bg-slate-100/60 dark:bg-slate-700/40 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300";

  body.appendChild(timelineEl);
  body.appendChild(cardEl);
  panelEl.appendChild(headerEl);
  panelEl.appendChild(body);
  document.body.appendChild(panelEl);
}

/**
 * Create the route's vector layer the first time it's needed.
 */
function ensureRouteLayer() {
  if (routeLayer) return;
  routeSource = new VectorSource();
  routeLayer = new VectorLayer({
    source: routeSource,
    // Dashed indigo line — same look as the old Leaflet polyline
    // (#6366f1 @ 0.85 opacity, 4px), baked into the stroke color as rgba
    // since ol/style has no separate opacity knob for strokes.
    style: new Style({
      stroke: new Stroke({ color: "rgba(99,102,241,0.85)", width: 4, lineDash: [6, 6] }),
    }),
    zIndex: 400,
  });
  appRef.map.addLayer(routeLayer);
}

/**
 * Toggle drawing mode on/off.
 */
function toggleRoute() {
  if (!appRef || !appRef.map) return;
  routeMode = !routeMode;
  // Read by the core map-click handler in app.js, which used to also run
  // its own "select this location" flow on every stop tap — yanking the
  // main weather panel + marker to each new point and making whatever was
  // showing look like it "disappeared immediately". Suppressed while true.
  appRef._routeModeActive = routeMode;

  if (routeMode) {
    // ----- start a new route -----
    pts = [];
    ensureRouteLayer();
    routeSource.clear();
    if (btn) {
      btn.classList.add("bg-primary", "text-white");
      btn.title = "Tap map to add stops, click again to finish";
    }
    clearUI();
    appRef.showToast("Route mode: tap the map to add stops", "info");
    appRef.map.on("click", onMapClick);
  } else {
    // ----- finish drawing -----
    appRef.map.un("click", onMapClick);
    if (btn) {
      btn.classList.remove("bg-primary", "text-white");
      btn.title = "Draw a route";
    }
    finishRoute();
  }
}

/**
 * Handle a map click – add a vertex and redraw the line.
 */
function onMapClick(e) {
  if (!routeMode) return;
  const [lng, lat] = toLonLat(e.coordinate);
  pts.push([lat, lng]);
  drawLine();
}

/**
 * Draw/update the route line.
 */
function drawLine() {
  if (!appRef.map) return;
  ensureRouteLayer();
  routeSource.clear();
  if (pts.length > 1) {
    const coords = pts.map(([lat, lng]) => fromLonLat([lng, lat]));
    routeSource.addFeature(new Feature(new LineString(coords)));
  }
}

/**
 * Clear the timeline and card (called when starting a new route).
 */
function clearUI() {
  if (timelineEl) timelineEl.innerHTML = "";
  if (cardEl) cardEl.innerHTML = "";
  if (panelEl) panelEl.classList.add("hidden");
}

function weatherInfo(code) {
  return typeof WeatherService !== "undefined" && WeatherService.getWeatherInfo
    ? WeatherService.getWeatherInfo(code, true)
    : { icon: "❓", description: "Unknown" };
}

/**
 * After the user finishes drawing, fetch weather for each stop,
 * populate the timeline & card, and show the summary toast.
 */
async function finishRoute() {
  if (pts.length < 2) {
    appRef.showToast("Add at least two stops", "info");
    return;
  }

  appRef.showToast("Fetching weather along route…", "info");

  try {
    // ---- 1. Fetch weather for every point (parallel) ----
    const rawResults = await Promise.all(
      pts.map(([lat, lng]) =>
        fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
            `&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto`,
        )
          .then((r) => r.json())
          .catch(() => null),
      ),
    );

    // ---- 2. Keep only the successful responses ----
    const results = rawResults.filter(Boolean);
    const validCount = results.length;
    const rainyCount = results.filter(
      (r) => r.current && r.current.precipitation > 0,
    ).length;

    // ---- 3. Build per-stop timeline items ----
    // Bug fix: this used to read `iconObj.dayIcon`, a property that doesn't
    // exist on what WeatherService.getWeatherInfo() returns (it's `.icon`),
    // so every row showed literal "undefined" where the icon/description
    // should be. Also added: description text and wind speed per stop.
    if (timelineEl) {
      timelineEl.innerHTML = "";
      results.forEach((data, idx) => {
        const cur = data.current;
        const info = weatherInfo(cur.weather_code);

        const li = document.createElement("li");
        li.className =
          "flex items-start gap-2.5 py-2 px-2.5 rounded-lg bg-slate-100/50 dark:bg-slate-700/30";
        li.innerHTML = `
          <span class="text-xl leading-none flex-shrink-0" aria-hidden="true">${info.icon}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs font-bold text-slate-700 dark:text-slate-200">Stop ${idx + 1}</span>
              <span class="text-sm font-extrabold text-slate-900 dark:text-white">${cur.temperature_2m.toFixed(0)}°C</span>
            </div>
            <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">${info.description}</div>
            <div class="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-2">
              <span>💨 ${cur.wind_speed_10m.toFixed(0)} km/h</span>
              ${cur.precipitation > 0 ? `<span>🌧️ ${cur.precipitation.toFixed(1)} mm</span>` : ""}
            </div>
          </div>
        `;
        timelineEl.appendChild(li);
      });
    }

    // ---- 4. Build aggregate weather card ----
    if (cardEl) {
      const temps = results
        .map((r) => r.current.temperature_2m)
        .filter((t) => typeof t === "number");
      const avgTemp =
        temps.length > 0
          ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1)
          : "--";
      const minTemp = temps.length > 0 ? Math.min(...temps).toFixed(0) : "--";
      const maxTemp = temps.length > 0 ? Math.max(...temps).toFixed(0) : "--";
      const maxWind = results.length
        ? Math.max(...results.map((r) => r.current.wind_speed_10m || 0)).toFixed(0)
        : "--";

      const iconStrip = results
        .map((r, i) => {
          const info = weatherInfo(r.current.weather_code);
          return `<span title="Stop ${i + 1}: ${info.description}, ${r.current.temperature_2m.toFixed(0)}°C">${info.icon}</span>`;
        })
        .join(" ");

      cardEl.innerHTML = `
        <div class="font-bold text-slate-700 dark:text-slate-200 mb-2">Route Summary</div>
        <div class="grid grid-cols-2 gap-y-1">
          <div>Stops</div><div class="text-right font-semibold text-slate-800 dark:text-slate-100">${validCount}</div>
          <div>Rainy stops</div><div class="text-right font-semibold text-slate-800 dark:text-slate-100">${rainyCount}${rainyCount ? " 🌧️" : ""}</div>
          <div>Avg temp</div><div class="text-right font-semibold text-slate-800 dark:text-slate-100">${avgTemp}°C</div>
          <div>Range</div><div class="text-right font-semibold text-slate-800 dark:text-slate-100">${minTemp}°C – ${maxTemp}°C</div>
          <div>Max wind</div><div class="text-right font-semibold text-slate-800 dark:text-slate-100">${maxWind} km/h</div>
        </div>
        <div class="mt-2.5 text-base leading-none">${iconStrip}</div>
      `;
    }

    if (panelEl) panelEl.classList.remove("hidden");

    // ---- 5. Summary toast ----
    const lastValid = results[results.length - 1];
    const destInfo = lastValid ? weatherInfo(lastValid.current.weather_code) : null;

    appRef.showToast(
      `Route: ${validCount} stops${rainyCount ? `, 🌧️ rain at ${rainyCount}` : ""}${
        destInfo
          ? ` · dest ${destInfo.icon} ${lastValid.current.temperature_2m.toFixed(0)}°C`
          : ""
      }`,
      "success",
    );
  } catch (e) {
    console.error(e);
    appRef.showToast("Route weather failed", "error");
  }
}
