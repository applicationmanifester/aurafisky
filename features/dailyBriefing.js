import { t, detectLocale, translateText } from "../modules/i18n.js";
// features/dailyBriefing.js
// ── DAILY BRIEFING ──────────────────────────────────────────────────
//
// The once-a-day habit loop: a rich "your day ahead" card at the top of the
// Overview tab, generated once per location per day, plus an optional timed
// morning notification.
//
// Why this drives retention: weather apps win when they give a reason to
// open them daily. The briefing answers "do I need to plan around the
// weather today?" in one glance, personalised per saved location, and the
// notification lands at a time the user picks (default 8:00).
//
// Constraints:
//   * Zero extra API calls — built from the forecast + analyses already on
//     the app (comfort, best window, advisories, golden hour, rain timing).
//   * Generated once per location per day and cached in localStorage, so
//     re-renders are free and stable.
//   * Notification: opt-out by default-on only AFTER the user has granted
//     permission elsewhere (alerts panel / rain push). The sweep runs on a
//     15-minute interval while the app is open; true background delivery
//     rides the existing periodicsync path later.
//   * Pure helpers exported for unit tests.

export const BRIEFING_PREF_KEY = "aurafisky_briefing_pref_hour";
export const BRIEFING_NOTIFY_KEY = "aurafisky_briefing_notify_enabled";
export const BRIEFING_FIRED_KEY = "aurafisky_briefing_fired";
export const DEFAULT_BRIEFING_HOUR = 8;
const SWEEP_INTERVAL_MS = 15 * 60 * 1000;

// ────────────────── pure helpers ──────────────────

/** localStorage key that scopes a generated briefing to a place + day. */
export function briefingStoreKey(dateKey, locKey) {
  return `aurafisky_briefing_${locKey}_${dateKey}`;
}

/**
 * Whether the morning notification should fire now.
 * Fires once per day, at/after the user's preferred hour.
 */
export function shouldFireNotification(lastFiredDateKey, todayKey, hourNow, prefHour = DEFAULT_BRIEFING_HOUR) {
  if (!todayKey) return false;
  if (lastFiredDateKey === todayKey) return false;
  return typeof hourNow === "number" && hourNow >= prefHour && hourNow < prefHour + 6;
}

/**
 * Build the briefing card view from prepared inputs. Pure — the runtime
 * gathers numbers from WeatherService, this only shapes prose.
 *
 * @param {object} d
 *   {placeName, temperature, feelsLike, description, icon, prob6h, prob24h,
 *    firstRainTime|null, bestWindow|null|{startTime,endTime,hours,overnight},
 *    todayMax, todayMin, sunrise, sunset, comfort, comfortLabel,
 *    advisoryTitle|null, aqi, goldenLabel, goldenStart, goldenEnd}
 * @returns {{icon:string, headline:string, bullets:Array, note:string}}
 */
