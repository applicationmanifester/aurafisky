// Wait until a basemap group has something worth showing.
//
// Switching map modes used to crossfade immediately, which revealed an
// empty canvas while the new tile host was still downloading. Instead the
// previous basemap is held on screen until the new one has tiles.
//
// This is deliberately OpenLayers-free: the group is duck-typed (anything
// with a `getLayers()` that can be iterated), so the timing logic can be
// unit-tested against fake sources with fake timers.

/**
 * @typedef {object} TileSourceLike
 * @property {(type: string, listener: Function) => void} on
 * @property {(type: string, listener: Function) => void} [un]
 */

/**
 * @typedef {object} LayerGroupLike
 * @property {() => {forEach: (cb: (layer: any) => void) => void}} getLayers
 */

/**
 * Resolve once a basemap group has something worth showing.
 *
 * "Something to show" is measured, not guessed:
 *  - The group's layers have drawn tiles (their renderer has rendered
 *    tiles). That is what "the basemap is on screen" actually means, and it
 *    is true immediately when the tiles are already cached.
 *  - Every source in the group has settled a tile — the tiles are on their
 *    way and the base layer is usable.
 *
 * A group can hold several layers (satellite imagery plus a label overlay,
 * or a raster fallback plus vector tiles), so every source in it has to
 * settle before the switch goes through. The base layer is allowed to carry
 * the switch on its own after a short grace, so a slow overlay never holds
 * the whole map hostage.
 *
 * The result says whether tiles actually arrived. When it is false the hard
 * timeout fired first — the tile queue was still backed up — and the caller
 * should hold the previous basemap rather than fade to an empty one.
 *
 * @param {LayerGroupLike} group an OpenLayers layer group
 * @param {{settleGraceMs?: number, timeoutMs?: number, pollMs?: number}} [opts]
 * @returns {Promise<{loaded: boolean}>}
 */
export function isStagedPendingLayer(layer) {
  return Boolean(layer && typeof layer.get === "function" && layer.get("aurafiskyStagedPending"));
}

/**
 * Verify that all in-bounds tiles covering the current map viewport have
 * actually finished loading into `loadedTileKeys` for the given vector layers.
 * Prevents promoting a half-loaded OpenFreeMap layer (whose opaque Mapbox
 * background fill would cover the instant OSM raster fallback while other PBF
 * tiles are still stalled).
 *
 * @param {any} map OpenLayers Map instance
 * @param {any[]} layers vector layers covering the viewport
 * @param {Set<string>} loadedTileKeys loaded `${z}/${x}/${y}` tile keys
 * @returns {boolean}
 */
export function isVectorViewportReady(map, layers, loadedTileKeys) {
  if (!map || !Array.isArray(layers) || !layers.length) return false;
  if (!loadedTileKeys || typeof loadedTileKeys.has !== "function" || loadedTileKeys.size === 0) {
    return false;
  }
  const view = typeof map.getView === "function" ? map.getView() : null;
  const size = typeof map.getSize === "function" ? map.getSize() : null;
  const res = typeof view?.getResolution === "function" ? view.getResolution() : null;
  if (!view || !Array.isArray(size) || !(size[0] > 0) || !(size[1] > 0) || !Number.isFinite(res) || res <= 0) {
    return false;
  }
  const extent = typeof view.calculateExtent === "function" ? view.calculateExtent(size) : null;
  if (!extent) return false;

  let layersChecked = 0;
  for (const layer of layers) {
    const src = typeof layer?.getSource === "function" ? layer.getSource() : null;
    const grid =
      (typeof src?.getTileGridForResolution === "function" && src.getTileGridForResolution(res)) ||
      (typeof src?.getTileGrid === "function" && src.getTileGrid());
    if (!grid || typeof grid.getZForResolution !== "function" || typeof grid.getTileRangeForExtentAndZ !== "function") {
      continue;
    }
    const z = grid.getZForResolution(res);
    const range = grid.getTileRangeForExtentAndZ(extent, z);
    if (!range) return false;
    const fullRange = typeof grid.getFullTileRange === "function" ? grid.getFullTileRange(z) : null;
    const wrapSpanX =
      fullRange && fullRange.maxX >= fullRange.minX ? fullRange.maxX - fullRange.minX + 1 : 0;

    layersChecked += 1;
    let checked = 0;
    for (let x = range.minX; x <= range.maxX; x += 1) {
      const normX = wrapSpanX > 0 ? fullRange.minX + ((((x - fullRange.minX) % wrapSpanX) + wrapSpanX) % wrapSpanX) : x;
      for (let y = range.minY; y <= range.maxY; y += 1) {
        if (fullRange && (y < fullRange.minY || y > fullRange.maxY)) continue;
        checked += 1;
        if (!loadedTileKeys.has(`${z}/${x}/${y}`) && !loadedTileKeys.has(`${z}/${normX}/${y}`)) {
          return false;
        }
      }
    }
    if (checked === 0) return false;
  }
  return layersChecked > 0;
}

