const fs = require('fs');

const file = 'C:\\Users\\bharg_4mtuttl\\Desktop\\Google apps\\Maps\\app.js';
let content = fs.readFileSync(file, 'utf8');

// Find the problematic section - code that's at class level but should be in init()
const badCode = `    // Register Service Worker for PWA
    this.registerServiceWorker();

    // Sync unit toggle label
    this.syncUnitLabel();

    // Keep the app consistent across browsers/users.
    // Only explicit share URLs should override the default view.
    setTimeout(() => this.readShareableUrl(), 0

    // Real visible viewport height (mobile browser chrome safe).
    // --app-height is consumed by #map / panel max-height so content is
    // never clipped behind the address bar (the classic 100vh bug).
    this._updateAppHeight();
    window.addEventListener("resize", () => this._updateAppHeight());
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () =>
        this._updateAppHeight(),
      );
      // Handle keyboard appearance/disappearance
      window.visualViewport.addEventListener("resize", () => {
        if (this.$.searchInput === document.activeElement) {
          this.$.searchInput.scrollIntoView({ behavior: "smooth", block: "center" };
        }
      });
    }

    // Load localforage cache first (settings, default location, last session)
    this._loadLocalCache().then(() => {
      this.updateSettingsUIFromLocal();
      this.updateHomeMarker();
      if (this._restoreSession()) {
        this.updateHomeButton();
      }
    });

    // Silent sweep of legacy per-location weather caches (capped to 30d).
    // Keeps localStorage tidy with zero user action.
    this._sweepStaleCache();

    // Initialize Firebase Auth & Firestore
    this.initFirebase();

    // Terms shown only on sign-in or via settings button / corner link
  }

  // Dynamically load feature modules on demand
  async _initFeaturesLazy() {`;

const goodCode = `    // Register Service Worker for PWA
    this.registerServiceWorker();

    // Sync unit toggle label
    this.syncUnitLabel();

    // Keep the app consistent across browsers/users.
    // Only explicit share URLs should override the default view.
    setTimeout(() => this.readShareableUrl(), 0);

    // Real visible viewport height (mobile browser chrome safe).
    // --app-height is consumed by #map / panel max-height so content is
    // never clipped behind the address bar (the classic 100vh bug).
    this._updateAppHeight();
    window.addEventListener("resize", () => this._updateAppHeight());
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () =>
        this._updateAppHeight(),
      );
      // Handle keyboard appearance/disappearance
      window.visualViewport.addEventListener("resize", () => {
        if (this.$.searchInput === document.activeElement) {
          this.$.searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }

    // Load localforage cache first (settings, default location, last session)
    this._loadLocalCache().then(() => {
      this.updateSettingsUIFromLocal();
      this.updateHomeMarker();
      if (this._restoreSession()) {
        this.updateHomeButton();
      }
    });

    // Silent sweep of legacy per-location weather caches (capped to 30d).
    // Keeps localStorage tidy with zero user action.
    this._sweepStaleCache();

    // Initialize Firebase Auth & Firestore
    this.initFirebase();

    // Terms shown only on sign-in or via settings button / corner link
  }

  // Dynamically load feature modules on demand
  async _initFeaturesLazy() {`;

if (content.includes(badCode)) {
  content = content.replace(badCode, goodCode);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Fixed!');
} else {
  console.log('Bad code not found - trying alternative');
  // Try with slight variations
  const altBadCode = content.substring(content.indexOf('    // Register Service Worker for PWA'), content.indexOf('  // Dynamically load feature modules on demand'));
  console.log('Found:', altBadCode.substring(0, 200));
}