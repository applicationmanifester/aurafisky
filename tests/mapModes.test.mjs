// Runs under Vitest
import { test, describe, expect } from "vitest";
import { readFileSync } from "node:fs";

import {
  MAP_MODES,
  MAP_MODE_BY_ID,
  MAP_MODE_IDS,
  MAP_MODE_SHORT_NAMES,
  MAP_MODES_WITH_DARK_THEME,
  MAP_MODES_WITH_ELEVATION,
  MAP_MODES_WITH_REFERENCE_LABELS,
  NUMBERED_MAP_MODE_IDS,
  isDarkMapMode,
  isMapMode,
  mapModeBadge,
  mapModeName,
  mapModeSettingsName,
} from "../modules/map-modes.js";

const appJs = readFileSync("app.js", "utf-8");
const indexHtml = readFileSync("index.html", "utf-8");

/** The option values of a <select> in index.html. */
function optionValues(selectId) {
  const match = indexHtml.match(
    new RegExp(`<select[^>]*id="${selectId}"[^>]*>([\\s\\S]*?)</select>`),
  );
  expect(match, `select #${selectId} not found`).not.toBeNull();
  return [...match[1].matchAll(/value="([^"]+)"/g)].map((m) => m[1]);
}

describe("the map mode registry", () => {
  test("every mode has the fields the UI reads off it", () => {
    for (const mode of MAP_MODES) {
      expect(typeof mode.id).toBe("string");
      expect(mode.id).toMatch(/^[a-z0-9]+$/);
      expect(typeof mode.name).toBe("string");
      expect(mode.name.length).toBeGreaterThan(0);
      expect(typeof mode.short).toBe("string");
      expect(mode.short.length).toBeGreaterThan(0);
      expect(typeof mode.icon).toBe("string");
      expect(["vector", "raster"]).toContain(mode.kind);
      expect(["light", "dark"]).toContain(mode.theme);
      expect(typeof mode.hasReferenceLabels).toBe("boolean");
      expect(typeof mode.elevation).toBe("boolean");
    }
  });

  test("no two modes share an id", () => {
    expect(new Set(MAP_MODE_IDS).size).toBe(MAP_MODE_IDS.length);
  });

  test("the original nine modes are still there, in their original order", () => {
    // These nine predate the registry and every one of them has a shortcut
    // or a saved preference pointing at it.
    expect(MAP_MODE_IDS.slice(0, 9)).toEqual([
      "street",
      "satellite",
      "hybrid",
      "terrain",
      "hillshade",
      "opentopo",
      "ocean",
      "natgeo",
      "dark",
    ]);
  });

  test("the modes added since are present", () => {
    for (const id of ["gray", "darkgray", "hillshadedark", "transport"]) {
      expect(MAP_MODE_IDS).toContain(id);
    }
  });

  test("isMapMode only accepts known modes", () => {
    expect(isMapMode("satellite")).toBe(true);
    expect(isMapMode("nonsense")).toBe(false);
    expect(isMapMode(undefined)).toBe(false);
    expect(isMapMode("toString")).toBe(false);
  });

  test("the dark basemaps are the ones the app treats as dark", () => {
    expect(MAP_MODES_WITH_DARK_THEME).toContain("dark");
    expect(MAP_MODES_WITH_DARK_THEME).toContain("darkgray");
    expect(MAP_MODES_WITH_DARK_THEME).toContain("hillshadedark");
    expect(MAP_MODES_WITH_DARK_THEME).not.toContain("street");
    expect(MAP_MODES_WITH_DARK_THEME).not.toContain("gray");
    expect(isDarkMapMode("darkgray")).toBe(true);
    expect(isDarkMapMode("gray")).toBe(false);
  });

  test("the relief modes are the ones that show the elevation legend", () => {
    expect(MAP_MODES_WITH_ELEVATION).toContain("terrain");
    expect(MAP_MODES_WITH_ELEVATION).toContain("hillshade");
    expect(MAP_MODES_WITH_ELEVATION).toContain("opentopo");
    expect(MAP_MODES_WITH_ELEVATION).toContain("hillshadedark");
    expect(MAP_MODES_WITH_ELEVATION).not.toContain("satellite");
  });

  test("the modes that draw their own names are the ones that bundle a reference layer", () => {
    expect(MAP_MODES_WITH_REFERENCE_LABELS).toContain("street");
    expect(MAP_MODES_WITH_REFERENCE_LABELS).toContain("dark");
    expect(MAP_MODES_WITH_REFERENCE_LABELS).toContain("hybrid");
    expect(MAP_MODES_WITH_REFERENCE_LABELS).toContain("gray");
    expect(MAP_MODES_WITH_REFERENCE_LABELS).toContain("darkgray");
    // The imagery, topo and reference modes have no names of their own, so
    // the OSM place-name overlay is what puts them there.
    expect(MAP_MODES_WITH_REFERENCE_LABELS).not.toContain("satellite");
    expect(MAP_MODES_WITH_REFERENCE_LABELS).not.toContain("terrain");
    expect(MAP_MODES_WITH_REFERENCE_LABELS).not.toContain("transport");
  });

  test("the display helpers produce the labels the UI shows", () => {
    expect(mapModeName("street")).toBe("Default (Street)");
    expect(mapModeName("dark")).toBe("Dark Mode");
    expect(mapModeSettingsName("hybrid")).toBe("Hybrid (Satellite + Labels)");
    expect(mapModeSettingsName("street")).toBe("Default");
    expect(mapModeBadge("satellite")).toBe("🛰️ Satellite");
    expect(MAP_MODE_SHORT_NAMES.opentopo).toBe("OpenTopo");
    // Unknown modes must not throw — the UI falls back to the raw id.
    expect(mapModeName("nonsense")).toBe("");
    expect(mapModeBadge("nonsense")).toBe("");
  });
});

