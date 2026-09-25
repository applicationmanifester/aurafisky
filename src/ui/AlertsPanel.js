/**
 * Alerts Management Panel
 * Create, edit, delete weather alert rules
 */
import { authService } from '../services/AuthService.js';
import { showToast } from '../modules/toast.js';

const TEMPLATE = `
<div class="panel-overlay hidden" id="alertsPanelOverlay" role="dialog" aria-modal="true" aria-labelledby="alertsTitle">
  <div class="panel">
    <header class="panel-header">
      <h2 id="alertsTitle">Weather Alerts</h2>
      <button class="panel-close" aria-label="Close">&times;</button>
    </header>
    
    <div class="panel-content">
      <!-- Add Alert Form -->
      <form class="alert-form" id="addAlertForm">
        <div class="form-row">
          <label for="alertPlace">Location</label>
          <select id="alertPlace" required>
            <option value="">Select a place...</option>
          </select>
        </div>
        <div class="form-row">
          <label for="alertType">Condition</label>
          <select id="alertType" required>
            <option value="temperature">Temperature</option>
            <option value="precipitation">Precipitation</option>
            <option value="wind">Wind Speed</option>
            <option value="weathercode">Weather Condition</option>
          </select>
        </div>
        <div class="form-row" id="alertValueRow">
          <label for="alertValue">Threshold</label>
          <input type="number" id="alertValue" step="0.1" required>
        </div>
        <div class="form-row" id="alertConditionRow">
          <label for="alertCondition">Trigger when</label>
          <select id="alertCondition">
            <option value="above">Above</option>
            <option value="below">Below</option>
            <option value="equals">Equals</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn primary" id="addAlertBtn">
            <span class="btn-text">Add Alert</span>
            <span class="btn-loading hidden">Adding...</span>
          </button>
        </div>
      </form>

      <!-- Alerts List -->
      <div class="alerts-list" id="alertsList" role="list">
        <p class="empty-state" id="emptyAlerts">No alerts configured. Create your first alert above.</p>
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
.alert-form { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color, #eee); }
.form-row { margin-bottom: 16px; }
.form-row label { display: block; margin-bottom: 6px; font-size: 13px; font-weight: 500; }
.form-row select, .form-row input { width: 100%; padding: 10px 12px; border: 1px solid var(--border-color, #ddd); border-radius: 8px; font-size: 15px; box-sizing: border-box; }
.form-row select:focus, .form-row input:focus { outline: none; border-color: var(--accent, #3b82f6); box-shadow: 0 0 0 3px rgba(59,130,246,.15); }
.form-actions { display: flex; gap: 8px; }
.btn { flex: 1; padding: 12px; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background .15s; }
.btn.primary { background: var(--accent, #3b82f6); color: #fff; }
.btn.primary:hover:not(:disabled) { background: var(--accent-hover, #2563eb); }
.btn:disabled { opacity: .6; cursor: not-allowed; }
.btn-loading { display: none; }
.btn.loading .btn-text { display: none; }
.btn.loading .btn-loading { display: inline; }

/* Alerts List */
.alerts-list { min-height: 100px; }
.empty-state { text-align: center; color: var(--text-muted, #666); padding: 40px 20px; margin: 0; }
.alert-item { display: flex; align-items: center; gap: 12px; padding: 12px; background: var(--bg-secondary, #fafafa); border-radius: 10px; margin-bottom: 8px; border-left: 3px solid var(--accent, #3b82f6); }
.alert-info { flex: 1; min-width: 0; }
.alert-summary { font-weight: 500; font-size: 14px; }
.alert-detail { font-size: 12px; color: var(--text-muted, #666); margin-top: 2px; }
.alert-place { font-size: 11px; padding: 2px 6px; border-radius: 999px; background: var(--bg-tertiary, #eee); color: var(--text-secondary, #666); }
.alert-actions { display: flex; gap: 4px; }
.icon-btn { width: 32px; height: 32px; border: none; background: transparent; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-muted, #666); }
.icon-btn:hover { background: var(--bg-hover, #e0e0e0); color: var(--text-primary, #333); }
.icon-btn.danger:hover { background: #fee2e2; color: #ef4444; }
.icon-btn.toggle { width: 44px; }

.tier-notice { font-size: 12px; color: var(--text-muted, #666); text-align: center; margin-top: 16px; }
`;

