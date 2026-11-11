// Runs under Vitest
import { test, describe, expect, vi, beforeEach, afterEach } from "vitest";

import {
  crossfadeBasemap,
  initBasemapSwitching,
  prewarmBasemaps,
  prewarmCandidates,
  prewarmSourceTiles,
  prewarmTile,
  scheduleBasemapPrewarm,
  setMapModeLoading,
  switchBasemap,
} from "../modules/basemap-switch.js";

/* ────────────────────────── OpenLayers fakes ────────────────────────── */

function fakeCollection(items = []) {
  return {
    items,
    getArray: () => items,
    getLength: () => items.length,
    forEach: (cb) => items.forEach(cb),
    insertAt(index, item) {
      items.splice(index, 0, item);
    },
    remove(item) {
      const i = items.indexOf(item);
      if (i !== -1) items.splice(i, 1);
    },
  };
}

function fakeSource(name = "source") {
  const listeners = new Map();
  return {
    name,
    listeners,
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    un(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    fire(type) {
      listeners.get(type)?.forEach((fn) => fn());
    },
  };
}

function fakeTileSource(name, urlFor) {
  const source = fakeSource(name);
  source.getTileUrlFunction = () => (coord) => urlFor(coord);
  source.getTileGrid = () => ({
    minZoom: 0,
    maxZoom: 18,
    getTileRangeForExtentAndZ: () => ({ minX: 100, maxX: 101, minY: 200, maxY: 201 }),
  });
  return source;
}

/** A tile source whose URLs are unique per tile coordinate. */
function fakeUniqueTileSource(name, host) {
  return fakeTileSource(name, (c) => `https://${host}/${c[0]}/${c[1]}/${c[2]}.png`);
}

function fakeLayer(source) {
  const renderer = { renderedTiles: [] };
  return {
    source,
    renderer,
    opacity: 1,
    visible: true,
    getSource: () => source,
    getRenderer: () => renderer,
    setOpacity(v) { this.opacity = v; },
    setVisible(v) { this.visible = v; },
    animate() { this.animated = true; },
    /** Pretend the layer has drawn tiles — the basemap is on screen. */
    paint() { renderer.renderedTiles.push({}); },
  };
}

function fakeGroup(layers) {
  return {
    layers: fakeCollection(layers),
    visible: true,
    getLayers() { return this.layers; },
    setVisible(v) { this.visible = v; },
  };
}

function fakeApp({ styles = {}, activeStyle = "street" } = {}) {
  const basemaps = new Map();
  for (const [style, group] of Object.entries(styles)) basemaps.set(style, group);

  const mapLayers = fakeCollection([]);
  // In the real app the active basemap is already on the map.
  if (styles[activeStyle]) mapLayers.insertAt(0, styles[activeStyle]);
  // A stand-in for OpenLayers' tile queue: the vector basemap leaves a
  // backlog of tiles in it that would otherwise stand in front of the new
  // basemap's tiles.
  const tileQueue = {
    elements: 42,
    tilesLoading_: 12,
    tilesLoadingKeys_: { a: true, b: true },
    clear() { this.elements = 0; },
  };
  const app = {
    mapStyle: activeStyle,
    mapOpacity: 1,
    lightBasemap: styles.street || null,
    darkBasemap: styles.dark || null,
    _basemapCache: Object.fromEntries(
      Object.entries(styles).filter(([s]) => s !== "street" && s !== "dark"),
    ),
    _currentBasemapGroup: styles[activeStyle] || null,
    _applyMapOpacity: vi.fn(),
    _applyTerrainOverlay: vi.fn(),
    map: {
      layers: mapLayers,
      tileQueue_: tileQueue,
      getLayers() { return mapLayers; },
      render: vi.fn(),
      getView: () => ({
        getZoom: () => 8,
        getProjection: () => "EPSG:3857",
        calculateExtent: () => [-100, -100, 100, 100],
      }),
    },
    _getBasemap: (style) => basemaps.get(style) || null,
  };
  app.__basemaps = basemaps;
  // The real app initialises this in initMap().
  initBasemapSwitching(app);
  return app;
}

/* ───────────────────────────── the tests ───────────────────────────── */

describe("initBasemapSwitching", () => {
  test("sets up the switch state", () => {
    const app = fakeApp();
    initBasemapSwitching(app);
    expect(app._basemapSwitchToken).toBe(0);
    expect(app._pendingBasemapGroup).toBeNull();
    expect(app._prewarmedTileUrls).toBeInstanceOf(Set);
  });
});

describe("switchBasemap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="mapModeLoadingIndicator" class="hidden">
        <span id="mapModeLoadingLabel"></span>
      </div>`;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("puts the new basemap on the map but keeps the old one on top", async () => {
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satellite = fakeGroup([fakeLayer(fakeSource())]);
    const app = fakeApp({ styles: { street, satellite }, activeStyle: "street" });
    app.mapStyle = "satellite";

    switchBasemap(app);

    // The new basemap is in the map but transparent, and the old one is
    // still the visible layer on top of it.
    expect(app.map.getLayers().getArray()).toContain(satellite);
    expect(satellite.layers.getArray()[0].opacity).toBe(0);
    expect(app._pendingBasemapGroup).toBe(satellite);
  });

  test("holds the old basemap until the new one has tiles", async () => {
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satelliteSource = fakeSource();
    const satellite = fakeGroup([fakeLayer(satelliteSource)]);
    const app = fakeApp({ styles: { street, satellite }, activeStyle: "street" });
    app.mapStyle = "satellite";

    switchBasemap(app);
    // A load is genuinely in flight, so the switch must wait for it.
    satelliteSource.fire("tileloadstart");
    await vi.advanceTimersByTimeAsync(1000);

    // Still holding: the crossfade has not run.
    expect(app._currentBasemapGroup).toBe(street);
    expect(app.map.getLayers().getArray()).toContain(street);

    satelliteSource.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(500);

    expect(app._currentBasemapGroup).toBe(satellite);
    expect(app.map.getLayers().getArray()).not.toContain(street);
  });

  test("crossfades as soon as the new basemap has painted", async () => {
    // The tiles are cached: no load event fires, but the layer draws them
    // straight away. The switch must not wait for the hard timeout.
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satelliteLayer = fakeLayer(fakeSource());
    const satellite = fakeGroup([satelliteLayer]);
    const app = fakeApp({ styles: { street, satellite }, activeStyle: "street" });
    app.mapStyle = "satellite";

    switchBasemap(app);
    await vi.advanceTimersByTimeAsync(60);
    expect(app._currentBasemapGroup).toBe(street);

    satelliteLayer.paint();
    await vi.advanceTimersByTimeAsync(500);
    expect(app._currentBasemapGroup).toBe(satellite);
  });

  test("shows the loading indicator while it waits and hides it afterwards", async () => {
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satelliteSource = fakeSource();
    const satellite = fakeGroup([fakeLayer(satelliteSource)]);
    const app = fakeApp({ styles: { street, satellite }, activeStyle: "street" });
    app.mapStyle = "satellite";

    switchBasemap(app);
    expect(document.getElementById("mapModeLoadingIndicator").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("mapModeLoadingLabel").textContent).toContain("Satellite");

    satelliteSource.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(500);
    expect(document.getElementById("mapModeLoadingIndicator").classList.contains("hidden")).toBe(true);
  });

  test("a superseded switch does not crossfade the basemap the user moved on from", async () => {
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satelliteSource = fakeSource();
    const satellite = fakeGroup([fakeLayer(satelliteSource)]);
    const terrainSource = fakeSource();
    const terrain = fakeGroup([fakeLayer(terrainSource)]);
    const app = fakeApp({ styles: { street, satellite, terrain }, activeStyle: "street" });

    app.mapStyle = "satellite";
    switchBasemap(app);
    app.mapStyle = "terrain";
    switchBasemap(app);

    // The first switch's tiles land, but it must not win.
    satelliteSource.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(500);
    expect(app._currentBasemapGroup).not.toBe(satellite);

    terrainSource.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(500);
    expect(app._currentBasemapGroup).toBe(terrain);
  });

  test("drops the outgoing basemap's tile backlog so the new one can start", () => {
    // The vector basemap leaves a few hundred queued tiles for two dozen
    // real ones. They would sit in front of the new basemap's tiles.
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satellite = fakeGroup([fakeLayer(fakeSource())]);
    const app = fakeApp({ styles: { street, satellite }, activeStyle: "street" });
    app.mapStyle = "satellite";

    expect(app.map.tileQueue_.elements).toBe(42);

    switchBasemap(app);

    expect(app.map.tileQueue_.elements).toBe(0);
    // The in-flight count has to be reset too — clearing the queue without
    // that strands the count and blocks the queue permanently.
    expect(app.map.tileQueue_.tilesLoading_).toBe(0);
    expect(app.map.tileQueue_.tilesLoadingKeys_).toEqual({});
  });

  test("switching to the mode that is already active is a no-op", () => {
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const app = fakeApp({ styles: { street }, activeStyle: "street" });

    switchBasemap(app);

    // Nothing is added, removed or faded.
    expect(app.map.getLayers().getArray()).toHaveLength(1);
    expect(app._pendingBasemapGroup).toBeNull();
    expect(app._currentBasemapGroup).toBe(street);
  });

  test("never fades to an empty map when the tiles are still queued", async () => {
    // The tile queue can back up behind the vector basemap's own requests.
    // Giving up the wait must not crossfade to a basemap with no tiles.
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satelliteSource = fakeSource();
    const satellite = fakeGroup([fakeLayer(satelliteSource)]);
    const app = fakeApp({ styles: { street, satellite }, activeStyle: "street" });
    app.mapStyle = "satellite";

    switchBasemap(app);

    // Nothing loads: the wait times out with no tiles.
    await vi.advanceTimersByTimeAsync(7000);
    expect(app._currentBasemapGroup).toBe(street);
    // The old basemap is still on the map — the map is not blank.
    expect(app.map.getLayers().getArray()).toContain(street);

    // The first tile finally lands, and only then does the switch happen.
    satelliteSource.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(500);
    expect(app._currentBasemapGroup).toBe(satellite);
  });

  test("a superseded switch does not fade in when its tiles finally arrive", async () => {
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satelliteSource = fakeSource();
    const satellite = fakeGroup([fakeLayer(satelliteSource)]);
    const terrainSource = fakeSource();
    const terrain = fakeGroup([fakeLayer(terrainSource)]);
    const app = fakeApp({ styles: { street, satellite, terrain }, activeStyle: "street" });

    app.mapStyle = "satellite";
    switchBasemap(app);
    app.mapStyle = "terrain";
    switchBasemap(app);

    await vi.advanceTimersByTimeAsync(7000);
    // The satellite's tiles arrive late; they must not take over.
    satelliteSource.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(500);
    expect(app._currentBasemapGroup).toBe(street);

    terrainSource.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(500);
    expect(app._currentBasemapGroup).toBe(terrain);
  });

  test("removes the other basemaps from the map", () => {
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satellite = fakeGroup([fakeLayer(fakeSource())]);
    const terrain = fakeGroup([fakeLayer(fakeSource())]);
    const app = fakeApp({ styles: { street, satellite, terrain }, activeStyle: "street" });
    app.map.getLayers().insertAt(0, terrain);
    app.map.getLayers().insertAt(0, street);

    app.mapStyle = "satellite";
    switchBasemap(app);

    expect(app.map.getLayers().getArray()).not.toContain(terrain);
    expect(app.map.getLayers().getArray()).toContain(satellite);
  });
});

describe("crossfadeBasemap", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("fades the old group out and the new one in", () => {
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satellite = fakeGroup([fakeLayer(fakeSource())]);
    const app = fakeApp({ styles: { street, satellite }, activeStyle: "street" });
    app.map.getLayers().insertAt(0, street);
    initBasemapSwitching(app);

    crossfadeBasemap(app, satellite, app._basemapSwitchToken);

    expect(street.layers.getArray()[0].animated).toBe(true);
    expect(satellite.layers.getArray()[0].animated).toBe(true);
  });

  test("does nothing when the switch has been superseded", async () => {
    const street = fakeGroup([fakeLayer(fakeSource())]);
    const satellite = fakeGroup([fakeLayer(fakeSource())]);
    const app = fakeApp({ styles: { street, satellite }, activeStyle: "street" });
    app.map.getLayers().insertAt(0, street);
    initBasemapSwitching(app);

    crossfadeBasemap(app, satellite, app._basemapSwitchToken);
    app._basemapSwitchToken++; // a newer switch happened

    await vi.advanceTimersByTimeAsync(1000);
    expect(app._currentBasemapGroup).toBe(street);
  });
});

describe("prewarmCandidates", () => {
  test("includes the street and dark vector basemaps", () => {
    const street = fakeGroup([]);
    const dark = fakeGroup([]);
    const satellite = fakeGroup([]);
    const app = fakeApp({ styles: { street, dark, satellite }, activeStyle: "street" });

    const candidates = prewarmCandidates(app);
    expect(candidates.get("street")).toBe(street);
    expect(candidates.get("dark")).toBe(dark);
    expect(candidates.get("satellite")).toBe(satellite);
  });
});

describe("prewarmSourceTiles", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("warms the tiles of the current viewport", () => {
    const app = fakeApp();
    initBasemapSwitching(app);
    const source = fakeTileSource("t", (c) => `https://tiles.example/${c[0]}/${c[1]}/${c[2]}.png`);

    const count = prewarmSourceTiles(app, source, {
      extent: [-100, -100, 100, 100],
      zoom: 8,
      projection: "EPSG:3857",
      limit: 4,
    });

    expect(count).toBe(4);
    expect(app._prewarmedTileUrls.size).toBe(4);
  });

  test("warms nothing when the budget is zero", () => {
    const app = fakeApp();
    initBasemapSwitching(app);
    const source = fakeTileSource("t", () => "https://tiles.example/x.png");

    const count = prewarmSourceTiles(app, source, {
      extent: [-100, -100, 100, 100],
      zoom: 8,
      projection: "EPSG:3857",
      limit: 0,
    });

    expect(count).toBe(0);
  });

  test("a source without a tile url function is skipped", () => {
    const app = fakeApp();
    initBasemapSwitching(app);
    const count = prewarmSourceTiles(app, fakeSource("no-url"), {
      extent: [-100, -100, 100, 100],
      zoom: 8,
      projection: "EPSG:3857",
      limit: 4,
    });
    expect(count).toBe(0);
  });
});

