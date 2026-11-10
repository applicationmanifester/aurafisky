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
  getSowMonthsForSite,
  isMonthInWindow,
  monthsUntilWindow,
  formatSowWindow,
  classifyClimate,
  MONTH_SHORT,
} from "./cropData.js";
import { fetchSoilGrids, soilPHBand } from "./soilGrids.js";
import {
  loadFields,
  addField,
  removeField,
  updateField,
  getField,
  daysSinceSowing,
  setActiveFieldId,
  getActiveFieldId,
  FARM_ACTIVE_FIELD_KEY,
} from "./farmFields.js";
import {
  cleanBotanicalName,
  resolveIndianFloraName,
} from "../modules/indianFloraNames.js";
import { t, detectLocale, translateDOM, refreshExternalTranslation, translateText } from "../modules/i18n.js";

// ────────────────── constants ──────────────────

export const FARM_SOIL_KEY = "aurafisky_farm_soil";
export const FARM_FROST_LAST_KEY = "aurafisky_farm_frost_last";
export const FARM_COOLDOWN_MS = 12 * 60 * 60 * 1000; // one frost push per place / 12h
export const AGRO_TTL_MS = 10 * 60 * 1000; // in-memory agro cache TTL
export const AGRO_URL = "https://api.open-meteo.com/v1/forecast";
export const FARM_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // one proactive alert per field / 6h
export const SOILGRIDS_FALLBACK_KEY = "aurafisky_farm_soilgrids_failed";

const DEFAULT_FROST_THRESHOLD = 2; // °C — most vegetation damaged below this

/** Crop growth stages keyed by base-10 GDD thresholds (cumulative from sowing).
 *  Each stage: { gdd: degrees, name, label, action }. GDD thresholds are
 *  approximate and crop-specific — standard FAO/extension figures. */
export const GROWTH_STAGES = {
  rice: [
    { gdd: 0, name: "sowing", label: "Sown / germination", action: "Keep soil moist, avoid waterlogging" },
    { gdd: 450, name: "tillering", label: "Tillering", action: "Maintain 3–5 cm standing water, top-dress nitrogen" },
    { gdd: 900, name: "panicle", label: "Panicle initiation", action: "Critical water window — do not let field dry" },
    { gdd: 1300, name: "flowering", label: "Flowering", action: "Keep flooded; avoid midday spray" },
    { gdd: 1600, name: "grain-fill", label: "Grain filling", action: "Intermittent irrigation, drain 10 days before harvest" },
  ],
  wheat: [
    { gdd: 0, name: "sowing", label: "Sown / emergence", action: "Firm seedbed, pre-sowing irrigation" },
    { gdd: 300, name: "tillering", label: "Tillering", action: "First nitrogen top-dress" },
    { gdd: 600, name: "stem-elongation", label: "Stem elongation", action: "Second irrigation at jointing" },
    { gdd: 1000, name: "flowering", label: "Flowering", action: "Critical water window — avoid drought" },
    { gdd: 1300, name: "grain-fill", label: "Grain filling", action: "Stop irrigation at hard dough stage" },
  ],
  maize: [
    { gdd: 0, name: "sowing", label: "Sown / emergence", action: "Seedbed moisture essential" },
    { gdd: 350, name: "vegetative", label: "Vegetative (V6–V8)", action: "Side-dress nitrogen at knee-high" },
    { gdd: 750, name: "tasselling", label: "Tasselling", action: "Critical — water stress here cuts kernel set" },
    { gdd: 1100, name: "silking", label: "Silking / pollination", action: "Do not let field dry" },
    { gdd: 1400, name: "grain-fill", label: "Grain filling", action: "Maintain moisture until black layer" },
  ],
  cotton: [
    { gdd: 0, name: "sowing", label: "Sown / emergence", action: "Warm soil (>18°C) at planting" },
    { gdd: 500, name: "squaring", label: "Squaring", action: "First irrigation at flower bud formation" },
    { gdd: 900, name: "flowering", label: "Flowering", action: "Regular irrigation, watch bollworm" },
    { gdd: 1300, name: "boll-fill", label: "Boll filling", action: "Stop irrigation when bolls begin opening" },
  ],
  "groundnut": [
    { gdd: 0, name: "sowing", label: "Sown / emergence", action: "Friable soil, no waterlogging" },
    { gdd: 400, name: "flowering", label: "Flowering", action: "Light irrigation at pegging" },
    { gdd: 800, name: "peg-entry", label: "Peg entering soil", action: "Keep moist — pods form underground" },
    { gdd: 1200, name: "pod-fill", label: "Pod filling", action: "Dry soil before harvest" },
  ],
  tomato: [
    { gdd: 0, name: "transplant", label: "Transplanted / establishment", action: "Water daily for first week" },
    { gdd: 500, name: "vegetative", label: "Vegetative", action: "Stake plants, regular irrigation" },
    { gdd: 900, name: "flowering", label: "Flowering", action: "Avoid water stress — blossom drop risk" },
    { gdd: 1300, name: "fruiting", label: "Fruiting", action: "Calcium spray against blossom-end rot" },
  ],
  potato: [
    { gdd: 0, name: "planting", label: "Planted / emergence", action: "Hill up soil around stems" },
    { gdd: 500, name: "tuber-initiation", label: "Tuber initiation", action: "Critical water window — even moisture" },
    { gdd: 900, name: "tuber-bulking", label: "Tuber bulking", action: "Regular irrigation, avoid dry-wet swings" },
    { gdd: 1300, name: "maturity", label: "Maturity / skin set", action: "Stop irrigation 2 weeks before harvest" },
  ],
};

/** Current growth stage from accumulated GDD and days since sowing. */
export function computeGrowthStage(cropId, sowingDateISO, dailyTemps, baseTemp = 10) {
  if (!cropId || !sowingDateISO) return null;
  const stages = GROWTH_STAGES[cropId];
  if (!stages) return null;

  const sown = new Date(sowingDateISO + "T00:00:00").getTime();
  if (isNaN(sown)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.floor((today - sown) / (1000 * 60 * 60 * 24));
  if (days < 0) return null;

  // Accumulate GDD from daily temps array (each entry {tmax, tmin})
  let gdd = 0;
  const daysToUse = Math.min(days + 1, dailyTemps.length);
  for (let i = 0; i < daysToUse; i++) {
    const d = dailyTemps[i];
    if (d?.tmax != null && d?.tmin != null) {
      gdd += Math.max(0, (d.tmax + d.tmin) / 2 - baseTemp);
    }
  }

  // Find the latest stage whose GDD threshold <= accumulated GDD
  let current = stages[0];
  for (const st of stages) {
    if (gdd >= st.gdd) current = st;
    else break;
  }
  return { ...current, gdd: Math.round(gdd), daysSinceSowing: days };
}

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
 * timing 25 (the sowing window carries the most weight).
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
  if (ctx.isWater) {
    return {
      cropId: crop.id,
      cropName: crop.name,
      score: 0,
      verdict: "Not viable in open water / marine environment",
      parts: [],
      constraints: ["Open water / no arable soil"],
    };
  }

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
    timingScore, 25);

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
  if (ctx.isWater) return [];
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

// ────────────────── local plants (GBIF) ──────────────────

/**
 * Fetch wild/cultivated plant species recorded near a point from GBIF
 * (Global Biodiversity Information Facility) — free, no API key, open data.
 * Returns species actually observed near this location, which is a much
 * better "what grows here" signal than any hand-curated list.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{radiusKm?:number, limit?:number, now?:number, signal?:AbortSignal}} [opts]
 * @returns {Promise<Array<{scientificName:string, vernacularName:string|null,
 *            rank:string, kingdom:string, family:string|null, genus:string|null,
 *            species:string|null, recorded:number}>>}
 */
// ────────────────── local plants (GBIF) ──────────────────

/**
 * Classifies a GBIF plant occurrence into a user-friendly botanical category:
 * tree, flower, herb, grass, or general native flora.
 *
 * @param {{vernacularName?:string|null, scientificName?:string|null, family?:string|null, genus?:string|null}} p
 * @returns {{id:'tree'|'flower'|'herb'|'grass'|'flora', label:string, emoji:string}}
 */
