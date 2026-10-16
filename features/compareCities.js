// -- COMPARE CITIES VIEW --
import { shortPlaceName } from "../modules/geo.js";

async function compareWeatherWithActive(favLocation) {
    if (!this.weatherData || !this.selectedLat || !this.selectedLng) {
      this.showToast(
        "Please select a main location on the map first.",
        "error",
      );
      return;
    }

    const latDiff = Math.abs(this.selectedLat - favLocation.lat);
    const lngDiff = Math.abs(this.selectedLng - favLocation.lng);
    if (latDiff < 0.01 && lngDiff < 0.01) {
      this.showToast(
        "You cannot compare a location with itself. Select a different location on the map first.",
        "warning",
      );
      return;
    }

    this.showToast(`Comparing with ${favLocation.name}...`, "info");

    try {
      // Fetch details of target comparison location
      const [forecastB, airQualityB] = await Promise.all([
        WeatherService.fetchForecast(favLocation.lat, favLocation.lng),
        WeatherService.fetchAirQuality(favLocation.lat, favLocation.lng),
      ]);

      const idxA = parseInt(this.$.timelineSlider.value, 10);
      const idxB = WeatherService.getCurrentHourIndex(
      forecastB,
      forecastB?.utc_offset_seconds || 0,
    );

      const wA = WeatherService.getHourlyAtIndex(this.weatherData, idxA);
      const wB = WeatherService.getHourlyAtIndex(forecastB, idxB);

      // Extract AQIs
      const aqiA = this.airQualityData?.hourly?.us_aqi[idxA] ?? "--";
      const aqiB = airQualityB?.hourly?.us_aqi[idxB] ?? "--";

      // Populate text comparisons
      this.$.compareHeading.textContent = `${shortPlaceName(this.selectedName)} vs ${shortPlaceName(favLocation.name)}`;
      this.$.compareTempA.textContent = WeatherService.formatTemp(
        wA.temperature,
      );
      this.$.compareTempB.textContent = WeatherService.formatTemp(
        wB.temperature,
      );

      this.$.compareWindA.textContent = WeatherService.formatWind(wA.windSpeed);
      this.$.compareWindB.textContent = WeatherService.formatWind(wB.windSpeed);

      this.$.compareAQIA.textContent = aqiA;
      this.$.compareAQIB.textContent = aqiB;

      this.$.compareHumidityA.textContent = `${wA.humidity ?? "--"}%`;
      this.$.compareHumidityB.textContent = `${wB.humidity ?? "--"}%`;

      this.$.compareDescA.textContent = `${wA.icon} ${wA.description}`;
      this.$.compareDescB.textContent = `${wB.icon} ${wB.description}`;

      // Open compare panel
      this.showComparePanel();
    } catch (e) {
      console.error("Compare fetch failed:", e);
      this.showToast("Could not load comparison data.", "error");
    }
  }

function showComparePanel() {
    this.$.comparePanel.classList.remove("hidden");
    setTimeout(() => {
      this.$.comparePanel.classList.add("open");
      if (
        window.innerWidth < 640 &&
        this.$.radarExpandedPanel &&
        !this.$.radarExpandedPanel.classList.contains("hidden")
      ) {
        this.$.radarExpandedPanel.classList.add("hidden");
        this.$.radarCollapsedBtn.classList.remove("hidden");
      }
    }, 50);
  }

function hideComparePanel() {
    this.$.comparePanel.classList.remove("open");
    setTimeout(() => this.$.comparePanel.classList.add("hidden"), 400);
  }

export function init(app) {
  app.compareWeatherWithActive = compareWeatherWithActive;
  app.showComparePanel = showComparePanel;
  app.hideComparePanel = hideComparePanel;
}
