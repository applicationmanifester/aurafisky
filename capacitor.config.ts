import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aurafisky.app',
  appName: 'Aurafisky',
  webDir: 'dist',
  // Match the PWA's offline-first posture: the service worker is the source
  // of truth for caching, so Capacitor must not replace it with its own.
  server: {
    androidScheme: 'https'
  },
  // Allow the app to run as a true offline-capable WebView app.
  plugins: {
    // Keep the user's data on-device by default; cloud sync is opt-in.
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0f172a',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0f172a'
    },
    Keyboard: {
      resize: 'body'
    }
  }
};

export default config;
