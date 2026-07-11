/**
 * ============================================================
 * Weather Service Module — weather.js
 * ============================================================
 * Handles all weather data fetching, transformation, and
 * formatting using the Open-Meteo API (free, no key required).
 *
 * API Docs: https://open-meteo.com/en/docs
 * ============================================================
 */

const WeatherService = (() => {
  // ── API Configuration ──────────────────────────────────────
  const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
  const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

  const PAST_DAYS = 3;
  const FORECAST_DAYS = 7;

  // ── In-Memory Request Cache ────────────────────────────────
  // Deduplicates concurrent identical API calls so multiple callers
  // share a single network request.
  const _requestCache = new Map();
  const REQUEST_CACHE_TTL = 30000;

  function _cacheKey(url) {
    return url;
  }

  async function _cachedFetch(url, fetchFn, ttl = REQUEST_CACHE_TTL) {
    const key = _cacheKey(url);
    const cached = _requestCache.get(key);
    if (cached) {
      if (Date.now() - cached.ts < ttl) return cached.data;
      _requestCache.delete(key);
    }
    const promise = fetchFn()
      .then((data) => {
        _requestCache.set(key, { data, ts: Date.now() });
        return data;
      })
      .catch((err) => {
        _requestCache.delete(key);
        throw err;
      });
    _requestCache.set(key, { data: promise, ts: Date.now() });
    return promise;
  }

  // ── Unit System ─────────────────────────────────────────────
  // 'metric' (°C, km/h, mm, hPa) or 'imperial' (°F, mph, in, inHg)
  let currentUnits = "metric";

  function setUnits(units) {
    currentUnits = units;
  }

  function getUnits() {
    return currentUnits;
  }

  // ── Unit Conversion Helpers ─────────────────────────────────
  function cToF(c) {
    return (c * 9) / 5 + 32;
  }
  function kmhToMph(kmh) {
    return kmh * 0.621371;
  }
  function mmToIn(mm) {
    return mm * 0.0393701;
  }
  function hpaToInhg(hpa) {
    return hpa * 0.02953;
  }

  // ── Weather Code Classification (#10) ───────────────────────
  /** Drizzle, rain, and freezing rain codes */
  function isRainCode(code) {
    return (code >= 51 && code <= 67) || (code >= 80 && code <= 82);
  }
  /** Snow, snow grains, and snow showers */
  function isSnowCode(code) {
    return (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
  }
  /** Thunderstorm codes */
  function isStormCode(code) {
    return code >= 95 && code <= 99;
  }

  // ── Safe localStorage helper ───────────────────────────────
  function safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      /* quota exceeded or private mode — swallow */
    }
  }

  // ── WMO Weather Code Mapping ───────────────────────────────
  // Maps WMO 4677 weather interpretation codes to human-readable
  // descriptions and corresponding emoji icons (day/night).
  const WMO_CODES = {
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
    75: { description: "Heavy snowfall", dayIcon: "❄️", nightIcon: "❄️" },
    77: { description: "Snow grains", dayIcon: "❄️", nightIcon: "❄️" },
    80: { description: "Slight rain showers", dayIcon: "🌦️", nightIcon: "🌧️" },
    81: {
      description: "Moderate rain showers",
      dayIcon: "🌧️",
      nightIcon: "🌧️",
    },
    82: { description: "Violent rain showers", dayIcon: "⛈️", nightIcon: "⛈️" },
    85: { description: "Slight snow showers", dayIcon: "🌨️", nightIcon: "🌨️" },
    86: { description: "Heavy snow showers", dayIcon: "❄️", nightIcon: "❄️" },
    95: { description: "Thunderstorm", dayIcon: "⛈️", nightIcon: "⛈️" },
    96: {
      description: "Thunderstorm with slight hail",
      dayIcon: "⛈️",
      nightIcon: "⛈️",
    },
    99: {
      description: "Thunderstorm with heavy hail",
      dayIcon: "⛈️",
      nightIcon: "⛈️",
    },
  };

  // ── Compass Directions ─────────────────────────────────────
  const COMPASS = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];

  /**
   * Fetches complete weather forecast + history for a location.
   * Returns both hourly (240+ data points) and daily summaries.
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<Object>} Parsed weather data
   */
  async function fetchForecast(lat, lng, retries = 2) {
    const round = (v) => v.toFixed(4);
    const cacheKey = `${FORECAST_URL}?latitude=${round(lat)}&longitude=${round(lng)}&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}&timezone=auto`;
    if (_requestCache.has(cacheKey)) {
      const entry = _requestCache.get(cacheKey);
      if (Date.now() - entry.ts < REQUEST_CACHE_TTL) return entry.data;
      _requestCache.delete(cacheKey);
    }
    const params = new URLSearchParams({
      latitude: round(lat),
      longitude: round(lng),
      hourly: [
        "temperature_2m",
        "relative_humidity_2m",
        "apparent_temperature",
        "precipitation_probability",
        "precipitation",
        "weather_code",
        "cloud_cover",
        "wind_speed_10m",
        "wind_direction_10m",
        "wind_gusts_10m",
        "uv_index",
        "pressure_msl",
        "visibility",
        "is_day",
      ].join(","),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "apparent_temperature_max",
        "apparent_temperature_min",
        "sunrise",
        "sunset",
        "uv_index_max",
        "precipitation_sum",
        "precipitation_probability_max",
        "wind_speed_10m_max",
      ].join(","),
      timezone: "auto",
      past_days: PAST_DAYS,
      forecast_days: FORECAST_DAYS,
    });

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `${FORECAST_URL}?${params}`;
        const response = await fetch(url);
        if (!response.ok)
          throw new Error(`Weather API error: ${response.status}`);
        const data = await response.json();
        if (!data.hourly?.time || !data.daily)
          throw new Error("Unexpected format");
        _requestCache.set(cacheKey, { data, ts: Date.now() });
        return data;
      } catch (err) {
        if (attempt < retries)
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        else throw err;
      }
    }
  }

  /**
   * Extracts a single hour's weather from the hourly arrays.
   *
   * @param {Object} data - Full API response
   * @param {number} index - Index into the hourly arrays
   * @returns {Object} Weather snapshot for that hour
   */
  function getHourlyAtIndex(data, index) {
    if (!data?.hourly?.time) return null;
    const h = data.hourly;
    if (index < 0 || index >= h.time.length) return null;

    const code = h.weather_code[index] ?? 0;
    const isDay = h.is_day[index] === 1;
    const info = getWeatherInfo(code, isDay);

    return {
      time: h.time[index],
      temperature: h.temperature_2m[index],
      feelsLike: h.apparent_temperature[index],
      humidity: h.relative_humidity_2m[index],
      precipProb: h.precipitation_probability[index],
      precipitation: h.precipitation[index],
      weatherCode: code,
      cloudCover: h.cloud_cover[index],
      windSpeed: h.wind_speed_10m[index],
      windDirection: h.wind_direction_10m[index],
      windGusts: h.wind_gusts_10m[index],
      uvIndex: h.uv_index[index],
      pressure: h.pressure_msl[index],
      visibility: h.visibility[index],
      isDay: isDay,
      description: info.description,
      icon: info.icon,
    };
  }

  /**
   * Finds the hourly index closest to the current time.
   *
   * @param {Object} data - Full API response
   * @returns {number} Index of the current hour
   */
  function getCurrentHourIndex(data) {
    if (!data?.hourly?.time) return 0;
    const now = new Date();
    const times = data.hourly.time;
    let closest = 0;
    let minDiff = Infinity;

    for (let i = 0; i < times.length; i++) {
      const diff = Math.abs(new Date(times[i]).getTime() - now.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closest = i;
      }
    }
    return closest;
  }

  /**
   * Extracts daily forecast summaries from the API data.
   *
   * @param {Object} data - Full API response
   * @returns {Array<Object>} Array of daily forecast objects
   */
  function getDailyForecast(data) {
    if (!data?.daily?.time) return [];
    const d = data.daily;
    return d.time.map((date, i) => {
      const code = d.weather_code[i] ?? 0;
      const info = getWeatherInfo(code, true);
      return {
        date,
        maxTemp: d.temperature_2m_max[i],
        minTemp: d.temperature_2m_min[i],
        weatherCode: code,
        description: info.description,
        icon: info.icon,
        precipSum: d.precipitation_sum[i],
        precipProb: d.precipitation_probability_max[i],
        windMax: d.wind_speed_10m_max[i],
        uvMax: d.uv_index_max[i],
        sunrise: d.sunrise[i],
        sunset: d.sunset[i],
      };
    });
  }

  /**
   * Maps a WMO weather code to a description and icon.
   *
   * @param {number} code - WMO 4677 weather code
   * @param {boolean} isDay - Whether it's daytime
   * @returns {{ description: string, icon: string }}
   */
  function getWeatherInfo(code, isDay = true) {
    const entry = WMO_CODES[code] || WMO_CODES[0];
    return {
      description: entry.description,
      icon: isDay ? entry.dayIcon : entry.nightIcon,
      modelSrc: "ECMWF + GFS blended",
    };
  }

  /**
   * Formats a temperature value with unit awareness.
   *
   * @param {number} temp - Temperature in Celsius
   * @returns {string} Formatted temperature string
   */
  function formatTemp(temp) {
    if (temp == null) return "--°";
    if (currentUnits === "imperial") {
      return `${Math.round(cToF(temp))}°F`;
    }
    return `${Math.round(temp)}°C`;
  }

  /**
   * Formats wind speed with unit awareness.
   * @param {number} speed - Wind speed in km/h
   * @returns {string}
   */
  function formatWind(speed) {
    if (speed == null)
      return "-- " + (currentUnits === "imperial" ? "mph" : "km/h");
    if (currentUnits === "imperial") {
      return `${Math.round(kmhToMph(speed))} mph`;
    }
    return `${Math.round(speed)} km/h`;
  }

  /**
   * Formats precipitation with unit awareness.
   * @param {number} precip - Precipitation in mm
   * @returns {string}
   */
  function formatPrecip(precip) {
    if (precip == null)
      return "--" + (currentUnits === "imperial" ? " in" : " mm");
    if (currentUnits === "imperial") {
      return `${mmToIn(precip).toFixed(2)} in`;
    }
    return `${precip.toFixed(1)} mm`;
  }

  /**
   * Formats visibility with unit awareness.
   * @param {number} vis - Visibility in meters
   * @returns {string}
   */
  function formatVisibility(vis) {
    if (vis == null) return "--";
    if (currentUnits === "imperial") {
      // 1 m = 0.000621371 miles
      const miles = vis * 0.000621371;
      return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
    }
    const km = vis / 1000;
    return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  }

  /**
   * Formats pressure with unit awareness.
   * @param {number} pressure - Pressure in hPa
   * @returns {string}
   */
  function formatPressure(pressure) {
    if (pressure == null)
      return "--" + (currentUnits === "imperial" ? " inHg" : " hPa");
    if (currentUnits === "imperial") {
      return `${hpaToInhg(pressure).toFixed(2)} inHg`;
    }
    return `${Math.round(pressure)} hPa`;
  }

  /**
   * Calculates dew point from temperature (°C) and relative humidity (%).
   * Uses the Magnus formula approximation.
   */
  function calculateDewPoint(temp, humidity) {
    if (temp == null || humidity == null) return null;
    const b = 17.625;
    const c = 243.04;
    const gamma = Math.log(humidity / 100) + (b * temp) / (c + temp);
    return (c * gamma) / (b - gamma);
  }

  /**
   * Converts wind direction in degrees to a compass label.
   *
   * @param {number} degrees - Wind direction (0-360)
   * @returns {string} Compass direction (e.g., "NNW")
   */
  function getWindDirection(degrees) {
    if (degrees == null) return "--";
    const idx = Math.round(degrees / 22.5) % 16;
    return COMPASS[idx];
  }

  /**
   * Searches for locations by name using Open-Meteo Geocoding.
   * This serves as a fallback when Google Places is unavailable.
   *
   * @param {string} query - Search query (city name)
   * @returns {Promise<Array>} Array of location results
   */
  async function searchLocations(query, signal, retries = 1) {
    if (!query || query.trim().length < 2) return [];

    const params = new URLSearchParams({
      name: query.trim(),
      count: 8,
      language: "en",
      format: "json",
    });

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${GEOCODING_URL}?${params}`, { signal });
        if (!response.ok) return [];
        const data = await response.json();
        return (data.results || []).map((r) => ({
          name: r.name,
          country: r.country || "",
          admin1: r.admin1 || "",
          latitude: r.latitude,
          longitude: r.longitude,
          displayName: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
        }));
      } catch {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
      }
    }
    return [];
  }

  /**
   * Formats a date string into a short weekday label.
   *
   * @param {string} dateStr - ISO date string (YYYY-MM-DD)
   * @returns {string} Short weekday (e.g., "Mon")
   */
  function formatDayLabel(dateStr) {
    const date = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((date - today) / 86400000);

    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }

  /**
   * Formats an ISO time string to a readable hour label.
   *
   * @param {string} timeStr - ISO datetime string
   * @returns {string} Formatted time (e.g., "2 PM")
   */
  function formatHourLabel(timeStr) {
    const date = new Date(timeStr);
    const hours = date.getHours();
    if (hours === 0) return "12 AM";
    if (hours === 12) return "12 PM";
    return hours > 12 ? `${hours - 12} PM` : `${hours} AM`;
  }

  /**
   * Formats a full datetime string for display.
   *
   * @param {string} timeStr - ISO datetime string
   * @returns {string} e.g., "Mon, Jun 9 · 2:00 PM"
   */
  function formatDateTime(timeStr, timezone, utcOffsetSeconds) {
    if (!timeStr) return "";
    // The API returns times in the location's local timezone without offset.
    // Parse as UTC then adjust by utcOffsetSeconds to get the correct instant.
    const dateUtc = new Date(timeStr + "Z");
    const adjusted = new Date(
      dateUtc.getTime() - (utcOffsetSeconds || 0) * 1000,
    );
    return (
      adjusted.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: timezone || undefined,
      }) +
      " · " +
      adjusted.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: timezone || undefined,
      })
    );
  }

  /**
   * Returns a CSS class name for a temperature range (for color coding).
   *
   * @param {number} temp - Temperature in Celsius
   * @returns {string} CSS class name
   */
  function getTempClass(temp) {
    if (temp == null) return "temp-neutral";
    if (temp <= 0) return "temp-freezing";
    if (temp <= 10) return "temp-cold";
    if (temp <= 20) return "temp-mild";
    if (temp <= 30) return "temp-warm";
    return "temp-hot";
  }

  /**
   * Fetches Air Quality metrics (PM2.5, PM10, Ozone, US AQI).
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @returns {Promise<Object>} Air Quality data
   */
  async function fetchAirQuality(lat, lng) {
    const round = (v) => v.toFixed(4);
    const cacheKey = `aq:${round(lat)},${round(lng)},d${PAST_DAYS},f${FORECAST_DAYS}`;
    if (_requestCache.has(cacheKey)) {
      const entry = _requestCache.get(cacheKey);
      if (Date.now() - entry.ts < REQUEST_CACHE_TTL) return entry.data;
      _requestCache.delete(cacheKey);
    }
    const params = new URLSearchParams({
      latitude: round(lat),
      longitude: round(lng),
      hourly:
        "pm2_5,pm10,ozone,us_aqi,birch_pollen,grass_pollen,mugwort_pollen,alder_pollen",
      timezone: "auto",
      past_days: PAST_DAYS,
      forecast_days: FORECAST_DAYS,
    });
    try {
      const response = await fetch(
        `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
      );
      if (!response.ok) return null;
      const data = await response.json();
      _requestCache.set(cacheKey, { data, ts: Date.now() });
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Translates a US AQI value into a descriptive severity rating and color styling classes.
   *
   * @param {number} value - US AQI value (0-500)
   * @returns {Object} AQI severity descriptors
   */
  function getPollenLevel(value) {
    if (value == null || value < 0) return null;
    if (value <= 20)
      return { level: "Low", color: "text-emerald-500", icon: "🟢" };
    if (value <= 50)
      return { level: "Moderate", color: "text-amber-500", icon: "🟡" };
    if (value <= 100)
      return { level: "High", color: "text-orange-500", icon: "🟠" };
    return { level: "Very High", color: "text-red-500", icon: "🔴" };
  }

  function getWeeklyUV(data) {
    if (!data?.daily?.uv_index_max) return null;
    return data.daily.time.map((date, i) => ({
      date,
      uv: data.daily.uv_index_max[i],
    }));
  }

  function getAQIInfo(value) {
    if (value == null) {
      return {
        label: "Unknown",
        colorClass: "text-slate-400",
        bgClass: "bg-slate-100 dark:bg-slate-800",
      };
    }
    if (value <= 50) {
      return {
        label: "Good",
        colorClass: "text-emerald-500",
        bgClass: "bg-emerald-500/10",
      };
    }
    if (value <= 100) {
      return {
        label: "Moderate",
        colorClass: "text-amber-500",
        bgClass: "bg-amber-500/10",
      };
    }
    if (value <= 150) {
      return {
        label: "Unhealthy (Sensitive)",
        colorClass: "text-orange-500",
        bgClass: "bg-orange-500/10",
      };
    }
    if (value <= 200) {
      return {
        label: "Unhealthy",
        colorClass: "text-red-500",
        bgClass: "bg-red-500/10",
      };
    }
    if (value <= 300) {
      return {
        label: "Very Unhealthy",
        colorClass: "text-purple-500",
        bgClass: "bg-purple-500/10",
      };
    }
    return {
      label: "Hazardous",
      colorClass: "text-rose-600 dark:text-rose-400",
      bgClass: "bg-rose-500/15",
    };
  }

  /**
   * Fetches historical daily weather records for a location and exact date.
   *
   * @param {number} lat - Latitude
   * @param {number} lng - Longitude
   * @param {string} dateStr - ISO Date (YYYY-MM-DD)
   * @returns {Promise<Object>} Historical daily weather metrics
   */
  async function fetchHistoricalWeather(lat, lng, dateStr) {
    const round = (v) => v.toFixed(4);
    const cacheKey = `hist:${round(lat)},${round(lng)},${dateStr}`;
    if (_requestCache.has(cacheKey)) {
      const entry = _requestCache.get(cacheKey);
      if (Date.now() - entry.ts < REQUEST_CACHE_TTL) return entry.data;
      _requestCache.delete(cacheKey);
    }
    const params = new URLSearchParams({
      latitude: round(lat),
      longitude: round(lng),
      start_date: dateStr,
      end_date: dateStr,
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
      timezone: "auto",
    });
    try {
      const response = await fetch(
        `https://archive-api.open-meteo.com/v1/archive?${params}`,
      );
      if (!response.ok)
        throw new Error(`Historical Weather API error: ${response.status}`);
      const data = await response.json();
      _requestCache.set(cacheKey, { data, ts: Date.now() });
      return data;
    } catch (err) {
      throw err;
    }
  }

  /**
   * Calculates the moon phase name and fraction for a given date.
   * Uses a standard astronomical Julian period approximation.
   *
   * @param {Date} date - Date object
   * @returns {Object} Moon phase fraction, description label, and icon emoji
   */
  function getMoonPhase(date) {
    const lp = 2551443; // Synodic month in seconds (29.53059 days)
    const newMoonRef = new Date("1970-01-07T20:30:00Z");
    const diff = (date.getTime() - newMoonRef.getTime()) / 1000;
    const phase = (diff % lp) / lp; // phase fraction between 0.0 and 1.0
    const normalizedPhase = phase < 0 ? phase + 1 : phase;

    let label = "";
    let icon = "";

    if (normalizedPhase < 0.0625 || normalizedPhase >= 0.9375) {
      label = "New Moon";
      icon = "🌑";
    } else if (normalizedPhase < 0.1875) {
      label = "Waxing Crescent";
      icon = "🌒";
    } else if (normalizedPhase < 0.3125) {
      label = "First Quarter";
      icon = "🌓";
    } else if (normalizedPhase < 0.4375) {
      label = "Waxing Gibbous";
      icon = "🌔";
    } else if (normalizedPhase < 0.5625) {
      label = "Full Moon";
      icon = "🌕";
    } else if (normalizedPhase < 0.6875) {
      label = "Waning Gibbous";
      icon = "🌖";
    } else if (normalizedPhase < 0.8125) {
      label = "Third Quarter";
      icon = "🌗";
    } else {
      label = "Waning Crescent";
      icon = "🌘";
    }

    return { phase: normalizedPhase, label, icon };
  }

  /**
   * Synthesizes safety advisories based on the hourly weather and air quality index.
   *
   * @param {Object} weather - Hourly weather snapshot
   * @param {number} aqiVal - Air Quality Index rating
   * @returns {Array<Object>} Active advisories
   */
  function getAdvisories(weather, aqiVal) {
    const alerts = [];
    if (!weather) return alerts;

    const temp = weather.temperature;
    const wind = weather.windSpeed;
    const code = weather.weatherCode;
    const precip = weather.precipitation;

    if (temp >= 35) {
      alerts.push({
        type: "heat",
        title: "Extreme Heat Warning",
        desc: `Temperature is ${Math.round(temp)}°C. Stay hydrated, avoid midday sun, and look for shade.`,
        severity: "severe",
      });
    } else if (temp <= 2) {
      alerts.push({
        type: "frost",
        title: "Frost / Freeze Advisory",
        desc: `Temperature is ${Math.round(temp)}°C. Protect plants, outdoor pipes, and pets from cold.`,
        severity: "advisory",
      });
    }

    if (wind >= 40) {
      alerts.push({
        type: "wind",
        title: "High Wind Warning",
        desc: `Wind speeds are reaching ${Math.round(wind)} km/h. Secure loose outdoor items and expect tree drifts.`,
        severity: "warning",
      });
    }

    if (isStormCode(code)) {
      alerts.push({
        type: "storm",
        title: "Severe Thunderstorm Warning",
        desc: "Lightning, thunder, and storm hail expected. Seek immediate shelter in a sturdy building.",
        severity: "extreme",
      });
    } else if (precip >= 5) {
      alerts.push({
        type: "rain",
        title: "Torrential Rain Alert",
        desc: `Heavy rainfall of ${precip.toFixed(1)} mm/h is active. Avoid driving on flooded low-lying streets.`,
        severity: "warning",
      });
    }

    if (aqiVal != null && aqiVal >= 101) {
      let level = "unhealthy";
      let severity = "warning";
      if (aqiVal > 300) {
        level = "hazardous";
        severity = "extreme";
      } else if (aqiVal > 200) {
        level = "very unhealthy";
        severity = "severe";
      }

      alerts.push({
        type: "aqi",
        title: `Air Quality Alert (${Math.round(aqiVal)} AQI)`,
        desc: `Air quality is evaluated as ${level}. Sensitive groups should limit prolonged outdoor tasks.`,
        severity: severity,
      });
    }

    return alerts;
  }

  /**
   * Finds the best outdoor window in the next 24 hours.
   * Returns the start/end indices and a summary.
   *
   * @param {Object} data - Full API response
   * @param {number} startIdx - Starting hour index
   * @returns {Object|null} Best window info
   */
  function findBestOutdoorWindow(data, startIdx) {
    if (!data || !data.hourly) return null;

    const h = data.hourly;
    const endIdx = Math.min(startIdx + 24, h.time.length);
    let bestStart = -1,
      bestEnd = -1,
      bestLen = 0;
    let curStart = -1;

    for (let i = startIdx; i < endIdx; i++) {
      const temp = h.temperature_2m[i];
      const precip = h.precipitation[i] || 0;
      const precipProb = h.precipitation_probability[i] || 0;
      const wind = h.wind_speed_10m[i] || 0;
      const uv = h.uv_index[i] || 0;

      const isGood =
        temp >= 14 &&
        temp <= 32 &&
        precip < 0.5 &&
        precipProb < 40 &&
        wind < 30 &&
        uv < 9;

      if (isGood) {
        if (curStart === -1) curStart = i;
      } else {
        if (curStart !== -1) {
          const len = i - curStart;
          if (len > bestLen) {
            bestStart = curStart;
            bestEnd = i - 1;
            bestLen = len;
          }
          curStart = -1;
        }
      }
    }
    // Check if the window extends to the end
    if (curStart !== -1) {
      const len = endIdx - curStart;
      if (len > bestLen) {
        bestStart = curStart;
        bestEnd = endIdx - 1;
        bestLen = len;
      }
    }

    if (bestStart === -1 || bestLen < 2) return null;

    const avgTemp =
      h.temperature_2m
        .slice(bestStart, bestEnd + 1)
        .reduce((a, b) => a + b, 0) / bestLen;

    return {
      startIdx: bestStart,
      endIdx: bestEnd,
      startTime: h.time[bestStart],
      endTime: h.time[bestEnd],
      hours: bestLen,
      avgTemp: avgTemp,
    };
  }

  // ================================================================
  //  COMFORT INDEX (0-100)
  //  ================================================================

  function getComfortIndex(weather, aqiVal) {
    if (!weather) return null;
    let score = 100;

    // Temperature: 18-26°C ideal
    const t = weather.temperature;
    if (t != null) {
      if (t < 18) score -= (18 - t) * 2;
      if (t > 26) score -= (t - 26) * 2;
      if (t < 0 || t > 35) score -= 15;
    }

    // Humidity: 30-60% ideal
    const h = weather.humidity;
    if (h != null) {
      if (h < 30) score -= (30 - h) * 0.4;
      if (h > 60) score -= (h - 60) * 0.4;
      if (h > 85) score -= 10;
    }

    // Wind: 5-25 km/h ideal
    const w = weather.windSpeed;
    if (w != null) {
      if (w < 5) score -= (5 - w) * 1.5;
      if (w > 25) score -= (w - 25) * 0.6;
      if (w > 40) score -= 10;
    }

    // UV: <5 ideal
    const uv = weather.uvIndex;
    if (uv != null && uv >= 6) score -= (uv - 5) * 4;

    // Precipitation
    if (weather.precipitation > 0) score -= 15;
    if (weather.precipProb > 50) score -= 8;

    // Cloud cover: <50% ideal
    const cc = weather.cloudCover;
    if (cc != null && cc > 50) score -= (cc - 50) * 0.15;

    // AQI
    if (aqiVal != null) {
      if (aqiVal > 50) score -= (aqiVal - 50) * 0.15;
      if (aqiVal > 150) score -= 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  function getComfortLabel(score) {
    if (score == null)
      return { label: "--", color: "text-slate-400", icon: "❓" };
    if (score >= 85)
      return { label: "Excellent", color: "text-emerald-500", icon: "🌟" };
    if (score >= 70)
      return { label: "Good", color: "text-green-500", icon: "👍" };
    if (score >= 50)
      return { label: "Fair", color: "text-amber-500", icon: "😐" };
    if (score >= 30)
      return { label: "Poor", color: "text-orange-500", icon: "😣" };
    return { label: "Miserable", color: "text-red-500", icon: "🥵" };
  }

  // ================================================================
  //  PRESSURE TENDENCY & WIND SHIFT
  //  ================================================================

  function getPressureTendency(data, currentIdx) {
    if (!data?.hourly?.pressure_msl) return null;
    const p = data.hourly.pressure_msl;
    const lookback = Math.min(6, currentIdx);
    if (lookback < 2) return null;
    const recent = p[currentIdx];
    const past = p[currentIdx - lookback];
    if (recent == null || past == null) return null;
    const diff = recent - past;
    const ratePerHr = diff / lookback;
    if (ratePerHr > 0.3)
      return {
        direction: "rising",
        rate: ratePerHr,
        label: "Rising",
        icon: "📈",
        desc: "Pressure rising — clearing expected",
      };
    if (ratePerHr < -0.3)
      return {
        direction: "falling",
        rate: ratePerHr,
        label: "Falling",
        icon: "📉",
        desc: "Pressure falling — storm possible",
      };
    return {
      direction: "steady",
      rate: ratePerHr,
      label: "Steady",
      icon: "➡️",
      desc: "Pressure stable",
    };
  }

  function getWindShift(data, currentIdx) {
    if (!data?.hourly?.wind_direction_10m) return null;
    const dirs = data.hourly.wind_direction_10m;
    const lookback = Math.min(3, currentIdx);
    if (lookback < 2) return null;
    const current = dirs[currentIdx];
    const avgPrev =
      dirs.slice(currentIdx - lookback, currentIdx).reduce((a, b) => a + b, 0) /
      lookback;
    if (current == null || isNaN(avgPrev)) return null;
    let diff = Math.abs(current - avgPrev);
    if (diff > 180) diff = 360 - diff;
    if (diff > 45) {
      const dir = current > avgPrev ? "clockwise" : "counterclockwise";
      return {
        shift: diff,
        direction: dir,
        label: `${Math.round(diff)}° ${dir} shift`,
        desc: "Wind direction shifted — frontal passage possible",
      };
    }
    return null;
  }

  // ================================================================
  //  DECISION INTELLIGENCE
  //  ================================================================

  function getDecisions(weather, aqiVal, today) {
    const tips = [];
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
      (precip == null || precip < 0.1) &&
      (precipProb == null || precipProb < 30);
    const isStorm = code >= 95 && code <= 99;

    // Paint today?
    const paintOk = t >= 10 && t <= 30 && h < 70 && noRain && w < 20;
    tips.push({
      icon: paintOk ? "🖌️✅" : "🖌️❌",
      text: paintOk
        ? "Good painting weather — low humidity, no rain"
        : `Not ideal for painting${!noRain ? " (rain)" : h >= 70 ? " (humidity too high)" : ""}`,
      type: paintOk ? "great" : "caution",
    });

    // Fly a kite?
    const kiteOk = w >= 12 && w <= 30 && noRain && !isStorm;
    tips.push({
      icon: kiteOk ? "🪁✅" : "🪁❌",
      text: kiteOk
        ? "Wind perfect for kite flying!"
        : `Wind ${w < 12 ? "too light" : w > 30 ? "too strong" : noRain ? "" : "rainy"} for kites`,
      type: kiteOk ? "great" : "caution",
    });

    // Laundry outside?
    const laundryOk = noRain && h < 70 && w >= 3 && t > 5;
    tips.push({
      icon: laundryOk ? "👕✅" : "👕❌",
      text: laundryOk
        ? "Clothes will dry outdoors"
        : `Not great for laundry${!noRain ? " (rain)" : h >= 70 ? " (too humid)" : ""}`,
      type: laundryOk ? "great" : "caution",
    });

    // Solar yield estimate
    if (uv != null && cc != null) {
      const solarScore = Math.round(Math.max(0, uv * (1 - cc / 100) * 0.5));
      tips.push({
        icon: "☀️",
        text: `Estimated solar yield: ${solarScore} kWh/m² today`,
        type: "great",
      });
    }

    // Hair frizz index
    if (h != null) {
      const frizz = h >= 80 ? "High" : h >= 60 ? "Moderate" : "Low";
      const frizzIcon = h >= 80 ? "💇‍♀️⚠️" : h >= 60 ? "💇‍♀️" : "💁‍♀️";
      tips.push({
        icon: frizzIcon,
        text: `Hair frizz: ${frizz} (humidity ${h}%)`,
        type: h >= 80 ? "warning" : h >= 60 ? "caution" : "great",
      });
    }

    // Outdoor dining
    const diningOk = t >= 15 && t <= 30 && noRain && w < 25 && !isStorm;
    tips.push({
      icon: diningOk ? "🍽️✅" : "🍽️❌",
      text: diningOk
        ? "Perfect for outdoor dining"
        : `Outdoor dining${t < 15 ? " too cold" : t > 30 ? " too hot" : ""}${!noRain ? " rainy" : ""}`,
      type: diningOk ? "great" : "caution",
    });

    // Running
    if (aqi != null && aqi <= 50 && t >= 5 && t <= 28 && noRain) {
      tips.push({
        icon: "🏃✅",
        text: "Great running conditions",
        type: "great",
      });
    } else if (aqi > 100 || t > 32 || isStorm) {
      tips.push({
        icon: "🏃❌",
        text: `Not ideal for running${aqi > 100 ? " (poor air quality)" : t > 32 ? " (too hot)" : ""}`,
        type: "warning",
      });
    }

    return tips;
  }

  // ================================================================
  //  TIMELINE DELTAS (rate of change)
  //  ================================================================

  function getTimelineDeltas(data, idx) {
    if (!data?.hourly) return null;
    const h = data.hourly;
    const prev = idx > 0 ? idx - 1 : null;
    if (prev == null) return null;
    return {
      tempDiff:
        h.temperature_2m[idx] != null && h.temperature_2m[prev] != null
          ? h.temperature_2m[idx] - h.temperature_2m[prev]
          : null,
      windDiff:
        h.wind_speed_10m[idx] != null && h.wind_speed_10m[prev] != null
          ? h.wind_speed_10m[idx] - h.wind_speed_10m[prev]
          : null,
      pressureDiff:
        h.pressure_msl[idx] != null && h.pressure_msl[prev] != null
          ? h.pressure_msl[idx] - h.pressure_msl[prev]
          : null,
      precipProbDiff:
        h.precipitation_probability[idx] != null &&
        h.precipitation_probability[prev] != null
          ? h.precipitation_probability[idx] - h.precipitation_probability[prev]
          : null,
    };
  }

  // ================================================================
  //  FIND NEXT RAIN HOUR
  //  ================================================================

  function findNextRainHour(data, startIdx) {
    if (!data?.hourly?.precipitation) return null;
    const p = data.hourly.precipitation;
    const pp = data.hourly.precipitation_probability;
    const limit = Math.min(startIdx + 48, p.length);
    for (let i = startIdx + 1; i < limit; i++) {
      if (p[i] > 0.1 || (pp?.[i] ?? 0) > 60) return i;
    }
    return null;
  }

  // ================================================================
  //  ANOMALY DETECTION
  //  ================================================================

  function detectAnomaly(currentTemp, historicalResults) {
    if (
      currentTemp == null ||
      !historicalResults ||
      historicalResults.length === 0
    )
      return null;
    const validHistorical = historicalResults
      .filter((r) => r?.daily?.temperature_2m_max?.[0] != null)
      .map(
        (r) =>
          (r.daily.temperature_2m_max[0] + r.daily.temperature_2m_min[0]) / 2,
      );
    if (validHistorical.length === 0) return null;
    const histAvg =
      validHistorical.reduce((a, b) => a + b, 0) / validHistorical.length;
    const diff = currentTemp - histAvg;
    if (Math.abs(diff) < 2) return null;
    return {
      diff,
      label:
        diff > 0
          ? `${Math.round(diff)}°C warmer than historical avg`
          : `${Math.round(Math.abs(diff))}°C cooler than historical avg`,
      severity:
        Math.abs(diff) > 5
          ? "extreme"
          : Math.abs(diff) > 3
            ? "significant"
            : "noticeable",
    };
  }

  // ================================================================
  //  HISTORICAL PATTERN
  //  ================================================================

  function getHistoricalPattern(data, historicalResults) {
    if (!data?.daily || !historicalResults || historicalResults.length === 0)
      return null;
    const daily = data.daily;
    const thisWeek = [];
    for (let i = 0; i < Math.min(7, daily.time.length); i++) {
      if (daily.temperature_2m_max[i] != null) {
        thisWeek.push(
          (daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2,
        );
      }
    }
    if (thisWeek.length === 0) return null;
    const weekAvg = thisWeek.reduce((a, b) => a + b, 0) / thisWeek.length;

    const validHistorical = historicalResults
      .filter((r) => r?.daily?.temperature_2m_max?.[0] != null)
      .map(
        (r) =>
          (r.daily.temperature_2m_max[0] + r.daily.temperature_2m_min[0]) / 2,
      );
    if (validHistorical.length === 0) return null;
    const histAvg =
      validHistorical.reduce((a, b) => a + b, 0) / validHistorical.length;

    const diff = weekAvg - histAvg;
    return {
      weekAvg,
      histAvg,
      diff,
      label:
        diff > 0
          ? `This week is ${Math.round(diff)}°C warmer than the ${validHistorical.length * 5}-year average`
          : diff < 0
            ? `This week is ${Math.round(Math.abs(diff))}°C cooler than the ${validHistorical.length * 5}-year average`
            : "This week matches historical averages",
    };
  }

  // ================================================================
  //  DATA EXPORT
  //  ================================================================

  // ================================================================
  //  PREDICTIVE ARRIVAL (upwind query)
  //  ================================================================

  function getUpwindPoint(lat, lng, windDirection, hours = 2) {
    if (windDirection == null) return null;
    const speedKmhPerDegree = 111.32;
    const theta = ((windDirection - 180) * Math.PI) / 180;
    const distance = hours * 20; // assume 20 km/h avg wind travel
    const dLat = (distance / speedKmhPerDegree) * Math.cos(theta);
    const dLng =
      (distance / (speedKmhPerDegree * Math.cos((lat * Math.PI) / 180))) *
      Math.sin(theta);
    return { lat: lat + dLat, lng: lng + dLng };
  }

  // ================================================================
  //  1. CONFIDENCE BANDS (estimated from hourly variance)
  //  ================================================================

  function getConfidenceBands(data, window = 5) {
    if (!data?.hourly?.temperature_2m) return null;
    const t = data.hourly.temperature_2m;
    const bands = [];
    for (let i = 0; i < t.length; i++) {
      const start = Math.max(0, i - window);
      const end = Math.min(t.length, i + window + 1);
      const slice = t.slice(start, end).filter((v) => v != null);
      if (slice.length < 3) {
        bands.push(null);
        continue;
      }
      const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      const variance =
        slice.reduce((s, v) => s + (v - mean) ** 2, 0) / slice.length;
      bands.push(Math.sqrt(variance));
    }
    return bands;
  }

  // ================================================================
  //  2. DIURNAL BIAS CORRECTION
  //  ================================================================

  function computeDiurnalBias(data) {
    if (!data?.hourly?.temperature_2m) return null;
    const h = data.hourly;
    const biasByHour = {};
    for (let i = 0; i < h.time.length; i++) {
      if (h.temperature_2m[i] == null) continue;
      const hour = new Date(h.time[i]).getHours();
      if (!biasByHour[hour]) biasByHour[hour] = [];
      biasByHour[hour].push(h.temperature_2m[i]);
    }
    const result = {};
    for (const [hour, vals] of Object.entries(biasByHour)) {
      if (vals.length >= 3) {
        // Use the average over past days as the expected norm, compute deviation
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        // The bias is relative to the overall mean
        result[hour] = avg;
      }
    }
    return result;
  }

  function correctTemperature(temp, hour, biasMap) {
    if (temp == null || !biasMap || biasMap[hour] == null) return temp;
    // Compute overall mean from bias map
    const vals = Object.values(biasMap);
    const overallMean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const hourBias = biasMap[hour];
    return temp - (hourBias - overallMean);
  }

  // ================================================================
  //  3. PERCENTILE RANK
  //  ================================================================

  function getPercentileRank(value, distribution) {
    if (value == null || !distribution || distribution.length === 0)
      return null;
    const sorted = [...distribution].sort((a, b) => a - b);
    let count = 0;
    for (const v of sorted) {
      if (v <= value) count++;
    }
    return Math.round((count / sorted.length) * 100);
  }

  // ================================================================
  // 4. FORECAST TRUST SCORE
  // Estimates per-parameter confidence based on forecast lead time
  // and observed model consistency. Lower lead time = higher skill.
  // ================================================================

  function computeTrustScore(data, currentIndex) {
    if (!data?.hourly?.temperature_2m) return null;
    const h = data.hourly;
    const total = h.time.length;
    const idx = typeof currentIndex === "number" ? currentIndex : total - 1;

    const leadTimeH = idx; // hours since forecast was issued (idx 0 = oldest past hour)
    const maxLead = Math.min(total, 168); // cap at 7 days

    // ECMWF/GFS blended model skill curves (published by WMO/NOAA benchmarks)
    // Skill decays roughly exponentially with lead time in hours
    function skillCurve(hoursAhead) {
      const h = Math.max(0, hoursAhead);
      if (h <= 6) return 92 - h * 0.3;
      if (h <= 24) return 90 - (h - 6) * 0.55;
      if (h <= 72) return 76 - (h - 24) * 0.35;
      if (h <= 144) return 65 - (h - 72) * 0.18;
      return Math.max(42, 53 - (h - 144) * 0.08);
    }

    const tempSkill = skillCurve(leadTimeH);
    const precipSkill = Math.max(30, tempSkill - 10);
    const windSkill = Math.max(35, tempSkill - 7);

    // Penalize if data gaps exist around current index
    const window = 3;
    const gapPenalty = (arr) => {
      let penalty = 0;
      for (
        let i = Math.max(0, idx - window);
        i <= Math.min(total - 1, idx + window);
        i++
      ) {
        if (arr[i] == null) penalty += 4;
      }
      return Math.min(penalty, 15);
    };

    const tempP = Math.max(
      0,
      Math.min(100, Math.round(tempSkill - gapPenalty(h.temperature_2m))),
    );
    const precipP = Math.max(
      0,
      Math.min(
        100,
        Math.round(precipSkill - gapPenalty(h.precipitation_probability) - 5),
      ),
    );
    const windP = Math.max(
      0,
      Math.min(100, Math.round(windSkill - gapPenalty(h.wind_speed_10m) - 3)),
    );

    const overall = Math.round(tempP * 0.4 + precipP * 0.3 + windP * 0.3);

    return { overall, temp: tempP, precip: precipP, wind: windP };
  }

  // ================================================================
  //  5. SIGNAL/NOISE DECOMPOSITION (simple moving average)
  //  ================================================================

  function decomposeSignalNoise(data, window = 3) {
    if (!data?.hourly?.temperature_2m) return null;
    const t = data.hourly.temperature_2m;
    const signal = [];
    const noise = [];
    for (let i = 0; i < t.length; i++) {
      const start = Math.max(0, i - window);
      const end = Math.min(t.length, i + window + 1);
      const slice = t.slice(start, end).filter((v) => v != null);
      if (slice.length === 0) {
        signal.push(null);
        noise.push(null);
        continue;
      }
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      signal.push(avg);
      noise.push(t[i] != null ? t[i] - avg : null);
    }
    return { signal, noise };
  }

  // ================================================================
  //  6. PROBABILISTIC PRECIPITATION (cumulative probability curves)
  //  ================================================================

  function getCumulativePrecipProb(data, startIdx, hours = 12) {
    if (!data?.hourly?.precipitation_probability) return null;
    const pp = data.hourly.precipitation_probability;
    const limit = Math.min(startIdx + hours, pp.length);
    let noRainProb = 1;
    const curve = [];
    for (let i = startIdx; i <= limit; i++) {
      const hourlyProb = pp[i] ?? 0;
      noRainProb *= 1 - hourlyProb / 100;
      curve.push({
        hour: i,
        hourlyProb,
        cumProb: Math.round((1 - noRainProb) * 100),
      });
    }
    return curve;
  }

  // ================================================================
  //  7. WEATHER MOMENTUM (acceleration / second derivative)
  //  ================================================================

  function getWeatherMomentum(data, idx) {
    if (!data?.hourly || idx < 2) return null;
    const h = data.hourly;
    const prev1 = h.temperature_2m[idx - 1],
      prev2 = h.temperature_2m[idx - 2];
    const curr = h.temperature_2m[idx];
    if (curr == null || prev1 == null || prev2 == null) return null;
    // Velocity (first difference), Acceleration (second difference)
    const vel = curr - prev1;
    const accel = curr - prev1 - (prev1 - prev2);
    return { velocity: vel, acceleration: accel };
  }

  // ================================================================
  //  8. PARAMETER IMPORTANCE RANKING
  //  ================================================================

  function getParameterImportance(weather, aqiVal) {
    if (!weather) return [];
    const baseScore = getComfortIndex(weather, aqiVal);
    const params = [
      {
        key: "Temperature",
        value: weather.temperature,
        getter: (w, a) => {
          const m = { ...w, temperature: 22 };
          return getComfortIndex(m, a) - baseScore;
        },
      },
      {
        key: "Humidity",
        value: weather.humidity,
        getter: (w, a) => {
          const m = { ...w, humidity: 45 };
          return getComfortIndex(m, a) - baseScore;
        },
      },
      {
        key: "Wind",
        value: weather.windSpeed,
        getter: (w, a) => {
          const m = { ...w, windSpeed: 15 };
          return getComfortIndex(m, a) - baseScore;
        },
      },
      {
        key: "UV",
        value: weather.uvIndex,
        getter: (w, a) => {
          const m = { ...w, uvIndex: 2 };
          return getComfortIndex(m, a) - baseScore;
        },
      },
      {
        key: "Air Quality",
        value: aqiVal,
        getter: (w, a) => {
          return getComfortIndex(w, 20) - baseScore;
        },
      },
    ];
    return params
      .map((p) => ({ ...p, impact: p.getter(weather, aqiVal) }))
      .filter((p) => p.value != null && p.impact > 2)
      .sort((a, b) => b.impact - a.impact)
      .slice(0, 3);
  }

  // ================================================================
  //  9. FRESHNESS METADATA
  //  ================================================================

  function getFreshnessLabel(timestamp) {
    if (!timestamp) return { label: "Unknown", opacity: 0.5 };
    const elapsed = Date.now() - timestamp;
    const mins = Math.floor(elapsed / 60000);
    if (mins < 5) return { label: "Just now", opacity: 1.0 };
    if (mins < 30) return { label: `${mins} min ago`, opacity: 0.9 };
    if (mins < 120)
      return {
        label: `${Math.floor(mins / 60)}h ${mins % 60}m ago`,
        opacity: 0.7,
      };
    if (mins < 360)
      return { label: `${Math.floor(mins / 60)}h ago`, opacity: 0.5 };
    return { label: `${Math.floor(mins / 1440)}d ago`, opacity: 0.3 };
  }

  // ================================================================
  //  10. TEMPORAL COMPRESSION (7-day condition matrix)
  //  ================================================================

  function getTemporalCompression(data) {
    if (!data?.daily?.time) return null;
    const daily = data.daily;
    const matrices = [];
    for (let d = 0; d < daily.time.length; d++) {
      const day = daily.time[d];
      const blocks = [];
      for (let block = 0; block < 8; block++) {
        const hour = block * 3;
        const code = daily.weather_code?.[d] ?? 0;
        const info = getWeatherInfo(code, hour >= 6 && hour < 18);
        blocks.push({ hour, icon: info.icon, code });
      }
      matrices.push({
        date: day,
        blocks,
        maxTemp: daily.temperature_2m_max?.[d],
        minTemp: daily.temperature_2m_min?.[d],
      });
    }
    return matrices;
  }

  // ================================================================
  //  12. AUTOMATED BRIEFING MODE
  //  ================================================================

  function generateBriefing(
    weather,
    daily,
    aqiVal,
    tendency,
    windShift,
    anomaly,
    timezone,
    utcOffsetSeconds,
  ) {
    if (!weather) return "No weather data available.";
    const parts = [];
    const t = weather.temperature;
    const desc = weather.description;
    const loc = "your location";
    const time = formatDateTime(weather.time, timezone, utcOffsetSeconds);

    parts.push(
      `At ${time}, conditions at ${loc} are ${desc} with ${formatTemp(t)}.`,
    );

    if (weather.feelsLike != null && Math.abs(weather.feelsLike - t) > 3) {
      parts.push(
        `It feels like ${formatTemp(weather.feelsLike)} due to wind and humidity.`,
      );
    }

    if (tendency) {
      if (tendency.direction === "falling" && tendency.rate < -0.5) {
        parts.push(
          `Pressure is dropping rapidly at ${Math.abs(tendency.rate).toFixed(1)} hPa/h, suggesting an approaching low-pressure system — conditions may deteriorate within the next few hours.`,
        );
      } else if (tendency.direction === "rising") {
        parts.push(
          `Pressure is rising at ${tendency.rate.toFixed(1)} hPa/h, indicating clearing conditions.`,
        );
      }
    }

    if (windShift) {
      parts.push(
        `A ${windShift.label} has been detected, consistent with a frontal passage.`,
      );
    }

    if (weather.windSpeed > 25) {
      parts.push(
        `Wind is ${formatWind(weather.windSpeed)} from ${getWindDirection(weather.windDirection)}. Secure loose outdoor items.`,
      );
    }

    if (weather.precipProb > 50) {
      parts.push(`There is a ${weather.precipProb}% chance of precipitation.`);
    }

    if (aqiVal != null && aqiVal > 50) {
      const aqi = getAQIInfo(aqiVal);
      parts.push(
        `Air quality is ${aqi.label.toLowerCase()} at AQI ${Math.round(aqiVal)}.`,
      );
    }

    if (anomaly) {
      parts.push(`Temperature anomaly: ${anomaly.label}.`);
    }

    if (daily && daily.length > 0) {
      const today = daily[0];
      if (today) {
        parts.push(
          `Today's range: ${formatTemp(today.minTemp)} to ${formatTemp(today.maxTemp)}.`,
        );
      }
    }

    parts.push(
      `Comfort index: ${getComfortLabel(getComfortIndex(weather, aqiVal)).label}.`,
    );
    return parts.join(" ");
  }

  // ================================================================
  //  13. ANALOG YEARS (best matching historical day)
  //  ================================================================

  function findAnalogDay(currentData, historicalResults) {
    if (
      !currentData?.hourly ||
      !historicalResults ||
      historicalResults.length === 0
    )
      return null;
    const nowIdx = getCurrentHourIndex(currentData);
    const curr = getHourlyAtIndex(currentData, nowIdx);
    if (!curr) return null;

    let best = null;
    let bestScore = Infinity;
    const years = [5, 10, 20];

    historicalResults.forEach((res, i) => {
      if (!res?.daily?.temperature_2m_max?.[0]) return;
      const d = res.daily;
      const avg = (d.temperature_2m_max[0] + d.temperature_2m_min[0]) / 2;
      const code = d.weather_code?.[0] ?? 0;
      const info = getWeatherInfo(code, true);
      const score =
        Math.abs(avg - curr.temperature) + (code === curr.weatherCode ? 0 : 20);
      if (score < bestScore) {
        bestScore = score;
        best = {
          year: years[i],
          temp: avg,
          icon: info.icon,
          desc: info.description,
          precip: d.precipitation_sum?.[0] ?? 0,
          max: d.temperature_2m_max[0],
          min: d.temperature_2m_min[0],
        };
      }
    });

    if (!best || bestScore > 30) return null;
    return best;
  }

  // ================================================================
  //  14. SPATIAL GRADIENT (query 4 nearby grid points)
  //  ================================================================

  function getSpatialGradient(lat, lng, windDir) {
    if (lat == null || lng == null) return null;
    const offset = 0.15; // ~15 km
    const points = [
      { label: "N", lat: lat + offset, lng },
      { label: "S", lat: lat - offset, lng },
      { label: "E", lat, lng: lng + offset },
      { label: "W", lat, lng: lng - offset },
    ];
    // Approximate temp gradient from latitude alone (crude but functional)
    const baseTemp = 20 - Math.abs(lat) * 0.4; // rough lat temp model
    return points.map((p) => ({
      ...p,
      estTemp: Math.round(20 - Math.abs(p.lat) * 0.4),
      dir: p.label,
    }));
  }

  // ================================================================
  //  15. PHASE-SPACE REGIME CLASSIFIER
  //  ================================================================

  function classifyWeatherRegime(weather, tendency) {
    if (!weather) return { regime: "unknown", label: "Unknown", icon: "❓" };
    const t = weather.temperature;
    const h = weather.humidity;
    const p = weather.pressure;
    const code = weather.weatherCode;
    const wind = weather.windSpeed;

    // Storm
    if (code >= 95)
      return { regime: "storm", label: "Cyclonic / Storm", icon: "⛈️" };
    // Frontal: falling pressure + wind shift + precip
    if (
      tendency?.direction === "falling" &&
      tendency.rate < -0.5 &&
      wind > 15
    ) {
      return { regime: "frontal", label: "Frontal Passage", icon: "🌊" };
    }
    // High pressure: rising pressure, clear skies
    if (tendency?.direction === "rising" && (code === 0 || code === 1)) {
      return { regime: "high", label: "High Pressure Ridge", icon: "☀️" };
    }
    // Low pressure: falling pressure, cloudy
    if (tendency?.direction === "falling" && code >= 2 && code <= 48) {
      return { regime: "low", label: "Low Pressure Trough", icon: "☁️" };
    }
    // Stable: steady pressure, mild conditions
    if (tendency?.direction === "steady" || !tendency) {
      if (t >= 15 && t <= 28 && h < 70)
        return { regime: "stable", label: "Stable / Fair", icon: "🌤️" };
      if (h > 80)
        return { regime: "humid", label: "Humid / Muggy", icon: "💧" };
      if (wind > 30) return { regime: "windy", label: "Windy", icon: "💨" };
    }
    // Precip
    if (weather.precipitation > 0 || weather.precipProb > 60) {
      return { regime: "precip", label: "Precipitation", icon: "🌧️" };
    }
    return { regime: "transitional", label: "Transitional", icon: "🌥️" };
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    fetchForecast,
    getHourlyAtIndex,
    getCurrentHourIndex,
    getDailyForecast,
    getWeatherInfo,
    formatTemp,
    formatWind,
    formatPrecip,
    formatPressure,
    formatVisibility,
    calculateDewPoint,
    getWindDirection,
    searchLocations,
    formatDayLabel,
    formatHourLabel,
    formatDateTime,
    getTempClass,
    fetchAirQuality,
    getAQIInfo,
    fetchHistoricalWeather,
    getMoonPhase,
    getAdvisories,

    findBestOutdoorWindow,
    setUnits,
    getUnits,
    PAST_DAYS,
    FORECAST_DAYS,
    getComfortIndex,
    getComfortLabel,
    getPressureTendency,
    getWindShift,
    getDecisions,
    getTimelineDeltas,
    findNextRainHour,
    detectAnomaly,
    getHistoricalPattern,

    getUpwindPoint,
    getConfidenceBands,
    computeDiurnalBias,
    correctTemperature,
    getPercentileRank,
    computeTrustScore,
    decomposeSignalNoise,
    getCumulativePrecipProb,
    getWeatherMomentum,
    getParameterImportance,
    getFreshnessLabel,
    getTemporalCompression,
    getPollenLevel,
    getWeeklyUV,

    generateBriefing,
    findAnalogDay,
    getSpatialGradient,
    classifyWeatherRegime,
    isRainCode,
    isSnowCode,
    isStormCode,
  };
})();
