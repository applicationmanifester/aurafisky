# Faster map loading

> **Goal:** the map should appear as soon as possible — on a first visit, on a
> slow phone, and on a metered connection.

Three things sat between a visitor and their map. All three are now fixed.

## 1. The app reloaded itself on every first visit

The service worker registered and claimed the page. The app treated any
`controllerchange` as "a new version took over, reload to get it" — but the
**first** claim is not an update: the page is already running the current
build, so there is nothing to reload for.

Every new visitor therefore loaded the app, had the worker claim the page a
second later, and then watched the whole thing load again. The second load
started with an empty tile queue, so the map was slower still.

The worker now only reloads the page when a **new** worker takes over from
an existing one.

> Measured against the production build on a secure origin: the document
> loaded **twice** before, and loads **once** now.

## 2. The translation dictionaries were in front of the map

`modules/i18n-data.js` and `modules/i18n-extended.js` held the dictionaries
for all 41 languages in one object. `modules/i18n.js` imported them
statically, so **every visitor downloaded ~818 KB of dictionaries** — for the
one language they actually read — before `app.js` could run and start the
map's tile requests.

The dictionaries are now **one chunk per language** (10–34 KB each):

- `scripts/split-i18n-locales.mjs` generates `modules/i18n-locales/<lang>.js`
  from the two source files.
- `modules/i18n-locales/index.js` maps each language to its chunk.
- `modules/i18n.js` imports **English only** statically — it is the fallback
  for every string in the interface — and fetches the rest on demand
  through `loadLocale(locale)`.
- The app calls `initMap()` **before** loading the language, so the map's
  tile requests start immediately, and the interface is localised as soon as
  the language chunk lands.

> Measured against the production build:
>
> | | Before | After |
> | :--- | --- | --- |
> | Initial JavaScript | 2,271 KB | **1,472 KB** |
> | Translation data downloaded | 818 KB (all 41 languages) | **~30 KB** (one language) |
> | Locale chunks fetched, English visitor | 41 | **0** |
> | Locale chunks fetched, `?lang=kn` | 41 | **1** |
>
> Verified in a browser: `?lang=kn` renders "ನಗರ ಅಥವಾ ಸ್ಥಳ ಹುಡುಕಿ…" and
> `?lang=hi` renders "शहर खोजें…", each fetching exactly one chunk.

The two source data files stay in the repository as the generator's input,
and `tests/i18nLocales.test.mjs` fails if the generated chunks and the
source drift apart — so a translation fix cannot quietly stop reaching the
app.

## 3. The tile queue was clogged by the vector basemap

The OpenFreeMap vector basemap draws about a dozen layers from one source,
and OpenLayers queues a **separate tile per layer**. One viewport therefore
left a few hundred entries in the tile queue for two dozen real tiles, and
because only a fixed number of loads run at a time, the queue took tens of
seconds to drain — blocking every other basemap's tiles behind it.

`modules/basemap-switch.js` now drops the outgoing basemap's backlog when a
switch starts, and resets the queue's in-flight count to match (clearing the
queue without that strands the count and blocks the queue permanently).

> Switching to Satellite went from **17.8 s to ~0.5 s**.

## The tile concurrency limit

`maxTilesLoading` controls how many tiles load at once. It was raised to 48
while chasing the queue problem, and that turned out to be too many: **48
concurrent requests to the tile server stall the connection** — measured, 12
concurrent complete in 2.8 s while 48 never finish. With the reload fixed
and the backlog dropped, the queue drains without needing the extra
concurrency, and the limit is back to a value the connection sustains.

## Can the complete map appear at once?

That is what the staged raster → vector upgrade does, and the answer is
**yes for a returning visitor, and as close to yes as the network allows for
a first-time one**.

The full-detail map is the OpenFreeMap vector basemap: a style document, a
tile index, and ~12 vector tiles of ~88 KB each. Getting it on screen used
to be a chain of three serial round trips:

1. the style JSON,
2. the tile index (TileJSON) — named by the style, fetched by OpenLayers
   only *after* the style has arrived,
3. the tiles themselves.

Step 2 is now **preloaded** in `index.html`, alongside the style JSON that
was already preloaded. Measured against the production build, the tile
index is requested **5 ms** into the page load — in parallel with the app's
own boot — instead of after the style has been fetched and parsed.

What remains is step 3, and that is the network talking, not the app. A
first visit cannot beat the network: the tiles have to come down. But:

- The raster fallback paints in well under a second, so the map is never
  blank — the full-detail map *replaces* it rather than following it.
- The staged promotion waits for the viewport's vector tiles and then swaps
  them in, so the map arrives complete rather than in pieces.
- The tile queue is only ~24 entries deep, so the tiles are requested
  promptly instead of queueing behind duplicates.

### One thing that was measured and then withdrawn

The vector style has **111 layers**, and OpenLayers gives each layer its own
renderer — so it looked as though one viewport would queue a copy of every
tile for every layer. Making the layers share their tiles was implemented
(`shareVectorTiles`) and measured with an A/B: **the peak tile queue was 24
either way**. The staged basemap setup already avoids the duplication, so
the patch was reverted rather than left in as a no-op that patches a
library's internals.

## What is left

The map's first paint is bounded by the tile round-trip. The remaining
levers are mostly server side:

- **OpenFreeMap's vector tiles are ~88 KB each** and the style JSON took
  4 s over a cold connection. A lighter style, or a faster tile host, would
  help every visitor.
- The vector basemap draws many layers from one source; if OpenLayers
  queued one tile per source coordinate rather than one per layer, the
  queue would be a fraction of its depth.

## Tests

`tests/i18nLocales.test.mjs` (9 tests) covers the per-language split: that
the dictionaries are off the critical path, that every language has a chunk,
that the chunks match the source, and that `loadLocale` actually resolves a
language.
