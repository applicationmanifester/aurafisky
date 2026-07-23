// Feature: Model Ensemble — fetches several Open-Meteo forecast models
// (ECMWF / GFS / ICON) for the selected location and shows model agreement
// plus probabilistic rain. Compute runs in a Web Worker.

interface AppInstance {
  renderEnsemble: (lat: number, lng: number) => Promise<void>;
  _ensembleReady: boolean;
  [key: string]: any;
}

interface EnsembleModel {
  id: string;
  label: string;
}

interface ModelSnapshot {
  model: string;
  temp: number | null;
  precip: number | null;
  code: number | null;
  precipProb: number[];
}

interface CacheEntry {
  data: ModelSnapshot;
  ts: number;
}

interface WorkerMessage {
  id: number;
  snapshots: ModelSnapshot[];
}

interface WorkerResult {
  id: number;
  result: {
    min: number;
    max: number;
    avg: number;
    spread: number;
    agreement: string;
    maxPrecip: number;
  };
}

const ENSEMBLE_MODELS: EnsembleModel[] = [
  { id: 'ecmwf_ifs04', label: 'ECMWF' },
  { id: 'gfs_seamless', label: 'GFS' },
  { id: 'icon_seamless', label: 'ICON' },
];

const ENSEMBLE_CACHE_TTL = 300000; // 5 minutes
const _ensembleCache = new Map<string, CacheEntry>();

let worker: Worker | null = null;
let reqId = 0;

export function init(app: AppInstance): void {
  app.renderEnsemble = renderEnsemble;
  app._ensembleReady = true;
  ensureSection();

  if ('Worker' in window) {
    try {
      worker = new Worker(new URL('../workers/compute.worker.js', import.meta.url));
    } catch {
      worker = null;
    }
  }
}

function ensureSection(): void {
  if (document.getElementById('ensembleSection')) return;
  const content = document.getElementById('weatherPanelContent');
  const anchor = document.getElementById('dailyForecast');
  const sec = document.createElement('div');
  sec.id = 'ensembleSection';
  sec.className = 'mb-5';
  sec.innerHTML =
    '<h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Model Ensemble</h4>' +
    '<div id="ensembleBody" class="text-xs text-slate-500 dark:text-slate-400">Select a location to compare forecast models.</div>';
  if (content && anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(sec, anchor);
  } else if (content) {
    content.appendChild(sec);
  }
}

interface ModelSnapshotResult {
  model: string;
  temp: number | null;
  precip: number | null;
  code: number | null;
  precipProb: number[];
}

