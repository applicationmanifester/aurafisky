// Runs under Vitest
import { test, describe, expect, vi, beforeEach, afterEach } from "vitest";

import { awaitBasemapReady, waitForFirstTile } from "../modules/basemap-ready.js";

/**
 * A fake OpenLayers tile source: records listeners and lets a test fire the
 * load events the real source dispatches.
 */
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
    listenerCount(type) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function fakeLayer(source) {
  const renderer = { renderedTiles: [] };
  return {
    source,
    renderer,
    getSource: () => source,
    getRenderer: () => renderer,
    /** Pretend the layer has drawn tiles — the basemap is on screen. */
    paint() { renderer.renderedTiles.push({}); },
  };
}

function fakeGroup(layers) {
  return {
    getLayers: () => ({
      forEach: (cb) => layers.forEach(cb),
    }),
  };
}

describe("awaitBasemapReady", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("resolves immediately for a group with no tile sources", async () => {
    const ready = awaitBasemapReady(fakeGroup([{ getSource: () => null }]));
    await expect(ready).resolves.toEqual({ loaded: true });
  });

  test("resolves immediately for a group with no layers at all", async () => {
    const ready = awaitBasemapReady(fakeGroup([]));
    await expect(ready).resolves.toEqual({ loaded: true });
  });

  test("waits for the first tile to land instead of fading into an empty map", async () => {
    const source = fakeSource();
    const ready = awaitBasemapReady(fakeGroup([fakeLayer(source)]));
    let result = null;
    ready.then((r) => { result = r; });

    source.fire("tileloadstart");
    await vi.advanceTimersByTimeAsync(1000);
    expect(result).toBe(null);

    source.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual({ loaded: true });
  });

  test("resolves as soon as the basemap has painted", async () => {
    // The tiles are already cached, so no load event ever fires — but the
    // layer draws them straight away. That is what "ready" means.
    const source = fakeSource();
    const layer = fakeLayer(source);
    const ready = awaitBasemapReady(fakeGroup([layer]));
    let result = null;
    ready.then((r) => { result = r; });

    await vi.advanceTimersByTimeAsync(60);
    expect(result).toBe(null);

    layer.paint();
    await vi.advanceTimersByTimeAsync(60);
    expect(result).toEqual({ loaded: true });
  });

  test("does not treat a queued basemap as ready just because no load started", async () => {
    // "No tile load started" also means "the tile is queued behind a few
    // hundred others". Guessing wrong there fades to an empty map.
    const source = fakeSource();
    const layer = fakeLayer(source);
    const ready = awaitBasemapReady(fakeGroup([layer]));
    let result = null;
    ready.then((r) => { result = r; });

    await vi.advanceTimersByTimeAsync(1000);
    expect(result).toBe(null);
  });

  test("a failing tile counts as settled rather than hanging the switch", async () => {
    const source = fakeSource();
    const ready = awaitBasemapReady(fakeGroup([fakeLayer(source)]));
    let done = false;
    ready.then(() => { done = true; });

    source.fire("tileloaderror");
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  test("waits for every source in the group, not just the first", async () => {
    // Satellite mode is imagery plus a label overlay — switching to it with
    // only the imagery loaded would still show a half-empty map.
    const imagery = fakeSource("imagery");
    const labels = fakeSource("labels");
    const ready = awaitBasemapReady(
      fakeGroup([fakeLayer(imagery), fakeLayer(labels)]),
    );
    let done = false;
    ready.then(() => { done = true; });

    imagery.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(false);

    labels.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  test("a slow overlay does not hold the map hostage once the base layer is ready", async () => {
    const imagery = fakeSource("imagery");
    const labels = fakeSource("labels");
    const ready = awaitBasemapReady(
      fakeGroup([fakeLayer(imagery), fakeLayer(labels)]),
      { settleGraceMs: 350 },
    );
    let done = false;
    ready.then(() => { done = true; });

    imagery.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(false);

    // The overlay never answers — the switch still goes through.
    await vi.advanceTimersByTimeAsync(400);
    expect(done).toBe(true);
  });

  test("an overlay settling first does not cut the base layer's wait short", async () => {
    const imagery = fakeSource("imagery");
    const labels = fakeSource("labels");
    const ready = awaitBasemapReady(
      fakeGroup([fakeLayer(imagery), fakeLayer(labels)]),
      { settleGraceMs: 350 },
    );
    let done = false;
    ready.then(() => { done = true; });

    labels.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(500);
    expect(done).toBe(false);

    imagery.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  test("several layers sharing one source are only waited for once", async () => {
    // A vector basemap draws many layers from a single vector-tile source.
    const shared = fakeSource("shared");
    const ready = awaitBasemapReady(
      fakeGroup([fakeLayer(shared), fakeLayer(shared), fakeLayer(shared)]),
    );
    let done = false;
    ready.then(() => { done = true; });

    shared.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });

  test("a tile server that never answers cannot freeze the map", async () => {
    const source = fakeSource();
    const ready = awaitBasemapReady(fakeGroup([fakeLayer(source)]), {
      timeoutMs: 1500,
    });
    let result = null;
    ready.then((r) => { result = r; });

    await vi.advanceTimersByTimeAsync(1600);
    // Nothing arrived, so the caller is told to hold the old basemap rather
    // than fade to an empty one.
    expect(result).toEqual({ loaded: false });
  });

  test("reports that tiles arrived when the timeout fires after one loaded", async () => {
    const source = fakeSource();
    const ready = awaitBasemapReady(fakeGroup([fakeLayer(source)]), {
      timeoutMs: 1500,
    });
    let result = null;
    ready.then((r) => { result = r; });

    source.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toEqual({ loaded: true });
  });

  test("detaches its listeners once it is done", async () => {
    const source = fakeSource();
    const ready = awaitBasemapReady(fakeGroup([fakeLayer(source)]));
    source.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(0);
    await ready;

    expect(source.listenerCount("tileloadend")).toBe(0);
    expect(source.listenerCount("tileloaderror")).toBe(0);
  });

  test("detaches its listeners after a timeout too", async () => {
    const source = fakeSource();
    const ready = awaitBasemapReady(fakeGroup([fakeLayer(source)]), {
      timeoutMs: 200,
    });
    await vi.advanceTimersByTimeAsync(300);
    await ready;

    expect(source.listenerCount("tileloadend")).toBe(0);
  });

  test("a group that cannot be inspected is treated as ready", async () => {
    const broken = {
      getLayers() {
        throw new Error("boom");
      },
    };
    const ready = awaitBasemapReady(broken);
    await expect(ready).resolves.toEqual({ loaded: true });
  });

  test("resolves exactly once", async () => {
    const source = fakeSource();
    const ready = awaitBasemapReady(fakeGroup([fakeLayer(source)]));
    const spy = vi.fn();
    ready.then(spy);

    source.fire("tileloadstart");
    source.fire("tileloadend");
    source.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(2000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("waitForFirstTile", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("resolves when a tile lands", async () => {
    const source = fakeSource();
    const waiting = waitForFirstTile(fakeGroup([fakeLayer(source)]));
    let arrived = null;
    waiting.then((a) => { arrived = a; });

    await vi.advanceTimersByTimeAsync(100);
    expect(arrived).toBe(null);

    source.fire("tileloadend");
    await vi.advanceTimersByTimeAsync(0);
    expect(arrived).toBe(true);
  });

  test("gives up after the timeout", async () => {
    const source = fakeSource();
    const waiting = waitForFirstTile(fakeGroup([fakeLayer(source)]), {
      timeoutMs: 5000,
    });
    let arrived = null;
    waiting.then((a) => { arrived = a; });

    await vi.advanceTimersByTimeAsync(6000);
    expect(arrived).toBe(false);
  });

  test("resolves false for a group with no sources", async () => {
    const waiting = waitForFirstTile(fakeGroup([]));
    await expect(waiting).resolves.toBe(false);
  });
});
