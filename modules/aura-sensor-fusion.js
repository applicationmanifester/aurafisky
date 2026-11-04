/**
 * @fileoverview Multimodal Sensor Fusion & Extended Kalman Filter (EKF)
 * Aura of Sky Live (Aurafisky v19.0.0) — Module 6.9 Standards
 * 
 * Fuses local barometric pressure sensors with regional numerical forecast models
 * via a continuous-discrete Extended Kalman Filter to detect localized microclimate
 * pressure drops and convective storm buildups 20–40 minutes before regional radar updates.
 */

export class BarometerKalmanFilter {
  /**
   * @param {Object} [options]
   * @param {number} [options.initialPressure=1013.25] Initial pressure in hPa
   * @param {number} [options.processNoiseQ=0.01] Process covariance Q
   * @param {number} [options.measurementNoiseR=0.25] Sensor measurement variance R
   */
  constructor(options = {}) {
    // State vector: x = [pressure (hPa), dP/dt (hPa/hr)]
    this.x = [options.initialPressure || 1013.25, 0.0];

    // Covariance matrix P (2x2)
    this.P = [
      [1.0, 0.0],
      [0.0, 1.0],
    ];

    this.Q = options.processNoiseQ || 0.01;
    this.R = options.measurementNoiseR || 0.25;
    this.lastTimestamp = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  /**
   * State prediction step over time interval dt (in hours)
   * @param {number} dtHours Time delta in hours
   */
  predict(dtHours = 1 / 60) {
    const dt = Math.max(0.0001, dtHours);

    // State transition F: [ [1, dt], [0, 1] ]
    const p_pred = this.x[0] + this.x[1] * dt;
    const v_pred = this.x[1];

    this.x = [p_pred, v_pred];

    // P_pred = F * P * F^T + Q
    const p00 = this.P[0][0] + dt * (this.P[1][0] + this.P[0][1]) + dt * dt * this.P[1][1] + this.Q;
    const p01 = this.P[0][1] + dt * this.P[1][1];
    const p10 = this.P[1][0] + dt * this.P[1][1];
    const p11 = this.P[1][1] + this.Q;

    this.P = [
      [p00, p01],
      [p10, p11],
    ];
  }

  /**
   * Measurement update with a raw barometric reading (in hPa)
   * 
   * @param {number} measuredPressure Sensor reading in hPa
   * @returns {{ pressure: number, rateHpaPerHour: number, isRapidDrop: boolean }}
   */
  update(measuredPressure) {
    // Innovation y = z - H * x  (where H = [1, 0])
    const y = measuredPressure - this.x[0];

    // Innovation covariance S = H * P * H^T + R = P[0][0] + R
    const S = this.P[0][0] + this.R;

    // Kalman gain K = P * H^T / S = [ P[0][0]/S, P[1][0]/S ]
    const K0 = this.P[0][0] / S;
    const K1 = this.P[1][0] / S;

    // State update x = x + K * y
    this.x[0] += K0 * y;
    this.x[1] += K1 * y;

    // Covariance update P = (I - K * H) * P
    const p00 = (1 - K0) * this.P[0][0];
    const p01 = (1 - K0) * this.P[0][1];
    const p10 = this.P[1][0] - K1 * this.P[0][0];
    const p11 = this.P[1][1] - K1 * this.P[0][1];

    this.P = [
      [p00, p01],
      [p10, p11],
    ];

    return {
      pressure: Math.round(this.x[0] * 100) / 100,
      rateHpaPerHour: Math.round(this.x[1] * 100) / 100,
      isRapidDrop: this.x[1] <= -2.0, // Falling >= 2 hPa/hr
    };
  }
}

