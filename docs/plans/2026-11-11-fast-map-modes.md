# Fast-loading map modes

> **Goal:** switching map mode should feel instant — no blank canvas while the
> new basemap downloads, and no waiting on a cold tile host.

## The problem

Every map mode is served by a different tile host. Three things made a mode
switch feel slow:

1. **The crossfade started immediately.** `_updateActiveBasemap()` faded the
   new basemap in over 250 ms while its tiles were still downloading, so the
   user watched an empty canvas.
2. **Every switch was a cold fetch.** The basemap layer groups were
   pre-created at startup, but only the *groups* — the tiles themselves were
   always requested on demand, from whichever host served that mode.
3. **OpenTopoMap had no cache at all.** The service worker had routes for
   OSM, Esri and OpenFreeMap tiles, but not `tile.opentopomap.org`, so that
   mode re-downloaded every tile on every switch and every session.

## The fix

### 1. Hold the previous basemap (perceived speed)

`modules/basemap-ready.js` waits until the new basemap has something to show
before the crossfade runs:

- Readiness is **measured, not guessed**: the group's layers have to have
  drawn tiles. A timer cannot tell "the tiles are already cached" apart
  from "the tile is queued behind a few hundred others" — guessing wrong
  there fades to an empty map, which is the bug this work set out to fix.
- Every source in the group has to settle, because a satellite basemap is
  imagery *plus* a label overlay, and a vector basemap is a raster fallback
  *plus* vector tiles.
- A slow overlay never holds the map hostage (the base layer can carry the
  switch on its own after a short grace) and a hard timeout means a hung
  tile server cannot freeze the map.
- If the timeout fires with nothing loaded, the switch **holds the previous
  basemap** and waits for the first tile instead of fading to an empty map.

A switch token (`_basemapSwitchToken`) invalidates a switch that has been
superseded, so tapping through the modes quickly can no longer leave the map
showing whichever basemap happened to finish last.

`#mapModeLoadingIndicator` tells the user something is happening while the
old map stays on screen.

### 2. Prewarm the tiles (network speed)

`modules/basemap-prewarm.js` and `modules/basemap-switch.js` fetch the tiles
for the current viewport of the other map modes ahead of time, while the
browser is idle. Through the service worker's `CacheFirst` routes they land
in Cache Storage, so the switch becomes a cache hit.

- Zoom is clamped to each source's own tile grid — the ocean basemap stops
  at z10, and asking for z12 yields NaN tile coordinates and broken URLs.
- Tiles are ordered by distance from the centre of the viewport, so a capped
  prewarm covers what the user is actually looking at.
- The street and dark vector basemaps live outside the lazily created
  basemap cache, but they are the most common switch of all, so they are
  warmed too. Their tiles are PBF and far larger, so they get a smaller
  slice of the budget.
- Prewarming is skipped on metered and slow connections
  (`navigator.connection`), and it never runs on the map's critical path.

### 3. Clear the tile backlog (the real cause of a slow switch)

The OpenFreeMap vector basemap draws about a dozen layers from one source,
and OpenLayers queues a **separate tile per layer** — so a single viewport
leaves a few hundred entries in the tile queue for two dozen real tiles.
OpenLayers only starts a fixed number of loads at a time, so those entries
sit in front of the new basemap's tiles and the switch waits for them. The
backlog is also why the queue can appear permanently stuck: the vector tiles
are ~90 KB each and OpenFreeMap is slow, so the queue takes tens of seconds
to drain.

`modules/basemap-switch.js` therefore drops the outgoing basemap's backlog
when a switch starts, and resets the queue's in-flight count to match —
clearing the queue without that strands the count and blocks the queue
permanently. `maxTilesLoading` is raised from 16 to 48 so the queue drains
in a fraction of the time in the first place.

Measured in headless Chrome against the production build, switching to
Satellite went from **17.8 s to ~0.5 s**, and the map no longer blanks
during a switch.

### 4. Close the cache gaps (offline and repeat visits)

`vite.config.js` gained a `CacheFirst` route for `tile.opentopomap.org`,
and the Esri cache budget was raised from 300 to 500 entries.

## Layout

| File | Role |
| :--- | :--- |
| `modules/basemap-prewarm.js` | Pure planning and tile-URL math (no OpenLayers) |
| `modules/basemap-ready.js` | The readiness timing (no OpenLayers) |
| `modules/basemap-switch.js` | The OpenLayers-aware switching and prewarming |
| `index.html` | `#mapModeLoadingIndicator` |

## Wiring in `app.js`

`app.js` only needs seven small edits — the behaviour lives in the modules:

```js
import {
  initBasemapSwitching,
  prewarmBasemaps,
  scheduleBasemapPrewarm,
  switchBasemap,
} from "./modules/basemap-switch.js";
```

1. `initMap()` — `initBasemapSwitching(this);` after `this._basemapCache = {};`
2. `initMap()` — `scheduleBasemapPrewarm(this, 2500);` after the basemap
   factories are pre-created
3. `initMap()` — `scheduleBasemapPrewarm(this, 1800);` at the top of the
   `moveend` handler
4. `toggleMapLayersFlyout()` — warm every mode when the picker opens
5. `_updateActiveBasemap()` — `switchBasemap(this);`
6. `_applyMapOpacity()` — skip the basemap that is still fading in

## Tests

| File | Covers |
| :--- | :--- |
| `tests/basemapPrewarm.test.mjs` | The pure planning and URL math |
| `tests/basemapReady.test.mjs` | The readiness timing, against fake sources and fake timers |
| `tests/basemapSwitch.test.mjs` | The switching and prewarming, against fake OpenLayers objects |
| `tests/mapModePerformance.test.mjs` | The wiring in `app.js` and the service-worker routes |

## Measured results

Headless Chrome against the production build, driving the real app over the
Chrome DevTools Protocol:

| Switch | Before | After |
| :--- | :--- | :--- |
| Street → Satellite (first switch) | 17.8 s | **0.5 s** |
| Street → Terrain | 0.5 s | 0.46 s |
| Satellite → Street | 7.5 s | **0.43 s** |
| Satellite → Satellite (tiles prewarmed) | 0.9 s | **0.04 s** |

The map no longer blanks during a switch: the previous basemap is held on
screen until the new one has tiles.

## Known limits

- The tile queue and the renderer state are OpenLayers internals. Both are
  reached defensively — if the internals change, the switch still works, it
  is just slower.
- Switching back to the vector basemap can briefly dip while its tiles
  reload, because the backlog drop also drops the ones it had queued.
