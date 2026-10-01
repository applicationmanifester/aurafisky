import { BaseService } from './BaseService.js';
export class WallpaperService extends BaseService {
  constructor(options = {}) {
    super();
    this.stateStore = options.stateStore;
    this.uiUpdater = options.uiUpdater;
    this.locations = [];
    this.activeIdx = -1;
    this.visible = false;
  }
  setLocations(locations) { this.locations = locations; if (this.locations.length && this.activeIdx < 0) this.activeIdx = 0; }
  setActive(idx) { if (idx < 0 || idx >= this.locations.length) return; this.activeIdx = idx; if (this.visible) this.refresh(); }
  setVisible(v) { if (this.visible === v) return; this.visible = v; this.uiUpdater.update('wallpaperContainer', {display: v ? 'block' : 'none'}); if (v) this.refresh(); }
  async refresh() {
    const loc = this.locations[this.activeIdx]; if (!loc) return;
    try {
      const weather = await fetchWeather(loc.lat, loc.lng); // Assume fetchWeather defined elsewhere
      // update via UIUpdater batching
      this.uiUpdater.update('wallpaperAQI', {textContent: weather.aqi.label});
      this.uiUpdater.update('wallpaperAstronomy', {textContent: `${weather.astronomy.sunrise} | ${weather.astronomy.sunset}`});
    } catch (e) { console.error(e); }
  }
}
async function fetchWeather(lat, lng) { /* stub */ return { aqi: {label: 'Good'}, astronomy: {sunrise: '06:00', sunset: '18:00'} };}