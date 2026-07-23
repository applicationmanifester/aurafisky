// Lazy-loaded feature registry. Each module exposes init(app) and attaches
// itself to the running AurafiskyApp instance. Keeps app.ts lean and lets
// features load on demand (code-splitting / Phase-1 modularization).

interface AppInstance {
  [key: string]: any;
}

interface FeatureModule {
  init: (app: AppInstance) => void;
}

const featureModules: Record<string, () => Promise<FeatureModule>> = {
  ensemble: () => import('./ensemble.ts'),
  routes: () => import('./routes.ts'),
  copilot: () => import('./copilot.ts'),
};

export async function initFeatures(app: AppInstance): Promise<void> {
  for (const [name, loader] of Object.entries(featureModules)) {
    try {
      const mod = await loader();
      if (typeof mod.init === 'function') mod.init(app);
    } catch (e) {
      console.warn(`Feature "${name}" failed to initialize:`, e);
    }
  }
}