const WEATHER_CODES = [
  { code: 0, label: 'Clear sky' },
  { code: 1, label: 'Mainly clear' },
  { code: 2, label: 'Partly cloudy' },
  { code: 3, label: 'Overcast' },
  { code: 45, label: 'Fog' },
  { code: 48, label: 'Depositing rime fog' },
  { code: 51, label: 'Light drizzle' },
  { code: 53, label: 'Moderate drizzle' },
  { code: 55, label: 'Dense drizzle' },
  { code: 61, label: 'Slight rain' },
  { code: 63, label: 'Moderate rain' },
  { code: 65, label: 'Heavy rain' },
  { code: 71, label: 'Slight snow fall' },
  { code: 73, label: 'Moderate snow fall' },
  { code: 75, label: 'Heavy snow fall' },
  { code: 80, label: 'Slight rain showers' },
  { code: 81, label: 'Moderate rain showers' },
  { code: 82, label: 'Violent rain showers' },
  { code: 95, label: 'Thunderstorm' },
  { code: 96, label: 'Thunderstorm with slight hail' },
  { code: 99, label: 'Thunderstorm with heavy hail' },
];

export default class AlertsPanel {
  constructor() {
    this.overlay = null;
    this.init();
  }

  init() {
    if (!document.getElementById('alerts-panel-styles')) {
      const style = document.createElement('style');
      style.id = 'alerts-panel-styles';
      style.textContent = STYLES;
      document.head.appendChild(style);
    }

    const container = document.createElement('div');
    container.innerHTML = TEMPLATE;
    document.body.appendChild(container);

    this.overlay = document.getElementById('alertsPanelOverlay');
    this.bindEvents();
    this.bindAuthState();
  }

  bindEvents() {
    this.overlay.querySelector('.panel-close').onclick = () => this.hide();
    this.overlay.onclick = (e) => { if (e.target === this.overlay) this.hide(); };

    // Dynamic form fields based on alert type
    const typeSelect = this.overlay.querySelector('#alertType');
    const valueRow = this.overlay.querySelector('#alertValueRow');
    const conditionRow = this.overlay.querySelector('#alertConditionRow');
    const valueInput = this.overlay.querySelector('#alertValue');
    const conditionSelect = this.overlay.querySelector('#alertCondition');

    typeSelect.onchange = () => this.updateFormFields(typeSelect.value, valueInput, conditionSelect, valueRow, conditionRow);

    // Form submit
    this.overlay.querySelector('#addAlertForm').onsubmit = (e) => this.handleAddAlert(e);
  }

  bindAuthState() {
    authService.on('alerts:changed', () => this.renderAlerts());
    authService.on('places:changed', () => this.updatePlaceOptions());
    authService.on('auth:changed', (user) => {
      if (!user) this.hide();
    });
  }

  show() {
    this.overlay.classList.add('visible');
    this.updatePlaceOptions();
    this.renderAlerts();
    this.updateTierNotice();
    document.body.style.overflow = 'hidden';
  }

