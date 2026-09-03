// -- HOURLY FORECAST SCROLL STRIP --

function renderHourlyStrip(currentIdx) {
    if (!this.weatherData || !this.weatherData.hourly) return;

    const h = this.weatherData.hourly;
    const nowIdx = WeatherService.getCurrentHourIndex(
      this.weatherData,
      this.weatherData?.utc_offset_seconds || 0,
    );
    const limit = Math.min(h.time.length, nowIdx + 48);

    const allHours = [];
    for (let i = nowIdx; i < limit; i++) {
      allHours.push(i);
    }

    this.renderHourlyTabContent(allHours, nowIdx);
  }

function renderHourlyTabContent(hours, nowIdx) {
    const container = this.$.hourlyTabContent;
    if (!container) return;
    const h = this.weatherData.hourly;

    const hourlyHTML = hours
      .map((i) => {
        const temp = h.temperature_2m[i];
        const code = h.weather_code[i];
        const isDay = h.is_day ? h.is_day[i] : 1;
        const info = WeatherService.getWeatherInfo(code, isDay);
        const precipProb = h.precipitation_probability?.[i] || 0;
        const wind = h.wind_speed_10m?.[i];
        const humidity = h.relative_humidity_2m?.[i];
        const isNow = i === nowIdx;
        const timeStr = WeatherService.formatHourLabel(h.time[i], this.weatherData?.utc_offset_seconds);

        return `<button class="hourly-row w-full flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl text-left transition-colors ${isNow ? "bg-primary/10 border border-primary/20" : "hover:bg-slate-100/60 dark:hover:bg-slate-800/40 border border-transparent"}" data-idx="${i}" aria-label="${isNow ? "Now" : timeStr}: ${info.description}">
<span class="w-7 sm:w-10 text-[9px] sm:text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex-shrink-0">${isNow ? "Now" : timeStr}</span>
<span class="text-base sm:text-lg flex-shrink-0 w-5 sm:w-7 text-center">${info.icon}</span>
<span class="w-7 sm:w-10 text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 flex-shrink-0">${WeatherService.formatTemp(temp)}</span>
${precipProb > 0 ? `<span class="text-[9px] sm:text-[10px] text-blue-500 font-semibold w-7 sm:w-10 flex-shrink-0">${precipProb}%</span>` : '<span class="w-7 sm:w-10 flex-shrink-0"></span>'}
<span class="text-[9px] sm:text-[10px] text-slate-400 flex-1 min-w-0 truncate">${wind != null ? `💨 ${WeatherService.formatWind(wind)}` : ""}</span>
<span class="text-[9px] sm:text-[10px] text-slate-400 w-7 sm:w-10 flex-shrink-0 text-right">${humidity != null ? `💧${humidity}%` : ""}</span>
</button>`;
      })
      .join("");

    container.querySelectorAll(".hourly-row").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.idx, 10);
        this.$.timelineSlider.value = idx;
        this.handleTimelineChange(idx);
      });
    });
  }

export function init(app) {
  app.renderHourlyStrip = renderHourlyStrip;
  app.renderHourlyTabContent = renderHourlyTabContent;
}
