// Feature registry. Every module exposes init(app) and attaches its methods
// directly onto the running AurafiskyApp instance (app.foo = foo), so `this`
// inside each extracted function resolves normally at the call site.
//
// Core features are loaded eagerly (static import into features-core) so
// initial weather render, tabs, radar, insights, and controls never race
// against dynamic imports or trigger dozens of small network requests.
//
// Heavy, interaction-gated features (aura assistant, routes, time-machine,
// city comparison, farm, wallpaper, astronomy, etc.) are dynamically imported
// in parallel after first paint so they don't block parse/eval of the
// critical path.

// ── Eager (critical path) ─────────────────────────────────────────────
import * as ensemble from './ensemble.js';
import * as radar from './radar.js';
import * as bookmarks from './bookmarks.js';
import * as units from './units.js';
import * as share from './share.js';
import * as hourlyStrip from './hourlyStrip.js';
import * as insights from './insights.js';
import * as minimalMode from './minimalMode.js';
import * as canvasEffects from './canvasEffects.js';
import * as myLocation from './myLocation.js';
import * as appToggles from './appToggles.js';
import * as dashboard from './dashboard.js';
import * as keyboardShortcuts from './keyboardShortcuts.js';
import * as isobars from './isobars.js';
import * as navigation from './navigation.js';
import * as alerts from './alerts.js';
import * as advisories from './advisories.js';
import * as audio from './audio.js';
import * as deviceProfile from './deviceProfile.js';
import * as tvNavigation from './tvNavigation.js';
import * as sync from './sync.js';
import * as activityWindow from './activityWindow.js';
import * as marine from './marine.js';

// Feature modules loaded eagerly. Order matters: deviceProfile first so
// data-device attributes exist on <html> before any other feature reads them.
const featureModules = {
  deviceProfile,
  tvNavigation,
  sync,
  activityWindow,
  marine,
  ensemble,
  radar,
  bookmarks,
  units,
  share,
  hourlyStrip,
  insights,
  minimalMode,
  canvasEffects,
  myLocation,
  appToggles,
  dashboard,
  keyboardShortcuts,
  navigation,
  alerts,
  isobars,
  advisories,
  audio,
};

// ── Heavy / interaction-gated (background-loaded in parallel) ─────────
// These are NOT on the critical path to first paint. They are dynamically
// imported after the map has rendered, so they don't add to initial JS
// parse/eval time. Their init() is called once the import resolves.
const heavyFeatureImports = {
  aura: () => import('./aura.js'),
  routes: () => import('./routes.js'),
  timeMachine: () => import('./timeMachine.js'),
  compareCities: () => import('./compareCities.js'),
  // UI-only features — only needed when the user opens the corresponding
  // panel or tab:
  farm: () => import('./farm.js'),
  wallpaper: () => import('./wallpaper.js'),
  auraMapsMobile: () => import('./auraMapsMobile.js'),
  shareCard: () => import('./shareCard.js'),
  astronomy: () => import('./astronomy.js'),
  dailyBriefing: () => import('./dailyBriefing.js'),
  smartTodos: () => import('./smartTodos.js'),
  myPlaces: () => import('./myPlaces.js'),
  animatedShare: () => import('./animatedShare.js'),
  nativeBridge: () => import('./nativeBridge.js'),
  stargazing: () => import('./stargazing.js'),
  extremes: () => import('./extremes.js'),
  terminator: () => import('./terminator.js'),
  rainPush: () => import('./rainPush.js'),
  // analytics.init() is split out: initWebVitals is imported directly by
  // app.js, but the Analytics instance setup (localStorage read, app_loaded
  // tracking) runs lazily here.
  analytics: () => import('./analytics.js'),
};

let heavyPromise = null;

export function initHeavyFeatures(app) {
  if (heavyPromise) return heavyPromise;
  heavyPromise = Promise.allSettled(
    Object.entries(heavyFeatureImports).map(async ([name, importFn]) => {
      try {
        const mod = await importFn();
        if (typeof mod.init === 'function') mod.init(app);
      } catch (e) {
        console.warn(`Heavy feature "${name}" failed to initialize:`, e);
      }
    }),
  );
  return heavyPromise;
}

export function initFeatures(app) {
  for (const [name, mod] of Object.entries(featureModules)) {
    try {
      if (typeof mod.init === 'function') mod.init(app);
    } catch (e) {
      console.warn(`Feature "${name}" failed to initialize:`, e);
    }
  }

  // Kick off heavy-feature loading during idle/after first paint so the
  // critical path (map + weather + panel) isn't blocked by their parse/eval
  // cost.
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => initHeavyFeatures(app), { timeout: 1500 });
  } else {
    setTimeout(() => initHeavyFeatures(app), 0);
  }
}
