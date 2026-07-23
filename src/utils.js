/**
 * Pure utility helpers shared across the app.
 * No DOM or network access — safe to import in Node or the browser.
 */
export const cToF = (c) => (c * 9) / 5 + 32;
export const fToC = (f) => ((f - 32) * 5) / 9;
export const kmhToMph = (kmh) => kmh * 0.621371;
export const mphToKmh = (mph) => mph / 0.621371;
export const mmToIn = (mm) => mm * 0.0393701;
export const inToMm = (inch) => inch / 0.0393701;
export const hpaToInhg = (hpa) => hpa * 0.02953;
export const inhgToHpa = (inhg) => inhg / 0.02953;

/**
 * Maps a temperature (°C) to a CSS class for color coding.
 * @param {number|null} temp
 * @returns {string}
 */
export function getTempClass(temp) {
  if (temp === null || temp === undefined) return "temp-neutral";
  if (temp <= 0) return "temp-freezing";
  if (temp <= 10) return "temp-cold";
  if (temp <= 20) return "temp-mild";
  if (temp <= 30) return "temp-warm";
  return "temp-hot";
}
