import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';

describe('SEO, Discoverability & Accessibility Audit', () => {
  const html = fs.readFileSync('index.html', 'utf-8');
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  it('includes complete SEO, Open Graph, Twitter Card, canonical, and sitemap metadata', () => {
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
    expect(doc.title).toBe('Aurafisky — Live Weather Maps, Radar & Route Forecasts');

    const desc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
    expect(desc).toContain('AQI');
    expect(desc).toContain('marine swell');
    expect(desc).toContain('PWA');

    const keywords = doc.querySelector('meta[name="keywords"]')?.getAttribute('content') || '';
    expect(keywords).toContain('weather map');
    expect(keywords).toContain('live radar');

    const robots = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
    expect(robots).toContain('index, follow');

    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://aurafisky.web.app/');
    expect(doc.querySelector('link[rel="sitemap"]')?.getAttribute('href')).toBe('/sitemap.xml');

    expect(doc.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('website');
    expect(doc.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe('https://aurafisky.web.app/aurafisky-social.png');
    expect(doc.querySelector('meta[property="og:image:width"]')?.getAttribute('content')).toBe('512');
    expect(doc.querySelector('meta[property="og:image:height"]')?.getAttribute('content')).toBe('512');
    expect(doc.querySelector('meta[property="og:locale"]')?.getAttribute('content')).toBe('en_US');

    expect(doc.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image');
    expect(doc.querySelector('meta[name="twitter:site"]')?.getAttribute('content')).toBe('@aurafisky');
    expect(doc.querySelector('meta[name="twitter:image:alt"]')?.getAttribute('content')).toContain('Aurafisky');
  });

  it('embeds valid JSON-LD structured data for WebApplication and WebSite', () => {
    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    expect(scripts.length).toBeGreaterThanOrEqual(2);

    const parsed = scripts.map((s) => JSON.parse(s.textContent));
    const webApp = parsed.find((item) => item['@type'] === 'WebApplication');
    expect(webApp).toBeDefined();
    expect(webApp.applicationCategory).toBe('WeatherApplication');
    expect(webApp.url).toBe('https://aurafisky.web.app/');
    expect(webApp.featureList.join(' ')).toContain('Marine swell');

    const webSite = parsed.find((item) => item['@type'] === 'WebSite');
    expect(webSite).toBeDefined();
    expect(webSite.potentialAction?.target?.urlTemplate).toContain('?search={search_term_string}');
  });

  it('provides valid sitemap.xml, robots.txt, and synced PWA manifest without broken assets', () => {
    const sitemap = fs.readFileSync('public/sitemap.xml', 'utf-8');
    expect(sitemap).toContain('<loc>https://aurafisky.web.app/</loc>');
    expect(sitemap).toContain('<lastmod>2026-11-11</lastmod>');

    const robots = fs.readFileSync('public/robots.txt', 'utf-8');
    expect(robots).toContain('Allow: /');
    expect(robots).toContain('Sitemap: https://aurafisky.web.app/sitemap.xml');

    const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf-8'));
    expect(manifest.share_target?.action).toBe('/share-target');
    expect(manifest.theme_color).toBe('#14b8a6');
    expect(Array.isArray(manifest.screenshots) && manifest.screenshots.length).toBe(2);
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.icons[0].src).toBe('/icon-192.png');
    }
  });

  it('includes skip link target, landmark tabindex, and accessible names on interactive icon buttons', () => {
    const skip = doc.querySelector('a[href="#main-content"]');
    expect(skip).not.toBeNull();
    const main = doc.getElementById('main-content');
    expect(main).not.toBeNull();
    expect(main.getAttribute('tabindex')).toBe('-1');

    for (const id of ['zoomInBtn', 'zoomOutBtn', 'compassBtn', 'confidenceToggle', 'timelineMinimiseBtn', 'locationAddressHeader']) {
      const el = doc.getElementById(id);
      expect(el).not.toBeNull();
      expect((el.getAttribute('aria-label') || '').trim().length).toBeGreaterThan(0);
    }

    const styles = fs.readFileSync('styles.css', 'utf-8');
    const polish = fs.readFileSync('css/aura-polish.css', 'utf-8');
    expect(styles).toMatch(/@media\s*\(prefers-contrast:\s*high\)[\s\S]*:focus-visible/);
    expect(polish).toMatch(/@media\s*\(prefers-contrast:\s*high\)[\s\S]*:focus-visible/);
  });

  it('guards PWA install banner in standalone mode and avoids share-target fallback race in app.js', () => {
    const appCode = fs.readFileSync('app.js', 'utf-8');
    expect(appCode).toContain('window.navigator?.standalone === true');
    expect(appCode).toContain('_hasPendingShareTarget');
    expect(appCode).toContain('this.$.weatherPanel.setAttribute("lang", this.language || "en")');
  });
});

