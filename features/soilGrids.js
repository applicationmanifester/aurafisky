// features/soilGrids.js
// ── SOILGRIDS (ISRIC) SOIL PROPERTIES ────────────────────────────────
//
// Free, global soil data at 250 m resolution — no API key, no registration.
// Texture class (sand / silt / clay %) comes from ISRIC SoilGrids v2.0:
//   https://rest.isric.org/soilgrids/v2.0/properties/query
//
// We request topsoil (0–5 cm) sand %, clay %, pH and organic carbon, then
// map sand+clay to a USDA texture class that matches one of our SOIL_TYPES.
// Falls back gracefully when the network is down or the point has no data.
//
// Cache TTL: 24 h (soil texture does not change day to day).

const SOILGRIDS_URL = "https://rest.isric.org/soilgrids/v2.0/properties/query";
const SOILGRIDS_TTL_MS = 24 * 60 * 60 * 1000;

const _soilCache = new Map();

function soilCacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
}

function pruneSoilCache(now) {
  for (const [k, v] of _soilCache) {
    if (now - v.ts > SOILGRIDS_TTL_MS) _soilCache.delete(k);
  }
}

/**
 * USDA texture triangle → nearest Aurafisky soil texture.
 * sand, clay in percent (0-100).
 */
function usdaToTexture(sandPct, clayPct) {
  const siltPct = 100 - sandPct - clayPct;
  const s = Math.max(0, Math.min(100, sandPct));
  const c = Math.max(0, Math.min(100, clayPct));
  const si = Math.max(0, Math.min(100, siltPct));

  // Sandy: >= 70% sand and <= 15% clay
  if (s >= 70 && c <= 15) return "sandy";
  // Loamy sand
  if (s >= 70 && c > 15 && c < 30) return "sandy-loam";
  // Sandy loam: 43-85% sand, clay < 20, silt + 1.5*clay < 30
  if (s >= 43 && s <= 85 && c < 20 && si + 1.5 * c < 30) return "sandy-loam";
  // Loam: 23-52% sand, 7-27% clay, 28-50% silt, and sand > silt + clay
  if (s >= 23 && s <= 52 && c >= 7 && c <= 27 && si >= 28 && si <= 50 && s > si + c) return "loam";
  // Silt loam: sand < 50, silt >= 50, clay < 27
  if (s < 50 && si >= 50 && c < 27) return "loam";
  // Sandy clay loam
  if (s >= 43 && s <= 80 && c >= 20 && c <= 35 && si + 1.5 * c >= 30) return "sandy-loam";
  // Clay loam
  if (s >= 20 && s <= 45 && c >= 27 && c <= 40 && s + si >= 50) return "clay-loam";
  // Silty clay loam
  if (si >= 40 && c >= 27 && c < 40 && s <= 20) return "clay-loam";
  // Sandy clay
  if (s >= 45 && c >= 35 && s < 80) return "clay";
  // Silty clay
  if (si >= 40 && c >= 40 && s <= 45) return "clay";
  // Clay
  if (c >= 40 && s <= 45 && si >= 40) return "clay";
  // Default fallback: loam
  return "loam";
}

/**
 * Parses a SoilGrids property layer response into a single mean value.
 * SoilGrids returns { properties: { layers: [{ depths: [{ values: { mean } }] }] } }
 */
function layerValue(layer, depthLabel = "0-5cm") {
  if (!layer || !Array.isArray(layer.depths)) return null;
  const depth = layer.depths.find((d) => d.label === depthLabel) || layer.depths[0];
  if (!depth || !depth.values) return null;
  // mean is in centi-units for some properties (pH * 10, etc.)
  return depth.values?.mean ?? null;
}

/**
 * Fetches soil texture + pH for a point from SoilGrids.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {{now?:number, signal?:AbortSignal, ttl?:number}} [opts]
 * @returns {Promise<{soilId:string, sand:number|null, clay:number|null,
 *            pH:number|null, organicCarbon:number|null, source:"soilgrids"}|null>}
 */
export async function fetchSoilGrids(lat, lng, opts = {}) {
  const now = opts.now ?? Date.now();
  const key = soilCacheKey(lat, lng);
  const hit = _soilCache.get(key);
  if (hit && now - hit.ts < (opts.ttl ?? SOILGRIDS_TTL_MS)) return hit.data;

  const params = new URLSearchParams({
    lon: Number(lng).toFixed(4),
    lat: Number(lat).toFixed(4),
    depth: "0-5cm",
    value: "mean",
  });
  ["sand", "clay", "phh2o", "soc"].forEach((p) => params.append("property", p));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${SOILGRIDS_URL}?${params}`, { signal: opts.signal || ctrl.signal });
    if (!res.ok) throw new Error(`SoilGrids error ${res.status}`);
    const json = await res.json();
    const layers = (json.properties?.layers ?? []).reduce((acc, l) => {
      acc[l.name] = l;
      return acc;
    }, {});

    const sandRaw = layerValue(layers.sand ?? layers.sndppt);
    const clayRaw = layerValue(layers.clay ?? layers.clayppt);
    const phRaw = layerValue(layers.phh2o ?? layers.phihoc);
    const ocRaw = layerValue(layers.soc ?? layers.orcdrc);

    // SoilGrids v2: sand and clay are in g/kg (divide by 10 for %), pH is in pH*10 (divide by 10), soc is in dg/kg (divide by 100 for %)
    const sand = sandRaw != null ? (sandRaw > 100 ? sandRaw / 10 : sandRaw) : null;
    const clay = clayRaw != null ? (clayRaw > 100 ? clayRaw / 10 : clayRaw) : null;
    const pH = phRaw != null ? (phRaw > 14 ? phRaw / 10 : phRaw) : null;
    const organicCarbon = ocRaw != null ? ocRaw / 100 : null;

    let soilId = "loam";
    if (sand != null && clay != null) {
      soilId = usdaToTexture(sand, clay);
    }

    const data = {
      soilId,
      sand,
      clay,
      pH,
      organicCarbon,
      source: "soilgrids",
    };
    _soilCache.set(key, { ts: now, data });
    pruneSoilCache(now);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test seam: seed the SoilGrids cache without a network call. */
export function __seedSoilGridsCache(lat, lng, data, ts = Date.now()) {
  _soilCache.set(soilCacheKey(lat, lng), { ts, data });
}

/** Human-readable pH band. */
export function soilPHBand(pH) {
  if (pH == null) return "unknown";
  if (pH < 5.5) return "acidic";
  if (pH > 7.5) return "alkaline";
  return "neutral";
}
