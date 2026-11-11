import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    define: {
      '__FIREBASE_API_KEY__': JSON.stringify(env.VITE_FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || ''),
      '__FCM_VAPID_KEY__': JSON.stringify(env.VITE_FCM_VAPID_KEY || process.env.VITE_FCM_VAPID_KEY || ''),
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
    preview: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
  build: {
    // ES2020 rather than ES2022: optional chaining and nullish coalescing
    // are the newest syntax the app actually uses, and ES2022 syntax would
    // lock out Safari 15 and every browser older than Chrome 94 for no
    // reason. The CSS carries its own fallbacks (see the `vh` declarations
    // in front of every `dvh` one), so older browsers get a working — if
    // less precise — layout rather than a broken one.
    target: ['es2020', 'chrome87', 'safari14', 'firefox78'],
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        passes: 2
      },
      mangle: true,
      format: { comments: false }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Split OpenLayers core from mapbox-style parser — they're loaded at different times
          'vendor-ol': ['ol'],
          'vendor-mapbox-style': ['ol-mapbox-style'],
          // i18n dictionaries are huge (470KB gzipped) — load lazily
          'vendor-i18n': [
            './modules/i18n-data.js',
            './modules/i18n-extended.js',
          ],
          // Only truly eager features go here (loaded synchronously before first paint)
          'features-core': [
            './features/deviceProfile.js',
            './features/bookmarks.js',
            './features/units.js',
            './features/share.js',
            './features/analytics.js',
          ],
          // Heavy features (aura, routes, timeMachine, compareCities) are
          // dynamically imported from registry.js — no eager chunk.
          'app-core': ['./app.js']
        },
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (info) => {
          if (/\.css$/.test(info.name)) return 'assets/css/[name]-[hash][extname]';
          if (/\.(png|jpe?g|gif|svg|webp|avif)$/.test(info.name)) return 'assets/img/[name]-[hash][extname]';
          if (/\.(woff2?|ttf|eot)$/.test(info.name)) return 'assets/fonts/[name]-[hash][extname]';
          return 'assets/[name]-[hash][extname]';
        }
      }
    },
    chunkSizeWarningLimit: 650,
    cssCodeSplit: true,
    modulePreload: { polyfill: false }
  },
  plugins: [
    {
      // Avoid emitting two <link rel="manifest"> tags in dist/index.html: keep
      // /manifest.json in index.html for vite dev and let VitePWA inject the
      // generated manifest.webmanifest as the sole manifest link during build.
      name: 'aurafisky-dedupe-manifest',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        handler(html) {
          return html.replace(/^\s*<link\s+rel=["']manifest["'][^>]*>\r?\n?/gim, '');
        },
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      // app.js registers the worker itself (updateViaCache:'none' + forced
      // update checks on focus/visibility). Don't inject a second registration.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'logo.svg', 'aurafisky-social.png'],
      manifest: {
        // The manifest is generated here rather than served from the
        // repository's manifest.json, so this is the copy browsers
        // actually see — keep the two in step.
        id: '/',
        name: 'Aurafisky — Live Weather & Maps',
        short_name: 'Aurafisky',
        description:
          'Explore live weather maps and radar, compare forecasts, and plan around conditions along your route.',
        lang: 'en',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        // The map works in landscape as well as portrait — locking the
        // orientation to portrait left tablet and desktop users with a
        // letterboxed app.
        orientation: 'any',
        launch_handler: { client_mode: 'navigate-existing' },
        edge_side_panel: { preferred_width: 420 },
        handle_links: 'preferred',
        categories: ['weather', 'utilities'],
        background_color: '#0f172a',
        // Matches the app's brand and the <meta name="theme-color"> tags —
        // a mismatch colours the Android splash screen and the installed
        // app's title bar the wrong way.
        theme_color: '#14b8a6',
        prefer_related_applications: false,
        // Web Share Target: lets a user share a place from any app straight
        // into Aurafisky. The app already handles the shared parameters.
        share_target: {
          action: '/share-target',
          method: 'GET',
          enctype: 'application/x-www-form-urlencoded',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Real screenshots of the app — Chrome shows these in the install
        // dialog, and its richer install UI only appears with them.
        screenshots: [
          {
            src: '/screenshots/desktop.png',
            sizes: '1440x900',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Aurafisky live weather map',
          },
          {
            src: '/screenshots/mobile.png',
            sizes: '390x844',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Aurafisky on mobile',
          },
        ],
        // Shortcuts point at the app's own ?action= deep links. Each one
        // below is handled by the URL action handler in app.js — a shortcut
        // that points at an unhandled parameter just opens the app, which
        // is worse than not offering it.
        shortcuts: [
          {
            name: 'Live Rain Radar',
            short_name: 'Radar',
            description: 'Open the animated rain radar',
            url: '/?action=radar',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'My Location',
            short_name: 'Locate',
            description: 'Show the weather where you are',
            url: '/?action=locate',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Daily Briefing',
            short_name: 'Briefing',
            description: "Read today's weather briefing",
            url: '/?action=briefing',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Ask Aura',
            short_name: 'Ask Aura',
            description: 'Open the Aura weather assistant',
            url: '/?action=aura',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        // The manifest screenshots are only used by the browser's install
        // dialog. Precaching them would push a couple of megabytes into
        // every visitor's cache for something the app itself never needs.
        globIgnores: ['screenshots/**'],
        navigationPreload: true,
        // importScripts: ['sw-widgets.js'],  // sw-widgets.js not found — removed to prevent SW install failure
        // Web Share Target: serve the app shell for /share-target so the page
        // JS can read location.search and load the shared location.
        navigateFallback: './index.html',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,json}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'api.open-meteo.com' || url.hostname === 'geocoding-api.open-meteo.com',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'weather-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 2 * 60 * 60 // 2h
              },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [
                {
                  handlerDidError: async () => {
                    return new Response(
                      JSON.stringify({ error: true, offline: true, reason: 'no-response' }),
                      {
                        status: 503,
                        statusText: 'Service Unavailable',
                        headers: { 'Content-Type': 'application/json' }
                      }
                    );
                  }
                }
              ]
            }
          },
          {
            urlPattern: ({ url }) => url.hostname === 'tilecache.rainviewer.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'radar-tiles',
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7d
              },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [
                {
                  handlerDidError: async () => {
                    return new Response('', { status: 404, statusText: 'Tile Not Found' });
                  }
                }
              ]
            }
          },
          {
            // Vector basemap: style JSON / sprite / glyph docs — small in count,
            // want fresh copies so a style update on OpenFreeMap's end shows up.
            urlPattern: ({ url }) => url.hostname === 'tiles.openfreemap.org' && /\/(styles|sprites|fonts)\//.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'map-style',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 // 1d
              },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [
                {
                  handlerDidError: async () => {
                    return new Response('{}', {
                      status: 503,
                      statusText: 'Service Unavailable',
                      headers: { 'Content-Type': 'application/json' }
                    });
                  }
                }
              ]
            }
          },
          // Vector map tiles + shaded relief (OpenFreeMap /planet and
          // /natural_earth) — CacheFirst: once a tile has been fetched, panning
          // back over it is instant and the base map keeps working offline.
          // Kept *after* the styles/sprites/fonts route above so those stay
          // NetworkFirst (first matching route wins in workbox).
          {
            urlPattern: ({ url }) => url.hostname === "tiles.openfreemap.org",
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: {
                maxEntries: 600,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30d
              },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [
                {
                  handlerDidError: async () =>
                    new Response("", {
                      status: 404,
                      statusText: "Tile Not Found",
                    }),
                },
              ],
            },
          },
          // Instant raster basemap (tile.openstreetmap.org) — CacheFirst.
          {
            urlPattern: ({ url }) => url.hostname === "tile.openstreetmap.org",
            handler: "CacheFirst",
            options: {
              cacheName: "basemap-tiles",
              expiration: {
                maxEntries: 400,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30d
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // OpenTopoMap tiles (a.tile.opentopomap.org …) — CacheFirst.
          // Without this route the OpenTopo map mode was the one mode with
          // no offline or warm cache at all: every switch back to it
          // re-downloaded every tile from scratch.
          {
            urlPattern: ({ url }) => /(^|\.)tile\.opentopomap\.org$/.test(url.hostname),
            handler: "CacheFirst",
            options: {
              cacheName: "topo-tiles",
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30d
              },
              cacheableResponse: { statuses: [0, 200] },
              plugins: [
                {
                  handlerDidError: async () =>
                    new Response("", {
                      status: 404,
                      statusText: "Tile Not Found",
                    }),
                },
              ],
            },
          },
          // Satellite & topography basemaps (server.arcgisonline.com) — imagery
          // changes rarely, so CacheFirst keeps satellite/topo modes instant.
          {
            urlPattern: ({ url }) => url.hostname === "server.arcgisonline.com",
            handler: "CacheFirst",
            options: {
              cacheName: "satellite-tiles",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30d
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          }
        ]
      }
    })
  ]
};
});
