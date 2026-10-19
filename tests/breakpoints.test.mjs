// Unit tests for the responsive/device layer.
//
// The device layer had zero coverage: features/deviceProfile.js,
// features/tvNavigation.js, css/device-adaptive.css and the
// googleMapsMobile bottom sheet were all untested, so a landscape phone
// silently losing the entire mobile UI went unnoticed.
import { test, expect, describe } from "vitest";
import {
  isMobileLayout,
  isLandscapePhone,
  MOBILE_MAX_WIDTH,
  SHORT_VIEWPORT_MAX_HEIGHT,
} from "../features/breakpoints.js";

/** Builds a minimal window stand-in. */
function makeWin({
  width,
  height,
  coarse = false,
  fine = false,
  userAgent = "",
  maxTouchPoints = 0,
  screenWidth = width,
  screenHeight = height,
} = {}) {
  return {
    innerWidth: width,
    innerHeight: height,
    screen: { width: screenWidth, height: screenHeight },
    maxTouchPoints,
    matchMedia: (q) => ({
      matches: q.includes("pointer: coarse")
        ? coarse
        : q.includes("pointer: fine")
          ? fine
          : false,
    }),
    userAgent,
  };
}

describe("isMobileLayout", () => {
  test("portrait phones get the mobile layout", () => {
    expect(isMobileLayout(makeWin({ width: 360, height: 800, coarse: true }))).toBe(true);
    expect(isMobileLayout(makeWin({ width: 390, height: 844, coarse: true }))).toBe(true);
    expect(isMobileLayout(makeWin({ width: 320, height: 568, coarse: true }))).toBe(true);
  });

  test("LANDSCAPE phones get the mobile layout (the regression that was missed)", () => {
    // An iPhone 14 rotated is 844x390: wide enough to escape any width-only
    // check, but still a one-handed touch device that needs the bottom nav,
    // the FABs and the 44px targets.
    expect(isMobileLayout(makeWin({ width: 844, height: 390, coarse: true }))).toBe(true);
    expect(isMobileLayout(makeWin({ width: 932, height: 430, coarse: true }))).toBe(true);
    expect(isMobileLayout(makeWin({ width: 926, height: 428, coarse: true }))).toBe(true);
  });

  test("tablets — even in landscape — keep the desktop card", () => {
    // An iPad is 768px+ in its short dimension, so it is roomy enough that a
    // full bottom sheet would waste the screen.
    expect(isMobileLayout(makeWin({ width: 1024, height: 768, coarse: true }))).toBe(false);
    expect(isMobileLayout(makeWin({ width: 1366, height: 1024, coarse: true }))).toBe(false);
  });

  test("small tablets are mobile", () => {
    // Galaxy Tab A7 is 600x800 in portrait.
    expect(isMobileLayout(makeWin({ width: 600, height: 800, coarse: true }))).toBe(true);
  });

  test("desktops are never mobile, however short the window", () => {
    // A 1440x450 desktop window must not sprout a bottom sheet: pointer is
    // fine, and that is the signal that keeps it on the desktop card.
    expect(isMobileLayout(makeWin({ width: 1440, height: 450, coarse: false, fine: true }))).toBe(false);
    expect(isMobileLayout(makeWin({ width: 1920, height: 1080, coarse: false, fine: true }))).toBe(false);
  });

  test("the boundary is exactly the documented width", () => {
    expect(isMobileLayout(makeWin({ width: MOBILE_MAX_WIDTH - 1, height: 900, coarse: true }))).toBe(true);
    expect(isMobileLayout(makeWin({ width: MOBILE_MAX_WIDTH, height: 900, coarse: true }))).toBe(false);
  });

  test("the short-viewport boundary is exactly the documented height", () => {
    expect(isMobileLayout(makeWin({ width: 900, height: SHORT_VIEWPORT_MAX_HEIGHT, coarse: true }))).toBe(true);
    expect(isMobileLayout(makeWin({ width: 900, height: SHORT_VIEWPORT_MAX_HEIGHT + 1, coarse: true }))).toBe(false);
  });

  test("a short window with a mouse is still desktop", () => {
    expect(isMobileLayout(makeWin({ width: 900, height: 400, coarse: false, fine: true }))).toBe(false);
  });

  test("missing window is safe", () => {
    expect(isMobileLayout(null)).toBe(false);
  });
});

describe("isLandscapePhone", () => {
  test("true only for a rotated phone", () => {
    expect(isLandscapePhone(makeWin({ width: 844, height: 390, coarse: true }))).toBe(true);
  });

  test("false for a portrait phone", () => {
    expect(isLandscapePhone(makeWin({ width: 390, height: 844, coarse: true }))).toBe(false);
  });

  test("false for a desktop window", () => {
    expect(isLandscapePhone(makeWin({ width: 1920, height: 400, coarse: false, fine: true }))).toBe(false);
  });
});

describe("mobileMapControls responsive & adaptive toolbar", () => {
  test("styles.css ensures right toolbar is responsive, adaptive and preserves hidden buttons", async () => {
    const fs = await import("fs");
    const css = fs.readFileSync("styles.css", "utf-8");
    expect(css).toContain("#mobileMapControls");
    expect(css).toContain("#mobileMapControls button.hidden");
    expect(css).toContain("max-height: calc(100dvh - 180px");
    expect(css).toContain("overflow-y: auto !important;");
  });
});