async function fetchModelSnapshot(lat: number, lng: number, modelId: string | null): Promise<ModelSnapshotResult | null> {
  const round = (v: number) => v.toFixed(4);
  const cacheKey = `${round(lat)},${round(lng)},${modelId || 'auto'}`;

  if (_ensembleCache.has(cacheKey)) {
    const entry = _ensembleCache.get(cacheKey)!;
    if (Date.now() - entry.ts < 300000) { // ENSEMBLE_CACHE_TTL
      return entry.data;
    }
    _ensembleCache.delete(cacheKey);
  }

  const base = 'https://api.open-meteo.com/v1/forecast';
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,precipitation,weather_code',
    hourly: 'precipitation_probability',
    forecast_days: '1',
    timezone: 'auto',
  });
  if (modelId) params.set('models', modelId);

  const url = base + '?' + params.toString();

  try {
    const res = await fetch(base + '?' + params.toString());
    if (!res.ok) {
      if (modelId && res.status >= 400 && res.status < 500) {
        return fetchModelSnapshot(lat, lng, null);
      }
      return null;
    }
    const j = await res.json();
    const result: ModelSnapshotResult = {
      model: modelId || 'auto',
      temp: j.current?.temperature_2m ?? null,
      precip: j.current?.precipitation ?? null,
      code: j.current?.weather_code ?? null,
      precipProb: j.hourly?.precipitation_probability?.slice(0, 6) || [],
    };
    _ensembleCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

async function renderEnsemble(lat: number, lng: number): Promise<void> {
  const body = document.getElementById('ensembleBody');
  if (!body || lat === null || lat === undefined || lng === null || lng === undefined) return;

  body.textContent = 'Comparing ECMWF · GFS · ICON…';

  try {
    const snapshots = await Promise.all(
      [
        { id: 'ecmwf_ifs04', label: 'ECMWF' },
        { id: 'gfs_seamless', label: 'GFS' },
        { id: 'icon_seamless', label: 'ICON' },
      ].map((m) => fetchModelSnapshot(lat, lng, m.id).catch(() => null))
    );

    const valid = snapshots.filter(Boolean) as any[];
    if (!valid.length) {
      body.textContent = 'Ensemble data unavailable (rate limited or offline).';
      return;
    }

    let result: { min: number; max: number; avg: number; spread: number; agreement: string; maxPrecip: number };

    if (worker) {
      result = await new Promise((resolve) => {
        const id = ++reqId;
        const handler = (e: MessageEvent) => {
          if (e.data.id === id) {
            worker!.removeEventListener('message', handler);
            resolve(e.data.result);
          }
        };
        worker!.addEventListener('message', handler);
        worker!.postMessage({ id, snapshots: valid });
      });
    } else {
      result = aggregate(valid);
    }

    const code = valid[0].code;
    const info = typeof WeatherService !== 'undefined' && WeatherService.getWeatherInfo
      ? WeatherService.getWeatherInfo(code, true)
      : null;
    const icon = (info && info.dayIcon) || '🌡️';
    const names = valid
      .map((s) => {
        const m = [
          { id: 'ecmwf_ifs04', label: 'ECMWF' },
          { id: 'gfs_seamless', label: 'GFS' },
          { id: 'icon_seamless', label: 'ICON' },
        ].find((m) => m.id === s.model);
        return m?.label || s.model;
      })
      .join(' · ');

    body.innerHTML =
      '<div class="bg-slate-100/60 dark:bg-slate-700/40 rounded-xl p-3 space-y-1">' +
      '<div class="flex items-center justify-between gap-2">' +
      '<span class="font-semibold text-slate-700 dark:text-slate-200">' +
      icon +
      ' ' +
      result.avg.toFixed(1) +
      '°C ' +
      '<span class="text-slate-400 font-normal">(' +
      result.min.toFixed(0) +
      '–' +
      result.max.toFixed(0) +
      '°)</span></span>' +
      '<span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 dark:text-teal-400 whitespace-nowrap">' +
      result.agreement +
      ' agreement</span>' +
      '</div>' +
      '<div class="text-[10px] text-slate-500 dark:text-slate-400">' +
      names +
      '</div>' +
      '<div class="text-[10px] text-slate-500 dark:text-slate-400">Rain chance (next 6h): ' +
      '<span class="font-semibold text-blue-500">' +
      result.maxPrecip +
      '%</span></div>' +
      '</div>';
  } catch {
    body.textContent = 'Ensemble data unavailable.';
  }
}

function aggregate(snapshots: any[]): { min: number; max: number; avg: number; spread: number; agreement: string; maxPrecip: number } {
  const temps = snapshots.map((s) => s.temp).filter((v) => typeof v === 'number');
  if (temps.length === 0) {
    return { min: 0, max: 0, avg: 0, spread: 0, agreement: 'Low', maxPrecip: 0 };
  }
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
  const spread = max - min;
  const agreement = spread <= 1 ? 'High' : spread <= 3 ? 'Medium' : 'Low';
  let maxPrecip = 0;
  snapshots.forEach((s) => (s.precipProb || []).forEach((p: number) => { if (p > maxPrecip) maxPrecip = p; }));
  return { min, max, avg, spread, agreement, maxPrecip };
}

export function init(app: any): void {
  app.renderEnsemble = renderEnsemble;
  app._ensembleReady = true;
  ensureSection();

  if ('Worker' in window) {
    try {
      worker = new Worker(new URL('../workers/compute.worker.js', import.meta.url));
    } catch {
      worker = null;
    }
  }
}