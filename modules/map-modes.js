// The map modes the app can display — one source of truth for all of them.
//
// The mode list used to be copied into nine places: the picker dropdown, the
// settings dropdown, the numbered-shortcut table, the validation list in
// setMapStyle, the validation list in cycleMapStyle, the toast labels, the
// badge labels, the loading indicator, and the two capability sets that
// decide whether the place-name overlay and the elevation legend apply.
//
// A mode added to one of them was invisible in the others, and a mode
// removed from one of them left the app switching to a basemap that no
// longer existed. Everything reads the list from here instead.
//
// Adding a mode means:
//   1. adding a descriptor below,
//   2. adding a basemap factory in app.js under the same id,
//   3. adding the <option> to both dropdowns in index.html.
//
// The test suite checks that all three stay in step.

/**
 * @typedef {object} MapMode
 * @property {string} id          stable key — localStorage, URL hash, DOM value
 * @property {string} name        long name — toast and picker
 * @property {string} [dropdown]  picker text when it differs from `name`
 * @property {string} short       short name — badge and loading indicator
 * @property {string} [settings]  settings-panel text when it differs from `short`
 * @property {string} icon        emoji — badge and picker
 * @property {"vector"|"raster"} kind
 * @property {boolean} hasReferenceLabels  the basemap draws its own place names
 * @property {boolean} elevation  the basemap shows terrain relief
 * @property {"light"|"dark"} theme  the basemap's brightness
 */

/** @type {ReadonlyArray<MapMode>} */
export const MAP_MODES = Object.freeze([
  {
    id: "street",
    name: "Default (Street)",
    short: "Default",
    icon: "🗺️",
    kind: "vector",
    theme: "light",
    hasReferenceLabels: true,
    elevation: false,
  },
  {
    id: "satellite",
    name: "Satellite (Aerial)",
    short: "Satellite",
    icon: "🛰️",
    kind: "raster",
    theme: "light",
    hasReferenceLabels: false,
    elevation: false,
  },
  {
    id: "hybrid",
    name: "Hybrid (Sat + Labels)",
    short: "Hybrid",
    settings: "Hybrid (Satellite + Labels)",
    icon: "🔀",
    kind: "raster",
    theme: "light",
    hasReferenceLabels: true,
    elevation: false,
  },
  {
    id: "terrain",
    name: "Terrain (Topographic)",
    short: "Terrain",
    icon: "🏔️",
    kind: "raster",
    theme: "light",
    hasReferenceLabels: false,
    elevation: true,
  },
  {
    id: "hillshade",
    name: "Hillshade (Elevation)",
    short: "Hillshade",
    icon: "⛰️",
    kind: "raster",
    theme: "light",
    hasReferenceLabels: false,
    elevation: true,
  },
  {
    id: "opentopo",
    name: "OpenTopoMap",
    short: "OpenTopo",
    settings: "OpenTopoMap",
    icon: "🧭",
    kind: "raster",
    theme: "light",
    hasReferenceLabels: false,
    elevation: true,
  },
  {
    id: "ocean",
    name: "Ocean (Bathymetry)",
    short: "Ocean",
    icon: "🌊",
    kind: "raster",
    theme: "light",
    hasReferenceLabels: false,
    elevation: false,
  },
  {
    id: "natgeo",
    name: "National Geographic",
    short: "NatGeo",
    settings: "National Geographic",
    icon: "🌍",
    kind: "raster",
    theme: "light",
    hasReferenceLabels: false,
    elevation: false,
  },
  {
    id: "dark",
    name: "Dark",
    dropdown: "Dark Mode",
    short: "Dark",
    icon: "🌙",
    kind: "vector",
    theme: "dark",
    hasReferenceLabels: true,
    elevation: false,
  },
  // ── Modes added after the original nine ────────────────────────────────
  // Appended rather than inserted so the numbered shortcuts below keep
  // pointing at the mode they have always pointed at.
  {
    // Esri's neutral canvas. A muted base is what makes the weather
    // overlays readable — the street map's own colours fight the radar and
    // temperature palettes. The base layer ships without labels, so it is
    // paired with its companion reference layer.
    id: "gray",
    name: "Light Gray (Canvas)",
    short: "Light Gray",
    icon: "⬜",
    kind: "raster",
    theme: "light",
    hasReferenceLabels: true,
    elevation: false,
  },
  {
    // The dark twin of the light canvas. Like the `dark` mode it takes the
    // app's own theme with it, so the dark map and the dark UI stay in step.
    id: "darkgray",
    name: "Dark Gray (Canvas)",
    short: "Dark Gray",
    icon: "⬛",
    kind: "raster",
    theme: "dark",
    hasReferenceLabels: true,
    elevation: false,
  },
  {
    // The dark counterpart of the hillshade mode. Relief shading reads
    // badly on a light basemap in a dark UI.
    id: "hillshadedark",
    name: "Dark Hillshade (Elevation)",
    short: "Dark Hillshade",
    icon: "🌒",
    kind: "raster",
    theme: "dark",
    hasReferenceLabels: false,
    elevation: true,
  },
  {
    // Highways, railways and airports. Pairs with the route-weather feature,
    // which is about the roads you actually drive.
    id: "transport",
    name: "Transportation",
    short: "Transport",
    settings: "Transportation",
    icon: "🛣️",
    kind: "raster",
    theme: "light",
    hasReferenceLabels: false,
    elevation: false,
  },
]);

