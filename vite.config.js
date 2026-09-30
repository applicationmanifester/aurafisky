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
          // Large third-party map libs — split out so they cache independently
          // of app-core (they change far less often than app.js) and so the
          // main bundle doesn't trip the >500kB chunk-size warning.
          'vendor-map': ['ol', 'ol-mapbox-style'],
          'features': [
            './features/ensemble.js',
            './features/routes.js',
            './features/radar.js',
            './features/bookmarks.js',
            './features/compareCities.js',
            './features/units.js',
            './features/share.js',
            './features/hourlyStrip.js',
            './features/insights.js',
            './features/minimalMode.js',
            './features/canvasEffects.js',
            './features/audio.js',
            './features/myLocation.js',
            './features/timeMachine.js',
            './features/astronomy.js',
            './features/advisories.js',
            './features/appToggles.js',
            './features/dashboard.js',
            './features/keyboardShortcuts.js',
            './features/terminator.js',
            './features/isobars.js',
            './features/stargazing.js',
            './features/extremes.js',
            './features/navigation.js',
          ],
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
    cssCodeSplit: true,
    modulePreload: { polyfill: false }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // app.js registers the worker itself (updateViaCache:'none' + forced
      // update checks on focus/visibility). Don't inject a second registration.
      injectRegister: null,
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'logo.svg'],
      manifest: {
        name: 'Aurafisky Live Explorer',
        short_name: 'Aurafisky',
        description: 'Interactive weather map with real-time conditions, forecasts, radar, and soundscapes.',
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
        importScripts: ['sw-widgets.js'],
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
              cacheableResponse: { statuses: [0, 200] }
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
              cacheableResponse: { statuses: [0, 200] }
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
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
};
});