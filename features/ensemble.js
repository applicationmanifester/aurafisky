import {
  isOpenMeteoCoolingDown,
  guardedOpenMeteoFetch,
} from "../modules/openmeteo-guard.js";

// Feature: Model Ensemble — fetches several Open-Meteo forecast models
// (ECMWF / GFS / ICON) for the selected location and shows model agreement
// plus probabilistic rain. Compute runs in a Web Worker.
let worker = null;
let reqId = 0;
let appRef = null;
const _ensembleCache = new Map();
const ENSEMBLE_CACHE_TTL = 900000; // 15 minutes

// Correct model names for Open-Meteo API
const ENSEMBLE_MODELS = [
  { id: "ecmwf_ifs04", label: "ECMWF" },
  { id: "gfs_seamless", label: "GFS" },
  { id: "icon_seamless", label: "ICON" },
];

export function init(app) {
  appRef = app;
  app.renderEnsemble = renderEnsemble;
  app._ensembleReady = true;
  ensureSection();
  if (typeof window !== "undefined" && "Worker" in window) {
    try {
      // Use Vite's ?worker import for proper bundling in Electron + web
      // @vite-ignore - Vite handles this import specially
      worker = new Worker(
        new URL("../workers/compute.worker.js?worker", import.meta.url),
        { type: "module" }
      );
    } catch (e) {
      console.warn('Ensemble worker failed to load:', e);
      worker = null;
    }
  }
  if (app.activeWeatherTab === "daily" && app.selectedLat != null && app.selectedLng != null) {
    renderEnsemble(app.selectedLat, app.selectedLng);
  }
}

function ensureSection() {
  if (document.getElementById("ensembleSection")) return;
  const content = document.getElementById("weatherPanelContent");
  const dailyTab = document.getElementById("weatherTabDaily");
  const anchor = document.getElementById("dailyForecast");
  const sec = document.createElement("div");
  sec.id = "ensembleSection";
  sec.className = "mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60";
  sec.innerHTML =
    '<h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Model Ensemble</h4>' +
    '<div id="ensembleBody" class="text-xs text-slate-500 dark:text-slate-400">Select a location to compare forecast models.</div>';
  if (dailyTab)
    dailyTab.appendChild(sec);
  else if (anchor && anchor.parentNode)
    anchor.parentNode.appendChild(sec);
  else if (content) content.appendChild(sec);
}

async function fetchModelSnapshot(lat, lng, modelId, signal) {
  const round = (v) => v.toFixed(4);
  const cacheKey = `${round(lat)},${round(lng)},${modelId || "auto"}`;
  if (_ensembleCache.has(cacheKey)) {
    const entry = _ensembleCache.get(cacheKey);
    if (entry) {
      if (entry.promise) return await entry.promise;
      if (Date.now() - entry.ts < ENSEMBLE_CACHE_TTL) {
        return entry.data;
      }
      _ensembleCache.delete(cacheKey);
    }
  }

  const base = "https://api.open-meteo.com/v1/forecast";
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lng,
    current: "temperature_2m,precipitation,weather_code",
    hourly: "precipitation_probability",
    forecast_days: "1",
    timezone: "auto",
  });
  if (modelId) params.set("models", modelId);
  const url = base + "?" + params.toString();

  const fetchPromise = (async () => {
    try {
      const res = await guardedOpenMeteoFetch(url, { signal });
      if (!res.ok) {
        // If a 4xx with a specific model (except 429), retry without model selection
        if (modelId && res.status >= 400 && res.status < 500 && res.status !== 429) {
          return fetchModelSnapshot(lat, lng, null, signal);
        }
        return null; // 429/503/offline
      }
      const j = await res.json();
      const result = {
        model: modelId || "auto",
        temp: j.current && j.current.temperature_2m,
        precip: j.current && j.current.precipitation,
        code: j.current && j.current.weather_code,
        precipProb:
          j.hourly && j.hourly.precipitation_probability
            ? j.hourly.precipitation_probability.slice(0, 6)
            : [],
      };
      _ensembleCache.set(cacheKey, { data: result, ts: Date.now() });
      return result;
    } catch {
      _ensembleCache.delete(cacheKey);
      return null; // network error / offline / aborted
    }
  })();

  _ensembleCache.set(cacheKey, { promise: fetchPromise, ts: Date.now() });
  return await fetchPromise;
}

let ensembleAbortCtrl = null;
let _activeEnsembleCoordsKey = null;
let _activeEnsemblePromise = null;

function _hasFreshCachedEnsemble(lat, lng) {
  const round = (v) => Number(v).toFixed(4);
  const now = Date.now();
  return ENSEMBLE_MODELS.some((m) => {
    const entry = _ensembleCache.get(`${round(lat)},${round(lng)},${m.id}`);
    return entry && entry.data && now - entry.ts < ENSEMBLE_CACHE_TTL;
  });
}

