/**
 * Stargazing score and golden/blue hour windows.
 */

import type { StargazingScore, GoldenBlueHourWindow } from '../types.js';
import { THRESHOLDS } from '../constants.js';

/**
 * Calculate stargazing quality score (0-100).
 * Based on cloud cover and moon illumination.
 */
export function getStargazingScore(
  cloudCoverPct: number | null,
  moonPhaseFraction: number | null
): StargazingScore | null {
  if (cloudCoverPct == null) return null;

  const { STARGAZING } = THRESHOLDS;
  const phase = moonPhaseFraction ?? 0;

  // Illumination fraction from phase angle: 0 at new moon, 1 at full
  const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2;

  let score = 100;
  score -= cloudCoverPct * STARGAZING.CLOUD_WEIGHT;
  score -= illumination * STARGAZING.MOON_WEIGHT;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let label: string;
  let icon: string;

  if (score >= 85) {
    label = 'Excellent';
    icon = '🌌';
  } else if (score >= 65) {
    label = 'Good';
    icon = '✨';
  } else if (score >= 40) {
    label = 'Fair';
    icon = '🌥️';
  } else if (score >= 15) {
    label = 'Poor';
    icon = '☁️';
  } else {
    label = 'Washed Out';
    icon = '🌫️';
  }

  return { score, label, icon, illumination };
}

/**
 * Calculate golden hour / blue hour windows around sunrise/sunset.
 * Uses fixed-offset approximations (photography-standard).
 */
export function getGoldenBlueHourWindows(
  sunrise: string | Date | null,
  sunset: string | Date | null,
  now: Date
): GoldenBlueHourWindow | null {
  if (!sunrise || !sunset) return null;

  const rise = new Date(sunrise);
  const set = new Date(sunset);
  if (!Number.isFinite(rise.getTime()) || !Number.isFinite(set.getTime())) return null;

  const MIN = 60_000;
  const windows = [
    { label: 'Morning Blue Hour', start: new Date(rise.getTime() - 30 * MIN), end: rise },
    { label: 'Morning Golden Hour', start: rise, end: new Date(rise.getTime() + 60 * MIN) },
    { label: 'Evening Golden Hour', start: new Date(set.getTime() - 60 * MIN), end: set },
    { label: 'Evening Blue Hour', start: set, end: new Date(set.getTime() + 30 * MIN) },
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const w of windows) {
    if (now <= w.end) return w;
  }
  return null;
}