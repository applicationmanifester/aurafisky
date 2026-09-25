/**
 * AQI and pollen level classification utilities.
 */

import type { AQIInfo, PollenLevel } from '../types.js';

/**
 * Map an AQI value to label and CSS color classes.
 */
export function getAQIInfo(aqi: number | null): AQIInfo {
  if (aqi == null) return { label: 'Unknown', colorClass: 'text-slate-400', bgClass: 'bg-slate-100' };
  if (aqi <= 50) return { label: 'Good', colorClass: 'text-green-600', bgClass: 'bg-green-100' };
  if (aqi <= 100) return { label: 'Moderate', colorClass: 'text-yellow-600', bgClass: 'bg-yellow-100' };
  if (aqi <= 150) return { label: 'Unhealthy (Sensitive)', colorClass: 'text-orange-500', bgClass: 'bg-orange-100' };
  if (aqi <= 200) return { label: 'Unhealthy', colorClass: 'text-red-500', bgClass: 'bg-red-100' };
  if (aqi <= 300) return { label: 'Very Unhealthy', colorClass: 'text-purple-600', bgClass: 'bg-purple-100' };
  return { label: 'Hazardous', colorClass: 'text-rose-700', bgClass: 'bg-rose-100' };
}

/**
 * Map a pollen count (grains/m³) to a qualitative level.
 */
export function getPollenLevel(count: number | null): PollenLevel {
  if (count == null) return { level: 'Unknown', color: 'text-slate-400', icon: '❓' };
  if (count <= 15) return { level: 'Low', color: 'text-green-500', icon: '🟢' };
  if (count <= 50) return { level: 'Moderate', color: 'text-yellow-500', icon: '🟡' };
  if (count <= 100) return { level: 'High', color: 'text-orange-500', icon: '🟠' };
  return { level: 'Very High', color: 'text-red-500', icon: '🔴' };
}
