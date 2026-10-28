// features/cropData.js
// ── CROP KNOWLEDGE BASE ──────────────────────────────────────────────
//
// "What should I sow on this field, when, and how?" — answerable only from
// two inputs: the climate the site produces (temperature / rainfall /
// elevation / humidity) and the soil it sits in. This module holds the
// curated crop envelopes; features/farm.js scores the live site against
// them. No network, no DOM — pure data + pure helpers so unit tests stay
// dependency-free.
//
// Envelope figures are standard agronomic ranges used widely across
// extension literature (average tropical/subtropical practice). They are
// deliberately wide: the recommender compares a site against them and
// reports WHICH requirement is the binding constraint rather than
// pretending a single number is the truth.
//
// Moisture thresholds are volumetric (m³/m³) for the root zone and are
// soil-texture specific — clay holds ~2x the water of sand at the same
// "drainage class", so a texture-agnostic threshold misclassifies both.
//
// Arrays of calendar months use 1 = January.

// ────────────────── soil textures ──────────────────

export const SOIL_TYPES = [
  {
    id: "sandy",
    name: "Sandy",
    desc: "Light, drains fast, holds little water. Frequent light irrigation suits it.",
    dryBelow: 0.10,
    fieldCapacity: 0.17,
    wetAbove: 0.21,
    irrigationHint: "Every 3-4 days in hot season; organic matter mulch is essential.",
  },
  {
    id: "sandy-loam",
    name: "Sandy loam",
    desc: "Easy to work, drains well, the sweet spot for most vegetables and groundnut.",
    dryBelow: 0.12,
    fieldCapacity: 0.22,
    wetAbove: 0.27,
    irrigationHint: "Every 5-6 days in hot season; watch it dry fast after transplanting.",
  },
  {
    id: "loam",
    name: "Loam",
    desc: "Balanced sand/silt/clay — suits the widest range of crops.",
    dryBelow: 0.14,
    fieldCapacity: 0.27,
    wetAbove: 0.33,
    irrigationHint: "Weekly heavy irrigation in dry spells; avoid ponding.",
  },
  {
    id: "clay-loam",
    name: "Clay loam",
    desc: "Heavier, holds water and nutrients well; slower to warm in spring.",
    dryBelow: 0.18,
    fieldCapacity: 0.32,
    wetAbove: 0.38,
    irrigationHint: "Irrigate every 8-10 days; longer gaps, larger runs.",
  },
  {
    id: "clay",
    name: "Clay",
    desc: "Dense, high water-holding, easy to waterlog — the classic paddy soil.",
    dryBelow: 0.21,
    fieldCapacity: 0.37,
    wetAbove: 0.44,
    irrigationHint: "Intervals of 10+ days; never irrigate on a standing crop if it cracks/puddles.",
  },
  {
    id: "alluvial",
    name: "Alluvial (river)",
    desc: "Fertile, medium texture — the Indo-Gangetic / delta farmland profile.",
    dryBelow: 0.14,
    fieldCapacity: 0.27,
    wetAbove: 0.33,
    irrigationHint: "Weekly in dry spells; deep, infrequent runs build root systems.",
  },
  {
    id: "black",
    name: "Black / regur",
    desc: "Deep-cracking cotton soil of the Deccan — great water retention, cracks when dry.",
    dryBelow: 0.20,
    fieldCapacity: 0.36,
    wetAbove: 0.43,
    irrigationHint: "Stores large reserves; irrigate only when cracks appear or crop wilts.",
  },
  {
    id: "red-laterite",
    name: "Red / lateritic",
    desc: "Acidic, moderate fertility, needs organic matter; suits millets and plantations.",
    dryBelow: 0.11,
    fieldCapacity: 0.22,
    wetAbove: 0.27,
    irrigationHint: "Short frequent intervals; heavy mulch and FYM to lift water holding.",
  },
];

/**
 * Looks up a soil texture definition.
 * @param {string} id
 * @returns {{id:string,name:string,dryBelow:number,fieldCapacity:number,wetAbove:number}|null}
 */
export function getSoil(id) {
  return SOIL_TYPES.find((s) => s.id === id) || null;
}

// ────────────────── crops ──────────────────
//
// temp: growing-season air temperature envelope (°C). optMin/optMax is the
//   band where the crop actually logs the most growth.
// rainfall: seasonal water requirement (mm) — rainfed crops sit at the low
//   end of their band, irrigated crops anywhere inside it.
// humidity: relative-humidity comfort range (drives disease pressure).
// altitude: metres above sea level.
// waterNeed: low <400mm season, medium 400-800mm, high >800mm of applied water.
// duration: days from sowing to harvest.
// sowMonths: calendar months (1 = Jan) when sowing is appropriate for the
//   northern-hemisphere tropics/subtropics; southern-hemisphere sites are
//   rotated by +6 months by getSowMonthsForHemisphere().
// frost: minimum temperature the crop tolerates without damage (°C).