describe("prewarmBasemaps", () => {
  let fetchSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    globalThis.navigator = { connection: { effectiveType: "4g", saveData: false } };
  });

  afterEach(() => {
    vi.useRealTimers();
    fetchSpy.mockRestore();
  });

  test("warms the other map modes for the current viewport", async () => {
    const street = fakeGroup([fakeLayer(fakeUniqueTileSource("street", "osm"))]);
    const satellite = fakeGroup([fakeLayer(fakeUniqueTileSource("sat", "arc"))]);
    const app = fakeApp({ styles: { street, satellite }, activeStyle: "street" });
    initBasemapSwitching(app);

    prewarmBasemaps(app);

    const urls = fetchSpy.mock.calls.map((c) => c[0]);
    expect(urls.some((u) => u.startsWith("https://arc/"))).toBe(true);
    // The active mode is already on screen — no need to warm it.
    expect(urls.some((u) => u.startsWith("https://osm/"))).toBe(false);
  });

  test("does not warm anything on a metered connection", () => {
    globalThis.navigator = { connection: { effectiveType: "4g", saveData: true } };
    const satellite = fakeGroup([fakeLayer(fakeUniqueTileSource("sat", "arc"))]);
    const app = fakeApp({ styles: { street: fakeGroup([]), satellite }, activeStyle: "street" });
    initBasemapSwitching(app);

    prewarmBasemaps(app);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("respects the style budget", () => {
    const satellite = fakeGroup([fakeLayer(fakeUniqueTileSource("sat", "arc"))]);
    const terrain = fakeGroup([fakeLayer(fakeUniqueTileSource("ter", "ter"))]);
    const app = fakeApp({ styles: { street: fakeGroup([]), satellite, terrain }, activeStyle: "street" });
    initBasemapSwitching(app);

    prewarmBasemaps(app, { maxStyles: 1, maxTilesPerLayer: 2, budget: 2 });

    const urls = fetchSpy.mock.calls.map((c) => c[0]);
    expect(urls).toHaveLength(2);
  });
});

