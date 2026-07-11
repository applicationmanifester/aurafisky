// Feature: AI Weather Copilot — fully self-contained, offline-first natural-
// language Q&A over the current forecast. Runs entirely on-device from the
// data already fetched by WeatherService. No external agent, API, or backend.

let appRef = null;
let conversationHistory = []; // [{role, content, timestamp}]
const MAX_HISTORY = 8; // keep last 4 exchanges

export function init(app) {
  appRef = app;
  const btn = document.getElementById("copilotBtn");
  if (btn) btn.addEventListener("click", openCopilot);
  // Listen for unit changes to clear cached responses
  window.addEventListener("storage", (e) => {
    if (e.key === "units") conversationHistory = [];
  });
}

function ensureModal() {
  if (document.getElementById("copilotModal")) return;
  const m = document.createElement("div");
  m.id = "copilotModal";
  m.className =
    "fixed inset-0 z-[9999] hidden items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto";
  m.innerHTML = `
    <div class="glass rounded-2xl p-5 max-w-md w-full mx-4 shadow-2xl border border-slate-200/30 dark:border-slate-600/30 flex flex-col gap-3 max-h-[85vh]">
      <div class="flex items-center justify-between flex-shrink-0">
        <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          🤖 Weather Copilot
          <span id="copilotStatus" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-500">RULES</span>
        </h3>
        <div class="flex items-center gap-1">
          <button id="copilotClear" class="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-600/40 text-[10px] text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors" title="Clear conversation" aria-label="Clear conversation">🗑️</button>
          <button id="copilotClose" class="p-1 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-600/40" aria-label="Close">✕</button>
        </div>
      </div>

      <div id="copilotLogWrapper" class="relative flex-1 min-h-[200px] overflow-hidden">
        <div id="copilotLog" class="text-xs text-slate-600 dark:text-slate-300 h-full overflow-y-auto custom-scrollbar space-y-2 min-h-[200px]"></div>
        <!-- Scroll-to-bottom button -->
        <button id="scrollToBottom" class="hidden absolute bottom-3 right-3 z-10 p-2 rounded-full glass shadow-lg text-primary hover:bg-primary/10 transition-all" aria-label="Scroll to bottom">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V4"/></svg>
        </button>
      </div>

      <!-- Quick Action Chips -->
      <div id="quickActions" class="flex flex-wrap gap-1.5 flex-shrink-0 hidden"></div>

      <div class="flex gap-2 flex-shrink-0">
        <button id="copilotVoice" class="p-2 rounded-lg bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200/60 dark:hover:bg-slate-600/40 transition-colors" aria-label="Voice input" title="Voice input">
          <svg class="w-5 h-5 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
        </button>
        <input id="copilotInput" class="flex-1 min-w-0 bg-transparent border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm outline-none" placeholder="Ask about the weather…" />
        <button id="copilotSend" class="px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">Ask</button>
      </div>

      <p id="copilotHint" class="text-[10px] text-slate-400 text-center hidden"></p>
    </div>
  `;
  document.body.appendChild(m);

  m.addEventListener("click", (e) => {
    if (e.target === m) closeCopilot();
  });
  m.querySelector("#copilotClose").addEventListener("click", closeCopilot);
  m.querySelector("#copilotClear").addEventListener("click", clearConversation);
  m.querySelector("#copilotSend").addEventListener("click", send);
  m.querySelector("#copilotVoice").addEventListener("click", toggleVoice);
  m.querySelector("#copilotInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  m.querySelector("#copilotInput").addEventListener(
    "input",
    debounce(renderQuickActions, 150),
  );

  // Scroll-to-bottom button logic
  const log = document.getElementById("copilotLog");
  const scrollBtn = document.getElementById("scrollToBottom");
  if (log && scrollBtn) {
    log.addEventListener("scroll", () => {
      const nearBottom =
        log.scrollHeight - log.scrollTop - log.clientHeight < 50;
      scrollBtn.classList.toggle("hidden", nearBottom);
    });
    scrollBtn.addEventListener("click", () => {
      log.scrollTop = log.scrollHeight;
    });
    // Auto-scroll on new messages
    new MutationObserver(() => {
      if (log.scrollHeight - log.scrollTop - log.clientHeight < 50) {
        log.scrollTop = log.scrollHeight;
      }
    }).observe(log, { childList: true, subtree: true });
  }
}

