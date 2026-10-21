// modules/geo.js
// ── Place naming, coordinate formatting and distance maths ──────────
//
// These were previously scattered across app.js and the feature modules,
// where the same naive `name.split(",")[0]` truncation appeared in at least
// five places with slightly different (and slightly wrong) behaviour. Keeping
// one implementation means a place is labelled the same way in the header,
// in Aura, in the wallpaper tabs and in bookmarks.
//
// The naming rules here are driven by what Nominatim actually returns. A
// reverse lookup yields a whole administrative ladder — for a spot in central
// Bengaluru that is roughly:
//
//   neighbourhood = D'Souza Layout
//   quarter       = Shanthala Nagar
//   suburb        = Ashokanagar
//   city_district = Bengaluru Central City Corporation
//   city          = Bengaluru
//   county        = Bangalore North
//   state_district= Bengaluru Urban
//   state         = Karnataka
//   country       = India
//
// Taking `city` first (which the old code did) labels all of that "Bengaluru",
// discarding the only information that tells the user where they actually are.

const EARTH_RADIUS_M = 6371008.8;

// ── Naming ─────────────────────────────────────────────────────────

/**
 * Granularity ladder, most-specific first.
 *
 * `suburb` is preferred over `neighbourhood` because Nominatim's
 * neighbourhood is often a single layout ("D'Souza Layout") that nobody
 * outside the city knows, whereas the suburb ("Ashokanagar") is the label a
 * local would actually use. `quarter` sits between the two and is tried when
 * there is no suburb. Administrative levels (`county`, `city_district`) come
 * after every inhabited/area level so they never win outright.
 */
const PRIMARY_LADDER = [
  'suburb',
  'quarter',
  'neighbourhood',
  'village',
  'hamlet',
  'town',
  'municipality',
  'city',
  'city_district',
  'county',
];

/** Levels that can follow the primary name to give regional context. */
const CONTEXT_LADDER = [
  'city',
  'town',
  'village',
  'municipality',
  'city_district',
  'county',
  'state_district',
  'state',
  'country',
];

