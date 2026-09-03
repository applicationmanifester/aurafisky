// -- ASTRONOMY & DAY CYCLES --

function updateAstronomyWidget(weather, _hourIndex) {
    if (!this.weatherData) return;

    try {
      const dateStr = weather.time.split("T")[0];
      const daily = WeatherService.getDailyForecast(this.weatherData);
      const currentDayData = daily.find((d) => d.date === dateStr) || daily[0];

      if (
        !currentDayData ||
        !currentDayData.sunrise ||
        !currentDayData.sunset
      ) {
        return;
      }

      const sunriseTime = new Date(currentDayData.sunrise);
      const sunsetTime = new Date(currentDayData.sunset);
      const currentTime = new Date(weather.time);

      // Inside the polar circles the sun can stay up (or down) for the whole
      // day, and the API reports sunrise and sunset as the same instant. That
      // makes the day length zero, so the sun-arc fraction below becomes 0/0
      // — NaN — and every coordinate derived from it lands in the SVG as
      // cx="NaN", cy="NaN", d="…A 45,45 0 0,1 NaN NaN". Bail out to the
      // static arc for those days instead of drawing an invalid one.
      const dayLengthMs = sunsetTime - sunriseTime;
      if (!Number.isFinite(dayLengthMs) || dayLengthMs <= 0) {
        // weather.isDay comes from the API's own is_day flag, so it tells us
        // which of the two cases this is without guessing from latitude.
        this._renderPolarDayCycle(currentTime, weather.isDay === true);
        return;
      }

      const diffMs = sunsetTime - sunriseTime;
      const diffHours = Math.floor(diffMs / 3600000);
      const diffMins = Math.floor((diffMs % 3600000) / 60000);
      this.$.sunDayLength.textContent = `${diffHours}h ${diffMins}m`;

      this.$.sunSunrise.textContent = sunriseTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      this.$.sunSunset.textContent = sunsetTime.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Live sunrise/sunset countdown timer — ticks every minute
      if (this.$.sunCountdown) {
        const updateCountdown = () => {
          const tTime = new Date();
          if (tTime >= sunriseTime && tTime <= sunsetTime) {
            const diff = sunsetTime - tTime;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            this.$.sunCountdown.textContent = `Sunset in ${h}h ${m}m`;
            this.$.sunCountdown.className =
              "text-[7px] text-amber-500 dark:text-amber-400 font-bold mt-0.5";
          } else {
            let nextSunrise = sunriseTime;
            if (tTime > sunsetTime) {
              nextSunrise = new Date(
                sunriseTime.getTime() + 24 * 60 * 60 * 1000,
              );
            }
            const diff = nextSunrise - tTime;
            const h = Math.floor(diff / 3600000);
            const m = Math.floor((diff % 3600000) / 60000);
            this.$.sunCountdown.textContent = `Sunrise in ${h}h ${m}m`;
            this.$.sunCountdown.className =
              "text-[7px] text-emerald-500 dark:text-emerald-400 font-bold mt-0.5";
          }
        };
        updateCountdown();
        // Clear any previous timer before starting a new one
        if (this.sunCountdownTimer) clearInterval(this.sunCountdownTimer);
        this.sunCountdownTimer = setInterval(updateCountdown, 60000);
      }

      // Calculate Sun Arc Dot position
      if (currentTime >= sunriseTime && currentTime <= sunsetTime) {
        const frac = (currentTime - sunriseTime) / (sunsetTime - sunriseTime);
        const angle = Math.PI - frac * Math.PI; // Semicircular bend from PI to 0 radians

        const cx = 50 + 45 * Math.cos(angle);
        const cy = 45 - 45 * Math.sin(angle);

        this.$.sunArcDot.setAttribute("cx", cx);
        this.$.sunArcDot.setAttribute("cy", cy);
        this.$.sunArcDot.setAttribute("fill", "#f59e0b");
        this.$.sunArcDot.setAttribute("r", "4");

        if (this.$.sunArcPassed) {
          this.$.sunArcPassed.setAttribute(
            "d",
            `M 5,45 A 45,45 0 0,1 ${cx} ${cy}`,
          );
        }
      } else {
        // Night position
        const isBeforeSunrise = currentTime < sunriseTime;
        this.$.sunArcDot.setAttribute("cx", isBeforeSunrise ? 5 : 95);
        this.$.sunArcDot.setAttribute("cy", 45);
        this.$.sunArcDot.setAttribute("fill", "#94a3b8");
        this.$.sunArcDot.setAttribute("r", "3");
        if (this.$.sunArcPassed) {
          this.$.sunArcPassed.setAttribute("d", "M 5,45 A 45,45 0 0,1 5,45");
        }
      }

      this._renderMoonPhase(currentTime);
    } catch (e) {
      console.warn("Astronomy widget update failed:", e);
    }
  }

