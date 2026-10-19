import { describe, it, expect, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import { init } from '../features/bookmarks.js';

describe('Bookmarks UI and Delete Icon', () => {
  it('renders a valid SVG trash icon inside bookmark-remove-btn in the SVG namespace', () => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body>
      <div id="bookmarksDropdown"></div>
      <div id="bookmarksList"></div>
    </body></html>`);

    global.document = dom.window.document;
    global.window = dom.window;

    const mockApp = {
      $: {
        bookmarksDropdown: dom.window.document.getElementById('bookmarksDropdown'),
        bookmarksList: dom.window.document.getElementById('bookmarksList'),
      },
      bookmarks: [
        { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 }
      ],
      saveBookmarks: vi.fn(),
      selectLocation: vi.fn(),
      compareWeatherWithActive: vi.fn(),
    };

    init(mockApp);
    const saveBookmarksSpy = vi.spyOn(mockApp, 'saveBookmarks').mockImplementation(() => {});
    mockApp.renderBookmarksList();

    const removeBtn = mockApp.$.bookmarksList.querySelector('.bookmark-remove-btn');
    expect(removeBtn).not.toBeNull();
    expect(removeBtn.getAttribute('title')).toBe('Delete bookmark');
    expect(removeBtn.getAttribute('aria-label')).toBe('Delete bookmark');

    const svg = removeBtn.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');

    const path = svg.querySelector('path');
    expect(path).not.toBeNull();
    expect(path.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(path.getAttribute('d')).toContain('M19 7');

    // Clicking removeBtn deletes bookmark and calls saveBookmarks
    removeBtn.click();
    expect(mockApp.bookmarks.length).toBe(0);
    expect(saveBookmarksSpy).toHaveBeenCalled();
  });

  it('contains CSS rules in styles.css for .bookmark-remove-btn and .bookmark-remove-btn svg', () => {
    const css = fs.readFileSync('styles.css', 'utf-8');
    expect(css).toContain('.bookmark-remove-btn {');
    expect(css).toContain('.bookmark-remove-btn svg {');
    expect(css).toContain('stroke: currentColor !important;');
  });

  it('contains exactly one star icon in favoriteToggleBtn without any secondary ghost star', () => {
    const html = fs.readFileSync('index.html', 'utf-8');
    const dom = new JSDOM(html);
    const favBtn = dom.window.document.getElementById('favoriteToggleBtn');
    expect(favBtn).not.toBeNull();

    // Must only have 1 SVG child — no dual stars side-by-side
    const svgs = favBtn.querySelectorAll('svg');
    expect(svgs.length).toBe(1);

    const starIcon = favBtn.querySelector('#favoriteStarIcon');
    expect(starIcon).not.toBeNull();
    expect(starIcon.querySelector('polygon')).not.toBeNull();
  });
});
