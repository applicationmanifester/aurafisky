// Lazy-loaded feature registry. Each module exposes init(app) and attaches
// itself to the running AurafiskyApp instance. Keeps app.js lean and lets
// features load on demand (code-splitting / Phase-1 modularization).
const featureModules = {
  ensemble: () => import('./ensemble.js'),
  routes: () => import('./routes.js')
};

export async function initFeatures(app) {
  for (const [name, loader] of Object.entries(featureModules)) {
    try {
      const mod = await loader();
      if (typeof mod.init === 'function') mod.init(app);
    } catch (e) {
      console.warn(`Feature "${name}" failed to initialize:`, e);
    }
  }
}
