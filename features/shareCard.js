// -- SHARE AS IMAGE (canvas weather card) --
//
// The existing Share modal sends *text*. This adds a second, more visual
// option: render the current conditions + a 7-day strip onto a canvas and
// hand back a PNG the user can post anywhere.
//
// Everything visual is derived from data already in memory (this.weatherData),
// so no network work happens here. The pure helpers below (pickGradient,
// conditionEmoji, buildStatItems, formatCardDate, buildCardModel) are exported
// for unit testing; drawWeatherCard only needs a 2D context.

export const CARD_WIDTH = 1000;
export const CARD_HEIGHT = 1250;

/** WMO weather-code → gradient palette. */
const GRADIENTS = [
  { test: (c) => c === 0 || c === 1, from: "#f59e0b", to: "#f97316", dark: false }, // clear
  { test: (c) => c === 2 || c === 3, from: "#60a5fa", to: "#3b82f6", dark: false }, // cloudy
  { test: (c) => c === 45 || c === 48, from: "#94a3b8", to: "#64748b", dark: false }, // fog
  { test: (c) => c >= 51 && c <= 57, from: "#38bdf8", to: "#0ea5e9", dark: false }, // drizzle
  { test: (c) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82), from: "#0ea5e9", to: "#1e40af", dark: true }, // rain
  { test: (c) => c >= 71 && c <= 77, from: "#bae6fd", to: "#64748b", dark: false }, // snow
  { test: (c) => c >= 85 && c <= 86, from: "#cbd5e1", to: "#475569", dark: false }, // snow showers
  { test: (c) => c >= 95, from: "#4c1d95", to: "#1e1b4b", dark: true }, // thunderstorm
];

/**
 * Choose a background gradient for a weather code.
 * @param {number} weatherCode WMO code
 * @returns {{from:string,to:string,dark:boolean}}
 */
export function pickGradient(weatherCode) {
  const code = Number.isFinite(weatherCode) ? weatherCode : 0;
  return GRADIENTS.find((g) => g.test(code)) || GRADIENTS[1];
}

/** Emoji for a WMO code (day/night aware), independent of WeatherService. */
export function conditionEmoji(weatherCode, isDay = true) {
  const c = Number.isFinite(weatherCode) ? weatherCode : 0;
  if (c === 0) return isDay ? "☀️" : "🌙";
  if (c === 1) return isDay ? "🌤️" : "🌙";
  if (c === 2) return isDay ? "⛅" : "☁️";
  if (c === 3) return "☁️";
  if (c === 45 || c === 48) return "🌫️";
  if (c >= 51 && c <= 57) return "🌦️";
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return "🌧️";
  if (c >= 71 && c <= 77) return "❄️";
  if (c >= 85 && c <= 86) return "🌨️";
  if (c >= 95) return "⛈️";
  return "🌡️";
}

/**
 * Build the four headline stat chips shown under the temperature.
 * @param {object} weather getHourlyAtIndex() result
 * @param {{temp?:(n:number)=>string, wind?:(n:number)=>string}} [fmt]
 */
export function buildStatItems(weather, fmt) {
  const f = fmt || {};
  const temp = typeof f.temp === "function" ? f.temp : (n) => `${Math.round(n)}°`;
  const wind = typeof f.wind === "function" ? f.wind : (n) => `${Math.round(n)} km/h`;
  const items = [];
  if (weather?.feelsLike != null) items.push({ label: "Feels like", value: temp(weather.feelsLike) });
  if (weather?.humidity != null) items.push({ label: "Humidity", value: `${Math.round(weather.humidity)}%` });
  if (weather?.windSpeed != null) items.push({ label: "Wind", value: wind(weather.windSpeed) });
  if (weather?.precipProb != null) items.push({ label: "Rain", value: `${Math.round(weather.precipProb)}%` });
  return items.slice(0, 4);
}

