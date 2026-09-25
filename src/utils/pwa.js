// src/utils/pwa.js
/**
 * PWA Utilities - Service Worker registration, install prompts, offline detection
 */

let deferredPrompt = null;
let swRegistration = null;
let updateAvailable = false;

/**
 * Register the service worker
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.log('[PWA] Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    swRegistration = registration;
    console.log('[PWA] Service Worker registered:', registration.scope);

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          updateAvailable = true;
          dispatchEvent(new CustomEvent('pwa:update-available'));
        }
      });
    });

    // Listen for controller change (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updateAvailable) {
        window.location.reload();
      }
    });

    return registration;
  } catch (err) {
    console.error('[PWA] Service Worker registration failed:', err);
    return null;
  }
}

/**
 * Check for service worker updates
 */
export async function checkForUpdate() {
  if (!swRegistration) return false;
  try {
    await swRegistration.update();
    return updateAvailable;
  } catch (err) {
    console.error('[PWA] Update check failed:', err);
    return false;
  }
}

/**
 * Apply pending update (skip waiting)
 */
export async function applyUpdate() {
  if (!swRegistration?.waiting) return false;
  swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

/**
 * Setup install prompt handling
 */
export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    dispatchEvent(new CustomEvent('pwa:install-available'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    dispatchEvent(new CustomEvent('pwa:installed'));
  });
}

/**
 * Show install prompt (call from user gesture)
 */
export async function showInstallPrompt() {
  if (!deferredPrompt) return false;
  try {
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    return outcome === 'accepted';
  } catch (err) {
    console.error('[PWA] Install prompt failed:', err);
    return false;
  }
}

/**
 * Check if app is installed (standalone mode)
 */
export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}

/**
 * Check if online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Subscribe to online/offline events
 */
export function onOnlineStatusChange(callback) {
  const handler = () => callback(navigator.onLine);
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

/**
 * Subscribe to push notifications (FCM)
 */
export async function subscribeToPush(vapidKey) {
  if (!swRegistration) return null;
  try {
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
    return subscription;
  } catch (err) {
    console.error('[PWA] Push subscription failed:', err);
    return null;
  }
}

/**
 * Convert VAPID key to Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Get current subscription
 */
export async function getPushSubscription() {
  if (!swRegistration) return null;
  return swRegistration.pushManager.getSubscription();
}

/**
 * Initialize PWA features
 */
export async function initPWA(vapidKey) {
  await registerServiceWorker();
  setupInstallPrompt();

  // Auto-request notification permission after user interaction
  let requested = false;
  const requestOnce = async () => {
    if (requested) return;
    requested = true;
    await requestNotificationPermission();
    if (vapidKey) {
      await subscribeToPush(vapidKey);
    }
  };

  // Request on first click
  document.addEventListener('click', requestOnce, { once: true });

  console.log('[PWA] Initialized');
  return {
    isInstalled: isInstalled(),
    isOnline: isOnline(),
  };
}

export default {
  registerServiceWorker,
  checkForUpdate,
  applyUpdate,
  setupInstallPrompt,
  showInstallPrompt,
  isInstalled,
  isOnline,
  onOnlineStatusChange,
  requestNotificationPermission,
  subscribeToPush,
  getPushSubscription,
  initPWA,
};