describe("the numbered map-mode shortcuts", () => {
  test("1-9 keep pointing at the modes they always pointed at", () => {
    expect(NUMBERED_MAP_MODE_IDS.slice(0, 9)).toEqual([
      "street",
      "satellite",
      "hybrid",
      "terrain",
      "hillshade",
      "opentopo",
      "ocean",
      "natgeo",
      "dark",
    ]);
  });

  test("0 selects the tenth mode", () => {
    expect(NUMBERED_MAP_MODE_IDS).toHaveLength(10);
    expect(NUMBERED_MAP_MODE_IDS[9]).toBe("gray");
  });

  test("every pinned shortcut is a real mode", () => {
    for (const id of NUMBERED_MAP_MODE_IDS) {
      expect(isMapMode(id)).toBe(true);
    }
  });

  test("the shortcuts are pinned by id, not by picker position", () => {
    // If the picker order ever changes, the pinned list must not move with
    // it — that is the whole point of pinning it.
    const shortcuts = readFileSync("features/keyboardShortcuts.js", "utf-8");
    expect(shortcuts).toContain("NUMBERED_MAP_MODE_IDS");
    expect(shortcuts).not.toContain("this.MAP_MODES");
  });
});

describe("the mode list and the app stay in step", () => {
  test("the picker dropdown offers every mode, and nothing else", () => {
    const options = optionValues("mapModeSelectDropdown");
    expect(options).toEqual([...MAP_MODE_IDS]);
  });

  test("the settings dropdown offers every mode, and nothing else", () => {
    const options = optionValues("settingsMapStyleSelect");
    expect(options).toEqual([...MAP_MODE_IDS]);
  });

  test("every mode has a basemap factory in app.js", () => {
    for (const mode of MAP_MODES) {
      if (mode.kind === "vector") continue; // street and dark are the vector basemaps
      expect(appJs, `no basemap factory for "${mode.id}"`).toContain(
        `${mode.id}: create`,
      );
    }
  });

  test("the new basemaps declare the zoom their tile grid actually serves", () => {
    // Esri's tile grid stops at a fixed level; asking for a deeper one
    // returns an empty tile instead of a map.
    expect(appJs).toMatch(
      /createLightGrayBasemap\s*=\s*\(\)\s*=>\s*new LayerGroup\(\{[\s\S]*?maxZoom:\s*16/,
    );
    expect(appJs).toMatch(
      /createDarkGrayBasemap\s*=\s*\(\)\s*=>\s*new LayerGroup\(\{[\s\S]*?maxZoom:\s*16/,
    );
    expect(appJs).toMatch(
      /createDarkHillshadeBasemap\s*=\s*\(\)\s*=>\s*new LayerGroup\(\{[\s\S]*?maxZoom:\s*16/,
    );
    expect(appJs).toMatch(
      /createTransportBasemap\s*=\s*\(\)\s*=>\s*new LayerGroup\(\{[\s\S]*?maxZoom:\s*16/,
    );
  });

  test("the new basemaps point at services that exist", () => {
    for (const service of [
      "Canvas/World_Light_Gray_Base",
      "Canvas/World_Light_Gray_Reference",
      "Canvas/World_Dark_Gray_Base",
      "Canvas/World_Dark_Gray_Reference",
      "Elevation/World_Hillshade_Dark",
      "Reference/World_Transportation",
    ]) {
      expect(appJs).toContain(`ArcGIS/rest/services/${service}/MapServer/tile/`);
    }
  });

  test("app.js reads the mode list from the registry instead of its own copy", () => {
    expect(appJs).toContain('from "./modules/map-modes.js"');
    expect(appJs).toContain("this.MAP_MODES = MAP_MODES;");
    expect(appJs).toContain("const validStyles = MAP_MODE_IDS;");
    // The old inline copies of the list are gone.
    expect(appJs).not.toMatch(/const validStyles = \['street'/);
    expect(appJs).not.toMatch(/this\.MAP_MODES = \[\s*'street'/);
  });

  test("the label, badge and loading names all come from the registry", () => {
    expect(appJs).toContain("mapModeBadge(this.mapStyle)");
    expect(appJs).toContain("MAP_MODES_WITH_REFERENCE_LABELS.includes(this.mapStyle)");
    expect(appJs).toContain("MAP_MODES_WITH_ELEVATION.includes(this.mapStyle)");

    const switchModule = readFileSync("modules/basemap-switch.js", "utf-8");
    expect(switchModule).toContain('from "./map-modes.js"');
    expect(switchModule).toContain("MAP_MODE_SHORT_NAMES[app.mapStyle]");
  });

  test("prewarming knows about the new modes", () => {
    const prewarmModule = readFileSync("modules/basemap-prewarm.js", "utf-8");
    for (const id of ["gray", "darkgray", "hillshadedark", "transport"]) {
      expect(prewarmModule).toContain(`"${id}"`);
    }
  });
});
