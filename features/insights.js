// -- BEST OUTDOOR WINDOW --

function renderBestOutdoorWindow(startIdx) {
    const bestWindow = WeatherService.findBestOutdoorWindow(
      this.weatherData,
      startIdx,
    );

    if (!bestWindow) {
      this.$.bestWindowCard.classList.add("hidden");
      return;
    }

    const startTime = WeatherService.formatTimeOnly(bestWindow.startTime);
    const endTime = WeatherService.formatTimeOnly(bestWindow.endTime);

    this.$.bestWindowText.textContent = `${startTime} – ${endTime} (${bestWindow.hours}h, avg ${WeatherService.formatTemp(bestWindow.avgTemp)}, no rain)`;
    this.$.bestWindowCard.classList.remove("hidden");
  }

// -- 7-DAY HORIZONTAL FORECAST & TEMPORAL GRID --

function renderTemporalGrid(matrices) {
    if (!this.$.dailyForecast) return;
    const weatherData = this.weatherData;
    if (!weatherData) return;

    const dailyList = WeatherService.getDailyForecast ? WeatherService.getDailyForecast(weatherData) : [];
    const todayStr = new Date().toLocaleDateString("en-CA");

    let daysToRender = [];
    if (dailyList && dailyList.length > 0) {
      const todayIdx = dailyList.findIndex((d) => d.date >= todayStr);
      daysToRender = todayIdx >= 0 ? dailyList.slice(todayIdx, todayIdx + 7) : dailyList.slice(0, 7);
    } else if (matrices && matrices.length > 0) {
      daysToRender = matrices.filter((m) => m.date >= todayStr).slice(0, 7);
    }

    if (daysToRender.length === 0) return;

    const cardsHTML = daysToRender
      .map((day, i) => {
        const isToday = day.date === todayStr || i === 0;
        const dayLabel = isToday ? "Today" : WeatherService.formatDayLabel(day.date);

        let dateFormatted = "";
        try {
          const parsed = WeatherService.parseIsoLocal(day.date);
          dateFormatted = parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        } catch {
          dateFormatted = day.date || "";
        }

        const icon = day.icon || "🌤️";
        const desc = day.description || "Fair";
        const maxT = WeatherService.formatTemp(day.maxTemp);
        const minT = WeatherService.formatTemp(day.minTemp);
        const precipProb = day.precipProb != null && day.precipProb > 0 ? Math.round(day.precipProb) : 0;

        // Mini 3-hour diurnal pattern strip from matrices
        const matrixDay = matrices ? matrices.find((m) => m.date === day.date) : null;
        let miniBlocksHTML = "";
        if (matrixDay && matrixDay.blocks && matrixDay.blocks.length > 0) {
          const blocks = matrixDay.blocks
            .map(
              (b) =>
                `<span class="w-2.5 h-2.5 rounded-[2px] flex items-center justify-center text-[7px] select-none" style="background:${this._blockColor(b.code, b.hour)}" title="${b.hour}:00 - ${b.hour + 3}:00: ${b.icon}"></span>`,
            )
            .join("");
          miniBlocksHTML = `<div class="flex items-center gap-[2px] mt-2 pt-1.5 border-t border-slate-200/50 dark:border-slate-700/40 w-full justify-center" title="3-hour diurnal pattern">${blocks}</div>`;
        }

        return `
        <div class="daily-card-horizontal min-w-[110px] sm:min-w-[120px] max-w-[130px] flex-shrink-0 flex flex-col items-center justify-between p-3 rounded-2xl ${isToday ? "bg-primary/10 border-primary/30 ring-1 ring-primary/40" : "bg-slate-100/70 dark:bg-slate-800/60 hover:bg-slate-200/80 dark:hover:bg-slate-700/70 border-slate-200/60 dark:border-slate-700/50"} border shadow-xs transition-all select-none cursor-pointer active:scale-95 text-center snap-start group" data-date="${day.date}" aria-label="${dayLabel}, ${dateFormatted}: ${desc}, High ${maxT}, Low ${minT}">
          <div class="flex flex-col items-center w-full">
            <span class="text-xs font-bold ${isToday ? "text-primary dark:text-primary-light" : "text-slate-800 dark:text-slate-100"}">${dayLabel}</span>
            <span class="text-[10px] font-medium text-slate-400 dark:text-slate-500">${dateFormatted}</span>
          </div>

          <div class="my-1.5 flex flex-col items-center">
            <span class="text-3xl filter drop-shadow-xs transition-transform group-hover:scale-110 duration-200" aria-hidden="true">${icon}</span>
            <span class="text-[10px] font-medium text-slate-600 dark:text-slate-300 mt-1 line-clamp-1 max-w-[95px]">${desc}</span>
          </div>

          <div class="h-4 flex items-center justify-center">
            ${precipProb > 0 ? `<span class="text-[10px] font-semibold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded-full">💧 ${precipProb}%</span>` : ""}
          </div>

          <div class="mt-1.5 w-full flex items-baseline justify-center gap-1.5 font-semibold">
            <span class="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">${maxT}</span>
            <span class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">${minT}</span>
          </div>

          ${miniBlocksHTML}
        </div>
      `;
      })
      .join("");

    this.setSafeHTML(this.$.dailyForecast, cardsHTML);

    const highlightsEl = document.getElementById("dailyOutlookHighlights");
    if (highlightsEl) {
      const maxT = Math.max(...daysToRender.map((d) => d.maxTemp).filter((v) => typeof v === 'number'));
      const minT = Math.min(...daysToRender.map((d) => d.minTemp).filter((v) => typeof v === 'number'));
      const maxP = Math.max(...daysToRender.map((d) => d.precipProb || 0).filter((v) => typeof v === 'number'));
      const bestDay = daysToRender.reduce((best, curr) => (!best || (curr.precipProb || 0) < (best.precipProb || 0) ? curr : best), null);

      const summaryHTML = `
         <div class="bg-slate-100/60 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/40 dark:border-slate-700/30">
           <div class="text-[10px] text-slate-400 font-medium">🌡️ 7-Day Peak</div>
           <div class="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">${WeatherService.formatTemp(maxT)}</div>
           <div class="text-[9px] text-slate-400 mt-0.5">Low ${WeatherService.formatTemp(minT)}</div>
         </div>
         <div class="bg-slate-100/60 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/40 dark:border-slate-700/30">
           <div class="text-[10px] text-slate-400 font-medium">💧 Rain Expectation</div>
           <div class="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">${maxP}% peak</div>
           <div class="text-[9px] text-slate-400 mt-0.5">7-day risk index</div>
         </div>
         <div class="bg-slate-100/60 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/40 dark:border-slate-700/30">
           <div class="text-[10px] text-slate-400 font-medium">☀️ Clearest Window</div>
           <div class="text-xs font-bold text-slate-800 dark:text-slate-100 mt-0.5">${bestDay?.dayLabel || 'Midweek'}</div>
           <div class="text-[9px] text-slate-400 mt-0.5">Low rain probability</div>
         </div>
         <div class="bg-slate-100/60 dark:bg-slate-800/50 p-2.5 rounded-xl border border-slate-200/40 dark:border-slate-700/30">
           <div class="text-[10px] text-slate-400 font-medium">🎯 Forecast Stability</div>
           <div class="text-xs font-bold text-teal-600 dark:text-teal-400 mt-0.5">High Stability</div>
           <div class="text-[9px] text-slate-400 mt-0.5">Multi-model agreement</div>
         </div>
      `;
      this.setSafeHTML(highlightsEl, summaryHTML);
      highlightsEl.classList.remove("hidden");
    }

    // Bind interactive click handlers to scrub timeline to the selected day's noon
    if (this.weatherData?.hourly?.time) {
      this.$.dailyForecast.querySelectorAll(".daily-card-horizontal").forEach((card) => {
        card.addEventListener("click", () => {
          const date = card.dataset.date;
          if (!date) return;
          const times = this.weatherData.hourly.time;
          let targetIdx = times.findIndex((t) => t.startsWith(date + "T12"));
          if (targetIdx < 0) {
            targetIdx = times.findIndex((t) => t.startsWith(date));
          }
          if (targetIdx >= 0) {
            const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
            const sliderVal = targetIdx - timeOffset;
            if (this.$.timelineSlider) {
              this.$.timelineSlider.value = sliderVal;
              this.handleTimelineChange(sliderVal);
              this._haptic("light");
            }
          }
        });
      });
    }
  }

