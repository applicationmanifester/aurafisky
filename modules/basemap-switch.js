// Fast map-mode switching.
//
// Every map mode is served by a different tile host, so switching modes
// normally means a cold round-trip to that host. The user picks "Satellite"
// and the canvas under the crossfade is empty until those tiles arrive —
// which reads as "the map is slow to load".
//
// Three things fix that:
//
//   1. Hold: keep the previous basemap on screen until the new one has
//      something to show, so the switch never reveals an empty canvas.
//   2. Prewarm: fetch the tiles for the current viewport ahead of time, so
//      the switch is a cache hit instead of a network round-trip.
//   3. Token: a switch that has been superseded must not crossfade a
//      basemap the user already moved on from.
//
// The logic lives here rather than in app.js so it stays together, stays
// testable, and so the wiring in app.js is a handful of lines.

import {
  MAX_TILES_PER_CYCLE,
  MAX_TILES_PER_LAYER,
  clampZoomToGrid,
  planPrewarm,
  shouldPrewarm,
  tileRangeToUrls,
} from "./basemap-prewarm.js";
import { awaitBasemapReady, isStagedPendingLayer, waitForFirstTile } from "./basemap-ready.js";

// The OpenFreeMap vector basemaps. Their tiles are PBF, an order of
// magnitude larger than the raster tiles of the other modes, so prewarming
// spends a smaller slice of the budget on them.
const VECTOR_BASEMAPS = new Set(["street", "dark"]);
const MAX_VECTOR_TILES_PER_LAYER = 6;

const CROSSFADE_MS = 250;

/**
 * Prepare the app for fast basemap switching.
 * @param {any} app the AurafiskyApp instance
 */
export function initBasemapSwitching(app) {
  if (!app) return;
  app._basemapSwitchToken = 0;
  app._prewarmedTileUrls = new Set();
  app._basemapPrewarmTimer = null;
  app._pendingBasemapGroup = null;
}

/**
 * Switch the map to the app's current map style.
 *
 * The new basemap is put on the map fully transparent while the old one
 * keeps covering it, and only fades in once it has tiles.
 *
 * @param {any} app the AurafiskyApp instance
 */
export function switchBasemap(app) {
  if (!app || !app.map) return;
  const targetGroup = app._getBasemap(app.mapStyle);
  if (!targetGroup) return;

  // If the same basemap is already active, just ensure it's visible.
  if (app._currentBasemapGroup === targetGroup) {
    targetGroup.setVisible(true);
    app._applyMapOpacity();
    app._applyTerrainOverlay();
    app._applyPlaceLabels?.();
    return;
  }

  // Every switch supersedes the previous one. The token lets an in-flight
  // switch — still waiting for its tiles — notice that it was replaced and
  // bail out instead of crossfading a basemap the user already moved on
  // from. Without it, tapping through the modes quickly left the map
  // showing whichever basemap happened to finish last.
  const token = ++app._basemapSwitchToken;

  const layers = app.map.getLayers();

  // Hide all other basemap groups first so only old + new are in play.
  const allGroups = [
    app.lightBasemap,
    app.darkBasemap,
    ...Object.values(app._basemapCache || {}),
  ];
  allGroups.forEach((g) => {
    if (g && g !== app._currentBasemapGroup && g !== targetGroup) {
      g.setVisible(false);
      while (layers.getArray().includes(g)) {
        layers.remove(g);
      }
    }
  });

  // Ensure the target group is in the map (at the bottom) and transparent.
  targetGroup.setVisible(true);
  if (typeof targetGroup.getLayers === "function") {
    targetGroup.getLayers().forEach((l) => {
      if (typeof l.setVisible === "function") l.setVisible(true);
      if (typeof l.setOpacity === "function") l.setOpacity(0);
    });
  }
  // Whatever this basemap drew last time it was on the map no longer counts.
  resetRenderedState(targetGroup);
  if (!layers.getArray().includes(targetGroup)) {
    layers.insertAt(0, targetGroup);
  }

  // The outgoing basemap's backlog must not stand in front of the new
  // basemap's tiles.
  dropQueuedTiles(app.map);

  // Hold the old map until the new one has something to show.
  app._pendingBasemapGroup = targetGroup;
  setMapModeLoading(app, true);
  awaitBasemapReady(targetGroup).then(({ loaded }) => {
    if (token !== app._basemapSwitchToken) return; // superseded
    if (loaded) {
      crossfadeBasemap(app, targetGroup, token);
      return;
    }
    // The tiles are still on their way — the tile queue can back up behind
    // the vector basemap's own requests. Fading to an empty map would be
    // worse than waiting, so hold the old basemap and crossfade as soon as
    // the first tile lands.
    waitForFirstTile(targetGroup).then(() => {
      if (token !== app._basemapSwitchToken) return;
      crossfadeBasemap(app, targetGroup, token);
    });
  });
}