export function classifyPlantType(p = {}) {
  const name = `${p.vernacularName || ""} ${p.scientificName || ""} ${p.genus || ""}`.toLowerCase();
  const fam = (p.family || "").toLowerCase();

  // Trees & Woody Plants
  if (
    /pinaceae|fagaceae|betulaceae|salicaceae|cupressaceae|moraceae|myrtaceae|meliaceae|oleaceae|sapindaceae|bignoniaceae|ulmaceae|arecaceae|rutaceae|magnoliaceae|lauraceae|juglandaceae|anacardiaceae/.test(fam) ||
    /\b(tree|oak|quercus|pine|pinus|cedar|cedrus|birch|betula|maple|acer|willow|salix|palm|ash|fraxinus|elm|ulmus|spruce|picea|fir|abies|cypress|cupressus|acacia|eucalyptus|neem|azadirachta|teak|tectona|poplar|populus|beech|fagus|redwood|sequoia|mahogany|swietenia|alder|alnus|walnut|juglans|chestnut|castanea|linden|tilia|sycamore|moringa|boxwood|buxus|yew|taxus|juniper|juniperus|aspen|cherry|prunus|apple|malus|plum|pear|pyrus|fig|ficus|citrus)\b/.test(name)
  ) {
    return { id: "tree", label: "Tree / Woody", emoji: "🌲" };
  }

  // Grasses, Reeds, Bamboos & Ferns
  if (
    /poaceae|cyperaceae|juncaceae|polypodiaceae|pteridaceae|dryopteridaceae|equisetaceae|aspleniaceae|gramineae|dennstaedtiaceae/.test(fam) ||
    /\b(grass|fern|sedge|carex|rush|juncus|reed|phragmites|bamboo|bambusa|dendrocalamus|horsetail|equisetum|cane|fescue|festuca|ryegrass|lolium|bluegrass|poa|timothy|phleum|sorghum)\b/.test(name)
  ) {
    return { id: "grass", label: "Grass / Fern", emoji: "🌾" };
  }

  // Herbs & Medicinal Plants
  if (
    /lamiaceae|apiaceae|zingiberaceae|plantaginaceae|boraginaceae|amaranthaceae|urticaceae|polygonaceae|papaveraceae/.test(fam) ||
    /\b(mint|mentha|basil|ocimum|rosemary|salvia|lavender|lavandula|thyme|thymus|sage|herb|medicinal|aloe|chamomile|matricaria|fennel|foeniculum|parsley|petroselinum|cilantro|coriander|coriandrum|nettle|urtica|sorrel|rumex|dock|balm|melissa|tulsi|marjoram|oregano|origanum|dill|anethum|chive|allium|ginseng|panax)\b/.test(name)
  ) {
    return { id: "herb", label: "Herb / Medicinal", emoji: "🌿" };
  }

  // Flowers & Ornamentals
  if (
    /asteraceae|orchidaceae|liliaceae|iridaceae|amaryllidaceae|ranunculaceae|caryophyllaceae|malvaceae|campanulaceae|primulaceae|ericaceae|violaceae|gentianaceae|geraniaceae|solanaceae|rosaceae/.test(fam) ||
    /\b(flower|rose|rosa|orchid|lily|lilium|iris|tulip|tulipa|violet|viola|daisy|bellis|marigold|tagetes|hibiscus|jasmine|jasminum|blossom|poppy|papaver|sunflower|helianthus|dahlia|carnation|dianthus|buttercup|ranunculus|begonia|peony|paeonia|zinnia|petunia|geranium|pansy|crocus|bluebell|hyacinth)\b/.test(name)
  ) {
    return { id: "flower", label: "Wildflower / Floral", emoji: "🌸" };
  }

  return { id: "flora", label: "Native Flora", emoji: "🌱" };
}

/**
 * Fetch wild/cultivated plant species recorded near a point from GBIF
 * (Global Biodiversity Information Facility) — free, no API key, open data.
 * Returns species actually observed near this location, which is a much
 * better "what grows here" signal than any hand-curated list.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{radiusKm?:number, limit?:number, now?:number, signal?:AbortSignal}} [opts]
 * @returns {Promise<Array<{scientificName:string, vernacularName:string|null,
 *            rank:string, kingdom:string, family:string|null, genus:string|null,
 *            species:string|null, recorded:number, type:Object}>>}
 */
const _gbifCache = new Map();
const GBIF_TTL_MS = 24 * 60 * 60 * 1000; // species lists change slowly

