// features/farm.js
// ── FARM MODE ────────────────────────────────────────────────────────
//
// "What can I grow on THIS field, when do I sow it, how do I run it?" —
// answered from weather the app already knows plus soil-moisture data
// Open-Meteo serves for free (no key, same host as the existing forecast
// request, so no CSP change is needed).
//
// Design constraints, matching the rest of the feature set:
//   * Pure engine, exported. scoring / water-balance / frost / crop-fit
//     are plain functions with no DOM access, so vitest covers them.
//   * Pull-based runtime like rainPush: evaluation runs when a fresh
//     forecast lands (wrapped updateWeatherDisplay), never on a timer.
//   * Zero extra cost when Farm Mode is unused: one extra API call per
//     location visit, debounced, cached for 10 minutes in-memory, and the
//     whole feature degrades to a "soil data unavailable" note if the
//     request fails — never breaks the weather panel.
//   * All dynamic strings are escaped before innerHTML; the crop database
//     is curated, not user input.
//
// Data sources:
//   * api.open-meteo.com/v1/forecast (same endpoint as WeatherService):
//     hourly soil_moisture_9_to_27cm / soil_moisture_27_to_81cm,
//     soil_temperature_6cm / soil_temperature_18cm, dew_point_2m,
//     vapour_pressure_deficit, et0_fao_evapotranspiration; daily
//     shortwave_radiation_sum + min/max temperature; past_days=3 so the
//     water balance can look backwards; elevation comes free in the
//     response body.

import {
  CROPS,
  SOIL_TYPES,
  getSoil,
  getSowMonthsForHemisphere,
  isMonthInWindow,
  monthsUntilWindow,
  formatSowWindow,
  classifyClimate,
  MONTH_SHORT,
} from "./cropData.js";

// ────────────────── constants ──────────────────

export const FARM_SOIL_KEY = "aurafisky_farm_soil";
export const FARM_FROST_LAST_KEY = "aurafisky_farm_frost_last";
export const FARM_COOLDOWN_MS = 12 * 60 * 60 * 1000; // one frost push per place / 12h
export const AGRO_TTL_MS = 10 * 60 * 1000; // in-memory agro cache TTL
export const AGRO_URL = "https://api.open-meteo.com/v1/forecast";

const DEFAULT_FROST_THRESHOLD = 2; // °C — most vegetation damaged below this

/** Score bands for the spray-condition meter. */
export const SPRAY_LABELS = [
  { min: 75, label: "Excellent", color: "#059669" },
  { min: 60, label: "Good", color: "#65a30d" },
  { min: 40, label: "Fair", color: "#d97706" },
  { min: 20, label: "Marginal", color: "#ea580c" },
  { min: -1, label: "Do not spray", color: "#dc2626" },
];

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const n = (v) => (Number.isFinite(v) ? v : null);

const sum = (arr) => (arr || []).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

/** Minimal HTML escaper for the panel strings we do inject. */
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Ordered, compact date label like "Oct 24" for hourly ISO strings. */
function dayOf(iso) {
  const m = typeof iso === "string" ? iso.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  if (!m) return "";
  return `${MONTH_SHORT[Number(m[2]) - 1]} ${Number(m[3])}`;
}

function hourOf(iso) {
  const m = typeof iso === "string" ? iso.match(/T(\d{2}):(\d{2})/) : null;
  return m ? `${m[1]}:${m[2]}` : "";
}

// ────────────────── pure engine ──────────────────

/**
 * Spray-condition score for one hour, 0-100.
 *
 * Weighting follows standard nozzle-drift practice:
 *   wind is the #1 driver (ideal 2-10 km/h), then rain-in-the-window,
 *   then droplet survival (VPD, temperature, humidity). Daylight gets a
 *   small penalty only — night spraying is legitimate (protects
 *   pollinators) but demands extra care, so it is not zeroed.
 *
 * @param {{windSpeed?:number, windGusts?:number, precipitation?:number,
 *          precipitationProbability?:number, vpd?:number,
 *          temperature?:number, humidity?:number, isDay?:boolean}} hour
 * @returns {{score:number, label:string, reasons:string[], color:string}}
 */
// ────────────────── region resolution ──────────────────

/**
 * Extracts an administrative region from a Nominatim address object so the
 * recommender can prefer local cultivars when a region is known, and fall
 * back to climate-band scoring everywhere else.
 *
 * @param {object|null} address - Nominatim address object
 * @returns {{country:string|null, state:string|null, district:string|null,
 *            locality:string|null, key:string|null}} region
 */
export function resolveRegion(address) {
  if (!address || typeof address !== 'object') {
    return { country: null, state: null, district: null, locality: null, key: null };
  }
  const country = address.country || null;
  const state = address.state || address.province || address.region || null;
  const district =
    address.district ||
    address.state_district ||
    address.county ||
    address.city_district ||
    null;
  const locality =
    address.suburb ||
    address.quarter ||
    address.neighbourhood ||
    address.village ||
    address.town ||
    address.city ||
    address.municipality ||
    null;
  const key = [country, state, district].filter(Boolean).join('|');
  return { country, state, district, locality, key: key || null };
}

/** Human label for a resolved region. */
export function formatRegion(region) {
  if (!region) return '';
  const parts = [region.locality, region.district, region.state, region.country]
    .filter(Boolean);
  return parts.join(', ');
}

export function scoreSprayConditions(hour) {
  const h = hour || {};
  const wind = n(h.windSpeed);
  const gust = n(h.windGusts);
  const rainMm = n(h.precipitation);
  const rainProb = n(h.precipitationProbability);
  const vpd = n(h.vpd);
  const temp = n(h.temperature);
  const rh = n(h.humidity);

  // Hard blockers: no amount of calm air rescues a gale or a wetting rain,
  // so they cap the score no matter what else is in the hour.
  const hardBlock =
    (wind != null && wind >= 38) ||
    (gust != null && gust >= 45) ||
    (rainMm != null && rainMm >= 0.5) ||
    (rainProb != null && rainProb >= 75);

  const reasons = [];
  let score = 35;

  if (wind != null) {
    if (wind < 2) {
      score -= 5;
      reasons.push("Near-calm — inversions trap the mist");
    } else if (wind <= 10) {
      score += 18;
      reasons.push(`Light wind ${Math.round(wind)} km/h — minimal drift`);
    } else if (wind <= 15) {
      score += 10;
      reasons.push(`Moderate wind ${Math.round(wind)} km/h`);
    } else if (wind <= 20) {
      score -= 5;
      reasons.push(`Strong wind ${Math.round(wind)} km/h — drift risk`);
    } else if (wind <= 25) {
      score -= 25;
      reasons.push(`High wind ${Math.round(wind)} km/h — spray will drift`);
    } else {
      score -= 40;
      reasons.push(`Gale ${Math.round(wind)} km/h — hold the sprayer`);
    }
  }
  if (gust != null) {
    if (gust > 35) {
      score -= 25;
      reasons.push(`Gusts to ${Math.round(gust)} km/h`);
    } else if (gust > 25) {
      score -= 12;
      reasons.push(`Gusts to ${Math.round(gust)} km/h`);
    }
  }
  if (rainMm != null && rainMm >= 0.3) {
    score -= 45;
    reasons.push(`Raining ${rainMm.toFixed(1)} mm/h — wash-off risk`);
  } else if (rainProb != null && rainProb >= 60) {
    score -= 30;
    reasons.push(`${Math.round(rainProb)}% rain chance`);
  } else if (rainProb != null && rainProb >= 40) {
    score -= 25;
    reasons.push(`${Math.round(rainProb)}% rain chance`);
  } else if (rainProb != null && rainProb >= 20) {
    score -= 10;
  } else if (rainProb != null) {
    score += 12;
    reasons.push("Dry spell in the window");
  }
  if (vpd != null) {
    if (vpd >= 0.3 && vpd <= 1.5) {
      score += 10;
    } else if (vpd > 2.5) {
      score -= 10;
      reasons.push(`VPD ${vpd.toFixed(1)} kPa — droplets evaporate fast`);
    } else if (vpd < 0.2) {
      score += 4;
    }
  }
  if (temp != null) {
    if (temp >= 10 && temp <= 28) {
      score += 10;
    } else if (temp > 28 && temp <= 33) {
      score -= 5;
    } else if (temp > 33) {
      score -= 12;
      reasons.push(`${Math.round(temp)}°C — volatilisation risk`);
    } else if (temp < 5) {
      score -= 15;
      reasons.push(`${Math.round(temp)}°C — too cold for chemistry`);
    }
  }
  if (rh != null) {
    if (rh >= 40 && rh <= 85) {
      score += 8;
    } else if (rh < 40) {
      score -= 8;
      reasons.push(`Dry air ${Math.round(rh)}% RH — drift`);
    } else {
      score -= 5;
    }
  }
  if (h.isDay === false) {
    score -= 8;
  }

  if (hardBlock) {
    score = Math.min(score, 18);
    if (!reasons.some((r) => /Gale|Raining|rain chance/.test(r))) reasons.unshift("Unsafe conditions — hold the sprayer");
  }
  score = clamp(Math.round(score), 0, 100);
  const band = SPRAY_LABELS.find((b) => score >= b.min) || SPRAY_LABELS[SPRAY_LABELS.length - 1];
  return { score, label: band.label, color: band.color, reasons: reasons.slice(0, 4) };
}