function clearConversation() {
  conversationHistory = [];
  const log = document.getElementById("copilotLog");
  if (log) log.innerHTML = "";
  // Show a brief confirmation
  if (window.toastModule) {
    window.toastModule.show("Conversation cleared", "info", 2000);
  }
  updateHint();
  renderQuickActions();
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function openCopilot() {
  ensureModal();
  const m = document.getElementById("copilotModal");
  m.classList.remove("hidden");
  m.classList.add("flex");
  const i = document.getElementById("copilotInput");
  if (i) i.focus();
  updateHint();
  renderQuickActions();
  renderHistory();
}

function closeCopilot() {
  const m = document.getElementById("copilotModal");
  m.classList.add("hidden");
  m.classList.remove("flex");
}

function updateHint() {
  const hint = document.getElementById("copilotHint");
  if (!hint) return;
  const w = appRef?.weatherData;
  if (!w) {
    hint.textContent = "Select a location first to ask about its weather.";
    hint.classList.remove("hidden");
    return;
  }
  hint.textContent =
    "📋 Rule-based — try: rain, wind, UV, outfit, bike, compare, pollen, astronomy | 💬 Multi-turn supported";
  hint.classList.remove("hidden");
}

function renderQuickActions() {
  const container = document.getElementById("quickActions");
  if (!container) return;
  const w = appRef?.weatherData;
  if (!w) {
    container.classList.add("hidden");
    return;
  }

  const idx = appRef.currentHourIndex || 0;
  const h =
    typeof WeatherService !== "undefined" && WeatherService.getHourlyAtIndex
      ? WeatherService.getHourlyAtIndex(w, idx)
      : {};
  const actions = [];

  if ((h.precipProb ?? 0) > 30)
    actions.push({ label: "☔ Rain details", query: "Will it rain and when?" });
  if ((h.uvIndex ?? 0) > 5)
    actions.push({
      label: "☀️ UV advice",
      query: "Do I need sunscreen today?",
    });
  if ((h.windSpeed ?? 0) > 20)
    actions.push({
      label: "💨 Wind impact",
      query: "Is it too windy for cycling?",
    });
  const aqi = appRef.airQualityData?.hourly?.us_aqi?.[idx];
  if (aqi && aqi > 100)
    actions.push({
      label: "😷 Air quality",
      query: "How bad is the air quality?",
    });
  const comfort =
    typeof WeatherService !== "undefined" && WeatherService.getComfortIndex
      ? WeatherService.getComfortIndex(h, aqi)
      : null;
  if (comfort != null && comfort < 60)
    actions.push({
      label: "🌡️ Comfort tips",
      query: "How can I stay comfortable outside?",
    });
  actions.push({
    label: "🕐 Best time out",
    query: "When is the best time to go outside today?",
  });
  actions.push({
    label: "🌙 Astronomy",
    query: "When is sunset and moon phase?",
  });

  container.innerHTML = actions
    .slice(0, 6)
    .map(
      (a) =>
        `<button class="quick-chip px-2.5 py-1 text-[11px] rounded-full bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition" data-query="${escapeHtml(a.query)}">${a.label}</button>`,
    )
    .join("");
  container.classList.remove("hidden");

  container.querySelectorAll(".quick-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      send(btn.dataset.query);
    });
  });
}

function renderHistory() {
  const log = document.getElementById("copilotLog");
  if (!log) return;
  log.innerHTML = "";
  conversationHistory.forEach((msg) => addMsg(msg.role, msg.content, false));
}

