// Runs under Vitest
import { test, describe, expect } from "vitest";

import {
  MAX_TILES_PER_CYCLE,
  MAX_TILES_PER_LAYER,
  PREWARM_PRIORITY,
  clampZoomToGrid,
  planPrewarm,
  shouldPrewarm,
  tileRangeToUrls,
} from "../modules/basemap-prewarm.js";

describe("basemap prewarm planning", () => {
  test("never prewarms the mode that is already on screen", () => {
    const plan = planPrewarm({
      available: ["satellite", "terrain", "hillshade"],
      activeStyle: "satellite",
    });
    expect(plan).not.toContain("satellite");
    expect(plan).toContain("terrain");
  });

  test("orders the plan by how likely the mode is to be wanted", () => {
    const plan = planPrewarm({
      available: ["ocean", "natgeo", "satellite", "terrain"],
      activeStyle: "street",
    });
    expect(plan[0]).toBe("satellite");
    expect(plan[1]).toBe("terrain");
    expect(plan.indexOf("ocean")).toBeGreaterThan(plan.indexOf("satellite"));
  });

  test("keeps modes outside the priority list, just after the known ones", () => {
    const plan = planPrewarm({
      available: ["custommode", "satellite"],
      activeStyle: "street",
    });
    expect(plan[0]).toBe("satellite");
    expect(plan).toContain("custommode");
  });

  test("caps how many modes a single cycle warms", () => {
    const plan = planPrewarm({
      available: ["satellite", "terrain", "hillshade", "opentopo"],
      activeStyle: "street",
      maxStyles: 2,
    });
    expect(plan).toHaveLength(2);
    expect(plan).toEqual(["satellite", "terrain"]);
  });

  test("returns an empty plan when nothing else is available", () => {
    expect(planPrewarm({ available: ["street"], activeStyle: "street" })).toEqual([]);
    expect(planPrewarm({ available: [], activeStyle: "street" })).toEqual([]);
  });

  test("priority list covers every lazily created basemap", () => {
    for (const style of ["satellite", "terrain", "hillshade", "opentopo", "ocean", "natgeo", "hybrid"]) {
      expect(PREWARM_PRIORITY).toContain(style);
    }
  });
});

describe("prewarm connection guard", () => {
  test("warms on a normal connection", () => {
    expect(shouldPrewarm(undefined)).toBe(true);
    expect(shouldPrewarm({ effectiveType: "4g" })).toBe(true);
    expect(shouldPrewarm({ effectiveType: "3g", saveData: false })).toBe(true);
  });

  test("does not spend metered data", () => {
    expect(shouldPrewarm({ saveData: true, effectiveType: "4g" })).toBe(false);
  });

  test("does not prewarm on a slow connection", () => {
    expect(shouldPrewarm({ effectiveType: "slow-2g" })).toBe(false);
    expect(shouldPrewarm({ effectiveType: "2g" })).toBe(false);
  });
});

describe("clampZoomToGrid", () => {
  test("clamps to the grid's own maximum zoom", () => {
    // The ocean basemap's grid stops at z10 — asking for z12 would produce
    // NaN tile coordinates and broken tile URLs.
    expect(clampZoomToGrid({ minZoom: 0, maxZoom: 10 }, 12)).toBe(10);
    expect(clampZoomToGrid({ minZoom: 0, maxZoom: 16 }, 12)).toBe(12);
  });

  test("clamps to the grid's minimum zoom", () => {
    expect(clampZoomToGrid({ minZoom: 4, maxZoom: 18 }, 2)).toBe(4);
  });

  test("rounds fractional zooms", () => {
    expect(clampZoomToGrid({ minZoom: 0, maxZoom: 18 }, 11.6)).toBe(12);
    expect(clampZoomToGrid({ minZoom: 0, maxZoom: 18 }, 11.2)).toBe(11);
  });

  test("survives a missing grid or a broken zoom", () => {
    expect(clampZoomToGrid(null, 7)).toBe(7);
    expect(clampZoomToGrid({ minZoom: 0, maxZoom: 18 }, NaN)).toBe(0);
  });
});

describe("tileRangeToUrls", () => {
  const range = { minX: 10, maxX: 12, minY: 20, maxY: 22 };
  const urlFn = (coord) => `https://tiles.example/${coord[0]}/${coord[1]}/${coord[2]}.png`;

  test("expands a tile range into urls", () => {
    const urls = tileRangeToUrls({ range, z: 5, urlFn, maxTiles: 100 });
    expect(urls).toHaveLength(9);
    expect(urls).toContain("https://tiles.example/5/11/21.png");
  });

  test("respects the tile budget", () => {
    const urls = tileRangeToUrls({ range, z: 5, urlFn, maxTiles: 4 });
    expect(urls).toHaveLength(4);
  });

  test("covers the middle of the viewport first, not the top-left corner", () => {
    // The focus is the tile the user is looking at; with a tight budget the
    // tiles around it are the ones worth fetching.
    const urls = tileRangeToUrls({
      range,
      z: 5,
      urlFn,
      maxTiles: 1,
      focus: { x: 12, y: 22 },
    });
    expect(urls).toEqual(["https://tiles.example/5/12/22.png"]);
  });

  test("falls back to the middle of the range when no focus is given", () => {
    const urls = tileRangeToUrls({
      range: { minX: 0, maxX: 2, minY: 0, maxY: 2 },
      z: 3,
      urlFn,
      maxTiles: 1,
    });
    expect(urls).toEqual(["https://tiles.example/3/1/1.png"]);
  });

  test("returns nothing when the url function produces no url", () => {
    expect(tileRangeToUrls({ range, z: 5, urlFn: () => undefined })).toEqual([]);
  });

  test("returns nothing for a broken url function", () => {
    const urls = tileRangeToUrls({
      range,
      z: 5,
      urlFn: () => {
        throw new Error("boom");
      },
    });
    expect(urls).toEqual([]);
  });

  test("returns nothing without a range or url function", () => {
    expect(tileRangeToUrls({ z: 5, urlFn })).toEqual([]);
    expect(tileRangeToUrls({ range, z: 5 })).toEqual([]);
  });

  test("a zero budget fetches nothing", () => {
    expect(tileRangeToUrls({ range, z: 5, urlFn, maxTiles: 0 })).toEqual([]);
  });
});

describe("prewarm budgets", () => {
  test("keeps the per-layer and per-cycle budgets bounded", () => {
    expect(MAX_TILES_PER_LAYER).toBeGreaterThan(0);
    expect(MAX_TILES_PER_CYCLE).toBeGreaterThan(MAX_TILES_PER_LAYER);
    // A cycle must stay small enough to be a sensible amount of data for a
    // mobile connection.
    expect(MAX_TILES_PER_CYCLE).toBeLessThanOrEqual(80);
  });
});
