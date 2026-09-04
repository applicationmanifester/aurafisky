// Feature registry. Every module exposes init(app) and attaches its methods
// directly onto the running AurafiskyApp instance (app.foo = foo), so `this`
// inside each extracted function resolves normally at the call site.
//
// Loaded eagerly via static imports (NOT dynamic import()) and run
// synchronously from inside the AurafiskyApp constructor, before any event
// listener is bound or any feature method is called directly. Static import
// guarantees every module below is fully evaluated before this file's own
// top-level code runs (ES module semantics) — no lazy-load race is possible.
//
// If a lazily-loaded / code-split feature is ever wanted again, load it with
// dynamic import() *and* verify every call site guards on a readiness flag
// first (see app._ensembleReady for the existing example of that pattern).
import * as ensemble from './ensemble.js';
import * as routes from './routes.js';
import * as radar from './radar.js';
import * as bookmarks from './bookmarks.js';
import * as compareCities from './compareCities.js';
import * as units from './units.js';
import * as share from './share.js';
import * as hourlyStrip from './hourlyStrip.js';
import * as insights from './insights.js';
import * as minimalMode from './minimalMode.js';
import * as canvasEffects from './canvasEffects.js';
import * as audio from './audio.js';
import * as myLocation from './myLocation.js';
import * as timeMachine from './timeMachine.js';
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

const featureModules = {
  ensemble,
  routes,
  radar,
  bookmarks,
  compareCities,
  units,
  share,
  hourlyStrip,
  insights,
  minimalMode,
  canvasEffects,
  audio,
  myLocation,
  timeMachine,
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
};

export function initFeatures(app) {
  for (const [name, mod] of Object.entries(featureModules)) {
    try {
      if (typeof mod.init === 'function') mod.init(app);
    } catch (e) {
      console.warn(`Feature "${name}" failed to initialize:`, e);
    }
  }
}
