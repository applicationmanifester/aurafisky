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
    target: 'es2022',
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
    VitePWA({
      registerType: 'autoUpdate',
      // app.js registers the worker itself (updateViaCache:'none' + forced
      // update checks on focus/visibility). Don't inject a second registration.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'logo.svg', 'aurafisky-social.png', 'robots.txt', 'sitemap.xml'],
      manifest: {
        name: 'Aurafisky Live Explorer',
        short_name: 'Aurafisky',
        description: 'Explore live weather maps and radar, compare forecasts, and plan around conditions along your route.',
        theme_color: '#14b8a6',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: './index.html',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        widgets: [
          {
            name: "Aurafisky Weather",
            description: "Current weather for your location",
            tag: "weather-widget",
            ms_ac_template: "/widgets/template.json",
            data: "/widgets/data.json",
            type: "application/json"
          }
        ]
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        importScripts: ['sw-widgets.js'],
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
          // Satellite & topography basemaps (server.arcgisonline.com) — imagery
          // changes rarely, so CacheFirst keeps satellite/topo modes instant.
          {
            urlPattern: ({ url }) => url.hostname === "server.arcgisonline.com",
            handler: "CacheFirst",
            options: {
              cacheName: "satellite-tiles",
              expiration: {
                maxEntries: 300,
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
