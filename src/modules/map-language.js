// Real map-label language switching for OpenFreeMap's OpenMapTiles-schema
// vector styles. Each label layer's text-field can use language-specific
// OpenMapTiles fields (for example `name_de`) when present, then fall back
// to the local name and English name. Overriding
// every symbol layer's text-field re-labels the whole map (cities, roads,
// POIs, water) with no new network request.
//
// Pure function, no OL/MapLibre dependency, so it's usable both by the app
// (build a localized style object, hand it to ol-mapbox-style's apply()/
// applyStyle()) and by a plain executable test.

/**
 * @param {any} glStyle Mapbox/MapLibre style JSON object (not mutated)
 * @param {string} lang BCP-47 locale, "en", or the legacy "native" option
 * @returns {any} a deep-cloned style object with every symbol layer's
 *   text-field overridden for the requested language
 */
export function localizeGlStyle(glStyle, lang) {
  const clone = JSON.parse(JSON.stringify(glStyle || {}));
  const normalized = typeof lang === "string" ? lang.trim() : "en";
  const baseLocale = normalized.split(/[-_]/)[0].toLowerCase();
  let preferredFields = [];

  if (normalized && normalized !== "native" && baseLocale !== "en") {
    const underscored = normalized.replace(/-/g, "_");
    const candidates = [...new Set([
      normalized,
      normalized.toLowerCase(),
      underscored,
      underscored.toLowerCase(),
      baseLocale,
    ])];
    for (const candidate of candidates) {
      for (const key of [`name:${candidate}`, `name_${candidate}`]) {
        if (!preferredFields.includes(key)) preferredFields.push(key);
      }
    }
  } else if (normalized === "native") {
    preferredFields = ["name:nonlatin", "name"];
  } else {
    preferredFields = ["name_en", "name:en"];
  }

  const expr = [
    "coalesce",
    ...preferredFields.map((field) => ["get", field]),
    ["get", "name"],
    ["get", "name_en"],
  ];

  const referencesName = (value) => {
    if (!Array.isArray(value)) return false;
    if (
      (value[0] === "get" || value[0] === "has") &&
      typeof value[1] === "string" &&
      value[1].startsWith("name")
    ) {
      return true;
    }
    return value.some(referencesName);
  };

  for (const layer of clone.layers || []) {
    const textField = layer.layout?.["text-field"];
    if (layer.type === "symbol" && referencesName(textField)) {
      layer.layout["text-field"] = expr;
    }
  }
  return clone;
}