function _blockColor(code, hour) {
    const isDay = hour >= 6 && hour < 18;
    if (code === 0 || code === 1)
      return isDay ? "rgba(253,224,71,0.15)" : "rgba(148,163,184,0.1)";
    if (code >= 2 && code <= 3) return "rgba(148,163,184,0.2)";
    if (code >= 45 && code <= 48) return "rgba(148,163,184,0.15)";
    if (code >= 51 && code <= 57) return "rgba(96,165,250,0.2)";
    if (code >= 61 && code <= 67) return "rgba(59,130,246,0.25)";
    if (code >= 71 && code <= 77) return "rgba(167,243,208,0.2)";
    if (code >= 80 && code <= 82) return "rgba(59,130,246,0.3)";
    if (code >= 85 && code <= 86) return "rgba(167,243,208,0.25)";
    if (code >= 95) return "rgba(168,85,247,0.25)";
    return isDay ? "rgba(253,224,71,0.08)" : "rgba(148,163,184,0.05)";
  }

// -- COMFORT INDEX DISPLAY --

function updateComfortDisplay(score, info) {
    if (score == null || !info) {
      this.$.comfortIndex.textContent = "--";
      this.$.comfortLabel.textContent = "";
      return;
    }
    this.$.comfortIndex.textContent = `${score}`;
    this.$.comfortIndex.className = `text-lg font-extrabold ${info.color}`;
    this.$.comfortLabel.textContent = `${info.icon} ${info.label}`;
    this.$.comfortLabel.className = `text-[10px] font-semibold ${info.color}`;
  }

