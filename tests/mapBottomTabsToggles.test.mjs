import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Map Bottom Tabs Visibility Toggles", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");

  it("includes Map Key toggle in Map Mode Flyout", () => {
    expect(html).toContain('id="mapLegendVisibilityToggle"');
  });

  it("includes Timeline Bar toggle in Map Mode Flyout", () => {
    expect(html).toContain('id="timelineBarVisibilityToggle"');
  });

  it("includes Map Key toggle in Settings Panel", () => {
    expect(html).toContain('id="settingsMapLegendToggle"');
  });

  it("includes Timeline Bar toggle in Settings Panel", () => {
    expect(html).toContain('id="settingsTimelineBarToggle"');
  });

  it("does not have corrupted CP437 mojibake characters in app.js", () => {
    const appJs = fs.readFileSync(path.resolve(__dirname, "../app.js"), "utf8");
    expect(appJs).not.toContain("ΓÇª");
    expect(appJs).not.toContain("≡ƒù║");
    expect(appJs).not.toContain("≡ƒîí");
    expect(appJs).not.toContain("ΓöÇ");
    expect(appJs).not.toContain("ΓÜá");
    expect(appJs).not.toContain("ΓåÆ");
  });

  it("defines openPlainPromptWeatherCard in app.js with clean prompt text", () => {
    const appJs = fs.readFileSync(path.resolve(__dirname, "../app.js"), "utf8");
    expect(appJs).toContain("openPlainPromptWeatherCard()");
    expect(appJs).toContain("Click on map or search the place to get the weather data");
  });
});

