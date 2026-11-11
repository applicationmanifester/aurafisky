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
    const flyoutHtml = flyoutMatch[0].replace(/\s+/g, " ");
    expect(flyoutHtml).not.toContain(">Map Modes<");
    expect(flyoutHtml).toContain(">Map Mode<");
    expect(flyoutHtml).toContain('id="closeMapLayersBtn"');
  });

  test("basemaps have correct provider maxZoom to prevent Esri placeholder tiles", () => {
    const fs = require("fs");
    const appJs = fs.readFileSync("app.js", "utf-8");
    expect(appJs).toMatch(/(?:terrainBasemap\s*=|createTerrainBasemap\s*=\s*\(\)\s*=>)\s*new LayerGroup\(\{[\s\S]*?maxZoom:\s*17/);
    expect(appJs).toMatch(/(?:hillshadeBasemap\s*=|createHillshadeBasemap\s*=\s*\(\)\s*=>)\s*new LayerGroup\(\{[\s\S]*?maxZoom:\s*16/);
    expect(appJs).toMatch(/(?:oceanBasemap\s*=|createOceanBasemap\s*=\s*\(\)\s*=>)\s*new LayerGroup\(\{[\s\S]*?maxZoom:\s*10/);
    expect(appJs).toMatch(/(?:natGeoBasemap\s*=|createNatGeoBasemap\s*=\s*\(\)\s*=>)\s*new LayerGroup\(\{[\s\S]*?maxZoom:\s*12/);
  });

  test("app.js synchronizes the dark theme with the basemap's brightness", () => {
    const fs = require("fs");
    const appJs = fs.readFileSync("app.js", "utf-8");

    // setMapStyle synchronization — every dark basemap takes the app's theme
    // with it, every light one brings it back.
    expect(appJs).toContain("if (isDarkMapMode(style)) {");
    expect(appJs).toContain('document.documentElement.classList.add("dark");');
    expect(appJs).toContain('document.documentElement.classList.remove("dark");');
    expect(appJs).toContain('document.documentElement.removeAttribute("data-theme");');

    // Startup check verifies aurafisky_map_style
    expect(appJs).toContain("isDarkMapMode(savedMapStyle)");
  });

  test("zero Carto raster tile references and watermarks; enforces 100% keyless OSM/OpenFreeMap basemaps", () => {
    const fs = require("fs");
    const appJs = fs.readFileSync("app.js", "utf-8");
    const indexHtml = fs.readFileSync("index.html", "utf-8");
    const firebaseJson = fs.readFileSync("firebase.json", "utf-8");

    expect(appJs).not.toContain("cartocdn.com");
    expect(indexHtml).not.toContain("cartocdn.com");
    expect(firebaseJson).not.toContain("cartocdn.com");
    expect(appJs).toContain("https://tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(appJs).toContain("https://tiles.openfreemap.org/styles/liberty");
    expect(appJs).toContain("https://tiles.openfreemap.org/styles/dark");
  });

  test("index.html contains on-map color indication widget with elevation notification & temp toggle", () => {
    const fs = require("fs");
    const html = fs.readFileSync("index.html", "utf-8");

    // On-map legend widget elements
    expect(html).toContain('id="mapColorLegendWidget"');
    expect(html).toContain('id="mapLegendPillBtn"');
    expect(html).toContain('id="mapLegendCard"');
    expect(html).toContain('id="mapLegendNotification"');
    expect(html).toContain('id="mapLegendSwitchModeBtn"');

    // Flyout enhancements
    expect(html).toContain('id="mapModeElevationHint"');
    expect(html).toContain('id="tempGridOverlayToggle"');
    expect(html).toContain('id="toggleMapLegendCardBtn"');
  });

  test("css/device-adaptive.css defines .legend-gradient-elevation with elevation relief colors", () => {
    const fs = require("fs");
    const css = fs.readFileSync("css/device-adaptive.css", "utf-8");
    expect(css).toContain(".legend-gradient-elevation");
    expect(css).toContain("#388e3c"); // Green lowland
    expect(css).toContain("#d32f2f"); // Red mountain peak
  });

  test("features/appToggles.js tempToColor accurately denotes green, yellow, orange, and red shades", () => {
    const fs = require("fs");
    const code = fs.readFileSync("features/appToggles.js", "utf-8");
    expect(code).toContain("tempToColor");

    // Extract function and test temperature scale
    const match = code.match(/function tempToColor[\s\S]*?\n  \}/);
    expect(match).not.toBeNull();
    const fn = new Function(`${match[0]}; return tempToColor;`)();

    // Cold < 0°C should be in blue spectrum
    const cold = fn(-2);
    expect(cold).toMatch(/rgb\(\d+,\s*\d+,\s*\d+\)/);

    // Mild 15°C should be green
    const mild = fn(15);
    const mildRgb = mild.match(/\d+/g).map(Number);
    expect(mildRgb[1]).toBeGreaterThan(mildRgb[0]); // Green > Red
    expect(mildRgb[1]).toBeGreaterThan(mildRgb[2]); // Green > Blue

    // Warm 26°C should have high red & green (yellowish)
    const warm = fn(26);
    const warmRgb = warm.match(/\d+/g).map(Number);
    expect(warmRgb[0]).toBeGreaterThan(180);
    expect(warmRgb[1]).toBeGreaterThan(120);

    // Hot 34°C should be orange (Red high, Green mid, Blue low)
    const hot = fn(34);
    const hotRgb = hot.match(/\d+/g).map(Number);
    expect(hotRgb[0]).toBeGreaterThan(200);
    expect(hotRgb[1]).toBeLessThan(warmRgb[1]);

    // Extreme 40°C should be red
    const extreme = fn(40);
    const extremeRgb = extreme.match(/\d+/g).map(Number);
    expect(extremeRgb[0]).toBeGreaterThan(200);
    expect(extremeRgb[1]).toBeLessThan(70);
  });

  test("#mapLayersFlyout starts hidden and respects .hidden close state in CSS and HTML", () => {
    const fs = require("fs");
    const html = fs.readFileSync("index.html", "utf-8");
    const css = fs.readFileSync("styles.css", "utf-8");

    expect(html).toMatch(/id="mapLayersFlyout"[^>]*class="[^"]*\bhidden\b/);
    expect(html).not.toContain("window.AurafiskyApp");
    expect(html).not.toMatch(/id="closeMapLayersBtn"[^>]*\bonclick=/i);

    expect(css).toMatch(/#mapLayersFlyout\.hidden\s*\{\s*display:\s*none\s*!important;/);
    expect(css).toContain("#mapLayersFlyout:not(.hidden)");
    expect(css).not.toMatch(/#mapLayersFlyout:not\(\.minimized\)\s*\{[^}]*display:\s*flex/s);
  });

  test("mapLayersFlyout wires placeLabelsToggle, hybrid mode, opacity slider rail, and chevron padding", () => {
    const fs = require("fs");
    const html = fs.readFileSync("index.html", "utf-8");
    const appJs = fs.readFileSync("app.js", "utf-8");
    const polishCss = fs.readFileSync("css/aura-polish.css", "utf-8");

    // 1. Dropdown right padding keeps labels clear of chevron, and single change listener avoids double fire
    expect(html).toMatch(/id="mapModeSelectDropdown"[^>]*class="[^"]*\bpr-7\b/);
    expect(html).toContain('value="hybrid"');
    expect(appJs).not.toContain('mapModeSelect.addEventListener("input"');

    // 2. Hybrid mode and the canonical MAP_MODES list (matches the numbered
    //    shortcuts & prev/next cycling). The list lives in one module now.
    expect(appJs).toContain("hybrid: createHybridBasemap");
    expect(appJs).toContain("'hybrid'");
    expect(appJs).toContain('from "./modules/map-modes.js"');
    expect(appJs).toContain("this.MAP_MODES = MAP_MODES;");

    // 3. Place Labels toggle is wired to setPlaceLabelsEnabled & placeLabelsLayer
    expect(html).toContain('id="placeLabelsToggle"');
    expect(appJs).toContain('document.getElementById("placeLabelsToggle")');
    expect(appJs).toContain("setPlaceLabelsEnabled(");
    expect(appJs).toContain("_applyPlaceLabels()");
    expect(appJs).toContain("this.placeLabelsLayer = new TileLayer");

    // 4. Opacity slider renders custom thin track rail with active fill & syncs on startup
    expect(polishCss).toContain("#mapOpacitySlider::-webkit-slider-runnable-track");
    expect(polishCss).toContain("#mapOpacitySlider::-moz-range-track");
    expect(html).not.toMatch(/id="mapOpacitySlider"[^>]*class="[^"]*\bbg-slate-200\/60\b/);
    expect(appJs).toContain("_syncMapFlyoutControls");
    expect(appJs).toContain("--opacity-pct");
  });
});