/** Every mode id, in picker order. @type {ReadonlyArray<string>} */
export const MAP_MODE_IDS = Object.freeze(MAP_MODES.map((mode) => mode.id));

/** Mode descriptors keyed by id. */
export const MAP_MODE_BY_ID = Object.freeze(
  Object.fromEntries(MAP_MODES.map((mode) => [mode.id, mode])),
);

/**
 * The modes the number keys select, pinned by id rather than by position in
 * the picker. Pinning them means adding a mode to the picker can never
 * repoint a shortcut somebody already has in their fingers.
 *
 * `1`–`9` take the first nine, `0` takes the tenth.
 * @type {ReadonlyArray<string>}
 */
export const NUMBERED_MAP_MODE_IDS = Object.freeze([
  "street",
  "satellite",
  "hybrid",
  "terrain",
  "hillshade",
  "opentopo",
  "ocean",
  "natgeo",
  "dark",
  "gray",
]);

/** Modes that draw their own place names, so the overlay would double up. */
export const MAP_MODES_WITH_REFERENCE_LABELS = Object.freeze(
  MAP_MODES.filter((mode) => mode.hasReferenceLabels).map((mode) => mode.id),
);

/** Modes that show terrain relief and therefore want the elevation legend. */
export const MAP_MODES_WITH_ELEVATION = Object.freeze(
  MAP_MODES.filter((mode) => mode.elevation).map((mode) => mode.id),
);

/**
 * The dark basemaps.
 *
 * The app has always kept the map's brightness and the UI's brightness in
 * step: a dark basemap takes the app's theme with it, a light one brings it
 * back. That used to mean exactly one dark basemap; the dark canvas and the
 * dark hillshade are dark too, and they follow the same rule.
 */
export const MAP_MODES_WITH_DARK_THEME = Object.freeze(
  MAP_MODES.filter((mode) => mode.theme === "dark").map((mode) => mode.id),
);

/** Short names, for the badge and the loading indicator. */
export const MAP_MODE_SHORT_NAMES = Object.freeze(
  Object.fromEntries(MAP_MODES.map((mode) => [mode.id, mode.short])),
);

/**
 * Is this a mode the app knows about?
 *
 * @param {unknown} id
 * @returns {boolean}
 */
export function isMapMode(id) {
  return typeof id === "string" && Object.prototype.hasOwnProperty.call(MAP_MODE_BY_ID, id);
}

/**
 * Is this a dark basemap — one that takes the app's theme with it?
 *
 * @param {unknown} id
 * @returns {boolean}
 */
export function isDarkMapMode(id) {
  return typeof id === "string" && MAP_MODES_WITH_DARK_THEME.includes(id);
}

/**
 * The mode's name as it appears in the picker, without the emoji.
 *
 * @param {string} id
 * @returns {string}
 */
export function mapModeName(id) {
  const mode = MAP_MODE_BY_ID[id];
  return mode ? mode.dropdown || mode.name : "";
}

/**
 * The mode's name as it appears in the settings panel.
 *
 * @param {string} id
 * @returns {string}
 */
export function mapModeSettingsName(id) {
  const mode = MAP_MODE_BY_ID[id];
  return mode ? mode.settings || mode.short : "";
}

/**
 * The mode's name as it appears on the active-mode badge.
 *
 * @param {string} id
 * @returns {string}
 */
export function mapModeBadge(id) {
  const mode = MAP_MODE_BY_ID[id];
  return mode ? `${mode.icon} ${mode.short}` : "";
}