function addMsg(role, text, persist = true) {
  const log = document.getElementById("copilotLog");
  if (!log) return;
  const d = document.createElement("div");
  d.className = role === "user" ? "text-right" : "text-left";
  d.innerHTML = `<span class="inline-block rounded-lg px-2.5 py-1.5 max-w-[85%] ${
    role === "user"
      ? "bg-primary/10 text-primary"
      : "bg-slate-100 dark:bg-slate-700/50 text-slate-700 dark:text-slate-200"
  }">${escapeHtml(text)}</span>`;
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
  if (persist) {
    conversationHistory.push({
      role: role === "user" ? "user" : "assistant",
      content: text,
      timestamp: Date.now(),
    });
    if (conversationHistory.length > MAX_HISTORY * 2)
      conversationHistory = conversationHistory.slice(-MAX_HISTORY * 2);
  }
  return d;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => {
    const map = { "&": "&", "<": "<", ">": ">", '"': '"', "'": "'" };
    return map[c];
  });
}

async function send(query) {
  // If first arg is an event (click handler), extract query from input or data attr
  if (query && typeof query === "object" && "preventDefault" in query) {
    const btn = query.currentTarget || query.target;
    const dataQuery = btn?.dataset?.query;
    if (dataQuery) query = dataQuery;
    else query = null;
  }
  const input = document.getElementById("copilotInput");
  const q = query || input?.value.trim();
  if (!q) return;
  if (input) input.value = "";
  addMsg("user", q);
  const answer = await answerQuestion(q);
  if (answer) addMsg("assistant", answer);
}

async function answerQuestion(q) {
  // Pure rule-based, no LLM
  return ruleBased(q);
}

// ============ ENHANCED RULE-BASED ENGINE ============

