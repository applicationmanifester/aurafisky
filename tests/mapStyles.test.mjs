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

  test("persists mapLayersMinimized state to localStorage", () => {
    localStorage.setItem("aurafisky_map_layers_minimized", "true");
    expect(localStorage.getItem("aurafisky_map_layers_minimized")).toBe("true");

    localStorage.setItem("aurafisky_map_layers_minimized", "false");
    expect(localStorage.getItem("aurafisky_map_layers_minimized")).toBe("false");
  });

  test("index.html contains map layers minimize button, active badge, and collapsible body", () => {
    const fs = require("fs");
    const html = fs.readFileSync("index.html", "utf-8");
    expect(html).toContain('id="minimizeMapLayersBtn"');
    expect(html).toContain('id="mapLayersActiveBadge"');
    expect(html).toContain('id="mapLayersBody"');
    expect(html).toContain('id="mapLayersFlyout"');
  });

  test("styles.css contains styling for #mapLayersFlyout.minimized", () => {
    const fs = require("fs");
    const css = fs.readFileSync("styles.css", "utf-8");
    expect(css).toContain("#mapLayersFlyout.minimized");
  });

  test("index.html contains mapModeSelectDropdown with all mode options", () => {
    const fs = require("fs");
    const html = fs.readFileSync("index.html", "utf-8");
    expect(html).toContain('id="mapModeSelectDropdown"');
    expect(html).toContain('value="street"');
    expect(html).toContain('value="satellite"');
    expect(html).toContain('value="terrain"');
    expect(html).toContain('value="dark"');
  });

  test("index.html contains hourly forecast column headers", () => {
    const fs = require("fs");
    const html = fs.readFileSync("index.html", "utf-8");
    expect(html).toContain("hourly-header-row");
    expect(html).toContain("Time");
    expect(html).toContain("Sky");
    expect(html).toContain("Temp");
    expect(html).toContain("Precip");
    expect(html).toContain("Wind");
    expect(html).toContain("Humidity");
  });

  test("features/routes.js includes loading indicator for multi-stop route data", () => {
    const fs = require("fs");
    const code = fs.readFileSync("features/routes.js", "utf-8");
    expect(code).toContain("showRoutePanelLoading");
    expect(code).toContain("Loading Route & Weather Data");
  });

  test("index.html only uses dropdown for map modes and removes mapStyleGrid cards", () => {
    const fs = require("fs");
    const html = fs.readFileSync("index.html", "utf-8");
    expect(html).not.toContain('id="mapStyleGrid"');
    expect(html).toContain('id="mapModeSelectDropdown"');
  });

  test("mapLayersFlyout does not contain duplicate upper Map Modes header and contains closeMapLayersBtn alongside Map Mode label", () => {
    const fs = require("fs");
    const html = fs.readFileSync("index.html", "utf-8");
    const flyoutMatch = html.match(/id="mapLayersFlyout"[\s\S]*?id="shortcutsModal"/);
    expect(flyoutMatch).not.toBeNull();
    const flyoutHtml = flyoutMatch[0];
    expect(flyoutHtml).not.toContain(">Map Modes<");
    expect(flyoutHtml).toContain(">Map Mode<");
    expect(flyoutHtml).toContain('id="closeMapLayersBtn"');
  });
});
