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
  const _geocodingCache = new Map();
  const REQUEST_CACHE_TTL = 300000;
  const MAX_CACHE_SIZE = 50;

  function _setCache(key, value) {
    if (_requestCache.size >= MAX_CACHE_SIZE) {
      // Map preserves insertion order, so the first key is the oldest
      const oldestKey = _requestCache.keys().next().value;
      _requestCache.delete(oldestKey);
    }
    _requestCache.set(key, value);
  }

  function _cacheKey(url, options = {}) {
    // Include all request-determining params in key to avoid collisions
    return url + '|' + JSON.stringify(options);
  }

  async function _cachedFetch(url, fetchFn, ttl = REQUEST_CACHE_TTL, options = {}) {
    const key = _cacheKey(url, options);
    const cached = _requestCache.get(key);
    if (cached) {
      if (Date.now() - cached.ts < ttl) return cached.data;
      _requestCache.delete(key);
    }
    // Store promise IMMEDIATELY so concurrent callers share it (fixes race condition)
    const promise = fetchFn()
      .then((data) => {
        _setCache(key, { data, ts: Date.now() });
        return data;
      })
      .catch((err) => {
        _requestCache.delete(key);
        throw err;
      });
    // Store the promise itself as cached data so concurrent callers receive the same promise
    _setCache(key, { data: promise, ts: Date.now() });
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
  function getWeatherCodeClass(code) {
    if (isStormCode(code)) return "storm";
    if (isSnowCode(code)) return "snow";
    if (isRainCode(code)) return "rain";
    if (code === 3) return "cloudy";
    if (code === 45 || code === 48) return "fog";
    return "clear";
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
  async function fetchForecast(lat, lng, retries = 3, signal) {
    const round = (v) => v.toFixed(4);
    const cacheKey = `${FORECAST_URL}?latitude=${round(lat)}&longitude=${round(lng)}&past_days=${PAST_DAYS}&forecast_days=${FORECAST_DAYS}&timezone=auto`;
    let staleData = null;
    if (_requestCache.has(cacheKey)) {
      const entry = _requestCache.get(cacheKey);
      if (entry) {
        if (Date.now() - entry.ts < REQUEST_CACHE_TTL) {
          return entry.data instanceof Promise ? await entry.data : entry.data;
        }
        if (entry.data && !(entry.data instanceof Promise) && entry.data.hourly?.time) {
          staleData = entry.data;
        }
      }
    }

    const fetchPromise = (async () => {
      // Extended variable set: everything the device-adaptive weather card
      // displays (sunshine duration, storm potential, freezing level, gust
      // maxima, dominant wind, daylight). If the API ever rejects an unknown
      // variable we transparently fall back to the legacy set below.
      const buildParams = (extended) =>
        new URLSearchParams({
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
            ...(extended
              ? ["sunshine_duration", "cape", "freezing_level_height"]
              : []),
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
            ...(extended
              ? [
                  "wind_gusts_10m_max",
                  "wind_direction_10m_dominant",
                  "daylight_duration",
                ]
              : []),
          ].join(","),
          ...(extended
            ? {
                minutely_15: [
                  "precipitation",
                  "precipitation_probability",
                  "weather_code",
                ].join(","),
              }
            : {}),
          timezone: "auto",
          past_days: PAST_DAYS,
          forecast_days: FORECAST_DAYS,
        });

      let params = buildParams(true);
      let useExtended = true;

      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const url = `${FORECAST_URL}?${params}`;
          const timeoutCtrl = new AbortController();
          const timer = setTimeout(() => timeoutCtrl.abort(), 6000);
          let response;
          try {
            response = await fetch(url, { signal: signal || timeoutCtrl.signal });
          } finally {
            clearTimeout(timer);
          }
          if (!response.ok) {
            // Only on 400 (Bad Request): fallback to legacy non-extended parameter set.
            // On 503/502/429 (Server Overload), retrying the same payload with extended=false is wasteful.
            if (useExtended && response.status === 400) {
              useExtended = false;
              params = buildParams(false);
              attempt--;
              continue;
            }
            const err = new Error(`Weather API error: ${response.status}`);
            err.status = response.status;
            const retryAfter = response.headers?.get?.("Retry-After");
            if (retryAfter) {
              const sec = parseInt(retryAfter, 10);
              if (!isNaN(sec)) err.retryAfterMs = sec * 1000;
            }
            throw err;
          }
          const data = await response.json();
          if (!data.hourly?.time || !data.daily)
            throw new Error("Unexpected format");
          _setCache(cacheKey, { data, ts: Date.now() });
          return data;
        } catch (err) {
          if (attempt < retries) {
            let delay = 300 * Math.pow(2, attempt);
            if (err.status === 429 || String(err).includes("429")) {
              const backoff = 1500 * Math.pow(2, attempt) + Math.random() * 500;
              delay = err.retryAfterMs ? Math.max(err.retryAfterMs, backoff) : backoff;
            }
            await new Promise((r) => setTimeout(r, delay));
          } else {
            if (staleData) {
              console.warn("Weather API rate-limited (429) or unavailable; falling back to cached forecast.", err);
              _setCache(cacheKey, { data: staleData, ts: Date.now() - (REQUEST_CACHE_TTL - 60000) });
              return staleData;
            }
            _requestCache.delete(cacheKey);
            throw err;
          }
        }
      }
    })();

    _setCache(cacheKey, { data: fetchPromise, ts: Date.now() });
    return await fetchPromise;
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
      cape: h.cape?.[index],
      freezingLevel: h.freezing_level_height?.[index],
      isDay: isDay,
      description: info.description,
      icon: info.icon,
    };
  }

  /**
   * Finds the hourly index closest to the current time.
   *
   * @param {Object} data - Full API response
   * @param {number} [utcOffsetSeconds=0] - Timezone offset in seconds
   * @returns {number} Index of the current hour
   */
  function getCurrentHourIndex(data, utcOffsetSeconds = 0) {
    if (!data?.hourly?.time || !data.hourly.time.length) return 0;
    const times = data.hourly.time;
    const tz = data.timezone;

    if (tz) {
      try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          hour12: false,
        });
        const parts = formatter.formatToParts(now);
        let year, month, day, hour;
        for (const p of parts) {
          if (p.type === "year") year = p.value;
          if (p.type === "month") month = p.value;
          if (p.type === "day") day = p.value;
          if (p.type === "hour") {
            let h = parseInt(p.value, 10);
            if (h === 24) h = 0;
            hour = h.toString().padStart(2, "0");
          }
        }
        const targetStr = `${year}-${month}-${day}T${hour}:00`;
        const exactIdx = times.indexOf(targetStr);
        if (exactIdx !== -1) return exactIdx;

        const targetPrefix = `${year}-${month}-${day}T${hour}`;
        const prefixIdx = times.findIndex((t) => t.startsWith(targetPrefix));
        if (prefixIdx !== -1) return prefixIdx;
      } catch (e) {
        // Fallback to offset-based matching below
      }
    }

    const now = new Date();
    const nowInLocation = now.getTime() + (utcOffsetSeconds || 0) * 1000;
    let closest = 0;
    let minDiff = Infinity;

    for (let i = 0; i < times.length; i++) {
      const t = new Date(times[i] + "Z").getTime();
      const diff = Math.abs(t - nowInLocation);
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
   * Formats a duration given in seconds as a compact "Xh Ym" string.
   * Used for daylight duration & sunshine duration displays.
   */
  function formatDuration(seconds) {
    if (seconds == null || !isFinite(seconds)) return "--";
    const totalMinutes = Math.round(seconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  /**
   * Formats CAPE (Convective Available Potential Energy, J/kg) into a
   * human-friendly "storm potential" label. Higher = more unstable air.
   */
  function formatCAPE(cape) {
    if (cape == null || !isFinite(cape)) return "--";
    if (cape < 300) return `${Math.round(cape)} J/kg · Stable`;
    if (cape < 1000) return `${Math.round(cape)} J/kg · Marginal`;
    if (cape < 2500) return `${Math.round(cape)} J/kg · Moderate`;
    return `${Math.round(cape)} J/kg · Strong`;
  }

  /**
   * Formats the freezing level altitude (meters above sea level).
   * Unit-aware: km (metric) or ft (imperial).
   */
  function formatFreezingLevel(meters) {
    if (meters == null || !isFinite(meters)) return "--";
    if (currentUnits === "imperial") {
      const ft = meters * 3.28084;
      return `${Math.round(ft / 100) * 100} ft`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  /**
   * Formats a precipitation probability (0-100) as a percentage string.
   */
  function formatPrecipProb(prob) {
    if (prob == null || !isFinite(prob)) return "--";
    return `${Math.round(prob)}%`;
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

  // ── Location Search (Geocoding) ─────────────────────────────
  // GeoNames / OSM feature codes the app surfaces as human labels.
  const FEATURE_LABELS = {
    PPLC: "Capital",
    PPLA: "Regional Capital",
    PPLA2: "Regional Capital",
    PPLX: "District",
    PPL: "City",
    PPLA3: "Town",
    PPLA4: "Town",
    PPLL: "Village",
    PPLF: "Village",
    PPLS: "Settlement",
    PCLI: "Country",
    ISL: "Island",
    ISLS: "Islands",
    MT: "Mountain",
    MTS: "Mountains",
    AIRP: "Airport",
    PRT: "Port",
    BCH: "Beach",
    HBR: "Harbor",
    RSTN: "Station",
    LK: "Lake",
    Reserve: "Reserve",
    PARK: "Park",
  };

  /** Browser's preferred BCP-47 language, safe fallback to "en". */
  function _getUserLanguage() {
    try {
      const lang = navigator.language || (navigator.languages && navigator.languages[0]) || "en";
      return String(lang).split(/[-_,]/)[0] || "en";
    } catch (e) {
      return "en";
    }
  }

  /**
   * Converts an ISO-3166 alpha-2 country code into its flag emoji.
   * Falls back to a pin for missing/invalid codes or full country names.
   */
  function getCountryFlag(countryOrCode) {
    if (!countryOrCode || typeof countryOrCode !== "string") return "📍";
    const code = countryOrCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return "📍";
    try {
      return String.fromCodePoint(
        ...[...code].map((ch) => 127397 + ch.charCodeAt(0)),
      );
    } catch (e) {
      return "📍";
    }
  }

  /** Human label for a GeoNames/OSM feature code ("PPLC" → "Capital"). */
  function getFeatureLabel(featureCode) {
    if (!featureCode) return "";
    return FEATURE_LABELS[featureCode] || "";
  }

  /** Compact population format: 8808000 → "8.8M", 940000 → "940k". */
  function formatPopulation(population) {
    if (population == null || !isFinite(population) || population < 1000)
      return "";
    if (population >= 1000000) {
      const m = population / 1000000;
      return `${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
    }
    return `${Math.round(population / 1000)}k`;
  }

  /**
   * Ranks search results by relevance and removes duplicates.
   * Scoring: exact name match > prefix match > substring match,
   * then population (log-scaled) and capital-city status as tiebreakers.
   */
  function rankAndDedupeResults(results, query) {
    const q = (query || "").trim().toLowerCase();
    const seen = new Set();
    const scored = [];
    for (const r of results || []) {
      if (!r || r.latitude == null || r.longitude == null) continue;
      const key = [
        (r.name || "").toLowerCase(),
        (r.admin1 || "").toLowerCase(),
        (r.country || "").toLowerCase(),
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);

      let score = 0;
      const n = (r.name || "").toLowerCase();
      // Short queries (≤3 chars) are rarely complete words — "lon" should
      // surface London, not the 424-person hamlet of "Lon" — so the exact
      // bonus is deliberately weaker for them. Full-word queries keep a
      // strong bonus that population prominence cannot override.
      const exactBonus = q.length <= 3 ? 60 : 150;
      if (q && n === q) score -= exactBonus;
      else if (q && n.startsWith(q)) score -= 50;
      else if (q && n.includes(q)) score -= 20;
      // Population prominence (log-scaled, zero below 1k, capped): a prefix
      // match on London must outrank an exact match on a tiny hamlet.
      if (r.population && r.population >= 1000) {
        score -= Math.min(100, Math.max(0, (Math.log10(r.population) - 3) * 30));
      }
      if (r.featureCode === "PPLC") score -= 15;
      if (typeof r.importance === "number") score -= r.importance * 20;
      scored.push({ r, score });
    }
    return scored.sort((a, b) => a.score - b.score).map((s) => s.r);
  }

  /**
   * Searches for locations by name using Open-Meteo Geocoding.
   * This serves as a fallback when Google Places is unavailable.
   *
   * Enhancements over the original implementation:
   *  • Results are localized to the user's language (updated names)
   *  • ISO country codes → flag emojis for every result
   *  • Rich metadata (population, elevation, timezone, feature type)
   *  • Relevance ranking (exact/prefix match, population, capitals)
   *  • Duplicate suppression (same city listed twice)
   *
   * @param {string} query - Search query (city name)
   * @returns {Promise<Array>} Array of location results
   */
  async function searchLocations(query, signal, retries = 1) {
    if (!query || query.trim().length < 2) return [];

    const rawQuery = query.trim();
    const lang = _getUserLanguage();

    // ── 1. Direct Lat/Lng coordinate search (e.g., "11.38, 77.89" or "11.38 77.89") ──
    const coordMatch = rawQuery.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return [{
          name: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
          country: "Coordinates",
          countryCode: "",
          admin1: "",
          latitude: lat,
          longitude: lng,
          displayName: `Location at ${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
        }];
      }
    }

    const cacheKey = `${lang}:${rawQuery.toLowerCase()}`;
    if (_geocodingCache.has(cacheKey)) {
      const cached = _geocodingCache.get(cacheKey);
      if (Date.now() - cached.ts < 300000) {
        return cached.data;
      }
      _geocodingCache.delete(cacheKey);
    }

    // ── 2. Primary: Open-Meteo Global Geocoding API ──
    const params = new URLSearchParams({
      name: rawQuery,
      count: 10,
      language: lang,
      format: "json",
    });

    let results = [];

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${GEOCODING_URL}?${params}`, { signal });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.results) && data.results.length > 0) {
            results = data.results.map((r) => ({
              name: r.name,
              country: r.country || "",
              countryCode: (r.country_code || "").toUpperCase(),
              admin1: r.admin1 || "",
              latitude: r.latitude,
              longitude: r.longitude,
              population: r.population ?? null,
              elevation: r.elevation ?? null,
              timezone: r.timezone || "",
              featureCode: r.feature_code || "",
              displayName: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
            }));
            results = rankAndDedupeResults(results, rawQuery);
            break;
          }
        }
      } catch (error) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
        }
      }
    }

    // ── 3. High-Precision Fallback: OpenStreetMap Nominatim ──
    // Enables finding small villages, remote islands, streets, landmarks, and postal codes worldwide
    if (results.length === 0) {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(rawQuery)}&format=jsonv2&addressdetails=1&limit=8&accept-language=${encodeURIComponent(lang)}`;
        const nomRes = await fetch(nomUrl, { signal });
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          if (Array.isArray(nomData)) {
            results = nomData.map((item) => {
              const addr = item.address || {};
              const placeName = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || item.name || rawQuery;
              const region = addr.state || addr.county || addr.province || "";
              const country = addr.country || "";
              const isPrecise = !!(addr.road || addr.house_number || addr.postcode);
              return {
                name: placeName,
                country: country,
                countryCode: (addr.country_code || "").toUpperCase(),
                admin1: region,
                latitude: parseFloat(item.lat),
                longitude: parseFloat(item.lon),
                population: null,
                elevation: null,
                timezone: "",
                featureCode: "",
                type: isPrecise ? "Exact address" : item.type || "",
                importance: typeof item.importance === "number" ? item.importance : undefined,
                // Compose from parts instead of raw display_name — the raw
                // string often embeds postal codes and road names.
                displayName: [placeName, region, country].filter(Boolean).join(", ") || item.display_name || "",
              };
            });
            results = rankAndDedupeResults(results, rawQuery);
          }
        }
      } catch (e) {
        // Quiet fallback if network or rate-limited
      }
    }

    if (results.length > 0) {
      _geocodingCache.set(cacheKey, { data: results, ts: Date.now() });
    }
    return results;
  }

  /**
   * Parses an ISO date/time string safely into local date components without UTC offset shift.
   * @param {string} str - ISO date/time string (e.g. YYYY-MM-DD or YYYY-MM-DDTHH:mm)
   * @returns {Date}
   */
  function parseIsoLocal(str) {
    if (!str) return new Date();
    const parts = String(str).split("T");
    const d = parts[0].split("-").map((n) => parseInt(n, 10));
    if (d.length < 3 || d.some(isNaN)) return new Date(str);
    const t = parts[1]
      ? parts[1].split(":").map((n) => parseInt(n, 10))
      : [0, 0, 0];
    return new Date(d[0], d[1] - 1, d[2], t[0] || 0, t[1] || 0);
  }

  /**
   * Formats a date string into a short weekday label.
   *
   * @param {string} dateStr - ISO date string (YYYY-MM-DD)
   * @returns {string} Short weekday (e.g., "Mon")
   */
  function formatDayLabel(dateStr) {
    if (!dateStr) return "";
    const date = parseIsoLocal(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = Math.round((targetDay - today) / 86400000);

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
  function formatHourLabel(timeStr, utcOffsetSeconds = 0) {
    if (!timeStr) return "";
    const tIndex = timeStr.indexOf("T");
    if (tIndex !== -1) {
      const hourStr = timeStr.substring(tIndex + 1, tIndex + 3);
      const hours = parseInt(hourStr, 10);
      if (!isNaN(hours)) {
        if (hours === 0) return "12 AM";
        if (hours === 12) return "12 PM";
        return hours > 12 ? `${hours - 12} PM` : `${hours} AM`;
      }
    }
    // Fallback if structure changes
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
    const parts = timeStr.split("T");
    if (parts.length < 2) return timeStr;
    const dateParts = parts[0].split("-");
    const timeParts = parts[1].split(":");
    
    const localDate = new Date(
      parseInt(dateParts[0], 10),
      parseInt(dateParts[1], 10) - 1,
      parseInt(dateParts[2], 10),
      parseInt(timeParts[0], 10),
      parseInt(timeParts[1], 10)
    );
    
    return (
      localDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      }) +
      " · " +
      localDate.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      })
    );
  }

  /**
   * Formats an ISO time string to time-only string timezone-independently.
   *
   * @param {string} timeStr - ISO datetime string
   * @returns {string} e.g., "2:00 PM"
   */
  function formatTimeOnly(timeStr) {
    if (!timeStr) return "";
    if (timeStr instanceof Date) {
      if (isNaN(timeStr.getTime())) return "";
      try {
        return timeStr.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      } catch {
        return "";
      }
    }
    const str = String(timeStr);
    let timePart = str;
    const parts = str.split("T");
    if (parts.length >= 2) {
      timePart = parts[1];
    }
    const timeParts = timePart.split(":");
    if (timeParts.length >= 2) {
      const hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1], 10);
      if (!isNaN(hours) && !isNaN(minutes)) {
        const ampm = hours >= 12 ? "PM" : "AM";
        const displayHours = hours % 12 === 0 ? 12 : hours % 12;
        const displayMinutes = String(minutes).padStart(2, "0");
        return `${displayHours}:${displayMinutes} ${ampm}`;
      }
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    return str;
  }

  /**
   * Formats current local time at the location specified by timezone/offset.
   *
   * @param {string} [timezone] - IANA timezone (e.g. "Asia/Kolkata")
   * @param {number} [utcOffsetSeconds=0] - UTC offset in seconds
   * @returns {string} e.g. "1:32 PM"
   */
  function getFormattedLocationCurrentTime(timezone, utcOffsetSeconds = 0) {
    const now = new Date();
    if (timezone) {
      try {
        return now.toLocaleTimeString("en-US", {
          timeZone: timezone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
      } catch (e) {
        // Fallback to offset calculation below
      }
    }
    const locMs =
      now.getTime() +
      (utcOffsetSeconds || 0) * 1000 +
      now.getTimezoneOffset() * 60 * 1000;
    const locDate = new Date(locMs);
    return locDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  /**
   * Formats current local date and time at the location specified by timezone/offset.
   *
   * @param {string} [timezone] - IANA timezone (e.g. "Asia/Kolkata")
   * @param {number} [utcOffsetSeconds=0] - UTC offset in seconds
   * @returns {string} e.g. "Tue, Oct 20 · 5:18 PM"
   */
  function getFormattedLocationCurrentDateTime(timezone, utcOffsetSeconds = 0) {
    const now = new Date();
    if (timezone) {
      try {
        const dStr = now.toLocaleDateString("en-US", {
          timeZone: timezone,
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        const tStr = now.toLocaleTimeString("en-US", {
          timeZone: timezone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        return `${dStr} · ${tStr}`;
      } catch (e) {
        // Fallback to offset calculation below
      }
    }
    const locMs =
      now.getTime() +
      (utcOffsetSeconds || 0) * 1000 +
      now.getTimezoneOffset() * 60 * 1000;
    const locDate = new Date(locMs);
    const dStr = locDate.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const tStr = locDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dStr} · ${tStr}`;
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
  async function fetchAirQuality(lat, lng, retries = 1, signal) {
    const round = (v) => v.toFixed(4);
    const cacheKey = `aq:${round(lat)},${round(lng)},d${PAST_DAYS},f${FORECAST_DAYS}`;
    if (_requestCache.has(cacheKey)) {
      const entry = _requestCache.get(cacheKey);
      if (Date.now() - entry.ts < REQUEST_CACHE_TTL) {
        return entry.data instanceof Promise ? await entry.data : entry.data;
      }
      _requestCache.delete(cacheKey);
    }

    const fetchPromise = (async () => {
      const params = new URLSearchParams({
        latitude: round(lat),
        longitude: round(lng),
        hourly:
          "pm2_5,pm10,ozone,us_aqi,birch_pollen,grass_pollen,mugwort_pollen,alder_pollen",
        timezone: "auto",
        past_days: PAST_DAYS,
        forecast_days: FORECAST_DAYS,
      });
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const timeoutCtrl = new AbortController();
          const timer = setTimeout(() => timeoutCtrl.abort(), 5000);
          let response;
          try {
            response = await fetch(
              `https://air-quality-api.open-meteo.com/v1/air-quality?${params}`,
              { signal: signal || timeoutCtrl.signal }
            );
          } finally {
            clearTimeout(timer);
          }
          if (!response.ok) {
            if (response.status === 429) {
              const err = new Error("Air quality rate limit 429");
              err.status = 429;
              throw err;
            }
            return null;
          }
          const data = await response.json();
          _setCache(cacheKey, { data, ts: Date.now() });
          return data;
        } catch (err) {
          if (attempt < retries) {
            let delay = 400 * Math.pow(2, attempt);
            if (err.status === 429 || String(err).includes("429")) {
              delay = 1500 * Math.pow(2, attempt) + Math.random() * 500;
            }
            await new Promise((r) => setTimeout(r, delay));
          } else {
            _requestCache.delete(cacheKey);
            return null;
          }
        }
      }
      return null;
    })();

    _setCache(cacheKey, { data: fetchPromise, ts: Date.now() });
    return await fetchPromise;
  }

  /**
   * Translates a US AQI value into a descriptive severity rating and color styling classes.
   *
   * @param {number} value - US AQI value (0-500)
   * @returns {Object} AQI severity descriptors
   */
  function getPollenLevel(value) {
    if (value == null || value < 0) {
      return { level: "Unknown", color: "text-slate-500", icon: "⚪" };
    }
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
        colorClass: "text-fuchsia-500",
        bgClass: "bg-fuchsia-500/10",
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
  async function fetchHistoricalWeather(lat, lng, dateStr, signal) {
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
        { signal }
      );
      if (!response.ok)
        throw new Error(`Historical Weather API error: ${response.status}`);
      const data = await response.json();
      _setCache(cacheKey, { data, ts: Date.now() });
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

  // ================================================================
  //  SKY GAZING SCORE
  // ================================================================

  /**
   * A 0-100 "how good is stargazing right now" score, driven by the two
   * factors this app actually has data for: cloud cover (the dominant one
   * — an overcast sky ends the question regardless of anything else) and
   * moonlight (illumination fraction derived from the moon-phase math
   * above).
   *
   * Deliberately excludes a Bortle-scale / light-pollution estimate: doing
   * that honestly needs a light-pollution atlas this app has no source
   * for, and a guessed number would be worse than no number. Also doesn't
   * check whether the moon is actually above the horizon at the given
   * time (that needs a full moon-position ephemeris, not just phase) — the
   * illumination penalty applies whenever the moon is bright, which
   * slightly under-scores clear nights when a bright moon has already set.
   * Both are documented simplifications, not silent ones.
   *
   * @param {number|null} cloudCoverPct - 0-100
   * @param {number|null} moonPhaseFraction - 0-1, from getMoonPhase().phase
   * @returns {{ score: number, label: string, icon: string, illumination: number }|null}
   */
  function getStargazingScore(cloudCoverPct, moonPhaseFraction) {
    if (cloudCoverPct == null) return null;

    // Illumination fraction from phase angle: 0 at new moon, 1 at full.
    const phase = moonPhaseFraction ?? 0;
    const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2;

    let score = 100;
    score -= cloudCoverPct * 0.9;
    score -= illumination * 30;
    score = Math.max(0, Math.min(100, Math.round(score)));

    let label, icon;
    if (score >= 85) {
      label = "Excellent";
      icon = "🌌";
    } else if (score >= 65) {
      label = "Good";
      icon = "✨";
    } else if (score >= 40) {
      label = "Fair";
      icon = "🌥️";
    } else if (score >= 15) {
      label = "Poor";
      icon = "☁️";
    } else {
      label = "Washed Out";
      icon = "🌫️";
    }

    return { score, label, icon, illumination };
  }

  /**
   * Golden hour / blue hour windows around sunrise and sunset, using the
   * fixed-offset approximation photography apps commonly use (golden hour
   * ≈ the 1h nearest sunrise/sunset while the sun is low; blue hour ≈ the
   * ~30min after sunset / before sunrise while the sun is just below the
   * horizon) rather than a full solar-elevation model. Good enough to plan
   * a shoot around; not a substitute for a proper ephemeris if the exact
   * minute matters.
   *
   * @param {string|Date} sunrise
   * @param {string|Date} sunset
   * @param {Date} now
   * @returns {{ label: string, start: Date, end: Date }|null} The next
   *   upcoming window, or null if both today's windows have passed.
   */
  function getGoldenBlueHourWindows(sunrise, sunset, now) {
    if (!sunrise || !sunset) return null;
    const rise = new Date(sunrise);
    const set = new Date(sunset);
    if (!Number.isFinite(rise.getTime()) || !Number.isFinite(set.getTime()))
      return null;

    const MIN = 60000;
    const windows = [
      { label: "Morning Blue Hour", start: new Date(rise - 30 * MIN), end: rise },
      { label: "Morning Golden Hour", start: rise, end: new Date(rise.getTime() + 60 * MIN) },
      { label: "Evening Golden Hour", start: new Date(set.getTime() - 60 * MIN), end: set },
      { label: "Evening Blue Hour", start: set, end: new Date(set.getTime() + 30 * MIN) },
    ].sort((a, b) => a.start - b.start);

    for (const w of windows) {
      if (now <= w.end) return w;
    }
    return null;
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
      // Cold is a ladder, not a single rung. "Protect plants and outdoor
      // pipes" is correct guidance at -1°C and absurd at -57°C, where the
      // hazard is frostbite on exposed skin measured in minutes. Escalate on
      // the wind chill (feelsLike) where the API gives one, since that is what
      // the body and every frostbite table actually respond to.
      const chill = weather.feelsLike ?? temp;
      const reading =
        chill < temp - 2
          ? `${Math.round(temp)}°C, feels like ${Math.round(chill)}°C`
          : `${Math.round(temp)}°C`;

      if (chill <= -45) {
        alerts.push({
          type: "extreme-cold",
          title: "Extreme Cold Emergency",
          desc: `${reading}. Exposed skin freezes in under 2 minutes. Travel only with full polar gear and a survival kit — hypothermia is rapid and unsurvivable without shelter.`,
          severity: "extreme",
        });
      } else if (chill <= -30) {
        alerts.push({
          type: "extreme-cold",
          title: "Extreme Cold Warning",
          desc: `${reading}. Frostbite on exposed skin in 5-10 minutes. Cover all skin, limit time outdoors, and watch for hypothermia.`,
          severity: "severe",
        });
      } else if (chill <= -15) {
        alerts.push({
          type: "wind-chill",
          title: "Wind Chill Advisory",
          desc: `${reading}. Frostbite possible within 30 minutes on exposed skin. Wear layers, gloves, and cover your face.`,
          severity: "warning",
        });
      } else {
        alerts.push({
          type: "frost",
          title: "Frost / Freeze Advisory",
          desc: `Temperature is ${reading}. Protect plants, outdoor pipes, and pets from cold.`,
          severity: "advisory",
        });
      }
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

  /**
   * Maps a comfort score to a label, colour and icon.
   *
   * The bottom two bands are temperature-aware: a score of 0 is reached both
   * at +50°C and at -57°C, and labelling the latter "🥵 Miserable" was plainly
   * wrong. `weather` is optional so the single-argument call signature (and
   * the existing tests) keep working — without it the old heat-leaning
   * wording is used.
   *
   * @param {number|null} score - Comfort index 0-100
   * @param {Object} [weather] - Hourly snapshot, for the cold/heat split
   * @returns {{ label: string, color: string, icon: string }}
   */
  function getComfortLabel(score, weather) {
    if (score == null)
      return { label: "--", color: "text-slate-400", icon: "❓" };
    if (score >= 85)
      return { label: "Excellent", color: "text-emerald-500", icon: "🌟" };
    if (score >= 70)
      return { label: "Good", color: "text-green-500", icon: "👍" };
    if (score >= 50)
      return { label: "Fair", color: "text-amber-500", icon: "😐" };

    // Below "Fair", discomfort has a direction. Prefer the apparent
    // temperature — at -57°C with 39 km/h gusts the wind chill is what the
    // body actually experiences — and fall back to the dry-bulb reading.
    const t = weather
      ? (weather.feelsLike ?? weather.temperature ?? null)
      : null;
    const cold = t != null && t < 0;

    if (score >= 30)
      return cold
        ? { label: "Bitter", color: "text-sky-500", icon: "🥶" }
        : { label: "Poor", color: "text-orange-500", icon: "😣" };

    if (cold)
      return t <= -30
        ? { label: "Extreme Freeze", color: "text-cyan-400", icon: "🧊" }
        : { label: "Shivering", color: "text-sky-500", icon: "🥶" };

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

  function computeDiurnalBias(data, utcOffsetSeconds = 0) {
    if (!data?.hourly?.temperature_2m) return null;
    const h = data.hourly;
    const biasByHour = {};
    for (let i = 0; i < h.time.length; i++) {
      if (h.temperature_2m[i] == null) continue;
      const parts = h.time[i].split("T");
      if (parts.length < 2) continue;
      const hour = parseInt(parts[1].split(":")[0], 10);
      if (isNaN(hour)) continue;
      if (!biasByHour[hour]) biasByHour[hour] = [];
      biasByHour[hour].push(h.temperature_2m[i]);
    }
    const result = {};
    for (const [hour, vals] of Object.entries(biasByHour)) {
      if (vals.length >= 3) {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
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
    const limit = Math.min(startIdx + hours, pp.length - 1);
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
      { key: "Temperature", value: weather.temperature, getter: (w, a) => getComfortIndex({ ...w, temperature: 22 }, a) - baseScore },
      { key: "Humidity", value: weather.humidity, getter: (w, a) => getComfortIndex({ ...w, humidity: 45 }, a) - baseScore },
      { key: "Wind", value: weather.windSpeed, getter: (w, a) => getComfortIndex({ ...w, windSpeed: 15 }, a) - baseScore },
      { key: "UV", value: weather.uvIndex, getter: (w, a) => getComfortIndex({ ...w, uvIndex: 2 }, a) - baseScore },
      { key: "Air Quality", value: aqiVal, getter: (w, a) => getComfortIndex(w, 20) - baseScore },
      { key: "Precipitation", value: weather.precipitation, getter: (w, a) => getComfortIndex({ ...w, precipitation: 0 }, a) - baseScore },
      { key: "Cloud Cover", value: weather.cloudCover, getter: (w, a) => getComfortIndex({ ...w, cloudCover: 20 }, a) - baseScore },
    ];
    return params.map((p) => ({
      key: p.key,
      value: p.value ?? 0,
      impact: Math.abs(p.getter(weather, aqiVal)),
    }));
  }

  // ================================================================
  //  9. FRESHNESS METADATA
  //  ================================================================

  function getFreshnessLabel(timestamp) {
    if (!timestamp) return { label: "Unknown", opacity: 0.5, ageMinutes: 0, isStale: true, isExpired: true };
    let timeMs = timestamp;
    if (typeof timestamp === "object") {
      if (timestamp.timestamp) {
        timeMs = timestamp.timestamp;
      } else if (timestamp.hourly?.time?.[0]) {
        let tStr = timestamp.hourly.time[0];
        if (!tStr.endsWith("Z")) {
          tStr += "Z";
        }
        timeMs = new Date(tStr).getTime();
      } else {
        timeMs = Date.now();
      }
    }
    const elapsed = Date.now() - timeMs;
    const mins = Math.floor(elapsed / 60000);
    const isStale = mins >= 120;
    const isExpired = mins >= 1440; // 24 hours
    let label = "Just now";
    let opacity = 1.0;
    if (mins < 5) {
      label = "Just now";
      opacity = 1.0;
    } else if (mins < 30) {
      label = `${mins} min ago`;
      opacity = 0.9;
    } else if (mins < 120) {
      label = `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
      opacity = 0.7;
    } else if (mins < 1440) {
      label = `${Math.floor(mins / 60)}h ago`;
      opacity = 0.5;
    } else {
      label = `${Math.floor(mins / 1440)}d ago`;
      opacity = 0.3;
    }
    return { label, opacity, ageMinutes: mins, isStale, isExpired };
  }

  // ================================================================
  //  10. TEMPORAL COMPRESSION (7-day condition matrix)
  //  ================================================================

  function getTemporalCompression(data, targetSize = 10) {
    if (Array.isArray(data)) {
      const originalLength = data.length;
      if (originalLength <= targetSize) {
        return {
          compressed: [...data],
          originalLength,
          compressionRatio: 1,
        };
      }
      const compressed = [];
      const bucketSize = originalLength / targetSize;
      for (let i = 0; i < targetSize; i++) {
        const start = Math.floor(i * bucketSize);
        const end = Math.min(originalLength, Math.floor((i + 1) * bucketSize));
        const slice = data.slice(start, end);
        const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
        compressed.push(avg);
      }
      return {
        compressed,
        originalLength,
        compressionRatio: originalLength / targetSize,
      };
    }

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
      `Comfort index: ${getComfortLabel(getComfortIndex(weather, aqiVal), weather).label}.`,
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
    // Removed: this returned fabricated temperatures (`20 - |lat| * 0.4`)
    // with no API call, so the label read as a measurement of something
    // that was never measured. Returning null means callers skip rendering
    // rather than display a guess.
    //
    // A real implementation would fetch the forecast at upwind/downwind
    // sample points (getUpwindPoint already exists) and read their actual
    // temperatures. The caller in app.js has been removed until then.
    return null;
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

  /**
   * Generates a high-precision minute-by-minute precipitation nowcast for the next 1–2 hours.
   * Utilizes minutely_15 Open-Meteo intervals when available with fallback to hourly resolution.
   *
   * @param {Object} data - Full Open-Meteo API response
   * @param {number} [currentHourIndex=0]
   * @returns {Object|null}
   */
  function getPrecipitationNowcast(data, currentHourIndex = 0) {
    if (!data) return null;

    const hourly = data.hourly;
    const offset = data.utc_offset_seconds || 0;
    const targetHourStr = hourly?.time?.[currentHourIndex];
    const h0 = Math.max(0, hourly?.precipitation?.[currentHourIndex] || 0);
    const h1 = Math.max(0, hourly?.precipitation?.[currentHourIndex + 1] || 0);
    const h2 = Math.max(0, hourly?.precipitation?.[currentHourIndex + 2] || 0);
    const hCode = hourly?.weather_code?.[currentHourIndex] ?? 0;
    const isRainCode = (hCode >= 51 && hCode <= 67) || (hCode >= 80 && hCode <= 82) || (hCode >= 95 && hCode <= 99);

    // 1. Minutely 15-minute intervals if provided by API
    if (data.minutely_15?.time?.length && data.minutely_15?.precipitation?.length) {
      const times = data.minutely_15.time;
      const precip = data.minutely_15.precipitation;
      const probs = data.minutely_15.precipitation_probability || [];

      // Find start index aligned with target hour and timezone
      let startIdx = -1;

      // Primary: Match by target hour prefix (e.g. "2026-10-26T14")
      if (targetHourStr) {
        const prefix = targetHourStr.slice(0, 13);
        const prefixMatches = [];
        for (let i = 0; i < times.length; i++) {
          if (times[i].startsWith(prefix)) {
            prefixMatches.push(i);
          }
        }
        if (prefixMatches.length > 0) {
          // If viewing current hour, choose the closest 15-min slot to current location time
          const nowUtc = Date.now();
          let closestMatch = prefixMatches[0];
          let minDiff = Infinity;
          for (const idx of prefixMatches) {
            const t = times[idx];
            const tUtc = t.endsWith("Z") ? new Date(t).getTime() : new Date(t + "Z").getTime() - (offset * 1000);
            const diff = Math.abs(tUtc - nowUtc);
            if (diff < minDiff) {
              minDiff = diff;
              closestMatch = idx;
            }
          }
          startIdx = closestMatch;
        }
      }

      // Fallback: compare UTC timestamps properly (without browser timezone distortion)
      if (startIdx === -1) {
        const nowUtc = Date.now();
        let minDiff = Infinity;
        for (let i = 0; i < times.length; i++) {
          const t = times[i];
          const tUtc = t.endsWith("Z") ? new Date(t).getTime() : new Date(t + "Z").getTime() - (offset * 1000);
          const diff = Math.abs(tUtc - nowUtc);
          if (diff < minDiff) {
            minDiff = diff;
            startIdx = i;
          }
        }
        if (startIdx === -1) startIdx = 0;
      }

      // Check if minutely_15 has radar data or is flat 0 while hourly models/weather codes indicate rain
      let minSum = 0;
      for (let i = 0; i < 8; i++) {
        minSum += Math.max(0, precip[startIdx + i] || 0);
      }

      // If minutely radar data is zero but hourly forecast or rain codes confirm rain/drizzle:
      const needsHourlyFill = minSum <= 0.05 && (Math.max(h0, h1) > 0.05 || isRainCode);

      const intervals = [];
      let isRainingNow = false;
      let rainStartMin = null;
      let rainStopMin = null;
      let maxMm = 0;

      for (let i = 0; i < 8; i++) {
        const idx = startIdx + i;
        if (idx >= times.length) break;

        let mm = Math.max(0, precip[idx] || 0);
        let prob = probs[idx] ?? 0;

        if (needsHourlyFill) {
          // In regions without ground radar, interpolate from verified numerical models
          const hourlyVal = i < 4 ? h0 : h1;
          mm = hourlyVal > 0 ? hourlyVal : (isRainCode && i < 4 ? 0.2 : 0);
          prob = probs[idx] || (i < 4 ? (hourly?.precipitation_probability?.[currentHourIndex] || 80) : (hourly?.precipitation_probability?.[currentHourIndex + 1] || 70));
        } else if (prob === 0 && mm > 0.05) {
          prob = 85;
        }

        const minOffset = i * 15;
        if (mm > maxMm) maxMm = mm;

        if (i === 0) {
          isRainingNow = mm > 0.05 || (needsHourlyFill && isRainCode);
        }

        intervals.push({
          minute: minOffset,
          label: minOffset === 0 ? "Now" : `+${minOffset}m`,
          mm,
          prob,
          intensity: mm >= 4 ? "heavy" : mm >= 1.5 ? "moderate" : (mm > 0.05 || (needsHourlyFill && isRainCode)) ? "light" : "none",
        });

        if (!isRainingNow && rainStartMin === null && mm > 0.05) {
          rainStartMin = minOffset;
        }
        if (isRainingNow && rainStopMin === null && mm <= 0.05 && !needsHourlyFill) {
          rainStopMin = minOffset;
        }
      }

      let summary = "Dry conditions for the next 2 hours";
      let icon = "☀️";
      if (isRainingNow) {
        icon = maxMm >= 3 ? "⛈️" : "🌧️";
        if (rainStopMin) {
          summary = `Rain stopping in ~${rainStopMin} min`;
        } else if (maxMm < 1) {
          summary = "Light drizzle / rain continuing over the next 2 hours";
        } else {
          summary = "Rain continuing over the next 2 hours";
        }
      } else if (rainStartMin !== null) {
        icon = "🌦️";
        summary = `Precipitation starting in ~${rainStartMin} min`;
      } else if (needsHourlyFill && isRainCode) {
        icon = "🌧️";
        summary = "Light drizzle / rain expected over the next 2 hours";
      }

      return {
        hasPrecipitation: isRainingNow || rainStartMin !== null || maxMm > 0.05 || (needsHourlyFill && isRainCode),
        isRainingNow,
        rainStartMin,
        rainStopMin,
        maxMm,
        summary,
        icon,
        intervals,
      };
    }

    // 2. Graceful fallback from hourly data
    if (!hourly?.time?.length || !hourly.precipitation?.length) return null;

    const hIdx = Math.max(0, Math.min(hourly.time.length - 1, currentHourIndex));
    const nowP = Math.max(0, hourly.precipitation[hIdx] || (isRainCode ? 0.2 : 0));
    const next1P = Math.max(0, hourly.precipitation[hIdx + 1] || 0);
    const next2P = Math.max(0, hourly.precipitation[hIdx + 2] || 0);
    const maxMm = Math.max(nowP, next1P, next2P);

    const hasPrecip = maxMm > 0.05 || isRainCode;
    let summary = "Dry conditions for the next 2 hours";
    let icon = "☀️";

    if (nowP > 0.05 || isRainCode) {
      icon = nowP >= 3 ? "⛈️" : "🌧️";
      summary = next1P <= 0.05 && !isRainCode ? "Rain easing within the next hour" : "Rain expected over next 2 hours";
    } else if (next1P > 0.05) {
      icon = "🌦️";
      summary = "Rain expected starting in ~1 hour";
    } else if (next2P > 0.05) {
      icon = "🌦️";
      summary = "Rain possible in ~2 hours";
    }

    const intervals = [
      { minute: 0, label: "Now", mm: nowP, prob: hourly.precipitation_probability?.[hIdx] || (nowP > 0 ? 80 : 0), intensity: nowP >= 4 ? "heavy" : nowP >= 1.5 ? "moderate" : nowP > 0.05 ? "light" : "none" },
      { minute: 30, label: "+30m", mm: (nowP + next1P) / 2, prob: Math.round(((hourly.precipitation_probability?.[hIdx] || 0) + (hourly.precipitation_probability?.[hIdx + 1] || 0)) / 2), intensity: ((nowP + next1P) / 2) > 0.05 ? "light" : "none" },
      { minute: 60, label: "+60m", mm: next1P, prob: hourly.precipitation_probability?.[hIdx + 1] || (next1P > 0 ? 80 : 0), intensity: next1P >= 4 ? "heavy" : next1P >= 1.5 ? "moderate" : next1P > 0.05 ? "light" : "none" },
      { minute: 90, label: "+90m", mm: (next1P + next2P) / 2, prob: Math.round(((hourly.precipitation_probability?.[hIdx + 1] || 0) + (hourly.precipitation_probability?.[hIdx + 2] || 0)) / 2), intensity: ((next1P + next2P) / 2) > 0.05 ? "light" : "none" },
      { minute: 120, label: "+120m", mm: next2P, prob: hourly.precipitation_probability?.[hIdx + 2] || (next2P > 0 ? 80 : 0), intensity: next2P >= 4 ? "heavy" : next2P >= 1.5 ? "moderate" : next2P > 0.05 ? "light" : "none" },
    ];

    return {
      hasPrecipitation: hasPrecip,
      isRainingNow: nowP > 0.05 || isRainCode,
      rainStartMin: (nowP <= 0.05 && !isRainCode) && next1P > 0.05 ? 60 : null,
      rainStopMin: (nowP > 0.05 || isRainCode) && next1P <= 0.05 ? 60 : null,
      maxMm,
      summary,
      icon,
      intervals,
    };
  }

  /**
   * Actionable UV guidance based on WHO global solar UV index.
   * Provides protection recommendation, skin burn estimates, and badge styling.
   *
   * @param {number|null} uv
   * @returns {{ level: string, advice: string, burnTime: string, color: string, badgeBg: string }}
   */
  function getUVGuidance(uv) {
    if (uv == null || isNaN(uv) || uv < 0) {
      return {
        level: "Unknown",
        advice: "No UV data available",
        burnTime: "N/A",
        color: "text-slate-400",
        badgeBg: "bg-slate-100 dark:bg-slate-800 text-slate-500",
      };
    }
    if (uv < 3) {
      return {
        level: "Low",
        advice: "Minimal sun protection required for normal exposure.",
        burnTime: "60+ min",
        color: "text-emerald-500 dark:text-emerald-400",
        badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20",
      };
    }
    if (uv < 6) {
      return {
        level: "Moderate",
        advice: "Wear sunglasses, hat, and apply SPF 30+ if staying outdoors.",
        burnTime: "~45 min",
        color: "text-amber-500 dark:text-amber-400",
        badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20",
      };
    }
    if (uv < 8) {
      return {
        level: "High",
        advice: "Protection essential. Seek midday shade, wear UV protection and SPF 30+.",
        burnTime: "~25-30 min",
        color: "text-orange-500 dark:text-orange-400",
        badgeBg: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20",
      };
    }
    if (uv < 11) {
      return {
        level: "Very High",
        advice: "Extra protection needed. Avoid midday sun, generously apply SPF 50+.",
        burnTime: "~15 min",
        color: "text-rose-500 dark:text-rose-400",
        badgeBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20",
      };
    }
    return {
      level: "Extreme",
      advice: "Dangerous UV radiation. Stay indoors or in deep shade during daylight hours.",
      burnTime: "<10 min",
      color: "text-purple-500 dark:text-purple-400",
      badgeBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20",
    };
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    fetchForecast,
    getPrecipitationNowcast,
    getUVGuidance,
    getHourlyAtIndex,
    getCurrentHourIndex,
    getDailyForecast,
    getWeatherInfo,
    formatTemp,
    formatWind,
    formatPrecip,
    formatPressure,
    formatVisibility,
    formatDuration,
    formatCAPE,
    formatFreezingLevel,
    formatPrecipProb,
    calculateDewPoint,
    getWindDirection,
    getCountryFlag,
    getFeatureLabel,
    formatPopulation,
    rankAndDedupeResults,
    getUserLanguage: _getUserLanguage,
    searchLocations,
    parseIsoLocal,
    formatDayLabel,
    formatHourLabel,
    formatDateTime,
    formatTimeOnly,
    getFormattedLocationCurrentTime,
    getFormattedLocationCurrentDateTime,
    getTempClass,
    fetchAirQuality,
    getAQIInfo,
    fetchHistoricalWeather,
    getMoonPhase,
    getStargazingScore,
    getGoldenBlueHourWindows,
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

    // Additional helper functions for unit tests
    cToF,
    kmhToMph,
    mmToIn,
    hpaToInhg,
    getWeatherCodeClass,
    WMO_CODES,
  };
})();
// Bind to global scope for classic scripts/workers
if (typeof globalThis !== "undefined") {
  globalThis.WeatherService = WeatherService;
} else if (typeof self !== "undefined") {
  self.WeatherService = WeatherService;
}

// Node/CommonJS exports for testing
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WeatherService,
    ...WeatherService,
  };
}
