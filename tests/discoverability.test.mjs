// Runs under Vitest
import { test, describe, expect } from "vitest";
import fs from "fs";

const indexHtml = fs.readFileSync("index.html", "utf-8");
const appJs = fs.readFileSync("app.js", "utf-8");
const viteConfig = fs.readFileSync("vite.config.js", "utf-8");
const firebaseJson = JSON.parse(fs.readFileSync("firebase.json", "utf-8"));
const publicManifest = JSON.parse(fs.readFileSync("public/manifest.json", "utf-8"));
const rootManifest = JSON.parse(fs.readFileSync("manifest.json", "utf-8"));
const robotsTxt = fs.readFileSync("public/robots.txt", "utf-8");
const sitemapXml = fs.readFileSync("public/sitemap.xml", "utf-8");
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));

describe("Web app manifest", () => {
  test("the manifest that ships is valid JSON with the app's brand colour", () => {
    // public/manifest.json is copied verbatim into dist/, so it is the copy
    // browsers actually read — the one that has to be right.
    expect(publicManifest.theme_color).toBe("#14b8a6");
    expect(publicManifest.background_color).toBe("#0f172a");
    expect(publicManifest.short_name).toBe("Aurafisky");
  });

  test("the manifest matches the <meta name=theme-color> tags", () => {
    const meta = /<meta name="theme-color" content="(#[0-9a-f]{6})"/.exec(indexHtml);
    expect(meta).not.toBeNull();
    expect(publicManifest.theme_color).toBe(meta[1]);
  });

  test("the two manifests in the repository agree", () => {
    // One source of truth: a drifting copy is how the app ended up
    // shipping a manifest that advertised shortcuts the app cannot open.
    expect(rootManifest).toEqual(publicManifest);
  });

  test("supports every display mode and both orientations", () => {
    expect(publicManifest.display).toBe("standalone");
    expect(publicManifest.display_override).toContain("standalone");
    expect(publicManifest.display_override).toContain("browser");
    // The map works in landscape; a portrait-only lock letterboxes it.
    expect(publicManifest.orientation).toBe("any");
  });

  test("declares the web share target so a place can be shared into the app", () => {
    expect(publicManifest.share_target).toBeTruthy();
    expect(publicManifest.share_target.action).toBe("/share-target");
    expect(publicManifest.share_target.params).toHaveProperty("url");
    expect(publicManifest.share_target.params).toHaveProperty("text");
  });

  test("every shortcut points at an action the app actually handles", () => {
    const handled = [...appJs.matchAll(/action === "([a-z]+)"/g)].map((m) => m[1]);
    expect(handled.length).toBeGreaterThan(0);
    for (const shortcut of publicManifest.shortcuts) {
      const action = new URL(shortcut.url, "https://aurafisky.web.app").searchParams.get("action");
      expect(action).toBeTruthy();
      expect(handled).toContain(action);
    }
  });

  test("every icon and screenshot the manifest references exists", () => {
    const referenced = [
      ...publicManifest.icons.map((i) => i.src),
      ...(publicManifest.screenshots || []).map((s) => s.src),
      ...publicManifest.shortcuts.flatMap((s) => (s.icons || []).map((i) => i.src)),
    ];
    for (const src of referenced) {
      const path = src.replace(/^\//, "");
      const candidates = [`public/${path}`, path, `dist/${path}`];
      expect(candidates.some((c) => fs.existsSync(c))).toBe(true);
    }
  });

  test("has both maskable and any icons for every platform", () => {
    const purposes = publicManifest.icons.map((i) => i.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
    const sizes = publicManifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  test("ships real screenshots — Chrome only shows its richer install UI with them", () => {
    expect(publicManifest.screenshots.length).toBeGreaterThanOrEqual(2);
    const factors = publicManifest.screenshots.map((s) => s.form_factor);
    expect(factors).toContain("wide");
    expect(factors).toContain("narrow");
  });

  test("does not advertise a widget that was never built", () => {
    // The widgets entry pointed at widgets/template and widgets/data, which
    // do not exist.
    expect(publicManifest.widgets).toBeUndefined();
  });

  test("has no duplicate keys that would silently override each other", () => {
    // A second "screenshots" key at the end of the file wiped the real
    // array — JSON keeps the last one.
    const raw = fs.readFileSync("public/manifest.json", "utf-8");
    const keys = [...raw.matchAll(/^\s{2}"([a-z_]+)":/gm)].map((m) => m[1]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("Structured data", () => {
  test("describes the app for search engines and assistants", () => {
    const blocks = [...indexHtml.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )].map((m) => JSON.parse(m[1]));
    expect(blocks.length).toBeGreaterThanOrEqual(2);

    const app = blocks.find((b) => b["@type"] === "WebApplication");
    expect(app).toBeTruthy();
    expect(app.name).toBe("Aurafisky");
    expect(app.url).toMatch(/^https:\/\//);
    expect(app.applicationCategory).toBe("WeatherApplication");
    expect(app.isAccessibleForFree).toBe(true);
    expect(app.offers.price).toBe("0");
    expect(app.featureList.length).toBeGreaterThan(3);

    const site = blocks.find((b) => b["@type"] === "WebSite");
    expect(site).toBeTruthy();
    expect(site.potentialAction["@type"]).toBe("SearchAction");
  });

  test("the structured data points at screenshots that exist", () => {
    const blocks = [...indexHtml.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )].map((m) => JSON.parse(m[1]));
    const app = blocks.find((b) => b["@type"] === "WebApplication");
    for (const shot of app.screenshot) {
      const path = new URL(shot).pathname.replace(/^\//, "");
      expect(fs.existsSync(`public/${path}`) || fs.existsSync(path)).toBe(true);
    }
  });
});

describe("Deep links", () => {
  test("the app handles every action its shortcuts use", () => {
    expect(appJs).toContain('action === "radar"');
    expect(appJs).toContain('action === "aura"');
    expect(appJs).toContain('action === "briefing"');
    expect(appJs).toContain('action === "locate"');
  });

  test("the search deep link the structured data advertises is handled", () => {
    expect(appJs).toContain('params.get("search")');
    expect(appJs).toContain("this.performSearch?.(searchQuery)");
  });
});

describe("Crawling and indexing", () => {
  test("robots.txt allows the app and points at the sitemap", () => {
    expect(robotsTxt).toContain("User-agent: *");
    expect(robotsTxt).toContain("Allow: /");
    expect(robotsTxt).toContain("Sitemap: https://aurafisky.web.app/sitemap.xml");
  });

  test("the sitemap lists the app's entry points", () => {
    expect(sitemapXml).toContain("<urlset");
    expect(sitemapXml).toContain("<loc>https://aurafisky.web.app/</loc>");
    // The deep links the sitemap lists must be actions the app handles.
    const handled = [...appJs.matchAll(/action === "([a-z]+)"/g)].map((m) => m[1]);
    for (const match of sitemapXml.matchAll(/<loc>[^<]*\?action=([a-z]+)<\/loc>/g)) {
      expect(handled).toContain(match[1]);
    }
  });
});

describe("Hosting", () => {
  test("hashed assets are cached immutably so repeat visits are fast", () => {
    const headers = firebaseJson.hosting.headers;
    const assets = headers.find((h) => h.source === "/assets/**");
    expect(assets).toBeTruthy();
    expect(assets.headers[0].value).toContain("immutable");
  });

  test("the service worker and the app shell are never cached stale", () => {
    const headers = firebaseJson.hosting.headers;
    const sw = headers.find((h) => h.source === "/sw.js");
    expect(sw.headers[0].value).toContain("no-cache");
    const shell = headers.find((h) => h.source === "/index.html");
    expect(shell.headers[0].value).toContain("no-cache");
  });

  test("the manifest screenshots are not precached into every visitor's cache", () => {
    // They are a couple of megabytes and only the install dialog uses them.
    expect(viteConfig).toContain("globIgnores: ['screenshots/**']");
  });
});

describe("Offline and installability", () => {
  test("the service worker is registered without waiting for a load event that has passed", () => {
    // Chrome only offers to install a PWA when a service worker with a fetch
    // handler is registered. Listening for "load" is not enough: init() does
    // asynchronous work and can reach the registration after "load" has
    // already fired, and a listener added then never runs.
    expect(appJs).toContain('document.readyState === "complete"');
    expect(appJs).toContain('window.addEventListener("load", registerWorker, { once: true })');
    expect(appJs).toContain('register("./sw.js", { updateViaCache: "none" })');
  });

  test("the service worker is never cached stale", () => {
    // A stale worker is the #1 cause of "the browser keeps the old version".
    const sw = firebaseJson.hosting.headers.find((h) => h.source === "/sw.js");
    expect(sw.headers[0].value).toContain("no-cache");
  });

  test("the generated service worker precaches the app shell", () => {
    const sw = fs.readFileSync("dist/sw.js", "utf-8");
    expect(sw).toContain("precacheAndRoute");
    // The navigation fallback is what makes the app work offline.
    expect(sw).toContain("index.html");
  });
});

describe("Browser support", () => {
  test("the build targets browsers that can actually run the app", () => {
    // ES2022 syntax locked out Safari 15 and every browser older than
    // Chrome 94 for no reason — the app's newest syntax is ES2020.
    expect(viteConfig).toContain("es2020");
    expect(viteConfig).not.toContain("target: 'es2022'");
  });

  test("the supported browser baseline is written down", () => {
    expect(packageJson.browserslist).toBeTruthy();
    expect(packageJson.browserslist.join(" ")).toContain("safari >= 14");
  });

  test("every dynamic-viewport height has a vh fallback", () => {
    // `dvh` only exists in Chrome 108+ and Safari 15.4+. Without a fallback
    // in front of it, older browsers drop the declaration and the layout
    // collapses.
    for (const file of ["styles.css", "css/aura-polish.css", "css/device-adaptive.css"]) {
      const lines = fs.readFileSync(file, "utf-8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes("dvh")) continue;
        const m = /^\s*([a-zA-Z-]+)\s*:\s*(.+?)\s*(!important)?;\s*$/.exec(line);
        if (!m) continue; // @supports block, not a declaration
        const [, prop, value, important] = m;
        const expected = `${prop}: ${value.split("dvh").join("vh")}${important ? " !important" : ""};`;
        expect((lines[i - 1] || "").trim()).toBe(expected);
      }
    }
  });
});
