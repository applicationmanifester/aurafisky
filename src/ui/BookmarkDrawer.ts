// src/ui/BookmarkDrawer.ts

export default class BookmarkDrawer {
  container: HTMLElement | null;
  mapController: any;
  weatherService: any;
  bookmarkModule: any;
  listEl: HTMLElement | null;
  isOpen: boolean;

  constructor(containerId: string, mapController: any, weatherService: any, bookmarkModule: any) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.warn(`BookmarkDrawer: No element with id '${containerId}' found.`);
    }
    this.mapController = mapController;
    this.weatherService = weatherService;
    this.bookmarkModule = bookmarkModule;
    this.listEl = null;
    this.isOpen = false;
  }

  init() {
    if (!this.container) return;
    this.container.innerHTML = '';
    const header = document.createElement('h3');
    header.textContent = 'Bookmarks';
    this.container.appendChild(header);

    this.listEl = document.createElement('ul');
    this.container.appendChild(this.listEl);

    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Close';
    toggleBtn.onclick = () => this.toggle();
    this.container.appendChild(toggleBtn);

    this.renderBookmarks();
  }

  renderBookmarks() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    const bookmarks = this.bookmarkModule.getAll();
    bookmarks.forEach((b: any) => {
      const li = document.createElement('li');
      li.textContent = b.name;
      li.style.cursor = 'pointer';
      li.onclick = async () => {
        this.mapController.panTo(this.mapController.map, b.lat, b.lon);
        try { await this.weatherService.getForecast(b.lat, b.lon); }
        catch (err) { console.error('Bookmark weather error', err); }
      };
      this.listEl.appendChild(li);
    });
  }

  updateLocations() {
    this.renderBookmarks();
  }

  toggle() {
    if (!this.container) return;
    this.isOpen = !this.isOpen;
    this.container.style.display = this.isOpen ? 'block' : 'none';
    if (this.isOpen) this.renderBookmarks();
  }
}