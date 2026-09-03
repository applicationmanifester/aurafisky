// -- EXTREME MINIMAL MODE --

function toggleMinimalMode() {
    this.minimalMode = !this.minimalMode;
    document.documentElement.classList.toggle("compact", this.minimalMode);
    
    const panel = this.$.weatherPanel;
    if (this.currentLocation || this.selectedLat != null) {
      panel.classList.add("open");
    }
    panel.classList.remove("minimized");
    
    this.updateSettingsUIFromLocal();
    this.saveUserDataToCloud();
  }

function rebindPanelEvents() {
    const ids = [
      "panelCloseBtn",
      "panelMinimizeBtn",
      "homeToggleBtn",
      "homeOutlineIcon",
      "favoriteToggleBtn",
      "starOutlineIcon",
      "starFilledIcon",
      "shareWeatherBtn",
      "panelLocationName",
      "panelTempDelta",
      "panelTimeLabel",
      "panelIcon",
      "panelTemp",
      "panelDescription",
      "panelFeelsLike",
      "panelHumidity",
      "panelWind",
      "windArrow",
      "panelDewPoint",
      "panelWindGusts",
      "panelVisibility",
      "panelPressure",
      "pressureTendency",
      "panelClouds",
      "panelUV",
      "panelPrecip",
      "aqiCard",
      "panelAQILabel",
      "panelAQIMetrics",
      "panelAQIBadge",
      "advisoryBanner",
      "advisoryIcon",
      "advisoryTitle",
      "advisoryDesc",
      "comfortIndex",
      "comfortLabel",
      "hourlyStrip",
      "bestWindowCard",
      "bestWindowText",
      "dailyForecast",
      "trendSvg",
      "chartHours",
      "chartLine",
      "chartArea",
      "chartPoints",
      "timeMachineTrigger",
      "timeMachineChevron",
      "timeMachineDrawer",
      "timeMachineSvg",
      "timeMachineLine",
      "timeMachinePoints",
      "timeMachineRows",
      "offlineTimeMachineBadge",
      "predictiveArrival",
      "anomalyLabel",
      "patternLabel",
      "nextRainBtn",
      "timelineDelta",
      "sunArcPassed",
      "sunArcDot",
      "sunSunrise",
      "sunSunset",
      "sunDayLength",
      "sunCountdown",
      "moonLitPath",
      "moonPhaseLabel",
      "moonPhasePercent",
      "moonPhaseDesc",
      "confidenceToggle",
      "signalNoiseBtn",
      "percentileLabel",
      "trustScore",
      "momentumLabel",
      "cumulativeCurve",
      "paramImportance",
      "freshnessLabel",
      "briefingBtn",
      "briefingContent",
      "regimeLabel",
      "spatialGradLabel",
      "analogLabel",
      "weatherPanelSkeleton",
      "weatherPanelContent",
      "pollenCard",
      "pollenBirch",
      "pollenGrass",
      "pollenMugwort",
      "pollenAlder",
      "uvChart",
      "zoomInBtn",
      "zoomOutBtn",
    ];

    // Detach old listeners before rebinding to prevent duplicates
    if (this._rebindCleanups) {
      this._rebindCleanups.forEach((fn) => fn());
    }
    this._rebindCleanups = [];

    const addSafe = (el, event, handler) => {
      if (!el) return;
      el.addEventListener(event, handler);
      this._rebindCleanups.push(() => el.removeEventListener(event, handler));
    };

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) this.$[id] = el;
    });

    addSafe(this.$.panelCloseBtn, "click", () => this.hideWeatherPanel());
    addSafe(this.$.panelMinimizeBtn, "click", () =>
      this.toggleMinimizeWeatherPanel(),
    );
    addSafe(this.$.homeToggleBtn, "click", () => this.toggleHomeLocation());
    addSafe(this.$.favoriteToggleBtn, "click", () =>
      this.toggleFavoriteCurrentLocation(),
    );
    addSafe(this.$.shareWeatherBtn, "click", () => this.shareWeather());
    addSafe(this.$.timeMachineTrigger, "click", () =>
      this.toggleClimateTimeMachine(),
    );
    addSafe(this.$.nextRainBtn, "click", () => this.jumpToNextRain());
    this.$.installBtn?.addEventListener("click", () => this.installPWA());
    addSafe(this.$.zoomInBtn, "click", () => this.map.zoomIn());
    addSafe(this.$.zoomOutBtn, "click", () => this.map.zoomOut());
    addSafe(this.$.signalNoiseBtn, "click", () => this.toggleSignalNoiseView());
    addSafe(this.$.confidenceToggle, "click", () => {
      this.showConfidence = !this.showConfidence;
      this.$.confidenceToggle?.classList.toggle(
        "toggle-active",
        this.showConfidence,
      );
      if (this.weatherData)
        this.drawHourlySparkline(parseInt(this.$.timelineSlider.value, 10));
    });
    addSafe(this.$.briefingBtn, "click", () => this.generateBriefing());
    this.initDashboardDrag();
  }

export function init(app) {
  app.toggleMinimalMode = toggleMinimalMode;
  app.rebindPanelEvents = rebindPanelEvents;
}
