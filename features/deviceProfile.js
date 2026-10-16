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

// Sony/Philips set-top boxes identify with an "AFT" model prefix, but only in
// upper case and with at least one character after it. This used to be
// `AFT[A-Z0-9]*` inside an /i alternation, which collapsed to "any UA
// containing the substring 'aft'" and misclassified unrelated devices. It is
// therefore a separate, case-sensitive test.
export const TV_UA_PATTERN =
  /(?:SmartTV|Smart-TV|SMART-TV|GoogleTV|CrKey|AppleTV|Apple\s?TV|Tizen|Web0S|WebOS|NetCast|BRAVIA|HbbTV|Viera|FireTV|Shield|Android\s?TV|Google\s?TV|Xbox|PlayStation|Nintendo|Roku|DVP-\d|VIDAA|Titan OS|Philips TV|Hisense|Opera TV Store)/i;
export const TV_UA_CASEFUL = /AFT[A-Z0-9]+/;

/**
 * Pure device classification.
 *
 * Exported (rather than only reachable through init()) so the rules can be
 * unit-tested against real device sizes without a DOM. init() supplies live
 * browser values; a test supplies an object of the same shape.
 *
 * @param {object} env
 * @param {number} env.width  @param {number} env.height
 * @param {boolean} env.coarse  - (pointer: coarse): the primary input is touch
 * @param {boolean} env.fine    - (any-pointer: fine): a mouse/trackpad exists
 * @param {string} [env.userAgent]
 * @param {number} [env.maxTouchPoints]
 * @returns {"tv"|"phone"|"tablet"|"desktop"}
 */
export function classifyDevice({
  width,
  height,
  coarse,
  fine,
  userAgent = "",
  maxTouchPoints = 0,
} = {}) {
  if (TV_UA_PATTERN.test(userAgent) || TV_UA_CASEFUL.test(userAgent)) return "tv";

  const minDim = Math.min(width || 0, height || 0);

  // Phone first. A phone is small in its *shortest* dimension; testing the
  // minimum rather than the width is what makes landscape phones (844x390)
  // classify as phones rather than tablets.
  if (coarse && minDim < 600) return "phone";

  // Tablet: touch-primary, roomier than a phone, and not a hybrid. A Surface
  // Pro has a mouse and a trackpad and wants the desktop layout.
  if (coarse && minDim >= 600 && !fine) return "tablet";

  // iPad with a trackpad reports a fine pointer alongside touch, so the
  // branch above misses it; the UA still identifies it.
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "tablet";

  return "desktop";
}

export function init(app) {
  const html = document.documentElement;

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

  /**
   * Reads the live browser signals and delegates to the shared classifier.
   * The rules live in classifyDevice() so they can be tested directly.
   */
  function detectDevice() {
    const ua = navigator.userAgent || "";
    const maxTouch = navigator.maxTouchPoints || 0;
    state.touchPoints = maxTouch;

    // (pointer: coarse) is the *primary* input. `any-pointer: coarse` would
    // also be true for a hybrid laptop that has a touchscreen, and calling
    // those "has touch" is what previously misclassified them. This is the
    // same query the stylesheet breakpoint uses, so JS and CSS agree.
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches === true;
    const fine = window.matchMedia?.("(any-pointer: fine)")?.matches === true;

    // Hybrid devices (Surface, Yoga, iPad with trackpad...)
    state.input = coarse && fine ? "hybrid" : coarse ? "touch" : "pointer";

    return classifyDevice({
      width: window.innerWidth || screen.width,
      height: window.innerHeight || screen.height,
      coarse,
      fine,
      userAgent: ua,
      maxTouchPoints: maxTouch,
    });
  }

  /**
   * Async refinement via UA-Client-Hints (Chromium) when available.
   *
   * Chromium TVs are the case that matters here: many report a plain desktop
   * UA string, so `formFactor: "TV"` is often the only signal. Because this
   * resolves after init, it must dispatch aura:devicechange — otherwise
   * listeners (notably tvNavigation) never learn the device turned out to be
   * a TV and the app renders the TV layout with no way to operate it.
   */
  async function refineWithClientHints() {
    try {
      if (!navigator.userAgentData?.getHighEntropyValues) return;
      const hints = await navigator.userAgentData.getHighEntropyValues([
        "formFactor",
        "platform",
      ]);
      // `formFactor` is the requested key; `formFactors` (plural) was never
      // requested, so reading it here could only ever be undefined.
      if (hints?.formFactor === "TV") {
        if (state.device === "tv") return;
        refreshDeviceProfile({ forceDevice: "tv", dispatch: true });
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
  function refreshDeviceProfile(opts = {}) {
    apply(detectDevice());
    if (opts.forceDevice) state.device = opts.forceDevice;
    if (opts.dispatch) emitChange();
    return state;
  }

  function emitChange() {
    window.dispatchEvent(new CustomEvent("aura:devicechange", { detail: state }));
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
        emitChange();
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