describe("prewarmTile", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("never fetches the same tile twice", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    const app = fakeApp();
    initBasemapSwitching(app);

    prewarmTile(app, "https://tiles.example/a.png");
    prewarmTile(app, "https://tiles.example/a.png");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  test("fetches at low priority so it never competes with the map", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    const app = fakeApp();
    initBasemapSwitching(app);

    prewarmTile(app, "https://tiles.example/b.png");

    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ priority: "low" });
    fetchSpy.mockRestore();
  });
});

describe("scheduleBasemapPrewarm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("debounces so repeated calls only warm once", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true });
    globalThis.navigator = { connection: { effectiveType: "4g", saveData: false } };
    const satellite = fakeGroup([fakeLayer(fakeTileSource("sat", (c) => `https://arc/${c[0]}.png`))]);
    const app = fakeApp({ styles: { street: fakeGroup([]), satellite }, activeStyle: "street" });
    initBasemapSwitching(app);

    scheduleBasemapPrewarm(app, 100);
    scheduleBasemapPrewarm(app, 100);
    scheduleBasemapPrewarm(app, 100);
    await vi.advanceTimersByTimeAsync(500);

    // One cycle, not three.
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(0);
    expect(fetchSpy.mock.calls.length).toBeLessThanOrEqual(4);
    fetchSpy.mockRestore();
  });
});

describe("setMapModeLoading", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="mapModeLoadingIndicator" class="hidden">
        <span id="mapModeLoadingLabel"></span>
      </div>`;
  });

  test("shows and hides the indicator", () => {
    const app = fakeApp({ activeStyle: "satellite" });

    setMapModeLoading(app, true);
    expect(document.getElementById("mapModeLoadingIndicator").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("mapModeLoadingLabel").textContent).toBe("Loading Satellite…");

    setMapModeLoading(app, false);
    expect(document.getElementById("mapModeLoadingIndicator").classList.contains("hidden")).toBe(true);
  });

  test("does nothing when the indicator is not on the page", () => {
    document.body.innerHTML = "";
    expect(() => setMapModeLoading(fakeApp(), true)).not.toThrow();
  });
});
