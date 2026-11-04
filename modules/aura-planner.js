/**
 * @fileoverview Multi-Objective Pareto Outdoor Activity Planner
 * Aura of Sky Live (Aurafisky v19.0.0) — Module 6.5 Standards
 * 
 * Ranks the exact top 3 optimal micro-windows across the 168-hour forecast week
 * tailored to sports or fieldwork constraints (runner, cyclist, agronomist, astrophotographer, hiker).
 */

export class AuraOutdoorPlanner {
  static PERSONAS = {
    runner: {
      name: '🏃 Runner / Cardio',
      idealTemp: [12, 18],
      maxWindSpeed: 20,
      maxPrecipProb: 15,
      preferDaylight: true,
      weights: { temp: 0.35, wind: 0.25, precip: 0.30, aqi: 0.10 },
    },
    cyclist: {
      name: '🚴 Road Cyclist',
      idealTemp: [15, 23],
      maxWindSpeed: 18,
      maxPrecipProb: 10,
      preferDaylight: true,
      weights: { wind: 0.40, precip: 0.35, temp: 0.15, aqi: 0.10 },
    },
    agronomist: {
      name: '🌾 Agronomist (Spraying & Fieldwork)',
      idealTemp: [14, 25],
      maxWindSpeed: 14, // Critical for pesticide drift avoidance
      maxPrecipProb: 5,
      preferDaylight: true,
      weights: { wind: 0.45, precip: 0.35, temp: 0.10, et0: 0.10 },
    },
    astrophotographer: {
      name: '🔭 Astrophotographer / Stargazer',
      idealTemp: [5, 20],
      maxWindSpeed: 25,
      maxPrecipProb: 5,
      preferDaylight: false, // Night only
      weights: { cloud: 0.50, moon: 0.25, transparency: 0.15, wind: 0.10 },
    },
    hiker: {
      name: '🥾 Hiker / Trail Trekker',
      idealTemp: [14, 22],
      maxWindSpeed: 28,
      maxPrecipProb: 20,
      preferDaylight: true,
      weights: { precip: 0.35, temp: 0.30, wind: 0.20, uv: 0.15 },
    },
  };

  /**
   * Evaluates the 168-hour forecast and extracts the top 3 ranked micro-windows
   * 
   * @param {Object} weatherData Open-Meteo hourly forecast
   * @param {keyof typeof AuraOutdoorPlanner.PERSONAS} [personaKey='runner']
   * @param {number} [durationHours=3] Window duration in consecutive hours
   * @returns {Array<{ startIdx: number, endIdx: number, startTime: string, endTime: string, score: number, rating: string, reason: string }>}
   */
  findOptimalWindows(weatherData, personaKey = 'runner', durationHours = 3) {
    if (!weatherData?.hourly?.time) return [];

    const persona = AuraOutdoorPlanner.PERSONAS[personaKey] || AuraOutdoorPlanner.PERSONAS.runner;
    const hourly = weatherData.hourly;
    const totalHours = hourly.time.length;

    const scoredHours = [];

    // 1. Score each single hour [0..100]
    for (let i = 0; i < totalHours; i++) {
      const timeStr = hourly.time[i];
      const hourNum = parseInt(timeStr.split('T')[1].split(':')[0], 10);
      const temp = hourly.temperature_2m?.[i] ?? 20;
      const precipProb = hourly.precipitation_probability?.[i] ?? 0;
      const precipMm = hourly.precipitation?.[i] ?? 0;
      const windSpeed = hourly.wind_speed_10m?.[i] ?? 10;
      const cloudCover = hourly.cloud_cover?.[i] ?? 30;

      const isNight = hourNum < 6 || hourNum >= 20;

      // Penalize daytime mismatch
      if (persona.preferDaylight && isNight) {
        scoredHours.push(0);
        continue;
      }
      if (!persona.preferDaylight && !isNight) {
        scoredHours.push(0);
        continue;
      }

      // Disqualify immediate hard bounds
      if (precipMm > 1.0 || precipProb > 60 || windSpeed > persona.maxWindSpeed * 1.5) {
        scoredHours.push(0);
        continue;
      }

      // Objective scores (0 to 1)
      // Temp score
      const [tMin, tMax] = persona.idealTemp;
      let tempScore = 1.0;
      if (temp < tMin) tempScore = Math.max(0, 1 - (tMin - temp) / 10);
      else if (temp > tMax) tempScore = Math.max(0, 1 - (temp - tMax) / 10);

      // Wind score
      const windScore = Math.max(0, 1 - windSpeed / persona.maxWindSpeed);

      // Precip score
      const precipScore = Math.max(0, 1 - precipProb / persona.maxPrecipProb);

      // Cloud score (especially for astronomy)
      const cloudScore = Math.max(0, 1 - cloudCover / 100);

      // Weighted sum
      const weights = persona.weights;
      let hourScore = 0;

      if (personaKey === 'astrophotographer') {
        hourScore = (cloudScore * 0.6 + windScore * 0.2 + tempScore * 0.2) * 100;
      } else {
        hourScore =
          (tempScore * (weights.temp || 0.3) +
            windScore * (weights.wind || 0.3) +
            precipScore * (weights.precip || 0.3) +
            cloudScore * 0.1) *
          100;
      }

      scoredHours.push(Math.round(hourScore));
    }

    // 2. Slide window of durationHours across scoredHours
    const candidateWindows = [];
    for (let i = 0; i <= totalHours - durationHours; i++) {
      let windowSum = 0;
      let windowMin = 100;
      for (let j = 0; j < durationHours; j++) {
        const score = scoredHours[i + j];
        windowSum += score;
        if (score < windowMin) windowMin = score;
      }

      // Window is only valid if no hour was completely disqualified (0)
      if (windowMin > 35) {
        const avgScore = Math.round(windowSum / durationHours);
        candidateWindows.push({
          startIdx: i,
          endIdx: i + durationHours,
          score: avgScore,
        });
      }
    }

    // 3. Non-maximum suppression to avoid overlapping windows
    candidateWindows.sort((a, b) => b.score - a.score);

    const selected = [];
    for (const win of candidateWindows) {
      const overlaps = selected.some(
        (sel) => Math.abs(sel.startIdx - win.startIdx) < durationHours + 2
      );
      if (!overlaps) {
        selected.push(win);
        if (selected.length >= 3) break;
      }
    }

    // 4. Format output with dates and descriptive rationale
    return selected.map((win, rank) => {
      const startTime = hourly.time[win.startIdx];
      const endTime = hourly.time[win.endIdx];
      const tStart = hourly.temperature_2m?.[win.startIdx] ?? 20;
      const wStart = hourly.wind_speed_10m?.[win.startIdx] ?? 10;
      const pStart = hourly.precipitation_probability?.[win.startIdx] ?? 0;

      let rating = '⭐️⭐️⭐️ Excellent';
      if (win.score < 80) rating = '⭐️⭐️ Very Good';
      if (win.score < 65) rating = '⭐️ Good';

      const reason = `${Math.round(tStart)}°C, ${Math.round(wStart)} km/h wind, ${pStart}% rain chance`;

      return {
        rank: rank + 1,
        startIdx: win.startIdx,
        endIdx: win.endIdx,
        startTime,
        endTime,
        score: win.score,
        rating,
        reason,
      };
    });
  }
}