function clean(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

/**
 * Loose equality used to suppress duplicate segments.
 *
 * Nominatim decorates regional levels with a suffix — `state_district` comes
 * back as "Leh district" while `city` is "Leh" — so a naive comparison emits
 * "Leh, Leh district, Ladakh". Administrative suffixes are stripped before
 * comparing so the decoration does not read as a genuinely different place.
 */
function looseEquals(a, b) {
  const norm = (s) =>
    clean(s)
      .toLowerCase()
      .replace(/[.,]/g, '')
      // "Leh district" / "Bengaluru Urban" / "Bavaria region"
      .replace(/\s+(district|region|county|province|prefecture|state|city|town)$/, '')
      .trim();
  const na = norm(a);
  const nb = norm(b);
  return na === nb || (!!na && !!nb && (na.startsWith(nb) || nb.startsWith(na)));
}

/** True when `value` is already contained in something we've appended. */
function alreadyIncluded(value, chosen) {
  return chosen.some((c) => looseEquals(c, value));
}

/**
 * Builds a place name from a Nominatim `address` object.
 *
 * @param {object} address - Nominatim address parts
 * @param {object} [opts]
 * @param {string} [opts.fallback] - Used when the address has nothing usable
 * @param {boolean} [opts.includeCountry=true]
 * @param {boolean} [opts.includePostcode=false]
 * @returns {string}
 */
export function formatPlaceName(address, opts = {}) {
  const { fallback = '', includeCountry = true, includePostcode = false } = opts;
  if (!address || typeof address !== 'object') return clean(fallback);

  const primaryKey = PRIMARY_LADDER.find((k) => clean(address[k]));
  const primary = primaryKey ? clean(address[primaryKey]) : '';
  if (!primary) return clean(fallback);

  const parts = [primary];

  // Walk up the hierarchy, adding each distinct level so the reader knows
  // roughly where this is. Never repeat the primary, and never emit the same
  // string twice ("Singapore, Singapore").
  for (const key of CONTEXT_LADDER) {
    const value = clean(address[key]);
    if (!value) continue;
    if (!includeCountry && key === 'country') break;
    if (alreadyIncluded(value, parts)) continue;
    parts.push(value);
    // Primary + nearest city is the useful default; deeper levels (county,
    // state, country) are only worth carrying when nothing better exists.
    if (key === 'city' || key === 'town' || key === 'village') break;
  }

  if (includePostcode) {
    const pc = clean(address.postcode);
    // Postcode describes the area, so it belongs next to the primary name.
    if (pc && !alreadyIncluded(pc, parts)) parts.splice(1, 0, pc);
  }

  return parts.join(', ');
}

/**
 * Short label for the big header: just the primary name.
 *
 * De-duplicates rather than blindly splitting, so a place whose primary and
 * parent share a name does not become "Singapore, Singapore".
 */
export function shortPlaceName(fullName) {
  const cleaned = clean(fullName);
  if (!cleaned) return '';
  const segments = cleaned.split(',').map(clean).filter(Boolean);
  if (segments.length <= 1) return segments[0] || cleaned;

  const first = segments[0];
  // If the first part is in a non-Latin script and there's a Latin parent (e.g. "ಬನ್ನೂರು, Puttur Taluk"),
  // combine them so the map's English name is immediately identifiable: "Puttur (ಬನ್ನೂರು)"
  const hasNonLatin = /[\u0600-\u06FF\u0750-\u077F\u0900-\u0D7F\u4E00-\u9FFF]/.test(first);
  if (hasNonLatin) {
    const latinParent = segments.slice(1).find((s) => /[a-zA-Z]/.test(s) && !looseEquals(s, 'India'));
    if (latinParent) {
      const cleanParent = latinParent.replace(/\s+(taluk|taluku|district|mandal|tehsil|block|panchayat)$/i, '').trim();
      if (cleanParent) {
        return `${cleanParent} (${first})`;
      }
    }
  }

  return first;
}

/**
 * Two-level label for lists where several entries could otherwise be
 * indistinguishable — bookmarks, wallpaper tabs. Keeps the first two
 * segments, collapsing the duplicate case.
 */
export function mediumPlaceName(fullName) {
  const segments = clean(fullName)
    .split(',')
    .map(clean)
    .filter(Boolean);
  if (!segments.length) return '';
  if (segments.length === 1) return segments[0];
  const second = segments.find((s) => !looseEquals(s, segments[0]));
  return second ? `${segments[0]}, ${second}` : segments[0];
}

// ── Coordinates ────────────────────────────────────────────────────

/**
 * Ground resolution of one degree at a given latitude, in metres.
 * Longitude degrees shrink by cos(latitude); latitude degrees do not.
 */
export function coordinateResolution(lat) {
  const clamped = Math.max(-90, Math.min(90, Number(lat) || 0));
  return {
    lat: 111320,
    lng: 111320 * Math.abs(Math.cos((clamped * Math.PI) / 180)),
  };
}

/**
 * Formats a coordinate pair.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {object} [opts]
 * @param {'decimal'|'dms'} [opts.format='decimal']
 * @param {number} [opts.precision=4] - decimal places when format is 'decimal'
 * @param {boolean} [opts.hemisphere=true] - append N/S/E/W
 * @returns {string}
 */
export function formatCoordinates(lat, lng, opts = {}) {
  const { format = 'decimal', precision = 4, hemisphere = true } = opts;
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) return '--';

  if (format === 'dms') return `${toDMS(lat, 'NS')} ${toDMS(lng, 'EW', true)}`;

  if (!hemisphere) {
    return `${Math.abs(lat).toFixed(precision)}, ${Math.abs(lng).toFixed(precision)}`;
  }

  const suffix = (v, positive, negative) => (v >= 0 ? positive : negative);
  const latStr = `${Math.abs(lat).toFixed(precision)}°${suffix(lat, 'N', 'S')}`;
  const lngStr = `${Math.abs(lng).toFixed(precision)}°${suffix(lng, 'E', 'W')}`;
  return `${latStr}, ${lngStr}`;
}

function toDMS(value, axes, isLng = false) {
  const abs = Math.abs(value);
  const hemisphere = value >= 0 ? axes[0] : axes[1];
  let deg = Math.floor(abs);
  let minutesFloat = (abs - deg) * 60;
  // At the equator a longitude of exactly 0 has no fractional part, and
  // rounding can otherwise push minutes to 60.
  let minutes = Math.floor(minutesFloat);
  let seconds = (minutesFloat - minutes) * 60;
  if (Number(seconds.toFixed(1)) >= 60) {
    seconds = 0;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes = 0;
    deg += 1;
  }
  return `${deg}°${String(minutes).padStart(2, '0')}'${seconds.toFixed(1).padStart(4, '0')}"${hemisphere}`;
}

