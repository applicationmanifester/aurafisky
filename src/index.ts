// src/index.ts
// Main entry point - exports all public APIs

export { mapController } from './controllers/MapController.js';
export { getForecast, weatherCache, destroyWeatherService } from './services/WeatherService.js';
export { geocode, destroyGeocodeService } from './services/GeocodeService.js';
export { localAuthService } from './services/LocalAuthService.js';
export { localSyncService } from './services/LocalSyncService.js';
export { alertService } from './services/AlertService.js';
export { historyService } from './services/HistoryService.js';
export { entitlementService } from './services/EntitlementService.js';
export { destroyFirebaseCore } from './services/FirebaseCore.js';

export { getEnsembleForecast, destroy as destroyEnsemble } from './services/EnsembleService.js';
export { createRadarService, RadarService } from './services/RadarService.js';
export { loadTimeMachineData, destroy as destroyTimeMachine } from './services/TimeMachineService.js';
export { compareLocations, showComparePanel, hideComparePanel, destroy as destroyCompare } from './ui/ComparePanel.js';
export { renderEnsemblePanel, destroy as destroyEnsemblePanel } from './ui/EnsemblePanel.js';
export { initRadarPanel, toggleRadar, destroy as destroyRadarPanel } from './ui/RadarPanel.js';
export { toggleTimeMachine, closeTimeMachine, destroy as destroyTimeMachinePanel } from './ui/TimeMachinePanel.js';

export { bookmarkModule } from './modules/bookmark.js';
export { showToast } from './utils/ui/toast.js';
export { initPWA } from './utils/pwa.js';
export { initViewportResizeListener } from './modules/viewportHeight.js';

export { BookmarkDrawer } from './ui/BookmarkDrawer.js';
export { SearchBar } from './ui/SearchBar.js';
export { AlertPanel } from './ui/AlertPanel.js';
export { InsightsPanel } from './ui/InsightsPanel.js';
export { UpgradeModal } from './ui/UpgradeModal.js';
