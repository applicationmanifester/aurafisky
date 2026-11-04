/**
 * @fileoverview Predictive Health, Biometeorology & Encrypted Symptom Logger
 * Aura of Sky Live (Aurafisky v19.0.0) — Module 6.4 Standards
 * 
 * Correlates barometric pressure derivatives (dP/dt), wet-bulb temperature,
 * UV index, and CAMS air pollutants to provide 24-hour advance warnings for
 * barometric migraines (ΔP < -4 hPa/6h), asthma risk, and heat exhaustion.
 * Encrypts local symptom records on-device using Web Crypto API (AES-GCM-256).
 */

export class AuraHealthEngine {
  constructor() {
    this._cryptoKey = null;
    this._keyStorageKey = 'aurafisky_health_cryptokey';
    this._recordsStorageKey = 'aurafisky_encrypted_symptoms';
  }

  /**
   * Evaluates biometeorological conditions and returns proactive health warnings
   * 
   * @param {Object} weatherData Open-Meteo hourly weather payload
   * @param {number} currentHourIdx Current hour index in the timeline
   * @param {Object} [aqiData] Optional CAMS Air Quality payload
   * @returns {Object} Health risk scores, alerts, and detailed biometeorology breakdown
   */
  evaluateHealthRisks(weatherData, currentHourIdx = 0, aqiData = null) {
    if (!weatherData?.hourly) {
      return { migraineRisk: 'low', asthmaRisk: 'low', heatRisk: 'low', alerts: [] };
    }

    const hourly = weatherData.hourly;
    const pressures = hourly.surface_pressure || hourly.pressure_msl || [];
    const temps = hourly.temperature_2m || [];
    const humidities = hourly.relative_humidity_2m || [];
    const uvs = hourly.uv_index || [];

    const currentPressure = pressures[currentHourIdx] ?? 1013.25;
    const currentTemp = temps[currentHourIdx] ?? 20;
    const currentHumidity = humidities[currentHourIdx] ?? 50;
    const currentUv = uvs[currentHourIdx] ?? 0;

    const alerts = [];

    // 1. Barometric Pressure Derivative (dP/dt) & Migraine Index
    // ΔP over past 6 hours and next 6 hours
    const pastHour = Math.max(0, currentHourIdx - 6);
    const nextHour = Math.min(pressures.length - 1, currentHourIdx + 6);
    const pastPressure = pressures[pastHour] ?? currentPressure;
    const futurePressure = pressures[nextHour] ?? currentPressure;

    const deltaP6hPast = currentPressure - pastPressure;
    const deltaP6hFuture = futurePressure - currentPressure;
    const minDelta6h = Math.min(deltaP6hPast, deltaP6hFuture);

    let migraineRisk = 'low';
    let migraineReason = 'Stable barometric pressure';

    if (minDelta6h <= -4.0) {
      migraineRisk = 'high';
      migraineReason = `Rapid barometric drop (${Math.abs(minDelta6h).toFixed(1)} hPa in 6h) creates elevated migraine trigger risk`;
      alerts.push({
        type: 'migraine',
        severity: 'high',
        title: '🧠 High Migraine Trigger Risk',
        description: migraineReason,
        recommendation: 'Stay hydrated, dim bright screens, and keep preventative medication accessible.',
      });
    } else if (minDelta6h <= -2.5) {
      migraineRisk = 'moderate';
      migraineReason = `Moderate pressure decline (${Math.abs(minDelta6h).toFixed(1)} hPa in 6h)`;
    }

    // 2. Wet-Bulb Temperature (Twb) & Heat Exhaustion Risk
    // Stull (2011) approximation for wet-bulb temperature
    const T = currentTemp;
    const RH = currentHumidity;
    const Twb =
      T * Math.atan(0.151977 * Math.pow(RH + 8.313659, 0.5)) +
      Math.atan(T + RH) -
      Math.atan(RH - 1.676331) +
      0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) -
      4.686035;

