/**
 * Viewport Height — critical, must run before first paint.
 * Loaded as a plain classic <script> (not type="module", which defers) so it
 * blocks parsing and sets --app-height before any layout depending on it
 * paints. Kept out of the CSP 'unsafe-inline' allowance for script-src by
 * living here as an external file instead of an inline <script> block.
 */
(function () {
  function setAppHeight() {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', h + 'px');
  }
  setAppHeight();
  window.addEventListener('resize', setAppHeight);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight);
    window.visualViewport.addEventListener('scroll', setAppHeight);
  }
})();
