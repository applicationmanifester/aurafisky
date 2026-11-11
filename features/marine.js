/**
 * Coastal Marine Swell & GloFAS River Basin Flood Hazards Module
 *
 * Implements Open-Meteo keyless APIs:
 *   1. Marine API (wave_height, wave_period, swell_wave_height, swell_wave_period)
 *      Flags coastal hazards when swell period T > 12s with wave height H > 2.0m
 *   2. Global Flood API (GloFAS river_discharge, river_discharge_max)
 *      Flags river basin surge / flood percentiles against baseline discharge.
 */
import { translateText, detectLocale } from "../modules/i18n.js";

const MARINE_CACHE = new Map();
const FLOOD_CACHE = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function fetchMarineData(lat, lng, signal) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = MARINE_CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction&timezone=auto`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    MARINE_CACHE.set(key, { data, ts: Date.now() });
    return data;
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('Marine API fetch failed:', e);
    return null;
  }
}

export async function fetchFloodData(lat, lng, signal) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const cached = FLOOD_CACHE.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&daily=river_discharge,river_discharge_max&forecast_days=7`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    FLOOD_CACHE.set(key, { data, ts: Date.now() });
    return data;
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('Flood API fetch failed:', e);
    return null;
  }
}

/**
 * Evaluates coastal surf & marine swell hazard.
 *
 * Spec: Flags coastal surf hazards when swell period T > 12s with wave height H > 2.0m.
 */
export function evaluateMarineHazard(marineData) {
  if (!marineData?.current) {
    return { isCoastal: false, isHazard: false, level: 'INLAND', label: 'Inland' };
  }

  const h = marineData.current.wave_height;
  const t = marineData.current.swell_wave_period ?? marineData.current.wave_period;
  const swellH = marineData.current.swell_wave_height ?? h;

  if (h == null && swellH == null) {
    return { isCoastal: false, isHazard: false, level: 'INLAND', label: 'Inland Location' };
  }

  const waveHeight = h ?? swellH ?? 0;
  const swellPeriod = t ?? 0;

  // Primary hazard criteria from specification
  if (swellPeriod > 12 && (waveHeight > 2.0 || swellH > 1.8)) {
    return {
      isCoastal: true,
      isHazard: true,
      level: 'HAZARD',
      label: 'Massive Swell Hazard',
      tone: 'rose',
      detail: `${waveHeight.toFixed(1)}m waves @ ${Math.round(swellPeriod)}s swell period`,
      waveHeight,
      swellPeriod,
    };
  }

  if (waveHeight >= 2.5) {
    return {
      isCoastal: true,
      isHazard: true,
      level: 'ROUGH',
      label: 'Rough Marine Seas',
      tone: 'amber',
      detail: `${waveHeight.toFixed(1)}m significant wave height`,
      waveHeight,
      swellPeriod,
    };
  }

  return {
    isCoastal: true,
    isHazard: false,
    level: 'NORMAL',
    label: 'Calm Coastal Waters',
    tone: 'emerald',
    detail: `${waveHeight.toFixed(1)}m waves · ${Math.round(swellPeriod)}s period`,
    waveHeight,
    swellPeriod,
  };
}

/**
 * Evaluates river basin GloFAS discharge flood surge risk.
 */
export function evaluateFloodHazard(floodData) {
  const daily = floodData?.daily;
  if (!daily?.river_discharge || !daily.river_discharge.length || daily.river_discharge[0] == null) {
    return { hasBasin: false, isHazard: false, level: 'NONE', label: 'No Major Basin' };
  }

  const curDischarge = daily.river_discharge[0];
  const maxDischarges = (daily.river_discharge_max || daily.river_discharge).filter((v) => v != null);
  const peakDischarge = maxDischarges.length ? Math.max(...maxDischarges) : curDischarge;

  const surgeRatio = curDischarge > 0 ? peakDischarge / curDischarge : 1.0;

  if (peakDischarge > 500 && surgeRatio >= 1.5) {
    return {
      hasBasin: true,
      isHazard: true,
      level: 'SURGE_WARNING',
      label: 'Basin Surge Alert',
      tone: 'rose',
      detail: `Peak surge to ${Math.round(peakDischarge)} m³/s (+${Math.round((surgeRatio - 1) * 100)}%)`,
      currentDischarge: curDischarge,
      peakDischarge,
    };
  }

  if (peakDischarge > 1200) {
    return {
      hasBasin: true,
      isHazard: true,
      level: 'HIGH_DISCHARGE',
      label: 'High River Discharge',
      tone: 'amber',
      detail: `Current flow ${Math.round(curDischarge)} m³/s`,
      currentDischarge: curDischarge,
      peakDischarge,
    };
  }

  return {
    hasBasin: true,
    isHazard: false,
    level: 'STABLE',
    label: 'Stable Basin Flow',
    tone: 'emerald',
    detail: `Current discharge ${Math.round(curDischarge)} m³/s`,
    currentDischarge: curDischarge,
    peakDischarge,
  };
}