/**
 * Sun widget for a day with no sunrise/sunset — polar day or polar night,
 * which the API reports by giving both the same timestamp. There's no arc
 * position to interpolate on such a day, so show the state plainly instead
 * of computing a fraction of a zero-length day.
 */
function _renderPolarDayCycle(currentTime, isPolarDay) {
    if (this.sunCountdownTimer) {
      clearInterval(this.sunCountdownTimer);
      this.sunCountdownTimer = null;
    }

    this.$.sunDayLength.textContent = isPolarDay ? "24h 0m" : "0h 0m";
    this.$.sunSunrise.textContent = "--:--";
    this.$.sunSunset.textContent = "--:--";

    if (this.$.sunCountdown) {
      this.$.sunCountdown.textContent = isPolarDay ? "Polar day" : "Polar night";
      this.$.sunCountdown.className = isPolarDay
        ? "text-[7px] text-amber-500 dark:text-amber-400 font-bold mt-0.5"
        : "text-[7px] text-slate-400 dark:text-slate-500 font-bold mt-0.5";
    }

    if (this.$.sunArcDot) {
      // Polar day: sun parked at the top of the arc. Polar night: below the
      // horizon line, at the start of the arc, greyed out.
      this.$.sunArcDot.setAttribute("cx", isPolarDay ? "50" : "5");
      this.$.sunArcDot.setAttribute("cy", isPolarDay ? "0" : "45");
      this.$.sunArcDot.setAttribute("fill", isPolarDay ? "#f59e0b" : "#94a3b8");
      this.$.sunArcDot.setAttribute("r", isPolarDay ? "4" : "3");
    }
    if (this.$.sunArcPassed) {
      this.$.sunArcPassed.setAttribute(
        "d",
        isPolarDay ? "M 5,45 A 45,45 0 0,1 95,45" : "M 5,45 A 45,45 0 0,1 5,45",
      );
    }

    this._renderMoonPhase(currentTime);
  }

function _renderMoonPhase(currentTime) {
    const moon = WeatherService.getMoonPhase(currentTime);
    this.$.moonPhaseLabel.textContent = moon.label;
    this.$.moonPhasePercent.textContent = `${Math.round(moon.phase * 100)}%`;
    this.$.moonPhaseDesc.textContent = `${moon.icon} Phase fraction: ${moon.phase.toFixed(2)}`;

    // Draw custom SVG moon shadowing
    this.$.moonLitPath.setAttribute("d", this.getMoonSvgPath(moon.phase));
  }

function getMoonSvgPath(p) {
    const r = 18;

    if (p <= 0.03 || p >= 0.97) {
      return ""; // New Moon - completely dark
    }
    if (p >= 0.47 && p <= 0.53) {
      return `M 20 2 A 18 18 0 0 1 20 38 A 18 18 0 0 1 20 2`; // Full Moon
    }

    if (p < 0.5) {
      // Lit on the right side
      const rx = r - 4 * r * p;
      const sweep = rx < 0 ? 1 : 0;
      return `M 20 2 A 18 18 0 0 1 20 38 A ${Math.abs(rx)} 18 0 0 ${sweep} 20 2`;
    } else {
      // Lit on the left side
      const rx = r - 4 * r * (p - 0.5);
      const sweep = rx < 0 ? 0 : 1;
      return `M 20 2 A 18 18 0 0 0 20 38 A ${Math.abs(rx)} 18 0 0 ${sweep} 20 2`;
    }
  }

export function init(app) {
  app.updateAstronomyWidget = updateAstronomyWidget;
  app.getMoonSvgPath = getMoonSvgPath;
  app._renderPolarDayCycle = _renderPolarDayCycle;
  app._renderMoonPhase = _renderMoonPhase;
}
