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

import { shortPlaceName } from "../modules/geo.js";

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
export function buildStatItems(weather, fmt, detailed = false) {
  const f = fmt || {};
  const temp = typeof f.temp === "function" ? f.temp : (n) => `${Math.round(n)}°`;
  const wind = typeof f.wind === "function" ? f.wind : (n) => `${Math.round(n)} km/h`;
  const items = [];
  if (weather?.feelsLike != null) items.push({ label: "Feels like", value: temp(weather.feelsLike) });
  if (weather?.humidity != null) items.push({ label: "Humidity", value: `${Math.round(weather.humidity)}%` });
  if (weather?.windSpeed != null) {
    const direction = weather.windDirectionLabel ? ` ${weather.windDirectionLabel}` : "";
    items.push({ label: "Wind", value: `${wind(weather.windSpeed)}${direction}` });
  }
  if (weather?.precipProb != null) items.push({ label: "Rain", value: `${Math.round(weather.precipProb)}%` });
  if (detailed) {
    if (weather?.windGusts != null) items.push({ label: "Wind gusts", value: wind(weather.windGusts) });
    if (weather?.uvIndex != null) items.push({ label: "UV index", value: Number(weather.uvIndex).toFixed(1) });
    if (weather?.pressure != null && typeof f.pressure === "function") {
      items.push({ label: "Pressure", value: f.pressure(weather.pressure) });
    }
    if (weather?.visibility != null && typeof f.visibility === "function") {
      items.push({ label: "Visibility", value: f.visibility(weather.visibility) });
    }
    if (Number.isFinite(weather?.airQuality)) items.push({ label: "US AQI", value: `${Math.round(weather.airQuality)}` });
    if (weather?.cloudCover != null) items.push({ label: "Cloud cover", value: `${Math.round(weather.cloudCover)}%` });
  }
  return items.slice(0, detailed ? 8 : 4);
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
export function buildCardModel({ placeName, timeLabel, weather, daily, hours, variant = "current", timeZoneLabel = "" }) {
  const code = weather?.weatherCode ?? 0;
  const days = Array.isArray(daily)
    ? daily.slice(0, 7).map((d) => ({
        label: d.label || "",
        emoji: conditionEmoji(d.weatherCode, true),
        maxText: d.maxText != null ? d.maxText : "",
        minText: d.minText != null ? d.minText : "",
        precipText: Number.isFinite(d.precipProb) ? `${Math.round(d.precipProb)}% rain` : "",
      }))
    : [];
  const hourly = Array.isArray(hours)
    ? hours.slice(0, 24).map((hour) => ({
        label: hour.label || "",
        emoji: conditionEmoji(hour.weatherCode, hour.isDay !== false),
        tempText: hour.tempText || "",
        precipText: Number.isFinite(hour.precipProb) && hour.precipProb >= 10 ? `${Math.round(hour.precipProb)}%` : "",
      }))
    : [];
  const detailed = variant === "full";
  return {
    placeName: placeName || "Unknown location",
    timeLabel: timeLabel || "",
    emoji: conditionEmoji(code, weather?.isDay !== false),
    tempText: weather?.tempText || "",
    descText: weather?.description || "",
    stats: buildStatItems(weather, weather?.fmt, detailed),
    days,
    hours: hourly,
    variant,
    timeZoneLabel,
    forecastTitle: variant === "hourly" ? "NEXT 24 HOURS" : variant === "full" ? "7-DAY + DETAILS" : "7-DAY OUTLOOK",
    gradient: pickGradient(code),
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    brand: "Aurafisky",
    tagline: "Open-Meteo · aurafisky.web.app",
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
  const columns = 4;
  const gap = 14;
  const rowGap = 12;
  const rows = Math.ceil(stats.length / columns);
  const chipW = (box.width - gap * (columns - 1)) / columns;
  const chipH = rows > 1 ? 88 : 108;
  stats.forEach((s, i) => {
    const row = Math.floor(i / columns);
    const col = i % columns;
    const x = box.x + col * (chipW + gap);
    const y = box.y + row * (chipH + rowGap);
    roundRect(ctx, x, y, chipW, chipH, 22);
    ctx.fillStyle = "rgba(255,255,255,.19)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.3)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = inkSoft;
    ctx.font = `600 19px ${FONT}`;
    ctx.fillText(String(s.label).toUpperCase(), x + chipW / 2, y + 33);
    ctx.fillStyle = ink;
    ctx.font = `700 31px ${FONT}`;
    ctx.fillText(truncate(ctx, s.value || "--", chipW - 18), x + chipW / 2, y + (chipH > 100 ? 78 : 65));
    ctx.textAlign = "left";
  });
  return rows * chipH + (rows - 1) * rowGap;
}

function drawForecastStrip(ctx, items, box, ink, inkSoft, hourly = false, onDark = true) {
  if (!items || !items.length) return;

  if (hourly) {
    // Render all 24 hours in 2 neat rows of 12 hours (12 columns x 2 rows = 24 hours)
    const cols = 12;
    const gap = 8;
    const rowGap = 8;
    const colW = (box.width - gap * (cols - 1)) / cols;
    const colH = 98;

    items.forEach((d, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const x = box.x + col * (colW + gap);
      const y = box.y + row * (colH + rowGap);

      roundRect(ctx, x, y, colW, colH, 14);
      ctx.fillStyle = "rgba(255,255,255,.12)";
      ctx.fill();

      ctx.textAlign = "center";
      // Hour label (e.g. 2p, 3p, 4p...)
      ctx.fillStyle = inkSoft;
      ctx.font = `600 15px ${FONT}`;
      ctx.fillText(d.label || "", x + colW / 2, y + 21);

      // Weather emoji
      ctx.font = `23px ${FONT}`;
      ctx.fillStyle = ink;
      ctx.fillText(d.emoji || "", x + colW / 2, y + 46);

      // Temperature
      ctx.font = `700 15px ${FONT}`;
      ctx.fillStyle = ink;
      const tempY = d.precipText ? y + 66 : y + 72;
      ctx.fillText(truncate(ctx, d.tempText || "--", colW - 6), x + colW / 2, tempY);

      // Rain chance (if any rain predicted)
      if (d.precipText) {
        ctx.font = `600 11px ${FONT}`;
        ctx.fillStyle = onDark ? "rgba(125, 211, 252, 0.95)" : "#0284c7";
        ctx.fillText(truncate(ctx, d.precipText, colW - 6), x + colW / 2, y + 83);
      }
      ctx.textAlign = "left";
    });
    return;
  }

  // 7-day outlook (single row of 7 columns)
  const gap = 10;
  const colW = (box.width - gap * (items.length - 1)) / items.length;
  const colH = 178;
  items.forEach((d, i) => {
    const x = box.x + i * (colW + gap);
    roundRect(ctx, x, box.y, colW, colH, 20);
    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = inkSoft;
    ctx.font = `600 20px ${FONT}`;
    ctx.fillText(d.label || "", x + colW / 2, box.y + 44);

    ctx.font = `50px ${FONT}`;
    ctx.fillStyle = ink;
    ctx.fillText(d.emoji || "", x + colW / 2, box.y + 108);

    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = inkSoft;
    const values = `${d.maxText || "--"} / ${d.minText || "--"}`;
    ctx.fillText(truncate(ctx, values, colW - 8), x + colW / 2, box.y + 143);
    if (d.precipText) {
      ctx.font = `500 15px ${FONT}`;
      ctx.fillStyle = inkSoft;
      ctx.fillText(truncate(ctx, d.precipText, colW - 8), x + colW / 2, box.y + 164);
    }
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

  const halo = ctx.createRadialGradient(width * 0.82, height * 0.18, 10, width * 0.82, height * 0.18, width * 0.62);
  halo.addColorStop(0, "rgba(255,255,255,.22)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height * 0.66);

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
  ctx.font = `500 23px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(model.timeLabel || "", width - 64, 96);

  // Location
  ctx.textAlign = "left";
  ctx.fillStyle = ink;
  ctx.font = `800 58px ${FONT}`;
  ctx.fillText(truncate(ctx, model.placeName || "", width - 128), 64, 205);

  ctx.fillStyle = inkSoft;
  ctx.font = `600 20px ${FONT}`;
  const contextLabel = model.variant === "full" ? "DETAILED WEATHER SNAPSHOT" : model.variant === "hourly" ? "HOURLY FORECAST" : model.variant === "weekly" ? "WEEKLY FORECAST" : "SELECTED CONDITIONS";
  ctx.fillText(contextLabel, 66, 250);

  // Big emoji
  ctx.font = `190px ${FONT}`;
  ctx.fillText(model.emoji || "", 54, 478);

  // Temperature (right aligned)
  ctx.fillStyle = ink;
  ctx.font = `800 174px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(model.tempText || "--°", width - 64, 472);

  // Description
  ctx.textAlign = "left";
  ctx.fillStyle = inkSoft;
  ctx.font = `600 38px ${FONT}`;
  ctx.fillText(truncate(ctx, model.descText || "", width - 128), 64, 550);

  // Stat chips
  const statsHeight = drawStatChips(ctx, model.stats, { x: 64, y: 620, width: width - 128 }, ink, inkSoft) || 0;
  const forecastTop = Math.max(810, 620 + statsHeight + 76);

  // Divider
  ctx.strokeStyle = onDark ? "rgba(255,255,255,.28)" : "rgba(15,23,42,.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, forecastTop - 22);
  ctx.lineTo(width - 64, forecastTop - 22);
  ctx.stroke();

  // Strip heading
  ctx.fillStyle = ink;
  ctx.font = `800 27px ${FONT}`;
  ctx.textAlign = "left";
  ctx.fillText(model.forecastTitle || "FORECAST", 64, forecastTop + 20);

  // Day strip
  const hourly = model.variant === "hourly";
  drawForecastStrip(ctx, hourly ? model.hours : model.days, { x: 64, y: forecastTop + 42, width: width - 128 }, ink, inkSoft, hourly, onDark);

  // Footer
  ctx.fillStyle = inkSoft;
  ctx.font = `500 20px ${FONT}`;
  ctx.textAlign = "left";
  const footer = [model.tagline, model.timeZoneLabel].filter(Boolean).join("  ·  ");
  ctx.fillText(truncate(ctx, footer, width - 128), 64, height - 42);
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
  const timezone = app.weatherData?.timezone || "UTC";
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]));
  const todayStr = `${today.year}-${today.month}-${today.day}`;
  const todayIdx = dailyRaw.findIndex((d) => d.date === todayStr);
  const startDay = todayIdx >= 0 ? todayIdx : WS.PAST_DAYS ?? 0;
  const week = dailyRaw.slice(startDay, startDay + 7);
  const variant = app.selectedShareType || "current";
  const hourly = app.weatherData?.hourly?.time || [];
  const hours = [];
  for (let i = Math.max(0, idx); i < Math.min(hourly.length, idx + 24); i++) {
    const hour = WS.getHourlyAtIndex(app.weatherData, i);
    if (!hour) continue;
    hours.push({
      label: formatLocalHour(hour.time),
      weatherCode: hour.weatherCode,
      isDay: hour.isDay,
      tempText: WS.formatTemp(hour.temperature),
      precipProb: hour.precipProb,
    });
  }
  const aqiTimes = app.airQualityData?.hourly?.time;
  const aqiTimeIndex = Array.isArray(aqiTimes) ? aqiTimes.indexOf(w.time) : -1;
  const aqi = app.airQualityData?.hourly?.us_aqi?.[aqiTimeIndex >= 0 ? aqiTimeIndex : idx];
  const timezoneLabel = app.weatherData?.timezone_abbreviation || timezone;

  return buildCardModel({
    placeName: app.selectedName,
    timeLabel: formatLocalWeatherTime(w.time),
    timeZoneLabel: timezoneLabel,
    variant,
    weather: {
      weatherCode: w.weatherCode,
      isDay: w.isDay,
      tempText: WS.formatTemp(w.temperature),
      description: w.description,
      feelsLike: w.feelsLike,
      humidity: w.humidity,
      windSpeed: w.windSpeed,
      windDirectionLabel: WS.getWindDirection(w.windDirection),
      windGusts: w.windGusts,
      precipProb: w.precipProb,
      uvIndex: w.uvIndex,
      pressure: w.pressure,
      visibility: w.visibility,
      cloudCover: w.cloudCover,
      airQuality: Number.isFinite(aqi) ? aqi : null,
      fmt: {
        temp: (n) => WS.formatTemp(n),
        wind: (n) => WS.formatWind(n),
        pressure: (n) => WS.formatPressure(n),
        visibility: (n) => WS.formatVisibility(n),
      },
    },
    hours,
    daily: week.map((d) => ({
      label: WS.formatDayLabel(d.date),
      weatherCode: d.weatherCode,
      maxText: WS.formatTemp(d.maxTemp),
      minText: WS.formatTemp(d.minTemp),
      precipProb: d.precipProb,
    })),
  });
}

function formatLocalWeatherTime(value) {
  if (!value) return "Local forecast";
  const [datePart, timePart] = String(value).split("T");
  const [year, month, day] = (datePart || "").split("-").map(Number);
  const [hour = 0, minute = 0] = (timePart || "").split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return "Local forecast";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  const monthName = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1];
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${weekday}, ${monthName} ${day} · ${hour12}:${String(minute).padStart(2, "0")} ${suffix} local`;
}

function formatLocalHour(value) {
  const rawHour = Number(String(value || "").split("T")[1]?.split(":")[0]);
  if (!Number.isFinite(rawHour)) return "--";
  return `${rawHour % 12 || 12}${rawHour >= 12 ? "p" : "a"}`;
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

function refreshShareCardPreview(app) {
  const image = app.$?.shareCardPreviewImage;
  const message = app.$?.shareCardPreviewMessage;
  if (!image) return;
  const model = modelFromApp(app);
  if (!model) {
    image.classList.add("hidden");
    if (message) message.textContent = "Choose a place on the map to preview its card.";
    return;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_WIDTH;
    canvas.height = CARD_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable");
    drawWeatherCard(ctx, model);
    image.src = canvas.toDataURL("image/png");
    image.alt = `${model.placeName} weather card: ${model.tempText}, ${model.descText}`;
    image.classList.remove("hidden");
    if (message) message.textContent = `${model.forecastTitle.toLowerCase()} · ${model.timeZoneLabel || "local time"}`;
  } catch (error) {
    console.warn("Share-card preview failed:", error);
    image.classList.add("hidden");
    if (message) message.textContent = "Preview is unavailable on this device.";
  }
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
  const place = shortPlaceName(app.selectedName || "weather")
    .replace(/[^\w-]+/g, "-")
    .toLowerCase();
  return `aurafisky-${place || "weather"}.png`;
}

function buildLocationShareUrl(app) {
  try {
    const url = new URL(window.location.href);
    if (Number.isFinite(app.selectedLat) && Number.isFinite(app.selectedLng)) {
      url.searchParams.set("lat", app.selectedLat.toFixed(4));
      url.searchParams.set("lng", app.selectedLng.toFixed(4));
      if (app.selectedName) url.searchParams.set("name", app.selectedName);
    }
    return url.toString();
  } catch {
    return "https://aurafisky.web.app/";
  }
}

/**
 * Entry point wired to the "Share as Image" button.
 * @param {'native'|'whatsapp'|'telegram'|'x'|'download'|'copy'} [target='native']
 */
async function shareWeatherImage(target = "native") {
  const app = this;
  if (!app.weatherData) {
    app.showToast("No weather data to share yet.", "error");
    return;
  }

  app.showToast("Rendering weather card…", "info", 2000);
  const model = modelFromApp(app);
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

  // Download
  if (target === "download") {
    downloadBlob(app, blob, cardFilename(app));
    app.showToast("Weather card saved as PNG.", "success");
    return;
  }

  // WhatsApp
  if (target === "whatsapp") {
    if (navigator.canShare && typeof blob !== "string") {
      try {
        const file = new File([blob], cardFilename(app), { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${model?.placeName || "Weather"} Card`,
            text: `Weather forecast for ${model?.placeName || "location"} · ${buildLocationShareUrl(app)}`,
          });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    downloadBlob(app, blob, cardFilename(app));
    const waText = encodeURIComponent(`Weather forecast for ${model?.placeName || app.selectedName || "selected location"}\n${buildLocationShareUrl(app)}`);
    window.open(`https://api.whatsapp.com/send?text=${waText}`, "_blank", "noopener,noreferrer");
    app.showToast("Weather card downloaded — attach it in WhatsApp!", "success");
    return;
  }

  // Telegram
  if (target === "telegram") {
    if (navigator.canShare && typeof blob !== "string") {
      try {
        const file = new File([blob], cardFilename(app), { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${model?.placeName || "Weather"} Card`,
            text: `Weather forecast for ${model?.placeName || "location"} · ${buildLocationShareUrl(app)}`,
          });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    downloadBlob(app, blob, cardFilename(app));
    const tgText = encodeURIComponent(`Weather card for ${model?.placeName || app.selectedName || "selected location"}`);
    const tgUrl = encodeURIComponent(buildLocationShareUrl(app));
    window.open(`https://t.me/share/url?url=${tgUrl}&text=${tgText}`, "_blank", "noopener,noreferrer");
    app.showToast("Weather card downloaded — attach it in Telegram!", "success");
    return;
  }

  // X / Twitter
  if (target === "x") {
    if (navigator.canShare && typeof blob !== "string") {
      try {
        const file = new File([blob], cardFilename(app), { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: `${model?.placeName || "Weather"} Card`,
            text: `Weather forecast for ${model?.placeName || "location"} · ${buildLocationShareUrl(app)}`,
          });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
      }
    }
    downloadBlob(app, blob, cardFilename(app));
    const xText = encodeURIComponent(`Weather forecast for ${model?.placeName || app.selectedName || "selected location"} via Aurafisky\n${buildLocationShareUrl(app)}`);
    window.open(`https://twitter.com/intent/tweet?text=${xText}`, "_blank", "noopener,noreferrer");
    app.showToast("Weather card downloaded — attach it in X!", "success");
    return;
  }

  // Native share sheet with the file
  if (target === "native" && navigator.canShare && typeof blob !== "string") {
    try {
      const file = new File([blob], cardFilename(app), { type: "image/png" });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${model?.forecastTitle || "Weather"} — ${model?.placeName || app.selectedName || "Aurafisky"}`,
          text: `${model?.descText || "Weather conditions"} at ${model?.timeLabel || "the selected time"}. ${model?.timeZoneLabel ? `Local time: ${model.timeZoneLabel}.` : ""} ${buildLocationShareUrl(app)}`,
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
  label.textContent = "3. Preview and share your weather card";

  const preview = document.createElement("div");
  preview.className = "mb-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-100 to-white dark:from-slate-950 dark:to-slate-900 p-3";
  const previewImage = document.createElement("img");
  previewImage.id = "shareCardPreviewImage";
  previewImage.className = "hidden mx-auto max-h-72 w-auto rounded-xl shadow-lg ring-1 ring-black/5 dark:ring-white/10";
  previewImage.alt = "Preview of the weather card to share";
  previewImage.loading = "lazy";
  const previewMessage = document.createElement("p");
  previewMessage.id = "shareCardPreviewMessage";
  previewMessage.className = "py-4 text-center text-xs text-slate-500 dark:text-slate-400";
  previewMessage.textContent = "Choose a place on the map to preview its card.";
  preview.append(previewImage, previewMessage);

  const actions = document.createElement("div");
  actions.className = "space-y-2";

  const socialRow = document.createElement("div");
  socialRow.className = "grid grid-cols-4 gap-2";

  const mkIconBtn = (id, svgHtml, title, ariaLabel, colorClass, handler) => {
    const b = document.createElement("button");
    b.id = id;
    b.type = "button";
    b.className = `flex items-center justify-center p-2.5 rounded-xl border ${colorClass} bg-white dark:bg-slate-900 transition-colors active:scale-95 cursor-pointer shadow-xs`;
    b.title = title;
    b.setAttribute("aria-label", ariaLabel);
    b.innerHTML = svgHtml;
    b.addEventListener("click", handler);
    return b;
  };

  socialRow.append(
    mkIconBtn(
      "shareAsImageBtn",
      '<svg class="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100-5.367 3 3 0 000 5.367zm0 8.484a3 3 0 100-5.367 3 3 0 000 5.367z"/></svg>',
      "System Share Card (Device Apps)",
      "Share card using device apps",
      "border-teal-200 dark:border-teal-900/50 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-teal-600 dark:text-teal-400",
      () => shareWeatherImage.call(app, "native")
    ),
    mkIconBtn(
      "shareAsImageWhatsApp",
      '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>',
      "Share Card to WhatsApp",
      "Share card on WhatsApp",
      "border-emerald-200 dark:border-emerald-900/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
      () => shareWeatherImage.call(app, "whatsapp")
    ),
    mkIconBtn(
      "shareAsImageTelegram",
      '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M12 0c-6.627 0-12 5.373-12 12s5.373 12 12 12 12-5.373 12-12-5.373-12-12-12zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.536-.194 1.006.128.832.941z"/></svg>',
      "Share Card to Telegram",
      "Share card on Telegram",
      "border-sky-200 dark:border-sky-900/50 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-sky-600 dark:text-sky-400",
      () => shareWeatherImage.call(app, "telegram")
    ),
    mkIconBtn(
      "shareAsImageX",
      '<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
      "Share Card to X (Twitter)",
      "Share card on X",
      "border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200",
      () => shareWeatherImage.call(app, "x")
    )
  );

  const fileRow = document.createElement("div");
  fileRow.className = "grid grid-cols-2 gap-2";

  const mkFileBtn = (id, svgHtml, text, handler) => {
    const b = document.createElement("button");
    b.id = id;
    b.type = "button";
    b.className =
      "flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors active:scale-95 cursor-pointer shadow-xs";
    b.innerHTML = `${svgHtml}<span>${text}</span>`;
    b.addEventListener("click", handler);
    return b;
  };

  fileRow.append(
    mkFileBtn(
      "shareAsImageDownload",
      '<svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>',
      "Download PNG",
      () => shareWeatherImage.call(app, "download")
    ),
    mkFileBtn(
      "shareAsImageCopy",
      '<svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>',
      "Copy Image",
      () => shareWeatherImage.call(app, "copy")
    )
  );

  actions.append(socialRow, fileRow);
  section.append(label, preview, actions);
  body.appendChild(section);

  app.$.shareCardPreviewImage = previewImage;
  app.$.shareCardPreviewMessage = previewMessage;
  modal.addEventListener("click", (event) => {
    if (event.target.closest("#shareTypeContainer .share-type-btn")) {
      refreshShareCardPreview(app);
    }
  });
}

export function init(app) {
  app.shareWeatherImage = shareWeatherImage;
  app.refreshShareCardPreview = () => refreshShareCardPreview(app);
  installShareImageButton(app);
}