export function buildBriefingView(d, loc) {
  const curLang = loc || (typeof window !== "undefined" && (window.app?.language || localStorage.getItem("aurafisky_lang"))) || detectLocale();
  if (!d || d.temperature == null) {
    return {
      icon: "🌤️",
      headline: translateText("Briefing unavailable", curLang) || "Briefing unavailable",
      bullets: [],
      note: ""
    };
  }
  const bullets = [];

  const rightNowLabel = translateText("Right now", curLang) || "Right now";
  const desc = translateText(d.description, curLang) || d.description;
  const feelsWord = translateText("feels", curLang) || "feels";
  bullets.push({
    k: rightNowLabel,
    v: `${d.icon} ${desc} · ${Math.round(d.temperature)}° (${feelsWord} ${Math.round(d.feelsLike ?? d.temperature)}°)`,
  });

  if (d.todayMax != null && d.todayMin != null) {
    bullets.push({
      k: translateText("Today's range", curLang) || "Today's range",
      v: `${Math.round(d.todayMin)}° – ${Math.round(d.todayMax)}°`,
    });
  }

  if (d.prob24h != null) {
    const rainLabel = translateText("Rain", curLang) || "Rain";
    const planAround = translateText("chance within 6 hours — plan around it", curLang) || "chance within 6 hours — plan around it";
    const lowConcern = translateText("peak over 24h — low concern", curLang) || "peak over 24h — low concern";
    bullets.push({
      k: rainLabel,
      v: d.prob6h >= 50
        ? `${Math.round(d.prob6h)}% ${planAround}`
        : `${Math.round(d.prob24h)}% ${lowConcern}`,
      tone: d.prob6h >= 50 ? "warn" : "good",
    });
  }

  if (d.bestWindow) {
    const bestWindowLabel = translateText("Best outdoor window", curLang) || "Best outdoor window";
    const overnightLabel = translateText("overnight", curLang) || "overnight";
    const span = d.bestWindow.overnight
      ? `${d.bestWindow.startTime} – ${d.bestWindow.endTime} (${overnightLabel})`
      : `${d.bestWindow.startTime} – ${d.bestWindow.endTime}`;
    bullets.push({
      k: bestWindowLabel,
      v: `${span} (${d.bestWindow.hours}h)`,
      tone: "good",
    });
  }

  if (d.sunrise && d.sunset) {
    bullets.push({
      k: translateText("Daylight", curLang) || "Daylight",
      v: `${d.sunrise} – ${d.sunset}`
    });
  }

  if (d.goldenLabel && d.goldenStart && d.goldenEnd) {
    bullets.push({
      k: translateText(d.goldenLabel, curLang) || d.goldenLabel,
      v: `${d.goldenStart} – ${d.goldenEnd}`
    });
  }

  if (d.advisoryTitle) {
    bullets.push({
      k: translateText("Watch out", curLang) || "Watch out",
      v: translateText(d.advisoryTitle, curLang) || d.advisoryTitle,
      tone: "warn"
    });
  }

  if (d.comfort != null) {
    const comfortLabel = translateText("Comfort", curLang) || "Comfort";
    const cValLabel = d.comfortLabel ? ` · ${translateText(d.comfortLabel, curLang) || d.comfortLabel}` : "";
    bullets.push({
      k: comfortLabel,
      v: `${Math.round(d.comfort)}/100${cValLabel}`,
      tone: d.comfort >= 70 ? "good" : "warn",
    });
  }

  // Headline: the single most decision-relevant sentence for today.
  let headline;
  const overnightSuffix = translateText("overnight", curLang) || "overnight";
  const windowSpan = d.bestWindow
    ? d.bestWindow.overnight
      ? `${d.bestWindow.startTime}–${d.bestWindow.endTime} ${overnightSuffix}`
      : `${d.bestWindow.startTime}–${d.bestWindow.endTime}`
    : null;
  if (d.firstRainTime) {
    const rainExpected = translateText("Rain expected around", curLang) || "Rain expected around";
    const keepUmbrella = translateText("keep the umbrella handy", curLang) || "keep the umbrella handy";
    headline = `${rainExpected} ${d.firstRainTime} — ${keepUmbrella}.`;
  } else if (windowSpan) {
    const bestTime = translateText("Best time to be outside", curLang) || "Best time to be outside";
    headline = `${bestTime}: ${windowSpan}.`;
  } else if (d.advisoryTitle) {
    const advTitle = translateText(d.advisoryTitle, curLang) || d.advisoryTitle;
    const planAcc = translateText("plan accordingly", curLang) || "plan accordingly";
    headline = `${advTitle} — ${planAcc}.`;
  } else {
    headline = `A calm, ${d.description.toLowerCase()} day ahead.`;
  }

  const note = d.aqi != null && d.aqi > 100
    ? (translateText("Air quality is poor today — sensitive groups should take it easy outside.", curLang) || "Air quality is poor today — sensitive groups should take it easy outside.")
    : (translateText("Generated from your live forecast — regenerated once a day.", curLang) || "Generated from your live forecast — regenerated once a day.");

  return { icon: d.icon || "🌤️", headline, bullets, note };
}

// ────────────────── module state ──────────────────

let appRef = null;
let _sweepTimer = null;

