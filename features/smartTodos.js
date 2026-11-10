// features/smartTodos.js
// ── SMART TO-DOS ────────────────────────────────────────────────────
//
// Turns the already-loaded forecast into 3–4 actionable nudges for today:
// carry an umbrella, sunscreen, laundry day, water the plants, secure the
// balcony, cover the plants before frost. The daily-utility half of
// stickiness: the card answers "what should I DO about this weather?".
//
// Same constraints as the other decision features:
//   * Zero extra API calls — computed from the forecast already on `app`.
//   * Pull-based: rendered whenever a fresh forecast lands.
//   * Each todo can carry an optional alert payload that reuses the
//     existing alert rules engine (one tap → "tell me when this changes").
//   * Pure logic is exported for unit tests without DOM or WeatherService.

export const SMART_TODOS_MAX = 4;

/**
 * Compute today's smart to-dos from forecast numbers.
 *
 * @param {object} m - metric bundle
 *   {temperature, feelsLike, humidity, windSpeed, gusts, uvIndex,
 *    prob6h, prob24h, precip24h, aqi}
 * @returns {Array<{icon:string,title:string,why:string,alert?:{type:string,condition:string,value:number}}>}
 */
export function computeTodos(m) {
  if (!m || typeof m !== "object") return [];
  const out = [];
  const temp = m.temperature;
  const humidity = m.humidity;
  const wind = m.windSpeed ?? 0;
  const gusts = m.gusts ?? 0;
  const uv = m.uvIndex ?? 0;
  const prob6 = m.prob6h ?? 0;
  const prob24 = m.prob24h ?? 0;
  const precip24 = m.precip24h ?? 0;
  const aqi = m.aqi;

  // Rain → umbrella. Highest daily value, listed first.
  if (prob6 >= 50 || precip24 >= 5) {
    out.push({
      icon: "☔",
      title: "Carry an umbrella",
      why: `${Math.round(prob6)}% rain risk in the next 6 hours`,
    });
  }

  // UV → sun protection.
  if (uv >= 6) {
    out.push({
      icon: "🧴",
      title: "Sunscreen before you head out",
      why: `UV ${Math.round(uv)} — SPF 30+ and a hat near midday`,
    });
  }

  // Frost → plant care.
  if (temp != null && temp <= 2) {
    out.push({
      icon: "🧤",
      title: "Cover the plants tonight",
      why: "Near-freezing air — frost-sensitive plants need cover",
    });
  }

  // Dry + breezy + no rain → laundry day.
  if (
    humidity != null &&
    humidity <= 55 &&
    wind <= 20 &&
    prob24 < 40 &&
    temp != null &&
    temp >= 8
  ) {
    out.push({
      icon: "👕",
      title: "Great laundry day",
      why: "Dry air with a light breeze — clothes will dry fast outside",
    });
  }

  // No rain expected → water the plants / fill up.
  if (precip24 < 1 && humidity != null && humidity < 65 && temp != null && temp >= 5) {
    out.push({
      icon: "💧",
      title: "Water the plants today",
      why: "No meaningful rain in the next 24 hours",
    });
  }

  // Calm + dry + mild → car wash.
  if (prob24 < 30 && wind <= 22 && temp != null && temp >= 5 && temp <= 35) {
    out.push({
      icon: "🚗",
      title: "Good day to wash the car",
      why: "Dry and calm through tomorrow — it will stay clean",
    });
  }

  // Strong gusts → secure the balcony.
  if (gusts >= 40) {
    out.push({
      icon: "🌬️",
      title: "Secure loose objects outside",
      why: `Gusts up to ${Math.round(gusts)} km/h — chairs, umbrellas, bins`,
    });
  }

  // Poor air → move workouts inside.
  if (aqi != null && aqi > 100) {
    out.push({
      icon: "😶‍🌫️",
      title: "Limit hard outdoor effort",
      why: `Air quality is ${Math.round(aqi)} AQI — move intense workouts indoors`,
      alert: { type: "aqi", condition: "above", value: 100 },
    });
  }

  return out.slice(0, SMART_TODOS_MAX);
}

// ────────────────── runtime ──────────────────

let appRef = null;

