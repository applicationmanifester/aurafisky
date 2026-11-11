// Runs under Vitest
import { test, describe, expect } from "vitest";
import fs from "fs";

const appJs = fs.readFileSync("app.js", "utf-8");
const indexHtml = fs.readFileSync("index.html", "utf-8");
const viteConfig = fs.readFileSync("vite.config.js", "utf-8");
const switchModule = fs.readFileSync("modules/basemap-switch.js", "utf-8");
const readyModule = fs.readFileSync("modules/basemap-ready.js", "utf-8");
const prewarmModule = fs.readFileSync("modules/basemap-prewarm.js", "utf-8");

/**
 * Extract a class method body by brace matching, so the assertions below
 * target the code they are about instead of a fragile slice of the whole
 * file. Matches the *definition* of a method, not a call to it.
 */
function methodBody(source, name) {
  const definition = new RegExp(`^[ \\t]{2}${name}\\(`, "m").exec(source);
  if (!definition) return "";

  // Walk past the parameter list to the brace that opens the body.
  let i = definition.index + definition[0].length - 1;
  let depth = 0;
  do {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    i++;
  } while (i < source.length && depth > 0);

  const open = source.indexOf("{", i);
  if (open === -1) return "";
  depth = 0;
  for (let j = open; j < source.length; j++) {
    const ch = source[j];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(open, j + 1);
    }
  }
  return source.slice(open);
}

describe("Map mode switching — wiring", () => {
  test("app.js delegates the switch to the module", () => {
    expect(appJs).toContain('from "./modules/basemap-switch.js"');
    const update = methodBody(appJs, "_updateActiveBasemap");
    expect(update).not.toBe("");
    expect(update).toContain("switchBasemap(this)");
  });

  test("the switch state is initialised in initMap", () => {
    expect(appJs).toContain("initBasemapSwitching(this)");
    const init = methodBody(appJs, "initMap");
    expect(init).toContain("initBasemapSwitching(this)");
  });

  test("the loading indicator exists and is wired to the switch", () => {
    expect(indexHtml).toContain('id="mapModeLoadingIndicator"');
    expect(indexHtml).toContain('id="mapModeLoadingLabel"');
    expect(switchModule).toContain('document.getElementById("mapModeLoadingIndicator")');
    // The indicator is hidden by default and only shown for a switch.
    expect(indexHtml).toMatch(/id="mapModeLoadingIndicator"[^>]*class="[^"]*\bhidden\b/);
  });

  test("the map opacity slider cannot reveal the pending basemap mid-switch", () => {
    expect(appJs).toContain("this._pendingBasemapGroup");
    const applyOpacity = methodBody(appJs, "_applyMapOpacity");
    expect(applyOpacity).toContain(
      "this._pendingBasemapGroup && layer === this._pendingBasemapGroup",
    );
  });
});

describe("Map mode switching — perceived speed", () => {
  test("the previous basemap is held on screen until the new one has tiles", () => {
    // The old behaviour crossfaded immediately, which revealed an empty
    // canvas while the new tile host was still downloading.
    expect(switchModule).toContain("awaitBasemapReady(targetGroup).then(");
    expect(switchModule).toContain("crossfadeBasemap(app, targetGroup, token)");
    // The new basemap goes in transparent, under the old one.
    expect(switchModule).toContain("l.setOpacity(0)");
    expect(switchModule).toContain("layers.insertAt(0, targetGroup)");
  });

  test("the crossfade lives in its own guarded method", () => {
    expect(switchModule).toContain("export function crossfadeBasemap(");
    expect(switchModule).toContain("l.animate?.({ opacity: 0, duration: CROSSFADE_MS })");
    expect(switchModule).toContain(
      "l.animate?.({ opacity: app.mapOpacity ?? 1, duration: CROSSFADE_MS })",
    );
  });

  test("readiness waits for the basemap to have tiles and has a hard timeout", () => {
    // The timing logic lives in modules/basemap-ready.js so it can be
    // unit-tested against fake sources (tests/basemapReady.test.mjs).
    expect(readyModule).toContain("tileloadend");
    expect(readyModule).toContain("tileloaderror");
    expect(readyModule).toContain("timeoutMs");
    expect(readyModule).toContain("hardTimer = setTimeout(");
    // Every source in the group has to settle, not just the first one.
    expect(readyModule).toContain("sources.every((s) => settledSources.has(s))");
    // Readiness is measured — the basemap has to have drawn tiles — rather
    // than guessed from a timer, because "no tile load started" also means
    // "the tile is queued behind a few hundred others".
    expect(readyModule).toContain("renderedTiles");
  });

  test("the switch never fades to an empty map", () => {
    // When the tiles are still queued the previous basemap is held on
    // screen instead of being faded out over a blank canvas.
    expect(switchModule).toContain("waitForFirstTile");
    expect(switchModule).toContain("if (loaded)");
  });

  test("the outgoing basemap's tile backlog is dropped so the new one can start", () => {
    // The vector basemap queues a separate tile per layer — a few hundred
    // entries for two dozen real tiles — and they would stand in front of
    // the new basemap's tiles.
    expect(switchModule).toContain("dropQueuedTiles");
    expect(switchModule).toContain("queue.clear()");
    expect(switchModule).toContain("queue.tilesLoading_ = 0");
    expect(appJs).toContain("maxTilesLoading");
  });

  test("a superseded switch cannot crossfade a basemap the user moved on from", () => {
    expect(switchModule).toContain("const token = ++app._basemapSwitchToken;");
    expect(switchModule).toContain("if (token !== app._basemapSwitchToken) return; // superseded");
    expect(switchModule).toContain("if (token !== app._basemapSwitchToken) return;");
  });
});

