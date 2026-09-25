// Settings module for persisting user preferences
const STORAGE_PREFIX = 'aurafisky_';
const DEFAULTS = {
  units: 'metric', // or 'imperial'
  sonificationEnabled: true,
  sonificationIntensity: 0.5, // 0.0 to 1.0
  timeline24h: false,
  showBookmarksMap: true,
};

function _get(key) {
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + key);
    return val !== null ? JSON.parse(val) : DEFAULTS[key];
  } catch (e) {
    return DEFAULTS[key];
  }
}

function _set(key, value) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    // ignore quota errors
  }
}

export const Settings = {
  getUnits: () => _get('units'),
  setUnits: (units) => _set('units', units),
  getSonificationEnabled: () => _get('sonificationEnabled'),
  setSonificationEnabled: (enabled) => _set('sonificationEnabled', enabled),
  getSonificationIntensity: () => _get('sonificationIntensity'),
  setSonificationIntensity: (intensity) => _set('sonificationIntensity', intensity),
  getTimeline24h: () => _get('timeline24h'),
  setTimeline24h: (flag) => _set('timeline24h', flag),
  getShowBookmarksMap: () => _get('showBookmarksMap'),
  setShowBookmarksMap: (flag) => _set('showBookmarksMap', flag),
  // Reset to defaults
  reset: () => {
    Object.keys(DEFAULTS).forEach(key => _set(key, DEFAULTS[key]));
  },
};

// Also expose on window for legacy non-module scripts
if (typeof window !== 'undefined') {
  window.Settings = Settings;
}