/**
 * Updates UI badges for Marine & Flood layers
 */
export async function updateMarineFloodUI(app, lat, lng) {
  const marineBadge = document.getElementById('marineHazardBadge');
  const marineDetail = document.getElementById('marineHazardDetail');
  const floodBadge = document.getElementById('floodHazardBadge');
  const floodDetail = document.getElementById('floodHazardDetail');

  if (!marineBadge && !floodBadge) return;

  try {
    const [marineData, floodData] = await Promise.all([
      fetchMarineData(lat, lng),
      fetchFloodData(lat, lng),
    ]);

    const marineResult = evaluateMarineHazard(marineData);
    const floodResult = evaluateFloodHazard(floodData);

    const loc = (app && app.language) || (typeof window !== "undefined" && window.app?.language) || detectLocale();

    if (marineBadge) {
      const transLabel = translateText(marineResult.label, loc) || marineResult.label;
      marineBadge.textContent = transLabel;
      marineBadge.className =
        marineResult.tone === 'rose'
          ? 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400'
          : marineResult.tone === 'amber'
            ? 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400'
            : marineResult.tone === 'emerald'
              ? 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400';
    }
    if (marineDetail && marineResult.detail) {
      let md = marineResult.detail;
      if (loc !== 'en') {
        const m1 = md.match(/^([\d.]+)m waves @ (\d+)s swell period$/);
        if (m1) {
          const waves = translateText('waves', loc) || 'waves';
          const period = translateText('swell period', loc) || 'swell period';
          md = `${m1[1]}m ${waves} @ ${m1[2]}s ${period}`;
        } else {
          const m2 = md.match(/^([\d.]+)m significant wave height$/);
          if (m2) {
            const swh = translateText('significant wave height', loc) || 'significant wave height';
            md = `${m2[1]}m ${swh}`;
          } else {
            const m3 = md.match(/^([\d.]+)m waves · (\d+)s period$/);
            if (m3) {
              const waves = translateText('waves', loc) || 'waves';
              const period = translateText('period', loc) || 'period';
              md = `${m3[1]}m ${waves} · ${m3[2]}s ${period}`;
            } else {
              md = translateText(md, loc) || md;
            }
          }
        }
      }
      marineDetail.textContent = md;
    }

    if (floodBadge) {
      const transFloodLabel = translateText(floodResult.label, loc) || floodResult.label;
      floodBadge.textContent = transFloodLabel;
      floodBadge.className =
        floodResult.tone === 'rose'
          ? 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400'
          : floodResult.tone === 'amber'
            ? 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400'
            : floodResult.tone === 'emerald'
              ? 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400';
    }
    if (floodDetail && floodResult.detail) {
      let fd = floodResult.detail;
      if (loc !== 'en') {
        const mDischarge = fd.match(/^(Current discharge|Current flow|Discharge gauge|Catastrophic discharge|High discharge)[:\s]+(\d+)\s*m³\/s$/i);
        if (mDischarge) {
          const prefix = translateText(mDischarge[1], loc);
          fd = `${prefix} ${mDischarge[2]} m³/s`;
        } else {
          const mSurge = fd.match(/^Peak surge to (\d+) m³\/s \(\+(\d+)%\)$/i);
          if (mSurge) {
            const peakSurge = translateText('Peak surge', loc) || 'Peak surge';
            fd = `${peakSurge}: ${mSurge[1]} m³/s (+${mSurge[2]}%)`;
          } else {
            fd = translateText(fd, loc) || fd;
          }
        }
      }
      floodDetail.textContent = fd;
    }
  } catch (e) {
    console.warn('Failed to update marine & flood UI:', e);
  }
}

export function init(app) {
  app.updateMarineFloodUI = (lat, lng) => updateMarineFloodUI(app, lat, lng);
}
