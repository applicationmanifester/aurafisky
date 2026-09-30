// WeatherService.js - Encapsulates weather data fetching and transformation
class WeatherService {
  constructor() {
    this.FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
    this.GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
    this.PAST_DAYS = 3;
    this.FORECAST_DAYS = 7;
    this._requestCache = new Map();
    this._geocodingCache = new Map();
    this.REQUEST_CACHE_TTL = 30000;
    this.MAX_CACHE_SIZE = 50;
    this.currentUnits = "metric";
  }

  // ── Cache Management ──────────────────────────────────────
  _setCache(key, value) {
    if (this._requestCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this._requestCache.keys().next().value;
      this._requestCache.delete(oldestKey);
    }
    this._requestCache.set(key, value);
  }

  _cacheKey(url, options = {}) {
    return url + '|' + JSON.stringify(options);
  }

  async _cachedFetch(url, fetchFn, ttl = this.REQUEST_CACHE_TTL, options = {}) {
    const key = this._cacheKey(url, options);
    const cached = this._requestCache.get(key);
    if (cached) {
      if (Date.now() - cached.ts < ttl) return cached.data;
      this._requestCache.delete(key);
    }
    const promise = fetchFn()
      .then((data) => {
        this._setCache(key, { data, ts: Date.now() });
        return data;
      })
      .catch((err) => {
        this._requestCache.delete(key);
        throw err;
      });
    this._setCache(key, { data: promise, ts: Date.now() });
    return promise;
  }

  // ── Unit System ─────────────────────────────────────────────
  setUnits(units) {
    this.currentUnits = units;
  }

  getUnits() {
    return this.currentUnits;
  }

  // ── Unit Conversion Helpers ─────────────────────────────────
  cToF(c) {
    return (c * 9) / 5 + 32;
  }

  kmhToMph(kmh) {
    return kmh * 0.621371;
  }

  mmToIn(mm) {
    return mm * 0.0393701;
  }

  hpaToInhg(hpa) {
    return hpa * 0.02953;
  }

  // ── Weather Code Classification ─────────────────────────────
  isRainCode(code) {
    return (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  }

  isSnowCode(code) {
    return (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  }

  isStormCode(code) {
    return code >= 95 && code <= 99;
  }

  getWeatherCodeClass(code) {
    if (this.isStormCode(code)) return "storm";
    if (this.isSnowCode(code)) return "snow";
    if (this.isRainCode(code)) return "rain";
    if (code === 3) return "cloudy";
    if (code === 45 || code === 48) return "fog";
    return "clear";
  }

  // ── Safe localStorage helper ───────────────────────────────
  safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* quota exceeded or private mode — swallow */
    }
  }

  // ── WMO Weather Code Mapping ───────────────────────────────
  getWMO_CODES() {
    return {
      0: { description: "Clear sky", dayIcon: "☀️", nightIcon: "🌙" },
      1: { description: "Mainly clear", dayIcon: "🌤️", nightIcon: "🌙" },
      2: { description: "Partly cloudy", dayIcon: "⛅", nightIcon: "☁️" },
      3: { description: "Overcast", dayIcon: "☁️", nightIcon: "☁️" },
      45: { description: "Foggy", dayIcon: "🌫️", nightIcon: "🌫️" },
      48: { description: "Depositing rime fog", dayIcon: "🌫️", nightIcon: "🌫️" },
      51: { description: "Light drizzle", dayIcon: "🌦️", nightIcon: "🌧️" },
      53: { description: "Moderate drizzle", dayIcon: "🌦️", nightIcon: "🌧️" },
      55: { description: "Dense drizzle", dayIcon: "🌧️", nightIcon: "🌧️" },
      56: {
        description: "Light freezing drizzle",
        dayIcon: "🌧️",
        nightIcon: "🌧️",
      },
      57: {
        description: "Dense freezing drizzle",
        dayIcon: "🌧️",
        nightIcon: "🌧️",
      },
      61: { description: "Slight rain", dayIcon: "🌦️", nightIcon: "🌧️" },
      63: { description: "Moderate rain", dayIcon: "🌧️", nightIcon: "🌧️" },
      65: { description: "Heavy rain", dayIcon: "🌧️", nightIcon: "🌧️" },
      66: { description: "Light freezing rain", dayIcon: "🌧️", nightIcon: "🌧️" },
      67: { description: "Heavy freezing rain", dayIcon: "🌧️", nightIcon: "🌧️" },
      71: { description: "Slight snowfall", dayIcon: "🌨️", nightIcon: "🌨️" },
      73: { description: "Moderate snowfall", dayIcon: "🌨️", nightIcon: "🌨️" },
      75: { description: "Heavy snowfall", dayIcon: "🌨️", nightIcon: "🌨️" },
      77: { description: "Snow grains", dayIcon: "🌨️", nightIcon: "🌨️" },
      80: { description: "Slight rain showers", dayIcon: "🌦️", nightIcon: "🌧️" },
      81: { description: "Moderate rain showers", dayIcon: "🌧️", nightIcon: "🌧️" },
      82: { description: "Violent rain showers", dayIcon: "🌧️", nightIcon: "🌧️" },
      85: { description: "Slight snow showers", dayIcon: "🌨️", nightIcon: "🌨️" },
      86: { description: "Heavy snow showers", dayIcon: "🌨️", nightIcon: "🌨️" },
      95: { description: "Thunderstorm", dayIcon: "⛈️", nightIcon: "⛈️" },
      96: { description: "Thunderstorm with slight hail", dayIcon: "⛈️", nightIcon: "⛈️" },
      99: { description: "Thunderstorm with heavy hail", dayIcon: "⛈️", nightIcon: "⛈️" },
    };
  }

