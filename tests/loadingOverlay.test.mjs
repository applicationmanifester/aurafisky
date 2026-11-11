import { describe, it, expect } from "vitest";
import fs from "fs";

describe("Loading Overlay & Progress Contract", () => {
  it("index.html wires all required radar dial, progress, and accessible attributes", () => {
    const html = fs.readFileSync("index.html", "utf-8");
    const requiredIds = [
      'id="loadingOverlay"',
      'id="loaderLogoImg"',
      'src="icon-192.png"',
      'id="loaderProgressRing"',
      'id="loaderBarFill"',
      'id="loaderPercent"',
      'id="loaderStatusText"',
      'id="loaderPhaseText"',
    ];
    for (const marker of requiredIds) {
      expect(html).toContain(marker);
    }
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="12"');
  });

  it("app.js defines a single setLoadingProgress and hideLoadingOverlay with timer cleanup", () => {
    const appCode = fs.readFileSync("app.js", "utf-8");
    const setMatches = appCode.match(/^\s*setLoadingProgress\s*\(/gm) || [];
    const hideMatches = appCode.match(/^\s*hideLoadingOverlay\s*\(/gm) || [];
    expect(setMatches.length).toBe(1);
    expect(hideMatches.length).toBe(1);
    expect(appCode).toContain("_stopLoadingTimers");
    expect(appCode).toContain("#loadingOverlay");
  });

  it("css/aura-polish.css includes exit transition, dark theme rules, and reduced-motion guards", () => {
    const css = fs.readFileSync("css/aura-polish.css", "utf-8");
    expect(css).toContain("#loadingOverlay.is-hidden");
    expect(css).toContain(".dark #loadingOverlay");
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain(".loader-orbit-halo");
    expect(css).toContain(".loader-logo");
    expect(css).toContain("transform-box: fill-box");
  });
});

