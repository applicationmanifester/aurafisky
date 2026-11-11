import fetch from "cross-fetch";

// MCP Server for Aurafisky — JSON-RPC over stdio

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const ASTRONOMY_URL = "https://api.open-meteo.com/v1/astronomy";

const PAST_DAYS = 3;
const FORECAST_DAYS = 7;

const WMO_CODES = {
  0: { description: "Clear sky", dayIcon: "☀️", nightIcon: "🌙" },
  1: { description: "Mainly clear", dayIcon: "🌤️", nightIcon: "🌙" },
  2: { description: "Partly cloudy", dayIcon: "⛅", nightIcon: "🌙" },
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
  77: { description: "Snow grains", dayIcon: "🌨️", nightIcon: "🌨️" },
  80: { description: "Slight rain showers", dayIcon: "🌦️", nightIcon: "🌧️" },
  81: { description: "Moderate rain showers", dayIcon: "🌧️", nightIcon: "🌧️" },
  82: { description: "Violent rain showers", dayIcon: "⛈️", nightIcon: "⛈️" },
  85: { description: "Slight snow showers", dayIcon: "🌨️", nightIcon: "🌨️" },
  86: { description: "Heavy snow showers", dayIcon: "❄️", nightIcon: "❄️" },
  95: { description: "Thunderstorm", dayIcon: "⛈️", nightIcon: "⛈️" },
  96: { description: "Thunderstorm with slight hail", dayIcon: "⛈️", nightIcon: "⛈️" },
  99: { description: "Thunderstorm with heavy hail", dayIcon: "⛈️", nightIcon: "⛈️" },
};

function weatherInfo(code, isDay = true) {
  const entry = WMO_CODES[code] || WMO_CODES[0];
  return { description: entry.description, icon: isDay ? entry.dayIcon : entry.nightIcon };
}

function validateLatLng(lat, lng) {
  const errors = [];
  if (lat == null || typeof lat !== "number" || !isFinite(lat)) errors.push("latitude must be a valid number");
  else if (lat < -90 || lat > 90) errors.push("latitude must be between -90 and 90");
  if (lng == null || typeof lng !== "number" || !isFinite(lng)) errors.push("longitude must be a valid number");
  else if (lng < -180 || lng > 180) errors.push("longitude must be between -180 and 180");
  return errors;
}

function validateDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "date must be in YYYY-MM-DD format";
  return null;
}

function validateUnits(units) {
  if (units && units !== "metric" && units !== "imperial") return "units must be 'metric' or 'imperial'";
  return null;
}

function cToF(c) { return c == null ? null : (c * 9) / 5 + 32; }
function kmhToMph(kmh) { return kmh == null ? null : kmh * 0.621371; }
function mmToIn(mm) { return mm == null ? null : mm * 0.0393701; }
function formatTemp(value, units) {
  if (value == null) return "—";
  return units === "imperial" ? `${Math.round(cToF(value))}°F` : `${Math.round(value)}°C`;
}
function formatWind(value, units) {
  if (value == null) return "—";
  return units === "imperial" ? `${Math.round(kmhToMph(value))} mph` : `${Math.round(value)} km/h`;
}
function formatPrecip(value, units) {
  if (value == null) return "—";
  return units === "imperial" ? `${mmToIn(value).toFixed(2)} in` : `${value.toFixed(1)} mm`;
}
function formatPressure(value) { return value == null ? "—" : `${Math.round(value)} hPa`; }

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const apiCache = new Map();
function cacheGet(key) {
  const entry = apiCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { apiCache.delete(key); return null; }
  return entry.data;
}
function cacheSet(key, data) {
  apiCache.set(key, { data, ts: Date.now() });
  if (apiCache.size > 200) { const firstKey = apiCache.keys().next().value; apiCache.delete(firstKey); }
}