function ruleBased(q) {
  const w = appRef.weatherData;
  const aqiData = appRef.airQualityData;
  const name = appRef.selectedName || "this location";
  if (!w) return "Select a location first to ask about its weather.";
  const idx = appRef.currentHourIndex || 0;
  const h =
    typeof WeatherService !== "undefined" && WeatherService.getHourlyAtIndex
      ? WeatherService.getHourlyAtIndex(w, idx)
      : {};
  const t = h.temperature;
  const desc = h.description || "";
  const ql = q.toLowerCase();
  const units =
    typeof WeatherService !== "undefined" && WeatherService.getUnits
      ? WeatherService.getUnits()
      : "metric";

  // Intent classification (keyword-based, fast)
  const intents = classifyIntent(ql);

  // Rain / precipitation
  if (intents.rain) {
    const prob = h.precipProb != null ? h.precipProb : "unknown";
    const amt =
      h.precipitation != null
        ? formatPrecip(h.precipitation, units)
        : "unknown";
    const later = findNextRain(idx);
    let msg = `Right now: ${prob}% chance of rain, amount ${amt}. ${desc}.`;
    if (later) msg += ` Next rain around ${later.time} (${later.prob}%).`;
    else msg += " No rain expected in the next 24h.";
    if (prob > 50) msg += " Bring an umbrella.";
    return msg;
  }

  // Wind
  if (intents.wind) {
    const dir =
      h.windDirection != null &&
      typeof WeatherService !== "undefined" &&
      WeatherService.getWindDirection
        ? WeatherService.getWindDirection(h.windDirection)
        : "";
    const gust =
      h.windGusts != null ? `, gusts ${formatWind(h.windGusts, units)}` : "";
    const speed = formatWind(h.windSpeed, units);
    let msg = `Wind: ${speed} ${dir}${gust}.`;
    if (h.windSpeed > 30) msg += " 🌬️ Strong — secure loose items.";
    else if (h.windSpeed > 15) msg += " 🍃 Breezy.";
    else msg += " 😌 Light.";
    return msg;
  }

  // Temperature / outfit
  if (intents.temp) {
    const feel =
      h.feelsLike != null ? formatTemp(h.feelsLike, units) : "unknown";
    let advice = "";
    if (t != null) {
      const tempC = units === "imperial" ? ((t - 32) * 5) / 9 : t;
      if (tempC < 5) advice = " ❄️ Heavy coat, hat, gloves.";
      else if (tempC < 12) advice = " 🧥 Warm jacket recommended.";
      else if (tempC < 20) advice = " 👕 Light jacket or sweater.";
      else if (tempC < 27) advice = " 👕 T-shirt weather.";
      else advice = " ☀️ Light clothes, stay hydrated.";
    }
    return `Currently ${formatTemp(t, units)} (feels like ${feel}), ${desc} at ${name}.${advice}`;
  }

  // UV / sun
  if (intents.uv) {
    const uv = h.uvIndex != null ? h.uvIndex.toFixed(1) : "unknown";
    const maxUv = w.daily?.uv_index_max?.[0];
    return (
      `UV index now: ${uv}${maxUv != null ? ` (today's max: ${maxUv})` : ""}.` +
      (h.uvIndex > 5
        ? " 🧴 High — wear sunscreen, hat, seek shade midday."
        : h.uvIndex > 2
          ? " 🌤️ Moderate — sunscreen if outside long."
          : " ☁️ Low.")
    );
  }

  // Outdoor activity
  if (intents.activity) {
    const window =
      typeof WeatherService !== "undefined" &&
      WeatherService.findBestOutdoorWindow
        ? WeatherService.findBestOutdoorWindow(w, idx)
        : null;
    const wind = h.windSpeed || 0;
    const prob = h.precipProb || 0;
    return (
      `For outdoor activity at ${name}: ${formatTemp(t, units)}, ${desc}, wind ${formatWind(wind, units)}, rain ${prob}%. ` +
      (prob > 40 || wind > 25 ? "⚠️ Not ideal — " : "✅ Good conditions. ") +
      (window
        ? `Best window: ${WeatherService.formatHourLabel(w.hourly.time[window.startIdx])}–${WeatherService.formatHourLabel(w.hourly.time[window.endIdx])} (${window.hours}h, avg ${formatTemp(window.avgTemp, units)}, no rain).`
        : "No clear dry window in next 24h.")
    );
  }

  // Humidity / comfort
  if (intents.humidity) {
    const comfort =
      typeof WeatherService !== "undefined" && WeatherService.getComfortIndex
        ? WeatherService.getComfortIndex(h, aqiData?.hourly?.us_aqi?.[idx])
        : null;
    const label =
      comfort != null &&
      typeof WeatherService !== "undefined" &&
      WeatherService.getComfortLabel
        ? WeatherService.getComfortLabel(comfort)
        : "";
    const dew = h.dewPoint != null ? formatTemp(h.dewPoint, units) : "?";
    return (
      `Humidity: ${h.humidity ?? "?"}% | Dew point: ${dew} | Comfort: ${comfort != null ? comfort + "/100 (" + label + ")" : "?"}.` +
      (comfort != null && comfort < 50
        ? " Feels unpleasant — stay hydrated."
        : "")
    );
  }

  // Pressure / tendency
  if (intents.pressure) {
    const tend =
      typeof WeatherService !== "undefined" &&
      WeatherService.getPressureTendency
        ? WeatherService.getPressureTendency(w, idx)
        : null;
    const pressureStr =
      h.pressure != null ? formatPressure(h.pressure, units) : "?";
    return (
      `Pressure: ${pressureStr}. ` +
      (tend
        ? `Tendency: ${tend.label} (${tend.change > 0 ? "+" : ""}${tend.change.toFixed(1)} hPa/h).`
        : "No tendency data.")
    );
  }

  // Clouds / visibility
  if (intents.clouds) {
    return `Cloud cover: ${h.cloudCover ?? "?"}% | Visibility: ${h.visibility != null ? (h.visibility / 1000).toFixed(1) + " km" : "?"}. ${desc}.`;
  }

  // Astronomy
  if (intents.astronomy) {
    const sr = w.daily?.sunrise?.[0];
    const ss = w.daily?.sunset?.[0];
    const moon =
      typeof WeatherService !== "undefined" && WeatherService.getMoonPhase
        ? WeatherService.getMoonPhase(new Date())
        : null;
    return (
      `Sunrise: ${sr ? sr.slice(11, 16) : "?"} | Sunset: ${ss ? ss.slice(11, 16) : "?"}` +
      (sr && ss
        ? ` | Daylight: ${Math.round((new Date(ss) - new Date(sr)) / 3.6e6)}h`
        : "") +
      (moon
        ? ` | Moon: ${moon.icon} ${moon.label} (${Math.round(moon.phase * 100)}%)`
        : "")
    );
  }

  // Air quality
  if (intents.aqi) {
    const val = aqiData?.hourly?.us_aqi?.[idx];
    const info =
      val != null &&
      typeof WeatherService !== "undefined" &&
      WeatherService.getAQIInfo
        ? WeatherService.getAQIInfo(val)
        : { label: "Unknown" };
    const pm25 = aqiData?.hourly?.pm2_5?.[idx];
    const pm10 = aqiData?.hourly?.pm10?.[idx];
    const o3 = aqiData?.hourly?.ozone?.[idx];
    return `AQI: ${val != null ? Math.round(val) + " (" + info.label + ")" : "?"} | PM2.5: ${pm25 != null ? pm25.toFixed(1) : "?"} | PM10: ${pm10 != null ? pm10.toFixed(1) : "?"} | O₃: ${o3 != null ? o3.toFixed(1) : "?"} µg/m³.`;
  }

  // Pollen
  if (intents.pollen) {
    const birch = aqiData?.hourly?.birch_pollen?.[idx];
    const grass = aqiData?.hourly?.grass_pollen?.[idx];
    const mug = aqiData?.hourly?.mugwort_pollen?.[idx];
    const alder = aqiData?.hourly?.alder_pollen?.[idx];
    const level = (v) =>
      v == null
        ? "?"
        : typeof WeatherService !== "undefined" && WeatherService.getPollenLevel
          ? WeatherService.getPollenLevel(v).level
          : v;
    return `Pollen — Birch: ${level(birch)} | Grass: ${level(grass)} | Mugwort: ${level(mug)} | Alder: ${level(alder)}.`;
  }

  // Model ensemble / compare
  if (intents.compare && appRef._ensembleReady) {
    return "Open the Model Ensemble section in the weather panel to see ECMWF/GFS/ICON agreement, spread, and rain probability.";
  }

  // Time-specific forecast
  if (intents.time) {
    return showUpcomingHours(idx);
  }

  // Default: current snapshot + suggestions
  return (
    `At ${name}: ${formatTemp(t, units)} (feels ${formatTemp(h.feelsLike, units)}), ${desc}. ` +
    `Wind ${formatWind(h.windSpeed, units)} | Rain ${h.precipProb != null ? h.precipProb + "%" : "?"} | Humidity ${h.humidity ?? "?"}% | UV ${h.uvIndex != null ? h.uvIndex.toFixed(1) : "?"}. ` +
    `Ask about: rain, wind, temperature, outfit, bike/run, UV, humidity, pressure, clouds, sunrise/sunset, moon, air quality, pollen, or "best time to go out".`
  );
}

function classifyIntent(ql) {
  return {
    rain: /rain|precip|umbrella|wet|shower|drizzle|storm|pour|downpour/.test(
      ql,
    ),
    wind: /wind|breez|gust|blow|airy/.test(ql),
    temp: /temp|hot|cold|warm|wear|clothes|dress|outfit|jacket|coat|freez|chill/.test(
      ql,
    ),
    uv: /uv|sun|sunscreen|burn|tan|sunburn|spf/.test(ql),
    activity:
      /bike|cycle|run|walk|outdoor|jog|hike|sport|tennis|golf|swim|surf/.test(
        ql,
      ),
    humidity: /humid|muggy|sticky|dew|comfort|miserable/.test(ql),
    pressure: /pressure|barometer|tendency|rising|falling|baro/.test(ql),
    clouds: /cloud|overcast|clear|sky|visib|fog|mist|haze/.test(ql),
    astronomy: /sunrise|sunset|daylight|day.length|moon|phase|lunar/.test(ql),
    aqi: /air|quality|aqi|pollution|pm2|pm10|ozone|smog|breathe/.test(ql),
    pollen: /pollen|allergy|hay.fever|birch|grass|mugwort|alder/.test(ql),
    compare: /compare|ensemble|model|gfs|ecmwf|icon|agreement|spread/.test(ql),
    time: /at|when|time|hour|later|tonight|tomorrow|morning|evening/.test(ql),
  };
}

function findNextRain(startIdx) {
  const w = appRef.weatherData;
  if (!w?.hourly) return null;
  const h = w.hourly;
  for (let i = startIdx + 1; i < Math.min(startIdx + 24, h.time.length); i++) {
    if ((h.precipitation_probability?.[i] ?? 0) > 30) {
      return {
        time: WeatherService.formatHourLabel(h.time[i]),
        prob: h.precipitation_probability[i],
      };
    }
  }
  return null;
}

function showUpcomingHours(startIdx) {
  const w = appRef.weatherData;
  if (!w?.hourly) return "No hourly data.";
  const h = w.hourly;
  const lines = [];
  for (let i = startIdx; i < Math.min(startIdx + 12, h.time.length); i++) {
    const code = h.weather_code?.[i] ?? 0;
    const info =
      typeof WeatherService !== "undefined" && WeatherService.getWeatherInfo
        ? WeatherService.getWeatherInfo(code, h.is_day?.[i] === 1)
        : { icon: "?", description: "?" };
    lines.push(
      `${WeatherService.formatHourLabel(h.time[i])} ${info.icon} ${h.temperature_2m[i]}°C ${h.precipitation_probability[i]}% 💨${h.wind_speed_10m[i]}km/h`,
    );
  }
  return "Next 12h:\n" + lines.join("\n");
}

// Unit formatting helpers (mirror WeatherService)
function formatTemp(c, units) {
  if (c == null) return "?";
  return units === "imperial"
    ? Math.round((c * 9) / 5 + 32) + "°F"
    : Math.round(c) + "°C";
}
function formatWind(kmh, units) {
  if (kmh == null) return "?";
  return units === "imperial"
    ? Math.round(kmh * 0.621371) + " mph"
    : Math.round(kmh) + " km/h";
}
function formatPrecip(mm, units) {
  if (mm == null) return "?";
  return units === "imperial"
    ? (mm * 0.0393701).toFixed(2) + " in"
    : mm.toFixed(1) + " mm";
}
function formatPressure(hpa, units) {
  if (hpa == null) return "?";
  return units === "imperial"
    ? (hpa * 0.02953).toFixed(2) + " inHg"
    : Math.round(hpa) + " hPa";
}

function toggleVoice() {
  const btn = document.getElementById("copilotVoice");
  const input = document.getElementById("copilotInput");
  if (!btn || !input) return;

  if (window.SpeechRecognition || window.webkitSpeechRecognition) {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";
    btn.classList.add("bg-primary/20", "text-primary");
    btn.innerHTML =
      '<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14.1 6.7 11H4c0 4.42 3.58 8 8 8s8-3.58 8-8h-2.7z"/></svg>';

    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      input.value = finalTranscript + interim;
    };
    recognition.onend = () => {
      btn.classList.remove("bg-primary/20", "text-primary");
      btn.innerHTML =
        '<svg class="w-5 h-5 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>';
      if (finalTranscript.trim()) send(finalTranscript.trim());
    };
    recognition.onerror = () => recognition.onend();
    recognition.start();
  } else {
    if (window.toastModule)
      window.toastModule.show(
        "Voice input not supported in this browser",
        "warning",
      );
  }
}
