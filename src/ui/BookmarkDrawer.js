// BookmarkDrawer.js
// A simple sidebar that lists saved bookmarks and allows panning to them.
// It expects a container element with a given id.

export default class BookmarkDrawer {
  constructor(containerId, mapController, weatherService, bookmarkModule) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.warn(`BookmarkDrawer: No element with id '${containerId}' found.`);
    }
    this.mapController = mapController;
    this.weatherService = weatherService;
    this.bookmarkModule = bookmarkModule;
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
    const bookmarks = this.bookmarkModule.getBookmarks();
    this.listEl.innerHTML = '';
    bookmarks.forEach((b) => {
      const li = document.createElement('li');
      li.textContent = b.name;
      li.style.cursor = 'pointer';
      li.onclick = () => {
        this.mapController.panTo(b.lat, b.lon);
        this.weatherService.getForecast(b.lat, b.lon).then((data) => {
          console.log('Weather for bookmark:', data);
        });
      };
      this.listEl.appendChild(li);
    });
  }

  toggle() {
    if (!this.container) return;
    this.isOpen = !this.isOpen;
    this.container.style.display = this.isOpen ? 'block' : 'none';
  }
}
