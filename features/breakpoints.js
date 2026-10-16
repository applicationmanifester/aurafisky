// features/breakpoints.js
// Single source of truth for the "does this get the mobile layout?" decision.
//
// JS and CSS must agree on this or the app tears itself apart: a width-only
// `innerWidth < 640` check in JS while CSS uses a different query means the
// sheet can be built for a phone layout that the stylesheet never renders.
//
// The rule matches styles.css exactly:
//
//   (max-width: 639px), (max-height: 500px) and (pointer: coarse)
//
// The second clause exists for landscape phones. A rotated iPhone is ~844px
// wide, so any width-only gate classifies it as a desktop — which silently
// removed the bottom nav, the FABs, the map controls, the draggable sheet and
// the 44px touch targets on a device that still needs every one of them.
// Requiring a coarse pointer keeps genuinely short desktop windows (and
// tablets in landscape, which are >=768px tall) on the desktop card.

export const MOBILE_MAX_WIDTH = 640;
export const SHORT_VIEWPORT_MAX_HEIGHT = 500;

/**
 * @param {Window} [win]
 * @returns {boolean}
 */
export function isMobileLayout(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  if (win.innerWidth < MOBILE_MAX_WIDTH) return true;
  // `any-pointer: coarse` is deliberately the query here. `pointer: coarse`
  // describes the *primary* input, which is a mouse on a hybrid laptop — so
  // asking for it would give the opposite answer on the exact class of device
  // this clause exists to serve, and would disagree with the stylesheet.
  return (
    win.innerHeight <= SHORT_VIEWPORT_MAX_HEIGHT &&
    win.matchMedia?.('(any-pointer: coarse)')?.matches === true
  );
}

/**
 * True when the device is a phone or tablet held sideways — short enough that
 * a bottom sheet or a top-docked card behaves badly, but wide enough that a
 * full-width sheet wastes most of the screen.
 */
export function isLandscapePhone(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return false;
  return isMobileLayout(win) && win.innerWidth > win.innerHeight;
}
