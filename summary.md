# Aurafisky — Project Summary

**What it is:** a single-page PWA weather explorer. A full-screen Leaflet map over CartoDB
tiles, with Open-Meteo weather, RainViewer radar, a time-travel timeline (3 days back →
7 days ahead), bookmarks, and optional Firebase auth + Firestore settings sync.

- **Version:** 2.0.0 · **Stack:** vanilla ES modules + Vite 5 + Tailwind 4 + Leaflet 1.9
- **Hosting:** Firebase Hosting (`public: dist`) · project `aurafisky`
- **Tests:** Vitest — 87 passing (`tests/weather.test.ts`, `tests/modules.test.ts`)
- **Build:** `npm run build` succeeds (~410 kB JS gzip 114 kB, 58 precache entries)

---

## Layout

| Path | Role |
| --- | --- |
| `index.html` (1.2k lines) | Entire markup: map shell, weather panel, share modal, settings, timeline |
| `app.js` (7.3k lines) | `AurafiskyApp` class — one god-object with ~133 methods and ~40 feature sections |
| `weather.js` (2.1k lines) | `WeatherService` IIFE — Open-Meteo fetch, WMO code mapping, formatting, derived metrics |
| `modules/` | `dom-utils.js`, `toast.js` — small helpers, exposed on `window` *and* re-exported as ESM |
| `workers/compute.worker.js` | Off-thread number crunching |
| `sw.js` | Hand-written service worker — **not shipped**, see finding 5 |
| `firebase.json` / `firestore.rules` | Hosting headers + CSP, Firestore security rules |

## Feature surface

Map click / city search / geolocation → weather panel with current conditions, hourly strip,
7-day forecast, AQI, UV chart, pressure tendency, dew point, sun/moon astronomy, comfort index,
"next rain", predictive arrival, climate time-machine (historical archive), animated canvas
weather effects, Web Audio soundscapes, compare-cities, data export, drag-to-reorder metric cards,
keyboard shortcuts, bookmark pins with severe-weather alerts, dark mode, unit toggle,
share modal (native / WhatsApp / Telegram / X / clipboard), and shareable `?lat&lng&name` URLs.

## Working-tree state

The branch is clean at `c5f807f`, but the working tree carries a large uncommitted change set:
~960 insertions / ~3200 deletions. Most of the deletion volume is welcome cleanup — the
one-off `fix*.cjs` / `check*.py` scratch scripts and the abandoned `app.ts` / `weather.ts` /
`features/*.ts` TypeScript fork are gone. The additions are the share modal, desktop panel
dragging, shareable URLs, a startup-location priority chain, GPS pre-warming, map-drag click
suppression, and offline banner states.

---

## Issues found and fixed

Eight findings were reported; seven are fixed, one is left pending a decision.

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

### Remaining opportunities (not applied)

These are judgement calls or larger refactors, listed for you to weigh:

1. **`app.js` is 7.3k lines in one class.** `bindEvents()` alone is 650 lines and the
   constructor 462. The `// ── SECTION ──` comments already mark ~40 natural seams; splitting
   even the self-contained ones (soundscapes, radar, climate time-machine, canvas effects)
   into modules would make the file navigable and let them be tested.
2. **No tests cover `app.js` at all.** All 93 tests target `weather.js`, `src/utils.js`, and
   `modules/`. The pure helpers (`_isDragGesture`, `_persistWeatherCache`, `_updateUrlParams`,
   `getNearestCachedLocation`) are easy to test now that they're extracted, and each one is
   where a bug in this review actually lived.
3. **CSP still allows `script-src 'unsafe-inline'`.** With Vite emitting hashed bundles, most
   inline script could move into modules and the directive tightened — the single largest
   remaining XSS mitigation gap.
4. **`firebase.json` `ignore` no longer excludes source-ish files.** It dropped
   `**/*.log`, `src`, and `**/devserver*`. Harmless while `public: dist`, but it removes the
   safety net if the public dir ever changes.
5. **`getNearestCachedLocation` scans every localStorage key** and JSON-parses candidates on
   each call. Fine at 12 entries; worth an index if the cap ever rises.
6. **The Firebase API key is committed** in `app.js` as a fallback. That is normal for Firebase
   web apps (it is an identifier, not a secret) — but it means your new Firestore rules are the
   *only* thing protecting user data, so they're worth a second look before deploy.