export async function renderEnsemble(lat, lng) {
  const body = document.getElementById("ensembleBody");
  if (!body || lat === null || lat === undefined || lng === null || lng === undefined) return;
  if (appRef?.activeWeatherTab && appRef.activeWeatherTab !== "daily") return;

  const coordsKey = `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
  if (_activeEnsembleCoordsKey === coordsKey && _activeEnsemblePromise) {
    return _activeEnsemblePromise;
  }

  if (ensembleAbortCtrl) {
    ensembleAbortCtrl.abort();
  }
  ensembleAbortCtrl = new AbortController();
  const signal = ensembleAbortCtrl.signal;
  _activeEnsembleCoordsKey = coordsKey;

  if (isOpenMeteoCoolingDown() && !_hasFreshCachedEnsemble(lat, lng)) {
    _activeEnsemblePromise = null;
    body.textContent = "Ensemble data unavailable (rate limited or offline).";
    return;
  }

  body.textContent = "Comparing ECMWF · GFS · ICON…";
  const run = (async () => {
  try {
    const snapshots = await Promise.all(
      ENSEMBLE_MODELS.map((m) =>
        fetchModelSnapshot(lat, lng, m.id, signal).catch(() => null),
      ),
    );
    if (signal.aborted) return;
    const valid = snapshots.filter(Boolean);
    if (!valid.length) {
      body.textContent = "Ensemble data unavailable (rate limited or offline).";
      return;
    }

    let result;
    if (worker) {
      result = await new Promise((resolve) => {
        const id = ++reqId;
        let timer = null;
        const cleanup = () => {
          if (timer) clearTimeout(timer);
          worker.removeEventListener("message", handler);
          worker.removeEventListener("error", errorHandler);
        };
        const handler = (e) => {
          if (e.data?.id === id) {
            cleanup();
            resolve(e.data.result);
          }
        };
        const errorHandler = () => {
          cleanup();
          resolve(aggregate(valid));
        };
        timer = setTimeout(() => {
          cleanup();
          resolve(aggregate(valid));
        }, 1500); // 1.5s worker timeout fallback

        worker.addEventListener("message", handler);
        worker.addEventListener("error", errorHandler, { once: true });
        worker.postMessage({ id, snapshots: valid });
      });
    } else {
      result = aggregate(valid);
    }

    if (signal.aborted) return;

    const code = valid[0].code;
    const info =
      typeof WeatherService !== "undefined" && WeatherService.getWeatherInfo
        ? WeatherService.getWeatherInfo(code, true)
        : null;
    const icon = (info && info.dayIcon) || "🌡️";
    const names = valid
      .map(
        (s) => ENSEMBLE_MODELS.find((m) => m.id === s.model)?.label || s.model,
      )
      .join(" · ");
    body.innerHTML =
      '<div class="bg-slate-100/60 dark:bg-slate-700/40 rounded-xl p-3 space-y-1">' +
      '<div class="flex items-center justify-between gap-2">' +
      '<span class="font-semibold text-slate-700 dark:text-slate-200">' +
      icon +
      " " +
      result.avg.toFixed(1) +
      "°C " +
      '<span class="text-slate-400 font-normal">(' +
      result.min.toFixed(0) +
      "–" +
      result.max.toFixed(0) +
      "°)</span></span>" +
      '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 whitespace-nowrap">' +
      result.agreement +
      " agreement</span>" +
      "</div>" +
      '<div class="text-[10px] text-slate-500 dark:text-slate-400">' +
      names +
      "</div>" +
      '<div class="text-[10px] text-slate-500 dark:text-slate-400">Rain chance (next 6h): ' +
      '<span class="font-semibold text-blue-500">' +
      result.maxPrecip +
      "%</span></div>" +
      "</div>";
  } catch (e) {
    if (!signal.aborted) {
      body.textContent = "Ensemble data unavailable.";
    }
  } finally {
    if (_activeEnsemblePromise === run) {
      _activeEnsemblePromise = null;
    }
  }
  })();
  _activeEnsemblePromise = run;
  return run;
}

function aggregate(snapshots) {
  const temps = snapshots
    .map((s) => s.temp)
    .filter((v) => typeof v === "number");
  if (temps.length === 0)
    return {
      min: 0,
      max: 0,
      avg: 0,
      spread: 0,
      agreement: "Low",
      maxPrecip: 0,
    };
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
  const spread = max - min;
  const agreement = spread <= 1 ? "High" : spread <= 3 ? "Medium" : "Low";
  let maxPrecip = 0;
  snapshots.forEach((s) =>
    (s.precipProb || []).forEach((p) => {
      if (p > maxPrecip) maxPrecip = p;
    }),
  );
  return { min, max, avg, spread, agreement, maxPrecip };
}
