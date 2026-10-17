// features/animatedShare.js
// ── Animated weather card (GIF) for WhatsApp & other chat apps ──────
//
// A static PNG is fine, but a subtle animation — a pulsing temperature,
// drifting clouds, a gentle rain — is what makes a shared card feel
// alive in a chat thread. WhatsApp supports animated GIFs, so this
// module renders one and shares it via the native share sheet.
//
// Uses omggif (bundled, ~12 KB) for encoding. The encoder takes indexed
// (palette) pixels, so each frame is quantized to a shared 256-colour
// palette derived from the card's gradient.

import * as omggif from "omggif";
const GifWriter = omggif.GifWriter || omggif.default?.GifWriter;

/** Pick gradient based on weather code. */
function pickGradient(code) {
  const GRADIENTS = [
    { test: (c) => c === 0 || c === 1, from: "#f59e0b", to: "#f97316", dark: false },
    { test: (c) => c === 2 || c === 3, from: "#60a5fa", to: "#3b82f6", dark: false },
    { test: (c) => c === 45 || c === 48, from: "#94a3b8", to: "#64748b", dark: false },
    { test: (c) => c >= 51 && c <= 57, from: "#38bdf8", to: "#0ea5e9", dark: false },
    { test: (c) => (c >= 61 && c <= 67) || (c >= 80 && c <= 82), from: "#0ea5e9", to: "#1e40af", dark: true },
    { test: (c) => c >= 71 && c <= 77, from: "#bae6fd", to: "#64748b", dark: false },
    { test: (c) => c >= 85 && c <= 86, from: "#cbd5e1", to: "#475569", dark: false },
    { test: (c) => c >= 95, from: "#4c1d95", to: "#1e1b4b", dark: true },
  ];
  const c = Number.isFinite(code) ? code : 0;
  return GRADIENTS.find((g) => g.test(c)) || GRADIENTS[1];
}

