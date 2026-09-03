// SearchBar.js
// Handles the search input and button.

export default class SearchBar {
  constructor(inputId, buttonId, mapController, searchModule, weatherService) {
    this.input = document.getElementById(inputId);
    this.button = document.getElementById(buttonId);
    this.mapController = mapController;
    this.searchModule = searchModule;
    this.weatherService = weatherService;
  }

  init() {
    if (!this.input || !this.button) {
      console.warn('SearchBar: Missing input or button elements.');
      return;
    }
    this.button.onclick = () => this.performSearch();
    this.input.onkeypress = (e) => {
      if (e.key === 'Enter') this.performSearch();
    };
  }

  performSearch() {
    const query = this.input.value.trim();
    if (!query) return;
    this.searchModule.geocode(query).then((results) => {
      if (!results || results.length === 0) {
        console.warn('No geocoding results for:', query);
        return;
      }
      const first = results[0];
      const lat = first.lat;
      const lon = first.lon;
      this.mapController.panTo(lat, lon);
      this.weatherService.getForecast(lat, lon).then((data) => {
        console.log('Weather for search:', data);
      });
    });
  }
}