describe("Map mode switching — network speed", () => {
  test("tiles for the other map modes are prewarmed", () => {
    expect(appJs).toContain("scheduleBasemapPrewarm(this, 2500)");
    expect(appJs).toContain("scheduleBasemapPrewarm(this, 1800)");
    expect(appJs).toContain("prewarmBasemaps(this, { maxStyles: 99");
    expect(switchModule).toContain("export function prewarmBasemaps(");
    expect(switchModule).toContain("export function prewarmTile(");
    expect(switchModule).toContain("export function scheduleBasemapPrewarm(");
  });

  test("prewarming is scheduled on startup, on pan, and when the picker opens", () => {
    // Startup and on pan live in app.js; the picker and the post-switch
    // re-warm live in the module.
    const scheduled = appJs.match(/scheduleBasemapPrewarm\(/g) || [];
    expect(scheduled.length).toBeGreaterThanOrEqual(2);
    expect(appJs).toContain("scheduleBasemapPrewarm(this, 2500)");
    expect(appJs).toContain("scheduleBasemapPrewarm(this, 1800)");
    expect(switchModule).toContain("scheduleBasemapPrewarm(app, 600)");
  });

  test("prewarming never runs on a metered or slow connection", () => {
    expect(switchModule).toContain("shouldPrewarm(");
    expect(switchModule).toContain("navigator.connection");
    expect(prewarmModule).toContain("saveData");
  });

  test("prewarming clamps the zoom to each source's own tile grid", () => {
    // The ocean basemap tops out at z10; without clamping the tile maths
    // produces NaN coordinates and broken URLs.
    expect(switchModule).toContain("clampZoomToGrid(grid, zoom)");
    expect(switchModule).toContain("grid.getTileRangeForExtentAndZ(extent, z)");
  });

  test("the street and dark vector basemaps are warmed too", () => {
    // They are the most common switch of all, and they live outside the
    // lazily created basemap cache — without this they were never warmed
    // and every street <-> dark switch was a cold fetch.
    expect(switchModule).toContain('candidates.set("street", app.lightBasemap)');
    expect(switchModule).toContain('candidates.set("dark", app.darkBasemap)');
    expect(prewarmModule).toMatch(/PREWARM_PRIORITY = \[[\s\S]*"dark"/);
  });

  test("vector basemaps get a smaller slice of the prewarm budget", () => {
    // Their tiles are PBF — an order of magnitude larger than raster tiles.
    expect(switchModule).toContain("VECTOR_BASEMAPS");
    expect(switchModule).toContain("MAX_VECTOR_TILES_PER_LAYER");
  });

  test("layers that share a source are only warmed once", () => {
    // A vector basemap draws many layers from one source — walking them
    // per layer would burn the budget on the same tiles.
    expect(switchModule).toContain("!sources.includes(source)");
  });

  test("prewarmed tiles are fetched at low priority and never repeat", () => {
    expect(switchModule).toContain('priority: "low"');
    expect(switchModule).toContain("app._prewarmedTileUrls.has(url)");
  });
});

describe("Map mode switching — offline and repeat-visit caching", () => {
  test("every basemap tile host has a service worker cache route", () => {
    // OpenTopoMap was the one mode with no cache route at all, so every
    // switch back to it re-downloaded every tile.
    expect(viteConfig).toContain("tile.openstreetmap.org");
    expect(viteConfig).toContain("server.arcgisonline.com");
    expect(viteConfig).toContain("opentopomap.org");
    expect(viteConfig).toContain("tiles.openfreemap.org");
  });

  test("the OpenTopoMap route caches tiles with an expiry", () => {
    const idx = viteConfig.indexOf("opentopomap.org");
    expect(idx).toBeGreaterThan(-1);
    const route = viteConfig.slice(idx, idx + 700);
    expect(route).toContain('handler: "CacheFirst"');
    expect(route).toContain("maxAgeSeconds");
  });
});

describe("Map startup loading optimizations", () => {
  test("index.html does not eagerly preload the dark style alongside liberty", () => {
    expect(indexHtml).toContain("https://tiles.openfreemap.org/styles/liberty");
    expect(indexHtml).not.toMatch(/<link[^>]*rel="preload"[^>]*styles\/dark/);
  });

  test("initMap initializes View directly from _getInitialMapView instead of global zoom 3", () => {
    const init = methodBody(appJs, "initMap");
    expect(init).toContain("const initialView = this._getInitialMapView()");
    expect(init).toContain("center: initialView.center");
    expect(init).toContain("zoom: initialView.zoom");
  });

  test("instant OSM raster tiles start visible and never preload vector zoom-1 tiles at boot", () => {
    const init = methodBody(appJs, "initMap");
    expect(init).toContain("visible: true");
    expect(init).toContain("aurafiskyStagedPending");
    expect(init).toContain("isVectorViewportReady");
    expect(init).not.toContain("vtLayer.setPreload(1)");
    expect(init).not.toContain("Object.values(this._basemapFactories).forEach");
    expect(init).not.toContain("loadBasemap(inactiveTheme");
  });

  test("theme switching activates instant raster immediately while staging GL vector layers", () => {
    const activate = methodBody(appJs, "_activateStyleGroup");
    expect(activate).toContain("setMapModeLoading(this, true)");
    expect(activate).toContain("this._ensureBasemapLoaded(targetTheme)");
    expect(activate).toContain("this._updateActiveBasemap()");
  });

  test("OpenFreeMap preconnect matches CORS mode and SW serves styles via StaleWhileRevalidate", () => {
    expect(indexHtml).toContain('<link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin />');
    expect(viteConfig).toContain("handler: 'StaleWhileRevalidate'");
  });
});