/** Format a Date as "Fri, 25 Sep · 1:37 AM". */
export function formatCardDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} · ${h}:${mm} ${ampm}`;
}

/**
 * Assemble the draw model from raw app data. Pure — no canvas, no globals.
 */
export function buildCardModel({ placeName, timeLabel, weather, daily }) {
  const code = weather?.weatherCode ?? 0;
  const days = Array.isArray(daily)
    ? daily.slice(0, 7).map((d) => ({
        label: d.label || "",
        emoji: conditionEmoji(d.weatherCode, true),
        maxText: d.maxText != null ? d.maxText : "",
        minText: d.minText != null ? d.minText : "",
      }))
    : [];
  return {
    placeName: placeName || "Unknown location",
    timeLabel: timeLabel || "",
    emoji: conditionEmoji(code, weather?.isDay !== false),
    tempText: weather?.tempText || "",
    descText: weather?.description || "",
    stats: buildStatItems(weather, weather?.fmt),
    days,
    gradient: pickGradient(code),
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    brand: "Aurafisky",
    tagline: "Live weather explorer",
  };
}

const FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

function measure(ctx, text) {
  return ctx.measureText(text).width;
}

function truncate(ctx, text, maxWidth) {
  if (measure(ctx, text) <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && measure(ctx, t + "…") > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawStatChips(ctx, stats, box, ink, inkSoft) {
  if (!stats || !stats.length) return;
  const gap = 20;
  const chipW = (box.width - gap * (stats.length - 1)) / stats.length;
  const chipH = 150;
  stats.forEach((s, i) => {
    const x = box.x + i * (chipW + gap);
    roundRect(ctx, x, box.y, chipW, chipH, 24);
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.28)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = inkSoft;
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText(String(s.label).toUpperCase(), x + chipW / 2, box.y + 58);
    ctx.fillStyle = ink;
    ctx.font = `700 42px ${FONT}`;
    ctx.fillText(s.value || "--", x + chipW / 2, box.y + 116);
    ctx.textAlign = "left";
  });
}

function drawDayStrip(ctx, days, box, ink, inkSoft) {
  if (!days || !days.length) return;
  const gap = 14;
  const colW = (box.width - gap * (days.length - 1)) / days.length;
  const colH = 170;
  days.forEach((d, i) => {
    const x = box.x + i * (colW + gap);
    roundRect(ctx, x, box.y, colW, colH, 20);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = inkSoft;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillText(d.label || "", x + colW / 2, box.y + 44);

    ctx.font = `54px ${FONT}`;
    ctx.fillStyle = ink;
    ctx.fillText(d.emoji || "", x + colW / 2, box.y + 108);

    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = inkSoft;
    ctx.fillText(`${d.maxText || "--"} / ${d.minText || "--"}`, x + colW / 2, box.y + 148);
    ctx.textAlign = "left";
  });
}

/** Draw the card model onto a canvas' 2D context. */
export function drawWeatherCard(ctx, model) {
  const { width, height } = model;
  const g = model.gradient;

  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, g.from);
  bg.addColorStop(1, g.to);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const onDark = g.dark;
  const ink = onDark ? "#ffffff" : "#0f172a";
  const inkSoft = onDark ? "rgba(255,255,255,.82)" : "rgba(15,23,42,.68)";

  ctx.textBaseline = "alphabetic";

  // Brand row
  ctx.fillStyle = ink;
  ctx.font = `700 40px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(model.brand || "", 64, 96);
  ctx.fillStyle = inkSoft;
  ctx.font = `400 26px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(model.timeLabel || "", width - 64, 96);

  // Location
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = `800 58px ${FONT}`;
  ctx.fillText(truncate(ctx, model.placeName || "", width - 128), 64, 205);

  // Big emoji
  ctx.font = `200px ${FONT}`;
  ctx.fillText(model.emoji || "", 56, 470);

  // Temperature (right aligned)
  ctx.fillStyle = ink;
  ctx.font = `800 180px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(model.tempText || "--°", width - 64, 460);

  // Description
  ctx.textAlign = "left";
  ctx.fillStyle = inkSoft;
  ctx.font = `500 42px ${FONT}`;
  ctx.fillText(model.descText || "", 64, 545);

  // Stat chips
  drawStatChips(ctx, model.stats, { x: 64, y: 620, width: width - 128 }, ink, inkSoft);

  // Divider
  ctx.strokeStyle = onDark ? "rgba(255,255,255,.28)" : "rgba(15,23,42,.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, height - 330);
  ctx.lineTo(width - 64, height - 330);
  ctx.stroke();

  // Strip heading
  ctx.fillStyle = ink;
  ctx.font = `700 30px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText("7-DAY FORECAST", 64, height - 280);

  // Day strip
  drawDayStrip(ctx, model.days, { x: 64, y: height - 250, width: width - 128 }, ink, inkSoft);

  // Footer
  ctx.fillStyle = inkSoft;
  ctx.font = `400 24px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(model.tagline || "", 64, height - 48);
}

// ────────────────── app integration ──────────────────

/**
 * Build the card model from the app's live state.
 * Mirrors features/share.js's handling of getDailyForecast's leading history.
 */
