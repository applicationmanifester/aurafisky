// Real map-label language switching for OpenFreeMap's OpenMapTiles-schema
// vector styles. Each label layer's text-field is a "case"/"coalesce"
// expression over a local `name` field and an English `name_en` field —
// confirmed by inspecting the live liberty/dark style JSON. Overriding
// every symbol layer's text-field re-labels the whole map (cities, roads,
// POIs, water) with no new network request.
//
// Pure function, no OL/MapLibre dependency, so it's usable both by the app
// (build a localized style object, hand it to ol-mapbox-style's apply()/
// applyStyle()) and by a plain executable test.

/**
 * @param {any} glStyle Mapbox/MapLibre style JSON object (not mutated)
 * @param {"en"|"native"} lang
 * @returns {any} a deep-cloned style object with every symbol layer's
 *   text-field overridden for the requested language
 */
export function localizeGlStyle(glStyle, lang) {
  const clone = JSON.parse(JSON.stringify(glStyle || {}));
  const expr =
    lang === "native"
      ? ["get", "name"]
      : ["coalesce", ["get", "name_en"], ["get", "name"]];

  for (const layer of clone.layers || []) {
    if (layer.type === "symbol" && layer.layout?.["text-field"] !== undefined) {
      layer.layout["text-field"] = expr;
    }
  }
  return clone;
}
