/**
 * ============================================================
 * Device Profile Feature — features/deviceProfile.js
 * ============================================================
 * Classifies the runtime environment into a device tier so both
 * CSS and JS can adapt the UI to the screen it is running on:
 *
 *   tv      — Smart TVs / set-top boxes / consoles (D-pad input,
 *             no touch, large 10-foot UI)
 *   tablet  — iPads, Android tablets, foldables opened flat
 *   phone   — smartphones (portrait-first, bottom-sheet UX)
 *   desktop — laptops & desktops (pointer + keyboard)
 *
 * The result is exposed three ways:
 *   1. data-* attributes on <html> for CSS hooks
 *   2. app.deviceProfile (object) for feature code
 *   3. window.AuraDevice for anything outside the app instance
 *
 * Also maintains live orientation / short-viewport / foldable
 * state so panels can re-flow when a device rotates or folds.
 * ============================================================
 */

export function init(app) {
  const html = document.documentElement;

  const TV_UA_PATTERN =
    /(?:SmartTV|Smart-TV|SMART-TV|GoogleTV|CrKey|AppleTV|Apple\s?TV|Tizen|Web0S|WebOS|NetCast|BRAVIA|HbbTV|Viera|AFT[A-Z0-9]*|FireTV|Shield|Android\s?TV|Google\s?TV|Xbox|PlayStation|Nintendo)/i;

  const state = {
    device: "desktop", // tv | tablet | phone | desktop
    input: "pointer", // touch | hybrid | pointer
    orientation: "landscape", // portrait | landscape
    short: false, // viewport shorter than ~500px
    foldable: false, // dual-screen / folding device
    touchPoints: 0,
    vw: 0,
    vh: 0,
  };

  /** Internal: coarse classification used before measurements. */
  function detectDevice() {
    const ua = navigator.userAgent || "";
    const maxTouch = navigator.maxTouchPoints || 0;
    state.touchPoints = maxTouch;

    // 1) TVs / consoles / set-top boxes (most explicit signal first)
    if (TV_UA_PATTERN.test(ua)) return "tv";

    // 2) UA-Client-Hints form factor when available (Chromium)
    try {
      if (navigator.userAgentData?.getHighEntropyValuesSync) {
        // Not async here — only use it if the sync API exists (rare);
        // the async path below refines the value after init.
      }
    } catch (_) {
      /* ignore */
    }

    const w = window.innerWidth || screen.width;
    const h = window.innerHeight || screen.height;
    const minDim = Math.min(w, h);
    const maxDim = Math.max(w, h);

    const hasTouch = maxTouch > 0;
    const hasFinePointer =
      window.matchMedia?.("(pointer: fine)").matches ?? true;

    // Hybrid devices (Surface, Yoga, iPad with trackpad...)
    state.input = hasTouch && hasFinePointer ? "hybrid" : hasTouch ? "touch" : "pointer";

    // 3) Tablets: touch-first, generous diagonal, no TV signature
    if (hasTouch && !hasFinePointer && minDim >= 600 && maxDim >= 960) {
      return "tablet";
    }

    // 4) Big-screen no-touch displays that aren't known TVs still
    //    behave like desktops (projectors, kiosks with mice, etc.)
    if (hasTouch && minDim < 600) return "phone";

    // iPad specifically reports as Macintosh in modern Safari;
    // treat "Mac with touch" as tablet.
    if (/Macintosh/i.test(ua) && maxTouch > 1) return "tablet";

    return "desktop";
  }

  /** Async refinement via UA-Client-Hints (Chromium) when available. */
  async function refineWithClientHints() {
    try {
      if (!navigator.userAgentData?.getHighEntropyValues) return;
      const hints = await navigator.userAgentData.getHighEntropyValues([
        "formFactor",
        "platform",
      ]);
      if (hints.formFactor === "TV" || hints.formFactors?.includes("TV")) {
        apply("tv");
      }
    } catch (_) {
      /* not supported — desktop detection stands */
    }
  }

  /** Apply a device tier + refresh all live attributes. */
  function apply(device) {
    if (device) state.device = device;

    const w = window.innerWidth || 0;
    const h = window.innerHeight || 0;
    state.vw = w;
    state.vh = h;
    state.orientation = h > w ? "portrait" : "landscape";
    state.short = Math.min(w, h) < 500 && state.device !== "tv";

    // Foldables: CSS Viewport Segments API (Surface Duo style)
    state.foldable = false;
    try {
      if (window.matchMedia?.("(horizontal-viewport-segments: 2)").matches ||
          window.matchMedia?.("(vertical-viewport-segments: 2)").matches) {
        state.foldable = true;
      }
    } catch (_) {
      /* unsupported — fine */
    }

    html.dataset.device = state.device;
    html.dataset.input = state.input;
    html.dataset.orientation = state.orientation;
    if (state.short) html.dataset.short = "true";
    else delete html.dataset.short;
    if (state.foldable) html.dataset.foldable = "true";
    else delete html.dataset.foldable;
  }

  /** Public refresh — re-detect and re-apply everything. */
  function refreshDeviceProfile() {
    apply(detectDevice());
    return state;
  }

  // Initial detection runs synchronously so CSS hooks are correct
  // before first paint of the panel.
  apply(detectDevice());
  refineWithClientHints();

  // Live updates: rotation, window resize, fold/unfold.
  let raf = 0;
  const scheduleRefresh = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const prev = JSON.stringify({
        d: state.device,
        o: state.orientation,
        s: state.short,
        f: state.foldable,
      });
      refreshDeviceProfile();
      const next = JSON.stringify({
        d: state.device,
        o: state.orientation,
        s: state.short,
        f: state.foldable,
      });
      if (prev !== next) {
        window.dispatchEvent(
          new CustomEvent("aura:devicechange", { detail: state }),
        );
      }
    });
  };

  window.addEventListener("resize", scheduleRefresh, { passive: true });
  window.addEventListener("orientationchange", scheduleRefresh, {
    passive: true,
  });

  // Attach to the app instance + global escape hatch.
  app.deviceProfile = state;
  app.refreshDeviceProfile = refreshDeviceProfile;
  try {
    window.AuraDevice = state;
  } catch (_) {
    /* sandboxed — app.deviceProfile still works */
  }
}