function modelFromApp(app) {
  const WS = globalThis.WeatherService;
  if (!app.weatherData || !WS) return null;

  const idx =
    typeof app.currentHourIndex === "number"
      ? app.currentHourIndex
      : WS.getCurrentHourIndex(app.weatherData, app.weatherData?.utc_offset_seconds || 0);
  const w = WS.getHourlyAtIndex(app.weatherData, idx);
  if (!w) return null;

  const dailyRaw = WS.getDailyForecast(app.weatherData) || [];
  // getDailyForecast leads with PAST_DAYS of history; start at today.
  const todayStr = new Date().toISOString().split("T")[0];
  const todayIdx = dailyRaw.findIndex((d) => d.date === todayStr);
  const startDay = todayIdx >= 0 ? todayIdx : WS.PAST_DAYS ?? 0;
  const week = dailyRaw.slice(startDay, startDay + 7);

  return buildCardModel({
    placeName: app.selectedName,
    timeLabel: formatCardDate(new Date()),
    weather: {
      weatherCode: w.weatherCode,
      isDay: w.isDay,
      tempText: WS.formatTemp(w.temperature),
      description: w.description,
      feelsLike: w.feelsLike,
      humidity: w.humidity,
      windSpeed: w.windSpeed,
      precipProb: w.precipProb,
      fmt: {
        temp: (n) => WS.formatTemp(n),
        wind: (n) => WS.formatWind(n),
      },
    },
    daily: week.map((d) => ({
      label: WS.formatDayLabel(d.date),
      weatherCode: d.weatherCode,
      maxText: WS.formatTemp(d.maxTemp),
      minText: WS.formatTemp(d.minTemp),
    })),
  });
}

/** Render the current conditions to a PNG blob. Resolves to null on failure. */
function renderCardBlob(app) {
  return new Promise((resolve) => {
    try {
      const model = modelFromApp(app);
      if (!model) {
        resolve(null);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = CARD_WIDTH;
      canvas.height = CARD_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      drawWeatherCard(ctx, model);
      if (canvas.toBlob) {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      } else {
        // Very old engines: fall back to a data URL.
        resolve(canvas.toDataURL("image/png"));
      }
    } catch (e) {
      console.warn("Share-card render failed:", e);
      resolve(null);
    }
  });
}

function downloadBlob(app, blob, filename) {
  try {
    const url = typeof blob === "string" ? blob : URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "aurafisky-weather.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (typeof blob !== "string") setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) {
    app.showToast("Could not save the image.", "error");
    return false;
  }
}

function cardFilename(app) {
  const place = (app.selectedName || "weather")
    .split(",")[0]
    .trim()
    .replace(/[^\w-]+/g, "-")
    .toLowerCase();
  return `aurafisky-${place || "weather"}.png`;
}

/**
 * Entry point wired to the "Share as Image" button.
 * @param {'native'|'download'|'copy'} [target='native']
 */
async function shareWeatherImage(target = "native") {
  const app = this;
  if (!app.weatherData) {
    app.showToast("No weather data to share yet.", "error");
    return;
  }

  app.showToast("Rendering weather card…", "info", 2000);
  const blob = await renderCardBlob(app);
  if (!blob) {
    app.showToast("Could not render the weather card.", "error");
    return;
  }

  // Copy to clipboard (image)
  if (target === "copy") {
    try {
      if (navigator.clipboard && window.ClipboardItem && typeof blob !== "string") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        app.showToast("Weather card copied to clipboard!", "success");
        return;
      }
    } catch (e) {
      /* fall through to download */
    }
    downloadBlob(app, blob, cardFilename(app));
    app.showToast("Saved weather card instead.", "info");
    return;
  }

  // Native share sheet with the file
  if (target === "native" && navigator.canShare && typeof blob !== "string") {
    try {
      const file = new File([blob], cardFilename(app), { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Weather — ${app.selectedName}`,
          text: `Current weather in ${app.selectedName}`,
        });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
      /* fall through to download */
    }
  }

  downloadBlob(app, blob, cardFilename(app));
  app.showToast("Weather card saved as PNG.", "success");
}

/** Append a "Share as Image" section into the existing Share modal. */
function installShareImageButton(app) {
  const modal = app.$ && app.$.shareModal;
  if (!modal || modal.querySelector("#shareAsImageBtn")) return;
  const body = modal.querySelector(".p-4.space-y-4") || modal.querySelector(".p-4");
  if (!body) return;

  const section = document.createElement("div");

  const label = document.createElement("label");
  label.className =
    "block text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2";
  label.textContent = "3. Or Share as Image";

  const row = document.createElement("div");
  row.className = "grid grid-cols-3 gap-2";

  const mkBtn = (id, text, handler, primary) => {
    const b = document.createElement("button");
    b.id = id;
    b.type = "button";
    b.className = primary
      ? "p-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold text-xs transition-colors active:scale-95"
      : "p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors active:scale-95";
    b.textContent = text;
    b.addEventListener("click", handler);
    return b;
  };

  row.append(
    mkBtn("shareAsImageBtn", "📤 Share PNG", () => shareWeatherImage.call(app, "native"), true),
    mkBtn("shareAsImageDownload", "⬇️ Download", () => shareWeatherImage.call(app, "download"), false),
    mkBtn("shareAsImageCopy", "📋 Copy", () => shareWeatherImage.call(app, "copy"), false),
  );

  section.append(label, row);
  body.appendChild(section);
}

export function init(app) {
  app.shareWeatherImage = shareWeatherImage;
  installShareImageButton(app);
}

