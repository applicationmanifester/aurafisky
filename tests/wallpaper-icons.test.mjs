import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';

describe('Weather Panel Header & Wallpaper DOM Layout', () => {
  const html = fs.readFileSync('index.html', 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  it('contains panelLocationName in top row with full width', () => {
    const title = doc.getElementById('panelLocationName');
    expect(title).not.toBeNull();
    expect(title.className).toContain('break-words');
    expect(title.closest('#weatherPanel')).not.toBeNull();
  });

  it('separates window controls from action buttons', () => {
    const actionsRow = doc.getElementById('panelActionsRow');
    expect(actionsRow).not.toBeNull();

    const favBtn = doc.getElementById('favoriteToggleBtn');
    const shareBtn = doc.getElementById('shareWeatherBtn');
    const wpBtn = doc.getElementById('setWallpaperBtn');
    const navBtn = doc.getElementById('navigateHereBtn');
    const minBtn = doc.getElementById('panelMinimizeBtn');
    const closeBtn = doc.getElementById('panelCloseBtn');

    expect(actionsRow.contains(favBtn)).toBe(true);
    expect(actionsRow.contains(shareBtn)).toBe(true);
    expect(actionsRow.contains(wpBtn)).toBe(true);
    expect(actionsRow.contains(navBtn)).toBe(true);

    // Minimize and close are in the top row, NOT squishing with the action buttons
    expect(actionsRow.contains(minBtn)).toBe(false);
    expect(actionsRow.contains(closeBtn)).toBe(false);

    // Each action button expands to fill in space evenly
    expect(favBtn.className).toContain('flex-1');
    expect(shareBtn.className).toContain('flex-1');
    expect(wpBtn.className).toContain('flex-1');
    expect(navBtn.className).toContain('flex-1');
  });

  it('has wallpaper overlay and tab containers', () => {
    const overlay = doc.getElementById('wallpaperOverlay');
    expect(overlay).not.toBeNull();

    const tabContainer = doc.getElementById('wallpaperTabContainer');
    expect(tabContainer).not.toBeNull();

    const locName = doc.getElementById('wallpaperLocationName');
    expect(locName).not.toBeNull();
  });

  it('has dual-layer photo background and scrim', () => {
    const photoBg = doc.getElementById('wallpaperPhotoBg');
    expect(photoBg).not.toBeNull();

    const layerA = doc.getElementById('wallpaperPhotoA');
    const layerB = doc.getElementById('wallpaperPhotoB');
    expect(layerA).not.toBeNull();
    expect(layerB).not.toBeNull();
    expect(layerA.className).toContain('wallpaper-photo-layer');
    expect(layerB.className).toContain('wallpaper-photo-layer');

    const scrim = photoBg.querySelector('.wallpaper-scrim');
    expect(scrim).not.toBeNull();
  });

  it('has dynamic wallpaper backdrop on weatherPanel', () => {
    const panelBg = doc.getElementById('panelWeatherBg');
    expect(panelBg).not.toBeNull();
    expect(panelBg.closest('#weatherPanel')).not.toBeNull();
  });

  it('has sleek add location modal with search and city shortcuts', () => {
    const modal = doc.getElementById('wallpaperAddTabModal');
    expect(modal).not.toBeNull();

    const closeBtn = doc.getElementById('wallpaperAddTabModalClose');
    expect(closeBtn).not.toBeNull();

    const searchInput = doc.getElementById('wallpaperTabSearchInput');
    expect(searchInput).not.toBeNull();

    const popularCities = doc.getElementById('wallpaperPopularCities');
    expect(popularCities).not.toBeNull();
    const chips = popularCities.querySelectorAll('.popular-city-chip');
    expect(chips.length).toBeGreaterThanOrEqual(5);
  });
});
