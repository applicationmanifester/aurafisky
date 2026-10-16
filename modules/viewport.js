// modules/viewport.js
// ── True visible-viewport height ────────────────────────────────────
//
// Why this exists:
// Mobile browsers report `100vh` as the height of the viewport with the
// *toolbar hidden*. On iOS Safari the address bar is ~90px tall and collapses
// on scroll, so any layout sized in `vh` is either clipped behind the chrome or
// leaves a dead gap at the bottom. Ten rules across styles.css /
// device-adaptive.css / aura-polish.css are written as
// `var(--app-height, 100vh)` expecting this module to supply the real number.
//
// It previously did not: `_updateAppHeight()` was defined in app.js and never
// called, so every one of those rules silently fell back to `100vh` and the
// iOS bug was never actually fixed.
//
// Exported as a module (rather than an app method) so it can be unit tested and
// reused, and so the CSS variable is live before first paint.

/** Writes both custom properties the stylesheets read. */
export function applyViewportHeight(doc = document) {
  const vv = doc.defaultView?.visualViewport;
  const height = vv?.height ?? doc.defaultView?.innerHeight ?? 0;
  if (!height) return null;
  const root = doc.documentElement;
  root.style.setProperty('--app-height', `${height}px`);
  root.style.setProperty('--visual-viewport-height', `${height}px`);
  return height;
}

/**
 * Keeps --app-height tracking the visible viewport, and tells the map to
 * re-measure when it changes.
 *
 * OpenLayers caches the container size it measured, so a height change it
 * doesn't hear about leaves tiles painted across only part of the map.
 *
 * @param {object} opts
 * @param {() => void} [opts.onResize] - called after each change (map.updateSize)
 * @param {Document} [opts.doc]
 * @returns {() => void} teardown
 */
export function watchViewport({ onResize, doc = document } = {}) {
  const win = doc.defaultView;
  if (!win) return () => {};

  let frame = 0;
  let last = null;

  const commit = () => {
    const next = applyViewportHeight(doc);
    if (next != null && next !== last) {
      last = next;
      onResize?.();
    }
  };

  // Visual viewport is the accurate source: it is the part of the layout
  // viewport actually visible after browser chrome, pinch-zoom and so on.
  // window.innerHeight is the fallback for browsers without it.
  const schedule = () => {
    if (frame) return;
    frame = win.requestAnimationFrame(() => {
      frame = 0;
      commit();
    });
  };

  const vv = win.visualViewport;
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', schedule);

  commit();

  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    vv?.removeEventListener('resize', schedule);
    vv?.removeEventListener('scroll', schedule);
    win.removeEventListener('resize', schedule);
    win.removeEventListener('orientationchange', schedule);
  };
}