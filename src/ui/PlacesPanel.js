/**
 * Places Management Panel
 * Add, edit, reorder, delete saved places (synced via Firestore)
 */
import { authService } from '../services/AuthService.js';
import { showToast } from '../modules/toast.js';

const TEMPLATE = `
<div class="panel-overlay hidden" id="placesPanelOverlay" role="dialog" aria-modal="true" aria-labelledby="placesTitle">
  <div class="panel">
    <header class="panel-header">
      <h2 id="placesTitle">My Places</h2>
      <button class="panel-close" aria-label="Close">&times;</button>
    </header>
    
    <div class="panel-content">
      <!-- Add Place Form -->
      <form class="place-form" id="addPlaceForm">
        <div class="form-row">
          <label for="placeSearch">Search location</label>
          <div class="search-input-wrapper">
            <input type="text" id="placeSearch" placeholder="City, address, landmark..." autocomplete="off" required>
            <div class="search-results hidden" id="placeSearchResults" role="listbox"></div>
          </div>
        </div>
        <div class="form-row">
          <label for="placeName">Label <span class="optional">(optional)</span></label>
          <input type="text" id="placeName" placeholder="Home, Office, Cabin..." maxlength="30">
        </div>
        <div class="form-row">
          <label for="placeLabel">Type</label>
          <select id="placeLabel">
            <option value="favorite">Fav Favorite</option>
            <option value="home">Home Home</option>
            <option value="work">Work Work</option>
            <option value="travel">Travel Travel</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn primary" id="addPlaceBtn">
            <span class="btn-text">Add Place</span>
            <span class="btn-loading hidden">Adding...</span>
          </button>
        </div>
      </form>

      <!-- Places List -->
      <div class="places-list" id="placesList" role="list">
        <p class="empty-state" id="emptyPlaces">No places saved. Add your first location above.</p>
      </div>

      <!-- Tier Limit Notice -->
      <p class="tier-notice" id="tierNotice"></p>
    </div>
  </div>
</div>
`;

const STYLES = `
.panel-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000; opacity: 0; visibility: hidden; transition: opacity .2s, visibility .2s;
}
.panel-overlay.visible { opacity: 1; visibility: visible; }
.panel {
  background: var(--bg-primary, #fff); border-radius: 16px;
  width: 100%; max-width: 480px; max-height: 85vh;
  box-shadow: 0 24px 48px rgba(0,0,0,.15);
  transform: translateY(20px); transition: transform .2s;
  display: flex; flex-direction: column;
}
.panel-overlay.visible .panel { transform: translateY(0); }
.panel-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border-color, #eee); }
.panel-header h2 { margin: 0; font-size: 18px; }
.panel-close { background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-muted, #666); width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; }
.panel-close:hover { background: var(--bg-hover, #f5f5f5); }
.panel-content { padding: 20px; overflow-y: auto; }

/* Form */
.place-form { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color, #eee); }
.form-row { margin-bottom: 16px; }
.form-row label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; }
.optional { font-weight: 400; color: var(--text-muted, #666); font-size: 12px; }
.search-input-wrapper { position: relative; }
.search-input-wrapper input { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; font-size: 15px; box-sizing: border-box; }
.search-input-wrapper input:focus { outline: none; border-color: var(--accent, #3b82f6); box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
.search-results { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--bg-primary, #fff); border: 1px solid var(--border-color, #ddd); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.1); max-height: 200px; overflow-y: auto; z-index: 10; }
.search-result-item { padding: 10px 12px; cursor: pointer; font-size: 14px; }
.search-result-item:hover { background: var(--bg-hover, #f5f5f5); }
.search-result-item.selected { background: var(--accent-light, #dbeafe); }
.search-result-name { font-weight: 500; }
.search-result-detail { font-size: 12px; color: var(--text-muted, #666); margin-top: 2px; }

select { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; font-size: 15px; background: var(--bg-primary, #fff); }
.form-actions { display: flex; gap: 8px; }
.btn { flex: 1; padding: 12px; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background .15s; }
.btn.primary { background: var(--accent, #3b82f6); color: #fff; }
.btn.primary:hover:not(:disabled) { background: var(--accent-hover, #2563eb); }
.btn:disabled { opacity: .6; cursor: not-allowed; }
.btn-loading { display: none; }
.btn.loading .btn-text { display: none; }
.btn.loading .btn-loading { display: inline; }

/* Places List */
.places-list { min-height: 100px; }
.empty-state { text-align: center; color: var(--text-muted, #666); padding: 40px 20px; margin: 0; }
.place-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-secondary, #fafafa); border-radius: 10px; margin-bottom: 8px; transition: background .15s; }
.place-item:hover { background: var(--bg-hover, #f0f0f0); }
.place-item.dragging { opacity: .5; }
.place-drag { cursor: grab; color: var(--text-muted, #999); padding: 4px; }
.place-drag:active { cursor: grabbing; }
.place-info { flex: 1; min-width: 0; }
.place-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.place-meta { font-size: 12px; color: var(--text-muted, #666); display: flex; gap: 8px; flex-wrap: wrap; }
.place-label { font-size: 11px; padding: 2px 6px; border-radius: 999px; background: var(--accent-light, #dbeafe); color: var(--accent, #3b82f6); }
.place-coords { font-family: monospace; font-size: 11px; }
.place-actions { display: flex; gap: 4px; }
.icon-btn { width: 32px; height: 32px; border: none; background: transparent; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-muted, #666); }
.icon-btn:hover { background: var(--bg-hover, #e0e0e0); color: var(--text-primary, #333); }
.icon-btn.danger:hover { background: #fee2e2; color: #ef4444; }

.tier-notice { font-size: 12px; color: var(--text-muted, #666); text-align: center; margin-top: 16px; }
`;

