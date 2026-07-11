// Lazy-loaded feature registry. Each module exposes init(app) and attaches
// itself to the running AurafiskyApp instance. Keeps app.js lean and lets
// features load on demand (code-splitting / Phase-1 modularization).
export async function initFeatures(app) {
  const mods = ["ensemble", "routes", "copilot"];
  for (const name of mods) {
    try {
      const mod = await import(`./${name}.js`);
      if (typeof mod.init === "function") mod.init(app);
    } catch (e) {
      console.warn(`Feature "${name}" failed to initialize:`, e);
    }
  }
}
