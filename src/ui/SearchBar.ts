// src/ui/SearchBar.ts

export default class SearchBar {
  input: HTMLInputElement | null;
  button: HTMLButtonElement | null;
  mapController: any;
  searchModule: any;
  weatherService: any;
  loading: boolean;

  constructor(inputId: string, buttonId: string, mapController: any, searchModule: any, weatherService: any) {
    this.input = document.getElementById(inputId) as HTMLInputElement;
    this.button = document.getElementById(buttonId) as HTMLButtonElement;
    this.mapController = mapController;
    this.searchModule = searchModule;
    this.weatherService = weatherService;
    this.loading = false;
  }

  init() {
    if (!this.input || !this.button) {
      console.warn('SearchBar: Missing input or button elements.');
      return;
    }
    this.button.onclick = () => this.performSearch();
    this.input.onkeypress = (e: KeyboardEvent) => {
      if (e.key === 'Enter') this.performSearch();
    };
  }

  async performSearch() {
    if (this.loading) return;
    const query = this.input?.value.trim() || '';
    if (!query) return;

    this.setLoading(true);
    try {
      const results = await this.searchModule.geocode(query);
      if (!results || results.length === 0) throw new Error('No results found');

      const { lat, lon, display_name } = results[0];
      this.mapController.setView(this.mapController.map, lat, lon);
      await this.weatherService.getForecast(lat, lon);
      this.showResult(display_name);
    } catch (err: any) {
      this.showError(err.message || 'Search failed');
    } finally {
      this.setLoading(false);
    }
  }

  setLoading(isLoading: boolean) {
    this.loading = isLoading;
    if (this.button) {
      this.button.disabled = isLoading;
      this.button.textContent = isLoading ? 'Searching…' : 'Search';
    }
    if (this.input) this.input.disabled = isLoading;
  }

  showResult(name: string) {
    if (typeof (window as any).showToast === 'function') (window as any).showToast(`Found: ${name}`);
    else console.log('Found:', name);
  }

  showError(msg: string) {
    if (typeof (window as any).showToast === 'function') (window as any).showToast(msg, { type: 'error' });
    else console.warn(msg);
  }
}