/**
 * Crossfade from the currently visible basemap to `targetGroup`.
 *
 * @param {any} app the AurafiskyApp instance
 * @param {any} targetGroup the OpenLayers layer group to fade in
 * @param {number} token the switch token this crossfade belongs to
 */
export function crossfadeBasemap(app, targetGroup, token) {
  if (!app || !app.map) return;
  const layers = app.map.getLayers();
  const previous = app._currentBasemapGroup;

  // Fade out the old group and fade in the new one simultaneously.
  if (previous && typeof previous.getLayers === "function") {
    previous.getLayers().forEach((l) => {
      if (isStagedPendingLayer(l)) return;
      if (typeof l.setOpacity === "function") {
        l.setOpacity(1);
        l.animate?.({ opacity: 0, duration: CROSSFADE_MS });
      }
    });
  }
  if (typeof targetGroup.getLayers === "function") {
    targetGroup.getLayers().forEach((l) => {
      if (isStagedPendingLayer(l)) return;
      if (typeof l.setOpacity === "function") {
        l.animate?.({ opacity: app.mapOpacity ?? 1, duration: CROSSFADE_MS });
      }
    });
  }

  // Once the fade is done, remove the old group and clean up.
  setTimeout(() => {
    if (token !== app._basemapSwitchToken) return;
    if (previous) {
      previous.setVisible(false);
      while (layers.getArray().includes(previous)) {
        layers.remove(previous);
      }
      if (typeof previous.getLayers === "function") {
        previous.getLayers().forEach((l) => {
          if (isStagedPendingLayer(l)) return;
          if (typeof l.setOpacity === "function") l.setOpacity(1);
        });
      }
    }
    app._currentBasemapGroup = targetGroup;
    app._pendingBasemapGroup = null;

    // Apply opacity, terrain overlay, and place labels to the new active basemap.
    app._applyMapOpacity();
    app._applyTerrainOverlay();
    app._applyPlaceLabels?.();
    setMapModeLoading(app, false);
    app.map.render();

    // The basemap the user just left is the one they are most likely to
    // come back to — warm it again for the current viewport.
    scheduleBasemapPrewarm(app, 600);
  }, CROSSFADE_MS + 50);
}

/**
 * Show or hide the "loading map mode" indicator.
 *
 * The previous basemap stays on screen until the new one has tiles, so
 * without this the map looks frozen while the tiles are on their way.
 *
 * @param {any} app the AurafiskyApp instance
 * @param {boolean} on
 */
export function setMapModeLoading(app, on) {
  const indicator = document.getElementById("mapModeLoadingIndicator");
  if (!indicator) return;
  if (on) {
    const label = document.getElementById("mapModeLoadingLabel");
    if (label) {
      const names = {
        street: "Default",
        satellite: "Satellite",
        hybrid: "Hybrid",
        terrain: "Terrain",
        hillshade: "Hillshade",
        opentopo: "OpenTopo",
        ocean: "Ocean",
        natgeo: "NatGeo",
        dark: "Dark",
      };
      label.textContent = `Loading ${names[app.mapStyle] || app.mapStyle || "map"}…`;
    }
    indicator.classList.remove("hidden");
  } else {
    indicator.classList.add("hidden");
  }
}

/**
 * Forget the tiles a basemap's renderer last drew.
 *
 * A renderer keeps the tiles it drew last time it was on the map. Read
 * back, that stale state says "this basemap is on screen" when it is not —
 * which would fade to an empty map when switching back to a mode that was
 * on screen a moment ago.
 *
 * @param {any} group an OpenLayers layer group
 */
function resetRenderedState(group) {
  let layers;
  try {
    layers = group.getLayers();
  } catch (_) {
    return;
  }
  layers.forEach((layer) => {
    if (typeof layer.getRenderer !== "function") return;
    const renderer = layer.getRenderer();
    if (renderer && Array.isArray(renderer.renderedTiles)) {
      renderer.renderedTiles.length = 0;
    }
  });
}