export async function fetchLocalPlants(lat, lng, opts = {}) {
  const now = opts.now ?? Date.now();
  const key = `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;
  const hit = _gbifCache.get(key);
  if (hit && now - hit.ts < GBIF_TTL_MS) return hit.data;

  // Approximate radius in degrees: 1 deg lat ~ 111 km, longitude scaled by cos(lat)
  const radiusKm = opts.radiusKm ?? 40;
  const dLat = radiusKm / 111;
  const rad = (lat * Math.PI) / 180;
  const cosLat = Math.max(0.15, Math.abs(Math.cos(rad)));
  const dLng = dLat / cosLat;

  const minLat = Math.max(-90, lat - dLat).toFixed(4);
  const maxLat = Math.min(90, lat + dLat).toFixed(4);
  const minLng = Math.max(-180, lng - dLng).toFixed(4);
  const maxLng = Math.min(180, lng + dLng).toFixed(4);

  const params = new URLSearchParams({
    decimalLatitude: `${minLat},${maxLat}`,
    decimalLongitude: `${minLng},${maxLng}`,
    taxonKey: "6", // Plantae kingdom
    hasCoordinate: "true",
    limit: String(opts.limit ?? 150),
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(
      `https://api.gbif.org/v1/occurrence/search?${params}`,
      { signal: opts.signal || ctrl.signal },
    );
    if (!res.ok) throw new Error(`GBIF error ${res.status}`);
    const json = await res.json();
    const results = json.results || [];
    const seen = new Set();
    const plants = [];
    for (const r of results) {
      const sci = r.scientificName;
      if (!sci || seen.has(sci)) continue;
      seen.add(sci);
      const kingdom = (r.kingdom || "").toLowerCase();
      // Keep Plantae (plants, incl. trees, crops, vegetables); drop fungi/animal.
      if (kingdom !== "plantae") continue;
      const plantObj = {
        scientificName: sci,
        vernacularName: r.vernacularName || null,
        rank: r.rank || null,
        kingdom: r.kingdom || null,
        family: r.family || null,
        genus: r.genus || null,
        species: r.species || null,
        recorded: r.year != null ? Number(r.year) : null,
      };
      plantObj.type = classifyPlantType(plantObj);
      plantObj.localInfo = resolveIndianFloraName(plantObj, {
        lat,
        lng,
        locationName: opts.locationName || "",
      });
      plants.push(plantObj);
    }
    _gbifCache.set(key, { ts: now, data: plants });
    return plants;
  } catch {
    return []; // soft-fail: no local plant feed
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam: seed the GBIF cache without a network call. */
export function __seedGbifCache(lat, lng, data, ts = Date.now()) {
  const normalized = Array.isArray(data)
    ? data.map((p) => ({ ...p, type: p.type || classifyPlantType(p) }))
    : [];
  _gbifCache.set(`${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`, { ts, data: normalized });
}

// ────────────────── site context assembly ──────────────────

/**
 * Reduces the loaded forecast + agro dataset into the flat context the
 * scoring engine consumes. Pure (WeatherService is read off globalThis,
 * as rainPush does) so tests can drive it with fixture JSON.
/**
 * Detects whether coordinates represent open water (ocean, sea, gulf, strait,
 * lake, or marine grid) where terrestrial agricultural farming is impossible.
 *
 * @param {Object} ctx - site context from buildSiteContext
 * @param {Object} [appOrInput] - app instance or input object
 * @returns {{isWater: boolean, label: string, name: string, detail: string}}
 */
export function isWaterBodyLocation(ctx = {}, appOrInput = {}) {
  const a = appOrInput || appRef;
  const lat = ctx.lat ?? a?.selectedLat;
  const lng = ctx.lng ?? a?.selectedLng;
  const address = a?.selectedAddress || appOrInput?.address || ctx.address || {};
  const name = `${a?.selectedName || ""} ${a?.selectedDisplayName || ""}`.trim();

  // 1. Explicit water names or reverseGeocode fallback (e.g. "Pacific Ocean", "Makassar Strait")
  const oceanKeywords = /\b(ocean|sea|gulf|strait|bay|sound|bight|lake|channel|basin|firth|fjord)\b/i;
  const isNamedWater =
    oceanKeywords.test(name) ||
    oceanKeywords.test(address.natural || "") ||
    oceanKeywords.test(address.water || "");

  // 2. Settlement presence check (if there's a road, street, village, town, city, suburb, or hamlet, it's land)
  const hasSettlement = !!(
    address.road ||
    address.street ||
    address.suburb ||
    address.neighbourhood ||
    address.residential ||
    address.village ||
    address.hamlet ||
    address.town ||
    address.city ||
    address.municipality ||
    address.isolated_dwelling
  );

  // 3. Open-Meteo elevation and soil moisture telemetry
  // Real terrestrial soils have non-zero volumetric water content. Open-Meteo sets ocean cells to elevation 0 and moisture 0.
  const isZeroElevation = (ctx.elevation || 0) <= 0.05;
  const isZeroMoisture =
    ctx.hasSoil &&
    (ctx.soilVwc === 0 || ctx.soilVwc == null) &&
    (ctx.soilDeep === 0 || ctx.soilDeep == null);

  // 4. Nominatim maritime boundary only (e.g. province border over sea without any land settlement)
  const isMaritimeBoundaryOnly =
    !hasSettlement &&
    isZeroElevation &&
    (isZeroMoisture || !ctx.hasSoil) &&
    (address.province || address.state || address.country);

  const isWater =
    isNamedWater ||
    (isZeroElevation && isZeroMoisture && !hasSettlement) ||
    isMaritimeBoundaryOnly;

  let label = "Open Water / Marine Area";
  if (/ocean/i.test(name)) label = "Open Ocean";
  else if (/sea/i.test(name)) label = "Open Sea";
  else if (/strait/i.test(name)) label = "Marine Strait";
  else if (/lake/i.test(name)) label = "Inland Water Body";

  return {
    isWater,
    label,
    name: name || label,
    detail: `Coordinates (${Number(lat || 0).toFixed(4)}°, ${Number(lng || 0).toFixed(4)}°) are located in open water. Terrestrial crops and soil-based agriculture cannot grow in marine or aquatic environments.`,
  };
}

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

  // ── Field context ─────────────────────────────────────────────────
  // If a saved field id is provided, use its soil texture & sowing date.
  let field = null;
  let fieldSoilId = input.soilId;
  let sowingDate = null;
  let activeFieldId = input.fieldId;
  if (!activeFieldId) {
    activeFieldId = getActiveFieldId();
  }
  if (activeFieldId) {
    field = getField(activeFieldId);
    if (field) {
      fieldSoilId = field.soilId;
      sowingDate = field.sowingDate;
    }
  }
  const soilId = fieldSoilId || "loam";
  const soilVwc = ah?.soil_moisture_7_to_28cm?.[startIdx] ?? ah?.soil_moisture_9_to_27cm?.[startIdx] ?? ah?.soil_moisture_9_to_27cm?.[0];
  const soilDeep = ah?.soil_moisture_28_to_100cm?.[startIdx] ?? ah?.soil_moisture_27_to_81cm?.[startIdx] ?? ah?.soil_moisture_27_to_81cm?.[0];
  const sm0_7 = ah?.soil_moisture_0_to_7cm?.[startIdx] ?? (Number.isFinite(soilVwc) ? Number((soilVwc * 0.92).toFixed(3)) : null);
  const sm7_28 = soilVwc;
  const sm28_100 = soilDeep;
  const smDeep = ah?.soil_moisture_100_to_255cm?.[startIdx] ?? (Number.isFinite(soilDeep) ? Number((soilDeep * 1.04).toFixed(3)) : null);
  const soilDepths = [
    { label: "Surface (0–7 cm)", vwc: sm0_7, desc: "Seedbed moisture & evaporation" },
    { label: "Root Zone (7–28 cm)", vwc: sm7_28, desc: "Active crop uptake layer" },
    { label: "Subsoil (28–100 cm)", vwc: sm28_100, desc: "Deep root water reserve" },
    { label: "Deep Buffer (>100 cm)", vwc: smDeep, desc: "Subsurface groundwater buffer" }
  ];
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
    soilDepths,
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
    field,
    sowingDate,
    soilSource: field?.soilSource ?? (input.soilGrids ? "soilgrids" : input.soilId ? "manual" : "default"),
    growthStage: null,
  };

  const waterCheck = isWaterBodyLocation(ctx, input);
  ctx.isWater = waterCheck.isWater;
  ctx.waterInfo = waterCheck;

  // ── Growth stage ─────────────────────────────────────────────────
  // Compute from field's sowing date + crop + accumulated GDD.
  if (field?.cropId && sowingDate) {
    const stage = computeGrowthStage(field.cropId, sowingDate, daily);
    if (stage) ctx.growthStage = stage;
  }

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

