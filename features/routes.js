// Feature: Route / Travel Weather — draw a polyline on the map and sample the
// forecast at each stop (drive / run / bike / road-trip). Uses the existing
// Leaflet map and Open-Meteo along-point requests. No backend required.
let appRef = null;
let routeMode = false;
let pts = [];
let poly = null;
let btn = null;

export function init(app) {
  appRef = app;
  btn = document.getElementById("routeBtn");
  if (btn) btn.addEventListener("click", toggleRoute);
}

function toggleRoute() {
  if (!appRef || !appRef.map) return;
  routeMode = !routeMode;
  if (routeMode) {
    pts = [];
    if (poly) {
      appRef.map.removeLayer(poly);
      poly = null;
    }
    if (btn) {
      btn.classList.add("bg-primary", "text-white");
      btn.title = "Tap map to add stops, click again to finish";
    }
    appRef.showToast("Route mode: tap the map to add stops", "info");
    appRef.map.on("click", onMapClick);
  } else {
    appRef.map.off("click", onMapClick);
    if (btn) {
      btn.classList.remove("bg-primary", "text-white");
      btn.title = "Draw a route";
    }
    finishRoute();
  }
}

function onMapClick(e) {
  if (!routeMode) return;
  pts.push([e.latlng.lat, e.latlng.lng]);
  drawPoly();
}

function drawPoly() {
  if (!appRef.map) return;
  if (poly) appRef.map.removeLayer(poly);
  poly = L.polyline(pts, {
    color: "#6366f1",
    weight: 4,
    opacity: 0.85,
    dashArray: "6 6",
  }).addTo(appRef.map);
}

async function finishRoute() {
  if (pts.length < 2) {
    appRef.showToast("Add at least two stops", "info");
    return;
  }
  appRef.showToast("Fetching weather along route…", "info");
  try {
    const results = await Promise.all(
      pts.map(([la, ln]) =>
        fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=" +
            la +
            "&longitude=" +
            ln +
            "&current=temperature_2m,precipitation,weather_code,wind_speed_10m&timezone=auto",
        )
          .then((r) => r.json())
          .catch(() => null),
      ),
    );
    const valid = results.filter(Boolean);
    const rainy = valid.filter(
      (j) => j.current && j.current.precipitation > 0,
    ).length;
    const last = valid[valid.length - 1];
    const dest =
      typeof WeatherService !== "undefined" &&
      WeatherService.getWeatherInfo &&
      last
        ? WeatherService.getWeatherInfo(last.current.weather_code, true)
        : null;
    appRef.showToast(
      "Route: " +
        valid.length +
        " stops" +
        (rainy ? ", 🌧️ rain at " + rainy : ", dry") +
        (dest
          ? " · dest " +
            dest.dayIcon +
            " " +
            last.current.temperature_2m.toFixed(0) +
            "°C"
          : ""),
      "success",
    );
  } catch (e) {
    appRef.showToast("Route weather failed", "error");
  }
}
