# Aurafisky — Project Summary

**What it is:** a single-page PWA weather explorer. A full-screen OpenLayers map over
OpenFreeMap vector tiles, with Open-Meteo weather, RainViewer radar, a time-travel timeline
(3 days back → 7 days ahead), bookmarks, and optional Firebase auth + Firestore settings sync.

- **Version:** 11.0.0 · **Stack:** vanilla ES modules + Vite 5 + Tailwind 4 + OpenLayers 10
  (`ol` + `ol-mapbox-style` 12)
- **Hosting:** Firebase Hosting (`public: dist`) · project `aurafisky`
- **Tests:** Vitest — 93 passing (`tests/weather.test.ts`, `tests/modules.test.ts`, `tests/unit.test.mjs`)
- **Build:** `npm run build` succeeds — `vendor-map` 511 kB, `app-core` 207 kB,
  `features` 74 kB, 58 precache entries

---

## Layout

| Path | Role |
| --- | --- |
| `index.html` (1.2k lines) | Entire markup: map shell, weather panel, share modal, settings, timeline |
| `app.js` (4.9k lines) | `AurafiskyApp` class — core shell, map init, location flow, panel, auth |
| `weather.js` (2.1k lines) | `WeatherService` IIFE — Open-Meteo fetch, WMO code mapping, formatting, derived metrics |
| `features/` (20 files) | Feature modules attached onto the app instance by `features/registry.js` — radar, routes, bookmarks, astronomy, audio, canvas effects, time machine, compare-cities, dashboard, insights, ensemble, advisories, … |
| `modules/` | `dom-utils.js`, `toast.js`, `viewport-height.js`, plus the two map modules below |
| `modules/ol-marker.js` | `HtmlMarker` — arbitrary HTML pinned to a coordinate via `ol.Overlay`; replaces Leaflet's `divIcon` marker pattern |
| `modules/map-language.js` | `localizeGlStyle(style, lang)` — rewrites every symbol layer's `text-field` for English vs native labels |
| `workers/compute.worker.js` | Off-thread number crunching |
| `firebase.json` / `firestore.rules` | Hosting headers + CSP, Firestore security rules |

Dead weight still on disk, not wired into the build: `sw.js`, `tsconfig.app.json`,
`app.js.tmp` (0 bytes), and most of the `src/` tree — though `src/utils.js` and
`src/icons.js` *are* live (tests import the former, `app.js` the latter), so `src/` can't be
deleted wholesale.

## Feature surface

Map click / city search / geolocation → weather panel with current conditions, hourly strip,
7-day forecast, AQI, UV chart, pressure tendency, dew point, sun/moon astronomy, comfort index,
"next rain", predictive arrival, climate time-machine (historical archive), animated canvas
weather effects, Web Audio soundscapes, compare-cities, data export, drag-to-reorder metric cards,
keyboard shortcuts, bookmark pins with severe-weather alerts, dark mode, unit toggle,
share modal (native / WhatsApp / Telegram / X / clipboard), and shareable `?lat&lng&name` URLs.

The map itself supports real English ↔ native label switching (a genuine client-side restyle
of the vector tiles, not a tile-server parameter), light/dark basemaps, route drawing, radar
playback, and bookmark pins.

## Working-tree state

HEAD is `be526a6`, with a large uncommitted change set on top: 17 files changed,
~5,500 insertions / ~7,300 deletions. The deletion volume is mostly welcome cleanup — the
one-off `fix*.cjs` / `check*.py` scratch scripts, the abandoned `app.ts` / `weather.ts` /
`features/*.ts` TypeScript fork, and the `app.js` bulk that moved out into `features/`.
The additions are the `features/` split, the OpenLayers migration, the share modal, desktop
panel dragging, shareable URLs, a startup-location priority chain, GPS pre-warming, map-drag
click suppression, and offline banner states.

**None of this is committed.** Worth a commit before the next round of work — the map engine
swap alone is a change you'd want to be able to bisect back to.

