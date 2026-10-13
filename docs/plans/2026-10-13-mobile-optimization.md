# Mobile Experience & Performance Implementation Plan

> **For Claude / Antigravity:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Aurafisky into an intuitive, ultra-fast, single-thumb-navigable mobile weather map experience with native-feeling gestures, zero keyboard friction, compact map overlays, responsive bottom sheets, and verified offline PWA performance on iOS and Android.

**Architecture:** Bottom-sheet drawer state machine coordinated with OpenLayers viewport, CSS-driven dynamic viewports using modern `dvh` and `env(safe-area-inset-*)`, non-destructive touch gesture disambiguation, synchronized bottom tab navigation bar, and accessible touch targets (≥ 44×44px).

**Tech Stack:** Vanilla JS (ES Modules), OpenLayers, OpenFreeMap, Tailwind CSS, Vite, Vitest, Workbox PWA.

---

## Completed Foundations (v13.0.0 Baseline)
- [x] `#mobileBottomNav` with 5 navigation destinations (`Map`, `Weather`, `Route`, `Saved`, `Layers`).
- [x] Segmented 5-tab weather bottom sheet (`overview`, `hourly`, `daily`, `metrics`, `astronomy`) with touch swipe gestures.
- [x] Auto-hiding floating map controls (`#zoomControls`, `#timelineBar`) when bottom sheet is expanded.
- [x] Virtual keyboard auto-dismissal (`this.$.searchInput.blur()`) on selection and map canvas tap.
- [x] Consolidated touch gestures: pull-down snaps to minimize peek mode instead of destructive card close.
- [x] Compact pill marker mode (`⛅ 28°C`) on map when bottom sheet is active.
- [x] Bottom navigation tab indicator synchronization (`syncMobileBottomNavState()`).
- [x] 185 vitest unit and layout tests passing.

---

## Phase 1: Mobile Modal to Bottom Sheet Conversions

### Task 1.1: Settings Drawer Mobile Bottom Sheet Styling
**Goal:** On mobile screens (< 640px), ensure the Settings drawer slides up as an interactive bottom sheet rather than covering the whole screen as an awkward sidebar.

**Files:**
- Modify: `styles.css`
- Modify: `tests/mobileTabs.test.mjs`

**Step 1: Write the failing test**
In `tests/mobileTabs.test.mjs`:
```javascript
it('styles settings panel as a bottom sheet with safe-area anchoring on mobile', () => {
  const css = fs.readFileSync('styles.css', 'utf-8');
  expect(css).toContain('#settingsDrawer {');
  expect(css).toContain('max-height: calc(85vh - env(safe-area-inset-bottom, 0px))');
});
```

**Step 2: Run test to verify it fails**
Run: `npx vitest run tests/mobileTabs.test.mjs`
Expected: FAIL (assertion not matched yet)

**Step 3: Write minimal implementation**
In `styles.css`:
```css
@media (max-width: 639px) {
  #settingsDrawer {
    position: fixed !important;
    top: auto !important;
    bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px)) !important;
    left: 0 !important;
    right: 0 !important;
    width: 100% !important;
    max-height: calc(85vh - env(safe-area-inset-bottom, 0px)) !important;
    border-radius: 1.5rem 1.5rem 0 0 !important;
    transform: translateY(110%);
    transition: transform 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  }
  #settingsDrawer.open {
    transform: translateY(0);
  }
}
```

**Step 4: Run test to verify it passes**
Run: `npx vitest run tests/mobileTabs.test.mjs`
Expected: PASS

**Step 5: Commit**
```bash
git add styles.css tests/mobileTabs.test.mjs
git commit -m "feat(mobile): adapt settings drawer to bottom sheet on mobile"
```

---

### Task 1.2: Share Card Mobile Sheet & Native Web Share Integration
**Goal:** Adapt the weather share preview modal into a bottom sheet on mobile and prioritize `navigator.share` for native iOS/Android sharing sheets.

**Files:**
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `tests/mobileTabs.test.mjs`

**Step 1: Write the failing test**
In `tests/mobileTabs.test.mjs`:
```javascript
it('adapts share card modal for mobile bottom sheet display', () => {
  const css = fs.readFileSync('styles.css', 'utf-8');
  expect(css).toContain('#shareCardModal {');
  expect(css).toContain('border-radius: 1.5rem 1.5rem 0 0');
});
```

**Step 2: Run test to verify it fails**
Run: `npx vitest run tests/mobileTabs.test.mjs`
Expected: FAIL

**Step 3: Write minimal implementation**
In `styles.css`:
```css
@media (max-width: 639px) {
  #shareCardModal .glass-panel,
  #shareCardModal > div > div {
    border-radius: 1.5rem 1.5rem 0 0 !important;
    max-height: calc(90vh - env(safe-area-inset-bottom, 0px));
    width: 100% !important;
    margin: 0 !important;
  }
}
```
In `app.js` share handler:
Check `navigator.share` availability first with fallback to image generation modal:
```javascript
if (navigator.share && window.innerWidth < 640) {
  try {
    await navigator.share({
      title: `${this.selectedName} Weather · Aurafisky`,
      text: `Current weather in ${this.selectedName}: ${temp} ${desc}`,
      url: window.location.href,
    });
    return;
  } catch (err) {
    if (err.name !== 'AbortError') this.openShareModal();
  }
}
```