/**
 * How many decimal places are meaningful at this latitude — five decimals is
 * ~1 m, but only in latitude; longitude needs more the closer you get to the
 * poles. Used to explain a coordinate's resolution in the UI.
 */
/**
 * Ground resolution of a decimal coordinate pair, in metres — the number
 * only, so callers that need to compare or threshold on it don't have to
 * strip units out of the formatted string.
 */
export function coordinateAccuracyMeters(lat, decimals) {
  const { lat: latRes, lng: lngRes } = coordinateResolution(lat);
  // A pair is only as precise as its worst axis. Longitude collapses towards
  // the poles (cos(lat) -> 0), so the latitude term dominates at the equator
  // and the longitude term takes over further north.
  return Math.pow(10, -decimals) * Math.min(latRes, lngRes);
}

/** Human-readable form of {@link coordinateAccuracyMeters}. */
export function formatCoordinateAccuracy(lat, decimals) {
  const metres = coordinateAccuracyMeters(lat, decimals);
  if (metres >= 1000) return `±${(metres / 1000).toFixed(1)} km`;
  if (metres >= 1) return `±${Math.round(metres)} m`;
  return `±${metres.toFixed(2)} m`;
}

// ── Distance & bearing ─────────────────────────────────────────────

/**
 * Great-circle distance in metres.
 *
 * Replaces a flat `Math.hypot(dLat, dLng)` comparison, which was measuring
 * degrees in two different directions: 0.05° of longitude is ~5.5 km at the
 * equator but only ~2.8 km at 60°N, so a single flat threshold silently
 * rejected valid nearby matches depending on where on Earth you were.
 */
export function haversineMeters(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((n) => n == null || Number.isNaN(n))) return Infinity;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Initial bearing from point 1 to point 2, in degrees 0..360. */
export function bearingDegrees(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some((n) => n == null || Number.isNaN(n))) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

export function bearingLabel(degrees) {
  if (degrees == null || Number.isNaN(degrees)) return '';
  return COMPASS_16[Math.round(degrees / 22.5) % 16];
}

export function formatDistance(meters) {
  if (meters == null || !Number.isFinite(meters)) return '';
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  if (meters < 10000) {
    const km = meters / 1000;
    return `${(Math.round((km + 1e-6) * 10) / 10).toFixed(1)} km`;
  }
  return `${Math.round(meters / 1000)} km`;
}

/**
 * "14 km NE of Bengaluru" — used when a lookup resolves to a parent city that
 * is genuinely far away, which happens constantly in sparse regions (a pass in
 * Ladakh reverse-geocodes to Leh, over 100 km distant).
 */
export function describeProximity(lat, lng, parentLat, parentLng, parentName) {
  const label = shortPlaceName(parentName);
  if (!label) return '';
  if (parentLat == null || parentLng == null) return '';
  const meters = haversineMeters(lat, lng, parentLat, parentLng);
  if (!Number.isFinite(meters) || meters < 1500) return '';
  const dir = bearingLabel(bearingDegrees(lat, lng, parentLat, parentLng));
  return `${formatDistance(meters)} ${dir} of ${label}`;
}

// ── Locality classification ────────────────────────────────────────

/**
 * A coarse descriptor for coordinates with no reverse-geocode result —
 * open ocean, ice sheet, empty desert.
 *
 * Deliberately coarse: without a coastline dataset we cannot tell an ice
 * shelf from open sea at 85°S, so polar cases say "Region" rather than
 * inventing a landmass, and ocean basins use rough IHO longitude boundaries.
 * The goal is a readable label, not a survey-grade one.
 */
export function describeCoordinates(lat, lng) {
  if (lat <= -60) return 'Antarctic Region';
  if (lat >= 66.5) return 'Arctic Region';

  // Normalise to -180..180 — the map view is multiWorld, so a click three
  // worlds to the right arrives with lng 900.
  const lon = ((((lng + 180) % 360) + 360) % 360) - 180;

  let basin;
  if (lon >= -70 && lon < 20) basin = 'Atlantic Ocean';
  else if (lon >= 20 && lon < (lat < 0 ? 147 : 100)) basin = 'Indian Ocean';
  else basin = 'Pacific Ocean';

  if (basin === 'Indian Ocean') return basin;
  return `${lat >= 0 ? 'North' : 'South'} ${basin}`;
}

