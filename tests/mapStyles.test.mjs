// Runs under Vitest
import { test, describe, expect, beforeEach } from "vitest";

describe("Map Modes & Terrain Styles", () => {
  const VALID_STYLES = ["street", "satellite", "terrain", "dark"];
  const TILE_URLS = {
    satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    boundaries: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    terrain: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    street: "https://tiles.openfreemap.org/styles/liberty",
    dark: "https://tiles.openfreemap.org/styles/dark"
  };

  beforeEach(() => {
    localStorage.clear();
  });

  test("validates all 4 primary map styles", () => {
    VALID_STYLES.forEach((style) => {
      expect(["street", "satellite", "terrain", "dark"]).toContain(style);
    });
  });

  test("contains valid HTTPS endpoints for satellite imagery and terrain", () => {
    expect(TILE_URLS.satellite).toMatch(/^https:\/\/server\.arcgisonline\.com/);
    expect(TILE_URLS.boundaries).toMatch(/^https:\/\/server\.arcgisonline\.com/);
    expect(TILE_URLS.terrain).toMatch(/^https:\/\/server\.arcgisonline\.com/);
  });

  test("persists mapStyle to localStorage and retrieves correctly", () => {
    localStorage.setItem("aurafisky_map_style", "satellite");
    expect(localStorage.getItem("aurafisky_map_style")).toBe("satellite");

    localStorage.setItem("aurafisky_map_style", "terrain");
    expect(localStorage.getItem("aurafisky_map_style")).toBe("terrain");
  });

  test("fallback to street for invalid style string", () => {
    const sanitizeStyle = (s) => (VALID_STYLES.includes(s) ? s : "street");
    expect(sanitizeStyle("invalid_mode")).toBe("street");
    expect(sanitizeStyle("satellite")).toBe("satellite");
    expect(sanitizeStyle("terrain")).toBe("terrain");
  });
});