// -- PRESSURE TENDENCY --

function updatePressureTendency(tendency) {
    if (!tendency) {
      this.$.pressureTendency.textContent = "";
      return;
    }
    const emoji =
      tendency.direction === "falling"
        ? "📉"
        : tendency.direction === "rising"
          ? "📈"
          : "➡️";
    this.$.pressureTendency.textContent = `${emoji} ${tendency.label} (${tendency.rate.toFixed(1)} hPa/h) — ${tendency.desc}`;
    this.$.pressureTendency.className = `text-[10px] font-medium mt-0.5 ${
      tendency.direction === "falling"
        ? "text-red-500"
        : tendency.direction === "rising"
          ? "text-emerald-500"
          : "text-slate-400"
    }`;
  }

function updateTempDelta(hourIndex) {
    if (!this.weatherData || hourIndex <= 0) {
      this.$.panelTempDelta.classList.add("hidden");
      return;
    }
    const prev = WeatherService.getHourlyAtIndex(
      this.weatherData,
      hourIndex - 1,
    );
    const curr = WeatherService.getHourlyAtIndex(this.weatherData, hourIndex);
    if (
      !prev ||
      !curr ||
      curr.temperature == null ||
      prev.temperature == null
    ) {
      this.$.panelTempDelta.classList.add("hidden");
      return;
    }
    const diff = curr.temperature - prev.temperature;
    if (Math.abs(diff) < 0.5) {
      this.$.panelTempDelta.classList.add("hidden");
      return;
    }
    const arrow = diff > 0 ? "▲" : "▼";
    const cls = diff > 0 ? "text-red-500" : "text-blue-500";
    this.$.panelTempDelta.textContent = `${arrow} ${diff > 0 ? "+" : ""}${diff.toFixed(1)}°`;
    this.$.panelTempDelta.className = `text-xs font-semibold ${cls}`;
    this.$.panelTempDelta.classList.remove("hidden");
  }