  hide() {
    this.overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  updatePlaceOptions() {
    const select = this.overlay.querySelector('#alertPlace');
    const places = authService.places;
    select.innerHTML = '<option value="">Select a place...</option>' +
      places.map(p => '<option value="' + p.id + '">' + this.escapeHtml(p.name) + '</option>').join('');
  }

  updateFormFields(type, valueInput, conditionSelect, valueRow, conditionRow) {
    // Reset
    valueInput.value = '';
    valueInput.placeholder = '';
    valueInput.step = '0.1';
    valueInput.min = '';
    valueInput.max = '';
    conditionSelect.innerHTML = '<option value="above">Above</option><option value="below">Below</option><option value="equals">Equals</option>';
    valueRow.style.display = 'block';
    conditionRow.style.display = 'block';

    switch (type) {
      case 'temperature':
        valueInput.placeholder = 'e.g., 30';
        valueInput.step = '1';
        valueInput.min = '-50';
        valueInput.max = '60';
        break;
      case 'precipitation':
        valueInput.placeholder = 'e.g., 5 (mm/h)';
        valueInput.step = '0.1';
        valueInput.min = '0';
        valueInput.max = '100';
        break;
      case 'wind':
        valueInput.placeholder = 'e.g., 50 (km/h)';
        valueInput.step = '1';
        valueInput.min = '0';
        valueInput.max = '200';
        break;
      case 'weathercode':
        valueRow.style.display = 'none';
        conditionRow.style.display = 'none';
        this.renderWeatherCodeSelect();
        break;
    }
  }

  renderWeatherCodeSelect() {
    const valueRow = this.overlay.querySelector('#alertValueRow');
    let select = valueRow.querySelector('#weatherCodeSelect');
    if (!select) {
      select = document.createElement('select');
      select.id = 'weatherCodeSelect';
      select.style.width = '100%';
      select.style.padding = '10px 12px';
      valueRow.appendChild(select);
    }
    select.innerHTML = WEATHER_CODES.map(w => '<option value="' + w.code + '">' + w.label + ' (' + w.code + ')</option>').join('');
    valueRow.style.display = 'block';
    valueRow.querySelector('#alertValue').style.display = 'none';
  }

  async handleAddAlert(e) {
    e.preventDefault();
    const placeId = this.overlay.querySelector('#alertPlace').value;
    const type = this.overlay.querySelector('#alertType').value;

    if (!placeId) return showToast('Please select a location', 'warning');

    let value, condition;

    if (type === 'weathercode') {
      value = parseInt(this.overlay.querySelector('#weatherCodeSelect').value, 10);
      condition = 'equals';
    } else {
      value = parseFloat(this.overlay.querySelector('#alertValue').value);
      condition = this.overlay.querySelector('#alertCondition').value;
      if (isNaN(value)) return showToast('Please enter a valid threshold', 'warning');
    }

    const btn = this.overlay.querySelector('#addAlertBtn');
    btn.classList.add('loading');

    try {
      await authService.addAlertRule({ placeId, type, condition, value, enabled: true });
      showToast('Alert created');
      this.overlay.querySelector('#addAlertForm').reset();
      this.updateFormFields('temperature', this.overlay.querySelector('#alertValue'), this.overlay.querySelector('#alertCondition'), this.overlay.querySelector('#alertValueRow'), this.overlay.querySelector('#alertConditionRow'));
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btn.classList.remove('loading');
    }
  }

  renderAlerts() {
    const list = this.overlay.querySelector('#alertsList');
    const alerts = authService.alerts;
    const empty = this.overlay.querySelector('#emptyAlerts');

    if (!alerts.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    list.innerHTML = alerts.map(alert => {
      const place = authService.places.find(p => p.id === alert.placeId);
      const placeName = place?.name || 'Unknown location';
      let summary = '';
      switch (alert.type) {
        case 'temperature': summary = 'Temperature ' + alert.condition + ' ' + alert.value + String.fromCharCode(176); break;
        case 'precipitation': summary = 'Precipitation ' + alert.condition + ' ' + alert.value + ' mm/h'; break;
        case 'wind': summary = 'Wind ' + alert.condition + ' ' + alert.value + ' km/h'; break;
        case 'weathercode': summary = 'Weather: ' + (WEATHER_CODES.find(w => w.code === alert.value)?.label || alert.value); break;
      }

      return '<div class="alert-item" data-id="' + alert.id + '" role="listitem">' +
        '<div class="alert-info">' +
          '<div class="alert-summary">' + summary + '</div>' +
          '<div class="alert-detail">' +
            '<span class="alert-place">' + this.escapeHtml(placeName) + '</span>' +
            (!alert.enabled ? '<span class="alert-place" style="background:#fef3c7;color:#92400e;">Paused</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="alert-actions">' +
          '<button class="icon-btn toggle" data-action="toggle" title="' + (alert.enabled ? 'Disable' : 'Enable') + '">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
              (alert.enabled ? '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>' : '<polygon points="5 3 19 12 5 21 5 3"/>') +
            '</svg>' +
          '</button>' +
          '<button class="icon-btn danger" data-action="delete" title="Delete">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');

    this.bindAlertActions();
  }

  bindAlertActions() {
    this.overlay.querySelectorAll('.alert-item').forEach(item => {
      item.querySelector('[data-action="toggle"]').onclick = async () => {
        const alert = authService.alerts.find(a => a.id === item.dataset.id);
        if (alert) {
          try {
            await authService.updateAlertRule(alert.id, { enabled: !alert.enabled });
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      };
      item.querySelector('[data-action="delete"]').onclick = async () => {
        if (!confirm('Delete this alert?')) return;
        try {
          await authService.deleteAlertRule(item.dataset.id);
          showToast('Alert deleted');
        } catch (err) {
          showToast(err.message, 'error');
        }
      };
    });
  }

  updateTierNotice() {
    const notice = this.overlay.querySelector('#tierNotice');
    const isPro = authService.isPro;
    const count = authService.alerts.filter(a => a.enabled).length;
    const limit = isPro ? 'Unlimited' : 3;
    notice.textContent = isPro
      ? 'Pro tier: Unlimited alerts'
      : 'Free tier: ' + count + '/' + limit + ' active alerts';
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, ''''');
  }
}