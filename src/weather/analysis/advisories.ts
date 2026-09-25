/**
 * Safety advisories based on weather conditions and air quality.
 */

import type { HourlyWeather, Advisory } from '../types.js';
import { THRESHOLDS, isStormCode } from '../constants.js';

/**
 * Generate safety advisories for current conditions.
 */
export function getAdvisories(
  weather: HourlyWeather | null,
  aqiVal: number | null
): Advisory[] {
  const alerts: Advisory[] = [];
  if (!weather) return alerts;

  const { ADVISORY } = THRESHOLDS;
  const temp = weather.temperature;
  const wind = weather.windSpeed;
  const code = weather.weatherCode;
  const precip = weather.precipitation;
  const feelsLike = weather.feelsLike ?? temp;

  // Heat advisory
  if (temp != null && temp >= ADVISORY.HEAT) {
    alerts.push({
      type: 'heat',
      title: 'Extreme Heat Warning',
      desc: `Temperature is ${Math.round(temp)}°C. Stay hydrated, avoid midday sun, and look for shade.`,
      severity: 'severe',
    });
  }

  // Cold advisories - escalating based on wind chill
  else if (temp != null && temp <= ADVISORY.FROST) {
    const reading =
      feelsLike < (temp ?? 0) - 2
        ? `${Math.round(temp ?? 0)}°C, feels like ${Math.round(feelsLike)}°C`
        : `${Math.round(temp ?? 0)}°C`;

    if (feelsLike <= ADVISORY.EXTREME_COLD_CHILL) {
      alerts.push({
        type: 'extreme-cold',
        title: 'Extreme Cold Emergency',
        desc: `${reading}. Exposed skin freezes in under 2 minutes. Travel only with full polar gear and a survival kit — hypothermia is rapid and unsurvivable without shelter.`,
        severity: 'extreme',
      });
    } else if (feelsLike <= ADVISORY.SEVERE_COLD_CHILL) {
      alerts.push({
        type: 'extreme-cold',
        title: 'Extreme Cold Warning',
        desc: `${reading}. Frostbite on exposed skin in 5-10 minutes. Cover all skin, limit time outdoors, and watch for hypothermia.`,
        severity: 'severe',
      });
    } else if (feelsLike <= ADVISORY.WIND_CHILL_ADVISORY) {
      alerts.push({
        type: 'wind-chill',
        title: 'Wind Chill Advisory',
        desc: `${reading}. Frostbite possible within 30 minutes on exposed skin. Wear layers, gloves, and cover your face.`,
        severity: 'warning',
      });
    } else {
      alerts.push({
        type: 'frost',
        title: 'Frost / Freeze Advisory',
        desc: `Temperature is ${reading}. Protect plants, outdoor pipes, and pets from cold.`,
        severity: 'advisory',
      });
    }
  }

  // High wind
  if (wind != null && wind >= ADVISORY.HIGH_WIND) {
    alerts.push({
      type: 'wind',
      title: 'High Wind Warning',
      desc: `Wind speeds are reaching ${Math.round(wind)} km/h. Secure loose outdoor items and expect tree drifts.`,
      severity: 'warning',
    });
  }

  // Storm
  if (isStormCode(code)) {
    alerts.push({
      type: 'storm',
      title: 'Severe Thunderstorm Warning',
      desc: 'Lightning, thunder, and storm hail expected. Seek immediate shelter in a sturdy building.',
      severity: 'extreme',
    });
  }
  // Heavy rain
  else if (precip != null && precip >= ADVISORY.HEAVY_RAIN) {
    alerts.push({
      type: 'rain',
      title: 'Torrential Rain Alert',
      desc: `Heavy rainfall of ${precip.toFixed(1)} mm/h is active. Avoid driving on flooded low-lying streets.`,
      severity: 'warning',
    });
  }

  // Air quality
  if (aqiVal != null && aqiVal >= ADVISORY.AQI_UNHEALTHY) {
    let level = 'unhealthy';
    let severity: Advisory['severity'] = 'warning';

    if (aqiVal > ADVISORY.AQI_HAZARDOUS) {
      level = 'hazardous';
      severity = 'extreme';
    } else if (aqiVal > ADVISORY.AQI_VERY_UNHEALTHY) {
      level = 'very unhealthy';
      severity = 'severe';
    }

    alerts.push({
      type: 'aqi',
      title: `Air Quality Alert (${Math.round(aqiVal)} AQI)`,
      desc: `Air quality is evaluated as ${level}. Sensitive groups should limit prolonged outdoor tasks.`,
      severity,
    });
  }

  return alerts;
}