// -- TIMELINE DELTAS (rate of change) --

function renderTimelineDeltas(deltas) {
    if (!deltas || !this.$.timelineDelta) {
      if (this.$.timelineDelta) this.$.timelineDelta.textContent = "";
      return;
    }
    const parts = [];
    const hasMomentum = this.$.momentumLabel && this.$.momentumLabel.innerHTML.trim() !== "";
    if (deltas.tempDiff != null && !hasMomentum) {
      const sign = deltas.tempDiff > 0 ? "+" : "";
      const cls =
        deltas.tempDiff > 0
          ? "text-red-400"
          : deltas.tempDiff < 0
            ? "text-blue-400"
            : "text-slate-400";
      parts.push(
        `<span class="${cls}">${sign}${deltas.tempDiff.toFixed(1)}°C/h</span>`,
      );
    }
    if (deltas.windDiff != null && Math.abs(deltas.windDiff) >= 1) {
      const sign = deltas.windDiff > 0 ? "+" : "";
      parts.push(
        `<span class="text-slate-400">${sign}${deltas.windDiff.toFixed(0)} km/h wind</span>`,
      );
    }
    if (deltas.pressureDiff != null && Math.abs(deltas.pressureDiff) >= 0.2) {
      const sign = deltas.pressureDiff > 0 ? "+" : "";
      const cls =
        deltas.pressureDiff > 0.3
          ? "text-emerald-500"
          : deltas.pressureDiff < -0.3
            ? "text-red-500"
            : "text-slate-400";
      parts.push(
        `<span class="${cls}">${sign}${deltas.pressureDiff.toFixed(1)} hPa</span>`,
      );
    }
    this.setSafeHTML(this.$.timelineDelta, parts.join(" · "));
    this.$.timelineDelta.className = "text-[10px] font-medium hidden md:inline-block text-slate-500 dark:text-slate-400 truncate";
  }

// -- NEXT RAIN BUTTON --

function updateNextRainButton(currentIdx) {
    const nextRain = WeatherService.findNextRainHour(
      this.weatherData,
      currentIdx,
    );
    if (nextRain != null) {
      this.$.nextRainBtn.classList.remove("hidden");
      const timeStr = WeatherService.formatTimeOnly(
        this.weatherData.hourly.time[nextRain]
      );
      // Use textContent to avoid innerHTML injection
      this.$.nextRainBtn.textContent = `🌧️ Next rain ${timeStr}`;
      // Store the target index for the click handler (#2)
      this.$.nextRainBtn.dataset.rainIdx = nextRain;
    } else {
      this.$.nextRainBtn.classList.add("hidden");
    }
  }

  /** Jumps timeline to the next forecasted rain hour (#2). */
function jumpToNextRain() {
    const idx = parseInt(this.$.nextRainBtn.dataset.rainIdx, 10);
    if (!isNaN(idx)) {
      const timeOffset = this.timeline24hMode ? this._getTimelineOffset() : 0;
      const sliderVal = idx - timeOffset;
      this.$.timelineSlider.value = sliderVal;
      this.handleTimelineChange(sliderVal);
    }
  }

// -- PREDICTIVE ARRIVAL (weather coming your way) --

