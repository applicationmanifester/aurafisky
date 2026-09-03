// -- CLIMATE TIME-MACHINE --

function toggleClimateTimeMachine() {
    const drawer = this.$.timeMachineDrawer;
    const chevron = this.$.timeMachineChevron;
    const isClosed = drawer.classList.contains("hidden");

    if (isClosed) {
      drawer.classList.remove("hidden");
      chevron.classList.add("rotate-180");
      this.loadClimateTimeMachineData();
    } else {
      this.closeClimateTimeMachine();
    }
  }

function closeClimateTimeMachine() {
    this.$.timeMachineDrawer.classList.add("hidden");
    this.$.timeMachineChevron.classList.remove("rotate-180");
  }

async function loadClimateTimeMachineData() {
    const activeHourIdx = parseInt(this.$.timelineSlider.value, 10);
    const weather = WeatherService.getHourlyAtIndex(
      this.weatherData,
      activeHourIdx,
    );
    if (!weather) return;

    const parts = weather.time.split("T");
    if (parts.length < 2) return;
    const dateParts = parts[0].split("-");
    const year = parseInt(dateParts[0], 10);
    const month = dateParts[1];
    const day = dateParts[2];

    const yearsPast = [5, 10, 20];
    const dates = yearsPast.map((y) => `${year - y}-${month}-${day}`);

    const cacheKey = `climate_${this.selectedLat.toFixed(3)}_${this.selectedLng.toFixed(3)}_${month}-${day}`;
    if (this._climateCache?.key === cacheKey) {
      // Bug fix: this called a nonexistent renderClimateTimeMachineData(),
      // which threw uncaught (outside the try/catch below) and silently
      // broke the cache-hit path. The real renderer is renderClimateTimeMachine,
      // taking (yearsPast, results, currentTemp) — matches the call below.
      this.renderClimateTimeMachine(yearsPast, this._climateCache.results, weather.temperature);
      return;
    }

    this.$.timeMachineRows.innerHTML = `
      <div class="flex items-center justify-center py-4">
        <div class="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
      </div>
    `;
    this.$.timeMachinePoints.innerHTML = "";
    this.$.timeMachineLine.setAttribute("d", "");

    try {
      // Fetch past records in parallel (deduplicated via in-memory cache in WeatherService)
      const results = await Promise.all(
        dates.map((dateStr) =>
          WeatherService.fetchHistoricalWeather(
            this.selectedLat,
            this.selectedLng,
            dateStr,
          ).catch((e) => {
            console.warn(`Failed to fetch history for ${dateStr}:`, e);
            return null;
          }),
        ),
      );

      this._climateCache = { key: cacheKey, results };
      this._historicalResults = results;
      this.renderClimateTimeMachine(yearsPast, results, weather.temperature);

      // Find analog year
      const analog = WeatherService.findAnalogDay(this.weatherData, results);
      if (analog && this.$.analogLabel) {
        this.$.analogLabel.textContent = `📅 Most like ${analog.year} years ago: ${analog.icon} ${analog.desc}, ${Math.round(analog.temp)}°C`;
        this.$.analogLabel.className =
          "text-[10px] font-semibold text-emerald-500 dark:text-emerald-400 mt-1";
        this.$.analogLabel.classList.remove("hidden");
      }
    } catch (e) {
      console.error("Time machine load error:", e);
      this.$.timeMachineRows.innerHTML = `<div class="text-[10px] text-red-500 text-center py-2">Failed to load climate history.</div>`;
    }
  }