export function awaitBasemapReady(
  group,
  { settleGraceMs = 350, timeoutMs = 6000, pollMs = 60 } = {},
) {
  return new Promise((resolve) => {
    const layers = [];
    const sources = [];
    try {
      group.getLayers().forEach((layer) => {
        if (isStagedPendingLayer(layer)) return;
        layers.push(layer);
        const src = typeof layer.getSource === "function" ? layer.getSource() : null;
        // Several layers of a vector basemap share one source — only wait
        // for it once.
        if (src && typeof src.on === "function" && !sources.includes(src)) {
          sources.push(src);
        }
      });
    } catch (_) {
      // A group we cannot inspect is treated as ready — the timeout below
      // is the backstop either way.
    }

    if (!sources.length) {
      resolve({ loaded: true });
      return;
    }

    let settled = false;
    let sawTile = false;
    let settleTimer = null;
    let hardTimer = null;
    let pollTimer = null;
    const settledSources = new Set();
    const bindings = [];

    const cleanup = () => {
      if (settleTimer) clearTimeout(settleTimer);
      if (hardTimer) clearTimeout(hardTimer);
      if (pollTimer) clearInterval(pollTimer);
      bindings.forEach(({ src, handler, errorHandler }) => {
        if (typeof src.un !== "function") return;
        src.un("tileloadend", handler);
        src.un("tileloaderror", errorHandler);
      });
    };

    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ loaded });
    };

    const markSettled = (src) => {
      sawTile = true;
      if (settledSources.has(src)) return;
      settledSources.add(src);
      if (sources.every((s) => settledSources.has(s))) {
        finish(true);
        return;
      }
      // The base layer is ready but an overlay is still in flight — give
      // the overlay a moment, then go ahead without it. Only the base
      // layer may carry the switch on its own; an overlay settling first
      // must not cut the base layer's wait short.
      if (src !== sources[0]) return;
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(() => finish(true), settleGraceMs);
    };

    sources.forEach((src) => {
      const handler = () => markSettled(src);
      const errorHandler = () => markSettled(src);
      src.on("tileloadend", handler);
      src.on("tileloaderror", errorHandler);
      bindings.push({ src, handler, errorHandler });
    });

    // The basemap is on screen as soon as one of its layers has drawn
    // tiles. This is what makes a switch to an already-cached basemap
    // instant, and it is deliberately not a timer: "no tile load started"
    // also means "the tile is queued behind a few hundred others", and
    // guessing wrong there fades to an empty map.
    pollTimer = setInterval(() => {
      const painted = layers.some((layer) => {
        if (typeof layer.getRenderer !== "function") return false;
        const renderer = layer.getRenderer();
        return Boolean(
          renderer &&
            Array.isArray(renderer.renderedTiles) &&
            renderer.renderedTiles.length > 0,
        );
      });
      if (painted) finish(true);
    }, pollMs);

    // A tile server that never answers must not freeze the map — but the
    // map is only faded to when there is actually something to show.
    hardTimer = setTimeout(() => finish(sawTile), timeoutMs);
  });
}

/**
 * Resolve when a basemap's first tile lands.
 *
 * Used when the switch gave up waiting: the tiles are still on their way
 * (the tile queue can back up behind the vector basemap's own requests),
 * and fading to an empty map would be worse than waiting.
 *
 * @param {LayerGroupLike} group an OpenLayers layer group
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<boolean>} whether a tile arrived
 */
export function waitForFirstTile(group, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve) => {
    const sources = [];
    try {
      group.getLayers().forEach((layer) => {
        if (isStagedPendingLayer(layer)) return;
        const src = typeof layer.getSource === "function" ? layer.getSource() : null;
        if (src && typeof src.on === "function" && !sources.includes(src)) {
          sources.push(src);
        }
      });
    } catch (_) {
      resolve(false);
      return;
    }

    if (!sources.length) {
      resolve(false);
      return;
    }

    let done = false;
    const bindings = [];
    const finish = (arrived) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      bindings.forEach(({ src, handler }) => {
        if (typeof src.un === "function") src.un("tileloadend", handler);
      });
      resolve(arrived);
    };

    sources.forEach((src) => {
      const handler = () => finish(true);
      src.on("tileloadend", handler);
      bindings.push({ src, handler });
    });

    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}
