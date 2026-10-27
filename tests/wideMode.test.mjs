import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';

describe('Dedicated Full-Screen / Wide Mode Feature', () => {
  const html = fs.readFileSync('index.html', 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const css = fs.readFileSync('styles.css', 'utf-8');
  const appJs = fs.readFileSync('app.js', 'utf-8');
  const shortcutsJs = fs.readFileSync('features/keyboardShortcuts.js', 'utf-8');
  const mobileJs = fs.readFileSync('features/auraMapsMobile.js', 'utf-8');

  it('contains #panelExpandWideBtn in weather panel window controls', () => {
    const wideBtn = doc.getElementById('panelExpandWideBtn');
    expect(wideBtn).not.toBeNull();
    expect(wideBtn.getAttribute('aria-label')).toBe('Toggle wide mode');
    expect(wideBtn.getAttribute('aria-pressed')).toBe('false');
    expect(wideBtn.getAttribute('title')).toContain('Wide / Full-Screen mode');

    // Both expand and compress icons exist
    const expandIcon = doc.getElementById('panelExpandWideIcon');
    const compressIcon = doc.getElementById('panelCompressWideIcon');
    expect(expandIcon).not.toBeNull();
    expect(compressIcon).not.toBeNull();
    expect(compressIcon.classList.contains('hidden')).toBe(true);

    // Positioned alongside minimize and close buttons
    const minBtn = doc.getElementById('panelMinimizeBtn');
    const closeBtn = doc.getElementById('panelCloseBtn');
    expect(wideBtn.parentElement).toBe(minBtn.parentElement);
    expect(wideBtn.parentElement).toBe(closeBtn.parentElement);
  });

  it('defines 44px minimum touch target for #panelExpandWideBtn in styles.css', () => {
    expect(css).toContain('#panelExpandWideBtn,');
    expect(css).toContain('min-width: 44px;');
  });

  it('defines desktop wide mode rules in styles.css with 2-column layout and 7-day panoramic grid', () => {
    expect(css).toContain('#weatherPanel.wide-mode');
    expect(css).toContain('width: 780px !important;');
    expect(css).toContain('#weatherPanel.wide-mode #weatherTabOverview');
    expect(css).toContain('grid-template-columns: minmax(320px, 1fr) minmax(320px, 1fr);');
    expect(css).toContain('#weatherPanel.wide-mode #metricsGrid');
    expect(css).toContain('#weatherPanel.wide-mode #dailyForecast .daily-forecast-horizontal');
    expect(css).toContain('grid-template-columns: repeat(7, minmax(0, 1fr)) !important;');
  });

  it('handles wide mode toggle, UI state sync, and localStorage in app.js', () => {
    expect(appJs).toContain('panelExpandWideBtn: document.getElementById("panelExpandWideBtn")');
    expect(appJs).toContain('panelExpandWideIcon: document.getElementById("panelExpandWideIcon")');
    expect(appJs).toContain('panelCompressWideIcon: document.getElementById("panelCompressWideIcon")');
    expect(appJs).toContain('toggleWideWeatherPanel(');
    expect(appJs).toContain('updateWideButtonState(');
    expect(appJs).toContain('localStorage.setItem("aurafisky_weather_wide"');
    expect(appJs).toContain('localStorage.getItem("aurafisky_weather_wide")');
  });

  it('binds "f" and "Shift+W" shortcuts, and restores compact mode on Escape in keyboardShortcuts.js', () => {
    expect(shortcutsJs).toContain('case "f":');
    expect(shortcutsJs).toContain('this.toggleWideWeatherPanel?.()');
    expect(shortcutsJs).toContain('case "w":');
    expect(shortcutsJs).toContain('this.$.weatherPanel.classList.contains("wide-mode")');
  });

  it('wires up expandWideBtn and syncs state with mobile bottom sheet in auraMapsMobile.js', () => {
    expect(mobileJs).toContain("document.getElementById('panelExpandWideBtn')");
    expect(mobileJs).toContain('this.app?.updateWideButtonState?.(false)');
    expect(mobileJs).toContain('this.app?.updateWideButtonState?.(true)');
  });
});