function ensureCard() {
  if (document.getElementById("smartTodosCard")) return;
  const host = document.getElementById("todaySummarySection");
  if (!host) return;
  const card = document.createElement("div");
  card.id = "smartTodosCard";
  card.className = "hidden";
  card.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <h4 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Smart to-dos</h4>
      <span class="text-[9px] text-slate-400 font-medium">from today's forecast</span>
    </div>
    <div id="smartTodosList" class="space-y-1.5"></div>`;
  host.parentNode.insertBefore(card, host.nextSibling);
}

function renderTodos(app) {
  ensureCard();
  const card = document.getElementById("smartTodosCard");
  const list = document.getElementById("smartTodosList");
  if (!card || !list) return;

  const wd = app.weatherData;
  const S = globalThis.WeatherService;
  if (!wd?.hourly || !S) {
    card.classList.add("hidden");
    return;
  }

  const idx =
    typeof app.currentHourIndex === "number"
      ? app.currentHourIndex
      : S.getCurrentHourIndex(wd, wd.utc_offset_seconds || 0);
  const curr = S.getHourlyAtIndex(wd, idx);
  if (!curr) {
    card.classList.add("hidden");
    return;
  }

  const prob = wd.hourly.precipitation_probability || [];
  const mm = wd.hourly.precipitation || [];
  const slice = (arr, start, len) =>
    arr.slice(start, start + len).filter((n) => typeof n === "number");
  const prob6 = slice(prob, idx, 6);
  const prob24 = slice(prob, idx, 24);

  // Today's row for 24h rain total.
  const dateKey = (wd.hourly.time[idx] || "").slice(0, 10);
  const dIdx = wd.daily?.time ? wd.daily.time.indexOf(dateKey) : -1;
  const precip24 = dIdx >= 0 ? (wd.daily.precipitation_sum?.[dIdx] ?? 0) : 0;
  const aqi = app.airQualityData?.hourly?.us_aqi?.[idx];

  const todos = computeTodos({
    temperature: curr.temperature,
    feelsLike: curr.feelsLike,
    humidity: curr.humidity,
    windSpeed: curr.windSpeed,
    gusts: curr.windGusts,
    uvIndex: curr.uvIndex,
    prob6h: prob6.length ? Math.max(...prob6) : 0,
    prob24h: prob24.length ? Math.max(...prob24) : 0,
    precip24h: precip24,
    aqi: typeof aqi === "number" ? aqi : null,
  });

  if (!todos.length) {
    card.classList.add("hidden");
    return;
  }

  list.textContent = "";
  for (const todo of todos) {
    const row = document.createElement("div");
    row.className =
      "flex items-center gap-2.5 bg-slate-100/70 dark:bg-slate-800/60 rounded-xl px-3 py-2 border border-slate-200/40 dark:border-slate-700/40";

    const icon = document.createElement("span");
    icon.className = "text-base flex-shrink-0";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = todo.icon;

    const text = document.createElement("div");
    text.className = "min-w-0 flex-1";
    const title = document.createElement("div");
    title.className = "text-xs font-bold text-slate-800 dark:text-slate-100 truncate";
    title.textContent = todo.title;
    const why = document.createElement("div");
    why.className = "text-[10px] text-slate-500 dark:text-slate-400 truncate";
    why.textContent = todo.why;
    text.append(title, why);

    row.append(icon, text);

    if (todo.alert) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "text-[10px] font-bold px-2 py-1.5 rounded-lg bg-primary/10 text-primary dark:bg-primary-light/15 dark:text-primary-light hover:bg-primary/20 transition-colors flex-shrink-0";
      btn.textContent = "🔔 Alert me";
      btn.setAttribute(
        "aria-label",
        `Set an alert for: ${todo.title}`,
      );
      btn.addEventListener("click", () => {
        app.addAlertRule?.(todo.alert.type, todo.alert.condition, todo.alert.value);
      });
      row.appendChild(btn);
    }

    list.appendChild(row);
  }

  card.classList.remove("hidden");

  // Localize newly created smart-todo DOM nodes for the active app locale
  const curLang = app?.language || (typeof localStorage !== "undefined" ? localStorage.getItem("aurafisky_lang") : null) || "en";
  if (curLang && curLang !== "en" && typeof window !== "undefined" && window.aurafiskyI18n?.translateDOM) {
    window.aurafiskyI18n.translateDOM(card, curLang);
    window.aurafiskyI18n.refreshExternalTranslation?.(curLang);
  }
}

export function init(app) {
  appRef = app;
  app.renderSmartTodos = () => renderTodos(app);

  // Re-render whenever a fresh forecast lands (same additive wrap pattern).
  const originalUpdate =
    typeof app.updateWeatherDisplay === "function" ? app.updateWeatherDisplay : null;
  if (originalUpdate && !originalUpdate.__smartTodosWrapped) {
    const wrapped = function (...args) {
      const result = originalUpdate.apply(this, args);
      try {
        renderTodos(this);
      } catch (e) {
        console.warn("Smart todos render failed:", e);
      }
      return result;
    };
    wrapped.__smartTodosWrapped = true;
    app.updateWeatherDisplay = wrapped;
  }

  try {
    renderTodos(app);
  } catch {
    /* data not ready yet */
  }
}