/**
 * Scores the next `hours` of the forecast for sprayability.
 *
 * @param {Object} hourly - Open-Meteo hourly block (from the main forecast)
 * @param {Object} [vpdByTime] - map ISO time → VPD (kPa) from the agro fetch
 * @param {number} [startIdx]
 * @param {number} [hours=24]
 * @returns {Array<{index:number, time:string, hourLabel:string, day:string,
 *                  spray:{score:number,label:string,color:string,reasons:string[]}}>}
 */
export function scoreSprayTimeline(hourly, vpdByTime, startIdx = 0, hours = 24) {
  if (!hourly?.time?.length) return [];
  const out = [];
  const limit = Math.min(startIdx + hours, hourly.time.length);
  for (let i = startIdx; i < limit; i++) {
    const time = hourly.time[i];
    const spray = scoreSprayConditions({
      windSpeed: hourly.wind_speed_10m?.[i],
      windGusts: hourly.wind_gusts_10m?.[i],
      precipitation: hourly.precipitation?.[i],
      precipitationProbability: hourly.precipitation_probability?.[i],
      vpd: vpdByTime?.[time] ?? null,
      temperature: hourly.temperature_2m?.[i],
      humidity: hourly.relative_humidity_2m?.[i],
      isDay: hourly.is_day?.[i] === 1,
    });
    out.push({
      index: i,
      time,
      hourLabel: hourOf(time),
      day: dayOf(time),
      spray,
    });
  }
  return out;
}

/**
 * Groups contiguous sprayable hours (score >= 60) into window summaries.
 * @param {Array<{spray:{score:number}}>} timeline - output of scoreSprayTimeline
 * @returns {{windows:Array<{startIdx:number,endIdx:number,avgScore:number,
 *                            startLabel:string,endLabel:string,startTime:string}>,
 *            best:Object|null}}
 */
export function summarizeSprayWindows(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) return { windows: [], best: null };
  const windows = [];
  let run = null;
  for (const t of timeline) {
    const ok = t.spray?.score >= 60;
    if (ok && !run) run = { startIdx: t.index, endIdx: t.index, scores: [t.spray.score], first: t };
    else if (ok && run) { run.endIdx = t.index; run.scores.push(t.spray.score); }
    else if (!ok && run) {
      windows.push({
        startIdx: run.startIdx,
        endIdx: run.endIdx,
        avgScore: Math.round(sum(run.scores) / run.scores.length),
        startTime: run.first.time,
        startLabel: run.first.day ? `${run.first.day} ${run.first.hourLabel}` : run.first.hourLabel,
      });
      run = null;
    }
  }
  if (run) {
    windows.push({
      startIdx: run.startIdx,
      endIdx: run.endIdx,
      avgScore: Math.round(sum(run.scores) / run.scores.length),
      startTime: run.first.time,
      startLabel: run.first.day ? `${run.first.day} ${run.first.hourLabel}` : run.first.hourLabel,
    });
  }
  // A single hour is noise; keep windows of 2+ hours.
  const keep = windows.filter((w) => w.endIdx - w.startIdx >= 1);
  keep.sort((a, b) => b.avgScore - a.avgScore);
  return { windows: keep, best: keep[0] || null };
}

/**
 * Growing degree days for one day. Standard (Tmax+Tmin)/2 − base, floored
 * at zero — the approximation FAO's GDD tables use for crop planning.
 * Open-Meteo does not serve GDD on the free tier, so we compute it.
 *
 * @param {number} tmax °C
 * @param {number} tmin °C
 * @param {number} [base=10] °C — base 10 for warm crops, 0 for frost mapping
 * @returns {number|null}
 */
export function computeGDD(tmax, tmin, base = 10) {
  if (!Number.isFinite(tmax) || !Number.isFinite(tmin)) return null;
  return Math.max(0, (tmax + tmin) / 2 - base);
}

/**
 * Accumulated GDD across daily arrays (any window: past week, season).
 * @param {{temperature_2m_max:number[], temperature_2m_min:number[]}} daily
 * @param {number} [base=10]
 * @returns {number|null} accumulated degree-days, rounded
 */
export function sumGDD(daily, base = 10) {
  if (!daily?.temperature_2m_max || !daily?.temperature_2m_min) return null;
  const len = Math.min(daily.temperature_2m_max.length, daily.temperature_2m_min.length);
  let total = 0;
  for (let i = 0; i < len; i++) {
    const g = computeGDD(daily.temperature_2m_max[i], daily.temperature_2m_min[i], base);
    total += g == null ? 0 : g;
  }
  return Math.round(total);
}

/**
 * Root-zone moisture class, texture-aware. Thresholds come from the soil
 * entry (cropData.SOIL_TYPES) so clay is not called "dry" at the moisture
 * where sand is already parched.
 *
 * @param {number} vwc - volumetric water content, m³/m³
 * @param {string} soilId
 * @returns {{status:string, label:string, advice:string, pct:number}}
 */
export function classifySoilMoisture(vwc, soilId) {
  const s = Number.isFinite(vwc) ? getSoil(soilId) || getSoil("loam") : null;
  if (!s) {
    return { status: "unknown", label: "Soil moisture: no data", advice: "", pct: 0 };
  }
  let status;
  let label;
  let advice;
  if (vwc >= s.wetAbove) {
    status = "saturated";
    label = `Saturated (${(vwc * 100).toFixed(0)}%) — waterlogging risk`;
    advice = "Hold irrigation; open drainage. Roots suffocate before they drink.";
  } else if (vwc >= s.fieldCapacity) {
    status = "good";
    label = `Adequate (${(vwc * 100).toFixed(0)}%)`;
    advice = `Root zone near field capacity for ${s.name.toLowerCase()} — no irrigation needed.`;
  } else if (vwc >= s.dryBelow) {
    status = "drying";
    label = `Drying (${(vwc * 100).toFixed(0)}%) — plan irrigation`;
    advice = s.irrigationHint;
  } else {
    status = "dry";
    label = `Dry (${(vwc * 100).toFixed(0)}%) — irrigate now`;
    advice = s.irrigationHint;
  }
  return {
    status,
    label,
    advice,
    pct: clamp(Math.round((vwc / s.wetAbove) * 100), 0, 100),
  };
}

/**
 * Field water balance: what fell, what the crop used, what is coming.
 *
 * @param {{pastRain?:number, pastEt0?:number,
 *          daily?:Array<{date:string,rain:number,et0:number}>,
 *          soilMoisture?:Object|null}} input
 * @returns {{pastRain:number, pastEt0:number, pastNet:number,
 *            fRain:number, fEt0:number, foreNet:number,
 *            level:string, headline:string, action:string, daily:Array}}
 */
