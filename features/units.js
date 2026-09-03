// -- UNIT TOGGLE (°C/°F, km/h/mph) --

function toggleUnits() {
    const current = WeatherService.getUnits();
    const next = current === "metric" ? "imperial" : "metric";
    WeatherService.setUnits(next);
    this.syncUnitLabel();

    // Re-render all weather data
    if (this.weatherData) {
      this.updateWeatherDisplay(parseInt(this.$.timelineSlider.value, 10));
      this.createWeatherMarker(this.selectedLat, this.selectedLng);
    }

    this.showToast(
      `Switched to ${next === "imperial" ? "°F / mph" : "°C / km/h"}`,
      "success",
    );
    this.updateSettingsUIFromLocal();
    this.saveUserDataToCloud();
  }

function syncUnitLabel() {
    const label = document.getElementById("settingsUnitsLabel");
    const sub = document.getElementById("settingsUnitsSub");
    if (label) {
      const units = WeatherService.getUnits();
      label.textContent = `Units (${units === "imperial" ? "Imperial" : "Metric"})`;
      if (sub) {
        sub.textContent = units === "imperial" ? "°F, mph, inch" : "°C, km/h, mm";
      }
    }
  }

async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.warn("navigator.clipboard.writeText failed, trying execCommand fallback:", err);
      }
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-999999px";
      textarea.style.top = "-999999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      return successful;
    } catch (err) {
      console.error("Clipboard copy fallback failed:", err);
      return false;
    }
  }

function toggleShareModal(show) {
    if (!this.$.shareModal) return;
    if (show) {
      this.$.shareModal.classList.remove("hidden");
      this.$.shareModal.classList.add("flex");
    } else {
      this.$.shareModal.classList.add("hidden");
      this.$.shareModal.classList.remove("flex");
    }
  }

export function init(app) {
  app.toggleUnits = toggleUnits;
  app.syncUnitLabel = syncUnitLabel;
  app.copyToClipboard = copyToClipboard;
  app.toggleShareModal = toggleShareModal;
}
