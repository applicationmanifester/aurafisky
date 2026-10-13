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
  });
});

