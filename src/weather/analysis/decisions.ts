/**
 * Decision intelligence - activity recommendations based on weather.
 */

import type { HourlyWeather, DecisionTip } from '../types.js';
import { isStormCode } from '../constants.js';

/**
 * Generate activity recommendations for current conditions.
 */
export function getDecisions(
  weather: HourlyWeather | null,
  aqiVal: number | null,
  _today: Date
): DecisionTip[] {
  const tips: DecisionTip[] = [];
  if (!weather) return tips;

  const t = weather.temperature;
  const h = weather.humidity;
  const w = weather.windSpeed;
  const uv = weather.uvIndex;
  const precip = weather.precipitation;
  const precipProb = weather.precipProb;
  const cc = weather.cloudCover;
  const code = weather.weatherCode;
  const aqi = aqiVal;

  const noRain =
    (precip == null || precip < 0.1) && (precipProb == null || precipProb < 30);
  const isStorm = isStormCode(code);

  // Paint today?
  const paintOk = t != null && t >= 10 && t <= 30 && (h ?? 0) < 70 && noRain && (w ?? 0) < 20;
  tips.push({
    icon: paintOk ? '🖌️✅' : '🖌️❌',
    text: paintOk
      ? 'Good painting weather — low humidity, no rain'
      : `Not ideal for painting${!noRain ? ' (rain)' : (h ?? 0) >= 70 ? ' (humidity too high)' : ''}`,
    type: paintOk ? 'great' : 'caution',
  });

  // Fly a kite?
  const kiteOk = w != null && w >= 12 && w <= 30 && noRain && !isStorm;
  tips.push({
    icon: kiteOk ? '🪁✅' : '🪁❌',
    text: kiteOk
      ? 'Wind perfect for kite flying!'
      : `Wind ${w != null && w < 12 ? 'too light' : w != null && w > 30 ? 'too strong' : noRain ? '' : 'rainy'} for kites`,
    type: kiteOk ? 'great' : 'caution',
  });

  // Laundry outside?
  const laundryOk = noRain && (h ?? 0) < 70 && (w ?? 0) >= 3 && (t ?? 0) > 5;
  tips.push({
    icon: laundryOk ? '👕✅' : '👕❌',
    text: laundryOk
      ? 'Clothes will dry outdoors'
      : `Not great for laundry${!noRain ? ' (rain)' : (h ?? 0) >= 70 ? ' (too humid)' : ''}`,
    type: laundryOk ? 'great' : 'caution',
  });

  // Solar yield estimate
  if (uv != null && cc != null) {
    const solarScore = Math.round(Math.max(0, uv * (1 - cc / 100) * 0.5));
    tips.push({
      icon: '☀️',
      text: `Estimated solar yield: ${solarScore} kWh/m² today`,
      type: 'great',
    });
  }

  // Hair frizz index
  if (h != null) {
    const frizz = h >= 80 ? 'High' : h >= 60 ? 'Moderate' : 'Low';
    const frizzIcon = h >= 80 ? '💇‍♀️⚠️' : h >= 60 ? '💇‍♀️' : '💁‍♀️';
    tips.push({
      icon: frizzIcon,
      text: `Hair frizz: ${frizz} (humidity ${h}%)`,
      type: h >= 80 ? 'warning' : h >= 60 ? 'caution' : 'great',
    });
  }

  // Outdoor dining
  const diningOk = t != null && t >= 15 && t <= 30 && noRain && (w ?? 0) < 25 && !isStorm;
  tips.push({
    icon: diningOk ? '🍽️✅' : '🍽️❌',
    text: diningOk
      ? 'Perfect for outdoor dining'
      : `Outdoor dining${t != null && t < 15 ? ' too cold' : t != null && t > 30 ? ' too hot' : ''}${!noRain ? ' rainy' : ''}`,
    type: diningOk ? 'great' : 'caution',
  });

  // Running
  if (aqi != null && aqi <= 50 && t != null && t >= 5 && t <= 28 && noRain) {
    tips.push({
      icon: '🏃✅',
      text: 'Great running conditions',
      type: 'great',
    });
  } else if (aqi != null && (aqi > 100 || (t != null && t > 32) || isStorm)) {
    tips.push({
      icon: '🏃❌',
      text: `Not ideal for running${aqi > 100 ? ' (poor air quality)' : t != null && t > 32 ? ' (too hot)' : ''}`,
      type: 'warning',
    });
  }

  return tips;
}