export function computeWaterBalance(input = {}) {
  const daily = Array.isArray(input.daily) ? input.daily : [];
  const pastRain = Number.isFinite(input.pastRain) ? input.pastRain : sum(daily.slice(0, 3).map((d) => d.rain));
  const pastEt0 = Number.isFinite(input.pastEt0) ? input.pastEt0 : sum(daily.slice(0, 3).map((d) => d.et0));
  const fRain = sum(daily.map((d) => d.rain));
  const fEt0 = sum(daily.map((d) => d.et0));
  const pastNet = pastEt0 - pastRain;
  const foreNet = fEt0 - fRain;
  const sm = input.soilMoisture;

  let level = "ok";
  let headline = "Water balance is stable this week.";
  let action = "No irrigation scheduled. Re-check after the next rain.";

  if (sm?.status === "saturated") {
    level = "hold";
    headline = "Root zone is saturated — no irrigation.";
    action = "Improve drainage; standing water starves roots of air.";
  } else if (sm?.status === "dry") {
    level = "urgent";
    headline = "Root zone is below the dry line — irrigation is due.";
    action = "Irrigate now (light run first — dry soil takes water slowly).";
  } else if (foreNet >= 15) {
    level = "soon";
    headline = `The week ahead loses ~${Math.round(foreNet)} mm net.`;
    action = `Plan 1-2 irrigations across the week (${Math.round(foreNet / 2)} mm per run is typical).`;
  } else if (foreNet <= -15) {
    level = "wet";
    headline = `The week brings ~${Math.round(-foreNet)} mm more water than crops use.`;
    action = "Hold irrigation; watch for fungal disease and waterlogging on low ground.";
  } else if (sm?.status === "drying") {
    level = "soon";
    headline = "Soil is drying steadily with a neutral week ahead.";
    action = "Schedule the next irrigation within 2-3 days.";
  }

  return { pastRain, pastEt0, pastNet, fRain, fEt0, foreNet, level, headline, action, daily };
}

/**
 * Frost risk for a forecast night minimum against a crop threshold.
 *
 * @param {number} tmin °C — forecast minimum
 * @param {number} [threshold=2] °C — damage threshold of the crop at risk
 * @returns {{level:string, label:string, action:string, tmin:number, threshold:number}|null}
 */
export function frostRiskForNight(tmin, threshold = DEFAULT_FROST_THRESHOLD) {
  if (!Number.isFinite(tmin)) return null;
  const t = Number.isFinite(threshold) ? threshold : DEFAULT_FROST_THRESHOLD;
  let level;
  let label;
  let action;
  if (tmin <= t - 2) {
    level = "high";
    label = `High frost risk — forecast low ${tmin.toFixed(0)}°C`;
    action = "Run sprinklers overnight / cover seedlings before dusk / light wind machines if fitted. Low-lying ground runs colder than the forecast.";
  } else if (tmin <= t) {
    level = "moderate";
    label = `Frost risk — forecast low ${tmin.toFixed(0)}°C (crop limit ~${t}°C)`;
    action = "Cover tender beds and transplants before dusk; remove covers once dew dries.";
  } else if (tmin <= t + 2.5) {
    level = "watch";
    label = `Cold night — low ${tmin.toFixed(0)}°C, watch low spots and irrigated ground`;
    action = "No cover-up needed for established crops; check cold pockets by dawn.";
  } else {
    level = "low";
    label = `Low frost risk — night low ${tmin.toFixed(0)}°C`;
    action = "";
  }
  return { level, label, action, tmin, threshold: t };
}

/** Distance-from-band scorer: 1 inside the optimum (or inside a band with
 *  no optimum, like crop altitude), 0.6 inside the edge, decaying 0.06/°C
 *  beyond. Returns null when the value is unknown. */
function scoreBand(value, band) {
  if (!Number.isFinite(value) || !band) return null;
  if (Number.isFinite(band.optMin) && Number.isFinite(band.optMax)) {
    if (value >= band.optMin && value <= band.optMax) return 1;
  }
  if (value >= band.min && value <= band.max) return Number.isFinite(band.optMin) ? 0.6 : 1;
  const dist = value < band.min ? band.min - value : value - band.max;
  return clamp(0.3 - dist * 0.06, 0, 1);
}

/** Humidity scorer against the crop comfort band (decays 1/30 points). */
function scoreHumidity(value, band) {
  if (!Number.isFinite(value) || !band) return null;
  if (value >= band.min && value <= band.max) return 1;
  const dist = value < band.min ? band.min - value : value - band.max;
  return clamp(1 - dist / 30, 0, 1);
}

/**
 * Water-fit score: what the root zone offers now versus what the crop
 * wants. Low-water crops tolerate (even prefer) a drying root zone;
 * high-water crops fail in one.
 */
function scoreWater(crop, ctx) {
  const w = crop.waterNeed;
  const status = ctx.soilMoisture?.status;
  let s;
  if (w === "high") {
    s = status === "good" ? 1 : status === "drying" ? 0.55 : status === "dry" ? 0.15 : status === "saturated" ? 0.75 : 0.5;
  } else if (w === "medium") {
    s = status === "good" ? 1 : status === "drying" ? 0.7 : status === "dry" ? 0.35 : status === "saturated" ? 0.3 : 0.5;
  } else {
    s = status === "good" ? 0.85 : status === "drying" ? 0.95 : status === "dry" ? 0.75 : status === "saturated" ? 0.15 : 0.5;
  }
  // No soil telemetry on some tiles — lean on the week's rain.
  if (!ctx.soilMoisture) {
    const rain = Number.isFinite(ctx.rainNext7) ? ctx.rainNext7 : 0;
    s = w === "high" ? clamp(rain / 60, 0.15, 0.9)
      : w === "medium" ? clamp(rain / 80, 0.2, 0.85)
      : clamp(0.5 + rain / 200, 0.3, 0.8);
  }
  if (w === "low" && Number.isFinite(ctx.rainNext7) && ctx.rainNext7 > 60) s -= 0.25; // rot / disease
  if (w === "high" && Number.isFinite(ctx.rainNext7) && ctx.rainNext7 > 80) s -= 0.1; // drainage
  return clamp(s, 0, 1);
}

/** Month-window timing score against the site's local sowing calendar. */
function scoreTiming(crop, ctx, effectiveWindow) {
  const window =
    effectiveWindow ||
    ctx.localMonths?.[crop.id] ||
    (typeof ctx.monthsFor === "function" ? ctx.monthsFor(crop) : null) ||
    crop.sowMonthsForSite ||
    getSowMonthsForSite(crop, ctx) ||
    crop.sowMonths ||
    [];
  if (!Array.isArray(window) || !window.length) return 0;
  if (ctx.month == null) return 1;
  if (isMonthInWindow(ctx.month, window, 0)) return 1;
  if (isMonthInWindow(ctx.month, window, 1)) return 0.5;
  if (isMonthInWindow(ctx.month, window, 2)) return 0.2;
  return 0;
}

/**
 * Scores one crop against this site. Weighted parts sum to 100:
 * temperature 25 · water 20 · humidity 10 · altitude 8 · soil 12 ·
 * timing 20 · locality 5 (crops with known local cultivars score higher).
 *
 * @param {Object} crop - entry from cropData.CROPS
 * @param {{siteTemp:number|null, meanTempNext7:number|null, rainNext7:number,
 *          soilMoisture:Object|null, soilId:string, vpd:number|null,
 *          humidity:number|null, elevation:number, lat:number,
 *          month:number, hemisphere:string, region:object|null,
 *          localMonths:Object|null}} ctx
 * @returns {{cropId:string, cropName:string, score:number, verdict:string,
 *            parts:Array<{key:string,label:string,score:number,weight:number}>,
 *            constraints:string[]}}
 */