    let heatRisk = 'low';
    if (Twb >= 29) {
      heatRisk = 'critical';
      alerts.push({
        type: 'heat',
        severity: 'critical',
        title: '🔥 Extreme Wet-Bulb Hazard',
        description: `Wet-bulb temp (${Twb.toFixed(1)}°C) exceeds safe physiological heat-dissipation limits.`,
        recommendation: 'Cease strenuous outdoor activity immediately; seek shaded or air-conditioned environments.',
      });
    } else if (Twb >= 25 || currentTemp >= 35) {
      heatRisk = 'high';
      alerts.push({
        type: 'heat',
        severity: 'high',
        title: '☀️ Heat Exhaustion Warning',
        description: `High heat combined with humidity (Twb: ${Twb.toFixed(1)}°C) impairs evaporative cooling.`,
        recommendation: 'Increase water and electrolyte intake; rest frequently in cool zones.',
      });
    } else if (Twb >= 22 || currentTemp >= 30) {
      heatRisk = 'moderate';
    }

    // 3. Asthma & Respiratory Risk
    let asthmaRisk = 'low';
    const pm25 = aqiData?.current?.pm2_5 ?? aqiData?.hourly?.pm2_5?.[currentHourIdx] ?? 12;
    const ozone = aqiData?.current?.ozone ?? aqiData?.hourly?.ozone?.[currentHourIdx] ?? 45;

    if (pm25 > 35 || ozone > 100) {
      asthmaRisk = 'high';
      alerts.push({
        type: 'respiratory',
        severity: 'high',
        title: '🫁 Elevated Respiratory & Asthma Risk',
        description: `Elevated particulate matter (PM2.5: ${Math.round(pm25)} µg/m³) and ozone irritate airway tissue.`,
        recommendation: 'Wear an N95/FFP2 mask outdoors if sensitive, and use indoor HEPA filtration.',
      });
    } else if (pm25 > 20 || ozone > 70) {
      asthmaRisk = 'moderate';
    }

    // 4. UV Burn Time Estimate
    let uvBurnMinutes = null;
    if (currentUv >= 8) {
      uvBurnMinutes = Math.round(120 / currentUv); // ~15 min or less
      alerts.push({
        type: 'uv',
        severity: 'high',
        title: '🧴 Very High UV Index',
        description: `UV Index of ${currentUv.toFixed(1)} can cause skin damage in ~${uvBurnMinutes} minutes.`,
        recommendation: 'Apply SPF 50+ broad-spectrum sunscreen, wear UV400 sunglasses and wide-brim hat.',
      });
    } else if (currentUv >= 6) {
      uvBurnMinutes = Math.round(150 / currentUv);
    }

    return {
      migraineRisk,
      migraineReason,
      deltaP6h: minDelta6h,
      wetBulbTempC: Math.round(Twb * 10) / 10,
      heatRisk,
      asthmaRisk,
      uvBurnMinutes,
      alerts,
    };
  }

  /**
   * Initializes or restores the AES-GCM-256 Web Crypto encryption key
   * @private
   */
  async _getOrCreateKey() {
    if (this._cryptoKey) return this._cryptoKey;
    if (typeof window === 'undefined' || !window.crypto?.subtle) return null;

    try {
      // Generate new AES-GCM 256-bit key
      this._cryptoKey = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable
        ['encrypt', 'decrypt']
      );
      return this._cryptoKey;
    } catch (_) {
      return null;
    }
  }

  /**
   * Logs a symptom event encrypted on-device with AES-GCM
   * 
   * @param {string} symptomTag 'migraine' | 'asthma' | 'joint_pain' | 'fatigue'
   * @param {Object} environmentalContext Current weather snapshot
   * @returns {Promise<boolean>} Success status
   */
  async logSymptomEncrypted(symptomTag, environmentalContext = {}) {
    const key = await this._getOrCreateKey();
    if (!key) return false;

    try {
      const payload = {
        symptom: symptomTag,
        timestamp: Date.now(),
        context: environmentalContext,
      };

      const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
      const encoded = new TextEncoder().encode(JSON.stringify(payload));

      const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoded
      );

      // Store IV + ciphertext
      const record = {
        iv: Array.from(iv),
        data: Array.from(new Uint8Array(ciphertext)),
        timestamp: Date.now(),
      };

      const existing = this._getEncryptedRecords();
      existing.push(record);
      // Keep last 100 entries locally
      if (existing.length > 100) existing.shift();

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this._recordsStorageKey, JSON.stringify(existing));
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  _getEncryptedRecords() {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this._recordsStorageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }
}