const CROP_DEFS = [
  // ── cereals ──
  {
    id: "rice",
    name: "Rice (Paddy)",
    emoji: "🌾",
    category: "Cereal",
    seasons: ["Kharif"],
    temp: { min: 18, max: 40, optMin: 22, optMax: 33 },
    rainfall: { min: 800, max: 2200 },
    humidity: { min: 60, max: 100 },
    waterNeed: "high",
    altitude: { min: 0, max: 2200 },
    soils: ["clay", "clay-loam", "alluvial", "loam"],
    duration: 120,
    sowMonths: [6, 7],
    frost: 5,
    notes: "Submerged crop: standing water in the first 6 weeks, then intermittent wetting to 10 days before harvest.",
    how: {
      sow: "Nursery first, 20-25 day seedlings transplanted 2-3 per hill; direct-seeded rice broadcast before the rains consolidate.",
      spacing: "20x15 cm transplanting (or 20x10 for high tillering hybrids).",
      irrigation: "Keep 3-5 cm standing water till panicle; drain and apply irrigation once the soil cracks before heading.",
      fert: "Basal FYM/compost 5-10 t/ha; NPK 100-120:60:40 kg/ha, half nitrogen split at tillering and panicle initiation.",
      care: "Watch for stem borer and leaf folder; blast and bacterial leaf blight in prolonged cloud. Zinc sulphate corrects yellowing.",
      harvest: "Cut when grain moisture drops below 25% and 80% of panicles turn straw-gold.",
    },
  },
  {
    id: "wheat",
    name: "Wheat",
    emoji: "🌿",
    category: "Cereal",
    seasons: ["Rabi"],
    temp: { min: 8, max: 32, optMin: 14, optMax: 22 },
    rainfall: { min: 300, max: 750 },
    humidity: { min: 35, max: 75 },
    waterNeed: "medium",
    altitude: { min: 0, max: 3000 },
    soils: ["loam", "clay-loam", "alluvial"],
    duration: 130,
    sowMonths: [10, 11, 12],
    sowMonthsTemperate: [9, 10, 3, 4],
    frost: 0,
    notes: "Winter crop: needs cold grain-fill after stem elongation; heats up and stops if sown late.",
    how: {
      sow: "Line sow 5-6 cm deep into a firm seedbed just after pre-sowing irrigation.",
      spacing: "22.5 cm rows (drill) with 100-125 kg seed/ha; zero-till after rice works well.",
      irrigation: "Crown root, tillering, jointing, flowering and milk — 4-5 irrigations; first one 20-25 days after sowing.",
      fert: "N:P:K 100:60:40 kg/ha with half N basal, rest at first and third irrigation; phosphorus entirely basal.",
      care: "Rust and powdery mildew in humid spells, aphids mid-season; termites in light soils.",
      harvest: "When straw dries and grains show a hard thumbnail-dent (moisture <25%).",
    },
  },
  {
    id: "maize",
    name: "Maize (Corn)",
    emoji: "🌽",
    category: "Cereal",
    seasons: ["Kharif", "Rabi"],
    temp: { min: 15, max: 38, optMin: 18, optMax: 32 },
    rainfall: { min: 400, max: 900 },
    humidity: { min: 40, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2600 },
    soils: ["loam", "sandy-loam", "clay-loam", "alluvial"],
    duration: 100,
    sowMonths: [6, 7, 1, 2],
    frost: 0,
    notes: "Tasselling and silking are the critical window — water stress then costs kernel number directly.",
    how: {
      sow: "Direct sow 4-5 cm deep; seedbed must be moist at sowing. In dry zones, dibble before rains.",
      spacing: "60x20 cm; 18-20 kg seed/ha.",
      irrigation: "Knee-high, tasselling and grain-fill are the three non-negotiables; avoid waterlogging for 48h+ at emergence.",
      fert: "120:60:40 NPK kg/ha; top-dress N at knee-high and after 3-4 weeks.",
      care: "Fall armyworm (wet-season), maize borer; common rust in humid hills; borers tolerate IPM well.",
      harvest: "At black-layer stage — kernel milk line gone, husk papery.",
    },
  },
  {
    id: "sorghum",
    name: "Sorghum (Jowar)",
    emoji: "🌾",
    category: "Cereal",
    seasons: ["Kharif", "Rabi"],
    temp: { min: 15, max: 42, optMin: 24, optMax: 35 },
    rainfall: { min: 300, max: 700 },
    humidity: { min: 30, max: 80 },
    waterNeed: "low",
    altitude: { min: 0, max: 1800 },
    soils: ["black", "loam", "sandy-loam", "alluvial"],
    duration: 110,
    sowMonths: [6, 7],
    frost: 2,
    notes: "The rain-fallback for sorghum country: survives dry spells better than maize.",
    how: {
      sow: "Dibble 4-5 cm deep on ridges/ridges-and-furrows in black soil; broadcast in dry zones just before rains.",
      spacing: "45x15 cm (25 kg/ha) in high rainfall; 60x20 cm where moisture is scarcer.",
      irrigation: "1-2 protective irrigations at boot-leaf and flowering double yields in dry years.",
      fert: "60:40:40 NPK kg/ha; boron spray corrects barren panicles in black soils.",
      care: "Shoot fly early, midge at flowering; grain mould if rain coincides with harvest.",
      harvest: "At physiological maturity — grains hard, black-line on the germ.",
    },
  },
  {
    id: "pearl-millet",
    name: "Pearl Millet (Bajra)",
    emoji: "🌾",
    category: "Cereal",
    seasons: ["Kharif", "Summer"],
    temp: { min: 18, max: 45, optMin: 25, optMax: 35 },
    rainfall: { min: 250, max: 650 },
    humidity: { min: 25, max: 75 },
    waterNeed: "low",
    altitude: { min: 0, max: 1600 },
    soils: ["sandy", "sandy-loam", "black"],
    duration: 90,
    sowMonths: [6, 7, 4, 5],
    frost: 3,
    notes: "The most drought- and heat-tolerant cereal — the default choice where monsoon fails.",
    how: {
      sow: "Dibble 3-4 cm deep exactly with monsoon onset; dry-sown ahead of rain in arid tracts.",
      spacing: "45x12 cm; 4-5 kg/ha.",
      irrigation: "Normally rainfed; one irrigation at heading rescues dry spells.",
      fert: "50:40:40 NPK kg/ha with FYM; Niger combats iron chlorosis in sandy fields.",
      care: "Downy mildew in damp soils — rotate and use treated seed.",
      harvest: "When earheads turn grey-yellow and seed falls easily from the top.",
    },
  },
  {
    id: "finger-millet",
    name: "Finger Millet (Ragi)",
    emoji: "🌾",
    category: "Cereal",
    seasons: ["Kharif", "Rabi"],
    temp: { min: 15, max: 36, optMin: 20, optMax: 30 },
    rainfall: { min: 400, max: 900 },
    humidity: { min: 40, max: 85 },
    waterNeed: "low",
    altitude: { min: 0, max: 2200 },
    soils: ["red-laterite", "loam", "sandy-loam"],
    duration: 110,
    sowMonths: [6, 7, 9, 10],
    frost: 3,
    notes: "Grows where rice peters out — acidic, shallow, hill slopes.",
    how: {
      sow: "Line sow 3 cm deep after a pre-sowing rain; transplant 4-week seedlings in heavy soils.",
      spacing: "30x10 cm (broadcasting still common); 10 kg/ha.",
      irrigation: "3-4 irrigations in light soils; completely rainfed where the red soil holds dew.",
      fert: "40:40:20 NPK kg/ha; FYM 5 t/ha lifts the acidity that limits it.",
      care: "Blast in prolonged humidity; seed-dressing prevents it.",
      harvest: "When the top earheads turn brown and seed threshes clean.",
    },
  },
  // ── pulses ──
  {
    id: "chickpea",
    name: "Chickpea (Chana)",
    emoji: "🫛",
    category: "Pulse",
    seasons: ["Rabi"],
    temp: { min: 5, max: 35, optMin: 14, optMax: 26 },
    rainfall: { min: 250, max: 600 },
    humidity: { min: 25, max: 65 },
    waterNeed: "low",
    altitude: { min: 0, max: 2200 },
    soils: ["black", "loam", "clay-loam", "sandy-loam"],
    duration: 110,
    sowMonths: [10, 11],
    frost: -2,
    notes: "Sown late rabi so flowering escapes winter fog — humidity at flowering brings blight.",
    how: {
      sow: "Line sow 5 cm deep; treat seed with Rhizobium culture.",
      spacing: "30-45 x 10 cm; 60-80 kg/ha.",
      irrigation: "Pre-sowing plus 1-2 at flowering and pod-fill; rainfed where winter rains deliver.",
      fert: "20:40:20 NPK kg/ha — pulses fix their own nitrogen; extra N stunts nodules.",
      care: "Wilt and root rot in waterlogged tall soils; pod borer and cutworm.",
      harvest: "When pods turn straw-colour and seed rattles — avoid delaying, pods shatter.",
    },
  },
  {
    id: "pigeon-pea",
    name: "Pigeon Pea (Tur/Arhar)",
    emoji: "🫛",
    category: "Pulse",
    seasons: ["Kharif"],
    temp: { min: 15, max: 40, optMin: 22, optMax: 35 },
    rainfall: { min: 400, max: 1000 },
    humidity: { min: 30, max: 80 },
    waterNeed: "low",
    altitude: { min: 0, max: 2000 },
    soils: ["black", "loam", "red-laterite", "sandy-loam"],
    duration: 200,
    sowMonths: [6, 7],
    frost: 2,
    notes: "Long duration or early-maturing depending on region; deep roots scavenge subsoil water.",
    how: {
      sow: "Dibble 5 cm deep after the monsoon is firmly set; often intercropped with soybean.",
      spacing: "60x20 cm; 25 kg/ha.",
      irrigation: "Rainfed; one irrigation at flowering rescues long-duration types.",
      fert: "20:40:20 NPK kg/ha with FYM; sulphur dressing helps oilseed-type black soils.",
      care: "Pod fly and pod borer; wilt in continuous cropping — rotate with cereals.",
      harvest: "Pick/dry down when 70% pods turn purple-brown.",
    },
  },
  {
    id: "green-gram",
    name: "Green Gram (Moong)",
    emoji: "🫛",
    category: "Pulse",
    seasons: ["Kharif", "Zaid"],
    temp: { min: 15, max: 45, optMin: 25, optMax: 38 },
    rainfall: { min: 300, max: 700 },
    humidity: { min: 30, max: 80 },
    waterNeed: "low",
    altitude: { min: 0, max: 1800 },
    soils: ["loam", "sandy-loam", "black"],
    duration: 65,
    sowMonths: [6, 7, 2, 3, 4],
    frost: 2,
    notes: "A 60-70 day gap-filler: rice-fallow zaid crop or summer catch after wheat.",
    how: {
      sow: "Broadcast/line sow after final field prep 3 cm deep; keep soil moist for uniform germination.",
      spacing: "30x10 cm; 20 kg/ha.",
      irrigation: "Pre-sowing is usually enough in kharif; zaid sowings need one extra at pod-fill.",
      fert: "20:40:20 NPK kg/ha; Rhizobium seed treatment is mandatory.",
      care: "Yellow mosaic virus (whitefly-borne) — sow at the start of the season and control whitefly.",
      harvest: "2-3 pickings for green types; cut whole crop when 80% pods blacken (dry grain types).",
    },
  },
  {
    id: "black-gram",
    name: "Black Gram (Urad)",
    emoji: "🫛",
    category: "Pulse",
    seasons: ["Kharif", "Rabi"],
    temp: { min: 18, max: 45, optMin: 25, optMax: 37 },
    rainfall: { min: 350, max: 800 },
    humidity: { min: 35, max: 85 },
    waterNeed: "low",
    altitude: { min: 0, max: 1800 },
    soils: ["loam", "clay-loam", "black"],
    duration: 80,
    sowMonths: [6, 7, 9, 10],
    frost: 3,
    notes: "Alternating with rice in rice-fallows — the standard rice-urad rotation.",
    how: {
      sow: "Line sow after the kharif rice harvest; stand-in water kills it, so ensure drainage.",
      spacing: "30x10 cm; 20 kg/ha.",
      irrigation: "Pre-sowing only in rabi; summer sowings need 2 light runs.",
      fert: "20:40:20 NPK kg/ha; gypsum corrects sulphur deficiency in light soils.",
      care: "Powdery mildew in prolonged cloud, cercospora leaf spot; sticky-leaf aphids.",
      harvest: "When 80% of pods are dry-black and the top pods crisp.",
    },
  },
  {
    id: "lentil",
    name: "Lentil (Masur)",
    emoji: "🫛",
    category: "Pulse",
    seasons: ["Rabi"],
    temp: { min: 3, max: 32, optMin: 15, optMax: 25 },
    rainfall: { min: 250, max: 480 },
    humidity: { min: 25, max: 65 },
    waterNeed: "low",
    altitude: { min: 0, max: 2400 },
    soils: ["loam", "sandy-loam", "alluvial"],
    duration: 110,
    sowMonths: [10, 11],
    frost: -3,
    notes: "The hardiest rabi pulse — survives light frost, fails in humid heat.",
    how: {
      sow: "Line sow 3-4 cm deep in October; seed coat treated against rust-carrying pathogens.",
      spacing: "30x10 cm; 40 kg/ha.",
      irrigation: "Pre-sowing; one irrigation at flowering if the winter dries out.",
      fert: "20:40:20 NPK kg/ha.",
      care: "Rust and wilt in damp fields; pod borer. Reserve-wheat-fallow fields suit it.",
      harvest: "When pods turn yellow-brown; it shatters fast.",
    },
  },
  // ── oilseeds ──
  {
    id: "groundnut",
    name: "Groundnut (Peanut)",
    emoji: "🥜",
    category: "Oilseed",
    seasons: ["Kharif", "Summer"],
    temp: { min: 18, max: 38, optMin: 22, optMax: 32 },
    rainfall: { min: 400, max: 1000 },
    humidity: { min: 30, max: 80 },
    waterNeed: "medium",
    altitude: { min: 0, max: 1400 },
    soils: ["sandy-loam", "sandy", "loam", "red-laterite"],
    duration: 120,
    sowMonths: [6, 7, 1, 2],
    frost: 3,
    notes: "Fruit set happens underground — friable, stone-free sandy-loam is non-negotiable.",
    how: {
      sow: "Dibble 5-6 cm deep; keep pods unrotten by sowing on ridges in heavier soils.",
      spacing: "30x15 cm; 100-120 kg/ha.",
      irrigation: "Pegging, flowering and pod-fill are critical — light, even wetting; avoid drought at pegging.",
      fert: "20:40:40 NPK kg/ha + gypsum 400 kg/ha at pegging boosts pod calcium directly.",
      care: "Tikka disease (early/late leaf spots) — rotate with cereals; white grub and aphid.",
      harvest: "When leaves yellow and the inner pod wall darkens; cure in shade 2-3 days.",
    },
  },
  {
    id: "mustard",
    name: "Mustard (Sarson)",
    emoji: "🌼",
    category: "Oilseed",
    seasons: ["Rabi"],
    temp: { min: 5, max: 35, optMin: 14, optMax: 25 },
    rainfall: { min: 250, max: 500 },
    humidity: { min: 25, max: 70 },
    waterNeed: "low",
    altitude: { min: 0, max: 2400 },
    soils: ["loam", "sandy-loam", "alluvial"],
    duration: 100,
    sowMonths: [10, 11],
    frost: -4,
    notes: "Thrives on cool, dry weather — humid warm spells bring aphids and seed shrivel.",
    how: {
      sow: "Line sow 3 cm deep in October after one pre-sowing irrigation.",
      spacing: "30x10 cm (or 45x20 paired row); 5-6 kg/ha.",
      irrigation: "Pre-sowing + one at flowering; no irrigation at siliqua-fill.",
      fert: "80:40:40 NPK kg/ha with sulphur 20-40 kg/ha — mustard is sulphur-hungry.",
      care: "Aphids (sawfly too) at flowering; white rust in damp pockets.",
      harvest: "At siliqua browning (seeds dark), before they dehisce.",
    },
  },
  {
    id: "soybean",
    name: "Soybean",
    emoji: "🌱",
    category: "Oilseed",
    seasons: ["Kharif"],
    temp: { min: 15, max: 38, optMin: 20, optMax: 32 },
    rainfall: { min: 400, max: 900 },
    humidity: { min: 35, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2000 },
    soils: ["loam", "clay-loam", "alluvial", "sandy-loam"],
    duration: 100,
    sowMonths: [6, 7],
    frost: 0,
    notes: "Photoperiod-sensitive: sowing late compresses node number and yield.",
    how: {
      sow: "Line sow 4 cm deep at monsoon onset; Vermiculite-Rhizobium on seed.",
      spacing: "45x5 cm; 70-80 kg/ha.",
      irrigation: "Rainfed normally; protective irrigation at flowering and pod-fill.",
      fert: "20:60:40 NPK kg/ha; molybdenum seed treatment in acidic soils.",
      care: "Girdle beetle, defoliators (pests compound in drought); yellow mosaic.",
      harvest: "When 95% pods turn brown and seed rattles at 13-14% moisture.",
    },
  },
  {
    id: "sunflower",
    name: "Sunflower",
    emoji: "🌻",
    category: "Oilseed",
    seasons: ["Kharif", "Rabi", "Zaid"],
    temp: { min: 10, max: 42, optMin: 18, optMax: 33 },
    rainfall: { min: 300, max: 750 },
    humidity: { min: 25, max: 75 },
    waterNeed: "low",
    altitude: { min: 0, max: 2000 },
    soils: ["loam", "clay-loam", "sandy-loam", "red-laterite"],
    duration: 100,
    sowMonths: [6, 7, 1, 2],
    frost: 0,
    notes: "Deep-tapped and tolerant of short dry spells; heads track the sun if young.",
    how: {
      sow: "Dibble 4 cm deep; align rows north-south to maximise light.",
      spacing: "60x30 cm; 6-7 kg/ha.",
      irrigation: "At bud initiation, flowering and seed-fill — sunflower is drought-tolerant, not yield-immune.",
      fert: "60:40:40 NPK kg/ha; boron 0.2% spray boosts seed set under drought.",
      care: "Alternaria and rust in humid spells; capitulum borer; bird netting when seeds fill.",
      harvest: "Back of the head yellows, seed moisture ~20% — dry to 9% before storage.",
    },
  },
  // ── cash crops ──
  {
    id: "cotton",
    name: "Cotton",
    emoji: "🧵",
    category: "Cash crop",
    seasons: ["Kharif"],
    temp: { min: 15, max: 45, optMin: 24, optMax: 36 },
    rainfall: { min: 350, max: 900 },
    humidity: { min: 30, max: 75 },
    waterNeed: "medium",
    altitude: { min: 0, max: 1400 },
    soils: ["black", "alluvial", "loam", "sandy-loam"],
    duration: 180,
    sowMonths: [4, 5, 6, 7],
    tropicalOnly: true,
    frost: 3,
    notes: "Needs a well-judged finish: cloudy harvest weather rots open bolls.",
    how: {
      sow: "Sow at 3-5 cm depth when soil at 10 cm crosses 18°C early in summer.",
      spacing: "90-120x45-60 cm; 2.5-3.5 kg/ha.",
      irrigation: "Flowering and boll-set are decisive; stop irrigation once bolls open.",
      fert: "100:50:50 NPK kg/ha + MgSO4 for red soils; potash important for boll development.",
      care: "Pink bollworm is the long-season problem — Bt varieties and pheromone traps; whitefly spreads leaf curl virus.",
      harvest: "Pick opened bolls at 5-7 day cycles from first open to plant collapse.",
    },
  },
  {
    id: "sugarcane",
    name: "Sugarcane",
    emoji: "🎋",
    category: "Cash crop",
    seasons: ["Plant", "Ratoon"],
    temp: { min: 13, max: 42, optMin: 25, optMax: 35 },
    rainfall: { min: 700, max: 1500 },
    humidity: { min: 40, max: 85 },
    waterNeed: "high",
    altitude: { min: 0, max: 1200 },
    soils: ["loam", "clay-loam", "alluvial"],
    duration: 360,
    sowMonths: [10, 11, 1, 2, 3],
    tropicalOnly: true,
    frost: 0,
    notes: "Year-long cropping; long ratoon cycles allow recovery if the first year runs dry.",
    how: {
      sow: "Plant 3-budded setts 10-15 cm deep in furrows; treat against GSD/grassy shoot pathogens.",
      spacing: "90 cm paired rows; 40k three-bud setts/ha.",
      irrigation: "Highest water need of the common crops: sprouting, tillering and grand growth; final drying-off 3 weeks before harvest.",
      fert: "250:85:130 NPK kg/ha across 3 split dressings; press-mud compost raises sugar recovery.",
      care: "Early shoot borer, termites, woolly aphid; smut on infected setts.",
      harvest: "At 12-14 months when brix peaks — tops brown, juice sweet.",
    },
  },
  // ── vegetables ──
  {
    id: "tomato",
    name: "Tomato",
    emoji: "🍅",
    category: "Vegetable",
    seasons: ["Rabi", "Kharif"],
    temp: { min: 8, max: 38, optMin: 18, optMax: 30 },
    rainfall: { min: 300, max: 700 },
    humidity: { min: 30, max: 75 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2200 },
    soils: ["sandy-loam", "loam", "red-laterite"],
    duration: 110,
    sowMonths: [10, 11, 6, 7],
    sowMonthsTemperate: [5, 6],
    frost: 1,
    notes: "Blossom drop above 35°C and below 10°C; staking pays for itself.",
    how: {
      sow: "Raise seedlings 4-6 weeks old in a nursery; transplant at 4-5 leaf stage during the evening.",
      spacing: "60x45 cm with staking (or 45x30 dwarf hybrids); drip under mulch.",
      irrigation: "Drip alternate-day at 0.8-1.0 L/plant/day equivalent; irregular watering cracks fruit.",
      fert: "100:60:60 NPK kg/ha plus calcium sprays against blossom-end rot.",
      care: "Fruit borer, whitefly, leaf miner; early/late blight in humid spells (copper sprays).",
      harvest: "Pick at breaker stage for transport; colour-up on the plant for local sale.",
    },
  },
  {
    id: "onion",
    name: "Onion",
    emoji: "🧅",
    category: "Vegetable",
    seasons: ["Rabi", "Kharif"],
    temp: { min: 8, max: 36, optMin: 14, optMax: 28 },
    rainfall: { min: 300, max: 550 },
    humidity: { min: 30, max: 70 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2200 },
    soils: ["sandy-loam", "loam", "alluvial"],
    duration: 130,
    sowMonths: [10, 11, 5, 6],
    sowMonthsTemperate: [3, 4, 5],
    frost: 0,
    notes: "Bulbing triggered by day length; stop irrigation at neck-fall before lifting.",
    how: {
      sow: "Nursery 6-8 weeks; transplant 15 cm seedlings at 4-5 leaf stage.",
      spacing: "15x10 cm; 8-10 kg/ha seed.",
      irrigation: "Light, frequent until neck-fall, then stop 10-12 days before harvest.",
      fert: "100:50:50 NPK kg/ha with sulphur; avoid excess N — thick necks and poor keeping.",
      care: "Thrips is the destructive one from purple blotch periods; stemphylium blight in wet weather.",
      harvest: "When 50% tops fall naturally; cure 3-5 days in field, then dry shade for storage.",
    },
  },
  {
    id: "potato",
    name: "Potato",
    emoji: "🥔",
    category: "Vegetable",
    seasons: ["Rabi"],
    temp: { min: 7, max: 30, optMin: 15, optMax: 23 },
    rainfall: { min: 300, max: 600 },
    humidity: { min: 40, max: 80 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2600 },
    soils: ["sandy-loam", "loam", "alluvial"],
    duration: 90,
    sowMonths: [10, 11, 2, 3],
    sowMonthsTemperate: [3, 4, 5],
    frost: 0,
    notes: "Tuberisation below 20°C; heat above 25°C stops it dead — hills sow a month later.",
    how: {
      sow: "Whole/tuber-cut seed 45-60 g at 8-10 cm depth into well-decomposed FYM-enriched ridges.",
      spacing: "60x20 cm; 2.5-3 t/ha seed.",
      irrigation: "Every 6-8 days in the plains, 10-12 in hills — keep soil even, moisture gaps create knobs/heat stress.",
      fert: "120:80:100 NPK kg/ha + FYM; adequate potassium bulks the tubers.",
      care: "Late blight (weather-driven: humid 15-20°C spells) — preventive mancozeb; aphids for virus control.",
      harvest: "Skin sets firmly and haulms yellow — lift, don't wash, cure in dark for 3-4 days.",
    },
  },
  {
    id: "brinjal",
    name: "Brinjal (Eggplant)",
    emoji: "🍆",
    category: "Vegetable",
    seasons: ["Kharif", "Rabi", "Zaid"],
    temp: { min: 15, max: 40, optMin: 20, optMax: 33 },
    rainfall: { min: 350, max: 800 },
    humidity: { min: 35, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2000 },
    soils: ["loam", "clay-loam", "sandy-loam", "alluvial"],
    duration: 130,
    sowMonths: [6, 7, 2, 3, 4],
    sowMonthsTemperate: [5, 6],
    frost: 3,
    notes: "Warm-season vegetable; stands heat better than tomato.",
    how: {
      sow: "Nursery 5-6 weeks, transplant 5-leaf seedlings at dusk.",
      spacing: "60x60 cm; hybrid types 60x45 cm.",
      irrigation: "Drip 2x weekly; mulching halves water use and suppresses weeds.",
      fert: "100:60:60 NPK kg/ha + boron 0.2% at flowering.",
      care: "Shoot and fruit borer (Borers) — pheromone traps + Bt; wilts on wet poorly drained beds.",
      harvest: "At glossy stage while seeds still pale — delay turns them fibrous.",
    },
  },
  {
    id: "okra",
    name: "Okra (Bhindi)",
    emoji: "🌶️",
    category: "Vegetable",
    seasons: ["Kharif", "Zaid"],
    temp: { min: 15, max: 45, optMin: 22, optMax: 36 },
    rainfall: { min: 350, max: 900 },
    humidity: { min: 30, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 1800 },
    soils: ["loam", "sandy-loam", "alluvial"],
    duration: 70,
    sowMonths: [6, 7, 2, 3, 4],
    sowMonthsTemperate: [5, 6],
    frost: 3,
    notes: "Fruit stalls if night temps drop below 20°C; pick every 2nd day.",
    how: {
      sow: "Direct dibble 3 cm deep, pre-soak seeds 12h for uniform germination.",
      spacing: "45x20 cm (dwarf) to 60x30 cm (tall); 12-15 kg/ha.",
      irrigation: "At flowering and pod-set the plant can't tolerate wilting.",
      fert: "100:50:50 NPK kg/ha; FYM base 10 t/ha.",
      care: "Yellow vein mosaic (whitefly), powdery mildew; jassids at squaring.",
      harvest: "Pick at finger length every 2 days — over-mature pods finish the plant.",
    },
  },
  {
    id: "chilli",
    name: "Chilli",
    emoji: "🌶️",
    category: "Vegetable",
    seasons: ["Kharif", "Rabi"],
    temp: { min: 15, max: 38, optMin: 20, optMax: 32 },
    rainfall: { min: 400, max: 900 },
    humidity: { min: 35, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2200 },
    soils: ["loam", "clay-loam", "alluvial", "red-laterite"],
    duration: 140,
    sowMonths: [6, 7, 9, 10],
    sowMonthsTemperate: [5, 6],
    frost: 2,
    notes: "Fruit set drops above 38°C; light shade improves color for the dry-recipe trade type.",
    how: {
      sow: "Nursery 6 weeks, transplant 6-8 leaf seedlings; mulch after rain.",
      spacing: "60x45 cm; 1-1.5 kg/ha.",
      irrigation: "At 5-7 day intervals; even moisture fights blossom drop.",
      fert: "100:50:50 NPK kg/ha; magnesium sulphate against tip dieback.",
      care: "Thrips + mites couple into leaf-curl complex; powdery mildew in dry, cool end of season.",
      harvest: "Wet pick at green stage for fresh trade; dry red for the market.",
    },
  },
  // ── fruits & plantations ──
  {
    id: "mango",
    name: "Mango",
    emoji: "🥭",
    category: "Fruit",
    seasons: ["Perennial"],
    temp: { min: 8, max: 46, optMin: 24, optMax: 36 },
    rainfall: { min: 300, max: 1300 },
    humidity: { min: 25, max: 80 },
    waterNeed: "low",
    altitude: { min: 0, max: 1200 },
    soils: ["alluvial", "loam", "red-laterite"],
    duration: 90,
    sowMonths: [6, 7, 8],
    tropicalOnly: true,
    frost: 0,
    notes: "The dry, warm month before rain is what makes flowering — humid wet weather kills the bloom.",
    how: {
      sow: "Grafted plants 6-12 months old in pits (60cm cube) at monsoon onset; 7-9 m spacing for seedling/standard.",
      spacing: "7x7 to 10x10 m high-density cultivars; intercropping with pulses until year 5.",
      irrigation: "Irrigate heavily only in first 3 years and at fruit-development in high-density blocks.",
      fert: "FYM 50-100 kg per tree, NPK 500:250:250 g/tree at 5+ years.",
      care: "Mango hopper at flowering, mealybug on young trees; afternoon-protection against fruit sunburn.",
      harvest: "Pick at mature-green for transport; ripens in 5-8 days at room temp.",
    },
  },
  {
    id: "banana",
    name: "Banana",
    emoji: "🍌",
    category: "Fruit",
    seasons: ["Perennial"],
    temp: { min: 12, max: 42, optMin: 24, optMax: 34 },
    rainfall: { min: 800, max: 2200 },
    humidity: { min: 50, max: 90 },
    waterNeed: "high",
    altitude: { min: 0, max: 1500 },
    soils: ["loam", "clay-loam", "alluvial"],
    duration: 300,
    sowMonths: [5, 6, 7, 8],
    tropicalOnly: true,
    frost: 5,
    notes: "One of the thirstiest crops grown: it needs regulated water all year.",
    how: {
      sow: "Corm suckers/tissue-cultured plants at 1.8x1.8 m in deep pits; mulch immediately.",
      spacing: "1.8x1.8 m; 2 suckers per pit.",
      irrigation: "Drip at 15-20 L/plant/day equivalent; cold winds shred the leaves.",
      fert: "FYM 20 kg + NPK 150:150:300 g/plant at 3 months; split applications at 45-day intervals.",
      care: "Panama wilt and bunchy-top virus — plant clean material; bunch covers against thrips rustfleck.",
      harvest: "Cut at 75-80% maturity — bunches ripen in 5-7 days after ethylene.",
    },
  },
  {
    id: "papaya",
    name: "Papaya",
    emoji: "🧡",
    category: "Fruit",
    seasons: ["Perennial"],
    temp: { min: 12, max: 44, optMin: 22, optMax: 34 },
    rainfall: { min: 600, max: 1600 },
    humidity: { min: 40, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 1500 },
    soils: ["sandy-loam", "loam", "alluvial"],
    duration: 120,
    sowMonths: [6, 7, 8, 2],
    tropicalOnly: true,
    frost: 2,
    notes: "Starts fruiting in 8-10 months; waterlogging kills roots fast.",
    how: {
      sow: "Direct seed or sexed seedlings in 60cm pits, 2.5x2.5 m grid; female only for commercial yield.",
      spacing: "2.5x2.5 m; 0.5 m extra for hermaphrodite rows.",
      irrigation: "Drip weekly-or-fortnightly deep; mulch with straw to hold moisture.",
      fert: "FYM 15 kg + NPK 250:250:500 g/tree annually after year 1.",
      care: "Papaya ringspot virus (aphid-borne) — remove infected plants; mites and powdery mildew in dry heat.",
      harvest: "When latex turns watery and stripes show on the skin; store at 10-13°C.",
    },
  },
  {
    id: "guava",
    name: "Guava",
    emoji: "🍐",
    category: "Fruit",
    seasons: ["Perennial"],
    temp: { min: 10, max: 44, optMin: 20, optMax: 34 },
    rainfall: { min: 400, max: 1800 },
    humidity: { min: 25, max: 80 },
    waterNeed: "low",
    altitude: { min: 0, max: 1800 },
    soils: ["loam", "sandy-loam", "red-laterite", "alluvial"],
    duration: 150,
    sowMonths: [6, 7, 8],
    tropicalOnly: true,
    frost: -1,
    notes: "Drought-hardy once established; tolerates salinity better than most fruits.",
    how: {
      sow: "Layered/air-layered plants 5x5 m in pits filled with 20 kg FYM.",
      spacing: "5x5 m; high-density 4x4 m with pruning.",
      irrigation: "Fortnightly first 3 years; rainfed orchards survive on deep winter water.",
      fert: "NPK 350:250:350 g/tree/year from year 4 onwards.",
      care: "Fruit fly and bark-eating caterpillar; anthracnose at ripening under humid rain.",
      harvest: "At mature-green when fruit reaches full size; ripens off-tree at 25°C.",
    },
  },
  {
    id: "watermelon",
    name: "Watermelon",
    emoji: "🍉",
    category: "Fruit",
    seasons: ["Zaid", "Summer"],
    temp: { min: 15, max: 45, optMin: 20, optMax: 35 },
    rainfall: { min: 250, max: 550 },
    humidity: { min: 25, max: 70 },
    waterNeed: "medium",
    altitude: { min: 0, max: 1200 },
    soils: ["sandy-loam", "sandy"],
    duration: 85,
    sowMonths: [1, 2, 3],
    sowMonthsTemperate: [5, 6],
    frost: 1,
    notes: "Zaid crop: needs heat and a dry tail so sugars concentrate.",
    how: {
      sow: "Direct sow on ridges/beds 2 cm deep in late winter; mulch black or silver film.",
      spacing: "2x1 m beds, 2 plants per spot.",
      irrigation: "Drip or furrow; keep steady at fruit-set — swings crack melons.",
      fert: "60:40:40 NPK kg/ha; potash-heavy feeds sugar content.",
      care: "Powdery mildew in switchy weather; fruit fly at ripening — bag the fruit on small patches.",
      harvest: "When the tendril beside the stem dries and the ground-spot yellows.",
    },
  },
  // ── global temperate vegetables, fruits & grains ──
  {
    id: "cabbage",
    name: "Cabbage",
    emoji: "🥬",
    category: "Vegetable",
    seasons: ["Rabi", "Spring", "Autumn"],
    temp: { min: 4, max: 26, optMin: 12, optMax: 20 },
    rainfall: { min: 350, max: 700 },
    humidity: { min: 50, max: 90 },
    waterNeed: "medium",
    altitude: { min: 0, max: 3000 },
    soils: ["loam", "clay-loam", "alluvial", "sandy-loam"],
    duration: 80,
    sowMonths: [9, 10, 11],
    sowMonthsTemperate: [3, 4, 7, 8],
    frost: -3,
    coldHardy: true,
    notes: "Cold-tolerant brassica; heading requires cool nights below 18°C.",
    how: {
      sow: "Nursery raise seedlings 4-5 weeks; transplant into firm moist beds.",
      spacing: "45x45 cm; 300-400 g seed/ha.",
      irrigation: "Regular light watering; moisture stress causes splitting.",
      fert: "120:60:60 NPK kg/ha + compost; boron against hollow stem.",
      care: "Diamondback moth, cabbage looper; aphid sprays at heading.",
      harvest: "Cut when heads are firm and solid before cracking.",
    },
  },
  {
    id: "carrot",
    name: "Carrot",
    emoji: "🥕",
    category: "Vegetable",
    seasons: ["Rabi", "Spring", "Autumn"],
    temp: { min: 7, max: 26, optMin: 14, optMax: 21 },
    rainfall: { min: 300, max: 600 },
    humidity: { min: 40, max: 80 },
    waterNeed: "medium",
    altitude: { min: 0, max: 3000 },
    soils: ["sandy-loam", "loam", "alluvial"],
    duration: 75,
    sowMonths: [9, 10, 11],
    sowMonthsTemperate: [3, 4, 5, 7],
    frost: -2,
    coldHardy: true,
    notes: "Deep root requires loose, stone-free friable soil to prevent forking.",
    how: {
      sow: "Direct line sow 1-1.5 cm deep into finely worked beds.",
      spacing: "30x8 cm thin seedlings at 3-leaf stage.",
      irrigation: "Even, frequent light watering to maintain germination.",
      fert: "60:60:80 NPK kg/ha; avoid fresh unrotted manure.",
      care: "Carrot rust fly, leaf blight; weed early as seedlings grow slowly.",
      harvest: "Pull when root shoulders reach ~2.5-3 cm diameter.",
    },
  },
  {
    id: "spinach",
    name: "Spinach",
    emoji: "🍃",
    category: "Vegetable",
    seasons: ["Rabi", "Spring", "Autumn"],
    temp: { min: 3, max: 24, optMin: 10, optMax: 18 },
    rainfall: { min: 250, max: 500 },
    humidity: { min: 40, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 3200 },
    soils: ["loam", "sandy-loam", "alluvial", "clay-loam"],
    duration: 45,
    sowMonths: [9, 10, 11, 12],
    sowMonthsTemperate: [3, 4, 8, 9, 10],
    frost: -6,
    coldHardy: true,
    notes: "Extremely frost-hardy leafy green; bolts quickly to seed in hot weather (>25°C).",
    how: {
      sow: "Direct broadcast or line sow 1 cm deep in rich, organic-amended soil.",
      spacing: "20x10 cm; 25-30 kg/ha seed.",
      irrigation: "Frequent light sprinkler/can watering; keep surface moist.",
      fert: "80:40:40 NPK kg/ha; topdress nitrogen after each cut.",
      care: "Leaf miner, downy mildew in dense stands; pick outer leaves continuously.",
      harvest: "Cut 4-5 cm above ground after 35-45 days; regrows 2-3 times.",
    },
  },
  {
    id: "peas",
    name: "Green Peas",
    emoji: "🫛",
    category: "Pulse",
    seasons: ["Rabi", "Spring"],
    temp: { min: 5, max: 24, optMin: 12, optMax: 18 },
    rainfall: { min: 300, max: 550 },
    humidity: { min: 40, max: 75 },
    waterNeed: "low",
    altitude: { min: 0, max: 3200 },
    soils: ["loam", "sandy-loam", "alluvial"],
    duration: 70,
    sowMonths: [10, 11],
    sowMonthsTemperate: [3, 4, 5],
    frost: -3,
    coldHardy: true,
    notes: "Cool-season legume fixes atmospheric nitrogen; heat during flowering causes pod drop.",
    how: {
      sow: "Direct sow 3-4 cm deep into pre-irrigated seedbed.",
      spacing: "30x10 cm; 70-80 kg/ha seed.",
      irrigation: "Critical at flowering and pod-fill; avoid waterlogging.",
      fert: "20:60:40 NPK kg/ha; rhizobium inoculant lifts nodulation.",
      care: "Powdery mildew in dry late season; pea pod borer.",
      harvest: "Pick pods when swollen and sweet before skins turn starchy.",
    },
  },
  {
    id: "garlic",
    name: "Garlic",
    emoji: "🧄",
    category: "Vegetable",
    seasons: ["Rabi", "Autumn"],
    temp: { min: 3, max: 28, optMin: 12, optMax: 20 },
    rainfall: { min: 250, max: 500 },
    humidity: { min: 30, max: 70 },
    waterNeed: "low",
    altitude: { min: 0, max: 2800 },
    soils: ["sandy-loam", "loam", "alluvial"],
    duration: 150,
    sowMonths: [10, 11],
    sowMonthsTemperate: [9, 10, 11],
    frost: -12,
    coldHardy: true,
    overwintering: true,
    notes: "Requires cold winter vernalisation to trigger clove division and bulb swelling.",
    how: {
      sow: "Separate cloves and plant upright 3-4 cm deep; mulch heavily in cold zones.",
      spacing: "15x10 cm; 500-600 kg/ha cloves.",
      irrigation: "Weekly during green growth; stop completely 2 weeks before harvest.",
      fert: "100:50:50 NPK kg/ha + sulphur for pungent allicin oil.",
      care: "Thrips, white rot; rogue diseased plants promptly.",
      harvest: "Lift when lower 3-4 leaves yellow and die back; cure in dry shade.",
    },
  },
  {
    id: "lettuce",
    name: "Lettuce",
    emoji: "🥗",
    category: "Vegetable",
    seasons: ["Rabi", "Spring", "Autumn"],
    temp: { min: 5, max: 25, optMin: 12, optMax: 19 },
    rainfall: { min: 200, max: 450 },
    humidity: { min: 45, max: 80 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2500 },
    soils: ["sandy-loam", "loam", "alluvial"],
    duration: 50,
    sowMonths: [10, 11, 12],
    sowMonthsTemperate: [3, 4, 5, 8, 9],
    frost: -2,
    coldHardy: true,
    notes: "Fast-growing tender salad crop; bitter taste and bolting trigger above 24°C.",
    how: {
      sow: "Shallow direct sow 0.5 cm deep; light aids seed germination.",
      spacing: "25x25 cm for heading types; 20x15 cm for loose-leaf.",
      irrigation: "Daily or alternate-day light watering; shallow root system dries fast.",
      fert: "60:40:40 NPK kg/ha + organic compost.",
      care: "Slugs, aphids; downy mildew on wet lower leaves.",
      harvest: "Cut whole heads or harvest outer loose leaves progressively.",
    },
  },
  {
    id: "apple",
    name: "Apple",
    emoji: "🍎",
    category: "Fruit",
    seasons: ["Perennial"],
    temp: { min: -5, max: 30, optMin: 14, optMax: 24 },
    rainfall: { min: 600, max: 1100 },
    humidity: { min: 45, max: 75 },
    waterNeed: "medium",
    altitude: { min: 600, max: 3000 },
    soils: ["loam", "sandy-loam", "alluvial", "clay-loam"],
    duration: 150,
    sowMonths: [1, 2, 12],
    sowMonthsTemperate: [2, 3, 4, 11, 12],
    frost: -20,
    coldHardy: true,
    notes: "Temperate deciduous fruit; requires 800-1200 chill hours below 7°C to break dormancy.",
    how: {
      sow: "Plant bare-root or potted grafted saplings during winter dormancy.",
      spacing: "4x4 m standard or 2.5x1.2 m high-density trellised rows.",
      irrigation: "Drip irrigation through flowering to fruit sizing; stop before harvest.",
      fert: "Annual winter organic manure + balanced 70:35:70 NPK g/tree/year.",
      care: "Apple scab, codling moth, powdery mildew; winter pruning shapes open canopy.",
      harvest: "Pick when ground color turns yellow/red and seeds inside turn dark brown.",
    },
  },
  {
    id: "strawberry",
    name: "Strawberry",
    emoji: "🍓",
    category: "Fruit",
    seasons: ["Rabi", "Spring"],
    temp: { min: 6, max: 28, optMin: 15, optMax: 24 },
    rainfall: { min: 300, max: 650 },
    humidity: { min: 45, max: 75 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2600 },
    soils: ["sandy-loam", "loam"],
    duration: 85,
    sowMonths: [9, 10],
    sowMonthsTemperate: [3, 4, 5, 8],
    frost: -3,
    coldHardy: true,
    notes: "Shallow-rooted berry thrives on raised plastic-mulched beds with drip.",
    how: {
      sow: "Plant certified runner crowns with crown level with soil surface.",
      spacing: "30x30 cm on raised beds (40 cm high).",
      irrigation: "Drip irrigation daily; keep foliage and berries dry to prevent rot.",
      fert: "80:50:100 NPK kg/ha; high potassium enhances brix sweetness.",
      care: "Botrytis grey mold, two-spotted spider mites; straw mulch keeps berries clean.",
      harvest: "Pick fully colored ripe fruit every 2-3 days gently with calyx attached.",
    },
  },
  {
    id: "grape",
    name: "Grape",
    emoji: "🍇",
    category: "Fruit",
    seasons: ["Perennial"],
    temp: { min: 10, max: 38, optMin: 18, optMax: 30 },
    rainfall: { min: 350, max: 800 },
    humidity: { min: 30, max: 65 },
    waterNeed: "low",
    altitude: { min: 0, max: 1800 },
    soils: ["sandy-loam", "loam", "alluvial", "black"],
    duration: 140,
    sowMonths: [1, 2, 10],
    sowMonthsTemperate: [3, 4],
    frost: -6,
    notes: "Deep root system; dry sunny weather during berry ripening prevents sour rot.",
    how: {
      sow: "Plant rooted cuttings or grafted rootstocks in late winter.",
      spacing: "3x1.8 m on bower or vertical trellis.",
      irrigation: "Drip irrigation; cut water back 2-3 weeks before harvest for sugar concentration.",
      fert: "500:250:500 g NPK/vine split after winter and summer pruning.",
      care: "Downy mildew in rain, powdery mildew in dry shade; thrips and mealybug.",
      harvest: "Taste test for sweet brix (18-22°); cut clusters with shears.",
    },
  },
  {
    id: "barley",
    name: "Barley",
    emoji: "🌾",
    category: "Cereal",
    seasons: ["Rabi", "Spring"],
    temp: { min: 3, max: 28, optMin: 12, optMax: 20 },
    rainfall: { min: 250, max: 550 },
    humidity: { min: 30, max: 70 },
    waterNeed: "low",
    altitude: { min: 0, max: 3500 },
    soils: ["loam", "sandy-loam", "clay-loam"],
    duration: 95,
    sowMonths: [10, 11],
    sowMonthsTemperate: [3, 4, 9, 10],
    frost: -8,
    coldHardy: true,
    notes: "Fastest-maturing and most salt/cold-tolerant cereal; thrives in high latitudes.",
    how: {
      sow: "Drill 4-5 cm deep in firm seedbed; 100 kg/ha seed rate.",
      spacing: "22.5 cm rows.",
      irrigation: "2-3 irrigations (tillering, booting); very drought hardy.",
      fert: "60:30:20 NPK kg/ha; lower N avoids lodging and lifts malt quality.",
      care: "Rust, loose smut, aphids; weed control at 3-leaf stage.",
      harvest: "Combine when grain moisture drops below 14% and heads bend.",
    },
  },

  // ── herbs & medicinal ──
  {
    id: "tulsi",
    name: "Tulsi (Holy Basil)",
    emoji: "🌿",
    category: "Herb & Medicinal",
    seasons: ["Kharif", "Perennial"],
    temp: { min: 14, max: 38, optMin: 22, optMax: 32 },
    rainfall: { min: 450, max: 1200 },
    humidity: { min: 40, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 1800 },
    soils: ["loam", "sandy-loam", "alluvial", "red-laterite"],
    duration: 90,
    sowMonths: [3, 4, 5, 6, 7],
    sowMonthsTemperate: [5, 6],
    frost: 2,
    notes: "Revered medicinal aromatic herb; rich in eugenol and antioxidants, repels garden pests.",
    how: {
      sow: "Sow seeds shallowly in fine nursery beds or take semi-hardwood cuttings; germinate in warm sunlight.",
      spacing: "45x45 cm spacing.",
      irrigation: "Regular moderate moisture; avoid soggy roots or standing water.",
      fert: "5-10 t/ha well-rotted compost or vermicompost; mild organic liquid feed monthly.",
      care: "Pinch terminal flower buds to promote bushy leaf growth; watch for aphids and leaf spot.",
      harvest: "Harvest fresh tender shoots and leaves in early morning after dew dries.",
    },
  },
  {
    id: "aloe-vera",
    name: "Aloe Vera",
    emoji: "🪴",
    category: "Herb & Medicinal",
    seasons: ["Perennial"],
    temp: { min: 8, max: 42, optMin: 20, optMax: 35 },
    rainfall: { min: 200, max: 800 },
    humidity: { min: 20, max: 70 },
    waterNeed: "low",
    altitude: { min: 0, max: 2000 },
    soils: ["sandy", "sandy-loam", "loam", "red-laterite"],
    duration: 240,
    sowMonths: [3, 4, 5, 6, 7, 8],
    sowMonthsTemperate: [5, 6],
    frost: 0,
    notes: "Resilient drought-tolerant succulent widely valued for medicinal gel, burn relief and skincare.",
    how: {
      sow: "Plant root suckers (pups) 15-20 cm long separated from mother plants into well-drained beds.",
      spacing: "60x60 cm or 60x45 cm on ridges.",
      irrigation: "Light watering every 10-14 days; highly drought resistant, root rot occurs if overwatered.",
      fert: "5 t/ha organic manure basal; responds well to light potash and wood ash.",
      care: "Keep weeded in early months; ensure beds have sharp drainage during monsoons.",
      harvest: "Cut lowest mature thick fleshy outer leaves with a sterile knife after 8-10 months.",
    },
  },
  {
    id: "mint",
    name: "Mint (Pudina)",
    emoji: "🌱",
    category: "Herb & Medicinal",
    seasons: ["Spring", "Zaid", "Perennial"],
    temp: { min: 6, max: 35, optMin: 18, optMax: 28 },
    rainfall: { min: 500, max: 1200 },
    humidity: { min: 50, max: 85 },
    waterNeed: "high",
    altitude: { min: 0, max: 2500 },
    soils: ["loam", "sandy-loam", "alluvial", "clay-loam"],
    duration: 75,
    sowMonths: [2, 3, 4, 5, 6],
    sowMonthsTemperate: [3, 4, 5, 9],
    frost: -4,
    coldHardy: true,
    notes: "Fast-spreading perennial culinary and menthol herb; loves moist organic-rich soil.",
    how: {
      sow: "Plant rooted stolons or suckers 8-10 cm long horizontally 4-5 cm deep in damp furrows.",
      spacing: "45x15 cm rows.",
      irrigation: "Frequent light irrigation every 4-6 days; cannot withstand prolonged drought stress.",
      fert: "Apply 20 t/ha FYM and 80:40:40 kg/ha NPK with nitrogen split after each cut.",
      care: "Control weeds aggressively before stolon canopy closes; monitor for mint rust.",
      harvest: "Cut stems 5 cm above ground before flowering; gives 3-4 harvests per year.",
    },
  },
  {
    id: "lavender",
    name: "Lavender",
    emoji: "🪻",
    category: "Herb & Medicinal",
    seasons: ["Spring", "Perennial"],
    temp: { min: -5, max: 32, optMin: 14, optMax: 24 },
    rainfall: { min: 300, max: 700 },
    humidity: { min: 25, max: 65 },
    waterNeed: "low",
    altitude: { min: 100, max: 2500 },
    soils: ["sandy-loam", "sandy", "loam"],
    duration: 180,
    sowMonths: [3, 4, 5, 9, 10],
    sowMonthsTemperate: [3, 4, 9, 10],
    frost: -12,
    coldHardy: true,
    overwintering: true,
    notes: "Sun-loving Mediterranean perennial herb; prized for calming aroma, essential oils and pollinators.",
    how: {
      sow: "Transplant 10-15 cm nursery rooted softwood cuttings in spring or autumn into open sunny sites.",
      spacing: "60x60 cm or 90x60 cm bushes.",
      irrigation: "Water until established; once rooted, highly drought tolerant and prefers dry soil.",
      fert: "Minimal fertilizer; excess nitrogen damages aroma quality and causes weak leggy stems.",
      care: "Prune by one-third after flowering to prevent woody centers; full sun is mandatory.",
      harvest: "Cut flower spikes just as the lowest florets on each spike begin to open.",
    },
  },

  // ── trees & agroforestry ──
  {
    id: "moringa",
    name: "Moringa (Drumstick Tree)",
    emoji: "🍃",
    category: "Tree & Agroforestry",
    seasons: ["Perennial", "Kharif"],
    temp: { min: 15, max: 42, optMin: 24, optMax: 35 },
    rainfall: { min: 350, max: 1500 },
    humidity: { min: 35, max: 80 },
    waterNeed: "low",
    altitude: { min: 0, max: 1500 },
    soils: ["sandy-loam", "loam", "alluvial", "red-laterite"],
    duration: 180,
    sowMonths: [6, 7, 8, 3, 4],
    sowMonthsTemperate: [5, 6],
    frost: 2,
    notes: "Fast-growing drought-hardy miracle tree; leaves, pods, and flowers are nutrient-dense superfoods.",
    how: {
      sow: "Direct seed 2-3 cm deep or plant 1-meter limb cuttings in warm pre-soaked pits.",
      spacing: "2.5x2.5 m for pods, or dense 30x10 cm hedges for leaf clipping.",
      irrigation: "Water seedlings regularly for 2 months; adult trees thrive under semi-arid conditions.",
      fert: "10 kg farmyard manure per tree annually; 100g NPK per tree during vegetative flush.",
      care: "Pinch main shoot at 1 m height to encourage heavy branching and lower canopy.",
      harvest: "Pick green tender pods before fiber develops; harvest leaf flushes every 45-60 days.",
    },
  },
  {
    id: "bamboo",
    name: "Bamboo",
    emoji: "🎋",
    category: "Tree & Agroforestry",
    seasons: ["Perennial"],
    temp: { min: 4, max: 40, optMin: 20, optMax: 32 },
    rainfall: { min: 600, max: 2500 },
    humidity: { min: 45, max: 90 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2500 },
    soils: ["loam", "sandy-loam", "alluvial", "clay-loam"],
    duration: 360,
    sowMonths: [6, 7, 8, 2, 3],
    sowMonthsTemperate: [4, 5],
    frost: -5,
    coldHardy: true,
    notes: "Fastest-growing woody grass; outstanding for rapid timber, soil erosion control, and carbon capture.",
    how: {
      sow: "Plant 1-2 year old rhizome offsets with culm bases into 50x50 cm pits filled with compost.",
      spacing: "5x5 m clump spacing (or 3x3 m for commercial biomass).",
      irrigation: "Copious watering during rhizome establishment and shoot emergence in spring/monsoon.",
      fert: "Apply generous organic manure and 200g urea/clump during new shoot development.",
      care: "Thin out dead and congested old culms annually; maintain clear clump periphery.",
      harvest: "Selective felling of 3-4 year old mature hardened culms during dry season.",
    },
  },
  {
    id: "neem",
    name: "Neem",
    emoji: "🌳",
    category: "Tree & Agroforestry",
    seasons: ["Perennial"],
    temp: { min: 14, max: 46, optMin: 24, optMax: 38 },
    rainfall: { min: 300, max: 1200 },
    humidity: { min: 20, max: 75 },
    waterNeed: "low",
    altitude: { min: 0, max: 1200 },
    soils: ["sandy", "sandy-loam", "loam", "black", "red-laterite"],
    duration: 360,
    sowMonths: [6, 7, 8],
    frost: 4,
    tropicalOnly: true,
    notes: "Hardy evergreen agroforestry and biopesticide tree; purifies air and provides medicinal leaves and oil.",
    how: {
      sow: "Plant fresh depulped seeds in polybags or transplant 9-month healthy seedlings.",
      spacing: "5x5 m for windbreak/shade, 8x8 m in agroforestry systems.",
      irrigation: "Water seedlings during first dry season; completely drought-tolerant once taproot deepens.",
      fert: "Compost in planting pit; minimal feeding required once roots tap into subsoil reserves.",
      care: "Protect young saplings from livestock browsing; frost kills seedlings.",
      harvest: "Collect fallen ripe fruits for neem seed oil and azadirachtin; prune foliage as needed.",
    },
  },
  {
    id: "teak",
    name: "Teak",
    emoji: "🌲",
    category: "Tree & Agroforestry",
    seasons: ["Perennial"],
    temp: { min: 15, max: 44, optMin: 24, optMax: 36 },
    rainfall: { min: 800, max: 2200 },
    humidity: { min: 40, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 1000 },
    soils: ["alluvial", "loam", "clay-loam", "black"],
    duration: 360,
    sowMonths: [6, 7],
    frost: 4,
    tropicalOnly: true,
    notes: "Premier tropical hardwood timber tree; termite and weather resistant, high economic return.",
    how: {
      sow: "Plant stump cuttings (1-2 cm root collar, 15 cm taproot) into deep porous pits at monsoon onset.",
      spacing: "2x2 m initial density, thinned at years 5 and 10 to final 4x4 m.",
      irrigation: "Irrigation in early years dramatically accelerates diameter growth.",
      fert: "NPK 100g/plant at year 1, increasing with tree girth; requires calcium-rich deep soil.",
      care: "Control defoliator caterpillar and leaf skeletonizer; weed ring around base for 3 years.",
      harvest: "Commercial rotation at 20-30 years; thinning harvests yield valuable poles.",
    },
  },

  // ── flowers & ornamentals ──
  {
    id: "marigold",
    name: "Marigold",
    emoji: "🌼",
    category: "Flower & Ornamental",
    seasons: ["Kharif", "Rabi", "Spring"],
    temp: { min: 10, max: 36, optMin: 18, optMax: 28 },
    rainfall: { min: 300, max: 800 },
    humidity: { min: 40, max: 75 },
    waterNeed: "medium",
    altitude: { min: 0, max: 2200 },
    soils: ["loam", "sandy-loam", "alluvial", "clay-loam"],
    duration: 75,
    sowMonths: [2, 3, 6, 7, 9, 10],
    sowMonthsTemperate: [3, 4, 5, 6],
    frost: 0,
    notes: "Prolific golden companion flower; roots exude nematicidal compounds protecting adjacent crops.",
    how: {
      sow: "Broadcast seeds in raised nursery beds; transplant 25-day seedlings in evening.",
      spacing: "40x40 cm for African varieties, 30x30 cm for French marigold.",
      irrigation: "Irrigate every 7-10 days; avoid water splashing onto open flowers.",
      fert: "100:50:50 kg/ha NPK with half nitrogen basal, rest top-dressed at flower bud formation.",
      care: "Pinch apical bud 3 weeks after transplanting to force multi-branched bloom.",
      harvest: "Pluck fully opened heads with intact calyx early in the morning.",
    },
  },
  {
    id: "hibiscus",
    name: "Hibiscus",
    emoji: "🌺",
    category: "Flower & Ornamental",
    seasons: ["Perennial"],
    temp: { min: 12, max: 38, optMin: 20, optMax: 32 },
    rainfall: { min: 600, max: 1600 },
    humidity: { min: 50, max: 85 },
    waterNeed: "medium",
    altitude: { min: 0, max: 1800 },
    soils: ["loam", "sandy-loam", "alluvial", "red-laterite"],
    duration: 90,
    sowMonths: [3, 4, 5, 6, 7],
    sowMonthsTemperate: [5, 6],
    frost: 1,
    notes: "Vibrant tropical flowering shrub; flowers make restorative herbal tea, hair tonics and attract pollinators.",
    how: {
      sow: "Root semi-hardwood stem cuttings in moist sand, or transplant nursery saplings into sunny pits.",
      spacing: "1.2x1.2 m garden hedge or 2x2 m standalone bush.",
      irrigation: "Even soil moisture during blooming; reduce watering slightly during cooler months.",
      fert: "Monthly organic compost and high-potassium organic fertilizer for abundant blossoms.",
      care: "Prune annually in late winter to shape bush and stimulate new flowering wood; check mealybugs.",
      harvest: "Pick fully expanded fresh blossoms daily for culinary, tea, or ornamental use.",
    },
  },

  // ── cover & forage crops ──
  {
    id: "clover",
    name: "Red Clover",
    emoji: "☘️",
    category: "Cover & Forage",
    seasons: ["Rabi", "Spring", "Perennial"],
    temp: { min: 2, max: 28, optMin: 14, optMax: 22 },
    rainfall: { min: 450, max: 1000 },
    humidity: { min: 50, max: 80 },
    waterNeed: "medium",
    altitude: { min: 0, max: 3000 },
    soils: ["loam", "clay-loam", "alluvial", "sandy-loam"],
    duration: 65,
    sowMonths: [9, 10, 11, 2, 3, 4],
    sowMonthsTemperate: [3, 4, 8, 9],
    frost: -15,
    coldHardy: true,
    overwintering: true,
    notes: "Superb nitrogen-fixing legume; rejuvenates depleted soil, feeds livestock, and shelters beneficial insects.",
    how: {
      sow: "Broadcast or drill seed 1-2 cm deep into fine, firm seedbed; inoculate with Rhizobium.",
      spacing: "15-20 cm rows (12-15 kg/ha seed rate).",
      irrigation: "Keep topsoil consistently damp during germination; moderate water once taproot is set.",
      fert: "Requires little nitrogen; apply phosphorus and potassium (0:60:40 kg/ha) to support root nodules.",
      care: "Excellent companion crop with grasses or cereals; suppresses weeds naturally.",
      harvest: "Cut at early bloom stage (60-70 days) for prime protein hay or plow under as green manure.",
    },
  },
  {
    id: "alfalfa",
    name: "Alfalfa (Lucerne)",
    emoji: "🌾",
    category: "Cover & Forage",
    seasons: ["Rabi", "Spring", "Perennial"],
    temp: { min: 0, max: 34, optMin: 16, optMax: 26 },
    rainfall: { min: 400, max: 900 },
    humidity: { min: 35, max: 75 },
    waterNeed: "medium",
    altitude: { min: 0, max: 3200 },
    soils: ["loam", "sandy-loam", "alluvial", "clay-loam"],
    duration: 70,
    sowMonths: [9, 10, 11, 3, 4],
    sowMonthsTemperate: [3, 4, 8, 9],
    frost: -18,
    coldHardy: true,
    overwintering: true,
    notes: "Queen of forages with deep taproots reaching up to 4 meters; fixes massive nitrogen and endures drought.",
    how: {
      sow: "Sow inoculated seeds 1.5 cm deep in firm, well-limed seedbed (pH > 6.5).",
      spacing: "20 cm drill rows (20-25 kg seed/ha).",
      irrigation: "Deep infrequent watering to train roots deep; avoid standing water on crown.",
      fert: "High phosphate and potash feeder (0:80:60 NPK kg/ha); fixes all its own nitrogen.",
      care: "Crown rot if waterlogged; weevil control at first green spring flush.",
      harvest: "First cut at 10% flower bloom; repeat cuts every 28-35 days for 3-5 years.",
    },
  },
];