// Nominatim Search (debounced)
let searchDebounce = null;
const GEOCODING_BASE_URL = 'https://nominatim.openstreetmap.org/search';

async function searchPlaces(query) {
  const url = `${GEOCODING_BASE_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Aurafisky/14.0.0', 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}

export default class PlacesPanel {
  constructor() {
    this.overlay = null;
    this.selectedResult = null;
    this.draggedItem = null;
    this.init();
  }

  init() {
    // Styles
    if (!document.getElementById('places-panel-styles')) {
      const style = document.createElement('style');
      style.id = 'places-panel-styles';
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    // Template
    const container = document.createElement('div');
    container.innerHTML = TEMPLATE;
    document.body.appendChild(container);

    this.overlay = document.getElementById('placesPanelOverlay');
    this.bindEvents();
    this.bindAuthState();
  }

  bindEvents() {
    this.overlay.querySelector('.panel-close').onclick = () => this.hide();
    this.overlay.onclick = (e) => { if (e.target === this.overlay) this.hide(); };

    // Search with debounce
    const searchInput = this.overlay.querySelector('#placeSearch');
    const resultsEl = this.overlay.querySelector('#placeSearchResults');
    searchInput.oninput = () => {
      clearTimeout(searchDebounce);
      const q = searchInput.value.trim();
      if (q.length < 2) { resultsEl.classList.add('hidden'); return; }
      searchDebounce = setTimeout(async () => {
        try {
          const results = await searchPlaces(q);
          this.renderSearchResults(results);
        } catch (err) {
          console.error('Place search error', err);
        }
      }, 250);
    };

    // Hide results on click outside
    document.addEventListener('click', (e) => {
      if (!resultsEl.contains(e.target) && e.target !== searchInput) {
        resultsEl.classList.add('hidden');
      }
    });

    // Form submit
    this.overlay.querySelector('#addPlaceForm').onsubmit = (e) => this.handleAddPlace(e);
  }

  bindAuthState() {
    authService.on('places:changed', () => this.renderPlaces());
    authService.on('auth:changed', (user) => {
      if (!user) this.hide();
    });
  }

  show() {
    this.overlay.classList.add('visible');
    this.renderPlaces();
    this.updateTierNotice();
    document.body.style.overflow = 'hidden';
  }

  hide() {
    this.overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  renderSearchResults(results) {
    const resultsEl = this.overlay.querySelector('#placeSearchResults');
    if (!results.length) {
      resultsEl.innerHTML = '<div class="search-result-item">No results found</div>';
      resultsEl.classList.remove('hidden');
      return;
    }
    resultsEl.innerHTML = results.map((r, i) => `
      <div class="search-result-item" data-index="${i}" role="option">
        <div class="search-result-name">${r.display_name.split(',')[0]}</div>
        <div class="search-result-detail">${r.display_name}</div>
      </div>
    `).join('');
    resultsEl.classList.remove('hidden');

    resultsEl.querySelectorAll('.search-result-item').forEach((el, i) => {
      el.onclick = () => this.selectSearchResult(results[i], el);
    });
  }

  selectSearchResult(result, el) {
    this.selectedResult = result;
    const input = this.overlay.querySelector('#placeSearch');
    input.value = result.display_name.split(',')[0];
    this.overlay.querySelector('#placeName').value = '';
    this.overlay.querySelector('#placeSearchResults').classList.add('hidden');
    // Auto-fill label based on address
    if (result.address?.house_number || result.address?.road) {
      this.overlay.querySelector('#placeLabel').value = 'home';
    }
  }

  async handleAddPlace(e) {
    e.preventDefault();
    if (!this.selectedResult) return showToast('Please select a location from search results', 'warning');

    const name = this.overlay.querySelector('#placeName').value.trim() || this.selectedResult.display_name.split(',')[0];
    const label = this.overlay.querySelector('#placeLabel').value;
    const lat = parseFloat(this.selectedResult.lat);
    const lon = parseFloat(this.selectedResult.lon);

    const btn = this.overlay.querySelector('#addPlaceBtn');
    btn.classList.add('loading');

    try {
      await authService.addPlace({ name, lat, lon, label, order: authService.places.length });
      showToast(`Added ${name}`);
      this.overlay.querySelector('#addPlaceForm').reset();
      this.selectedResult = null;
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.classList.remove('loading');
    }
  }

  renderPlaces() {
    const list = this.overlay.querySelector('#placesList');
    const places = authService.places;
    const empty = this.overlay.querySelector('#emptyPlaces');

    if (!places.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = places.map((place, i) => `
      <div class="place-item" data-id="${place.id}" draggable="true" role="listitem">
        <button class="place-drag" aria-label="Drag to reorder" title="Drag to reorder">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 4v16M15 4v16"/></svg>
        </button>
        <div class="place-info">
          <div class="place-name">${this.escapeHtml(place.name)}</div>
          <div class="place-meta">
            <span class="place-label">${this.escapeHtml(place.label || 'favorite')}</span>
            <span class="place-coords">${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}</span>
          </div>
        </div>
        <div class="place-actions">
          <button class="icon-btn" data-action="navigate" title="Navigate here">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </button>
          <button class="icon-btn danger" data-action="delete" title="Delete">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    this.bindPlaceActions();
    this.enableDragAndDrop();
  }

  bindPlaceActions() {
    this.overlay.querySelectorAll('.place-item').forEach(item => {
      item.querySelector('[data-action="navigate"]').onclick = () => {
        const place = authService.places.find(p => p.id === item.dataset.id);
        if (place) {
          window.dispatchEvent(new CustomEvent('navigate-to-place', { detail: place }));
          this.hide();
        }
      };
      item.querySelector('[data-action="delete"]').onclick = async () => {
        if (!confirm('Delete this place?')) return;
        try {
          await authService.deletePlace(item.dataset.id);
          showToast('Place deleted');
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });
  }

  enableDragAndDrop() {
    const list = this.overlay.querySelector('#placesList');
    let dragSrc = null;

    list.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.place-item');
      if (!item) return;
      dragSrc = item;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    list.addEventListener('dragend', (e) => {
      const item = e.target.closest('.place-item');
      if (item) item.classList.remove('dragging');
      dragSrc = null;
    });

    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const item = e.target.closest('.place-item');
      if (!item || item === dragSrc) return;
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (e.clientY < midY) {
        list.insertBefore(dragSrc, item);
      } else {
        list.insertBefore(dragSrc, item.nextSibling);
      }
    });

    list.addEventListener('drop', async (e) => {
      e.preventDefault();
      const items = [...list.querySelectorAll('.place-item')];
      const placeIds = items.map(el => el.dataset.id);
      try {
        await authService.reorderPlaces(placeIds);
      } catch (err) {
        showToast(err.message, 'error');
        this.renderPlaces(); // Revert on error
      }
    });
  }

  updateTierNotice() {
    const notice = this.overlay.querySelector('#tierNotice');
    const isPro = authService.isPro;
    const count = authService.places.length;
    const limit = isPro ? 'Unlimited' : 3;
    notice.textContent = isPro
      ? 'Pro tier: Unlimited places'
      : `Free tier: ${count}/${limit} places used`;
  }

  escapeHtml(str) {
    const map = { '&': '&', '<': '<', '>': '>', '"': '"', "'": '''' };
    return str.replace(/[&<>"]/g, c => map[c]).replace(/'/g, map["'"]);
  }
}