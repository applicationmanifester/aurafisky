// features/nativeBridge.js
// ── Capacitor native bridge ─────────────────────────────────────────
//
// Thin wrapper around Capacitor's native plugins so the rest of the app
// can use them without importing @capacitor/* directly (which would break
// the web-only build). On the web, every method is a no-op that falls
// back to the existing Web API behaviour.
//
// Usage: app.nativeBridge.haptics.impact('medium')

export function init(app) {
  const cap = (typeof window !== 'undefined' && window.Capacitor) || null;
  const isNative = !!(cap && cap.isNativePlatform?.());

  const bridge = {
    isNative,
    platform: cap?.getPlatform?.() || 'web',

    // ── Haptics ────────────────────────────────────────────────────
    haptics: {
      impact(style = 'medium') {
        if (isNative) {
          try { window.Capacitor.Plugins.Haptics?.impact({ style }); } catch {}
        } else if (navigator.vibrate) {
          const ms = style === 'heavy' ? 30 : style === 'light' ? 8 : 15;
          navigator.vibrate(ms);
        }
      },
      notification(type = 'success') {
        if (isNative) {
          try { window.Capacitor.Plugins.Haptics?.notification({ type }); } catch {}
        }
      },
      selection() {
        if (isNative) {
          try { window.Capacitor.Plugins.Haptics?.selectionStart?.(); } catch {}
        } else if (navigator.vibrate) {
          navigator.vibrate(8);
        }
      }
    },

    // ── Share ──────────────────────────────────────────────────────
    async share({ title, text, url }) {
      if (isNative) {
        try {
          await window.Capacitor.Plugins.Share?.share({ title, text, url });
          return;
        } catch {}
      }
      // Web fallback: Web Share API
      if (navigator.share) {
        try { await navigator.share({ title, text, url }); } catch {}
      }
    },

    // ── Geolocation ────────────────────────────────────────────────
    async getCurrentPosition() {
      if (isNative) {
        try {
          const pos = await window.Capacitor.Plugins.Geolocation?.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 10000,
          });
          if (pos?.coords) {
            return { lat: pos.coords.latitude, lng: pos.coords.longitude };
          }
        } catch {}
      }
      // Web fallback
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error('no geolocation')); return; }
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          reject,
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    },

    // ── Preferences (native storage, more reliable than localStorage) ──
    async getPreference(key, fallback = null) {
      if (isNative) {
        try {
          const { value } = await window.Capacitor.Plugins.Preferences?.get({ key });
          return value ?? fallback;
        } catch {}
      }
      try {
        const v = localStorage.getItem(key);
        return v !== null ? v : fallback;
      } catch {
        return fallback;
      }
    },

    async setPreference(key, value) {
      if (isNative) {
        try {
          await window.Capacitor.Plugins.Preferences?.set({ key, value: String(value) });
        } catch {}
      }
      try {
        localStorage.setItem(key, String(value));
      } catch {
        /* ignore */
      }
    },

    // ── Status bar ─────────────────────────────────────────────────
    setStatusBarStyle(style = 'dark') {
      if (isNative) {
        try { window.Capacitor.Plugins.StatusBar?.setStyle({ style }); } catch {}
      }
    },

    // ── Splash screen ──────────────────────────────────────────────
    hideSplash() {
      if (isNative) {
        try { window.Capacitor.Plugins.SplashScreen?.hide(); } catch {}
      }
    }
  };

  app.nativeBridge = bridge;
  window.AuraNative = bridge;

  // Hide splash screen once the app is ready.
  if (isNative) {
    setTimeout(() => bridge.hideSplash(), 500);
  }
}