async function updatePredictiveArrival(weather, hourIndex) {
    if (!weather || !this.weatherData || !this.$.predictiveArrival) return;
    const windDir = weather.windDirection;
    if (windDir == null || windDir < 0) {
      this.$.predictiveArrival.classList.add("hidden");
      return;
    }
    const upwind = WeatherService.getUpwindPoint(
      this.selectedLat,
      this.selectedLng,
      windDir,
    );
    if (!upwind) {
      this.$.predictiveArrival.classList.add("hidden");
      return;
    }

    const lastWinder = this._lastPredictiveWindDir;
    if (lastWinder != null && Math.abs(windDir - lastWinder) < 22.5) {
      const lastData = this._lastPredictiveUpwindData;
      if (
        lastData &&
        lastData.lat === upwind.lat &&
        lastData.lng === upwind.lng
      ) {
        const nowIdx = WeatherService.getCurrentHourIndex(lastData.data);
        const upwindWeather = WeatherService.getHourlyAtIndex(
          lastData.data,
          nowIdx,
        );
        if (upwindWeather) {
          const travelHours = 2;
          const predHTML = `<span class="text-[10px] font-bold text-teal-500 uppercase tracking-wider">🌬️ Coming your way</span><span class="text-xs text-slate-600 dark:text-slate-300">${upwindWeather.icon} ${upwindWeather.description}, ${WeatherService.formatTemp(upwindWeather.temperature)} arriving in ~${travelHours}h from the ${WeatherService.getWindDirection(windDir)}</span>`;
          this.setSafeHTML(this.$.predictiveArrival, predHTML);
          this.$.predictiveArrival.classList.remove("hidden");
          return;
        }
      }
    }
    this._lastPredictiveWindDir = windDir;

    let upwindData = null;
    try {
      upwindData = await WeatherService.fetchForecast(upwind.lat, upwind.lng);
    } catch {
      this.$.predictiveArrival.classList.add("hidden");
      return;
    }
    this._lastPredictiveUpwindData = {
      data: upwindData,
      lat: upwind.lat,
      lng: upwind.lng,
    };

    const nowIdx = WeatherService.getCurrentHourIndex(
      upwindData,
      upwindData?.utc_offset_seconds || 0,
    );
    const upwindWeather = WeatherService.getHourlyAtIndex(upwindData, nowIdx);
    if (!upwindWeather) {
      this.$.predictiveArrival.classList.add("hidden");
      return;
    }

    const travelHours = 2;
    const predHTML = `<span class="text-[10px] font-bold text-teal-500 uppercase tracking-wider">🌬️ Coming your way</span><span class="text-xs text-slate-600 dark:text-slate-300">${upwindWeather.icon} ${upwindWeather.description}, ${WeatherService.formatTemp(upwindWeather.temperature)} arriving in ~${travelHours}h from the ${WeatherService.getWindDirection(windDir)}</span>`;
    this.setSafeHTML(this.$.predictiveArrival, predHTML);
    this.$.predictiveArrival.classList.remove("hidden");
  }

// -- UV INDEX FORECAST CHART --

function renderUVChart() {
    const data = WeatherService.getWeeklyUV(this.weatherData);
    const svg = this.$.uvChart;
    if (!data || data.length < 2 || !svg) return;
    const maxUV = Math.max(...data.map((d) => d.uv), 1);
    const w = 280,
      h = 80,
      pad = 4;
    const cw = (w - pad * 2) / (data.length - 1);
    const bars = data.map((d, i) => ({
      x: pad + i * cw,
      h: (d.uv / maxUV) * (h - pad * 2 - 8),
      uv: d.uv,
      label: WeatherService.parseIsoLocal(d.date)
        .toLocaleDateString("en-US", { weekday: "short" })
        .slice(0, 2),
    }));
    svg.innerHTML = bars
      .map(
        (b) =>
          `<rect x="${b.x}" y="${h - pad - b.h}" width="${Math.max(4, cw - 4)}" height="${b.h}" rx="2" fill="${b.uv >= 6 ? "#f59e0b" : b.uv >= 3 ? "#fbbf24" : "#10b981"}" opacity="0.8"/>
       <text x="${b.x + cw / 2}" y="${h - 2}" font-size="7" fill="#94a3b8" text-anchor="middle" font-weight="600">${b.label}</text>
       <text x="${b.x + cw / 2}" y="${h - pad - b.h - 3}" font-size="7" fill="#64748b" text-anchor="middle" font-weight="700">${b.uv.toFixed(1)}</text>`,
      )
      .join("");
  }

  // ================================================================