function renderClimateTimeMachine(yearsPast, results, currentTemp) {
    const historyData = [];

    results.forEach((res, i) => {
      const yearsAgo = yearsPast[i];
      if (res && res.daily && res.daily.temperature_2m_max) {
        const d = res.daily;
        const max = d.temperature_2m_max[0];
        const min = d.temperature_2m_min[0];
        const avg = (max + min) / 2;
        const code = d.weather_code[0] ?? 0;
        const info = WeatherService.getWeatherInfo(code, true);
        const precip = d.precipitation_sum[0] ?? 0;

        historyData.push({
          label: `${yearsAgo} years ago`,
          temp: avg,
          maxTemp: max,
          minTemp: min,
          icon: info.icon,
          description: info.description,
          precip: precip,
        });
      } else {
        historyData.push({
          label: `${yearsAgo} years ago`,
          temp: null,
          maxTemp: null,
          minTemp: null,
          icon: "❓",
          description: "Data unavailable",
          precip: 0,
        });
      }
    });

    // Add current temp
    historyData.push({
      label: "Now",
      temp: currentTemp,
      maxTemp: currentTemp,
      minTemp: currentTemp,
      icon: "📍",
      description: "Active selection",
      precip: 0,
    });

    // Sort chronologically left-to-right: 20 years, 10 years, 5 years, Now
    const chronData = [
      historyData[2], // 20 years
      historyData[1], // 10 years
      historyData[0], // 5 years
      historyData[3], // Now
    ];

    // Render list rows
    const rowsHTML = chronData
      .map((d) => {
        if (d.temp == null) {
          return `
          <div class="flex justify-between items-center text-[10px] text-slate-400 py-0.5">
            <span class="font-medium">${d.label}</span>
            <span>Data unavailable</span>
          </div>
        `;
        }
        return `
        <div class="flex justify-between items-center text-[10px] py-1 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 px-1.5 rounded-md">
          <span class="font-semibold text-slate-500 dark:text-slate-400 w-20 flex-shrink-0">${d.label}</span>
          <span class="text-sm mr-2">${d.icon}</span>
          <span class="text-slate-600 dark:text-slate-300 flex-1 truncate mr-2">${d.description}</span>
          <span class="font-bold text-slate-800 dark:text-slate-100">${Math.round(d.temp)}°C</span>
          <span class="text-[9px] text-slate-400 dark:text-slate-500 ml-1.5 w-12 text-right">${d.precip > 0 ? d.precip.toFixed(1) + "mm" : "Dry"}</span>
        </div>
      `;
      })
      .join("");
    this.setSafeHTML(this.$.timeMachineRows, rowsHTML);

    // Draw mini SVG trend line
    const validTemps = chronData
      .filter((d) => d.temp != null)
      .map((d) => d.temp);
    if (validTemps.length >= 2) {
      const minT = Math.min(...validTemps);
      const maxT = Math.max(...validTemps);
      const tRange = Math.max(1, maxT - minT);

      const width = 200;
      const height = 40;
      const padLeft = 15;
      const padRight = 15;
      const padTop = 10;
      const padBottom = 10;

      const chartW = width - padLeft - padRight;
      const chartH = height - padTop - padBottom;

      const svgPoints = chronData.map((d, idx) => {
        if (d.temp == null) return null;
        const x = padLeft + (idx / 3) * chartW;
        const y = padTop + chartH - ((d.temp - minT) / tRange) * chartH;
        return { x, y, temp: d.temp, label: d.label };
      });

      const cleanPoints = svgPoints.filter((p) => p !== null);

      let pathCmd = `M ${cleanPoints[0].x} ${cleanPoints[0].y}`;
      for (let i = 1; i < cleanPoints.length; i++) {
        pathCmd += ` L ${cleanPoints[i].x} ${cleanPoints[i].y}`;
      }
      this.$.timeMachineLine.setAttribute("d", pathCmd);

      this.$.timeMachinePoints.innerHTML = "";
      cleanPoints.forEach((p) => {
        const circle = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        circle.setAttribute("cx", p.x);
        circle.setAttribute("cy", p.y);
        circle.setAttribute("r", "2.5");
        circle.setAttribute("class", "tm-point");
        circle.setAttribute("title", `${p.label}: ${Math.round(p.temp)}°C`);
        this.$.timeMachinePoints.appendChild(circle);

        const text = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "text",
        );
        text.setAttribute("x", p.x);
        text.setAttribute("y", p.y - 4.5);
        text.setAttribute("class", "tm-text");
        text.textContent = `${Math.round(p.temp)}°`;
        this.$.timeMachinePoints.appendChild(text);
      });
    }

    // Anomaly detection
    const anomaly = WeatherService.detectAnomaly(currentTemp, results);
    if (anomaly && this.$.anomalyLabel) {
      this.$.anomalyLabel.textContent = `⚠️ ${anomaly.label}`;
      this.$.anomalyLabel.className = `text-[10px] font-semibold mt-2 ${
        anomaly.severity === "extreme"
          ? "text-red-500"
          : anomaly.severity === "significant"
            ? "text-orange-500"
            : "text-amber-500"
      }`;
      this.$.anomalyLabel.classList.remove("hidden");
    }

    // Historical pattern mining
    const pattern = WeatherService.getHistoricalPattern(
      this.weatherData,
      results,
    );
    if (pattern && this.$.patternLabel) {
      this.$.patternLabel.textContent = `📊 ${pattern.label}`;
      this.$.patternLabel.className =
        "text-[10px] font-semibold text-teal-500 dark:text-teal-400 mt-1";
      this.$.patternLabel.classList.remove("hidden");
    }
  }

export function init(app) {
  app.toggleClimateTimeMachine = toggleClimateTimeMachine;
  app.closeClimateTimeMachine = closeClimateTimeMachine;
  app.loadClimateTimeMachineData = loadClimateTimeMachineData;
  app.renderClimateTimeMachine = renderClimateTimeMachine;
}
