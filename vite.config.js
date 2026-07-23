import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
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
          'features': ['./features/ensemble.js', './features/routes.js', './features/copilot.js'],
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
        urlPattern: ({ url }) => url.hostname === 'basemaps.cartocdn.com',
        handler: 'CacheFirst',
        options: {
          cacheName: 'map-tiles',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30 // 30d
          },
          cacheableResponse: { statuses: [0, 200] }
        }
      },
      {
        urlPattern: ({ url }) => url.hostname === 'nominatim.openstreetmap.org',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'geocoding',
          networkTimeoutSeconds: 3,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 1 * 60 * 60 // 1h
          },
          cacheableResponse: { statuses: [0, 200] }
        }
      }
    ],
    navigateFallback: '/index.html',
    navigateFallbackDenylist: [/\.(?:png|jpg|jpeg|svg|woff2|json)$/],
    maximumFileSizeToCacheInBytes: 8 * 1024 * 1024
  }
    })
  ],
  optimizeDeps: {
    include: ['leaflet', 'localforage', 'dompurify']
  }
});