export function scoreCropForLocation(crop, ctx = {}) {
  const parts = [];
  let total = 0;

  const push = (key, label, score01, weight, detail) => {
    parts.push({ key, label, score: clamp(Math.round((score01 ?? 0) * 100), 0, 100), weight, detail });
    total += (score01 ?? 0) * weight;
  };

  const tempVal = Number.isFinite(ctx.meanTempNext7) ? ctx.meanTempNext7 : ctx.siteTemp;
  push("temp", `Temperature (${tempVal == null ? "?" : `${tempVal.toFixed(0)}°C`} vs crop likes ${crop.temp.optMin}-${crop.temp.optMax}°C)`,
    scoreBand(tempVal, crop.temp), 25);

  push("water", `Water (root zone ${ctx.soilMoisture?.status || "unknown"}, week rain ${Number.isFinite(ctx.rainNext7) ? `${Math.round(ctx.rainNext7)}mm` : "?"})`,
    scoreWater(crop, ctx), 20);

  push("humid", `Humidity (${Number.isFinite(ctx.humidity) ? `${Math.round(ctx.humidity)}%` : "?"} vs ${crop.humidity?.min || "?"}-${crop.humidity?.max || "?"}%)`,
    scoreHumidity(ctx.humidity, crop.humidity), 10);

  push("alt", `Elevation (${Math.round(ctx.elevation || 0)} m; crop to ${crop.altitude?.max ?? "?"} m)`,
    scoreBand(ctx.elevation, crop.altitude), 8);

  const soilFit = ctx.soilId && crop.soils?.includes(ctx.soilId) ? 1 : ctx.soilId ? 0.25 : null;
  push("soil", `Soil (${getSoil(ctx.soilId)?.name || "not set"} vs ${crop.soils.map((s) => getSoil(s)?.name).filter(Boolean).join("/") || "any"})`,
    soilFit ?? 0.5, 12);

  const effectiveWindow =
    crop.sowMonthsForSite ||
    getSowMonthsForHemisphere(crop, ctx.hemisphere) ||
    crop.sowMonths ||
    [];

  const timingScore = scoreTiming(crop, ctx, effectiveWindow);
  push("timing", `Sowing window (${formatSowWindow(effectiveWindow) || "none / off-season"})`,
    timingScore, 20);

  let score = clamp(Math.round(total), 0, 100);

  // ── Multiplicative Limiting Factors (Liebig's Law of the Minimum) ──
  const absLat = Math.abs(ctx.lat || 0);

  // 1. Extreme sub-zero / Polar / Ice sheet: frozen soil, impossible to grow outdoor crops
  if (absLat >= 66 || (tempVal != null && tempVal < -8) || (ctx.siteTemp != null && ctx.siteTemp < -12)) {
    score = 0;
  }
  // 2. Lethal temperature for this specific crop
  else if (tempVal != null && (tempVal < crop.temp.min - 3 || tempVal > crop.temp.max + 5)) {
    score = Math.min(score, 10);
  }
  // 3. Freezing air on frost-tender crops (tomatoes, bananas, etc.)
  else if (tempVal != null && tempVal < 2 && (crop.frost == null || crop.frost >= 0)) {
    score = Math.min(score, 10);
  }
  // 4. Severe night frost on frost-tender crops
  else if (ctx.nightMin != null && crop.frost != null && ctx.nightMin < crop.frost - 2) {
    score = Math.min(score, 15);
  }
  // 5. Tropical-only crops attempted in temperate/cold latitudes
  else if (crop.tropicalOnly && absLat >= 35) {
    score = 0;
  }
  // 6. Outside sowing window / no window in this climate
  else if (timingScore === 0 && (!effectiveWindow?.length || (ctx.month != null && isMonthInWindow(ctx.month, effectiveWindow, 2) === false))) {
    score = Math.min(score, 35);
  }

  const minPart = Math.min(
    ...parts.filter((p) => p.key !== "timing").map((p) => p.score),
  );
  if (minPart < 15) {
    score = Math.min(score, 25);
  } else if (minPart < 30) {
    score = Math.min(score, 50);
  }

  const verdict =
    score <= 25 || minPart < 15
      ? "Not the right crop for this site"
      : minPart < 25
        ? "Workable with extra inputs — one requirement is near its limit"
        : score >= 70
          ? "Excellent match for this field right now"
          : score >= 60
            ? "Good match — watch the constraints below"
            : score >= 40
              ? "Workable with extra inputs (water / drainage / fertility)"
              : "Not the right crop for this site";

  const constraints = parts
    .filter((p) => p.score < 45 && p.key !== "timing")
    .map((p) => `${p.label} — ${p.score}% fit`);

  return { cropId: crop.id, cropName: crop.name, score, verdict, parts, constraints };
}

/**
 * Ranks all crops for a site. Only crops clearing 50 points are returned —
 * below that the recommendation noise outweighs the signal.
 *
 * @param {Object} ctx
 * @param {Array<Object>} [crops=CROPS]
 * @returns {Array} scoreCropForLocation results, best first
 */
export function recommendCrops(ctx = {}, crops = CROPS) {
  return crops
    .map((crop) => scoreCropForLocation(crop, ctx))
    .filter((r) => r.score >= 50)
    .sort((a, b) => b.score - a.score);
}

/**
 * Crop-specific advisories: frost, cold soil, dry/wet sowing windows,
 * heat stress, rain-outs, wind holds. Drives both the farm tab banner
 * list and the frost push.
 *
 * @param {{nightMin:number, soilTemp6:number, soilMoisture:Object,
 *          tmaxNext7:number, rainNext24h:number, windNow:number,
 *          frostThreshold:number}} input
 * @returns {Array<{type:string, title:string, desc:string, severity:string}>}
 */
export function farmAdvisories(input = {}) {
  const out = [];
  const frost = frostRiskForNight(input.nightMin, input.frostThreshold ?? DEFAULT_FROST_THRESHOLD);
  if (frost && (frost.level === "high" || frost.level === "moderate")) {
    out.push({
      type: "frost",
      title: frost.level === "high" ? "Frost warning tonight" : "Frost risk tonight",
      desc: frost.action || frost.label,
      severity: frost.level === "high" ? "severe" : "warning",
    });
  }
  if (Number.isFinite(input.soilTemp6) && input.soilTemp6 < 8) {
    out.push({
      type: "cold-soil",
      title: "Soil too cold to sow",
      desc: `Soil at 6 cm reads ${input.soilTemp6.toFixed(0)}°C. Warm-season seed germinates poorly below ~10°C — delay sowing or transplant, or sow a cold-tolerant crop.`,
      severity: "warning",
    });
  }
  if (input.soilMoisture?.status === "dry") {
    out.push({
      type: "dry-soil",
      title: "Root zone too dry for sowing",
      desc: input.soilMoisture.advice || "Irrigate before sowing — seed in dry soil sits dormant and dies.",
      severity: "warning",
    });
  }
  if (input.soilMoisture?.status === "saturated") {
    out.push({
      type: "wet-soil",
      title: "Root zone saturated — do not sow",
      desc: input.soilMoisture.advice || "Wait for drainage; seed rots in a waterlogged bed.",
      severity: "warning",
    });
  }
  if (Number.isFinite(input.tmaxNext7) && input.tmaxNext7 >= 40) {
    out.push({
      type: "heat",
      title: "Heat stress ahead",
      desc: `Daytime highs reach ${Math.round(input.tmaxNext7)}°C — shade seedlings, shift field work to dawn, and expect flower drop in vegetables.`,
      severity: "warning",
    });
  }
  if (Number.isFinite(input.rainNext24h) && input.rainNext24h >= 25) {
    out.push({
      type: "rain",
      title: "Heavy rain within 24h",
      desc: `${Math.round(input.rainNext24h)} mm expected — postpone spraying, sowing and fertiliser; runoff on slopes.`,
      severity: "warning",
    });
  }
  if (Number.isFinite(input.windNow) && input.windNow >= 35) {
    out.push({
      type: "wind",
      title: "Too windy for spraying",
      desc: `Sustained ${Math.round(input.windNow)} km/h — spray drifts off target; wait for the window the spray meter flags.`,
      severity: "advisory",
    });
  }
  return out;
}

// ────────────────── agro data fetching ──────────────────

const _agroCache = new Map();

/** Stable key for the in-memory agro cache ("19.086,72.853"). */
export function agroCacheKey(lat, lng) {
  return `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
}

function pruneAgroCache(now) {
  for (const [k, v] of _agroCache) {
    if (now - v.ts > AGRO_TTL_MS) _agroCache.delete(k);
  }
}

/**
 * Fetches the agriculture dataset for a point: soil moisture/temperature by
 * depth, dew point, VPD, ET₀ reference evapotranspiration and daily
 * radiation. Same host and price (free, no key) as the main forecast; the
 * `elevation` field comes back with the response body.
 *
 * Fails soft: throws on network/HTTP error, and callers degrade to the
 * generic-weather advice (no soil numbers).
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{now?:number, signal?:AbortSignal, ttl?:number}} [opts]
 * @returns {Promise<Object>} raw Open-Meteo response
 */
export async function fetchAgroData(lat, lng, opts = {}) {
  const now = opts.now ?? Date.now();
  const key = agroCacheKey(lat, lng);
  const hit = _agroCache.get(key);
  if (hit && now - hit.ts < (opts.ttl ?? AGRO_TTL_MS)) return hit.data;

  const params = new URLSearchParams({
    latitude: Number(lat).toFixed(4),
    longitude: Number(lng).toFixed(4),
    hourly: [
      "soil_moisture_9_to_27cm",
      "soil_moisture_27_to_81cm",
      "soil_temperature_6cm",
      "soil_temperature_18cm",
      "dew_point_2m",
      "vapour_pressure_deficit",
      "et0_fao_evapotranspiration",
    ].join(","),
    daily: ["shortwave_radiation_sum", "temperature_2m_max", "temperature_2m_min"].join(","),
    timezone: "auto",
    past_days: "3",
    forecast_days: "7",
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${AGRO_URL}?${params}`, { signal: opts.signal || ctrl.signal });
    if (!res.ok) throw new Error(`Agro API error ${res.status}`);
    const data = await res.json();
    _agroCache.set(key, { ts: now, data });
    pruneAgroCache(now);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam: seed the in-memory cache without a network call. */