**Step 4: Run test to verify it passes**
Run: `npx vitest run tests/mobileTabs.test.mjs`
Expected: PASS

**Step 5: Commit**
```bash
git add app.js styles.css tests/mobileTabs.test.mjs
git commit -m "feat(mobile): integrate native Web Share and mobile bottom sheet for share card"
```

---

## Phase 2: Touch Precision & Interaction Polish

### Task 2.1: Timeline Slider Touch Enclosure & Floating Value Bubble
**Goal:** On mobile devices, the 24-hour climate slider can be hard to drag with a thumb without accidentally panning the map underneath. Provide a larger touch hit area (minimum 48px height) and touch-action isolation.

**Files:**
- Modify: `styles.css`
- Modify: `tests/mobileTabs.test.mjs`

**Step 1: Write the failing test**
In `tests/mobileTabs.test.mjs`:
```javascript
it('enforces touch manipulation and minimum 48px hit area for timeline slider on mobile', () => {
  const css = fs.readFileSync('styles.css', 'utf-8');
  expect(css).toContain('#timelineSlider {');
  expect(css).toContain('touch-action: pan-x;');
});
```

**Step 2: Run test to verify it fails**
Run: `npx vitest run tests/mobileTabs.test.mjs`
Expected: FAIL

**Step 3: Write minimal implementation**
In `styles.css`:
```css
@media (max-width: 639px) {
  #timelineSlider {
    touch-action: pan-x !important;
    height: 36px !important;
  }
  #timelineSlider::-webkit-slider-thumb {
    width: 28px !important;
    height: 28px !important;
  }
}
```

**Step 4: Run test to verify it passes**
Run: `npx vitest run tests/mobileTabs.test.mjs`
Expected: PASS

**Step 5: Commit**
```bash
git add styles.css tests/mobileTabs.test.mjs
git commit -m "feat(mobile): optimize timeline slider touch hit area and thumb size"
```

---

### Task 2.2: Double-Tap Zoom Disambiguation & Pinch Velocity
**Goal:** Prevent accidental mobile browser viewport zoom while preserving OpenLayers pinch-to-zoom map gestures, preventing disorientation.

**Files:**
- Modify: `styles.css`
- Modify: `tests/mobileTabs.test.mjs`

**Step 1: Write the failing test**
In `tests/mobileTabs.test.mjs`:
```javascript
it('disables unwanted double-tap zoom on interactive buttons and controls', () => {
  const css = fs.readFileSync('styles.css', 'utf-8');
  expect(css).toContain('touch-action: manipulation;');
});
```

**Step 2: Run test to verify it fails**
Run: `npx vitest run tests/mobileTabs.test.mjs`
Expected: PASS / Verify coverage

**Step 3: Verification & Minimal refinement**
Ensure all buttons, chips, and tabs have `touch-action: manipulation` across mobile viewports.

**Step 4: Commit**
```bash
git commit -m "chore(mobile): ensure touch-action manipulation across all interactive controls"
```

---

## Phase 3: PWA & Performance Optimization

### Task 3.1: PWA Install Prompt Banner
**Goal:** Implement a non-intrusive, native-feeling PWA install banner that appears after a user explores weather in at least 2 locations, giving iOS and Android users an easy 1-tap "Add to Home Screen" experience.

**Files:**
- Modify: `app.js`
- Modify: `index.html`
- Modify: `styles.css`
- Test: `tests/mobileTabs.test.mjs`

**Step 1: Write test for install banner element**
Verify `#pwaInstallBanner` exists in DOM and is hidden initially.

**Step 2: Implement `beforeinstallprompt` capture**
In `app.js`:
Capture event, show banner only after positive interaction, allow user to dismiss and store preference in `localStorage`.

**Step 3: Verify tests and run build**
`npx vitest run` & `npm run build`

**Step 4: Commit**
```bash
git commit -m "feat(pwa): add smooth non-intrusive install prompt banner"
```

---

### Task 3.2: OpenLayers Mobile Memory & Rendering Throttling
**Goal:** On mobile devices, excessive canvas particle effects (rain, snow, storm) during map panning can cause frame drops and battery drain. Throttle animation loops while `this._mapWasDragged` is active.

**Files:**
- Modify: `app.js`
- Modify: `tests/modules.test.ts`

**Step 1: Verify particle animation throttling on touch pan**
In `app.js`: pause/throttle canvas particle tick when user is actively dragging the map on touch devices (`window.innerWidth < 640`).

**Step 2: Run vitest**
Run: `npx vitest run`
Expected: PASS

**Step 3: Commit**
```bash
git commit -m "perf(mobile): throttle particle canvas during mobile map drag"
```

---

## Phase 4: Production Verification & Deployment

### Task 4.1: End-to-End Mobile Test Run
1. Run full Vitest suite: `npx vitest run`
2. Run production build: `npm run build`
3. Inspect bundle size and ensure service worker precache manifest is properly generated.

### Task 4.2: Firebase Hosting Deployment
1. Deploy to live hosting: `firebase deploy --only hosting`
2. Verify live site on `https://aurafisky.web.app/` using mobile viewport emulation.