export const CROPS = CROP_DEFS;

/**
 * Crops matching a filter. Pure, so the UI and tests share one path.
 * @param {{category?:string, waterNeed?:string, search?:string}} filter
 * @returns {Array<Object>} crops
 */
export function filterCrops(filter = {}) {
  const { category, waterNeed, search } = filter;
  const q = String(search || "").trim().toLowerCase();
  return CROPS.filter((c) => {
    if (category && c.category !== category) return false;
    if (waterNeed && c.waterNeed !== waterNeed) return false;
    if (q && !`${c.name} ${c.id}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/**
 * Calendar months for a sowing window, rotated for the hemisphere: the
 * southern-hemisphere rabi window is the northern kharif window shifted by 6.
 * @param {Object} crop
 * @param {string} hemisphere 'n' | 's'
 * @returns {number[]} months 1-12, sorted
 */
export function getSowMonthsForHemisphere(crop, hemisphere) {
  const months = Array.isArray(crop?.sowMonths) ? crop.sowMonths.slice() : [];
  if (hemisphere !== "s") return months.slice().sort((a, b) => a - b);
  return months
    .map((m) => ((m + 5) % 12) + 1)
    .sort((a, b) => a - b);
}

/**
 * True when the month sits in (or within `slack` months of) the sowing
 * window. Windows may wrap the year boundary (e.g. [11,12,1]).
 * @param {number} month 1-12
 * @param {number[]} window - months
 * @param {number} [slack] - tolerance either side, in whole months
 */
export function isMonthInWindow(month, window, slack = 0) {
  if (!Array.isArray(window) || window.length === 0) return false;
  for (let offset = -slack; offset <= slack; offset++) {
    const m = ((((month + offset - 1) % 12) + 12) % 12) + 1;
    if (window.includes(m)) return true;
  }
  return false;
}

/** Short month names for UI text. */
export const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "Rabi window (Oct-Nov)" — the display form of a sowing window.
 * @param {number[]} window - months
 */
export function formatSowWindow(window) {
  if (!Array.isArray(window) || window.length === 0) return "";
  return window.map((m) => MONTH_SHORT[m - 1]).join("-");
}

/**
 * Distance (in months, forward-only) from the current month to the opening
 * of the next sowing window. 0 means we are inside it.
 * @param {number} month - current 1-12
 * @param {number[]} window - crop window
 * @returns {number} months to go (0 when inside)
 */
export function monthsUntilWindow(month, window) {
  if (!Array.isArray(window) || window.length === 0) return 99;
  if (isMonthInWindow(month, window, 0)) return 0;
  let best = 99;
  for (let offset = 1; offset <= 12; offset++) {
    const m = (((month + offset - 1) % 12) + 12) % 12 + 1;
    if (window.includes(m)) {
      best = offset;
      break;
    }
  }
  return best;
}

/**
 * Simple Koppen-flavoured climate band from latitude and elevation — enough
 * to phrase "where to grow" in words a grower recognises.
 * @param {number} lat
 * @param {number} elev - metres
 * @returns {{zone:string, band:string, detail:string}}
 */
export function classifyClimate(lat, elev) {
  const absLat = Math.abs(lat ?? 0);
  const e = Number.isFinite(elev) ? elev : 0;
  if (absLat >= 66) {
    return { zone: "polar", band: "Polar / Arctic", detail: "Permafrost & sub-zero tundra — outdoor cropping season is inactive." };
  }
  if (absLat >= 56) {
    return { zone: "boreal-cold", band: "Boreal / Subarctic", detail: "Short cool summer window — cold-hardy brassicas, barley, and root crops only." };
  }
  if (absLat <= 2 && e <= 800) {
    return { zone: "tropical", band: "Hot & humid", detail: "Equatorial lowland — year-round warmth, monsoon-driven rains." };
  }
  if (absLat <= 12) {
    return { zone: "tropical", band: "Tropical", detail: "Warm year-round with a distinct wet/dry season." };
  }
  if (absLat <= 32) {
    if (e >= 2000) return { zone: "temperate-cool", band: "High-altitude temperate", detail: "Cool nights at height even in the tropics — two crops in the plains, temperate crops up high." };
    if (e >= 1000) return { zone: "subtropical", band: "Foothills / subtropical", detail: "Warm lowlands, cool highlands — widest crop range." };
    return { zone: "subtropical", band: "Semi-arid tropical", detail: "Hot summers, cool dry winters — the classic kharif/rabi land." };
  }
  if (absLat <= 47) {
    return e >= 1800
      ? { zone: "temperate-cool", band: "Temperate upland", detail: "Defined seasons with cold winters — long-season cereals and temperate fruit." }
      : { zone: "temperate", band: "Humid subtropical / temperate", detail: "Four seasons — plant after the last spring frost." };
  }
  return e >= 1500
    ? { zone: "temperate-cool", band: "Cool upland", detail: "Short growing window — frost-free crops only from late spring." }
    : { zone: "temperate", band: "Cool maritime", detail: "Cool summers, mild winters — brassicas and short-season grain." };
}

/**
 * Climate and latitude-aware sowing window for a specific site.
 * Accounts for polar/arctic freeze, boreal short windows, temperate
 * 4-season schedules (avoiding winter for warm crops), and tropical monsoons.
 *
 * @param {Object} crop
 * @param {{lat?:number, hemisphere?:string}} ctx
 * @returns {number[]} months 1-12, sorted
 */
export function getSowMonthsForSite(crop, ctx = {}) {
  const lat = Number.isFinite(ctx.lat) ? ctx.lat : 0;
  const absLat = Math.abs(lat);
  const hemisphere = ctx.hemisphere || (lat >= 0 ? "n" : "s");

  // Polar / Arctic: No outdoor agronomic sowing
  if (absLat >= 66) return [];

  // Boreal / Subarctic: short cool summer window only for cold-hardy crops
  if (absLat >= 55) {
    if (crop.coldHardy || (crop.temp.min <= 8 && (crop.frost == null || crop.frost <= 0))) {
      return hemisphere === "s" ? [11, 12] : [5, 6];
    }
    return [];
  }

  // Temperate zone (latitudes 35° to 55°): 4 seasons with freezing winters
  if (absLat >= 35) {
    if (Array.isArray(crop.sowMonthsTemperate)) {
      const win = crop.sowMonthsTemperate;
      if (hemisphere !== "s") return win.slice().sort((a, b) => a - b);
      return win.map((m) => ((m + 5) % 12) + 1).sort((a, b) => a - b);
    }
    // Tropical tender crops cannot grow in temperate zones
    if (crop.tropicalOnly || (crop.frost != null && crop.frost >= 4 && crop.temp.min >= 15)) {
      return [];
    }
    // Cool season crops: spring (Mar-May) or overwintering autumn (Sep-Oct)
    if (crop.temp.optMin <= 16 || (crop.frost != null && crop.frost <= 0)) {
      const win = crop.overwintering ? [9, 10] : [3, 4, 5];
      if (hemisphere !== "s") return win.slice().sort((a, b) => a - b);
      return win.map((m) => ((m + 5) % 12) + 1).sort((a, b) => a - b);
    }
    // Warm season crops in temperate: Late spring (May-June) after last frost
    const win = [5, 6];
    if (hemisphere !== "s") return win.slice().sort((a, b) => a - b);
    return win.map((m) => ((m + 5) % 12) + 1).sort((a, b) => a - b);
  }

  // Subtropical & Tropical (lat < 35°):
  return getSowMonthsForHemisphere(crop, hemisphere);
}

/**
 * The single "where to grow" line for a crop at a site.
 * @param {Object} crop
 * @param {{lat:number, elevation:number, soilId:string}} site
 */
export function describeWhereToGrow(crop, site) {
  const soils = crop.soils
    .map((id) => getSoil(id)?.name)
    .filter(Boolean);
  const clim = classifyClimate(site?.lat, site?.elevation);
  const altTxt = crop.altitude?.max
    ? ` up to ~${crop.altitude.max.toLocaleString()} m elevation`
    : "";
  return {
    soils,
    elevation: altTxt.trim(),
    climate: clim,
    soilTxt: soils.length ? soils.join(" / ") : "adaptive",
  };
}