---

## Issues found and fixed — first review round

Eight findings were reported; seven are fixed, one is left pending a decision.
(The map-engine work and its own bug list come further down, under
[Map engine](#map-engine-leaflet--maplibre-gl--openlayers).)

| # | Issue | Fix |
| --- | --- | --- |
| 1 | `weather.js:14` pointed `FORECAST_URL` at `/proxyForecast` — nothing serves it, so the catch-all rewrite returned `index.html` with a 200, `response.ok` passed, and `.json()` threw. Every forecast failed; the SW then cached that HTML under the key. | Restored `https://api.open-meteo.com/v1/forecast` |
| 2 | `firestore.rules` was the unedited starter template: world read/write until `2026-08-23` (five days out), then total denial. | Rewrote with per-user ownership on `/users/{uid}`, default-deny elsewhere, no expiry |
| 3 | CSP `connect-src` omitted `api.rainviewer.com`, so the radar frame index was blocked and radar rendered nothing. | Added the host |
| 4 | Reverse geocoding was routed through `corsproxy.io` — CSP-blocked, and a coordinate leak to a third party if it hadn't been. | Reverted to the direct Nominatim call; dropped the forbidden `User-Agent` header |
| 5 | The hand-written `sw.js` is never deployed — Workbox generates `dist/sw.js`. All 29 lines of SW changes here were dead. | Consolidated to one registration path; `sw.js` marked deprecated — see below |
| 6 | Shared "7-Day Forecast" used `slice(0, 7)` on a list that leads with 3 past days. | Slice seven days forward from today's entry |
| 7 | `shareWeather` used the raw slider value as a data index, ignoring the 24h-mode offset (~60 hours). | Apply `sliderValue + _getTimelineOffset()` as elsewhere |
| 8 | GPS pre-warm fired the permission prompt on *hover*, and the cached fix made a click run the whole pipeline twice. | Pre-warm only when permission is already `granted`; skip the redundant second fetch |

### Service worker consolidation (finding 5)

There were **three** registration paths for one worker: an inline `<script>` in `index.html`,
`vite-plugin-pwa`'s injected `registerSW.js`, and `AurafiskyApp.registerServiceWorker()` —
which was the most capable of the three (`updateViaCache: 'none'`, `skipWaiting` messaging,
forced `update()` checks on focus and visibility) and was **never called**.

Now: `registerServiceWorker()` is invoked from `init()`, the inline script is gone, and
`injectRegister: null` stops the plugin injecting a fourth. A reload-loop guard was added to
the `controllerchange` handler — the bare `reloading` flag it had is reset by the very reload
it triggers, so a re-claiming worker could spin the page forever. The guard uses a 10-second
timestamp rather than the old permanent `sessionStorage` flag, which suppressed *every* later
update for the session.

`sw.js` itself carries a deprecation banner now (deleting it was blocked by a sandbox
permission — it's safe to `rm` whenever you like; `vite.config.js` `workbox.runtimeCaching`
already covers every route it implements).

### Cleanups applied

- Extracted `_isDragGesture(e)` — the 12-line pan-vs-tap guard was copy-pasted across the map
  click handler and the weather, home, and bookmark marker handlers.
- Share-type buttons now toggle a single `is-selected` class, with styling in `styles.css`,
  instead of reassigning a hard-coded Tailwind `className` string in two places.
- `_persistWeatherCache()` bounds the `weathermap_cache_*` store at 12 locations with
  oldest-first eviction, and purges + retries once on `QuotaExceededError`. Each entry is
  200–400 KB, so the old unbounded write would eventually wedge offline fallback permanently.
- `createWeatherMarker()` reuses the existing marker via `setIcon()` when the position is
  unchanged, instead of destroying and rebuilding it on every slider tick (which also dropped
  the tooltip and click binding each frame).
- The bookmark pin cache is only written while the timeline is on the current hour. It was
  stamping time-travelled forecasts with `ts: Date.now()`, and `renderBookmarkPins` treats
  anything under 5 minutes old as current — so a bookmark pin could show a future forecast as
  present conditions.
- Removed dead code: `readShareableUrl()` (superseded by `_checkUrlParamsOnStartup`),
  `_addCacheKey()` (a no-op stub), and `updateShareableUrl()` — which used a falsy
  `!this.selectedLat` guard, so it silently refused to write a URL for anywhere on the
  equator or the prime meridian. Its caller now uses `_updateUrlParams()`.
- `firebase.json` regained the `no-cache` header on `/sw.js`.

### Enhancements applied

- **Accessibility:** 13 of 75 interactive controls had no accessible name — four icon-only
  close buttons and every settings toggle (each wrapped in a `<label>` that enclosed only the
  switch, not its text). A screen reader announced them as bare "checkbox". All 13 now carry
  `aria-label`; the audit reports 0 remaining.
- **Test coverage:** `tests/unit.test.mjs` matched no glob (`include` was `tests/**/*.test.ts`)
  and used the `node:test` runner, so its 6 unit-conversion assertions had never run in CI.
  Switched to the Vitest runner and broadened the glob. Suite is now **93 tests, up from 87**.

### Verified

Live in the browser against the real Open-Meteo API, not just by inspection:

| Check | Result |
| --- | --- |
| `fetchForecast` reaches the API | 240 hours / 10 days in 847 ms |
| Weekly share starts today | first row `Today`, span `2026-08-18 → 08-24` |
| Share timestamp matches panel | both `Tue, Aug 18 · 1:00 PM` |
| Marker reused across hour changes | same instance ×3, tooltip + click intact |
| Cache eviction | 20 writes → 12 newest survive |
| Pin cache poisoning | time-travelled hour writes 0 entries; current hour writes 29.9 °C (not the +48 h 29.4 °C) |
| Console errors | none |
| Tests / build | 93 passing, build clean |

### Follow-up round (reported from live use)

| Report | Cause | Fix |
| --- | --- | --- |
| Briefing text stayed on screen after switching location | `selectLocation` reset the time label, AQI and skeleton but never `briefingContent` | Clear and re-hide it alongside the other panel resets |
| Radar overlay not working | **A second CSP** — a `<meta http-equiv>` in `index.html:21` — also omitted `api.rainviewer.com`. It is what's enforced in dev, and it intersects with the hosting header in prod, so fixing `firebase.json` alone was not enough | Added `api.rainviewer.com`, dropped the leftover `corsproxy.io` grant, brought both policies to parity |
| Faint grid over the whole map | Not a layer — basemap tiles sit on exact 256px boundaries but each composites as its own GPU layer, leaving a hairline gap where `.leaflet-container`'s `#0f172a` background showed through | Grow tiles to 256.5px so neighbours overlap by half a pixel; `!important` needed because Leaflet writes `width` inline |
| Home pin could be dragged away | `updateHomeMarker` created it with `draggable: true` and a `dragend` handler that rewrote `defaultLocation` and pushed it to the cloud | `draggable: false`, `dragend` handler removed — home moves only via the explicit set/remove control |

Verified live: briefing empties and hides on location switch; home marker reports
`dragging.enabled() === false` with no `dragend` listeners; radar loads 6 frames and paints
RainViewer tiles; tiles render at 256.5px while staying integer-aligned. 93 tests pass, build clean.

---

## Map engine: Leaflet → MapLibre GL → OpenLayers

The map was rewritten twice. The trigger was the language toggle: it appeared to do nothing,
because raster basemaps have their labels **baked into the tile image** — there is no text to
re-language client-side. OpenFreeMap's `?lang=` raster endpoint 404s on every tile and OSM's
raster server silently ignores the parameter, so the old toggle could never have worked.

Real language switching needs vector tiles, where each feature carries both `name` and
`name_en` and the style's `text-field` decides which to draw. That ruled the raster setup out.

1. **MapLibre GL** (via `@maplibre/maplibre-gl-leaflet`) came first and worked correctly, but
   rendered unusably slowly on this machine — MapLibre is WebGL-only, so without hardware
   acceleration it falls back to software rasterisation and there is no configuration that
   avoids that.
2. **OpenLayers** replaced it because its vector-tile renderer draws on **Canvas 2D**, with no
   WebGL dependency, while still consuming the same Mapbox/MapLibre style JSON that
   OpenFreeMap publishes (via `ol-mapbox-style`). Same feature set, no GPU requirement.

Leaflet was reconsidered and rejected: it has no native vector-tile support, so it would need
a plugin that reintroduces exactly the WebGL dependency being escaped.

What the migration touched: `app.js` (map/view init, markers, popups, click handling,
coordinate conversion), `features/radar.js`, `features/routes.js`, `features/bookmarks.js`,
`features/canvasEffects.js`, `features/appToggles.js`, plus `styles.css`, `vite.config.js`
(chunking + PWA runtime caching for vector tiles and jsdelivr fonts) and both CSP copies.
Ported carefully: Leaflet passes raw lat/lng, OpenLayers works in projected metres
(`fromLonLat` / `toLonLat`); Leaflet's `zoomstart`/`zoomend` collapse into OL's
`movestart`/`moveend`; `hasLayer()` becomes a `getLayers().getArray().includes()` check; layer
opacity has to be baked into `rgba()` strings.

## Map bug fixes (found by testing the running app, not by inspection)

| Symptom | Cause | Fix |
| --- | --- | --- |
| Map blank on any shared/restored link | A startup location calls `selectLocation()` → `view.animate()` before the basemap fetch resolves, while the map still has zero layers. OL never repainted once layers arrived — every layer reported `ready`, the canvas stayed transparent | `map.render()` after the basemap style is applied |
| Map rendered across only part of the container | OL caches the container size it measured and renders for that size only. The window-`resize` and visualViewport listeners miss changes where the element resizes but the window doesn't — `--app-height` being written, late CSS, font reflow — which the three staggered `setTimeout`s were guessing at | `ResizeObserver` on the map element (timeouts kept as fallback) |
| Cream "empty tiles" filling half the screen near the poles | Not missing tiles — the edge of the world. Web Mercator ends at ±85°; `constrainOnlyCenter: true` clamped the *centre* there but let the *viewport* keep going into blank space | Constrain the whole viewport to the extent, so the pan stops at the edge |
| Whole tab froze at latitude −85.0272° | That is just past the view's own ±85° extent, and the unclamped value went straight into `fromLonLat()` / `view.animate()`; the view never settled. A trivial `1+1` in the console timed out after 45 s | Clamp the view-centring latitude to ±85°; the exact lat/lng still drives weather, marker and name |
| `<circle cx="NaN">`, `<path d="…A 45,45 0 0,1 NaN NaN">` | Polar day/night: inside the polar circles the API reports sunrise and sunset as the *same instant*, so day length is 0 and the sun-arc fraction is `0/0`. The existing guard only checked for *missing* values, not equal ones | Day-length guard (also catches unparseable and inverted timestamps) plus a real "Polar day"/"Polar night" display, keyed off the API's own `is_day` flag |

## Map performance work

- **Removed a CSS `filter` from the live map canvas.** `#map canvas` carried
  `saturate/contrast/brightness`. That was written for Leaflet's static raster `<img>` tiles,
  where the browser filters each tile once and reuses the result. On OpenLayers it sat on a
  single canvas that repaints every animation frame, so a per-pixel shader pass was being
  recomputed on every frame of every pan and zoom.
- **Tile preload** (`setPreload(1)` on both basemaps) so panning into new territory shows
  lower-resolution tiles immediately. Vector tiles decode on the main thread here — OL has no
  parsing worker, unlike MapLibre — so any fetch delay is visible without this.
- **Theme flash fixed.** The theme preference lived only in the cloud, arriving after the map
  had already started rendering light; when the saved value was dark, `toggleDarkMode()` swapped
  the entire basemap mid-load. It is now mirrored to `localStorage` and read synchronously
  before the map is built, so a returning visitor starts on the right theme.
- **Only the visible theme loads eagerly.** Both basemaps used to be fetched and parsed
  concurrently at startup, doubling network and main-thread work during the exact window the
  visible map is trying to paint. The other theme loads immediately afterwards, so toggling
  stays instant.
- **Rotation gestures disabled** (`altShiftDragRotate`, `pinchRotate`). Nothing in the UI
  un-rotates the map, so a stray two-finger twist left it stuck sideways until a reload.
- **`transition: 0` on radar tiles** — the radar player already crossfades frames via layer
  opacity, so OL's own 250 ms per-tile fade was stacking a second fade underneath it.

Verified live in the browser at each step: London and Reykjavik render fully on first load
from a URL-driven start; the dark swap is instant with no flash; at the pole edge the viewport
now stops exactly at 85.0000° (matching the world boundary to the metre) showing ocean rather
than a void. The polar NaN fix ships with an executable proof that reproduces the original
`0/0` from the reported coordinates and confirms normal days still draw correctly.

### Not applied (deliberate calls)

- `renderMode: 'vector'` would remove the brief blur during zoom animations, but `hybrid` is
  the right default for a basemap this layer-heavy — the blur is a transition artefact, not a bug.
- `pixelRatio: 1` is a real win on high-DPI screens (quarter the pixels painted) but trades
  visible sharpness, so it should be a deliberate choice rather than a silent default.
- `preload: Infinity` was rejected in favour of `1` — it would fetch every zoom level down to 0
  for every viewport.
- `WebGLTileLayer` is raster-only and would reintroduce the GPU dependency this migration exists
  to avoid. A polar stereographic projection (EPSG:3031) is disproportionate for an edge case
  the app doesn't need to support natively.

### Remaining opportunities (not applied)

These are judgement calls or larger refactors, listed for you to weigh:

1. ~~**`app.js` is 7.3k lines in one class.**~~ **Done.** Split into `features/` — 20 modules
   attached onto the app instance by `features/registry.js`. `app.js` is down to 4.9k lines and
   holds the shell, map init, location flow, panel and auth.
2. **No tests cover `app.js` or `features/` at all.** All 93 tests target `weather.js`,
   `src/utils.js`, and `modules/`. The pure helpers (`_isDragGesture`, `_persistWeatherCache`,
   `_updateUrlParams`, `getNearestCachedLocation`, `localizeGlStyle`) are easy to test now that
   they're extracted, and each one is where a bug in this review actually lived. Every map bug
   in the table above was found by driving the running app, not by the suite — worth closing
   that gap, starting with the polar/extent maths that now has a standalone proof script.
3. ~~**CSP still allows `script-src 'unsafe-inline'`.**~~ **Done.** Both copies (the
   `index.html` `<meta>` and the `firebase.json` header) now omit it. Keep them in sync —
   browsers enforce the *intersection*, so a host added to one and not the other is still
   blocked. That has bitten this project twice: RainViewer, then jsdelivr for the map fonts.
4. **`firebase.json` `ignore` no longer excludes source-ish files.** It dropped
   `**/*.log`, `src`, and `**/devserver*`. Harmless while `public: dist`, but it removes the
   safety net if the public dir ever changes.
5. **`getNearestCachedLocation` scans every localStorage key** and JSON-parses candidates on
   each call. Fine at 12 entries; worth an index if the cap ever rises.
6. **The Firebase API key is committed** in `app.js` as a fallback. That is normal for Firebase
   web apps (it is an identifier, not a secret) — but it means your new Firestore rules are the
   *only* thing protecting user data, so they're worth a second look before deploy.