export function __seedAgroCache(lat, lng, data, ts = Date.now()) {
  _agroCache.set(agroCacheKey(lat, lng), { ts, data });
}

// ────────────────── site context assembly ──────────────────

/**
 * Reduces the loaded forecast + agro dataset into the flat context the
 * scoring engine consumes. Pure (WeatherService is read off globalThis,
 * as rainPush does) so tests can drive it with fixture JSON.
 *
 * @param {{weatherData?:Object, agroData?:Object, soilId?:string,
 *          lat?:number, now?:Date|number}} input
 * @returns {{ok:boolean, reason?:string} & Object} context or {ok:false}
 */
export function buildSiteContext(input = {}) {
  const wd = input.weatherData;
  if (!wd?.hourly?.time?.length) return { ok: false, reason: "no-forecast" };

  const S = globalThis.WeatherService;
  const utc = wd.utc_offset_seconds || 0;
  const startIdx = typeof input.hourIndex === "number" && input.hourIndex >= 0
    ? input.hourIndex
    : S?.getCurrentHourIndex?.(wd, utc) ?? 0;

  const h = wd.hourly;
  const agro = input.agroData || null;
  const ah = agro?.hourly || null;

  // Location-local "today" — from the hourly time grid at the current hour.
  const localIso = h.time[startIdx];
  const now = input.now ? new Date(input.now) : new Date();
  const month = localIso
    ? Number(localIso.slice(5, 7))
    : now.getMonth() + 1;

  // VPD lookup by ISO time (agro hourly grid matches the forecast grid:
  // same timezone=auto request shape).
  const vpdByTime = {};
  if (ah?.time?.length) {
    ah.time.forEach((t, i) => {
      const v = ah.vapour_pressure_deficit?.[i];
      if (Number.isFinite(v)) vpdByTime[t] = v;
    });
  }

  const soilId = input.soilId || "loam";
  const soilVwc = ah?.soil_moisture_9_to_27cm?.[startIdx] ?? ah?.soil_moisture_9_to_27cm?.[0];
  const soilDeep = ah?.soil_moisture_27_to_81cm?.[startIdx] ?? ah?.soil_moisture_27_to_81cm?.[0];
  const soilMoisture = Number.isFinite(soilVwc)
    ? classifySoilMoisture(soilVwc, soilId)
    : null;

  // Daily roll-up: main forecast supplies dates/rain/temps; ET₀ comes from
  // the agro hourly grid in 24-hour chunks (hourly starts at local midnight
  // because both requests use timezone=auto).
  const daily = [];
  const d = wd.daily;
  const et0 = ah?.et0_fao_evapotranspiration || [];
  const days = d?.time?.length || 0;
  for (let i = 0; i < days; i++) {
    const lo = i * 24;
    const hi = lo + 24;
    const dayEt0 = et0.length >= hi ? sum(et0.slice(lo, hi)) : null;
    daily.push({
      date: d.time[i],
      rain: Number.isFinite(d.precipitation_sum?.[i]) ? d.precipitation_sum[i] : 0,
      et0: Number.isFinite(dayEt0) ? dayEt0 : null,
      tmax: d.temperature_2m_max?.[i] ?? null,
      tmin: d.temperature_2m_min?.[i] ?? null,
    });
  }
  // Fallback when ET₀ is unavailable: use a conservative FAO-56 Penman
  // proxy (0.15 mm per °C of daily mean) so the water balance still runs.
  for (const day of daily) {
    if (!Number.isFinite(day.et0) && Number.isFinite(day.tmax) && Number.isFinite(day.tmin)) {
      day.et0 = Number((((day.tmax + day.tmin) / 2) * 0.15).toFixed(2));
      day.et0Estimated = true;
    } else if (!Number.isFinite(day.et0)) {
      day.et0 = 0;
      day.et0Estimated = true;
    }
  }

  const pastDays = daily.slice(0, 3);
  const nextDays = daily.slice(-7);
  const lat = Number.isFinite(input.lat) ? input.lat : Number(wd.latitude) || 0;
  const hemisphere = lat >= 0 ? "n" : "s";

  const meanTemps = nextDays
    .filter((x) => Number.isFinite(x.tmax) && Number.isFinite(x.tmin))
    .map((x) => (x.tmax + x.tmin) / 2);
  const meanTempNext7 = meanTemps.length
    ? sum(meanTemps) / meanTemps.length
    : h.temperature_2m?.[startIdx] ?? null;

  const nightMin = Number.isFinite(d?.temperature_2m_min?.[3])
    ? d.temperature_2m_min[3]
    : nextDays[0]?.tmin ?? null;

  const tmaxNext7 = nextDays.some((x) => Number.isFinite(x.tmax))
    ? Math.max(...nextDays.filter((x) => Number.isFinite(x.tmax)).map((x) => x.tmax))
    : null;

  const rainNext24h = h.precipitation
    ? Number(sum(h.precipitation.slice(startIdx, startIdx + 24)).toFixed(1))
    : null;

  const windNow = h.wind_speed_10m?.[startIdx] ?? null;

  // Resolved administrative region from reverse-geocoding, when the app
  // has resolved an address for this point. Used to prefer local varieties
  const region = input.address ? resolveRegion(input.address) : null;

  const ctx = {
    ok: true,
    hourIndex: startIdx,
    month,
    hemisphere,
    region,
    lat,
    lng: input.lng ?? Number(wd.longitude) ?? 0,
    elevation: Number(agro?.elevation) || Number(wd.elevation) || 0,
    soilId,
    soilMoisture,
    soilVwc: Number.isFinite(soilVwc) ? soilVwc : null,
    soilDeep: Number.isFinite(soilDeep) ? soilDeep : null,
    soilTemp6: ah?.soil_temperature_6cm?.[startIdx] ?? ah?.soil_temperature_6cm?.[0] ?? null,
    soilTemp18: ah?.soil_temperature_18cm?.[startIdx] ?? ah?.soil_temperature_18cm?.[0] ?? null,
    siteTemp: Number.isFinite(h.temperature_2m?.[startIdx]) ? h.temperature_2m[startIdx] : null,
    humidity: Number.isFinite(h.relative_humidity_2m?.[startIdx]) ? h.relative_humidity_2m[startIdx] : null,
    vpd: vpdByTime[localIso] ?? null,
    dewPoint: ah?.dew_point_2m?.[startIdx] ?? null,
    rainNext7: Number(sum(nextDays.map((x) => x.rain)).toFixed(1)),
    rainNext24h,
    meanTempNext7,
    nightMin,
    tmaxNext7,
    windNow,
    vpdByTime,
    hourly: h,
    daily,
    pastDays,
    nextDays,
    hasSoil: !!ah,
  };

  return ctx;
}

// ────────────────── settings ──────────────────

/** Reads the saved soil texture (default: loam — the widest-fit answer). */
export function getSavedSoil() {
  try {
    const v = localStorage.getItem(FARM_SOIL_KEY);
    return v && getSoil(v) ? v : "loam";
  } catch {
    return "loam";
  }
}

function saveSoil(id) {
  try {
    localStorage.setItem(FARM_SOIL_KEY, id);
  } catch {
    /* storage unavailable */
  }
}


// ────────────────── rendering ──────────────────

let appRef = null;
let renderQueued = false;

const SEVERITY_CLASS = {
  extreme: "border-rose-300 bg-rose-50 dark:border-rose-700/60 dark:bg-rose-950/40",
  severe: "border-rose-300 bg-rose-50 dark:border-rose-700/60 dark:bg-rose-950/40",
  warning: "border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/40",
  advisory: "border-slate-300 bg-slate-50 dark:border-slate-600/60 dark:bg-slate-800/50",
};

const ADVISORY_ICON = {
  frost: "❄️",
  "cold-soil": "🧊",
  "dry-soil": "🏜️",
  "wet-soil": "💧",
  heat: "🔥",
  rain: "🌧️",
  wind: "💨",
};

