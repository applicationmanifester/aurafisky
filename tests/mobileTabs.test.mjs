import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';

describe('Mobile Tabs & Navigation Layout', () => {
  const html = fs.readFileSync('index.html', 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  it('contains #weatherPanelTabs with 5 tab buttons', () => {
    const tabsContainer = doc.getElementById('weatherPanelTabs');
    expect(tabsContainer).not.toBeNull();

    const tabs = tabsContainer.querySelectorAll('.weather-tab-btn');
    expect(tabs.length).toBe(5);

    const tabNames = Array.from(tabs).map((t) => t.dataset.tab);
    expect(tabNames).toEqual(['overview', 'hourly', 'daily', 'metrics', 'astronomy']);
  });

  it('contains 5 matching tabpanels in #weatherPanelContent', () => {
    const content = doc.getElementById('weatherPanelContent');
    expect(content).not.toBeNull();

    const expectedPanels = [
      'weatherTabOverview',
      'weatherTabHourly',
      'weatherTabDaily',
      'weatherTabMetrics',
      'weatherTabAstronomy',
    ];

    expectedPanels.forEach((id) => {
      const panel = doc.getElementById(id);
      expect(panel, `Panel #${id} should exist`).not.toBeNull();
      expect(panel.className).toContain('weather-tab-panel');
      expect(panel.closest('#weatherPanelContent')).not.toBeNull();
    });
  });

  it('contains quick-chip overview buttons that target metrics', () => {
    const quickStats = doc.getElementById('overviewQuickStats');
    expect(quickStats).not.toBeNull();

    const chips = quickStats.querySelectorAll('.quick-chip-btn');
    expect(chips.length).toBe(3);

    chips.forEach((chip) => {
      expect(chip.dataset.targetTab).toBe('metrics');
    });

    expect(doc.getElementById('overviewAQIChip')).not.toBeNull();
    expect(doc.getElementById('overviewWindChip')).not.toBeNull();
    expect(doc.getElementById('overviewHumidityChip')).not.toBeNull();
  });

  it('contains #mobileBottomNav with 5 mobile navigation items', () => {
    const nav = doc.getElementById('mobileBottomNav');
    expect(nav).not.toBeNull();
    expect(nav.className).toContain('sm:hidden');

    const expectedNavBtns = [
      'mobileNavMapBtn',
      'mobileNavWeatherBtn',
      'mobileNavRouteBtn',
      'mobileNavSavedBtn',
      'mobileNavLayersBtn',
    ];

    expectedNavBtns.forEach((btnId) => {
      const btn = doc.getElementById(btnId);
      expect(btn, `Button #${btnId} should exist`).not.toBeNull();
      expect(btn.className).toContain('mobile-nav-btn');
      expect(btn.closest('#mobileBottomNav')).not.toBeNull();
    });
  });

  it('preserves wallpaper multi-city tab container with mobile responsiveness', () => {
    const wpTabs = doc.getElementById('wallpaperTabs');
    expect(wpTabs).not.toBeNull();
    expect(wpTabs.className).toContain('order-3');

    const wpTabContainer = doc.getElementById('wallpaperTabContainer');
    expect(wpTabContainer).not.toBeNull();

    const addBtn = doc.getElementById('wallpaperAddTabBtn');
    expect(addBtn).not.toBeNull();
  });

  it('hides secondary wallpaper actions on small mobile viewports', () => {
    const autoRotate = doc.getElementById('wallpaperAutoRotateBtn');
    const fullscreen = doc.getElementById('wallpaperFullscreenBtn');
    const highContrast = doc.getElementById('wallpaperHighContrastBtn');
    const share = doc.getElementById('wallpaperShareBtn');
    const exportBtn = doc.getElementById('wallpaperExportBtn');

    [autoRotate, fullscreen, highContrast, share, exportBtn].forEach((btn) => {
      expect(btn).not.toBeNull();
      expect(btn.className).toMatch(/hidden\s+sm:/);
    });

    const settingsBtn = doc.getElementById('wallpaperSettingsBtn');
    const refreshBtn = doc.getElementById('wallpaperRefreshBtn');
    const closeBtn = doc.getElementById('wallpaperCloseBtn');

    [settingsBtn, refreshBtn, closeBtn].forEach((btn) => {
      expect(btn).not.toBeNull();
      expect(btn.className).not.toMatch(/hidden\s+sm:/);
    });
  });

  it('defines mobile bottom safe-area anchoring for routePanel, bookmarksDropdown, and nav in styles.css', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('#routePanel {');
    expect(css).toContain('#bookmarksDropdown {');
    expect(css).toContain('#mobileBottomNav {');
    expect(css).toContain('safe-area-inset-bottom');
  });

  it('defines minimum 44px touch targets for mobile panel action buttons in styles.css', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('min-width: 44px;');
    expect(css).toContain('min-height: 44px;');
    expect(css).toContain('#favoriteToggleBtn');
    expect(css).toContain('#shareWeatherBtn');
    expect(css).toContain('#setWallpaperBtn');
    expect(css).toContain('#navigateHereBtn');
    expect(css).toContain('#compareCloseBtn');
    expect(css).toContain('#navCancelPreviewBtn');
  });

  it('hides timelineBar when full-height mobile panels are open', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('.weather-panel.open:not(.minimized) ~ #timelineBar');
    expect(css).toContain('#comparePanel.open ~ #timelineBar');
    expect(css).toContain('pointer-events: none !important;');
  });

  it('styles mobile drag handle with active touch interaction feedback', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('#panelDragHandle {');
    expect(css).toContain('#panelDragHandle:active > div');
  });

  it('hides zoomControls when full-height weather or compare panels are open on mobile', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('.weather-panel.open:not(.minimized) ~ #zoomControls');
    expect(css).toContain('#comparePanel.open ~ #zoomControls');
    expect(css).toContain('pointer-events: none !important;');
  });

  it('styles weather tabs with compact mobile sizing and touch scrolling', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('.weather-tab-btn {');
    expect(css).toContain('#weatherPanelTabs {');
    expect(css).toContain('-webkit-overflow-scrolling: touch;');
  });

  it('compacts on-map weather marker bubble when mobile bottom sheet is open', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('.weather-panel.open:not(.minimized) ~ #map .weather-marker');
    expect(css).toContain('body.weather-panel-expanded .weather-marker');
    expect(css).toContain('border-radius: 9999px !important;');
  });

  it('ensures weather panel header controls meet 44px minimum touch targets', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('#panelMinimizeBtn');
    expect(css).toContain('#panelCloseBtn');
  });

  it('syncs mobile navigation state and dismisses virtual keyboard on search selection in app.js', () => {
    const appCode = fs.readFileSync('app.js', 'utf-8');
    expect(appCode).toContain('syncMobileBottomNavState()');
    expect(appCode).toContain('this.$.searchInput.blur()');
  });

  it('styles settings panel and share modal as mobile bottom sheets in styles.css', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('#settingsPanel > div:nth-child(2) {');
    expect(css).toContain('#shareModal {');
    expect(css).toContain('align-items: flex-end !important;');
    expect(css).toContain('border-radius: 1.5rem 1.5rem 0 0 !important;');
  });

  it('provides dedicated touch-action and thumb sizing for mobile timeline slider in styles.css', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('#timelineSlider {');
    expect(css).toContain('touch-action: pan-x !important;');
  });

  it('includes PWA install button in index.html for settings and mobile integration', () => {
    const installBtn = doc.getElementById('installBtn');
    expect(installBtn).not.toBeNull();
    const installLabel = doc.getElementById('installBtnLabel');
    expect(installLabel).not.toBeNull();
  });

  it('throttles weather particle canvas loop during mobile map drag in features/canvasEffects.js', () => {
    const effectsCode = fs.readFileSync('features/canvasEffects.js', 'utf-8');
    // Asserts the behaviour, not a literal expression. This test used to
    // require the exact source string 'window.innerWidth < 640', which meant
    // it failed on any refactor while still passing if the rule sat in the
    // wrong branch. The throttle is what matters: mobile layout AND dragging.
    expect(effectsCode).toMatch(/isMobileLayout\(\)\s*&&\s*this\._mapWasDragged/);
  });

  it('renders mobile pwaInstallBanner and wires up install and close triggers', () => {
    const banner = doc.getElementById('pwaInstallBanner');
    expect(banner).not.toBeNull();
    expect(banner.className).toContain('sm:hidden');

    const bannerBtn = doc.getElementById('pwaInstallBannerBtn');
    expect(bannerBtn).not.toBeNull();
    const closeBtn = doc.getElementById('pwaInstallBannerCloseBtn');
    expect(closeBtn).not.toBeNull();

    const appCode = fs.readFileSync('app.js', 'utf-8');
    expect(appCode).toContain('pwaInstallBannerBtn?.addEventListener');
    expect(appCode).toContain('pwaInstallBannerCloseBtn?.addEventListener');
  });

  it('contains floating mobileLocationFab GPS button in index.html', () => {
    const fab = doc.getElementById('mobileLocationFab');
    expect(fab).not.toBeNull();
    expect(fab.className).toContain('sm:hidden');
    expect(fab.getAttribute('aria-label')).toBe('Find my location');
  });

  it('renders high-visibility location pin with ground beacon pulse in app.js and styles.css', () => {
    const appCode = fs.readFileSync('app.js', 'utf-8');
    expect(appCode).toContain('aurafisky-location-pin');
    expect(appCode).toContain('pin-stem');
    expect(appCode).toContain('pin-ground-anchor');
    expect(appCode).toContain('pin-ground-pulse');
    expect(appCode).toContain('pin-ground-dot');

    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('.aurafisky-location-pin');
    expect(css).toContain('.pin-stem');
    expect(css).toContain('.pin-ground-anchor');
    expect(css).toContain('.pin-ground-pulse');
  });

  it('styles bookmarksDropdown, mapLayersFlyout, and routePanel as mobile bottom sheets in styles.css', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('#bookmarksDropdown {');
    expect(css).toContain('#mapLayersFlyout {');
    expect(css).toContain('#routePanel {');
    expect(css).toContain('#routeStudioHud {');
  });

  it('resets inline opacity and pointerEvents in showWeatherPanel so closed panel can always reopen', () => {
    const appCode = fs.readFileSync('app.js', 'utf-8');
    expect(appCode).toContain('this.$.weatherPanel.style.opacity = ""');
    expect(appCode).toContain('this.$.weatherPanel.style.pointerEvents = ""');
    expect(appCode).toContain('restorePill.classList.add("hidden")');
  });

  it('compacts mobile zoom controls and ensures quick chips touch scrolling in styles.css', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('#zoomControls {');
    expect(css).toContain('width: 2.25rem !important;');
    expect(css).toContain('height: 2.25rem !important;');
    expect(css).toContain('#mobileQuickChips {');
    expect(css).toContain('white-space: nowrap !important;');
  });

  it('completely overlaps mobile screen when location is selected and weather card is open', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('.weather-panel.open:not(.minimized):not(.sheet-peek)');
    expect(css).toContain('height: 100dvh !important;');
    expect(css).toContain('z-index: 1200 !important;');
    expect(css).toContain('border-radius: 0 !important;');

    const mobileJs = fs.existsSync('features/auraMapsMobile.js')
      ? fs.readFileSync('features/auraMapsMobile.js', 'utf-8')
      : fs.readFileSync('features/googleMapsMobile.js', 'utf-8');
    expect(mobileJs).toContain("this.snapSheet('full');");

    const appJs = fs.readFileSync('app.js', 'utf-8');
    expect(appJs).toContain("this.$.weatherPanel.classList.add(\"open\", \"sheet-full\"");
    expect(appJs).toContain("this.$.weatherPanel.style.height = '100dvh'");
  });

  it('ensures sheet-full overrides peek/minimized styles and header click expands sheet on mobile', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('.weather-panel.open.google-maps-sheet.sheet-peek:not(.sheet-full)');
    expect(css).toContain('.weather-panel.open.google-maps-sheet.minimized:not(.sheet-full)');

    const mobileJs = fs.existsSync('features/auraMapsMobile.js')
      ? fs.readFileSync('features/auraMapsMobile.js', 'utf-8')
      : fs.readFileSync('features/googleMapsMobile.js', 'utf-8');
    expect(mobileJs).toContain("weatherPanelHeader");
    expect(mobileJs).toContain("panel.classList.add('sheet-full');");
    expect(mobileJs).toContain("panel.classList.remove('minimized', 'sheet-peek', 'sheet-half');");

    const appJs = fs.readFileSync('app.js', 'utf-8');
    expect(appJs).toContain("this.googleMapsMobile.snapSheet('full')");
    expect(appJs).toContain("this.googleMapsMobile.snapSheet('peek')");
  });

  it('redesigns marker close button with compact 20px sizing, dedicated flex placement, and touch protection', () => {
    const appJs = fs.readFileSync('app.js', 'utf-8');
    expect(appJs).toContain('weather-marker-icon');
    expect(appJs).toContain('weather-marker-info');
    expect(appJs).toContain('weather-marker-temp');
    expect(appJs).toContain('weather-marker-city');
    expect(appJs).toContain('marker-close-btn');
    expect(appJs).toContain('marker-close-svg');

    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('.marker-close-btn');
    expect(css).toContain('width: 20px !important;');
    expect(css).toContain('height: 20px !important;');
    expect(css).toContain('button:not(.marker-close-btn)');
    expect(css).toContain('.marker-close-btn::before');
  });

  it('keeps search dropdown and right map controls fully responsive from bottom on mobile', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    // Search dropdown responsiveness
    expect(css).toContain('#searchResults {');
    expect(css).toContain('flex-direction: column !important;');
    expect(css).toContain('top: calc(100% + 8px) !important;');
    expect(css).toContain('overflow-y: auto !important;');

    // Right map controls responsiveness from bottom
    expect(css).toContain('bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px)) !important;');
    expect(css).toContain('body:has(#searchInput:focus) #mobileMapControls');
  });

  it('implements smart hybrid auto-location on mobile startup', () => {
    const appJs = fs.readFileSync('app.js', 'utf-8');
    const myLocationJs = fs.readFileSync('features/myLocation.js', 'utf-8');

    // myLocation options support
    expect(myLocationJs).toContain('function getMyLocation(options = {})');
    expect(myLocationJs).toContain('const { silent = false, onFail = null } = options;');

    // Smart hybrid startup check in app.js
    expect(appJs).toContain('const isMobile = isMobileLayout();');
    expect(appJs).toContain('permissionState === "granted"');
    expect(appJs).toContain('this.getMyLocation({');
    expect(appJs).toContain('silent: true');
  });
});