/**
 * Drop the tiles the outgoing basemap left in the tile queue.
 *
 * The OpenFreeMap vector basemap draws a dozen layers from one source, and
 * OpenLayers queues a separate tile per layer — so one viewport leaves a few
 * hundred entries in the queue for two dozen real tiles. They sit in front
 * of the new basemap's tiles, and the switch waits for them: the queue only
 * starts a fixed number of loads at a time, so the satellite's tiles cannot
 * even begin until the vector basemap's backlog has cleared.
 *
 * OpenLayers exposes no public API for this and the queue is internal, so
 * it is touched directly — and the in-flight count is reset to match.
 * Clearing the queue without that leaves the count stranded and blocks the
 * queue permanently, which is worse than the problem being solved.
 *
 * @param {any} map the OpenLayers map
 */
function dropQueuedTiles(map) {
  const queue = map && map.tileQueue_;
  if (!queue) return;
  try {
    queue.clear();
    // The cleared tiles may still be in flight; their slots have to be
    // released or the queue never starts another load.
    queue.tilesLoading_ = 0;
    queue.tilesLoadingKeys_ = {};
  } catch (_) {
    // If the internals ever change, carry on — the switch still works, it
    // is just slower.
  }
}

/**
 * The basemap groups that can be prewarmed, keyed by map mode.
 *
 * The street and dark modes are not in the lazily created basemap cache —
 * they are the OpenFreeMap vector basemaps and live in their own groups —
 * but they are the most common switch of all, so they have to be warmed
 * too.
 *
 * @param {any} app the AurafiskyApp instance
 * @returns {Map<string, any>}
 */
export function prewarmCandidates(app) {
  const candidates = new Map();
  // Only prewarm vector basemaps after their GL style has been loaded; before
  // that they only hold the hidden OSM fallback raster layer. When _glStyles
  // is omitted (e.g. unit-test mocks), include both vector basemaps directly.
  const hasGlCache = Boolean(app._glStyles);
  if (app.lightBasemap && (!hasGlCache || app._glStyles.light)) candidates.set("street", app.lightBasemap);
  if (app.darkBasemap && (!hasGlCache || app._glStyles.dark)) candidates.set("dark", app.darkBasemap);
  for (const [style, group] of Object.entries(app._basemapCache || {})) {
    if (group) candidates.set(style, group);
  }
  return candidates;
}

/**
 * Warm the tiles of one source for the current viewport.
 *
 * @param {any} app the AurafiskyApp instance
 * @param {any} source an OpenLayers tile source
 * @param {object} opts
 * @param {number[]} opts.extent the current viewport extent
 * @param {number} opts.zoom the current zoom level
 * @param {any} opts.projection the view projection
 * @param {number} opts.limit maximum tiles to warm for this source
 * @returns {number} how many tiles were warmed
 */
export function prewarmSourceTiles(app, source, { extent, zoom, projection, limit }) {
  if (!source || typeof source.getTileUrlFunction !== "function") return 0;
  const grid = typeof source.getTileGrid === "function" ? source.getTileGrid() : null;
  if (!grid) return 0;

  // A source's grid stops at its own max zoom (the ocean basemap tops out
  // at z10). Asking for a deeper level yields NaN tile coordinates and
  // broken URLs, so clamp before doing any tile math.
  const z = clampZoomToGrid(grid, zoom);

  let range;
  try {
    range = grid.getTileRangeForExtentAndZ(extent, z);
  } catch (_) {
    return 0;
  }
  if (!range) return 0;

  const urls = tileRangeToUrls({
    range,
    z,
    urlFn: source.getTileUrlFunction(),
    maxTiles: Math.max(0, limit),
    projection,
  });

  urls.forEach((url) => prewarmTile(app, url));
  return urls.length;
}

/**
 * Warm the tile cache for the map modes the user hasn't opened yet.
 *
 * @param {any} app the AurafiskyApp instance
 * @param {{maxStyles?: number, maxTilesPerLayer?: number, budget?: number}} [opts]
 */
