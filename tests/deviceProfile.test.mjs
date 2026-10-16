// Unit tests for the device classifier (features/deviceProfile.js).
//
// The classifier previously had no tests at all, which is how a Galaxy Tab A7
// (600x800) and every unfolded foldable (673x841) came back as "desktop" and
// were handed a mouse-driven layout on a touch screen.
import { test, expect, describe, beforeEach, afterEach } from "vitest";

// The classifier itself is imported, not re-implemented: a duplicated copy
// drifts from the feature the moment either side is edited.
import { classifyDevice } from "../features/deviceProfile.js";

function detect(env) {
  return classifyDevice({ ua: "", maxTouchPoints: 0, ...env, userAgent: env.ua ?? env.userAgent ?? "" });
}

const win = (over = {}) => ({
  coarse: false,
  fine: false,
  ua: "",
  maxTouchPoints: 0,
  ...over,
});

describe("device classification", () => {
  test("smart TVs and consoles are detected from the UA", () => {
    for (const ua of [
      "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36",
      "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36",
      "Mozilla/5.0 (BRAVIA 4K GB SmartTV/FW) AppleWebKit/537.36",
      "Mozilla/5.0 (Linux; Android 9; BRAVIA 4K GB Build/PTT1.190515.001.S10) AppleWebKit/537.36",
      "CrKey/1.54.250320",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/85 Safari/537.36 CrKey/1.50",
      "Roku4640X/DVP-7.70 (297.70E04154A)",
    ]) {
      expect(detect(win({ ua })), ua.slice(0, 40)).toBe("tv");
    }
  });

  test("Sony AFT set-top prefixes are case-sensitive", () => {
    expect(detect(win({ ua: "Sony AFTN B4-40" }))).toBe("tv");
    // The old pattern was /AFT[A-Z0-9]*/i, which matched any UA containing
    // the substring "aft" case-insensitively.
    expect(detect(win({ ua: "Mozilla/5.0 Safari/537.36 draft editor" }))).toBe("desktop");
    expect(detect(win({ ua: "SomeBrowser/1.0 (aft-channel)" }))).toBe("desktop");
  });

  test("tablets in portrait and landscape", () => {
    expect(detect(win({ width: 768, height: 1024, coarse: true, fine: false }))).toBe("tablet");
    expect(detect(win({ width: 1024, height: 1366, coarse: true, fine: false }))).toBe("tablet");
    expect(detect(win({ width: 744, height: 1133, coarse: true, fine: false }))).toBe("tablet");
  });

  test("SMALL tablets are tablets, not desktops (maxDim >= 960 was the bug)", () => {
    // Galaxy Tab A7/A8: 600x800. The old test also required maxDim >= 960,
    // which these never reach, so they fell through to "desktop".
    expect(detect(win({ width: 600, height: 800, coarse: true, fine: false }))).toBe("tablet");
    expect(detect(win({ width: 800, height: 600, coarse: true, fine: false }))).toBe("tablet");
  });

  test("unfolded foldables are tablets, not desktops", () => {
    // Galaxy Z Fold 3/4/5, Pixel Fold, Z Flip unfolded: all ~673x841.
    expect(detect(win({ width: 673, height: 841, coarse: true, fine: false }))).toBe("tablet");
    expect(detect(win({ width: 841, height: 673, coarse: true, fine: false }))).toBe("tablet");
    expect(detect(win({ width: 701, height: 841, coarse: true, fine: false }))).toBe("tablet");
  });

  test("phones stay phones in both orientations", () => {
    expect(detect(win({ width: 360, height: 800, coarse: true, fine: false }))).toBe("phone");
    expect(detect(win({ width: 844, height: 390, coarse: true, fine: false }))).toBe("phone");
    expect(detect(win({ width: 932, height: 430, coarse: true, fine: false }))).toBe("phone");
  });

  test("a Mac with touch is a tablet (iPad reports as Macintosh)", () => {
    expect(detect(win({ width: 1440, height: 900, coarse: false, fine: true, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 }))).toBe("tablet");
    // A real Mac has no touch points.
    expect(detect(win({ width: 1440, height: 900, coarse: false, fine: true, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 }))).toBe("desktop");
  });

  test("a hybrid laptop is a desktop", () => {
    expect(detect(win({ width: 1368, height: 912, coarse: true, fine: true }))).toBe("desktop");
  });
});