function farmEmptyState(locale) {
  const loc = locale || (typeof detectLocale === "function" ? detectLocale() : "en");
  const title = translateText("Farm Mode", loc) || "Farm Mode";
  const desc = translateText("Tap a location on the map (or search your village) and this tab turns it into a cropping plan: what to grow, when to sow, spray windows, and the water balance.", loc) || "Tap a location on the map (or search your village) and this tab turns it into a cropping plan: what to grow, when to sow, spray windows, and the water balance.";
  return `
    <div class="flex flex-col items-center justify-center text-center py-10 gap-3">
      <div class="text-4xl">🌾</div>
      <h4 class="text-sm font-bold text-slate-700 dark:text-slate-200">${title}</h4>
      <p class="text-xs text-slate-500 dark:text-slate-400 max-w-[260px] leading-relaxed">
        ${desc}
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

/** Field selector dropdown — switch between saved fields or save current point. */
function renderFieldSelector(ctx, app) {
  const a = app || appRef;
  const fields = loadFields();
  const activeId = getActiveFieldId();
  const activeField = activeId ? fields.find((f) => f.id === activeId) : null;
  const currentLabel = activeField ? esc(activeField.name) : "Current point";
  const soilLabel = activeField ? getSoil(activeField.soilId)?.name || activeField.soilId : "";
  const days = activeField?.sowingDate ? daysSinceSowing(activeField.sowingDate) : null;
  const daysTxt = days != null ? ` · Day ${days}` : "";

  return `
    <div class="inline-flex items-center gap-1.5">
      <select id="farmFieldSelect" class="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-1.5 py-1 text-[10px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
        <option value="__current__">📍 ${currentLabel}${daysTxt}</option>
        <option value="__new__">+ Save this field</option>
        ${fields.map((f) => `<option value="${esc(f.id)}"${activeId === f.id ? " selected" : ""}>🏷️ ${esc(f.name)}${daysSinceSowing(f.sowingDate) != null ? ` · Day ${daysSinceSowing(f.sowingDate)}` : ""}</option>`).join("")}
      </select>
      <button id="farmFieldEditBtn" class="p-1.5 rounded-lg hover:bg-slate-200/70 dark:hover:bg-slate-700/60 transition-colors text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 cursor-pointer" title="Edit field" aria-label="Edit field">
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15 23l-7-7 7-7m6 6L9 9m12 0-3 3m-3 3-3-3"/></svg>
      </button>
    </div>
    ${activeField && activeField.growthStage ? `
    <div class="inline-flex items-center gap-2 text-[10px] mb-1">
      <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60">
        <span class="text-[9px]">🌱</span>
        <span class="font-semibold text-emerald-800 dark:text-emerald-300 truncate">${esc(activeField.growthStage.name)} — ${esc(activeField.growthStage.label)}</span>
      </span>
      <span class="text-slate-500 dark:text-slate-500">GDD ${esc(activeField.growthStage.gdd)} · Day ${esc(activeField.growthStage.daysSinceSowing)}</span>
    </div>` : ""}
  `;
}

/** Edit field modal content (name, crop, sowing date, notes, soil). */
function renderFieldEditor(field) {
  const crops = CROPS.map((c) => `<option value="${esc(c.id)}"${field?.cropId === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("");
  const soils = SOIL_TYPES.map((s) => `<option value="${esc(s.id)}"${field?.soilId === s.id ? " selected" : ""}>${esc(s.name)}</option>`).join("");
  return `
    <div id="farmFieldEditor" class="fixed inset-0 z-[5000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 w-full max-w-md mx-4 shadow-2xl border border-slate-200 dark:border-slate-800">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-bold text-slate-800 dark:text-white">${field ? "Edit field" : "Save new field"}</h4>
          <button id="farmFieldEditorClose" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400">✕</button>
        </div>
        <form id="farmFieldEditorForm" class="space-y-3">
          <div>
            <label class="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">Field name</label>
            <input type="text" id="fieldName" value="${esc(field?.name || "")}" placeholder="e.g. North Paddy" class="w-full text-[11px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" required />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">Crop</label>
              <select id="fieldCrop" class="w-full text-[11px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500">
                <option value="">None</option>${crops}
              </select>
            </div>
            <div>
              <label class="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">Soil</label>
              <select id="fieldSoil" class="w-full text-[11px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500">
                ${soils}
              </select>
            </div>
          </div>
          <div>
            <label class="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">Sowing date</label>
            <input type="date" id="fieldSowingDate" value="${esc(field?.sowingDate || "")}" class="w-full text-[11px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          </div>
          <div>
            <label class="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">Notes</label>
            <textarea id="fieldNotes" rows="2" placeholder="Variety, fertilizer plan, etc." class="w-full text-[11px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500">${esc(field?.notes || "")}</textarea>
          </div>
          <div class="flex items-center justify-between pt-3 gap-2">
            ${field ? `
              <button type="button" id="farmFieldEditorDelete" class="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 px-3 py-1.5 rounded-lg transition-colors border border-rose-200 dark:border-rose-800/50 flex items-center gap-1 cursor-pointer" title="Delete this field">
                <span>🗑️</span>
                <span>Delete</span>
              </button>
            ` : ""}
            <button type="button" id="farmFieldEditorCancel" class="flex-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">Cancel</button>
            <button type="submit" class="flex-1 text-[11px] font-medium text-white bg-teal-600 hover:bg-teal-700 px-3 py-1.5 rounded-lg transition-colors shadow-sm cursor-pointer">${field ? "Save changes" : "Save field"}</button>
          </div>
        </form>
      </div>
    </div>`;
}

/** Render the local plant species GBIF recorded near this point with category filters & search. */
function renderLocalPlants(ctx, app) {
  if (ctx?.loadingLocalPlants) {
    return `
      <div class="rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-1 text-center">
        <div class="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5">
          <span class="inline-block animate-spin text-teal-600">⏳</span>
          <span>Querying Local Flora within ~40 km (GBIF)...</span>
        </div>
        <p class="text-[10px] text-slate-400">Discovering recorded botanical species cataloged near this location.</p>
      </div>`;
  }

  const plants = Array.isArray(ctx?.localPlants) ? ctx.localPlants : [];
  if (!plants.length) {
    return `
      <div class="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/30 p-2.5 text-center">
        <div class="text-[11px] font-semibold text-slate-600 dark:text-slate-300">🌿 Local Flora (GBIF)</div>
        <p class="text-[10px] text-slate-400 mt-0.5">No wild flora occurrences recorded within ~40 km in open biodiversity catalogs for this exact coordinate.</p>
      </div>`;
  }

  const a = app || appRef;
  const activeCat = a?.farmLocalPlantCategory || "all";
  const searchQ = (a?.farmLocalPlantSearch || "").trim().toLowerCase();
  const isExpanded = !!a?.farmLocalPlantExpanded;

  let treeCount = 0;
  let flowerCount = 0;
  let herbCount = 0;
  let grassCount = 0;
  let floraCount = 0;

  for (const p of plants) {
    const t = p.type?.id || classifyPlantType(p).id;
    if (t === "tree") treeCount++;
    else if (t === "flower") flowerCount++;
    else if (t === "herb") herbCount++;
    else if (t === "grass") grassCount++;
    else floraCount++;
  }

  const localCats = [
    { id: "all", label: `All (${plants.length})`, emoji: "🌱" },
    { id: "tree", label: `Trees (${treeCount})`, emoji: "🌲" },
    { id: "flower", label: `Wildflowers (${flowerCount})`, emoji: "🌸" },
    { id: "herb", label: `Herbs (${herbCount})`, emoji: "🌿" },
    { id: "grass", label: `Grasses & Ferns (${grassCount})`, emoji: "🌾" },
  ];

  const catChips = localCats.map((c) => {
    const isActive = activeCat === c.id;
    const activeClass = isActive
      ? "bg-emerald-600 text-white font-bold shadow-xs"
      : "bg-slate-200/70 hover:bg-slate-300/70 dark:bg-slate-700/60 dark:hover:bg-slate-600/70 text-slate-700 dark:text-slate-200";
    return `<button type="button" class="farm-local-cat-chip flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] whitespace-nowrap transition-all select-none cursor-pointer ${activeClass}" data-local-cat="${esc(c.id)}">${c.emoji} ${esc(c.label)}</button>`;
  }).join("");

  const byRank = {};
  for (const p of plants) {
    (byRank[p.rank || "species"] = byRank[p.rank || "species"] || []).push(p);
  }
  const order = ["species", "genus", "family", "variety", "form", "subspecies"];
  const ranked = order
    .flatMap((rk) => byRank[rk] || [])
    .concat(plants.filter((p) => !order.includes(p.rank || "species")));

  const filtered = ranked.filter((p) => {
    const t = p.type?.id || classifyPlantType(p).id;
    if (activeCat !== "all" && t !== activeCat) return false;
    if (searchQ) {
      const info = p.localInfo || resolveIndianFloraName(p, {
        lat: ctx?.lat ?? a?.selectedLat,
        lng: ctx?.lng ?? a?.selectedLng,
        locationName: a?.selectedName || ctx?.locationName || "",
      });
      if (!info.searchKeywords.includes(searchQ)) return false;
    }
    return true;
  });

  const maxVisible = isExpanded ? 50 : 10;
  const visible = filtered.slice(0, maxVisible);

  const rows = visible.map((p) => {
    const info = p.localInfo || resolveIndianFloraName(p, {
      lat: ctx?.lat ?? a?.selectedLat,
      lng: ctx?.lng ?? a?.selectedLng,
      locationName: a?.selectedName || ctx?.locationName || "",
    });
    const pType = p.type || classifyPlantType(p);
    const cleanSci = info.cleanScientific || cleanBotanicalName(p.scientificName) || p.scientificName;
    const displayName = info.primaryDisplay || p.vernacularName || cleanSci;
    const fam = p.family || "";
    const badge = info.regionalBadge || "";
    const recorded = p.recorded ? `obs. ${p.recorded}` : "";

    return `
      <li class="py-1 px-1.5 rounded-lg bg-white/70 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 space-y-0.5 transition-colors hover:bg-white dark:hover:bg-slate-800">
        <div class="flex items-center justify-between gap-1.5">
          <div class="font-semibold text-slate-800 dark:text-slate-100 text-[10.5px] truncate flex items-center gap-1.5 flex-1 min-w-0">
            <span class="text-xs select-none flex-shrink-0" aria-hidden="true">${pType.emoji}</span>
            <span class="truncate" title="${esc(displayName)}">${esc(displayName)}</span>
          </div>
          <span class="text-[9px] font-medium text-slate-500 dark:text-slate-400 flex-shrink-0 px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-700/60">${esc(pType.label)}</span>
        </div>
        <div class="flex items-center gap-1.5 text-[9px] text-slate-500 dark:text-slate-400 flex-wrap">
          <span class="italic text-teal-700 dark:text-teal-400 font-medium">${esc(cleanSci)}</span>
          ${fam ? `<span>· ${esc(fam)}</span>` : ""}
          ${badge ? `<span class="px-1 py-0.2 rounded text-[8px] bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-medium">${esc(badge)}</span>` : ""}
          ${recorded ? `<span class="text-slate-400">· ${esc(recorded)}</span>` : ""}
        </div>
      </li>`;
  }).join("");

  const emptyMsg = `<li class="text-[10px] text-slate-400 italic py-2 text-center">No matching plants found in this category${searchQ ? ` for "${esc(searchQ)}"` : ""}.</li>`;

  const toggleBtn = filtered.length > 10 ? `
    <button type="button" id="localPlantShowAllBtn" class="text-[10px] font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer">
      ${isExpanded ? "Show fewer" : `Show all ${filtered.length} local species (${filtered.length - 10} more)`}
    </button>` : "";

  return `
    <div class="rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-slate-50/70 dark:bg-slate-800/40 p-2.5 space-y-1.5">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <span>🌿 Local Plants & Wild Flora (GBIF)</span>
        </h4>
        <span class="text-[9px] text-slate-400 font-medium">${plants.length} observed nearby</span>
      </div>
      <div id="farmLocalCategoryTabs" class="farm-scroll-tabs flex items-center gap-1.5 overflow-x-auto pb-1 mb-1.5">
        ${catChips}
      </div>
      <div class="relative">
        <input id="localPlantSearchInput" type="text" placeholder="Search local plants, trees, herbs..." value="${esc(searchQ)}" class="w-full text-[10px] px-2 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500" />
      </div>
      <ul class="space-y-0.5 text-[10px] text-slate-700 dark:text-slate-200 max-h-[160px] overflow-y-auto pr-1">
        ${rows || emptyMsg}
      </ul>
      <div class="flex items-center justify-between text-[9px] text-slate-400 pt-0.5">
        <span>Observed within ~25 km. Shows what naturally survives here.</span>
        ${toggleBtn}
      </div>
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
      <!-- 4-Depth Root Moisture Bars (Copernicus C3S / ECMWF) -->
      ${Array.isArray(ctx.soilDepths) && ctx.soilDepths.some(d => Number.isFinite(d.vwc)) ? `
      <div class="mt-2.5 p-2.5 bg-slate-100/60 dark:bg-slate-800/40 rounded-xl border border-slate-200/40 dark:border-slate-700/40 space-y-1.5">
        <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>4-Depth Root Moisture</span>
          <span class="text-[9px] text-emerald-600 dark:text-emerald-400 font-normal">Copernicus ECMWF</span>
        </div>
        ${ctx.soilDepths.map(d => {
          const val = Number.isFinite(d.vwc) ? Math.min(100, Math.round(d.vwc * 200)) : 0;
          const displayPct = Number.isFinite(d.vwc) ? `${(d.vwc * 100).toFixed(1)}%` : '--';
          const barColor = val < 20 ? 'bg-amber-500' : (val > 80 ? 'bg-blue-500' : 'bg-emerald-500');
          return `
          <div>
            <div class="flex justify-between text-[10px] mb-0.5">
              <span class="text-slate-600 dark:text-slate-300 font-medium">${esc(d.label)}</span>
              <span class="font-bold text-slate-700 dark:text-slate-200">${displayPct}</span>
            </div>
            <div class="w-full bg-slate-200 dark:bg-slate-700/60 h-1.5 rounded-full overflow-hidden">
              <div class="${barColor} h-1.5 rounded-full transition-all duration-300" style="width: ${val}%"></div>
            </div>
          </div>`;
        }).join('')}
      </div>` : ''}
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
  const crop = CROPS.find((c) => c.id === rec.cropId);
  if (!crop) return "";
  const locale = (typeof window !== "undefined" && window.app?.language) || detectLocale();
  const window = crop.sowMonthsForSite || getSowMonthsForHemisphere(crop, ctx.hemisphere) || crop.sowMonths;
  const inWindow = isMonthInWindow(ctx.month, window, 0);
  const until = monthsUntilWindow(ctx.month, window);
  const cropName = translateText(crop.name, locale);
  const cropCategory = translateText(crop.category, locale);
  const formattedMonths = Array.isArray(window) && window.length > 0
    ? window.map((m) => translateText(MONTH_SHORT[m - 1], locale) || MONTH_SHORT[m - 1]).join("-")
    : (translateText("outside seasonal envelope", locale) || "outside seasonal envelope");
  const sowWord = translateText("sow", locale) || "sow";
  const daysWord = translateText("days", locale) || "days";
  const localizedSowSched = `${sowWord} ${formattedMonths}${Number.isFinite(crop.duration) ? ` · ~${crop.duration} ${daysWord}` : ""}`;

  const offSeasonText = translateText("Off-season / Wrong climate", locale) || "Off-season / Wrong climate";
  const sowNowText = translateText("Sow now", locale) || t("farm_sow_now", locale) || "Sow now";
  const nextWindowPrefix = translateText("Next window in", locale) || "Next window in";
  const monthsWord = translateText("months", locale) || "months";
  const windowOpensNext = translateText("Window opens next month", locale) || "Window opens next month";
  const windowJustClosed = translateText("Window just closed", locale) || "Window just closed";

  const timing = !window.length
    ? `<span class="text-rose-600 dark:text-rose-400 font-semibold">${esc(offSeasonText)}</span>`
    : inWindow
      ? `<span class="text-emerald-700 dark:text-emerald-400 font-bold">✅ ${esc(sowNowText)}</span>`
      : until <= 1
        ? `<span class="text-amber-600 dark:text-amber-400 font-bold">🕐 ${esc(until === 1 ? windowOpensNext : windowJustClosed)}</span>`
        : `<span class="text-slate-500 dark:text-slate-400 font-semibold">⏳ ${esc(nextWindowPrefix)} ~${until} ${esc(monthsWord)}</span>`;
  const clim = classifyClimate(ctx.lat, ctx.elevation);
  const soils = crop.soils.map((s) => getSoil(s)?.name).filter(Boolean).join(" / ");
  const gdd = Number.isFinite(crop.duration) ? crop.duration : null;

  const howKeys = [
    [t("farm_sowing", locale) || "Sowing", crop.how.sow],
    [t("farm_spacing", locale) || "Spacing", crop.how.spacing],
    [t("farm_irrigation", locale) || "Irrigation", crop.how.irrigation],
    [t("farm_fertiliser", locale) || "Fertiliser", crop.how.fert],
    [t("farm_care", locale) || "Care", crop.how.care],
    [t("farm_harvest", locale) || "Harvest", crop.how.harvest],
  ];

  return `
    <details class="group rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white/80 dark:bg-slate-800/50 overflow-hidden">
      <summary class="flex items-center gap-2 p-2.5 cursor-pointer list-none select-none">
        <span class="text-lg leading-none">${esc(crop.emoji)}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">${esc(cropName)}</span>
            <span class="text-[9px] px-1.5 py-0.2 rounded-full font-medium bg-slate-100 dark:bg-slate-700/80 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-600/60">${esc(cropCategory)}</span>
            ${scoreBadge(rec.score)}
          </div>
          <div class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">${timing} · ${esc(localizedSowSched)}</div>
        </div>
        <svg class="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path d="M19 9l-7 7-7-7"/></svg>
      </summary>
      <div class="px-2.5 pb-2.5 space-y-2 border-t border-slate-200/60 dark:border-slate-700/50">
        <p class="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed pt-2">${esc(rec.verdict)}.</p>
        ${rec.constraints.length ? `
          <div class="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/50 p-2">
            <div class="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">${esc(t("farm_watch_outs") || "Watch-outs")}</div>
            <ul class="text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed space-y-0.5 list-disc pl-3">
              ${rec.constraints.map((c) => `<li>${esc(c)}</li>`).join("")}
            </ul>
          </div>` : ""}
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-lg bg-slate-100/70 dark:bg-slate-800/60 p-2">
            <div class="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">${esc(t("farm_where") || "Where")}</div>
            <div class="text-[10px] text-slate-700 dark:text-slate-200 leading-relaxed mt-0.5">
              ${esc(soils || "Adaptive")} · ${esc(clim.band)} · to ~${crop.altitude?.max ?? "?"} m
            </div>
          </div>
          <div class="rounded-lg bg-slate-100/70 dark:bg-slate-800/60 p-2">
            <div class="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">${esc(t("farm_needs") || "Needs")}</div>
            <div class="text-[10px] text-slate-700 dark:text-slate-200 leading-relaxed mt-0.5">
              ${crop.waterNeed === "high" ? "High" : crop.waterNeed === "medium" ? "Medium" : "Low"} water · ${crop.rainfall.min}-${crop.rainfall.max} mm/season${Number.isFinite(crop.frost) ? ` · frost limit ${crop.frost > 0 ? "+" : ""}${crop.frost}°C` : ""}
            </div>
          </div>
        </div>
        <div class="rounded-lg border border-emerald-200/60 dark:border-emerald-800/50 bg-emerald-50/60 dark:bg-emerald-950/30 p-2 space-y-1.5">
          <div class="text-[9px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">${esc(t("farm_how_to_grow") || "How to grow")}</div>
          ${howKeys.map(([k, v]) => `
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
  const bars = timeline.map((t) => {
    const barHeight = Math.max(4, Math.round((t.spray.score / 100) * 48));
    return `
      <div class="flex-1 flex items-end h-full min-w-0" title="${esc(t.day)} ${esc(t.hourLabel)} — ${esc(t.spray.label)} (${t.spray.score})${t.spray.reasons.length ? ` — ${esc(t.spray.reasons[0])}` : ""}">
        <div class="w-full rounded-t-sm transition-all hover:brightness-110" style="height:${barHeight}px;background:${t.spray.color}" title=""></div>
      </div>`;
  }).join("");

  const labels = timeline.map((t, i) => {
    const showLabel = i % 3 === 0;
    return `
      <div class="flex-1 text-center text-[7.5px] font-mono text-slate-400 truncate">
        ${showLabel ? esc(t.hourLabel) : ""}
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
        <!-- Uniform baseline for all 24 bars -->
        <div class="flex items-end gap-1 h-12 w-full">${bars}</div>
        <!-- Hour labels row aligned beneath corresponding bars -->
        <div class="flex items-center gap-1 mt-1 w-full">${labels}</div>
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
 * Dedicated presentation state when coordinates are located in open water,
 * ocean, sea, or marine water bodies with no arable soil.
 */
function renderMarineWaterState(ctx, waterCheck) {
  return `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">🌊 Marine Environment</h4>
        <span class="text-[10px] font-semibold text-sky-600 dark:text-sky-400">Open Water</span>
      </div>

      <div class="rounded-2xl border border-sky-300/70 dark:border-sky-800/70 bg-gradient-to-b from-sky-50/90 via-sky-100/50 to-white/90 dark:from-sky-950/50 dark:via-slate-900/60 dark:to-slate-900/80 p-5 text-center space-y-3.5 shadow-sm">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-sky-500/10 dark:bg-sky-400/10 flex items-center justify-center text-3xl shadow-inner border border-sky-200/50 dark:border-sky-800/50">
          🌊
        </div>
        <div class="space-y-1.5">
          <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-sky-100/80 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300">
            <span>⚓ Open Water / Marine Body</span>
          </div>
          <h3 class="text-base font-black text-slate-800 dark:text-slate-100">${esc(waterCheck.label)}</h3>
          <p class="text-[11px] text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
            ${esc(waterCheck.detail)}
          </p>
        </div>

        <div class="grid grid-cols-2 gap-2 text-left pt-1">
          <div class="bg-white/80 dark:bg-slate-800/70 p-2.5 rounded-xl border border-sky-200/60 dark:border-sky-900/50 shadow-xs">
            <div class="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Surface Temp</div>
            <div class="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">${ctx.siteTemp != null ? Math.round(ctx.siteTemp) + "°C" : "--"} (Water Surface)</div>
          </div>
          <div class="bg-white/80 dark:bg-slate-800/70 p-2.5 rounded-xl border border-sky-200/60 dark:border-sky-900/50 shadow-xs">
            <div class="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Surface Winds</div>
            <div class="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">${ctx.windNow != null ? Math.round(ctx.windNow) + " km/h" : "--"}</div>
          </div>
        </div>

        <div class="rounded-xl bg-sky-50/70 dark:bg-slate-800/60 border border-sky-200/50 dark:border-sky-800/40 p-3 text-left space-y-1.5">
          <div class="text-[10px] font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
            <span>🦪 Aquaculture & Mariculture Notice</span>
          </div>
          <p class="text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
            Terrestrial crops (vegetables, fruits, cereals, timber) require soil and cannot grow in ocean or lake waters. Coastal regions with similar marine temperatures often support seaweed farming (<em>Kappaphycus / Eucheuma</em>) or offshore cage aquaculture.
          </p>
          <div class="text-[10px] font-semibold text-teal-600 dark:text-teal-400 pt-1 flex items-center gap-1">
            <span>👉 Click or tap any landmass on the map to view arable soil data and crop planting recommendations.</span>
          </div>
        </div>
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

  const syncFarmLanguage = () => {
    const locale = a.language || detectLocale();
    translateDOM(panel, locale);
    if (a.activeWeatherTab === "farm") refreshExternalTranslation(locale);
  };

  if (a.selectedLat == null || a.selectedLng == null) {
    panel.innerHTML = farmEmptyState(a.language);
    syncFarmLanguage();
    return;
  }

  // Ensure farmCtx matches the current selected location
  const isStale =
    !a.farmCtx?.ok ||
    Math.abs((a.farmCtx.lat ?? 0) - a.selectedLat) > 0.01 ||
    Math.abs((a.farmCtx.lng ?? 0) - a.selectedLng) > 0.01;

  if (isStale && a.weatherData?.hourly?.time?.length) {
    a.farmCtx = buildSiteContext({
      weatherData: a.weatherData,
      soilId: a.farmSoil || getSavedSoil(),
      lat: a.selectedLat,
      lng: a.selectedLng,
      address: a.selectedAddress,
      hourIndex: typeof a.currentHourIndex === "number" ? a.currentHourIndex : undefined,
    });
    scheduleFarmUpdate(a, false);
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
    syncFarmLanguage();
    return;
  }

  const waterCheck = ctx.waterInfo || isWaterBodyLocation(ctx, a);
  if (waterCheck.isWater) {
    panel.innerHTML = renderMarineWaterState(ctx, waterCheck);
    syncFarmLanguage();
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
  const allRecs = recommendCrops(ctx);
  const activeCropCat = a.farmCropCategory || "all";

  const cropCats = [
    { id: "all", label: "All Plants", emoji: "🌱" },
    { id: "Vegetable", label: "Vegetables", emoji: "🥕" },
    { id: "Fruit", label: "Fruits", emoji: "🍎" },
    { id: "grain", label: "Grains & Pulses", emoji: "🌾" },
    { id: "Herb & Medicinal", label: "Herbs & Medicinal", emoji: "🌿" },
    { id: "Tree & Agroforestry", label: "Trees & Timber", emoji: "🌲" },
    { id: "flower-cover", label: "Flowers & Cover", emoji: "🌸" },
  ];

  const catPills = cropCats.map((c) => {
    const isActive = activeCropCat === c.id;
    const activeClass = isActive
      ? "bg-teal-600 text-white font-bold shadow-xs"
      : "bg-slate-200/70 hover:bg-slate-300/70 dark:bg-slate-700/60 dark:hover:bg-slate-600/70 text-slate-700 dark:text-slate-200";
    const catLoc = (typeof window !== "undefined" && window.app?.language) || detectLocale();
    const localizedLabel = translateText(c.label, catLoc);
    return `<button type="button" role="tab" aria-selected="${isActive ? "true" : "false"}" class="farm-cat-chip flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] whitespace-nowrap transition-all select-none cursor-pointer ${activeClass}" data-cat="${esc(c.id)}">${c.emoji} ${esc(localizedLabel)}</button>`;
  }).join("");

  let filteredRecs = allRecs;
  if (activeCropCat === "grain") {
    filteredRecs = allRecs.filter((r) => {
      const c = CROPS.find((cr) => cr.id === r.cropId);
      return c && (c.category === "Cereal" || c.category === "Pulse");
    });
  } else if (activeCropCat === "flower-cover") {
    filteredRecs = allRecs.filter((r) => {
      const c = CROPS.find((cr) => cr.id === r.cropId);
      return c && (c.category === "Flower & Ornamental" || c.category === "Cover & Forage");
    });
  } else if (activeCropCat !== "all") {
    filteredRecs = allRecs.filter((r) => {
      const c = CROPS.find((cr) => cr.id === r.cropId);
      return c && c.category === activeCropCat;
    });
  }

  const recs = filteredRecs.slice(0, 10);
  const gdd = sumGDD(
    { temperature_2m_max: ctx.nextDays.map((d) => d.tmax), temperature_2m_min: ctx.nextDays.map((d) => d.tmin) },
    10,
  );

  // Preserve horizontal scroll positions before re-rendering
  const prevCropTabsScroll = document.getElementById("farmCropCategoryTabs")?.scrollLeft;
  const prevLocalTabsScroll = document.getElementById("farmLocalCategoryTabs")?.scrollLeft;

  panel.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <h4 class="text-sm font-black text-slate-800 dark:text-white flex items-center gap-1.5">🌾 ${esc(translateText("Farm Mode", (typeof window !== "undefined" && window.app?.language) || detectLocale()))}</h4>
          ${renderFieldSelector(ctx, a)}
        </div>
        <button id="farmRefreshBtn" class="text-[10px] font-semibold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer">${esc(translateText("Refresh soil data", (typeof window !== "undefined" && window.app?.language) || detectLocale()))}</button>
      </div>
      ${renderRegionChip(ctx)}
      ${renderSiteSnapshot(ctx)}
      ${renderLocalPlants(ctx, a)}
      ${renderFarmAdvisories(advisories)}
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">${esc(translateText("What to grow here — ranked for this week", (typeof window !== "undefined" && window.app?.language) || detectLocale()))}</h4>
          <span class="text-[10px] text-slate-400 font-medium">${filteredRecs.length} ${esc(translateText("suitable", (typeof window !== "undefined" && window.app?.language) || detectLocale()))}</span>
        </div>
        <div id="farmCropCategoryTabs" role="tablist" aria-label="Crop categories" class="farm-scroll-tabs flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-2">
          ${catPills}
        </div>
        <div class="space-y-1.5">
          ${recs.map((r) => renderCropCard(ctx, r)).join("") || (
            filteredRecs.length === 0 && allRecs.length > 0
              ? `<div class="rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/40 p-3 text-center space-y-1">
                  <div class="text-xs font-bold text-slate-700 dark:text-slate-200">No suitable plants in this category this week</div>
                  <p class="text-[10px] text-slate-500 dark:text-slate-400">Current seasonal conditions favor other plant types at this location. Select "All Plants" to view all suitable flora.</p>
                </div>`
              : (Math.abs(ctx.lat || 0) >= 66 || (ctx.siteTemp != null && ctx.siteTemp <= -3) || (ctx.meanTempNext7 != null && ctx.meanTempNext7 <= -2))
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

  // Restore horizontal scroll position so clicking tabs doesn't reset scroll
  const newCropTabs = document.getElementById("farmCropCategoryTabs");
  if (newCropTabs && prevCropTabsScroll != null) {
    newCropTabs.scrollLeft = prevCropTabsScroll;
  }
  const newLocalTabs = document.getElementById("farmLocalCategoryTabs");
  if (newLocalTabs && prevLocalTabsScroll != null) {
    newLocalTabs.scrollLeft = prevLocalTabsScroll;
  }

  wireFarmControls(a);
  syncFarmLanguage();
}

/** Binds the soil picker, category filter chips, search input, and refresh button after each render. */
function wireFarmControls(app) {
  const a = app || appRef;
  const sel = document.getElementById("farmSoilSelect");
  if (sel) {
    sel.addEventListener("change", () => {
      saveSoil(sel.value);
      refreshFarmContext(a, { force: false });
    });
  }
  const btn = document.getElementById("farmRefreshBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      btn.textContent = "Refreshing…";
      refreshFarmContext(a, { force: true });
    });
  }

  // Wire horizontal drag & wheel scrolling on category tab containers
  function makeHorizontalScrollable(container) {
    if (!container || container._hasHScrollWired) return;
    container._hasHScrollWired = true;

    // Horizontal mouse wheel scrolling: translate deltaY to horizontal scroll
    container.addEventListener(
      "wheel",
      (e) => {
        if (e.deltaY !== 0 && Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
          e.preventDefault();
          container.scrollLeft += e.deltaY;
        }
      },
      { passive: false }
    );

    // Desktop drag-to-scroll interaction
    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasDragged = false;

    container.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDown = true;
      hasDragged = false;
      startX = e.pageX - container.offsetLeft;
      startScrollLeft = container.scrollLeft;
    });

    window.addEventListener("mouseup", () => {
      if (isDown) {
        isDown = false;
        container.classList.remove("dragging");
        setTimeout(() => {
          hasDragged = false;
        }, 80);
      }
    });

    container.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      const x = e.pageX - container.offsetLeft;
      const walk = x - startX;
      if (Math.abs(walk) > 4) {
        hasDragged = true;
        container.classList.add("dragging");
      }
      container.scrollLeft = startScrollLeft - walk;
    });

    // Suppress button click if user was dragging
    container.addEventListener(
      "click",
      (e) => {
        if (hasDragged) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );
  }

  makeHorizontalScrollable(document.getElementById("farmCropCategoryTabs"));
  makeHorizontalScrollable(document.getElementById("farmLocalCategoryTabs"));

  // Crop category filter chips
  const cropChips = document.querySelectorAll(".farm-cat-chip");
  cropChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const cat = chip.dataset.cat;
      if (cat && a) {
        a.farmCropCategory = cat;
        renderFarmTab(a);
        const activeChip = document.querySelector(`.farm-cat-chip[data-cat="${cat}"]`);
        activeChip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    });
  });

  // Local plants category filter chips
  const localChips = document.querySelectorAll(".farm-local-cat-chip");
  localChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const localCat = chip.dataset.localCat;
      if (localCat && a) {
        a.farmLocalPlantCategory = localCat;
        renderFarmTab(a);
        const activeLocalChip = document.querySelector(`.farm-local-cat-chip[data-local-cat="${localCat}"]`);
        activeLocalChip?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    });
  });

  // Local plants toggle show all / fewer
  const toggleBtn = document.getElementById("localPlantShowAllBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      if (a) {
        a.farmLocalPlantExpanded = !a.farmLocalPlantExpanded;
        renderFarmTab(a);
      }
    });
  }

  // Local plants search input
  const searchInput = document.getElementById("localPlantSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      if (a) {
        a.farmLocalPlantSearch = e.target.value;
        renderFarmTab(a);
        const refocused = document.getElementById("localPlantSearchInput");
        if (refocused) {
          refocused.focus();
          const len = refocused.value.length;
          refocused.setSelectionRange(len, len);
        }
      }
    });
  }

  // Field selector
  const fieldSelect = document.getElementById("farmFieldSelect");
  if (fieldSelect) {
    fieldSelect.addEventListener("change", () => {
      const val = fieldSelect.value;
      if (val === "__new__") {
        openFieldEditor(a, null);
      } else if (val === "__current__") {
        setActiveFieldId(null);
        refreshFarmContext(a, { force: false });
      } else {
        setActiveFieldId(val);
        const f = getField(val);
        if (f && typeof f.lat === "number" && typeof f.lng === "number") {
          if (typeof a.selectLocation === "function" && (f.lat !== a.selectedLat || f.lng !== a.selectedLng)) {
            a.selectLocation(f.lat, f.lng, f.name);
            return;
          }
        }
        refreshFarmContext(a, { force: false });
      }
    });
  }

  // Field edit button
  const editBtn = document.getElementById("farmFieldEditBtn");
  if (editBtn) {
    editBtn.addEventListener("click", () => {
      const activeId = getActiveFieldId();
      const field = activeId ? getField(activeId) : null;
      openFieldEditor(a, field);
    });
  }
}

/** Open the field editor modal. */
function openFieldEditor(app, field) {
  const a = app || appRef;
  const existing = document.getElementById("farmFieldEditor");
  if (existing) existing.remove();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = renderFieldEditor(field);
  document.body.appendChild(wrapper);

  const close = () => {
    const el = document.getElementById("farmFieldEditor");
    if (el) el.remove();
  };

  document.getElementById("farmFieldEditorClose")?.addEventListener("click", close);
  document.getElementById("farmFieldEditorCancel")?.addEventListener("click", close);
  wrapper.addEventListener("click", (e) => {
    if (e.target.id === "farmFieldEditor") close();
  });

  const deleteBtn = document.getElementById("farmFieldEditorDelete");
  if (deleteBtn && field) {
    deleteBtn.addEventListener("click", () => {
      if (confirm(`Are you sure you want to delete field "${field.name}"?`)) {
        removeField(field.id);
        setActiveFieldId(null);
        close();
        refreshFarmContext(a, { force: false });
      }
    });
  }

  const form = document.getElementById("farmFieldEditorForm");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("fieldName").value.trim();
    const cropId = document.getElementById("fieldCrop").value || null;
    const soilId = document.getElementById("fieldSoil").value || "loam";
    const sowingDate = document.getElementById("fieldSowingDate").value || null;
    const notes = document.getElementById("fieldNotes").value.trim();
    if (!name) return;
    const lat = a.selectedLat;
    const lng = a.selectedLng;
    if (field) {
      updateField(field.id, { name, cropId, soilId, soilSource: "manual", sowingDate, notes });
    } else {
      addField({ name, lat, lng, soilId, soilSource: "manual", sowingDate, cropId, notes });
    }
    setActiveFieldId(field ? field.id : undefined);
    close();
    refreshFarmContext(a, { force: false });
  });
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
  const locationChanged =
    !a.farmCtx ||
    Math.abs((a.farmCtx.lat ?? 0) - a.selectedLat) > 0.01 ||
    Math.abs((a.farmCtx.lng ?? 0) - a.selectedLng) > 0.01;

  // Immediate sync update so user sees fresh crops for the new location at once
  if (locationChanged && a.weatherData?.hourly?.time?.length) {
    a.farmCtx = buildSiteContext({
      weatherData: a.weatherData,
      soilId: a.farmSoil || getSavedSoil(),
      lat: a.selectedLat,
      lng: a.selectedLng,
      address: a.selectedAddress,
      hourIndex: typeof a.currentHourIndex === "number" ? a.currentHourIndex : undefined,
    });
    a.farmCtx.loadingLocalPlants = true;
    if (a.activeWeatherTab === "farm") renderFarmTab(a);
  }

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

      // ── Resolve soil texture: saved field → SoilGrids → saved default ──
      let soilId = getSavedSoil();
      let soilSource = "manual";
      let fieldId = getActiveFieldId();
      let field = null;
      if (fieldId) {
        field = getField(fieldId);
        if (field) {
          soilId = field.soilId;
          soilSource = field.soilSource;
        }
      }

      // If no field soil and no manual preference, try SoilGrids once.
      let soilGridsData = null;
      if (!field && soilId === getSavedSoil()) {
        const failedKey = `${SOILGRIDS_FALLBACK_KEY}_${agroCacheKey(a.selectedLat, a.selectedLng)}`;
        const alreadyFailed = localStorage.getItem(failedKey) === "true";
        if (!alreadyFailed) {
          try {
            soilGridsData = await fetchSoilGrids(a.selectedLat, a.selectedLng);
            if (soilGridsData) {
              soilId = soilGridsData.soilId;
              soilSource = "soilgrids";
            } else {
              localStorage.setItem(failedKey, "true");
            }
          } catch {
            localStorage.setItem(failedKey, "true");
          }
        }
      }

      const existingPlants = a.farmCtx?.localPlants;
      a.farmSoil = soilId;
      a.farmCtx = buildSiteContext({
        weatherData: a.weatherData,
        agroData: agro,
        soilId,
        lat: a.selectedLat,
        lng: a.selectedLng,
        address: a.selectedAddress,
        hourIndex: typeof a.currentHourIndex === "number" ? a.currentHourIndex : undefined,
        fieldId,
      });
      if (existingPlants) a.farmCtx.localPlants = existingPlants;
      a.farmCtx.loadingLocalPlants = true;
      if (a.activeWeatherTab === "farm") renderFarmTab(a);

      try {
        const plants = await fetchLocalPlants(a.selectedLat, a.selectedLng, {
          locationName: a.selectedName || a.selectedAddress || "",
        });
        if (a.farmCtx) {
          a.farmCtx.loadingLocalPlants = false;
          a.farmCtx.localPlants = plants || [];
          if (a.activeWeatherTab === "farm") renderFarmTab(a);
        }
      } catch {
        if (a.farmCtx) {
          a.farmCtx.loadingLocalPlants = false;
        }
      }
      maybeNotifyFrost(a, a.farmCtx);
    } catch (e) {
      console.warn("Farm Mode update failed:", e);
    }
  }, (force || locationChanged) ? 0 : 350);
}

/** Frost push with per-location cooldown — same shape as rainPush. */
function maybeNotifyFrost(app, ctx) {
  if (!ctx?.ok) return;
  notifyFrostForCtx(app, ctx);
  notifySprayWindow(app, ctx);
  notifyIrrigation(app, ctx);
}

/** Frost alert for a single context (ctx or any saved field). */
function notifyFrostForCtx(app, ctx) {
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
  const place = String(app.selectedName || ctx.region?.locality || "your field").split(/,\s*/)[0];
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

/** Spray window alert: good spray window opening within next 12h. */
function notifySprayWindow(app, ctx) {
  if (!ctx?.hourly || typeof ctx.hourIndex !== "number") return;
  const timeline = scoreSprayTimeline(ctx.hourly, ctx.vpdByTime, ctx.hourIndex, 12);
  const { best } = summarizeSprayWindows(timeline);
  if (!best || best.avgScore < 60) return;
  let last = {};
  try {
    last = JSON.parse(localStorage.getItem("aurafisky_spray_last") || "{}");
  } catch {
    last = {};
  }
  const key = `spray-${ctx.lat.toFixed(2)},${ctx.lng.toFixed(2)}`;
  const now = Date.now();
  if (typeof last[key] === "number" && now - last[key] < FARM_ALERT_COOLDOWN_MS) return;
  last[key] = now;
  try {
    localStorage.setItem("aurafisky_spray_last", JSON.stringify(last));
  } catch {
    /* storage unavailable */
  }
  const place = String(app.selectedName || ctx.region?.locality || "your field").split(/,\s*/)[0];
  try {
    app.showToast?.(`🌤️ Good spray window at ${place} — ${best.startLabel}, ~${best.endIdx - best.startIdx + 1}h.`, "success", 8000);
  } catch {
    /* toast optional */
  }
}

/** Irrigation alert: root zone dry or water balance urgent. */
function notifyIrrigation(app, ctx) {
  if (!ctx?.ok) return;
  const isDry = ctx.soilMoisture?.status === "dry";
  const wb = computeWaterBalance({ daily: ctx.daily, soilMoisture: ctx.soilMoisture || null });
  const isUrgent = wb.level === "urgent";
  if (!isDry && !isUrgent) return;
  let last = {};
  try {
    last = JSON.parse(localStorage.getItem("aurafisky_irrig_last") || "{}");
  } catch {
    last = {};
  }
  const key = `irrig-${ctx.lat.toFixed(2)},${ctx.lng.toFixed(2)}`;
  const now = Date.now();
  if (typeof last[key] === "number" && now - last[key] < FARM_ALERT_COOLDOWN_MS) return;
  last[key] = now;
  try {
    localStorage.setItem("aurafisky_irrig_last", JSON.stringify(last));
  } catch {
    /* storage unavailable */
  }
  const place = String(app.selectedName || ctx.region?.locality || "your field").split(/,\s*/)[0];
  const msg = isDry
    ? `Root zone dry at ${place} — irrigate now.`
    : `Water balance urgent at ${place} — ${wb.headline}`;
  try {
    app.showToast?.(`💧 ${msg}`, "warning", 8000);
  } catch {
    /* toast optional */
  }
}

/** Run proactive alerts for every saved field (multi-location monitoring). */
export function checkAllFieldsAlerts(app) {
  if (!app) return;
  const fields = loadFields();
  for (const field of fields) {
    // Reuse the current forecast context but with field's lat/lng — the
    // forecast is per-point so we can only alert for the currently loaded
    // location unless we refetch. Skip if not the same point.
    const ctx = app.farmCtx;
    if (!ctx || !ctx.ok) continue;
    const samePoint =
      Math.abs(ctx.lat - field.lat) < 0.01 && Math.abs(ctx.lng - field.lng) < 0.01;
    if (!samePoint) continue;
    notifyFrostForCtx(app, ctx);
    notifySprayWindow(app, ctx);
    notifyIrrigation(app, ctx);
  }
}

// ────────────────── feature entry ──────────────────

export function init(app) {
  appRef = app;

  app.farmSoil = getSavedSoil();
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
          scheduleFarmUpdate(this);
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


