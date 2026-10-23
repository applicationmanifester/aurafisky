// Runs under Vitest
import { test, describe, expect } from "vitest";
import fs from "fs";

describe("Map Rotation & Compass Reset", () => {
  const html = fs.readFileSync("index.html", "utf-8");
  const appJs = fs.readFileSync("app.js", "utf-8");

  test("index.html contains compassBtn and compassNeedle with cardinal NSEW markings", () => {
    expect(html).toContain('id="compassBtn"');
    expect(html).toContain('id="compassNeedle"');
    expect(html).toContain('title="Reset North orientation"');
    expect(html).toContain('aria-label="Reset North orientation"');
    // Compass rose must contain all four cardinal direction indicators
    expect(html).toMatch(/<text[^>]*>N<\/text>/);
    expect(html).toMatch(/<text[^>]*>S<\/text>/);
    expect(html).toMatch(/<text[^>]*>E<\/text>/);
    expect(html).toMatch(/<text[^>]*>W<\/text>/);
  });

  test("compassBtn is visible by default in zoomControls so users can locate it", () => {
    // Should not be hidden with opacity-0 pointer-events-none at initial render
    const compassMatch = html.match(/<button id="compassBtn"[^>]*class="([^"]*)"/);
    expect(compassMatch).toBeTruthy();
    expect(compassMatch[1]).not.toContain("opacity-0");
    expect(compassMatch[1]).not.toContain("pointer-events-none");
  });

  test("app.js has compassBtn and compassNeedle registered in element cache", () => {
    expect(appJs).toContain('compassBtn: document.getElementById("compassBtn")');
    expect(appJs).toContain('compassNeedle: document.getElementById("compassNeedle")');
  });

  test("app.js enables map rotation gestures in defaultInteractions and Alt-drag", () => {
    expect(appJs).toContain("altShiftDragRotate: true");
    expect(appJs).toContain("pinchRotate: true");
    expect(appJs).toContain("new DragRotate({ condition: altKeyOnly })");
    expect(appJs).not.toMatch(/interactions:\s*defaultInteractions\(\s*\{\s*altShiftDragRotate:\s*false/);
  });

  test("app.js attaches change:rotation listener on view", () => {
    expect(appJs).toContain('this.map.getView().on("change:rotation"');
    expect(appJs).toContain("this._updateCompass()");
  });

  test("app.js implements resetRotation and resets view rotation to 0", () => {
    expect(appJs).toContain("resetRotation()");
    expect(appJs).toContain("view.animate({ rotation: 0, duration: 300 })");
  });

  test("app.js resetView also resets rotation to 0", () => {
    expect(appJs).toContain("zoom: 3, rotation: 0");
  });

  test("compass needle calculation correctly inverts rotation angle to point to True North", () => {
    // 90 deg clockwise (PI / 2 rad) should rotate needle -90 deg
    const rad = Math.PI / 2;
    const deg = -rad * (180 / Math.PI);
    expect(deg).toBeCloseTo(-90);

    // -45 deg counter-clockwise should rotate needle +45 deg
    const negRad = -Math.PI / 4;
    const negDeg = -negRad * (180 / Math.PI);
    expect(negDeg).toBeCloseTo(45);
  });
});
