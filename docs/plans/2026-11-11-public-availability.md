# Making Aurafisky more available and discoverable

> **Goal:** more people can find the app, install it, and use it — in Chrome
> and in every other browser that can run it.

Two separate problems get confused under one word, "available":

- **Discoverable** — can a search engine, an AI assistant, or a person who
  has never heard of the app find it and understand what it is?
- **Available** — when they arrive, does it work? Does it install? Does it
  keep working offline, and does it work in their browser?

## What was already in place

The app already had a solid base: title/description meta tags, Open Graph and
Twitter cards, a canonical URL, a Google site-verification token, a manifest
with icons and shortcuts, a service worker with offline precaching, a
`robots.txt` with a sitemap reference, and an install banner that handles
both Chromium's `beforeinstallprompt` and iOS Safari's manual
"Add to Home Screen".

The gaps were in the details, and several of them were actively working
against the app.

## Discoverability

### Structured data (`index.html`)

The page had no JSON-LD at all. Search engines and AI assistants had to
guess what the page was. Two blocks now describe it:

- `WebApplication` — the name, the free price, the feature list, the
  screenshots, and the languages it speaks.
- `WebSite` with a `SearchAction`, so a search engine can offer a search
  box for the app, and an assistant can send someone straight to a place
  with `?search=`.

The `SearchAction` is only honest because the app now **handles the
`?search=` deep link** it points at (see below).

### A sitemap that says what the app can do

The sitemap listed one URL. It now lists the app and the deep links that
open a specific feature, so a crawler can see the app's capabilities
without having to run it.

### `robots.txt`

Now disallows `/share-target` (a POST-like endpoint that carries nothing
indexable) and points at the sitemap.

## Availability

### The manifest that browsers actually read

There were **three** manifests in the repository, and the one that shipped
was the worst of them:

| File | What it does |
| :--- | :--- |
| `manifest.json` (root) | Not served — dead weight that had already drifted |
| `public/manifest.json` | Copied into `dist/` **after** the plugin wrote its own — so this is the one browsers read |
| `vite.config.js` → `manifest` | Written by `vite-plugin-pwa`, then overwritten by the file above |

The shipped copy had:

- **`theme_color: "#0ea5e9"`** — a different colour from the app's brand
  (`#14b8a6`) and from the `<meta name="theme-color">` tags, so the
  installed app's title bar and splash screen were the wrong colour.
- **`orientation: "portrait-primary"`** — the map works in landscape; a
  portrait lock left tablet and desktop users with a letterboxed app.
- **No `share_target`** — the app's share-target handling existed and
  worked, but the manifest never advertised it, so "Share → Aurafisky" was
  dead in production.
- **Shortcuts pointing at `?search=true`, `?bookmarks=true` and
  `?current=true`** — none of which the app handles. Every shortcut just
  opened the app.
- **A `widgets` entry** pointing at `widgets/template` and `widgets/data`,
  which do not exist.
- **A duplicate `"screenshots": []` key** at the end of the file. JSON keeps
  the last of a repeated key, so this silently wiped the real screenshots
  array.

There is now one source of truth (`public/manifest.json`), the repository
copy matches it, and a test asserts that they agree and that the manifest
has no duplicate keys.

### Shortcuts and deep links that work

The manifest's shortcuts now point at the app's own `?action=` deep links —
`radar`, `locate`, `briefing` and `aura` — and the `locate` action was
**added** to the app, because the shortcut pointed at an action nothing
handled.

A test walks every shortcut in the manifest and asserts the app handles it,
so a shortcut cannot silently rot again.

### Real screenshots

Chrome only shows its richer install UI when the manifest has screenshots.
The screenshots in `public/screenshots/` are **real captures of the running
app**, taken by driving the production build in headless Chrome.

### The service worker was not always registering

This is the important one. Chrome's installability criteria require a
registered service worker with a fetch handler. The app registered the
worker from a `load` event listener:

```js
window.addEventListener("load", () => { navigator.serviceWorker.register(...) });
```

`init()` does asynchronous work, so it can reach that line *after* the
`load` event has already fired — and a listener added then never runs. The
worker was never registered, so Chrome never offered to install the app and
the offline cache never existed.

It now registers immediately when the document is already loaded, and waits
for `load` only when it is not.

(Verified against the production build on a non-localhost secure origin: the
worker registers and takes control. On `localhost` the app deliberately
unregisters the worker instead — that is a development convenience and is
left as it is.)

### Hosting headers

`firebase.json` now says:

| Path | Cache-Control |
| :--- | :--- |
| `/assets/**` (content-hashed) | `public, max-age=31536000, immutable` |
| `/index.html` | `no-cache, no-store, must-revalidate` |
| `/sw.js` | `no-cache, no-store, must-revalidate` |
| `/manifest.json`, `/robots.txt` | `public, max-age=3600` |
| images/fonts | `public, max-age=604800` |

Hashed assets can be cached forever; the app shell and the worker never
are, so a deploy is picked up immediately instead of being held back by a
stale worker.

### Other browsers

The build targeted **ES2022**, which locked out Safari 15 and every browser
older than Chrome 94 for no reason — the app's newest syntax is ES2020.
The target is now `es2020` (Chrome 87+, Safari 14+, Firefox 78+), and the
supported baseline is written down in `browserslist` in `package.json`.

The CSS was the real blocker: **`dvh` only exists in Chrome 108+ and Safari
15.4+**, and the app used it for every full-height surface with no
fallback, so an older browser dropped the declaration and the layout
collapsed. Every `dvh` declaration now has a `vh` fallback in front of it —
37 of them — which costs nothing and turns a broken layout into a slightly
less precise one.

`:has()` is used for progressive refinement only, and `backdrop-filter` is
already `-webkit-` prefixed, so both degrade gracefully.

## Verified in a real browser

The production build was served and driven in headless Chrome:

- the manifest is served with the right theme colour, share target,
  screenshots and working shortcuts
- every icon and screenshot it references exists
- `/share-target`, `?action=radar`, `?action=briefing` and `?search=…` all
  serve the app
- `robots.txt` and `sitemap.xml` are served and valid
- the app boots, the service worker registers and takes control, and the
  page carries both structured-data blocks

## Tests

`tests/discoverability.test.mjs` (26 tests) covers the manifest, the
structured data, the deep links, the crawling files, the hosting headers,
the service worker registration and the browser baseline.

## Still to do by hand

These need an account or a console, not a code change:

- **Submit the sitemap to Google Search Console** and to Bing Webmaster
  Tools. The `google-site-verification` token is already in the page.
- **Get a custom domain** — `aurafisky.web.app` is fine, but a real domain
  is what people type and what looks credible in search results.
- **Register the app as a Progressive Web App in Chrome's Web Store** and
  as an App Clip / Store listing for Android, once the icons and
  screenshots are final.
- **Make sure the social preview image is the current one** —
  `aurafisky-social.png` is used for the Open Graph and Twitter cards.
- **Check the `sameAs` links** in the structured data: the app's social
  accounts should be listed there so the entity can be tied together.
