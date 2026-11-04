/**
 * @fileoverview Contextual Bandit for Predictive Routine & Adaptive UI Layout
 * Aura of Sky Live (Aurafisky v19.0.0) — Module 6.3 Standards
 * 
 * Implements a 6-dimensional LinUCB (Linear Upper Confidence Bound) algorithm
 * that scores and ranks UI modules / action cards according to user context:
 * [sin(hour), cos(hour), day_of_week, precip_prob, aqi_norm, temp_norm].
 * Anticipates user needs without server round-trips.
 */

export class LinUCBBandit {
  /**
   * @param {Object} [options]
   * @param {string[]} [options.arms] List of action arms to rank
   * @param {number} [options.dimension=6] Feature vector size
   * @param {number} [options.alpha=0.25] Exploration confidence coefficient
   * @param {string} [options.storageKey='aurafisky_bandit_state'] LocalStorage key for model persistence
   */
  constructor(options = {}) {
    this.arms = options.arms || [
      'nowcast',        // Instant precipitation radar
      'hourly',         // 24-hour forecast curve
      'outdoorWindow',  // Best outdoor activity slot
      'routeStudio',    // Route weather planner
      'farm',           // Agronomy & soil metrics
      'celestial',      // Live sky dome & stargazing
      'aqi',            // Air quality index
      'healthAlerts',   // Biometeorology & migraine warning
      'gridResilience', // Home power & storm surge
    ];
    this.d = options.dimension || 6;
    this.alpha = options.alpha != null ? options.alpha : 0.25;
    this.storageKey = options.storageKey || 'aurafisky_bandit_state';

    // Model state: for each arm a, maintain A_a (d x d matrix) and b_a (d x 1 vector)
    this.A = {};
    this.b = {};

    this._initModel();
    this.load();
  }

  /**
   * Initializes identity matrices for A_a and zero vectors for b_a
   * @private
   */
  _initModel() {
    this.arms.forEach((arm) => {
      // Identity matrix d x d
      this.A[arm] = Array.from({ length: this.d }, (_, i) =>
        Array.from({ length: this.d }, (_, j) => (i === j ? 1.0 : 0.0))
      );
      // Zero vector d x 1
      this.b[arm] = Array(this.d).fill(0.0);
    });
  }

  /**
   * Constructs the normalized context vector x from current time & weather metrics
   * 
   * @param {Object} context
   * @param {Date} [context.date=new Date()]
   * @param {number} [context.hour] 0-23
   * @param {number} [context.dayOfWeek] 0-6 (0=Sun)
   * @param {number} [context.precipProb=0] 0-100%
   * @param {number} [context.aqi=50] Air Quality Index
   * @param {number} [context.temperatureC=20] Temperature in Celsius
   * @returns {number[]} 6-element context feature vector
   */
  buildContext(context = {}) {
    const now = context.date || new Date();
    const hour = context.hour != null ? context.hour : now.getHours();
    const day = context.dayOfWeek != null ? context.dayOfWeek : now.getDay();
    const precip = (context.precipProb || 0) / 100;
    const aqi = Math.min(1.0, (context.aqi || 50) / 250);
    const temp = ((context.temperatureC ?? 20) - 20) / 20;

    const angle = (2 * Math.PI * hour) / 24;

    return [
      Math.sin(angle),          // x0: cyclical diurnal sine
      Math.cos(angle),          // x1: cyclical diurnal cosine
      day / 6.0,                // x2: weekday / weekend trend
      Math.max(0, Math.min(1, precip)), // x3: rain risk
      Math.max(0, Math.min(1, aqi)),    // x4: air pollution
      Math.max(-1.5, Math.min(1.5, temp)), // x5: thermal deviance
    ];
  }

  /**
   * Computes the matrix inversion of a small symmetric positive-definite matrix (Gauss-Jordan)
   * @private
   */
  _invertMatrix(M) {
    const n = M.length;
    // Augment with identity
    const A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);

    for (let i = 0; i < n; i++) {
      let maxRow = i;
      for (let k = i + 1; k < n; k++) {
        if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
      }
      [A[i], A[maxRow]] = [A[maxRow], A[i]];

      const pivot = A[i][i] || 1e-6;
      for (let j = 0; j < 2 * n; j++) {
        A[i][j] /= pivot;
      }

      for (let k = 0; k < n; k++) {
        if (k !== i) {
          const factor = A[k][i];
          for (let j = 0; j < 2 * n; j++) {
            A[k][j] -= factor * A[i][j];
          }
        }
      }
    }

    return A.map((row) => row.slice(n));
  }

  /**
   * Scores and ranks all candidate arms for the given context vector
   * 
   * @param {number[]} x 6-dimensional context vector
   * @returns {Array<{ arm: string, score: number, ucb: number, mean: number }>} Sorted ranked arms
   */
  rank(x) {
    const results = [];

    for (const arm of this.arms) {
      const A_inv = this._invertMatrix(this.A[arm]);
      const b = this.b[arm];

      // theta = A_inv * b
      const theta = Array(this.d).fill(0);
      for (let i = 0; i < this.d; i++) {
        for (let j = 0; j < this.d; j++) {
          theta[i] += A_inv[i][j] * b[j];
        }
      }

      // mean = theta^T * x
      let mean = 0;
      for (let i = 0; i < this.d; i++) {
        mean += theta[i] * x[i];
      }

      // variance = x^T * A_inv * x
      let variance = 0;
      for (let i = 0; i < this.d; i++) {
        let temp = 0;
        for (let j = 0; j < this.d; j++) {
          temp += A_inv[i][j] * x[j];
        }
        variance += x[i] * temp;
      }

      const ucb = this.alpha * Math.sqrt(Math.max(0, variance));
      const score = mean + ucb;

      results.push({ arm, score, ucb, mean });
    }

    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Updates the bandit model parameters with an observed reward (e.g. 1.0 for click/inspection)
   * 
   * @param {string} arm The chosen arm
   * @param {number[]} x The context vector when arm was selected
   * @param {number} [reward=1.0] Observed reward (typically 1.0 for engagement)
   */
  update(arm, x, reward = 1.0) {
    if (!this.A[arm]) return;

    // A_a = A_a + x * x^T
    for (let i = 0; i < this.d; i++) {
      for (let j = 0; j < this.d; j++) {
        this.A[arm][i][j] += x[i] * x[j];
      }
    }

    // b_a = b_a + reward * x
    for (let i = 0; i < this.d; i++) {
      this.b[arm][i] += reward * x[i];
    }

    this.save();
  }

  /**
   * Persists bandit parameters to localStorage
   */
  save() {
    if (typeof localStorage === 'undefined') return;
    try {
      const serialized = JSON.stringify({ A: this.A, b: this.b });
      localStorage.setItem(this.storageKey, serialized);
    } catch (_) {}
  }

  /**
   * Loads bandit parameters from localStorage
   */
  load() {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.A && parsed.b) {
          this.arms.forEach((arm) => {
            if (parsed.A[arm]) this.A[arm] = parsed.A[arm];
            if (parsed.b[arm]) this.b[arm] = parsed.b[arm];
          });
        }
      }
    } catch (_) {}
  }
}