/** Build stat items from weather data. */
function buildStatItems(weather, fmt) {
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

/** Emoji for a WMO code (day/night aware). */
function conditionEmoji(weatherCode, isDay = true) {
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

const CARD_W = 640;
const CARD_H = 800;
const FRAME_COUNT = 24;
const FRAME_DELAY = 8; // 1/100 s units → 80 ms per frame

// A fixed palette that covers the weather-card colour space: sky gradients,
// white text, accent colours. 256 entries, power of 2.
function buildPalette() {
  const p = [];
  // Sky gradient colours (clear → rain → storm)
  const sky = [
    [245, 158, 11], [249, 115, 22], [96, 165, 250], [59, 130, 246],
    [14, 165, 233], [30, 64, 175], [76, 29, 149], [30, 27, 75],
    [186, 230, 253], [100, 116, 139], [148, 163, 184], [71, 85, 105],
    [255, 255, 255], [226, 232, 240], [148, 163, 184], [100, 116, 139],
    [15, 23, 42], [30, 41, 59], [51, 65, 85], [71, 85, 105],
    [251, 191, 36], [245, 158, 11], [234, 88, 12], [220, 38, 38],
    [34, 197, 94], [20, 184, 166], [6, 182, 212], [59, 130, 246],
    [139, 92, 246], [236, 72, 153], [244, 63, 94], [251, 146, 60],
  ];
  for (const [r, g, b] of sky) p.push((r << 16) | (g << 8) | b);
  // Fill the rest with a greyscale ramp.
  while (p.length < 256) {
    const v = Math.round((p.length / 256) * 255);
    p.push((v << 16) | (v << 8) | v);
  }
  return p;
}

const PALETTE = buildPalette();

/** Nearest palette entry for an RGB colour (Euclidean distance). */
function nearestPaletteIndex(r, g, b) {
  let best = 0, bestDist = Infinity;
  for (let i = 0; i < PALETTE.length; i++) {
    const p = PALETTE[i];
    const pr = (p >> 16) & 0xff, pg = (p >> 8) & 0xff, pb = p & 0xff;
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}

/** Draws one frame of the animated card onto a canvas. */
function drawFrame(ctx, frame, model) {
  const t = frame / FRAME_COUNT;
  const g = model.gradient;
  const w = CARD_W, h = CARD_H;

  // Background gradient with a subtle animated shift.
  const shift = Math.sin(t * Math.PI * 2) * 0.08;
  const bg = ctx.createLinearGradient(0, 0, w, h * (1 + shift));
  bg.addColorStop(0, g.from);
  bg.addColorStop(1, g.to);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Animated cloud wisps drifting across the top.
  const cloudAlpha = 0.12 + 0.06 * Math.sin(t * Math.PI * 2);
  ctx.globalAlpha = cloudAlpha;
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 180 + t * 60) % (w + 200)) - 100;
    const cy = 60 + i * 30 + Math.sin(t * Math.PI * 2 + i) * 15;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 60, 25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Brand row
  ctx.fillStyle = g.dark ? "rgba(255,255,255,.85)" : "rgba(15,23,42,.7)";
  ctx.font = "700 28px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(model.brand || "Aurafisky", 40, 60);
  ctx.textAlign = "right";
  ctx.font = "400 22px system-ui, sans-serif";
  ctx.fillText(model.timeLabel || "", w - 40, 60);

  // Location
  ctx.textAlign = "left";
  ctx.fillStyle = g.dark ? "#ffffff" : "#0f172a";
  ctx.font = "800 42px system-ui, sans-serif";
  ctx.fillText(truncate(ctx, model.placeName || "", w - 80), 40, 140);

  // Big emoji with gentle pulse
  const pulse = 1 + 0.04 * Math.sin(t * Math.PI * 2);
  ctx.save();
  ctx.translate(80, 300);
  ctx.scale(pulse, pulse);
  ctx.font = "140px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(model.emoji || "🌤️", 0, 0);
  ctx.restore();

  // Temperature with subtle glow pulse
  const glowAlpha = 0.15 + 0.1 * Math.sin(t * Math.PI * 2);
  ctx.textAlign = "right";
  ctx.fillStyle = `rgba(255,255,255,${glowAlpha})`;
  ctx.font = "800 140px system-ui, sans-serif";
  ctx.fillText(model.tempText || "--°", w - 40, 300);
  ctx.fillStyle = g.dark ? "#ffffff" : "#0f172a";
  ctx.fillText(model.tempText || "--°", w - 40, 300);

  // Description
  ctx.textAlign = "left";
  ctx.fillStyle = g.dark ? "rgba(255,255,255,.85)" : "rgba(15,23,42,.7)";
  ctx.font = "500 32px system-ui, sans-serif";
  ctx.fillText(model.descText || "", 40, 360);

  // Stat chips
  const stats = model.stats || [];
  const chipW = (w - 80 - 16 * (stats.length - 1)) / stats.length;
  stats.forEach((s, i) => {
    const x = 40 + i * (chipW + 16);
    const y = 400;
    const chipH = 90;
    roundRect(ctx, x, y, chipW, chipH, 16);
    ctx.fillStyle = "rgba(255,255,255,.15)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = g.dark ? "rgba(255,255,255,.7)" : "rgba(15,23,42,.6)";
    ctx.font = "500 18px system-ui, sans-serif";
    ctx.fillText(String(s.label).toUpperCase(), x + chipW / 2, y + 34);
    ctx.fillStyle = g.dark ? "#ffffff" : "#0f172a";
    ctx.font = "700 30px system-ui, sans-serif";
    ctx.fillText(s.value || "--", x + chipW / 2, y + 72);
  });

  // Divider
  ctx.strokeStyle = g.dark ? "rgba(255,255,255,.2)" : "rgba(15,23,42,.15)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(40, h - 220);
  ctx.lineTo(w - 40, h - 220);
  ctx.stroke();

  // 7-day strip
  ctx.textAlign = "left";
  ctx.fillStyle = g.dark ? "rgba(255,255,255,.7)" : "rgba(15,23,42,.6)";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText("7-DAY FORECAST", 40, h - 185);

  const days = model.days || [];
  const dayW = (w - 80 - 10 * (days.length - 1)) / days.length;
  days.forEach((d, i) => {
    const x = 40 + i * (dayW + 10);
    const y = h - 165;
    const dayH = 150;
    roundRect(ctx, x, y, dayW, dayH, 14);
    ctx.fillStyle = i === 0 ? "rgba(20,184,166,.25)" : "rgba(255,255,255,.1)";
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = g.dark ? "rgba(255,255,255,.7)" : "rgba(15,23,42,.6)";
    ctx.font = "600 16px system-ui, sans-serif";
    ctx.fillText(d.label || "", x + dayW / 2, y + 28);

    ctx.font = "36px system-ui, sans-serif";
    ctx.fillStyle = g.dark ? "#ffffff" : "#0f172a";
    ctx.fillText(d.emoji || "", x + dayW / 2, y + 72);

    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillStyle = g.dark ? "rgba(255,255,255,.8)" : "rgba(15,23,42,.7)";
    ctx.fillText(`${d.maxText || "--"}° ${d.minText || "--"}°`, x + dayW / 2, y + 108);

    const pp = d.precipProb;
    if (pp != null) {
      ctx.fillStyle = "rgba(147,197,253,.9)";
      ctx.font = "600 14px system-ui, sans-serif";
      ctx.fillText(`${Math.round(pp)}%`, x + dayW / 2, y + 132);
    }
  });

  // Footer
  ctx.textAlign = "left";
  ctx.fillStyle = g.dark ? "rgba(255,255,255,.5)" : "rgba(15,23,42,.4)";
  ctx.font = "400 18px system-ui, sans-serif";
  ctx.fillText("Aurafisky · Open-Meteo", 40, h - 24);
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

function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

// ── App integration ─────────────────────────────────────────────────

export function init(app) {
  app.shareAnimatedCard = shareAnimatedCard;
  app.shareWeatherImage = app.shareWeatherImage || shareWeatherImage;
  installWhatsAppButton(app);
}

async function shareAnimatedCard(target = "native") {
  const app = this;
  if (!app.weatherData) {
    app.showToast("No weather data to share yet.", "error");
    return;
  }

  app.showToast("Rendering animated card…", "info", 2000);
  const blob = await renderAnimatedGif(app);
  if (!blob) {
    app.showToast("Could not render the animated card.", "error");
    return;
  }

  const filename = `aurafisky-weather-${(app.selectedName || "location").split(",")[0].trim().replace(/[^\w-]+/g, "-").toLowerCase()}.gif`;

  if (target === "native" && navigator.canShare && typeof blob !== "string") {
    try {
      const file = new File([blob], filename, { type: "image/gif" });
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
    }
  }

  // WhatsApp deep link fallback (opens WhatsApp with the image URL)
  // Note: WhatsApp doesn't support direct image sharing via URL scheme,
  // so we fall back to downloading + opening WhatsApp Web.
  if (target === "whatsapp") {
    const url = URL.createObjectURL(blob);
    // Open WhatsApp Web with a text message pointing to the download
    const waText = encodeURIComponent(`Check out the weather in ${app.selectedName}! 🌤️`);
    const waUrl = `https://wa.me/?text=${waText}`;
    // Download the GIF first
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Then open WhatsApp
    setTimeout(() => {
      window.open(waUrl, "_blank");
      URL.revokeObjectURL(url);
    }, 500);
    app.showToast("GIF downloaded — attach it in WhatsApp!", "success");
    return;
  }

  // Default: download
  const url = typeof blob === "string" ? blob : URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blob !== "string") setTimeout(() => URL.revokeObjectURL(url), 4000);
  app.showToast("Animated weather card saved!", "success");
}

async function renderAnimatedGif(app) {
  return new Promise((resolve) => {
    try {
      const model = buildModelFromApp(app);
      if (!model) { resolve(null); return; }

      const bufSize = CARD_W * CARD_H * (FRAME_COUNT + 1) + 1024;
      const buf = new Uint8Array(bufSize);
      const writer = new GifWriter(buf, CARD_W, CARD_H, {
        loop: 0, // infinite loop
        palette: PALETTE,
      });

      const canvas = document.createElement("canvas");
      canvas.width = CARD_W;
      canvas.height = CARD_H;
      const ctx = canvas.getContext("2d");

      const indexedPixels = new Uint8Array(CARD_W * CARD_H);

      for (let f = 0; f < FRAME_COUNT; f++) {
        ctx.clearRect(0, 0, CARD_W, CARD_H);
        drawFrame(ctx, f, model);

        // Quantize to palette
        const imageData = ctx.getImageData(0, 0, CARD_W, CARD_H);
        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const g = imageData.data[i + 1];
          const b = imageData.data[i + 2];
          const a = imageData.data[i + 3];
          if (a < 128) {
            indexedPixels[i / 4] = 0; // transparent → background
          } else {
            indexedPixels[i / 4] = nearestPaletteIndex(r, g, b);
          }
        }

        writer.addFrame(0, 0, CARD_W, CARD_H, indexedPixels, {
          delay: FRAME_DELAY,
          disposal: 1, // restore to background
        });
      }

      writer.end();
      const bytes = writer.getOutputBufferPosition();
      const gifBlob = new Blob([buf.slice(0, bytes)], { type: "image/gif" });
      resolve(gifBlob);
    } catch (e) {
      console.warn("Animated GIF render failed:", e);
      resolve(null);
    }
  });
}

