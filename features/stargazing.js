// -- SKY GAZING SCORE & GOLDEN/BLUE HOUR --
//
// Renders WeatherService.getStargazingScore() and getGoldenBlueHourWindows()
// (see weather.js) into the Astronomy card. Pure display logic — the scoring
// math itself lives in weather.js next to the other index-style scores
// (comfort index, etc.) so it's unit-testable the same way they are.

const SCORE_COLORS = {
  Excellent: "text-indigo-400",
  Good: "text-sky-500",
  Fair: "text-amber-500",
  Poor: "text-slate-400",
  "Washed Out": "text-slate-400",
};

function updateStargazingWidget(weather, currentDayData, currentTime) {
    const scoreEl = this.$?.stargazingScore || document.getElementById("stargazingScore");
    const labelEl = this.$?.stargazingLabel || document.getElementById("stargazingLabel");
    const goldenEl = this.$?.goldenBlueHourLabel || document.getElementById("goldenBlueHourLabel");
    if (!scoreEl || !labelEl) return;

    const moon = WeatherService.getMoonPhase(currentTime);
    const cloudCover = weather?.cloudCover ?? weather?.cloud_cover ?? null;
    const result = WeatherService.getStargazingScore(
      cloudCover,
      moon?.phase,
    );

    if (!result) {
      scoreEl.textContent = "--";
      labelEl.textContent = "--";
      scoreEl.className =
        "text-2xl font-extrabold text-slate-400 flex-shrink-0";
    } else {
      scoreEl.textContent = `${result.score}`;
      labelEl.textContent = `${result.icon} ${result.label}`;
      const colorClass = SCORE_COLORS[result.label] || "text-slate-400";
      scoreEl.className = `text-2xl font-extrabold flex-shrink-0 ${colorClass}`;
      labelEl.className = `text-xs font-bold mt-1 ${colorClass}`;
    }

    if (goldenEl) {
      const window = WeatherService.getGoldenBlueHourWindows(
        currentDayData?.sunrise,
        currentDayData?.sunset,
        currentTime,
      );

      if (!window) {
        goldenEl.textContent = "";
      } else if (currentTime >= window.start && currentTime <= window.end) {
        const remainMin = Math.max(0, Math.round((window.end - currentTime) / 60000));
        goldenEl.textContent = `📷 ${window.label} — ${remainMin}m left`;
      } else {
        const untilMin = Math.max(0, Math.round((window.start - currentTime) / 60000));
        const h = Math.floor(untilMin / 60);
        const m = untilMin % 60;
        const untilStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
        goldenEl.textContent = `📷 ${window.label} in ${untilStr}`;
      }
    }
  }

export function init(app) {
  app.updateStargazingWidget = updateStargazingWidget;
}