export function prewarmBasemaps(
  app,
  { maxStyles = 2, maxTilesPerLayer = MAX_TILES_PER_LAYER, budget = MAX_TILES_PER_CYCLE, force = false } = {},
) {
  if (!app || !app.map || !app._basemapCache) return;
  if (!force && app._initialMapReady === false) return;
  // Prewarming spends the user's data before they ask for it.
  if (!shouldPrewarm(typeof navigator !== "undefined" ? navigator.connection : null)) return;

  const view = app.map.getView();
  if (!view) return;
  const zoom = view.getZoom();
  if (!Number.isFinite(zoom)) return;

  let extent;
  try {
    extent = view.calculateExtent();
  } catch (_) {
    return;
  }
  if (!extent) return;

  const projection = view.getProjection();
  let remaining = Math.max(0, Math.floor(budget) || 0);

  // The OSM place-name overlay sits on top of the basemaps that ship
  // without labels (satellite, terrain, hillshade, ocean, NatGeo). It uses
  // the same raster tiles as the street basemap, so warming it keeps the
  // names from popping in after the switch.
  if (app.placeLabelsLayer && remaining > 0) {
    const source =
      typeof app.placeLabelsLayer.getSource === "function"
        ? app.placeLabelsLayer.getSource()
        : null;
    remaining -= prewarmSourceTiles(app, source, {
      extent,
      zoom,
      projection,
      limit: Math.min(6, remaining),
    });
  }

  const candidates = prewarmCandidates(app);
  const styles = planPrewarm({
    available: Array.from(candidates.keys()),
    activeStyle: app.mapStyle,
    maxStyles,
  });

  for (const style of styles) {
    if (remaining <= 0) break;
    const group = candidates.get(style);
    if (!group) continue;

    let layers;
    try {
      layers = group.getLayers();
    } catch (_) {
      continue;
    }

    // A vector basemap has one source shared by every layer it draws, so
    // collect the distinct sources first — otherwise the same tiles would
    // be walked once per layer.
    const sources = [];
    layers.forEach((layer) => {
      const source = typeof layer.getSource === "function" ? layer.getSource() : null;
      if (source && !sources.includes(source)) sources.push(source);
    });

    for (const source of sources) {
      if (remaining <= 0) break;
      // Vector tiles are an order of magnitude larger than raster tiles, so
      // the vector basemaps get a smaller slice of the budget.
      const limit = VECTOR_BASEMAPS.has(style)
        ? Math.min(maxTilesPerLayer, MAX_VECTOR_TILES_PER_LAYER)
        : maxTilesPerLayer;
      remaining -= prewarmSourceTiles(app, source, {
        extent,
        zoom,
        projection,
        limit: Math.min(limit, remaining),
      });
    }
  }
}

/**
 * Fetch one tile ahead of time so the map-mode switch that needs it is a
 * cache hit. Failures are silent — the map still loads the tile itself.
 *
 * @param {any} app the AurafiskyApp instance
 * @param {string} url
 */
export function prewarmTile(app, url) {
  if (!url) return;
  if (!app._prewarmedTileUrls) app._prewarmedTileUrls = new Set();
  if (app._prewarmedTileUrls.has(url)) return;
  app._prewarmedTileUrls.add(url);

  // Keep the set bounded — a long session across many viewports would
  // otherwise grow it without limit.
  if (app._prewarmedTileUrls.size > 800) {
    const oldest = app._prewarmedTileUrls.values().next().value;
    app._prewarmedTileUrls.delete(oldest);
  }

  try {
    fetch(url, { mode: "cors", credentials: "omit", priority: "low" })
      .then(() => {})
      .catch(() => { app._prewarmedTileUrls.delete(url); });
  } catch (_) {
    app._prewarmedTileUrls.delete(url);
  }
}

/**
 * Run the prewarm once the browser is idle so it never competes with the
 * map's own tile loading.
 *
 * @param {any} app the AurafiskyApp instance
 * @param {number} [delay] milliseconds to wait before going idle
 */
export function scheduleBasemapPrewarm(app, delay = 1200) {
  if (!app) return;
  if (app._basemapPrewarmTimer) {
    clearTimeout(app._basemapPrewarmTimer);
    app._basemapPrewarmTimer = null;
  }
  const run = () => {
    app._basemapPrewarmTimer = null;
    try {
      prewarmBasemaps(app);
    } catch (_) {
      // Prewarming is best-effort — never let it break the map.
    }
  };
  if (typeof requestIdleCallback === "function") {
    app._basemapPrewarmTimer = setTimeout(() => {
      requestIdleCallback(run, { timeout: 4000 });
    }, delay);
  } else {
    app._basemapPrewarmTimer = setTimeout(run, delay);
  }
}
