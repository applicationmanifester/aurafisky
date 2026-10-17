// Feature registry. Every module exposes init(app) and attaches its methods
// directly onto the running AurafiskyApp instance (app.foo = foo), so `this`
// inside each extracted function resolves normally at the call site.
//
// Core features are loaded eagerly (static import) so they're available the
// instant the app boots. Heavy, interaction-gated features (aura assistant,
// routes, time-machine, city comparison) are loaded in the background after
// first paint so they don't block parse/eval of the critical path.
//
// Lazy features are initialized on a setTimeout(0) after the eager set; by
// the time a user clicks a corresponding button they've already evaluated.
// If a call site is reached before loading completes, the corresponding
// app.* method is undefined and call sites must guard (they already do for
// optional features like app._ensembleReady).

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
import * as audio from './audio.js';
import * as myLocation from './myLocation.js';
import * as astronomy from './astronomy.js';
import * as advisories from './advisories.js';
import * as appToggles from './appToggles.js';
import * as dashboard from './dashboard.js';
import * as keyboardShortcuts from './keyboardShortcuts.js';
import * as terminator from './terminator.js';
import * as isobars from './isobars.js';
import * as stargazing from './stargazing.js';
import * as extremes from './extremes.js';
import * as navigation from './navigation.js';
import * as alerts from './alerts.js';
import * as rainPush from './rainPush.js';
import * as dailyBriefing from './dailyBriefing.js';
import * as smartTodos from './smartTodos.js';
import * as myPlaces from './myPlaces.js';
import * as shareCard from './shareCard.js';
import * as wallpaper from './wallpaper.js';
import * as analytics from './analytics.js';
import * as nativeBridge from './nativeBridge.js';
import * as animatedShare from './animatedShare.js';
import * as googleMapsMobile from './googleMapsMobile.js';
import * as deviceProfile from './deviceProfile.js';
import * as tvNavigation from './tvNavigation.js';
import * as sync from './sync.js';

const featureModules = {
  // Device profile runs first so data-device attributes exist on <html>
  // before any other feature (and before first panel paint) reads them.
  deviceProfile,
  tvNavigation,
  sync,
  ensemble,
  radar,
  bookmarks,
  units,
  share,
  hourlyStrip,
  insights,
  minimalMode,
  canvasEffects,
  audio,
  myLocation,
  astronomy,
  advisories,
  appToggles,
  dashboard,
  keyboardShortcuts,
  terminator,
  isobars,
  stargazing,
  extremes,
  navigation,
  alerts,
  rainPush,
  dailyBriefing,
  smartTodos,
  myPlaces,
  shareCard,
  wallpaper,
  googleMapsMobile,
  analytics,
  nativeBridge,
  animatedShare,
};

// ── Heavy / interaction-gated (background-loaded) ─────────────────────
const heavyFeatureImports = {
  aura: () => import('./aura.js'),
  routes: () => import('./routes.js'),
  timeMachine: () => import('./timeMachine.js'),
  compareCities: () => import('./compareCities.js'),
};

let heavyLoaded = false;

export async function initHeavyFeatures(app) {
  if (heavyLoaded) return;
  heavyLoaded = true;
  for (const [name, importFn] of Object.entries(heavyFeatureImports)) {
    try {
      const mod = await importFn();
      if (typeof mod.init === 'function') mod.init(app);
    } catch (e) {
      console.warn(`Heavy feature "${name}" failed to initialize:`, e);
    }
  }
}

export function initFeatures(app) {
  for (const [name, mod] of Object.entries(featureModules)) {
    try {
      if (typeof mod.init === 'function') mod.init(app);
    } catch (e) {
      console.warn(`Feature "${name}" failed to initialize:`, e);
    }
  }

  // Kick off heavy-feature loading on the next tick so the critical path
  // (map + weather + panel) isn't blocked by their parse/eval cost.
  setTimeout(() => initHeavyFeatures(app), 0);
}
