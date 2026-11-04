/**
 * @fileoverview Online Concept Drift Detection (ADWIN & Page-Hinkley)
 * Aura of Sky Live (Aurafisky v19.0.0) — Module 6.10 Standards
 * 
 * Monitors streaming forecast residuals vs ground truth / observations.
 * When sudden seasonal transitions, coastal microclimates, or atmospheric shifts occur,
 * detects concept drift and triggers model adaptation or graceful rule-based fallback.
 */

export class ADWINDriftDetector {
  /**
   * @param {Object} [options]
   * @param {number} [options.delta=0.002] Confidence threshold for cut detection
   * @param {number} [options.maxBuckets=64] Max window size
   */
  constructor(options = {}) {
    this.delta = options.delta || 0.002;
    this.maxBuckets = options.maxBuckets || 64;
    this.window = [];
    this.total = 0;
    this.variance = 0;
    this.lastDriftDetected = false;
  }

  /**
   * Adds an observed error or residual |forecast - observed|
   * @param {number} val 
   * @returns {boolean} Whether concept drift was detected
   */
  add(val) {
    this.window.push(val);
    this.total += val;

    if (this.window.length > this.maxBuckets) {
      const removed = this.window.shift();
      this.total -= removed;
    }

    this.lastDriftDetected = this._checkDrift();
    return this.lastDriftDetected;
  }

  /**
   * Tests for statistical divergence between sub-windows (Hoeffding bound)
   * @private
   */
  _checkDrift() {
    const n = this.window.length;
    if (n < 12) return false;

    // Test split at midpoint
    const mid = Math.floor(n / 2);
    let sum1 = 0;
    for (let i = 0; i < mid; i++) sum1 += this.window[i];
    let sum2 = 0;
    for (let i = mid; i < n; i++) sum2 += this.window[i];

    const mean1 = sum1 / mid;
    const mean2 = sum2 / (n - mid);
    const diff = Math.abs(mean1 - mean2);

    // Harmonic mean of sample sizes
    const m = 1 / (1 / mid + 1 / (n - mid));
    const eps = Math.sqrt((1 / (2 * m)) * Math.log(4 / this.delta));

    if (diff > eps) {
      // Concept drift confirmed: compress older window half
      this.window = this.window.slice(mid);
      this.total = sum2;
      return true;
    }

    return false;
  }

  reset() {
    this.window = [];
    this.total = 0;
    this.lastDriftDetected = false;
  }
}