function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchForecast(lat, lng) {
  const cacheKey = `forecast:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const params = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4),
    hourly: ["temperature_2m","relative_humidity_2m","apparent_temperature","precipitation_probability","precipitation","weather_code","cloud_cover","wind_speed_10m","wind_direction_10m","wind_gusts_10m","uv_index","pressure_msl","visibility","is_day"].join(","),
    daily: ["weather_code","temperature_2m_max","temperature_2m_min","apparent_temperature_max","apparent_temperature_min","sunrise","sunset","uv_index_max","precipitation_sum","precipitation_probability_max","wind_speed_10m_max"].join(","),
    timezone: "auto", past_days: PAST_DAYS, forecast_days: FORECAST_DAYS,
  });
  const res = await fetchWithTimeout(`${FORECAST_URL}?${params}`);
  if (!res.ok) throw new Error(`Forecast API error: ${res.status}`);
  const data = await res.json();
  cacheSet(cacheKey, data);
  return data;
}

async function fetchAirQuality(lat, lng) {
  const cacheKey = `aq:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const params = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4),
    hourly: "pm2_5,pm10,ozone,us_aqi,birch_pollen,grass_pollen,mugwort_pollen,alder_pollen",
    timezone: "auto", past_days: PAST_DAYS, forecast_days: FORECAST_DAYS,
  });
  const res = await fetchWithTimeout(`${AIR_QUALITY_URL}?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  cacheSet(cacheKey, data);
  return data;
}

async function fetchAstronomy(lat, lng, date) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lng.toFixed(4),
    daily: "sunrise,sunset,uv_index_max", timezone: "auto",
    start_date: date, end_date: date,
  });
  const res = await fetchWithTimeout(`${ASTRONOMY_URL}?${params}`);
  if (!res.ok) return null;
  return res.json();
}

async function searchLocations(query) {
  if (!query || query.trim().length < 2) return [];
  const params = new URLSearchParams({ name: query.trim(), count: 10, language: "en", format: "json" });
  const res = await fetchWithTimeout(`${GEOCODING_URL}?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data.results)) return [];
  return data.results.map((r) => ({
    name: r.name, country: r.country || "", countryCode: (r.country_code || "").toUpperCase(),
    admin1: r.admin1 || "", latitude: r.latitude, longitude: r.longitude,
    population: r.population ?? null, elevation: r.elevation ?? null,
    timezone: r.timezone || "", featureCode: r.feature_code || "",
    displayName: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
  }));
}

function getCurrentHourIndex(data, utcOffsetSeconds = 0) {
  if (!data?.hourly?.time || !data.hourly.time.length) return 0;
  const times = data.hourly.time;
  const now = new Date();
  const nowInLocation = now.getTime() + (utcOffsetSeconds || 0) * 1000;
  let closest = 0, minDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const t = new Date(times[i] + "Z").getTime();
    const diff = Math.abs(t - nowInLocation);
    if (diff < minDiff) { minDiff = diff; closest = i; }
  }
  return closest;
}

function getHourlyAtIndex(data, index) {
  if (!data?.hourly?.time) return null;
  const h = data.hourly;
  if (index < 0 || index >= h.time.length) return null;
  const code = h.weather_code[index] ?? 0;
  const isDay = h.is_day[index] === 1;
  const info = weatherInfo(code, isDay);
  return { time: h.time[index], temperature: h.temperature_2m[index], feelsLike: h.apparent_temperature[index],
    humidity: h.relative_humidity_2m[index], precipProb: h.precipitation_probability[index],
    precipitation: h.precipitation[index], weatherCode: code, cloudCover: h.cloud_cover[index],
    windSpeed: h.wind_speed_10m[index], windDirection: h.wind_direction_10m[index],
    windGusts: h.wind_gusts_10m[index], uvIndex: h.uv_index[index], pressure: h.pressure_msl[index],
    visibility: h.visibility[index], isDay, description: info.description, icon: info.icon };
}