function scoreBadge(score) {
  const color = score >= 70 ? "#059669" : score >= 55 ? "#65a30d" : score >= 40 ? "#d97706" : "#dc2626";
  return `<span class="inline-flex items-center justify-center min-w-[2.4rem] px-1.5 py-0.5 rounded-full text-[10px] font-black text-white" style="background:${color}">${score}%</span>`;
}

function farmEmptyState() {
  return `
    <div class="flex flex-col items-center justify-center text-center py-10 gap-3">
      <div class="text-4xl">🌾</div>
      <h4 class="text-sm font-bold text-slate-700 dark:text-slate-200">Farm Mode</h4>
      <p class="text-xs text-slate-500 dark:text-slate-400 max-w-[260px] leading-relaxed">
        Tap a location on the map (or search your village) and this tab turns it into a
        cropping plan: what to grow, when to sow, spray windows, and the water balance.
      </p>
    </div>`;
}

function renderRegionChip(ctx) {
  if (!ctx?.region) return "";
  const r = ctx.region;
  const label = formatRegion(r) || "Region not resolved";
  return `
    <div class="flex items-center gap-2 text-[10px] mb-1">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100/70 dark:bg-slate-800/60 border border-slate-200/40 dark:border-slate-700/40">
        <span class="text-[9px]">📍</span>
        <span class="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[220px]">${esc(label)}</span>
      </span>
    </div>`;
}

