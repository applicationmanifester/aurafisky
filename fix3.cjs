const fs = require('fs');
const file = 'C:\\Users\\bharg_4mtuttl\\Desktop\\Google apps\\Maps\\app.js';
let content = fs.readFileSync(file, 'utf8');

// Find the exact position of the floating code
const floatingStart = content.indexOf('    // Register Service Worker for PWA');
const floatingEnd = content.indexOf('  }\n\n  // Set --app-height to the true visible viewport height');

if (floatingStart === -1 || floatingEnd === -1) {
  console.log('Could not find floating code boundaries');
  process.exit(1);
}

console.log('Found floating code at:', floatingStart, 'to', floatingEnd);
console.log('Length:', floatingEnd - floatingStart);

// Extract the floating code
const floatingCode = content.substring(floatingStart, floatingEnd);
console.log('Floating code length:', floatingCode.length);

// Remove the floating code
content = content.substring(0, floatingStart) + content.substring(floatingEnd);

// Find where to insert - right before the closing brace of init()
const initEndMarker = 'this._initFeaturesLazy();\n  }';
const insertPos = content.indexOf(initEndMarker);

if (insertPos === -1) {
  console.log('Could not find init end marker');
  process.exit(1);
}

console.log('Insert position:', insertPos);

// Create the code to insert (with proper indentation for inside init())
const codeToInsert = `
    // Register Service Worker for PWA
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
`;

const beforeInsert = content.substring(0, insertPos + initEndMarker.length);
const afterInsert = content.substring(insertPos + initEndMarker.length);
content = beforeInsert + codeToInsert + afterInsert;

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed!');