/**
 * @fileoverview Emergency & Home Energy Grid Resilience Service
 * Aura of Sky Live (Aurafisky v19.0.0) — Module 6.6 Standards
 * 
 * Evaluates severe heatwaves, deep freezes, lightning CAPE, and high wind gusts
 * against regional utility strain indicators. Alerts users to pre-cool/pre-heat,
 * charge backup batteries, and unplug sensitive appliances before storm surges.
 * Manages App Badging API (navigator.setAppBadge()).
 */

export class AuraGridResilience {
  /**
   * Evaluates grid strain and storm hazards across forecast
   * 
   * @param {Object} weatherData Open-Meteo hourly weather data
   * @param {number} currentHourIdx Current hour index
   * @returns {Object} Grid strain rating, recommendations, and active hazard list
   */
  evaluateGridStrain(weatherData, currentHourIdx = 0) {
    if (!weatherData?.hourly) {
      return { status: 'nominal', strainLevel: 'low', alerts: [], recommendations: [] };
    }

    const hourly = weatherData.hourly;
    const windowHours = 24; // Look ahead 24 hours
    const endHour = Math.min(hourly.time.length, currentHourIdx + windowHours);

    let maxTemp = -999;
    let minTemp = 999;
    let maxWindGust = 0;
    let maxCape = 0;
    let thunderstormHours = 0;

    for (let i = currentHourIdx; i < endHour; i++) {
      const temp = hourly.temperature_2m?.[i] ?? 20;
      const gust = hourly.wind_gusts_10m?.[i] ?? hourly.wind_speed_10m?.[i] ?? 0;
      const cape = hourly.cape?.[i] ?? 0;
      const code = hourly.weather_code?.[i] ?? 0;

      if (temp > maxTemp) maxTemp = temp;
      if (temp < minTemp) minTemp = temp;
      if (gust > maxWindGust) maxWindGust = gust;
      if (cape > maxCape) maxCape = cape;

      // WMO thunderstorm codes (95, 96, 99)
      if (code >= 95) thunderstormHours++;
    }

    const alerts = [];
    const recommendations = [];
    let strainLevel = 'low';

    // 1. Extreme Heat Peak (Air conditioning grid strain)
    if (maxTemp >= 38) {
      strainLevel = 'high';
      alerts.push({
        title: '⚡ Severe Peak Grid Load (Extreme Heat)',
        detail: `Forecast temperatures reach ${Math.round(maxTemp)}°C, triggering heavy regional AC demand.`,
      });
      recommendations.push('Pre-cool home interior prior to peak 2:00 PM – 6:00 PM hours.');
      recommendations.push('Run high-wattage appliances (washers, dishwashers) before noon or after 8:00 PM.');
    } else if (maxTemp >= 33) {
      if (strainLevel === 'low') strainLevel = 'moderate';
      recommendations.push('Shift laundry and dishwasher cycles away from 3:00 PM – 7:00 PM peak.');
    }

    // 2. Severe Freeze Hazard (Heating load / burst pipe risk)
    if (minTemp <= -5) {
      strainLevel = 'high';
      alerts.push({
        title: '❄️ Extreme Cold Grid Warning',
        detail: `Temperatures drop to ${Math.round(minTemp)}°C. Heating grid demand surging.`,
      });
      recommendations.push('Pre-heat living spaces and ensure exposed water pipes are insulated.');
      recommendations.push('Keep emergency space heaters away from curtains and on dedicated circuits.');
    }

    // 3. Severe Thunderstorms & Lightning Surges
    if (thunderstormHours > 0 || maxCape >= 1500 || maxWindGust >= 70) {
      strainLevel = 'critical';
      alerts.push({
        title: '🌩️ Severe Thunderstorm Voltage Surge Risk',
        detail: `Severe squalls and high wind gusts (${Math.round(maxWindGust)} km/h) create outage and surge risks.`,
      });
      recommendations.push('Fully charge phones, emergency battery banks, and portable flashlights.');
      recommendations.push('Unplug sensitive electronics (computers, televisions, audio equipment) to protect from lightning voltage spikes.');
      recommendations.push('Fill clean water bottles and check refrigerator seals in case of localized outages.');
    }

    // Update Web App Badge
    this._updateAppBadge(alerts.length);

    return {
      status: strainLevel === 'critical' ? 'alert' : strainLevel === 'high' ? 'warning' : 'nominal',
      strainLevel,
      maxTemp: Math.round(maxTemp),
      minTemp: Math.round(minTemp),
      maxWindGust: Math.round(maxWindGust),
      alerts,
      recommendations,
    };
  }

  /**
   * Sets app badge counter if supported
   * @private
   */
  async _updateAppBadge(count) {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;
    try {
      if (count > 0) {
        await navigator.setAppBadge(count);
      } else if ('clearAppBadge' in navigator) {
        await navigator.clearAppBadge();
      }
    } catch (_) {}
  }
}
