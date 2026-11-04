/**
 * CAMS Air Quality, Pollen & Best 2-Hour Outdoor / Running Activity Window
 *
 * Implements the mathematical sliding-window cost function:
 *   S(t) = 0.40(AQI_norm) + 0.25(UV_norm) + 0.20(WBGT_norm) + 0.15(Pollen_norm) + rainPenalty
 *
 * Evaluates 24 consecutive hours forward from current time to pin the prime
 * outdoor exercise / fieldwork / running window at the top of Details & AQI.
 */

export function calculateBestOutdoorWindow(weatherData, airQualityData, currentHourIndex = 0) {
  if (!weatherData?.hourly?.time) return null;
  const h = weatherData.hourly;
  const aqH = airQualityData?.hourly;
  const totalHours = h.time.length;

  const windowHours = 2; // 2-hour window
  const maxSearchHours = Math.min(24, totalHours - currentHourIndex - windowHours);
  if (maxSearchHours <= 0) return null;

  let bestScore = Infinity;
  let bestWindow = null;

  for (let offset = 0; offset <= maxSearchHours; offset++) {
    const idx1 = currentHourIndex + offset;
    const idx2 = idx1 + 1;

    // Disqualification / heavy penalty for precipitation
    const precip1 = h.precipitation?.[idx1] ?? 0;
    const precip2 = h.precipitation?.[idx2] ?? 0;
    const precipProb1 = h.precipitation_probability?.[idx1] ?? 0;
    const precipProb2 = h.precipitation_probability?.[idx2] ?? 0;
    const rainPenalty = (precip1 + precip2 > 0.4 || precipProb1 > 50 || precipProb2 > 50) ? 2.0 : 0;

    // 1. AQI Normalization (0 to 1, where 200 AQI is 1.0)
    const aqi1 = aqH?.us_aqi?.[idx1] ?? 50;
    const aqi2 = aqH?.us_aqi?.[idx2] ?? 50;
    const avgAqi = (aq1Safe(aqi1) + aq1Safe(aqi2)) / 2;
    const aqiNorm = Math.min(1.0, avgAqi / 200);

    // 2. UV Index Normalization (0 to 1, where UV 10 is 1.0)
    const uv1 = h.uv_index?.[idx1] ?? aqH?.uv_index?.[idx1] ?? 0;
    const uv2 = h.uv_index?.[idx2] ?? aqH?.uv_index?.[idx2] ?? 0;
    const avgUv = (Math.max(0, uv1) + Math.max(0, uv2)) / 2;
    const uvNorm = Math.min(1.0, avgUv / 10);

    // 3. Thermal Comfort / WBGT / Apparent Temp Normalization (optimal 15-22°C)
    const temp1 = h.apparent_temperature?.[idx1] ?? h.temperature_2m?.[idx1] ?? 20;
    const temp2 = h.apparent_temperature?.[idx2] ?? h.temperature_2m?.[idx2] ?? 20;
    const avgTemp = (temp1 + temp2) / 2;
    let wbgtNorm = 0;
    if (avgTemp > 22) {
      wbgtNorm = Math.min(1.0, (avgTemp - 22) / 16);
    } else if (avgTemp < 12) {
      wbgtNorm = Math.min(1.0, (12 - avgTemp) / 16);
    }

    // 4. Pollen Index Normalization
    const birch = (aqH?.birch_pollen?.[idx1] ?? 0) + (aqH?.birch_pollen?.[idx2] ?? 0);
    const grass = (aqH?.grass_pollen?.[idx1] ?? 0) + (aqH?.grass_pollen?.[idx2] ?? 0);
    const mugwort = (aqH?.mugwort_pollen?.[idx1] ?? 0) + (aqH?.mugwort_pollen?.[idx2] ?? 0);
    const alder = (aqH?.alder_pollen?.[idx1] ?? 0) + (aqH?.alder_pollen?.[idx2] ?? 0);
    const maxPollen = Math.max(birch, grass, mugwort, alder) / 2;
    const pollenNorm = Math.min(1.0, maxPollen / 80);

    // Composite cost function:
    const score = 0.40 * aqiNorm + 0.25 * uvNorm + 0.20 * wbgtNorm + 0.15 * pollenNorm + rainPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestWindow = {
        startHourIndex: idx1,
        startTime: h.time[idx1],
        endTime: h.time[idx2 + 1] || h.time[idx2],
        score,
        avgAqi: Math.round(avgAqi),
        avgUv: Number(avgUv.toFixed(1)),
        avgTemp: Math.round(avgTemp),
        hasRain: (precip1 + precip2) > 0.1,
        maxPollen: Math.round(maxPollen),
        hoursFromNow: offset,
      };
    }
  }

  return bestWindow;
}

function aq1Safe(val) {
  return Number.isFinite(val) ? val : 50;
}

/**
 * Formats the 2-hour window into readable user-friendly label
 */
export function formatOutdoorWindowLabel(window, utcOffsetSeconds = 0) {
  if (!window || !window.startTime) return { time: "--", detail: "", badge: "--", tone: "neutral" };

  const startD = new Date(window.startTime);
  const endD = new Date(window.endTime);

  const startHourStr = startD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const endHourStr = endD.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  let dayPrefix = "Today";
  const now = new Date();
  if (startD.getDate() !== now.getDate()) {
    dayPrefix = "Tomorrow";
  }

  const timeLabel = `${dayPrefix} ${startHourStr} – ${endHourStr}`;

  let badge = "Prime";
  let tone = "emerald";
  if (window.score > 0.70 || window.hasRain) {
    badge = "Fair";
    tone = "amber";
  } else if (window.score > 0.40) {
    badge = "Good";
    tone = "sky";
  }

  const aqiDesc = window.avgAqi <= 50 ? "Clean Air" : (window.avgAqi <= 100 ? "Moderate AQI" : "Elevated AQI");
  const uvDesc = window.avgUv <= 2 ? "Low UV" : (window.avgUv <= 5 ? "Moderate UV" : "High UV");
  const pollenDesc = window.maxPollen > 50 ? "Elevated Pollen" : "Low Pollen";

  const detail = `${aqiDesc} (${window.avgAqi} AQI) · ${uvDesc} (${window.avgUv}) · ${window.avgTemp}°C · ${pollenDesc}`;

  return {
    time: timeLabel,
    detail,
    badge,
    tone,
  };
}

export function updateBestOutdoorWindowUI(app) {
  const card = document.getElementById("bestOutdoorWindowCard");
  const timeEl = document.getElementById("bestOutdoorWindowTime");
  const detailEl = document.getElementById("bestOutdoorWindowDetail");
  const badgeEl = document.getElementById("bestOutdoorWindowBadge");

  if (!card || !app.weatherData) return;

  const best = calculateBestOutdoorWindow(
    app.weatherData,
    app.airQualityData,
    app.currentHourIndex || 0,
  );

  if (!best) {
    card.classList.add("hidden");
    return;
  }

  const formatted = formatOutdoorWindowLabel(best, app.weatherData?.utc_offset_seconds || 0);

  if (timeEl) timeEl.textContent = formatted.time;
  if (detailEl) detailEl.textContent = formatted.detail;
  if (badgeEl) {
    badgeEl.textContent = formatted.badge;
    badgeEl.className = formatted.tone === "emerald"
      ? "text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-sm"
      : (formatted.tone === "sky"
          ? "text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500 text-white shadow-sm"
          : "text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white shadow-sm");
  }

  card.classList.remove("hidden");
}

export function init(app) {
  app.updateBestOutdoorWindowUI = () => updateBestOutdoorWindowUI(app);
}