function buildModelFromApp(app) {
  const WS = globalThis.WeatherService;
  if (!app.weatherData || !WS) return null;

  const idx = typeof app.currentHourIndex === "number"
    ? app.currentHourIndex
    : WS.getCurrentHourIndex(app.weatherData, app.weatherData?.utc_offset_seconds || 0);
  const w = WS.getHourlyAtIndex(app.weatherData, idx);
  if (!w) return null;

  const dailyRaw = WS.getDailyForecast(app.weatherData) || [];
  const todayStr = new Date().toISOString().split("T")[0];
  const todayIdx = dailyRaw.findIndex((d) => d.date === todayStr);
  const startDay = todayIdx >= 0 ? todayIdx : WS.PAST_DAYS ?? 0;
  const week = dailyRaw.slice(startDay, startDay + 7);

  return {
    placeName: app.selectedName,
    timeLabel: new Date().toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }),
    emoji: conditionEmoji(w.weatherCode, w.isDay),
    tempText: WS.formatTemp(w.temperature),
    descText: w.description,
    stats: buildStatItems(w, {
      temp: (n) => WS.formatTemp(n),
      wind: (n) => WS.formatWind(n),
    }),
    days: week.map((d) => ({
      label: WS.formatDayLabel(d.date),
      emoji: conditionEmoji(d.weatherCode, true),
      maxText: WS.formatTemp(d.maxTemp),
      minText: WS.formatTemp(d.minTemp),
      precipProb: d.precipProb,
    })),
    gradient: pickGradient(w.weatherCode),
  };
}

/** Install a "Share Animated GIF" button into the share modal. */
function installWhatsAppButton(app) {
  const modal = app.$ && app.$.shareModal;
  if (!modal || modal.querySelector("#shareAnimatedBtn")) return;
  const body = modal.querySelector(".p-4.space-y-4") || modal.querySelector(".p-4");
  if (!body) return;

  const section = document.createElement("div");

  const label = document.createElement("label");
  label.className = "block text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2";
  label.textContent = "4. Animated Weather Card (GIF)";

  const row = document.createElement("div");
  row.className = "grid grid-cols-2 gap-2";

  const mkBtn = (id, text, handler, primary) => {
    const b = document.createElement("button");
    b.id = id;
    b.type = "button";
    b.className = primary
      ? "p-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors active:scale-95"
      : "p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors active:scale-95";
    b.textContent = text;
    b.addEventListener("click", handler);
    return b;
  };

  row.append(
    mkBtn("shareAnimatedBtn", "📤 Share GIF", () => shareAnimatedCard.call(app, "native"), true),
    mkBtn("shareAnimatedWhatsApp", "💬 WhatsApp", () => shareAnimatedCard.call(app, "whatsapp"), false),
  );

  section.append(label, row);
  body.appendChild(section);
}