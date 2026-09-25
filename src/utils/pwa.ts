// src/utils/pwa.ts
// PWA initialization for local-first mode (no Firebase/VAPID needed)

export async function initPWA() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered:', registration.scope);
      
      // Set up periodic background sync for alert evaluation
      if ('periodicSync' in registration) {
        try {
          await registration.periodicSync.register('evaluate-alerts', {
            minInterval: 15 * 60 * 1000, // 15 minutes
          });
          console.log('Periodic sync registered for alert evaluation');
        } catch (err) {
          console.warn('Periodic sync registration failed:', err);
        }
      }

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'ALERT_TRIGGERED') {
          // Handle alert from background sync
          console.log('Alert triggered from background:', event.data);
        }
      });

    } catch (err) {
      console.warn('Service Worker registration failed:', err);
    }
  }

  // Request notification permission for local alerts
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (err) {
      console.warn('Notification permission request failed:', err);
    }
  }
}