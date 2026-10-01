// src/services/EnsembleService.ts
// Model Ensemble — fetches several Open-Meteo forecast models
// (ECMWF / GFS / ICON) for the selected location and shows model agreement
// plus probabilistic rain. Compute runs in a Web Worker.

import { getForecast } from './WeatherService.js';

const ENSEMBLE_MODELS = [
  { id: 'ecmwf_ifs04', label: 'ECMWF' },
  { id: 'gfs_seamless', label: 'GFS' },
  { id: 'icon_seamless', label: 'ICON' },
] as const;

const ENSEMBLE_CACHE_TTL = 300000; // 5 minutes
const _ensembleCache = new Map<string, { data: ModelSnapshot; ts: number }>();

let worker: Worker | null = null;
let reqId = 0;
let ensembleAbortCtrl: AbortController | null = null;

// Initialize worker
function initWorker(): void {
  if (typeof window !== 'undefined' && 'Worker' in window) {
    try {
      // Vite ?worker import for proper bundling in Electron + web
      worker = new Worker(
        new URL('../workers/compute.worker.js?worker', import.meta.url),
        { type: 'module' }
      );
    } catch (e) {
      console.warn('Ensemble worker failed to load:', e);
      worker = null;
    }
  }
}

// Call initWorker on module load
initWorker();

export interface ModelSnapshot {
  model: string;
  temp: number | undefined;
  precip: number | undefined;
  code: number | undefined;
  precipProb: number[];
}

export interface EnsembleResult {
  agreement: number; // 0-100
  consensus: {
    temp: number;
    precip: number;
    code: number;
  };
  spread: {
    temp: number;
    precip: number;
  };
  snapshots: ModelSnapshot[];
  rainProbability: number; // probabilistic rain from ensemble
}

function round4(v: number): string {
  return v.toFixed(4);
}

function cacheKey(lat: number, lng: number, modelId: string | null): string {
  return `${round4(lat)},${round4(lng)},${modelId || 'auto'}`;
}

async function fetchModelSnapshot(
  lat: number,
  lng: number,
  modelId: string | null,
  signal: AbortSignal
): Promise<ModelSnapshot | null> {
  const key = cacheKey(lat, lng, modelId);
  const cached = _ensembleCache.get(key);
  if (cached && Date.now() - cached.ts < ENSEMBLE_CACHE_TTL) {
    return cached.data;
  }
  if (cached) _ensembleCache.delete(key);

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

  try {
    const res = await fetch(`${base}?${params.toString()}`, { signal });
    if (!res.ok) {
      if (modelId && res.status >= 400 && res.status < 500) {
        return fetchModelSnapshot(lat, lng, null, signal);
      }
      return null;
    }
    const j = await res.json();
    const result: ModelSnapshot = {
      model: modelId || 'auto',
      temp: j.current?.temperature_2m,
      precip: j.current?.precipitation,
      code: j.current?.weather_code,
      precipProb: j.hourly?.precipitation_probability?.slice(0, 6) || [],
    };
    _ensembleCache.set(key, { data: result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

function aggregate(snapshots: ModelSnapshot[]): EnsembleResult {
  const valid = snapshots.filter(Boolean);
  if (!valid.length) {
    return {
      agreement: 0,
      consensus: { temp: 0, precip: 0, code: 0 },
      spread: { temp: 0, precip: 0 },
      snapshots: [],
      rainProbability: 0,
    };
  }

  const temps = valid.map(s => s.temp).filter((v): v is number => v !== undefined);
  const precips = valid.map(s => s.precip).filter((v): v is number => v !== undefined);
  const codes = valid.map(s => s.code).filter((v): v is number => v !== undefined);

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[], m: number) =>
    Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);

  const tempMean = mean(temps);
  const precipMean = mean(precips);
  const codeMean = Math.round(mean(codes));

  const tempStd = std(temps, tempMean);
  const precipStd = std(precips, precipMean);

  // Agreement: inverse of normalized spread (simplified)
  const tempAgreement = Math.max(0, 100 - (tempStd / Math.max(1, tempMean)) * 100);
  const precipAgreement = Math.max(0, 100 - (precipStd / Math.max(0.1, precipMean)) * 100);
  const agreement = Math.round((tempAgreement + precipAgreement) / 2);

  // Probabilistic rain: max precip probability across models
  const maxRainProb = Math.max(...valid.flatMap(s => s.precipProb), 0);

  return {
    agreement,
    consensus: { temp: tempMean, precip: precipMean, code: codeMean },
    spread: { temp: tempStd, precip: precipStd },
    snapshots: valid,
    rainProbability: maxRainProb,
  };
}

export async function getEnsembleForecast(
  lat: number,
  lng: number
): Promise<EnsembleResult> {
  if (ensembleAbortCtrl) ensembleAbortCtrl.abort();
  ensembleAbortCtrl = new AbortController();
  const signal = ensembleAbortCtrl.signal;

  const snapshots = await Promise.all(
    ENSEMBLE_MODELS.map(m => fetchModelSnapshot(lat, lng, m.id, signal).catch(() => null))
  );

  if (signal.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const valid = snapshots.filter((s): s is ModelSnapshot => s !== null);
  if (!valid.length) {
    throw new Error('Ensemble data unavailable (rate limited or offline)');
  }

  if (worker) {
    return new Promise((resolve, reject) => {
      const id = ++reqId;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        worker!.removeEventListener('message', handler);
        worker!.removeEventListener('error', errorHandler);
      };
      const handler = (e: MessageEvent) => {
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
      }, 1500);

      worker!.addEventListener('message', handler);
      worker!.addEventListener('error', errorHandler, { once: true });
      worker!.postMessage({ id, snapshots: valid });
    });
  }

  return aggregate(valid);
}

export function destroy(): void {
  if (ensembleAbortCtrl) {
    ensembleAbortCtrl.abort();
    ensembleAbortCtrl = null;
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
  _ensembleCache.clear();
}

// Re-export for backward compatibility
export { ENSEMBLE_MODELS };