function renderSiteSnapshot(ctx) {
  const soil = getSoil(ctx.soilId);
  const clim = classifyClimate(ctx.lat, ctx.elevation);
  const chip = (label, value, title) => `
    <div class="bg-slate-100/70 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/40 dark:border-slate-700/40" title="${esc(title || "")}">
      <div class="text-[10px] text-slate-400 font-medium">${esc(label)}</div>
      <div class="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">${esc(value)}</div>
    </div>`;

  const rootTxt = ctx.soilMoisture
    ? ctx.soilMoisture.label
    : (ctx.hasSoil ? "--" : "no soil feed");
  const deepTxt = Number.isFinite(ctx.soilDeep) ? `${(ctx.soilDeep * 100).toFixed(0)}% (27-81 cm)` : "--";
  const vpdTxt = Number.isFinite(ctx.vpd) ? `${ctx.vpd.toFixed(2)} kPa` : "--";

  return `
    <div>
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Your field</h4>
        <label class="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
          Soil
          <select id="farmSoilSelect" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-1.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
            ${SOIL_TYPES.map((s) => `<option value="${s.id}"${s.id === ctx.soilId ? " selected" : ""}>${esc(s.name)}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2">
        ${chip("Climate", `${clim.band} · ${Math.round(ctx.elevation)} m`, clim.detail)}
        ${chip("🌱 Root moisture", rootTxt, ctx.soilMoisture?.advice || "")}
        ${chip("🌳 Deep moisture", deepTxt, "Subsoil store at 27-81 cm")}
        ${chip("🌡️ Soil temp", Number.isFinite(ctx.soilTemp6) ? `${ctx.soilTemp6.toFixed(0)}°C (6 cm)` : "--", "At seed depth")}
        ${chip("💧 Air humidity", Number.isFinite(ctx.humidity) ? `${Math.round(ctx.humidity)}%` : "--", "")}
        ${chip("🌬️ VPD", vpdTxt, "Vapour pressure deficit — droplet evaporation / disease pressure")}
      </div>
      <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
        ${esc(soil?.desc || "")}${ctx.hasSoil ? "" : " · Soil moisture feed unavailable for this point — advice below is rainfall-based."}
      </p>
    </div>`;
}

function renderFarmAdvisories(advisories) {
  if (!advisories.length) return "";
  return `
    <div class="space-y-1.5">
      ${advisories.map((a) => `
        <div class="rounded-xl p-2.5 border flex items-start gap-2 ${SEVERITY_CLASS[a.severity] || SEVERITY_CLASS.advisory}" role="alert">
          <span class="text-base leading-none">${esc(ADVISORY_ICON[a.type] || "⚠️")}</span>
          <div class="min-w-0">
            <div class="text-[11px] font-bold text-slate-800 dark:text-slate-100">${esc(a.title)}</div>
            <div class="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed mt-0.5">${esc(a.desc)}</div>
          </div>
        </div>`).join("")}
    </div>`;
}

/** One line under a crop card naming the local cultivar, if one exists. */
function renderCropCard(ctx, rec) {
  const window = crop.sowMonthsForSite || getSowMonthsForHemisphere(crop, ctx.hemisphere) || crop.sowMonths;
  const inWindow = isMonthInWindow(ctx.month, window, 0);
  const until = monthsUntilWindow(ctx.month, window);
  const timing = !window.length
    ? `<span class="text-rose-600 dark:text-rose-400 font-semibold">Off-season / Wrong climate</span>`
    : inWindow
      ? `<span class="text-emerald-700 dark:text-emerald-400 font-bold">✅ Sow now</span>`
      : until <= 1
        ? `<span class="text-amber-600 dark:text-amber-400 font-bold">🕐 Window ${until === 1 ? "opens next month" : "just closed"}</span>`
        : `<span class="text-slate-500 dark:text-slate-400 font-semibold">⏳ Next window in ~${until} months</span>`;
  const clim = classifyClimate(ctx.lat, ctx.elevation);
  const soils = crop.soils.map((s) => getSoil(s)?.name).filter(Boolean).join(" / ");
  const gdd = Number.isFinite(crop.duration) ? crop.duration : null;

  return `
    <details class="group rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/50 overflow-hidden">
      <summary class="flex items-center gap-2 p-2.5 cursor-pointer list-none select-none">
        <span class="text-lg leading-none">${esc(crop.emoji)}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${esc(crop.name)}</span>
            ${scoreBadge(rec.score)}
          </div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">${timing} · sow ${esc(formatSowWindow(window) || "outside seasonal envelope")}${gdd ? ` · ~${gdd} days` : ""}</div>
          ${localVarietyLine(ctx, crop)}
        </div>
        <svg class="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M19 9l-7 7-7-7"/></svg>
      </summary>
      <div class="px-2.5 pb-2.5 space-y-2 border-t border-slate-200/60 dark:border-slate-700/50">
        <p class="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed pt-2">${esc(rec.verdict)}.</p>
        ${rec.constraints.length ? `
          <div class="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/50 p-2">
            <div class="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">Watch-outs</div>
            <ul class="text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed space-y-0.5 list-disc pl-3">
              ${rec.constraints.map((c) => `<li>${esc(c)}</li>`).join("")}
            </ul>
          </div>` : ""}
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-slate-100/70 dark:bg-slate-800/60 p-2">
            <div class="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Where</div>
            <div class="text-[10px] text-slate-700 dark:text-slate-200 leading-relaxed mt-0.5">
              ${esc(soils || "Adaptive")} · ${esc(clim.band)} · to ~${crop.altitude?.max ?? "?"} m
            </div>
          </div>
          <div class="rounded-lg bg-slate-100/70 dark:bg-slate-800/60 p-2">
            <div class="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Needs</div>
            <div class="text-[10px] text-slate-700 dark:text-slate-200 leading-relaxed mt-0.5">
              ${crop.waterNeed === "high" ? "High" : crop.waterNeed === "medium" ? "Medium" : "Low"} water · ${crop.rainfall.min}-${crop.rainfall.max} mm/season${Number.isFinite(crop.frost) ? ` · frost limit ${crop.frost > 0 ? "+" : ""}${crop.frost}°C` : ""}
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-emerald-200/60 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/30 p-2 space-y-1.5">
          <div class="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">How to grow</div>
          ${[
            ["Sowing", crop.how.sow],
            ["Spacing", crop.how.spacing],
            ["Irrigation", crop.how.irrigation],
            ["Fertiliser", crop.how.fert],
            ["Care", crop.how.care],
            ["Harvest", crop.how.harvest],
          ].map(([k, v]) => `
            <div class="text-[10px] leading-relaxed">
              <span class="font-bold text-emerald-800 dark:text-emerald-300">${esc(k)}:</span>
              <span class="text-slate-700 dark:text-slate-200">${esc(v)}</span>
            </div>`).join("")}
        </div>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed italic">${esc(crop.notes)}</p>
      </div>
    </details>`;
}

function renderSpraySection(ctx) {
  const timeline = scoreSprayTimeline(
    ctx.hourly,
    ctx.vpdByTime,
    ctx.hourIndex,
    24,
  );
  if (!timeline.length) return "";
  const { best } = summarizeSprayWindows(timeline);
  const bars = timeline.map((t, i) => {
    const showLabel = i % 3 === 0;
    return `
      <div class="flex-1 flex flex-col items-center gap-1 min-w-0" title="${esc(t.day)} ${esc(t.hourLabel)} — ${esc(t.spray.label)} (${t.spray.score})${t.spray.reasons.length ? ` — ${esc(t.spray.reasons[0])}` : ""}">
        <div class="w-full flex items-end" style="height:48px">
          <div class="w-full rounded-t-sm" style="height:${Math.max(6, (t.spray.score / 100) * 48)}px;background:${t.spray.color}" title=""></div>
        </div>
        <div class="text-[7px] font-mono text-slate-400 truncate">${showLabel ? esc(t.hourLabel) : ""}</div>
      </div>`;
  }).join("");

  const bestTxt = best
    ? `Best window: <span class="font-bold text-emerald-700 dark:text-emerald-400">${esc(best.startLabel)}</span> — ${best.avgScore}% average, ~${best.endIdx - best.startIdx + 1}h long.`
    : "No good spray window in the next 24h — wait for the calm, dry hours below to open up.";

  return `
    <div>
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Spray windows · next 24h</h4>
        <span class="text-[10px] text-slate-400">wind · rain · VPD</span>
      </div>
      <div class="rounded-xl bg-slate-100/40 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-700/30 p-3">
        <p class="text-[11px] text-slate-700 dark:text-slate-200 leading-relaxed mb-3">${bestTxt}</p>
        <div class="flex items-end gap-1">${bars}</div>
        <div class="flex justify-between text-[9px] text-slate-400 font-medium mt-1.5">
          <span>now</span><span>+6h</span><span>+12h</span><span>+18h</span><span>+24h</span>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[9px] text-slate-500 dark:text-slate-400">
          ${SPRAY_LABELS.map((b) => `<span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full inline-block" style="background:${b.color}"></span>${b.label} ≥${Math.max(0, b.min)}</span>`).join("")}
        </div>
      </div>
    </div>`;
}

function renderWaterSection(ctx) {
  const wb = computeWaterBalance({
    daily: ctx.daily,
    soilMoisture: ctx.soilMoisture,
  });
  const rows = ctx.nextDays.map((day) => {
    const et0 = Number.isFinite(day.et0) ? day.et0 : 0;
    const rain = day.rain || 0;
    const maxV = Math.max(et0, rain, 8);
    return `
      <div class="flex items-center gap-2 py-1" title="${esc(day.date)}">
        <div class="w-10 text-[9px] font-semibold text-slate-500 dark:text-slate-400 flex-shrink-0">${esc(dayOf(day.date))}</div>
        <div class="flex-1 flex items-center gap-1 h-4">
          <div class="flex-1 flex items-center" title="Rain ${rain.toFixed(1)} mm">
            <div class="h-2.5 rounded-full bg-sky-500" style="width:${(rain / maxV) * 100}%"></div>
          </div>
          <div class="flex-1 flex items-center justify-end" title="Crop water use ET₀ ${et0.toFixed(1)} mm${day.et0Estimated ? " (estimated)" : ""}">
            <div class="h-2.5 rounded-full bg-amber-500" style="width:${(et0 / maxV) * 100}%"></div>
          </div>
        </div>
        <div class="w-16 text-[8px] font-mono text-right text-slate-500 dark:text-slate-400 flex-shrink-0">${rain.toFixed(1)} / ${et0.toFixed(1)}</div>
      </div>`;
  }).join("");

  const levelTxt = {
    urgent: ["text-rose-700 dark:text-rose-400", "Irrigation due"],
    soon: ["text-amber-700 dark:text-amber-400", "Irrigation soon"],
    hold: ["text-sky-700 dark:text-sky-400", "Hold water"],
    wet: ["text-sky-700 dark:text-sky-400", "Wet week"],
    ok: ["text-emerald-700 dark:text-emerald-400", "Stable"],
  }[wb.level] || ["text-slate-500", ""];

  return `
    <div>
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Water balance · next 7 days</h4>
        <span class="text-[10px] font-bold ${levelTxt[0]}">${levelTxt[1]}</span>
      </div>
      <div class="rounded-xl bg-slate-100/40 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-700/30 p-3">
        <div class="flex items-baseline gap-3 text-[11px] mb-1">
          <span class="text-slate-500 dark:text-slate-400">Past 3d: <span class="font-bold text-sky-600 dark:text-sky-400">${wb.pastRain.toFixed(1)} mm rain</span> vs <span class="font-bold text-amber-600 dark:text-amber-400">${wb.pastEt0.toFixed(1)} mm used</span></span>
        </div>
        <div class="space-y-0.5 mt-2">${rows}</div>
        <p class="text-[11px] text-slate-700 dark:text-slate-200 font-semibold leading-relaxed mt-2.5">${esc(wb.headline)}</p>
        <p class="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed mt-1">${esc(wb.action)}</p>
        <div class="flex gap-3 mt-1.5 text-[9px] text-slate-500 dark:text-slate-400">
          <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-sky-500 inline-block"></span>rain (mm)</span>
          <span class="inline-flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500 inline-block"></span>crop water use ET₀ (mm)</span>
        </div>
      </div>
    </div>`;
}

function renderFrostSection(ctx) {
  const nights = ctx.nextDays.slice(0, 3);
  if (!nights.length) return "";
  const rows = nights.map((day) => {
    const risk = frostRiskForNight(day.tmin, DEFAULT_FROST_THRESHOLD);
    if (!risk) return "";
    const cls = {
      high: "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border-rose-200 dark:border-rose-800",
      moderate: "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border-amber-200 dark:border-amber-800",
      watch: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700",
      low: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200/70 dark:border-emerald-800/60",
    }[risk.level];
    return `
      <div class="flex items-center gap-2 py-1">
        <div class="w-10 text-[9px] font-semibold text-slate-500 dark:text-slate-400 flex-shrink-0">${esc(dayOf(day.date))}</div>
        <div class="flex-1 text-[10px] font-mono text-slate-700 dark:text-slate-200">low ${day.tmin.toFixed(0)}°C</div>
        <div class="px-2 py-0.5 rounded-full border text-[9px] font-bold ${cls}">${risk.level === "low" ? "low risk" : risk.level}</div>
      </div>`;
  }).join("");

  return `
    <div>
      <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Frost watch · next 3 nights</h4>
      <div class="rounded-xl bg-slate-100/40 dark:bg-slate-800/40 border border-slate-200/40 dark:border-slate-700/30 p-3">
        ${rows}
        <p class="text-[9px] text-slate-400 mt-1.5 leading-relaxed">Threshold 2°C — damage limit for most vegetables and flowers. Hardy cereals (wheat, mustard, barley) shrug off much more.</p>
      </div>
    </div>`;
}

/**
 * Renders the whole Farm tab. Called when the tab is shown, when a fresh
 * forecast lands while it is open, and after the soil picker changes.
 */
export function renderFarmTab(app) {
  const panel = document.getElementById("weatherTabFarm");
  if (!panel) return;
  const a = app || appRef;
  if (!a) return;

  if (a.selectedLat == null || a.selectedLng == null) {
    panel.innerHTML = farmEmptyState();
    return;
  }

  const ctx = a.farmCtx;
  if (!ctx?.ok) {
    panel.innerHTML = `
      <div class="flex flex-col items-center justify-center text-center py-10 gap-2">
        <div class="text-3xl">🌾</div>
        <p class="text-xs text-slate-500 dark:text-slate-400 max-w-[260px] leading-relaxed">
          Waiting for this location's weather to load — the cropping plan appears here the moment it does.
        </p>
      </div>`;
    return;
  }

  const advisories = farmAdvisories({
    nightMin: ctx.nightMin,
    soilTemp6: ctx.soilTemp6,
    soilMoisture: ctx.soilMoisture,
    tmaxNext7: ctx.tmaxNext7,
    rainNext24h: ctx.rainNext24h,
    windNow: ctx.windNow,
  });
  const recs = recommendCrops(ctx).slice(0, 6);
  const gdd = sumGDD(
    { temperature_2m_max: ctx.nextDays.map((d) => d.tmax), temperature_2m_min: ctx.nextDays.map((d) => d.tmin) },
    10,
  );

  panel.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">🌾 Farm Mode</h4>
        <button id="farmRefreshBtn" class="text-[10px] font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer">Refresh soil data</button>
      </div>
      ${renderRegionChip(ctx)}
      ${renderSiteSnapshot(ctx)}
      ${renderFarmAdvisories(advisories)}
      <div>
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">What to grow here — ranked for this week</h4>
        </div>
        <div class="space-y-1.5">
          ${recs.map((r) => renderCropCard(ctx, r)).join("") || (
            (Math.abs(ctx.lat || 0) >= 66 || (ctx.siteTemp != null && ctx.siteTemp <= -3) || (ctx.meanTempNext7 != null && ctx.meanTempNext7 <= -2))
              ? `<div class="rounded-xl border border-sky-200/60 dark:border-sky-800/60 bg-sky-50/70 dark:bg-sky-950/40 p-4 text-center space-y-1.5">
                  <div class="text-2xl">❄️</div>
                  <div class="text-xs font-bold text-slate-800 dark:text-slate-100">Outdoor Cropping Inactive — Sub-Zero Climate (${ctx.siteTemp != null ? Math.round(ctx.siteTemp) : Math.round(ctx.meanTempNext7 || 0)}°C)</div>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Freezing temperatures and frozen soil prevent outdoor seed germination and crop growth at this latitude. Outdoor farming resumes when mean temperatures consistently exceed 8-10°C.
                  </p>
                </div>`
              : `<div class="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 p-3.5 text-center space-y-1">
                  <div class="text-lg">🍂</div>
                  <div class="text-xs font-bold text-slate-700 dark:text-slate-200">No Suitable Sowing Window This Week</div>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Current weather conditions and seasonal timing are outside the optimal sowing window for catalogued crops at this location. Check back as temperatures and seasonal windows shift.
                  </p>
                </div>`
          )}
        </div>
        <div class="mt-2 rounded-lg bg-slate-100/60 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 p-2">
          <div class="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
            <span class="font-bold">Seasonal heat accumulation:</span> ${gdd == null ? "--" : gdd} growing degree-days (base 10°C) across the next 7 days — warm crops (maize, cotton, rice) need 1200-2200 over a full season.
          </div>
        </div>
      </div>
      ${renderSpraySection(ctx)}
      ${renderWaterSection(ctx)}
      ${renderFrostSection(ctx)}
      <p class="text-[9px] text-slate-400 dark:text-slate-500 leading-relaxed">
        Crop envelopes are standard agronomic ranges scored against live soil-moisture, temperature, elevation and rainfall for this exact point
        (Open-Meteo, ~1 km resolution). Verify against your local agriculture department before committing inputs. ~7-day planning horizon.
      </p>
    </div>`;

  wireFarmControls(a);
}

