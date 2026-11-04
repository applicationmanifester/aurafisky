// -- SKY GAZING SCORE, GOLDEN/BLUE HOUR & SATELLITE SOLAR PV --
//
// Renders Astrophotography Clarity, Golden Hour Aesthetics (high/mid cloud scattering),
// and Rooftop Solar PV Yield estimation into the Astronomy tab.

const SCORE_COLORS = {
  Excellent: "text-indigo-400",
  Good: "text-sky-500",
  Fair: "text-amber-500",
  Poor: "text-slate-400",
  "Washed Out": "text-slate-400",
  "Pristine Deep-Sky Clarity": "text-indigo-400",
  "Good Astro Conditions": "text-sky-500",
  "Planetary & Lunar Imaging Only": "text-amber-500",
  "Unfavorable for Astrophotography": "text-slate-400",
};

export function updateStargazingWidget(weather, currentDayData, currentTime) {
  const scoreEl = this.$?.stargazingScore || document.getElementById("stargazingScore");
  const labelEl = this.$?.stargazingLabel || document.getElementById("stargazingLabel");
  const goldenEl = this.$?.goldenBlueHourLabel || document.getElementById("goldenBlueHourLabel");

  if (scoreEl && labelEl) {
    const moon = WeatherService.getMoonPhase(currentTime);
    const cloudCover = weather?.cloudCover ?? weather?.cloud_cover ?? null;
    const aqi = this.airQualityData?.current?.us_aqi ?? 50;
    const cloudLow = weather?.cloudCoverLow ?? 0;

    let result = null;
    if (typeof WeatherService.getAstrophotographyClarity === "function") {
      result = WeatherService.getAstrophotographyClarity(
        cloudCover,
        moon?.phase,
        aqi,
        cloudLow,
      );
    } else {
      result = WeatherService.getStargazingScore(cloudCover, moon?.phase);
    }

    if (!result) {
      scoreEl.textContent = "--";
      labelEl.textContent = "--";
      scoreEl.className = "text-2xl font-extrabold text-slate-400 flex-shrink-0";
    } else {
      scoreEl.textContent = `${result.score}`;
      labelEl.textContent = `${result.icon} ${result.label}`;
      const colorClass = SCORE_COLORS[result.label] || "text-slate-400";
      scoreEl.className = `text-2xl font-extrabold flex-shrink-0 ${colorClass}`;
      labelEl.className = `text-xs font-bold mt-1 ${colorClass}`;
    }
  }

  // Golden / Blue Hour Windows + High-Cloud Scattering Aesthetics Score
  if (goldenEl) {
    const window = WeatherService.getGoldenBlueHourWindows(
      currentDayData?.sunrise,
      currentDayData?.sunset,
      currentTime,
    );

    let aestheticsText = "";
    if (typeof WeatherService.getGoldenHourAesthetics === "function") {
      const aesthetics = WeatherService.getGoldenHourAesthetics(
        weather?.cloudCoverLow ?? 0,
        weather?.cloudCoverMid ?? 0,
        weather?.cloudCoverHigh ?? 0,
        weather?.cloudCover ?? 0,
      );
      if (aesthetics?.score >= 60) {
        aestheticsText = ` · ${aesthetics.icon} ${aesthetics.label}`;
      }
    }

    if (!window) {
      goldenEl.textContent = aestheticsText.replace(/^ · /, "") || "";
    } else if (currentTime >= window.start && currentTime <= window.end) {
      const remainMin = Math.max(0, Math.round((window.end - currentTime) / 60000));
      goldenEl.textContent = `📷 ${window.label} — ${remainMin}m left${aestheticsText}`;
    } else {
      const untilMin = Math.max(0, Math.round((window.start - currentTime) / 60000));
      const h = Math.floor(untilMin / 60);
      const m = untilMin % 60;
      const untilStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
      goldenEl.textContent = `📷 ${window.label} in ${untilStr}${aestheticsText}`;
    }
  }

  // Update Rooftop Solar PV Yield Card
  updateSolarPvWidget.call(this, weather, currentDayData, currentTime);
}

export function updateSolarPvWidget(weather, currentDayData, currentTime) {
  const badgeEl = document.getElementById("solarPvStatusBadge");
  const liveEl = document.getElementById("solarLiveWatts");
  const dailyEl = document.getElementById("solarDailyKwhM2");
  const arrayEl = document.getElementById("solarArrayDailyKwh");
  const ratioEl = document.getElementById("solarDirectDiffuseRatio");

  if (!liveEl || !weather) return;

  const pv = WeatherService.getSolarPvYield?.(weather) || {
    instantaneousYieldWatts: 0,
    arrayPowerWatts: 0,
    directNormalWatts: 0,
    diffuseWatts: 0,
    status: "Idle / Night",
  };

  const dateStr = weather?.time ? weather.time.split("T")[0] : "";
  const dailyPv = WeatherService.getDailySolarPvYield?.(this.weatherData, dateStr) || {
    totalKwhM2: 0,
    standardArrayTotalKwh: 0,
  };

  if (liveEl) liveEl.textContent = `${pv.instantaneousYieldWatts} W/m²`;
  if (dailyEl) dailyEl.textContent = `${dailyPv.totalKwhM2} kWh`;
  if (arrayEl) arrayEl.textContent = `${dailyPv.standardArrayTotalKwh} kWh`;
  if (ratioEl) ratioEl.textContent = `${pv.directNormalWatts} / ${pv.diffuseWatts} W`;

  if (badgeEl) {
    badgeEl.textContent = pv.status;
    badgeEl.className = pv.instantaneousYieldWatts >= 120
      ? "text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : (pv.instantaneousYieldWatts >= 30
          ? "text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400"
          : "text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400");
  }
}

export function init(app) {
  app.updateStargazingWidget = updateStargazingWidget;
  app.updateSolarPvWidget = updateSolarPvWidget;
}
