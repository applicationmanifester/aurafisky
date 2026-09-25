# Code Review: Weather Service Module

## Executive Summary

The `weather.js` module is a feature-rich weather service (~2200 lines) with extensive functionality for fetching, transforming, and analyzing weather data from Open-Meteo APIs. While functionally comprehensive, it contains **critical bugs**, **performance bottlenecks**, and **maintainability issues** that should be addressed before production deployment.

---

## 🔴 Critical Bugs

### 1. Cache Race Condition & Data Corruption (`_cachedFetch`, lines 42-61)

```javascript
// BUG: Stores promise, then overwrites with { data: promise, ... }
const promise = fetchFn()
  .then((data) => {
    _setCache(key, { data, ts: Date.now() });
    return data;
  })
  .catch((err) => {
    _requestCache.delete(key);
    throw err;
  });
_setCache(key, { data: promise, ts: Date.now() });  // ← OVERWRITES with promise!
return promise;
```

**Impact**: Cache lookups return a Promise instead of resolved data. Callers expecting data get a pending promise, causing double-fetching and type errors.

**Fix**: Store the promise separately from resolved data, or use a proper memoization pattern.

---

### 2. Duplicate Cache Logic in `fetchForecast` (lines 202-264)

`fetchForecast` implements its own caching (lines 205-209, 256) that:
- Uses a different key format than `_cachedFetch`
- Doesn't benefit from the deduplication logic
- Has no TTL enforcement on the initial check

---

### 3. `getParameterImportance` Calls `getComfortIndex` 7 Times (lines 1825-1842)

```javascript
const params = [
  { key: "Temperature", ..., getter: (w, a) => getComfortIndex({ ...w, temperature: 22 }, a) - baseScore },
  { key: "Humidity", ..., getter: (w, a) => getComfortIndex({ ...w, humidity: 45 }, a) - baseScore },
  // ... 5 more calls
];
```

**Impact**: O(7 × comfortIndex) computation per call. With 240+ hourly points, this is extremely expensive.

---

## 🟠 Performance Bottlenecks

| Function | Complexity | Issue |
|----------|-----------|-------|
| `getConfidenceBands` | O(n × window) | Naive sliding window, recomputes mean/variance from scratch |
| `decomposeSignalNoise` | O(n × window) | Same as above |
| `computeDiurnalBias` | O(n) but allocates objects per hour | Could use typed arrays |
| `getCurrentHourIndex` | O(n) + Intl.DateTimeFormat | Slow formatter; timezone handling is fragile |
| `getSpatialGradient` | O(1) but fake | Returns estimated temps, not real data |

**Optimization**: Use sliding window algorithms (O(n)) for rolling statistics.

---

## 🟡 Logical Errors & Design Flaws

### 1. `computeDiurnalBias` / `correctTemperature` Circular Logic (lines 1645-1675)

Computes bias from the **same forecast data** it's meant to correct. This doesn't correct model bias—it just centers the data around its own mean.

### 2. `getHistoricalPattern` Assumes 5 Years/Entry (line 1590)

```javascript
label: `... ${validHistorical.length * 5}-year average`
```

**Issue**: The API returns whatever historical days you request; there's no guarantee each entry = 5 years.

### 3. `getUpwindPoint` Hardcodes 20 km/h Wind Speed (line 1609)

```javascript
const distance = hours * 20; // assume 20 km/h avg wind travel
```

Should use actual `windSpeed` from the weather data.

### 4. `getSpatialGradient` Returns Fake Data (lines 2075-2092)

Estimates temperature from latitude only (`20 - Math.abs(lat) * 0.4`). No actual API calls to nearby grid points.

### 5. `parseIsoLocal` Loses Timezone Info (lines 562-571)

Creates `Date` from local components, losing the original timezone context. Causes subtle bugs in DST transitions.

---

## 🔵 Maintainability Issues

### 1. Monolithic IIFE (2200+ lines)

All functionality in one closure. Should be split into modules:
- `api/` - Fetching, caching, retry logic
- `formatting/` - Unit formatting, date/time helpers
- `analysis/` - Comfort index, advisories, regimes
- `algorithms/` - Statistics, signal processing
- `types/` - TypeScript interfaces

