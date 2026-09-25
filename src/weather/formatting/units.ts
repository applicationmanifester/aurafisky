/**
 * Unit conversion utilities.
 * Consolidated from weather.js and src/utils.js.
 */

// Temperature
export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const fToC = (f: number): number => ((f - 32) * 5) / 9;

// Wind speed
export const kmhToMph = (kmh: number): number => kmh * 0.621371;
export const mphToKmh = (mph: number): number => mph / 0.621371;

// Precipitation
export const mmToIn = (mm: number): number => mm * 0.0393701;
export const inToMm = (inch: number): number => inch / 0.0393701;

// Pressure
export const hpaToInhg = (hpa: number): number => hpa * 0.02953;
export const inhgToHpa = (inhg: number): number => inhg / 0.02953;

/**
 * Calculate dew point from temperature (°C) and relative humidity (%).
 * Uses the Magnus formula approximation.
 */
export function calculateDewPoint(temp: number | null, humidity: number | null): number | null {
  if (temp == null || humidity == null) return null;
  const b = 17.625;
  const c = 243.04;
  const gamma = Math.log(humidity / 100) + (b * temp) / (c + temp);
  return (c * gamma) / (b - gamma);
}

/**
 * Convert wind direction in degrees to a compass label.
 */
export function getWindDirection(degrees: number | null): string {
  if (degrees == null) return '--';
  const COMPASS = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  const idx = Math.round(degrees / 22.5) % 16;
  return COMPASS[idx];
}