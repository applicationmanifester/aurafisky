// Helpers for making map-mode switches feel instant.
//
// Every map mode is served by a different tile host, so switching modes
// normally means a cold round-trip to that host. The user picks "Satellite"
// and the canvas under the crossfade is empty until those tiles arrive —
// which reads as "the map is slow to load".
//
// Two things fix that:
//
//   1. Prewarm: fetch the tiles for the current viewport ahead of time, so
//      the switch is a cache hit instead of a network round-trip.
//   2. Hold: keep the previous basemap on screen until the new one has
//      something to show, so the switch never reveals an empty canvas.
//
// This module holds the pure planning/URL math so it can be unit-tested
// without OpenLayers. app.js does the DOM and OL work.

/**
 * Map modes worth prewarming, most-wanted first. The modes people actually
 * switch to come first so a tight data budget is spent where it counts.
 *
 * "dark" sits second because switching between the street and dark vector
 * basemaps is the most frequent switch of all.
 *
 * The list is a general-purpose guess. The modes this user has actually
 * switched to in this session are put in front of it at prewarm time, so
 * the budget follows the user's own habits rather than everybody's.
 */
export const PREWARM_PRIORITY = [
  "satellite",
  "dark",
  "terrain",
  "street",
  "hybrid",
  "hillshade",
  "opentopo",
  "ocean",
  "natgeo",
  "gray",
  "darkgray",
  "transport",
  "hillshadedark",
];

/** Maximum number of tiles fetched for a single basemap layer per cycle. */
export const MAX_TILES_PER_LAYER = 12;

/** Maximum number of tiles fetched across all basemaps per cycle. */
export const MAX_TILES_PER_CYCLE = 64;

/**
 * Decide whether prewarming is appropriate for this connection.
 *
 * Prewarming spends the user's data before they ask for it, so it has to
 * stay off on metered and slow connections.
 *
 * @param {any} [connection] navigator.connection (Network Information API)
 * @returns {boolean}
 */
export function shouldPrewarm(connection) {
  if (!connection) return true;
  if (connection.saveData) return false;
  const type = connection.effectiveType || "";
  if (type === "slow-2g" || type === "2g") return false;
  return true;
}

/**
 * Order the map modes that should be prewarmed.
 *
 * The active mode is never prewarmed — its tiles are already in use — and
 * anything outside the priority list still gets warmed, just later.
 *
 * @param {object} opts
 * @param {string[]} opts.available styles that have a cached layer group
 * @param {string} opts.activeStyle the style currently on screen
 * @param {string[]} [opts.priority] preference order
 * @param {number} [opts.maxStyles] cap on how many styles to warm
 * @returns {string[]}
 */
export function planPrewarm({
  available,
  activeStyle,
  priority = PREWARM_PRIORITY,
  maxStyles = Infinity,
}) {
  const seen = new Set(available || []);
  const ordered = priority.filter((style) => seen.has(style) && style !== activeStyle);
  const extras = Array.from(seen).filter(
    (style) => style !== activeStyle && !priority.includes(style),
  );
  const all = ordered.concat(extras);
  const limit = Number.isFinite(maxStyles) ? Math.max(0, maxStyles) : all.length;
  return all.slice(0, limit);
}

/**
 * Clamp a zoom level to what a tile grid can actually serve.
 *
 * Each basemap's grid stops at its own maximum zoom (the ocean basemap tops
 * out at z10, NatGeo at z12). Asking such a grid for a deeper level yields
 * NaN tile coordinates and broken URLs, so the zoom has to be clamped before
 * any tile math happens.
 *
 * @param {{minZoom?: number, maxZoom?: number}} grid an OpenLayers tile grid
 * @param {number} zoom the wanted zoom level
 * @returns {number}
 */
export function clampZoomToGrid(grid, zoom) {
  const rounded = Math.round(Number(zoom));
  if (!Number.isFinite(rounded)) return 0;
  if (!grid) return rounded;
  const min = Number.isFinite(grid.minZoom) ? grid.minZoom : 0;
  const max = Number.isFinite(grid.maxZoom) ? grid.maxZoom : rounded;
  return Math.min(Math.max(rounded, min), max);
}

/**
 * Expand a tile range into tile URLs, nearest to the focus first.
 *
 * A viewport can cover dozens of tiles but a prewarm cycle only has a
 * small budget, so the tiles are ordered by distance from what the user is
 * looking at. That way a capped prewarm covers the middle of the screen
 * instead of the top-left corner of the world.
 *
 * @param {object} opts
 * @param {{minX:number,maxX:number,minY:number,maxY:number}} opts.range
 * @param {number} opts.z zoom level the range was computed for
 * @param {(coord:number[], pixelRatio:number, projection:any)=>string} opts.urlFn
 * @param {number} [opts.maxTiles]
 * @param {any} [opts.projection]
 * @param {number} [opts.pixelRatio]
 * @param {{x:number,y:number}} [opts.focus] tile coordinate to centre on
 * @returns {string[]}
 */
export function tileRangeToUrls({
  range,
  z,
  urlFn,
  maxTiles = MAX_TILES_PER_LAYER,
  projection,
  pixelRatio = 1,
  focus,
}) {
  if (!range || typeof urlFn !== "function") return [];
  const limit = Math.max(0, Math.floor(Number(maxTiles)) || 0);
  if (!limit) return [];

  const minX = Math.min(range.minX, range.maxX);
  const maxX = Math.max(range.minX, range.maxX);
  const minY = Math.min(range.minY, range.maxY);
  const maxY = Math.max(range.minY, range.maxY);

  const focusX = focus && Number.isFinite(focus.x) ? focus.x : (minX + maxX) / 2;
  const focusY = focus && Number.isFinite(focus.y) ? focus.y : (minY + maxY) / 2;

  const coords = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      coords.push([x, y]);
    }
  }
  coords.sort((a, b) => {
    const da = (a[0] - focusX) ** 2 + (a[1] - focusY) ** 2;
    const db = (b[0] - focusX) ** 2 + (b[1] - focusY) ** 2;
    return da - db;
  });

  const urls = [];
  for (const [x, y] of coords) {
    if (urls.length >= limit) break;
    let url;
    try {
      url = urlFn([z, x, y], pixelRatio, projection);
    } catch (_) {
      url = undefined;
    }
    if (url) urls.push(url);
  }
  return urls;
}