/**
 * Decomposes a Nominatim address object and display_name into a structured
 * hierarchy: Area/Locality, Town/City, Taluk/Tehsil, District, State/Province,
 * Postal Code, Country, and a full clean address string.
 *
 * @param {object} address - Nominatim address details
 * @param {string} [displayName] - Full raw or fallback display name
 * @param {number} [lat] - Latitude
 * @param {number} [lng] - Longitude
 * @returns {{ area: string, city: string, taluk: string, district: string, state: string, postcode: string, country: string, fullAddress: string }}
 */
export function breakdownAddress(address = {}, displayName = '', lat = null, lng = null) {
  const a = (address && typeof address === 'object') ? address : {};

  // 1. Area / Locality: road, suburb, neighbourhood, quarter, village, hamlet
  const subArea = clean(a.suburb || a.quarter || a.neighbourhood || a.residential);
  const road = clean(a.road || a.pedestrian || a.street);
  let area = '';
  if (subArea && road && !looseEquals(subArea, road)) {
    area = `${road}, ${subArea}`;
  } else {
    area = subArea || road || clean(a.village || a.hamlet || a.isolated_dwelling || '');
  }

  // 2. City / Town
  let city = clean(a.city || a.town || a.municipality || '');
  if (!city && clean(a.village) && (!area || !looseEquals(clean(a.village), area))) {
    city = clean(a.village);
  }

  // 3. Taluk / Tehsil / Sub-district / County
  let taluk = clean(a.taluk || a.taluku || a.tehsil || a.subdistrict || a.mandal || '');
  if (!taluk && clean(a.county)) {
    taluk = clean(a.county);
  }

  // 4. District
  let district = clean(a.state_district || a.district || '');
  if (!district && clean(a.county) && !/taluk|taluku|tehsil|mandal|subdistrict/i.test(clean(a.county))) {
    district = clean(a.county);
  }

  // 5. State / Province
  let state = clean(a.state || a.province || a.region || '');

  // Fallback: If structured address fields are missing, extract from comma-separated displayName
  if (!area && !city && !taluk && !district && !state && displayName && String(displayName).includes(',')) {
    const rawSegments = String(displayName).split(',').map(s => s.trim()).filter(Boolean);
    if (rawSegments.length >= 5) {
      area = rawSegments[0] || '';
      taluk = rawSegments[1] || '';
      district = rawSegments[2] || '';
      state = rawSegments[3] || '';
    } else if (rawSegments.length === 4) {
      area = rawSegments[0] || '';
      district = rawSegments[1] || '';
      state = rawSegments[2] || '';
    } else if (rawSegments.length === 3) {
      area = rawSegments[0] || '';
      district = rawSegments[1] || '';
      state = rawSegments[2] || '';
    } else if (rawSegments.length === 2) {
      area = rawSegments[0] || '';
      state = rawSegments[1] || '';
    }
  }

  // 6. Postcode
  const postcode = clean(a.postcode || '');

  // 7. Country
  let country = clean(a.country || '');
  if (!country && displayName && String(displayName).includes(',')) {
    const rawSegments = String(displayName).split(',').map(s => s.trim()).filter(Boolean);
    if (rawSegments.length >= 3) {
      country = rawSegments[rawSegments.length - 1] || '';
    }
  }

  // 8. Full Address String
  const parts = [];
  if (road && !parts.some(p => looseEquals(p, road))) parts.push(road);
  if (subArea && !parts.some(p => looseEquals(p, subArea))) parts.push(subArea);
  if (area && !parts.some(p => looseEquals(p, area))) parts.push(area);
  if (city && !parts.some(p => looseEquals(p, city))) parts.push(city);
  if (taluk && !parts.some(p => looseEquals(p, taluk))) parts.push(taluk);
  if (district && !parts.some(p => looseEquals(p, district))) parts.push(district);
  if (state && !parts.some(p => looseEquals(p, state))) parts.push(state);
  if (postcode && !parts.some(p => looseEquals(p, postcode))) parts.push(postcode);
  if (country && !parts.some(p => looseEquals(p, country))) parts.push(country);

  const fullAddress = (clean(displayName) && String(displayName).includes(','))
    ? clean(displayName)
    : (parts.length > 0 ? parts.join(', ') : clean(displayName) || (lat != null && lng != null ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : ''));

  return {
    area,
    city,
    taluk,
    district,
    state,
    postcode,
    country,
    fullAddress,
  };
}