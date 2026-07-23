export interface WeatherService {
  // Unit conversions
  cToF(celsius: number): number;
  kmhToMph(kmh: number): number;
  mmToIn(mm: number): number;
  hpaToInhg(hpa: number): number;

  // Weather code classification
  isRainCode(code: number): boolean;
  isSnowCode(code: number): boolean;
  isStormCode(code: number): boolean;
  getWeatherCodeClass(code: number): string;

  // Formatting functions
  formatTemp(temp: number): string;
  formatWind(speed: number, direction: number): string;
  formatPrecip(precip: number): string;
  formatVisibility(vis: number): string;
  formatPressure(pressure: number): string;

  // Weather data retrieval
  getTempClass(temp: number): 'comfortable' | 'cold' | 'hot' | 'unknown';
  getWeatherInfo(weatherCode: number): string;
  getWeatherInfoWithEmoji(weatherCode: number): string;

  // AQI and air quality
  fetchAirQuality(location: { latitude: number, longitude: number }): Promise<{ aqi: number, category: string }>;
  getAQIInfo(aqi: number): string;

  // Historical and forecast data
  fetchHistoricalWeather(location: { latitude: number, longitude: number }, days: number): Promise<any[]>;
  getMoonPhase(date: Date): string;
  getAdvisories(): string[];
  findBestOutdoorWindow(date: Date, maxPrecip: number): string;

  // Units management
  setUnits(units: 'metric' | 'imperial'): void;
  getUnits(): 'metric' | 'imperial';
  PAST_DAYS: number;
  FORECAST_DAYS: number;

  // Comfort and health metrics
  getComfortIndex(temp: number, humidity: number, windSpeed: number, pressure: number): number;
  getComfortLabel(temp: number, humidity: number, windSpeed: number, pressure: number): string;
  getPressureTendency(pressure: number, prevPressure: number): 'rising' | 'falling' | 'steady';
  getWindShift(windDirection: number): string;
  getDecisions(temp: number, humidity: number, pressure: number, windSpeed: number, weatherCode: number): string[];
  getTimelineDeltas(weatherData: any): { time: string, delta: number }[];
  detectAnomaly(weatherData: any): boolean;
  getHistoricalPattern(historicalData: any): string;
  getUpwindPoint(windDir: number, temp: number): { point: string, value: number };
  getConfidenceBands(weatherData: any): { confidence: number, range: number }[];
  computeDiurnalBias(temps: number[], times: string[]): number;
  correctTemperature(temp: number, pressure: number, humidity: number, elevation: number): number;
  getPercentileRank(value: number, data: number[]): number;
  computeTrustScore(weatherData: any): number;
  decomposeSignalNoise(weatherData: any): { signal: number, noise: number };
  getCumulativePrecipProb(precipData: number[], days: number): number;
  getWeatherMomentum(weatherData: any): number;
  getParameterImportance(weatherData: any): string[];
  getFreshnessLabel(timestamp: string): string;
  getTemporalCompression(weatherData: any): number;
  getPollenLevel(weatherCode: number, location: string): number | null;
  getWeeklyUV(location: { latitude: number, longitude: number }): number;
  generateBriefing(weatherData: any): string;
  findAnalogDay(targetDate: Date, historicalData: any): Date;
  getSpatialGradient(weatherData: any): { lat: number, lon: number, value: number };
  classifyWeatherRegime(weatherCode: number): 'stable' | 'change' | 'extreme';
  isRainCode(code: number): boolean;
  isSnowCode(code: number): boolean;
  isStormCode(code: number): boolean;
}

// Additional helper functions for unit tests
export const cToF = (celsius: number): number => (celsius * 9) / 5 + 32;
export const kmhToMph = (kmh: number): number => kmh * 0.621371;
export const mmToIn = (mm: number): number => mm * 0.0393701;
export const hpaToInhg = (hpa: number): number => hpa * 0.02953;
export const getWeatherCodeClass = (code: number): string => {
  if (code >= 0 && code <= 2) return "clear";
  if (code >= 3 && code <= 6) return "cloudy";
  if (code >= 7 && code <= 11) return "rain";
  if (code >= 12 && code <= 15) return "snow";
  if (code >= 16 && code <= 19) return "thunderstorm";
  return "unknown";
};

export const WMO_CODES: Record<number, { description: string; dayIcon: string; nightIcon: string }> = {
  0: { description: "Clear sky", dayIcon: "☀️", nightIcon: "🌙" },
  1: { description: "Mainly clear", dayIcon: "🌤️", nightIcon: "🌙" },
  2: { description: "Partly cloudy", dayIcon: "⛅", nightIcon: "☁️" },
  3: { description: "Overcast", dayIcon: "☁️", nightIcon: "☁️" },
  45: { description: "Foggy", dayIcon: "🌫️", nightIcon: "🌫️" },
  48: { description: "Depositing rime fog", dayIcon: "🌫️", nightIcon: "🌫️" },
  51: { description: "Light drizzle", dayIcon: "🌦️", nightIcon: "🌧️" },
  53: { description: "Moderate drizzle", dayIcon: "🌦️", nightIcon: "🌧️" },
  55: { description: "Dense drizzle", dayIcon: "🌧️", nightIcon: "🌧️" },
  56: { description: "Light freezing drizzle", dayIcon: "🌧️", nightIcon: "🌧️" },
  57: { description: "Dense freezing drizzle", dayIcon: "🌧️", nightIcon: "🌧️" },
  61: { description: "Slight rain", dayIcon: "🌦️", nightIcon: "🌧️" },
  63: { description: "Moderate rain", dayIcon: "🌧️", nightIcon: "🌧️" },
  65: { description: "Heavy rain", dayIcon: "🌧️", nightIcon: "🌧️" },
  66: { description: "Light freezing rain", dayIcon: "🌧️", nightIcon: "🌧️" },
  67: { description: "Heavy freezing rain", dayIcon: "🌧️", nightIcon: "🌧️" },
  71: { description: "Slight snowfall", dayIcon: "🌨️", nightIcon: "🌨️" },
  73: { description: "Moderate snowfall", dayIcon: "🌨️", nightIcon: "🌨️" },
  75: { description: "Heavy snowfall", dayIcon: "❄️", nightIcon: "❄️" },
  77: { description: "Snow grains", dayIcon: "❄️", nightIcon: "❄️" },
  80: { description: "Slight rain showers", dayIcon: "🌦️", nightIcon: "🌧️" },
  81: { description: "Moderate rain showers", dayIcon: "🌧️", nightIcon: "🌧️" },
  82: { description: "Violent rain showers", dayIcon: "⛈️", nightIcon: "⛈️" },
  85: { description: "Slight snow showers", dayIcon: "🌨️", nightIcon: "🌨️" },
  86: { description: "Heavy snow showers", dayIcon: "❄️", nightIcon: "❄️" },
  95: { description: "Thunderstorm", dayIcon: "⛈️", nightIcon: "⛈️" },
  96: { description: "Thunderstorm with slight hail", dayIcon: "⛈️", nightIcon: "⛈️" },
  99: { description: "Thunderstorm with heavy hail", dayIcon: "⛈️", nightIcon: "⛈️" },
};