/** Binds the soil picker + refresh button after each render. */
function wireFarmControls(app) {
  const sel = document.getElementById("farmSoilSelect");
  if (sel) {
    sel.addEventListener("change", () => {
      saveSoil(sel.value);
      refreshFarmContext(app, { force: false });
    });
  }
  const btn = document.getElementById("farmRefreshBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      btn.textContent = "Refreshing…";
      refreshFarmContext(app, { force: true });
    });
  }
}

// ────────────────── runtime ──────────────────

/** Recomputes context + re-renders (cheap; agro data is cached). */
function refreshFarmContext(app, { force = false } = {}) {
  const a = app || appRef;
  if (!a || a.selectedLat == null) return;
  if (force) {
    _agroCache.delete(agroCacheKey(a.selectedLat, a.selectedLng));
    const cached = a.farmAgroCache;
    if (cached && cached.lat === a.selectedLat && cached.lng === a.selectedLng) {
      a.farmAgroCache = null;
    }
  }
  scheduleFarmUpdate(a, force);
}

let _farmFetchTimer = null;

/** Debounced agro fetch + context build. Never throws. */
function scheduleFarmUpdate(app, force = false) {
  const a = app || appRef;
  if (!a || a.selectedLat == null || a.selectedLng == null) return;
  clearTimeout(_farmFetchTimer);
  _farmFetchTimer = setTimeout(async () => {
    try {
      const cached = a.farmAgroCache;
      let agro = cached && cached.lat === a.selectedLat && cached.lng === a.selectedLng ? cached.data : null;
      if (!agro || force) {
        try {
          agro = await fetchAgroData(a.selectedLat, a.selectedLng);
          a.farmAgroCache = { lat: a.selectedLat, lng: a.selectedLng, data: agro };
        } catch {
          agro = null; // soft-fail: no soil telemetry, advice continues
        }
      }
      a.farmSoil = getSavedSoil();
      a.farmCtx = buildSiteContext({
        weatherData: a.weatherData,
        agroData: agro,
        soilId: a.farmSoil,
        lat: a.selectedLat,
        lng: a.selectedLng,
        address: a.selectedAddress,
        hourIndex: typeof a.currentHourIndex === "number" ? a.currentHourIndex : undefined,
      });
      if (a.activeWeatherTab === "farm") renderFarmTab(a);
      maybeNotifyFrost(a, a.farmCtx);
    } catch (e) {
      console.warn("Farm Mode update failed:", e);
    }
  }, force ? 0 : 400);
}

/** Frost push with per-location cooldown — same shape as rainPush. */
function maybeNotifyFrost(app, ctx) {
  if (!ctx?.ok) return;
  const advisories = farmAdvisories({
    nightMin: ctx.nightMin,
    soilTemp6: ctx.soilTemp6,
    soilMoisture: ctx.soilMoisture,
    tmaxNext7: ctx.tmaxNext7,
    rainNext24h: ctx.rainNext24h,
    windNow: ctx.windNow,
  });
  const frost = advisories.find((x) => x.type === "frost" && x.severity === "severe");
  if (!frost) return;
  let last = {};
  try {
    last = JSON.parse(localStorage.getItem(FARM_FROST_LAST_KEY) || "{}");
  } catch {
    last = {};
  }
  const key = `${ctx.lat.toFixed(2)},${ctx.lng.toFixed(2)}`;
  const now = Date.now();
  if (typeof last[key] === "number" && now - last[key] < FARM_COOLDOWN_MS) return;
  last[key] = now;
  try {
    localStorage.setItem(FARM_FROST_LAST_KEY, JSON.stringify(last));
  } catch {
    /* storage unavailable */
  }
  const place = String(app.selectedName || "your field").split(/,\s*/)[0];
  try {
    app.showToast?.(`❄️ Frost warning tonight for ${place} — cover tender crops.`, "warning", 8000);
  } catch {
    /* toast optional */
  }
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(`❄️ Aurafisky — frost warning for ${place}`, {
        body: frost.desc,
        tag: `aurafisky-frost-${key}`,
        icon: "/icon-192.png",
      });
    }
  } catch {
    /* notifications optional */
  }
}

// ────────────────── feature entry ──────────────────

export function init(app) {
  appRef = app;

  app.farmSoil = getSavedSoil();
  app.farmRegionOverride = getSavedRegion();
  app.renderFarmTab = renderFarmTab;
  app.refreshFarmMode = refreshFarmContext;

  // Re-evaluate when a fresh forecast lands (same additive-wrap pattern
  // as rainPush/alerts, so the wraps coexist on updateWeatherDisplay).
  const originalUpdate =
    typeof app.updateWeatherDisplay === "function" ? app.updateWeatherDisplay : null;
  if (originalUpdate && !originalUpdate.__farmWrapped) {
    const wrapped = function (...args) {
      const result = originalUpdate.apply(this, args);
      try {
        scheduleFarmUpdate(this);
      } catch (e) {
        console.warn("Farm Mode update failed:", e);
      }
      return result;
    };
    wrapped.__farmWrapped = true;
    app.updateWeatherDisplay = wrapped;
  }

  // Render when the farm tab becomes active (tab listeners bind before
  // features init, so wrap switchWeatherTab rather than re-binding).
  const originalSwitch =
    typeof app.switchWeatherTab === "function" ? app.switchWeatherTab : null;
  if (originalSwitch && !originalSwitch.__farmSwitchWrapped) {
    const wrapped = function (tabName) {
      const result = originalSwitch.apply(this, [tabName]);
      try {
        if (tabName === "farm") {
          if (!this.farmCtx) scheduleFarmUpdate(this);
          renderFarmTab(this);
        }
      } catch (e) {
        console.warn("Farm tab render failed:", e);
      }
      return result;
    };
    wrapped.__farmSwitchWrapped = true;
    app.switchWeatherTab = wrapped;
  }
}