function readPrefHour() {
  try {
    const raw = localStorage.getItem(BRIEFING_PREF_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 && n <= 23 ? n : DEFAULT_BRIEFING_HOUR;
  } catch {
    return DEFAULT_BRIEFING_HOUR;
  }
}

function notifyEnabled() {
  try {
    const raw = localStorage.getItem(BRIEFING_NOTIFY_KEY);
    return raw === null ? true : raw === "true"; // default ON once permission granted
  } catch {
    return true;
  }
}

function writeNotifyEnabled(v) {
  try {
    localStorage.setItem(BRIEFING_NOTIFY_KEY, v ? "true" : "false");
  } catch {
    /* storage unavailable */
  }
}

function loadFiredMap() {
  try {
    const raw = localStorage.getItem(BRIEFING_FIRED_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function todayKey() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function locKey(name) {
  return String(name || "location")
    .toLowerCase()
    .split(/,\s*/)
    .slice(0, 2)
    .join("|");
}

function fmtHour(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
}

// ────────────────── card rendering ──────────────────

function ensureCard() {
  if (document.getElementById("dailyBriefingCard")) return;
  const host = document.getElementById("weatherTabOverview");
  if (!host) return;
  const card = document.createElement("div");
  card.id = "dailyBriefingCard";
  card.className = "hidden";
  card.setAttribute("aria-label", "Daily weather briefing");
  host.insertBefore(card, host.firstChild);
}

function gatherData() {
  const app = appRef;
  const S = globalThis.WeatherService;
  const wd = app?.weatherData;
  if (!S || !wd?.hourly?.time?.length) return null;

  const idx =
    typeof app.currentHourIndex === "number"
      ? app.currentHourIndex
      : S.getCurrentHourIndex(wd, wd.utc_offset_seconds || 0);
  const curr = S.getHourlyAtIndex(wd, idx);
  if (!curr) return null;

  const prob = wd.hourly.precipitation_probability || [];
  const slice = (arr, start, len) =>
    arr.slice(start, start + len).filter((n) => typeof n === "number");
  const prob6 = slice(prob, idx, 6);
  const prob24 = slice(prob, idx, 24);

  // First rain time today (within 12h).
  let firstRainTime = null;
  for (let i = idx; i < Math.min(idx + 12, wd.hourly.time.length); i++) {
    if ((wd.hourly.precipitation?.[i] ?? 0) > 0.1 || (prob[i] ?? 0) >= 60) {
      firstRainTime = fmtHour(wd.hourly.time[i]);
      break;
    }
  }

  const dateKey = (wd.hourly.time[idx] || "").slice(0, 10);
  const dIdx = wd.daily?.time ? wd.daily.time.indexOf(dateKey) : -1;
  const todayMax = dIdx >= 0 ? wd.daily.temperature_2m_max?.[dIdx] : null;
  const todayMin = dIdx >= 0 ? wd.daily.temperature_2m_min?.[dIdx] : null;
  const sunrise = dIdx >= 0 ? fmtHour(wd.daily.sunrise?.[dIdx]) : null;
  const sunset = dIdx >= 0 ? fmtHour(wd.daily.sunset?.[dIdx]) : null;

  const aqi = app.airQualityData?.hourly?.us_aqi?.[idx];
  const comfort = S.getComfortIndex ? S.getComfortIndex(curr, typeof aqi === "number" ? aqi : null) : null;
  const comfortLabel =
    comfort != null && S.getComfortLabel ? S.getComfortLabel(comfort, curr)?.label : null;
  const bestWindow = S.findBestOutdoorWindow ? S.findBestOutdoorWindow(wd, idx) : null;
  const advisories = S.getAdvisories ? S.getAdvisories(curr, typeof aqi === "number" ? aqi : null) : [];

  let golden = null;
  if (S.getGoldenBlueHourWindows && dIdx >= 0) {
    golden = S.getGoldenBlueHourWindows(
      wd.daily.sunrise?.[dIdx],
      wd.daily.sunset?.[dIdx],
      new Date(),
    );
  }

  const placeName = String(app.selectedName || "").split(/,\s*/)[0];
  return {
    placeName,
    temperature: curr.temperature,
    feelsLike: curr.feelsLike,
    description: curr.description || "",
    icon: curr.icon || "🌤️",
    prob6h: prob6.length ? Math.max(...prob6) : 0,
    prob24h: prob24.length ? Math.max(...prob24) : 0,
    firstRainTime,
    bestWindow: bestWindow
      ? {
          startTime: fmtHour(bestWindow.startTime) || "",
          endTime: fmtHour(bestWindow.endTime) || "",
          hours: bestWindow.hours,
          overnight: (() => {
            try {
              const sh = new Date(bestWindow.startTime).getHours();
              const eh = new Date(bestWindow.endTime).getHours();
              return Number.isFinite(sh) && Number.isFinite(eh) && sh > eh;
            } catch {
              return false;
            }
          })(),
        }
      : null,
    todayMax,
    todayMin,
    sunrise,
    sunset,
    comfort,
    comfortLabel,
    advisoryTitle: advisories.length ? advisories[0].title : null,
    aqi: typeof aqi === "number" ? aqi : null,
    goldenLabel: golden?.label || null,
    goldenStart: golden ? fmtHour(golden.start.toISOString()) : null,
    goldenEnd: golden ? fmtHour(golden.end.toISOString()) : null,
  };
}

function renderCard(view) {
  ensureCard();
  const card = document.getElementById("dailyBriefingCard");
  if (!card) return;

  const curLang = (typeof window !== "undefined" && (window.app?.language || localStorage.getItem("aurafisky_lang"))) || detectLocale();

  card.setAttribute("lang", curLang || "en");
  card.textContent = "";
  const inner = document.createElement("div");
  inner.className =
    "rounded-2xl p-3.5 border bg-gradient-to-br from-primary/10 to-cyan-500/5 border-primary/20 dark:border-primary/25";

  const head = document.createElement("div");
  head.className = "flex items-center gap-2 mb-1.5";
  const icon = document.createElement("span");
  icon.className = "text-base";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = view.icon;
  const title = document.createElement("span");
  title.className = "text-[10px] font-bold uppercase tracking-wider text-primary dark:text-primary-light";
  title.textContent = translateText("Today's briefing", curLang) || "Today's briefing";
  head.append(icon, title);

  const headline = document.createElement("p");
  headline.className = "text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug";
  headline.textContent = translateText(view.headline, curLang) || view.headline;

  inner.append(head, headline);

  if (view.bullets?.length) {
    const list = document.createElement("div");
    list.className = "mt-2 space-y-1";
    for (const b of view.bullets.slice(0, 5)) {
      const row = document.createElement("div");
      row.className = "flex items-baseline gap-1.5";
      const k = document.createElement("span");
      k.className = "text-[10px] font-semibold text-slate-400 dark:text-slate-500 flex-shrink-0";
      k.textContent = translateText(b.k, curLang) || b.k;
      const v = document.createElement("span");
      v.className = "text-[11px] text-slate-600 dark:text-slate-300 truncate";
      if (b.tone === "warn") v.classList.add("text-amber-600", "dark:text-amber-400");
      if (b.tone === "good") v.classList.add("text-emerald-600", "dark:text-emerald-400");
      v.textContent = translateText(b.v, curLang) || b.v;
      row.append(k, v);
      list.appendChild(row);
    }
    inner.appendChild(list);
  }

  if (view.note) {
    const note = document.createElement("p");
    note.className = "text-[9px] text-slate-400 dark:text-slate-500 mt-2";
    note.textContent = translateText(view.note, curLang) || view.note;
    inner.appendChild(note);
  }

  card.appendChild(inner);
  card.classList.remove("hidden");
  if (curLang !== "en" && typeof window !== "undefined" && window.aurafiskyI18n?.translateDOM) {
    window.aurafiskyI18n.translateDOM(card, curLang);
    window.aurafiskyI18n.refreshExternalTranslation?.(curLang);
  }
}

/**
 * Generate (or re-show today's cached) briefing for the current location.
 * @param {boolean} [force] rebuild even if today's copy exists
 */
function renderDailyBriefing(force = false) {
  const app = appRef || this;
  if (!app) return;
  const data = gatherData();
  if (!data) return;

  const curLang = app.language || (typeof window !== "undefined" && window.app?.language) || detectLocale();
  const dateKey = todayKey();
  const key = briefingStoreKey(locKey(app.selectedName), `${dateKey}_${curLang}`);
  let view = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw && !force) view = JSON.parse(raw);
  } catch {
    view = null;
  }
  if (!view) {
    view = buildBriefingView(data, curLang);
    try {
      localStorage.setItem(key, JSON.stringify(view));
    } catch {
      /* storage full — still render live */
    }
  }
  renderCard(view);
}

// ────────────────── morning notification ──────────────────

function fireMorningNotificationIfDue() {
  const app = appRef;
  if (!app) return false;
  if (!notifyEnabled()) return false;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;

  const now = new Date();
  const dateKey = todayKey();
  const fired = loadFiredMap();
  const lastForLoc = fired[locKey(app.selectedName)];

  if (!shouldFireNotification(lastForLoc?.date || lastForLoc, dateKey, now.getHours(), readPrefHour())) {
    return false;
  }

  const view = buildBriefingView(gatherData() || {});
  try {
    new Notification(`🌤️ ${view.headline}`, {
      body: `Your briefing for ${String(app.selectedName || "").split(/,\s*/)[0]} is ready in Aurafisky.`,
      tag: `aurafisky-briefing-${locKey(app.selectedName)}-${dateKey}`,
      icon: "/icon-192.png",
    });
  } catch {
    return false;
  }
  fired[locKey(app.selectedName)] = { date: dateKey, at: now.getTime() };
  try {
    localStorage.setItem(BRIEFING_FIRED_KEY, JSON.stringify(fired));
  } catch {
    /* storage unavailable */
  }
  return true;
}

function startSweep() {
  if (_sweepTimer) return;
  _sweepTimer = setInterval(() => {
    try {
      fireMorningNotificationIfDue();
    } catch {
      /* non-fatal */
    }
  }, SWEEP_INTERVAL_MS);
}

/** Public API */

function toggleBriefingNotify(force) {
  const next = typeof force === "boolean" ? force : !notifyEnabled();
  writeNotifyEnabled(next);
  if (next) {
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
      Notification.requestPermission?.().then((p) => {
        appRef?.showToast?.(
          p === "granted"
            ? "📅 Morning briefings will notify you."
            : "Permission denied — briefings stay in the panel only.",
          p === "granted" ? "success" : "info",
        );
      });
    } else {
      appRef?.showToast?.("📅 Morning briefings enabled.", "success");
    }
  } else {
    appRef?.showToast?.("Morning briefing notifications turned off.", "info");
  }
  return next;
}

export function init(app) {
  appRef = app;

  app.renderDailyBriefing = renderDailyBriefing;
  app.toggleBriefingNotify = toggleBriefingNotify;
  app.briefingNotifyEnabled = () => notifyEnabled();

  // Render (or re-show today's cached) briefing whenever a forecast lands.
  const originalUpdate =
    typeof app.updateWeatherDisplay === "function" ? app.updateWeatherDisplay : null;
  if (originalUpdate && !originalUpdate.__briefingWrapped) {
    const wrapped = function (...args) {
      const result = originalUpdate.apply(this, args);
      try {
        renderDailyBriefing.call(this);
      } catch (e) {
        console.warn("Daily briefing render failed:", e);
      }
      return result;
    };
    wrapped.__briefingWrapped = true;
    app.updateWeatherDisplay = wrapped;
  }

  try {
    renderDailyBriefing.call(app);
  } catch {
    /* data not ready */
  }
  if (typeof document !== "undefined") {
    startSweep();
    // Catch the "opened after 8am" case on load.
    setTimeout(() => {
      try {
        fireMorningNotificationIfDue();
      } catch {
        /* non-fatal */
      }
    }, 4000);
  }
}