### 2. No Exported TypeScript Types

Test file imports types (`WS.HourlyWeather`, `WS.WeatherAPIResponse`, etc.) but the module doesn't export them.

### 3. Duplicate Unit Conversions

`weather.js` lines 76-87 and `src/utils.js` lines 5-12 have identical functions.

### 4. Magic Numbers

- Pressure threshold: `0.3` hPa/hr (lines 1321, 1329)
- Wind shift threshold: `45°` (line 1358)
- Comfort index weights: scattered throughout
- Stargazing weights: `0.9`, `30` (lines 962-963)

### 5. Inconsistent Error Handling

- `fetchForecast`: throws on failure
- `fetchAirQuality`: returns `null` on failure
- `searchLocations`: returns `[]` on failure
- `fetchHistoricalWeather`: throws

---

## 🟢 Recommendations Summary

| Priority | Action |
|----------|--------|
| **P0** | Fix cache race condition in `_cachedFetch` |
| **P0** | Unify cache logic; make `fetchForecast` use `_cachedFetch` |
| **P0** | Fix `getParameterImportance` performance (memoize or analytical approach) |
| **P1** | Split into ES modules with proper TypeScript types |
| **P1** | Replace O(n×window) algorithms with O(n) sliding window |
| **P1** | Remove fake `getSpatialGradient` or implement real API calls |
| **P1** | Extract magic numbers to named constants |
| **P2** | Standardize error handling (prefer Result/Either pattern) |
| **P2** | Fix `getUpwindPoint` to use actual wind speed |
| **P2** | Fix `parseIsoLocal` timezone handling |
| **P3** | Deduplicate unit conversions with `src/utils.js` |

---

## Refactored Architecture

```
src/
├── weather/
│   ├── index.ts              # Public API barrel export
│   ├── types.ts              # TypeScript interfaces
│   ├── constants.ts          # Magic numbers, WMO codes, compass
│   ├── api/
│   │   ├── client.ts         # Fetch + retry + AbortSignal
│   │   ├── cache.ts          # Fixed memoization cache
│   │   ├── forecast.ts       # fetchForecast, fetchAirQuality, fetchHistorical
│   │   └── geocoding.ts      # searchLocations
│   ├── formatting/
│   │   ├── units.ts          # Unit conversions (shared with utils.js)
│   │   ├── dates.ts          # parseIsoLocal, formatDayLabel, etc.
│   │   └── weather.ts        # formatTemp, formatWind, getWeatherInfo
│   ├── analysis/
│   │   ├── comfort.ts        # getComfortIndex, getComfortLabel
│   │   ├── advisories.ts     # getAdvisories
│   │   ├── decisions.ts      # getDecisions
│   │   ├── regime.ts         # classifyWeatherRegime
│   │   ├── stargazing.ts     # getStargazingScore, getGoldenBlueHourWindows
│   │   ├── briefing.ts       # generateBriefing
│   │   └── anomaly.ts        # detectAnomaly, getHistoricalPattern
│   ├── algorithms/
│   │   ├── statistics.ts     # Rolling mean/variance, percentile
│   │   ├── signal.ts         # decomposeSignalNoise, getWeatherMomentum
│   │   ├── confidence.ts     # getConfidenceBands, computeTrustScore
│   │   ├── diurnal.ts        # computeDiurnalBias, correctTemperature
│   │   └── compression.ts    # getTemporalCompression
│   └── astronomy/
│       ├── moon.ts           # getMoonPhase
│       └── upwind.ts         # getUpwindPoint (fixed to use real wind)
```

---

## Files to Create/Modify

1. **New**: `src/weather/types.ts` - TypeScript interfaces
2. **New**: `src/weather/constants.ts` - Constants & WMO codes
3. **New**: `src/weather/api/cache.ts` - Fixed cache implementation
4. **New**: `src/weather/api/client.ts` - HTTP client with retry
5. **New**: `src/weather/formatting/units.ts` - Consolidated unit conversions
6. **Refactor**: `src/utils.js` → `src/weather/formatting/units.ts` (ESM)
7. **Refactor**: Split `weather.js` into the module structure above
8. **Update**: `weather-esm.js` to re-export from new structure
9. **Update**: Tests to import from new module paths