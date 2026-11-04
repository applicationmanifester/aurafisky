/**
 * @fileoverview Screen Wake Lock Manager
 * Aura of Sky Live (Aurafisky v19.0.0) — Sprint 3 Standards
 * 
 * Prevents screen from dimming or locking during active radar playback,
 * route turn-by-turn navigation, and live wallpaper presentations.
 * Automatically handles visibilitychange re-acquisition.
 */

export class ScreenWakeLockManager {
  constructor() {
    this.sentinels = new Map(); // reason -> wakeLockSentinel
    this._isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    this._boundOnVisibilityChange = this._onVisibilityChange.bind(this);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._boundOnVisibilityChange);
    }
  }

  get isSupported() {
    return this._isSupported;
  }

  get isActive() {
    return this.sentinels.size > 0;
  }

  /**
   * Request wake lock for a given mode ('radarPlayback', 'routeNav', 'wallpaper')
   * @param {string} reason 
   */
  async acquire(reason = 'default') {
    if (!this._isSupported) return false;
    if (this.sentinels.has(reason)) return true;

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        // If sentinel was released externally (e.g. system low battery), clean up unless we still need it
        if (this.sentinels.get(reason) === sentinel) {
          this.sentinels.delete(reason);
          this._updateHudIndicator();
        }
      });
      this.sentinels.set(reason, sentinel);
      this._updateHudIndicator();
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Release wake lock for a given mode
   * @param {string} reason 
   */
  async release(reason = 'default') {
    const sentinel = this.sentinels.get(reason);
    if (!sentinel) return;

    try {
      this.sentinels.delete(reason);
      await sentinel.release();
    } catch (_) {}

    this._updateHudIndicator();
  }

  /**
   * Re-acquire locks on tab refocus if reason is still registered
   * @private
   */
  async _onVisibilityChange() {
    if (document.visibilityState === 'visible' && this.sentinels.size > 0) {
      const activeReasons = Array.from(this.sentinels.keys());
      this.sentinels.clear();
      for (const reason of activeReasons) {
        await this.acquire(reason);
      }
    }
  }

  /**
   * Update active HUD indicator in UI
   * @private
   */
  _updateHudIndicator() {
    if (typeof document === 'undefined') return;
    const hudBadge = document.getElementById('wakeLockActiveBadge');
    if (!hudBadge) return;

    if (this.isActive) {
      hudBadge.classList.remove('hidden');
      hudBadge.setAttribute('title', 'Screen Wake Lock active: screen stays awake');
    } else {
      hudBadge.classList.add('hidden');
    }
  }
}

export const wakeLockManager = new ScreenWakeLockManager();