function getPollenLevel(value) {
  if (value == null || value < 0) return { level: "Unknown", icon: "⚪" };
  if (value <= 20) return { level: "Low", icon: "🟢" };
  if (value <= 50) return { level: "Moderate", icon: "🟡" };
  if (value <= 100) return { level: "High", icon: "🟠" };
  return { level: "Very High", icon: "🔴" };
}

// ── Tool registry ────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "get_current_weather",
    description: "Get current weather conditions for a location by lat/lng or city name",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Latitude (-90 to 90)" },
        lng: { type: "number", description: "Longitude (-180 to 180)" },
        query: { type: "string", description: "City or place name (e.g. 'Paris, France')" },
        units: { type: "string", description: "Unit system: 'metric' (default) or 'imperial'" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_forecast",
    description: "Get up to 7-day weather forecast for a location by lat/lng or city name",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Latitude (-90 to 90)" },
        lng: { type: "number", description: "Longitude (-180 to 180)" },
        query: { type: "string", description: "City or place name (e.g. 'Paris, France')" },
        days: { type: "number", description: "Number of days (1-7)", default: 7 },
        units: { type: "string", description: "Unit system: 'metric' (default) or 'imperial'" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_air_quality",
    description: "Get current air quality (AQI, PM2.5, PM10, Ozone) for a location",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Latitude (-90 to 90)" },
        lng: { type: "number", description: "Longitude (-180 to 180)" },
        query: { type: "string", description: "City or place name (e.g. 'Paris, France')" },
        units: { type: "string", description: "Unit system: 'metric' (default) or 'imperial'" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_locations",
    description: "Search for cities and places by name",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (e.g. 'Tokyo', 'New York')" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_astronomy",
    description: "Get sunrise/sunset and UV index for a location on a given date",
    inputSchema: {
      type: "object",
      properties: {
        lat: { type: "number", description: "Latitude (-90 to 90)" },
        lng: { type: "number", description: "Longitude (-180 to 180)" },
        query: { type: "string", description: "City or place name (e.g. 'Paris, France')" },
        date: { type: "string", description: "Date in YYYY-MM-DD format (defaults to today)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_multi_weather",
    description: "Get current weather for multiple locations at once",
    inputSchema: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          description: "Array of locations, each with lat/lng or query",
          items: {
            type: "object",
            properties: {
              lat: { type: "number", description: "Latitude" },
              lng: { type: "number", description: "Longitude" },
              query: { type: "string", description: "City or place name" },
            },
            additionalProperties: false,
          },
          minItems: 1,
          maxItems: 10,
        },
        units: { type: "string", description: "Unit system: 'metric' (default) or 'imperial'" },
      },
      required: ["locations"],
      additionalProperties: false,
    },
  },
];

const RESOURCES = [
  {
    uri: "weather://{lat},{lng}",
    name: "Current Weather",
    description: "Current weather conditions for a location",
    mimeType: "text/plain",
  },
  {
    uri: "forecast://{lat},{lng}",
    name: "7-Day Forecast",
    description: "7-day weather forecast for a location",
    mimeType: "text/plain",
  },
];

async function handleGetCurrentWeather(args) {
  const { lat, lng, query, units = "metric" } = args || {};
  const unitsErr = validateUnits(units);
  if (unitsErr) return { text: unitsErr, isError: true };
  let latitude, longitude;
  if (query) {
    const results = await searchLocations(query);
    if (!results.length) return { text: `No location found for "${query}"`, isError: true };
    latitude = results[0].latitude;
    longitude = results[0].longitude;
  } else if (lat != null && lng != null) {
    const errs = validateLatLng(lat, lng);
    if (errs.length) return { text: errs.join(", "), isError: true };
    latitude = lat;
    longitude = lng;
  } else {
    return { text: "Provide either lat/lng or query (city name)", isError: true };
  }
  const data = await fetchForecast(latitude, longitude);
  const idx = getCurrentHourIndex(data, data?.utc_offset_seconds || 0);
  const weather = getHourlyAtIndex(data, idx);
  const info = weatherInfo(weather.weatherCode, weather.isDay);
  const daily = data.daily?.time
    ? data.daily.time.map((d, i) => ({
        date: d,
        maxTemp: data.daily.temperature_2m_max[i],
        minTemp: data.daily.temperature_2m_min[i],
        weatherCode: data.daily.weather_code[i] ?? 0,
        description: weatherInfo(data.daily.weather_code[i] ?? 0, true).description,
        icon: weatherInfo(data.daily.weather_code[i] ?? 0, true).icon,
        precipSum: data.daily.precipitation_sum[i],
        precipProb: data.daily.precipitation_probability_max[i],
        windMax: data.daily.wind_speed_10m_max[i],
        uvMax: data.daily.uv_index_max[i],
        sunrise: data.daily.sunrise[i],
        sunset: data.daily.sunset[i],
      }))
    : [];
  const text = [
    `# ${info.icon} ${weather.description}`,
    `**Location:** ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    `**Temperature:** ${formatTemp(weather.temperature, units)} (feels like ${formatTemp(weather.feelsLike, units)})`,
    `**Humidity:** ${weather.humidity}%`,
    `**Wind:** ${formatWind(weather.windSpeed, units)}`,
    `**Pressure:** ${formatPressure(weather.pressure)}`,
    `**UV Index:** ${weather.uvIndex}`,
    `**Visibility:** ${weather.visibility} m`,
    `**Precipitation:** ${formatPrecip(weather.precipitation, units)}`,
    `**Cloud Cover:** ${weather.cloudCover}%`,
    `**Time:** ${weather.time}`,
    "",
    "## 7-Day Forecast",
    ...daily.map((d) => `- ${d.date}: ${d.icon} ${d.description}, ${formatTemp(d.minTemp, units)}–${formatTemp(d.maxTemp, units)}, precip ${formatPrecip(d.precipSum, units)}`),
  ].join("\n");
  return {
    content: [{ type: "text", text }],
    structuredContent: {
      location: { lat: latitude, lng: longitude },
      current: weather, forecast: daily,
      utcOffset: data.utc_offset_seconds, timezone: data.timezone, units,
    },
  };
}

async function handleGetForecast(args) {
  const { lat, lng, query, days = 7, units = "metric" } = args || {};
  const unitsErr = validateUnits(units);
  if (unitsErr) return { text: unitsErr, isError: true };
  const daysNum = Math.min(Math.max(parseInt(days, 10) || 7, 1), 7);
  let latitude, longitude;
  if (query) {
    const results = await searchLocations(query);
    if (!results.length) return { text: `No location found for "${query}"`, isError: true };
    latitude = results[0].latitude;
    longitude = results[0].longitude;
  } else if (lat != null && lng != null) {
    const errs = validateLatLng(lat, lng);
    if (errs.length) return { text: errs.join(", "), isError: true };
    latitude = lat;
    longitude = lng;
  } else {
    return { text: "Provide either lat/lng or query", isError: true };
  }
  const data = await fetchForecast(latitude, longitude);
  const daily = data.daily?.time
    ? data.daily.time.slice(0, daysNum).map((d, i) => ({
        date: d,
        maxTemp: data.daily.temperature_2m_max[i],
        minTemp: data.daily.temperature_2m_min[i],
        weatherCode: data.daily.weather_code[i] ?? 0,
        description: weatherInfo(data.daily.weather_code[i] ?? 0, true).description,
        icon: weatherInfo(data.daily.weather_code[i] ?? 0, true).icon,
        precipSum: data.daily.precipitation_sum[i],
        precipProb: data.daily.precipitation_probability_max[i],
        windMax: data.daily.wind_speed_10m_max[i],
        uvMax: data.daily.uv_index_max[i],
        sunrise: data.daily.sunrise[i],
        sunset: data.daily.sunset[i],
      }))
    : [];
  const text = [
    `# ${daysNum}-Day Forecast for ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    ...daily.map((d) => `• ${d.date}: ${d.icon} ${d.description}, ${formatTemp(d.minTemp, units)}–${formatTemp(d.maxTemp, units)}, precip ${formatPrecip(d.precipSum, units)}, wind ${formatWind(d.windMax, units)}`),
  ].join("\n");
  return {
    content: [{ type: "text", text }],
    structuredContent: {
      location: { lat: latitude, lng: longitude },
      forecast: daily, timezone: data.timezone, units, days: daysNum,
    },
  };
}

async function handleGetAirQuality(args) {
  const { lat, lng, query } = args || {};
  let latitude, longitude;
  if (query) {
    const results = await searchLocations(query);
    if (!results.length) return { text: `No location found for "${query}"`, isError: true };
    latitude = results[0].latitude;
    longitude = results[0].longitude;
  } else if (lat != null && lng != null) {
    const errs = validateLatLng(lat, lng);
    if (errs.length) return { text: errs.join(", "), isError: true };
    latitude = lat;
    longitude = lng;
  } else {
    return { text: "Provide either lat/lng or query", isError: true };
  }
  const data = await fetchAirQuality(latitude, longitude);
  if (!data || !data.hourly) return { text: "Air quality data unavailable", isError: true };
  const h = data.hourly;
  const idx = Math.floor(h.time.length / 2);
  const aqi = h.us_aqi?.[idx] ?? null;
  const pm25 = h.pm2_5?.[idx] ?? null;
  const pm10 = h.pm10?.[idx] ?? null;
  const o3 = h.ozone?.[idx] ?? null;
  const level = getPollenLevel(aqi);
  const text = [
    `# 🌬️ Air Quality for ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    `**US AQI:** ${aqi ?? "—"} (${level.level})`,
    `**PM2.5:** ${pm25 ?? "—"} µg/m³`,
    `**PM10:** ${pm10 ?? "—"} µg/m³`,
    `**Ozone:** ${o3 ?? "—"} µg/m³`,
    `**Time:** ${h.time[idx]}`,
  ].join("\n");
  return {
    content: [{ type: "text", text }],
    structuredContent: {
      location: { lat: latitude, lng: longitude },
      aqi, pm25, pm10, o3, level: level.level, time: h.time[idx],
    },
  };
}

async function handleSearchLocations(args) {
  const { query } = args || {};
  if (!query) return { text: "Provide a query (city name)", isError: true };
  const results = await searchLocations(query);
  if (!results.length) return { text: `No locations found for "${query}"`, isError: true };
  const text = [
    `# Locations matching "${query}"`,
    ...results.map((r) => `• ${r.displayName} (${r.countryCode}) — ${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}${r.population ? `, pop. ${r.population}` : ""}`),
  ].join("\n");
  return { content: [{ type: "text", text }], structuredContent: { results } };
}

async function handleGetAstronomy(args) {
  const { lat, lng, query, date } = args || {};
  const dateErr = validateDate(date);
  if (dateErr) return { text: dateErr, isError: true };
  let latitude, longitude;
  if (query) {
    const results = await searchLocations(query);
    if (!results.length) return { text: `No location found for "${query}"`, isError: true };
    latitude = results[0].latitude;
    longitude = results[0].longitude;
  } else if (lat != null && lng != null) {
    const errs = validateLatLng(lat, lng);
    if (errs.length) return { text: errs.join(", "), isError: true };
    latitude = lat;
    longitude = lng;
  } else {
    return { text: "Provide either lat/lng or query", isError: true };
  }
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const data = await fetchAstronomy(latitude, longitude, targetDate);
  if (!data || !data.daily) return { text: "Astronomy data unavailable", isError: true };
  const d = data.daily;
  const text = [
    `# 🌞 Astronomy for ${latitude.toFixed(4)}, ${longitude.toFixed(4)} on ${targetDate}`,
    `**Sunrise:** ${d.sunrise[0]}`,
    `**Sunset:** ${d.sunset[0]}`,
    `**UV Index Max:** ${d.uv_index_max[0]}`,
  ].join("\n");
  return {
    content: [{ type: "text", text }],
    structuredContent: {
      location: { lat: latitude, lng: longitude },
      date: targetDate,
      sunrise: d.sunrise[0], sunset: d.sunset[0], uvMax: d.uv_index_max[0],
    },
  };
}

async function handleGetMultiWeather(args) {
  const { locations, units = "metric" } = args || {};
  const unitsErr = validateUnits(units);
  if (unitsErr) return { text: unitsErr, isError: true };
  if (!Array.isArray(locations) || locations.length === 0) return { text: "Provide a non-empty locations array", isError: true };
  if (locations.length > 10) return { text: "Maximum 10 locations per request", isError: true };
  const results = [];
  const errors = [];
  for (const loc of locations) {
    let latitude, longitude;
    if (loc.query) {
      const found = await searchLocations(loc.query);
      if (!found.length) { errors.push({ query: loc.query, error: "Location not found" }); continue; }
      latitude = found[0].latitude;
      longitude = found[0].longitude;
    } else if (loc.lat != null && loc.lng != null) {
      const errs = validateLatLng(loc.lat, loc.lng);
      if (errs.length) { errors.push({ lat: loc.lat, lng: loc.lng, error: errs.join(", ") }); continue; }
      latitude = loc.lat;
      longitude = loc.lng;
    } else {
      errors.push({ loc, error: "Provide lat/lng or query" });
      continue;
    }
    try {
      const data = await fetchForecast(latitude, longitude);
      const idx = getCurrentHourIndex(data, data?.utc_offset_seconds || 0);
      const weather = getHourlyAtIndex(data, idx);
      const info = weatherInfo(weather.weatherCode, weather.isDay);
      results.push({
        location: { lat: latitude, lng: longitude },
        query: loc.query || null,
        current: {
          temperature: formatTemp(weather.temperature, units),
          feelsLike: formatTemp(weather.feelsLike, units),
          humidity: weather.humidity,
          wind: formatWind(weather.windSpeed, units),
          condition: weather.description,
          icon: weather.icon,
        },
      });
    } catch (err) {
      errors.push({ lat: latitude, lng: longitude, error: err.message });
    }
  }
  const text = [
    `# Multi-Location Weather (${results.length} results)`,
    ...results.map((r) => `• ${r.location.lat.toFixed(4)}, ${r.location.lng.toFixed(4)}: ${r.current.icon} ${r.current.condition}, ${r.current.temperature}, wind ${r.current.wind}`),
    errors.length ? `\n${errors.length} error(s):\n${errors.map((e) => `  - ${e.query ?? e.lat + "," + e.lng}: ${e.error}`).join("\n")}` : "",
  ].join("\n");
  return {
    content: [{ type: "text", text }],
    structuredContent: { locations: results, errors, units },
  };
}

// ── Resource handlers ────────────────────────────────────────────────

async function handleWeatherResource(uri) {
  const match = uri.match(/^weather:\/\/([-\d.]+),([-\d.]+)$/);
  if (!match) {
    return {
      contents: [{ uri, mimeType: "text/plain", text: "Invalid URI. Use weather://{lat},{lng}" }],
    };
  }
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  const data = await fetchForecast(lat, lng);
  const idx = getCurrentHourIndex(data, data?.utc_offset_seconds || 0);
  const weather = getHourlyAtIndex(data, idx);
  const info = weatherInfo(weather.weatherCode, weather.isDay);
  const text = [
    `${info.icon} ${info.description}`,
    `Temp: ${weather.temperature}°C (feels like ${weather.feelsLike}°C)`,
    `Humidity: ${weather.humidity}% | Wind: ${weather.windSpeed} km/h`,
    `Pressure: ${weather.pressure} hPa | UV: ${weather.uvIndex}`,
    `Precip: ${weather.precipitation} mm | Clouds: ${weather.cloudCover}%`,
    `Time: ${weather.time}`,
  ].join("\n");
  return { contents: [{ uri, mimeType: "text/plain", text }] };
}

async function handleForecastResource(uri) {
  const match = uri.match(/^forecast:\/\/([-\d.]+),([-\d.]+)$/);
  if (!match) {
    return {
      contents: [{ uri, mimeType: "text/plain", text: "Invalid URI. Use forecast://{lat},{lng}" }],
    };
  }
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  const data = await fetchForecast(lat, lng);
  const daily = data.daily?.time
    ? data.daily.time.map((d, i) => ({
        date: d,
        maxTemp: data.daily.temperature_2m_max[i],
        minTemp: data.daily.temperature_2m_min[i],
        weatherCode: data.daily.weather_code[i] ?? 0,
        description: weatherInfo(data.daily.weather_code[i] ?? 0, true).description,
        icon: weatherInfo(data.daily.weather_code[i] ?? 0, true).icon,
        precipSum: data.daily.precipitation_sum[i],
      }))
    : [];
  const lines = [
    `# 7-Day Forecast for ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    ...daily.map((d) => `• ${d.date}: ${d.icon} ${d.description}, ${d.minTemp}°–${d.maxTemp}°C, precip ${d.precipSum.toFixed(1)}mm`),
  ];
  return { contents: [{ uri, mimeType: "text/plain", text: lines.join("\n") }] };
}

// ── JSON-RPC handler ─────────────────────────────────────────────────

async function handleRequest(message) {
  const { jsonrpc, id, method, params } = message;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "aurafisky-mcp-server", version: "20.2.0" },
      },
    };
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  }

  if (method === "resources/list") {
    return { jsonrpc: "2.0", id, result: { resources: RESOURCES } };
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params || {};
    try {
      switch (name) {
        case "get_current_weather":
          return { jsonrpc: "2.0", id, result: await handleGetCurrentWeather(args) };
        case "get_forecast":
          return { jsonrpc: "2.0", id, result: await handleGetForecast(args) };
        case "get_air_quality":
          return { jsonrpc: "2.0", id, result: await handleGetAirQuality(args) };
        case "search_locations":
          return { jsonrpc: "2.0", id, result: await handleSearchLocations(args) };
        case "get_astronomy":
          return { jsonrpc: "2.0", id, result: await handleGetAstronomy(args) };
        case "get_multi_weather":
          return { jsonrpc: "2.0", id, result: await handleGetMultiWeather(args) };
        default:
          return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: ${name}` } };
      }
    } catch (err) {
      return { jsonrpc: "2.0", id, error: { code: -32603, message: err.message } };
    }
  }

  if (method === "resources/read") {
    const { uri } = params || {};
    try {
      if (uri.startsWith("weather://")) {
        return { jsonrpc: "2.0", id, result: await handleWeatherResource(uri) };
      }
      if (uri.startsWith("forecast://")) {
        return { jsonrpc: "2.0", id, result: await handleForecastResource(uri) };
      }
      return { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown resource URI: ${uri}` } };
    } catch (err) {
      return { jsonrpc: "2.0", id, error: { code: -32603, message: err.message } };
    }
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } };
}

// ── Stdio transport ──────────────────────────────────────────────────

process.stdin.setEncoding("utf8");

let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();
  let newlineIdx;
  while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim();
    buffer = buffer.slice(newlineIdx + 1);
    if (!line) continue;
    try {
      const message = JSON.parse(line);
      handleRequest(message).then((response) => {
        process.stdout.write(JSON.stringify(response) + "\n");
      });
    } catch (err) {
      process.stdout.write(JSON.stringify({
        jsonrpc: "2.0", id: null,
        error: { code: -32700, message: "Parse error" },
      }) + "\n");
    }
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});

console.error("Aurafisky MCP Server running on stdio");