  // ── Geocoding ───────────────────────────────────────────────
  async geocode(query) {
    const key = this._cacheKey(this.GEOCODING_URL, { q: query });
    return this._cachedFetch(
      this.GEOCODING_URL,
      () => fetch(`${this.GEOCODING_URL}?name=${encodeURIComponent(query)}&count=1`).then((r) => r.json()),
      this.REQUEST_CACHE_TTL * 5, // geocoding cache longer
      { q: query }
    );
  }

  // ── Forecast ────────────────────────────────────────────────
  async fetchForecast(latitude, longitude) {
    const url = this.FORECAST_URL;
    const params = {
      latitude,
      longitude,
      hourly:"temperature_2m,relativehumidity_2m,dewpoint_2m,apparent_temperature,precipitation_probability,precipitation,rain,snowfall,snowdepth,weathercode,cloudcover,wind_speed_10m,wind_direction_10m,windgusts_10m,pressure_msl,surface_pressure"
        .split(",")
        .join(","),
      daily:"weathercode,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,rain_sum,snowfall_sum,precipitation_probability_max,windspeed_10m_max,windgusts_10m_max,winddirection_10m_dominant"
        .split(",")
        .join(","),
      past_days:this.PAST_DAYS,
      forecast_days:this.FORECAST_DAYS,
      timezone:"auto",
    };
    const queryString = new URLSearchParams(params).toString();
    const fullUrl = `${url}?${queryString}`;
    return this._cachedFetch(fullUrl, () => fetch(fullUrl).then((r) => r.json()), this.REQUEST_CACHE_TTL, params);
  }

  // ── Format Current Weather for UI ───────────────────────────
  formatCurrentWeather(data) {
    if (!data || !data.hourly) return null;
    const hourIndex = data.hourly.time.findIndex((t) => t === data.hourly.time[0]); // now
    const code = data.hourly.weathercode[hourIndex];
    const temp = data.hourly.temperature_2m[hourIndex];
    const feelsLike = data.hourly.apparent_temperature[hourIndex];
    const windSpeed = data.hourly.wind_speed_10m[hourIndex];
    const windDir = data.hourly.wind_direction_10m[hourIndex];
    const humidity = data.hourly.relativehumidity_2m[hourIndex];
    const pressure = data.hourly.pressure_msl[hourIndex];
    const precip = data.hourly.precipitation[hourIndex];
    const isDay = data.hourly.weathercode[hourIndex] !== null && data.hourly.weathercode[hourIndex] < 3; // simple day/night

    const wmoCodes = this.getWMO_CODES();
    const { description, dayIcon, nightIcon } = wmoCodes[code] || wmoCodes[0];

    return {
      temperature: this.currentUnits === "metric" ? temp : this.cToF(temp),
      feelsLike: this.currentUnits === "metric" ? feelsLike : this.cToF(feelsLike),
      condition: description,
      icon: isDay ? dayIcon : nightIcon,
      windSpeed: this.currentUnits === "metric" ? windSpeed : this.kmhToMph(windSpeed),
      windDirection: windDir,
      humidity,
      pressure: this.currentUnits === "metric" ? pressure : this.hpaToInhg(pressure),
      precipitation: this.currentUnits === "metric" ? precip : this.mmToIn(precip),
      isDay,
    };
  }

  // ── Format Forecast Data for UI ─────────────────────────────
  formatForecastData(data) {
    if (!data || !data.daily) return [];
    const wmoCodes = this.getWMO_CODES();
    return data.daily.time.map((date, i) => {
      const code = data.daily.weathercode[i];
      const { description, dayIcon, nightIcon } = wmoCodes[code] || wmoCodes[0];
      return {
        date,
        maxTemp: this.currentUnits === "metric" ? data.daily.temperature_2m_max[i] : this.cToF(data.daily.temperature_2m_max[i]),
        minTemp: this.currentUnits === "metric" ? data.daily.temperature_2m_min[i] : this.cToF(data.daily.temperature_2m_min[i]),
        description,
        icon: dayIcon, // using day icon for daily forecast
        precipSum: this.currentUnits === "metric" ? data.daily.precipitation_sum[i] : this.mmToIn(data.daily.precipitation_sum[i]),
        precipProbability: data.daily.precipitation_probability_max[i],
        windSpeed: this.currentUnits === "metric" ? data.daily.windspeed_10m_max[i] : this.kmhToMph(data.daily.windspeed_10m_max[i]),
        windDirection: data.daily.winddirection_10m_dominant[i],
      };
    });
  }

  // ── Clear Cache ─────────────────────────────────────────────
  clearCache() {
    this._requestCache.clear();
    this._geocodingCache.clear();
  }
}

// Export as a singleton instance
const weatherServiceInstance = new WeatherService();
export default weatherServiceInstance;
export { WeatherService };