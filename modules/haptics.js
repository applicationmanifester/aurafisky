/**
 * @fileoverview Centralized HapticEngine & Tactile Feedback Service
 * Aura of Sky Live (Aurafisky v19.0.0) — Sprint 3 Standards
 * 
 * Implements Web Vibration API (navigator.vibrate()), synchronized CSS spring-scale
 * pulses, audio micro-tick synthetic fallbacks (Web Audio API), and automatic
 * suppression for prefers-reduced-motion.
 */

export class HapticEngine {
  /**
   * @param {Object} [options]
   * @param {AudioContext} [options.audioContext] Optional shared Web Audio Context for audio click fallback
   */
  constructor(options = {}) {
    this.audioContext = options.audioContext || null;
    this._lastHourlyTickTime = 0;
    this._hourlyTickMinIntervalMs = 83; // Throttled to <= 12 Hz (1000 / 12 ~= 83.3ms)
    this._lastHazardCrossHour = -1;
    this._mediaQuery = null;

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      try {
        this._mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      } catch (_) {}
    }
  }

  /**
   * Whether haptics should be suppressed by reduced motion preferences
   */
  get isReducedMotion() {
    return Boolean(this._mediaQuery?.matches);
  }

  /**
   * Standard vibration patterns from Aurafisky Technical Specification
   */
  static PATTERNS = {
    // Sprint 3 Core Interaction Events
    hourlyTick: [8],                     // 8ms crisp micro-tick
    mapWaypointSnap: [15],               // 15ms tactile detent
    weatherThresholdCross: [20, 40, 20], // Double pulse
    severeAlert: [40, 60, 80],           // Escalating alert pulse

    // UI primitives
    selection: [2],
    light: [5],
    medium: [10],
    heavy: [20],
    success: [10, 50, 10],
    warning: [20, 50, 20],
    error: [30, 30, 30, 30, 50],
  };

  /**
   * Set or update the audio context for micro-tick synthesis
   * @param {AudioContext} ctx
   */
  setAudioContext(ctx) {
    this.audioContext = ctx;
  }

  /**
   * Triggers a named haptic interaction event with hardware vibration,
   * visual spring-scale pulse, and audio micro-tick fallback.
   * 
   * @param {keyof typeof HapticEngine.PATTERNS | string} eventType 
   * @param {HTMLElement} [targetEl] Optional DOM element for synchronized visual pulse
   * @returns {boolean} Whether haptic was dispatched
   */
  trigger(eventType = 'light', targetEl = null) {
    if (this.isReducedMotion) {
      return false;
    }

    const pattern = HapticEngine.PATTERNS[eventType] || HapticEngine.PATTERNS.light;

    // Rate-limit high-frequency hourly scrubber ticks to <= 12 Hz
    if (eventType === 'hourlyTick') {
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      if (now - this._lastHourlyTickTime < this._hourlyTickMinIntervalMs) {
        return false;
      }
      this._lastHourlyTickTime = now;
    }

    // 1. Hardware Vibration
    let didVibrate = false;
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      try {
        if (!navigator.userActivation || navigator.userActivation.hasBeenActive) {
          didVibrate = navigator.vibrate(pattern);
        }
      } catch (_) {}
    }

    // 2. Synchronized Visual Spring-Scale Pulse (for iOS / Desktop & visual feedback)
    if (targetEl && targetEl.classList) {
      this._applyVisualPulse(targetEl, eventType);
    }

    // 3. Audio Micro-Tick Synthesis Fallback (when vibration unsupported or on desktop/iOS)
    if (!didVibrate && (eventType === 'hourlyTick' || eventType === 'selection' || eventType === 'mapWaypointSnap')) {
      this._playAudioTick();
    }

    return true;
  }

  /**
   * Checks weather metrics for hazardous threshold crossings and fires double-pulse haptic
   * UV >= 8, AQI > 150, Wind > 50 km/h, or Precip > 5 mm/h
   * 
   * @param {Object} metrics
   * @param {number} [metrics.uv]
   * @param {number} [metrics.aqi]
   * @param {number} [metrics.windSpeed]
   * @param {number} [metrics.precipitation]
   * @param {number} hourIndex
   * @param {HTMLElement} [trackEl] Scrubber track element to flash
   */
  checkWeatherThresholds(metrics, hourIndex, trackEl = null) {
    if (!metrics || hourIndex === this._lastHazardCrossHour) return false;

    const isHazardous = Boolean(
      (metrics.uv != null && metrics.uv >= 8) ||
      (metrics.aqi != null && metrics.aqi > 150) ||
      (metrics.windSpeed != null && metrics.windSpeed > 50) ||
      (metrics.precipitation != null && metrics.precipitation > 5)
    );

    if (isHazardous) {
      this._lastHazardCrossHour = hourIndex;
      this.trigger('weatherThresholdCross');
      if (trackEl && trackEl.classList) {
        trackEl.classList.remove('timeline-hazard-flash');
        // Force reflow
        void trackEl.offsetWidth;
        trackEl.classList.add('timeline-hazard-flash');
        setTimeout(() => {
          trackEl.classList.remove('timeline-hazard-flash');
        }, 600);
      }
      return true;
    }

    return false;
  }

  /**
   * Applies CSS spring-scale visual pulse to target element
   * @private
   */
  _applyVisualPulse(el, type) {
    if (this.isReducedMotion) return;

    if (type === 'hourlyTick') {
      el.classList.add('thumb-haptic-active');
      setTimeout(() => {
        el.classList.remove('thumb-haptic-active');
      }, 90);
    } else if (type === 'mapWaypointSnap') {
      el.classList.add('waypoint-snap-bounce');
      setTimeout(() => {
        el.classList.remove('waypoint-snap-bounce');
      }, 350);
    }
  }

  /**
   * Synthesizes a crisp, ultra-short micro-tick using Web Audio API
   * @private
   */
  _playAudioTick() {
    if (!this.audioContext || this.audioContext.state === 'suspended') return;
    try {
      const now = this.audioContext.currentTime;
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(2400, now);
      osc.frequency.exponentialRampToValueAtTime(750, now + 0.005);

      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.005);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start(now);
      osc.stop(now + 0.006);
    } catch (_) {}
  }
}