// -- ADVANCED FEATURE METHODS --

function updateTrustScore(trust) {
    if (!this.$.trustScore) return;
    if (!trust) {
      this.$.trustScore.textContent = "";
      return;
    }
    const color =
      trust.overall >= 80
        ? "text-emerald-500"
        : trust.overall >= 60
          ? "text-amber-500"
          : "text-red-500";
    this.$.trustScore.textContent = `🎯 ${trust.overall}% trust (temp ${trust.temp}%, wind ${trust.wind}%, precip ${trust.precip}%)`;
    this.$.trustScore.className = `text-[9px] font-semibold ${color}`;
  }

function updateParamImportance(importance) {
    if (!importance || importance.length === 0 || !this.$.paramImportance) {
      this.$.paramImportance.textContent = "";
      return;
    }
    this.$.paramImportance.innerHTML =
      "🔍 " +
      importance
        .map(
          (p) =>
            `<span class="font-bold ${p.impact > 10 ? "text-red-500" : "text-amber-500"}">${p.key}</span>`,
        )
        .join(" > ") +
      " limiting comfort";
    this.$.paramImportance.className = "text-[10px] text-slate-400";
  }

function toggleSignalNoiseView() {
    this.showSignal = !this.showSignal;
    this.$.signalNoiseBtn.classList.toggle("toggle-active", this.showSignal);
    if (this.weatherData) {
      this.drawHourlySparkline(parseInt(this.$.timelineSlider.value, 10));
    }
  }

function generateBriefing() {
    const hourIdx = parseInt(this.$.timelineSlider.value, 10);
    const weather = WeatherService.getHourlyAtIndex(this.weatherData, hourIdx);
    if (!weather) return;
    const aqiVal = this.airQualityData?.hourly?.us_aqi[hourIdx];
    const tendency = WeatherService.getPressureTendency(
      this.weatherData,
      hourIdx,
    );
    const windShift = WeatherService.getWindShift(this.weatherData, hourIdx);
    const anomaly = WeatherService.detectAnomaly(
      weather.temperature,
      this._historicalResults,
    );
    const daily = WeatherService.getDailyForecast(this.weatherData);
    const briefing = WeatherService.generateBriefing(
      weather,
      daily,
      aqiVal,
      tendency,
      windShift,
      anomaly,
      this.weatherData?.timezone,
      this.weatherData?.utc_offset_seconds,
    );
    if (this.$.briefingContent) {
      this.$.briefingContent.textContent = briefing;
      this.$.briefingContent.classList.remove("hidden");
    }
    this.showToast("📡 Briefing generated", "success");
  }

export function init(app) {
  app.renderBestOutdoorWindow = renderBestOutdoorWindow;
  app.renderTemporalGrid = renderTemporalGrid;
  app._blockColor = _blockColor;
  app.updateComfortDisplay = updateComfortDisplay;
  app.updatePressureTendency = updatePressureTendency;
  app.updateTempDelta = updateTempDelta;
  app.renderTimelineDeltas = renderTimelineDeltas;
  app.updateNextRainButton = updateNextRainButton;
  app.jumpToNextRain = jumpToNextRain;
  app.updatePredictiveArrival = updatePredictiveArrival;
  app.renderUVChart = renderUVChart;
  app.updateTrustScore = updateTrustScore;
  app.updateParamImportance = updateParamImportance;
  app.toggleSignalNoiseView = toggleSignalNoiseView;
  app.generateBriefing = generateBriefing;
}
