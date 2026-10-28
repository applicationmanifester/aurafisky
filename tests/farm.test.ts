// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  scoreSprayConditions,
  scoreSprayTimeline,
  summarizeSprayWindows,
  computeGDD,
  sumGDD,
  classifySoilMoisture,
  computeWaterBalance,
  frostRiskForNight,
  scoreCropForLocation,
  recommendCrops,
  farmAdvisories,
  agroCacheKey,
  classifyPlantType,
  isWaterBodyLocation,
} from '../features/farm.js';
import { CROPS } from '../features/cropData.js';

// ── spray conditions ──────────────────────────────────────────────

describe('scoreSprayConditions', () => {
  const ideal = {
    windSpeed: 6,
    windGusts: 9,
    precipitation: 0,
    precipitationProbability: 10,
    vpd: 0.8,
    temperature: 24,
    humidity: 55,
    isDay: true,
  };

  it('rates a calm, dry, mild hour as an excellent window', () => {
    const r = scoreSprayConditions(ideal);
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.label).toBe('Excellent');
  });

  it('blocks gale-force wind', () => {
    const r = scoreSprayConditions({ ...ideal, windSpeed: 45, windGusts: 70 });
    expect(r.score).toBeLessThan(20);
    expect(r.label).toBe('Do not spray');
    expect(r.reasons.join(' ')).toMatch(/Gale/);
  });

  it('blocks active rain', () => {
    const r = scoreSprayConditions({ ...ideal, precipitation: 2.4 });
    expect(r.score).toBeLessThan(20);
    expect(r.reasons.join(' ')).toMatch(/wash-off/);
  });

  it('treats a 75%+ rain chance as a hard block, like active rain', () => {
    const prob = scoreSprayConditions({ ...ideal, precipitationProbability: 80 });
    const rain = scoreSprayConditions({ ...ideal, precipitation: 2 });
    expect(prob.score).toBeLessThanOrEqual(18);
    expect(rain.score).toBeLessThanOrEqual(18);
    expect(prob.label).toBe('Do not spray');
    expect(rain.label).toBe('Do not spray');
  });

  it('scores a borderline 50% rain chance as a mid day, not a block', () => {
    const r = scoreSprayConditions({ ...ideal, precipitationProbability: 50 });
    expect(r.score).toBeGreaterThan(18);
    expect(r.score).toBeLessThan(75);
  });

  it('warns on drifting dry air', () => {
    const r = scoreSprayConditions({ ...ideal, humidity: 22 });
    expect(r.reasons.join(' ')).toMatch(/drift/);
  });

  it('warns on fast-evaporating VPD', () => {
    const r = scoreSprayConditions({ ...ideal, vpd: 3.4 });
    expect(r.reasons.join(' ')).toMatch(/evaporate/);
  });

  it('clamps the score into 0..100', () => {
    const r = scoreSprayConditions({
      windSpeed: 90, windGusts: 120, precipitation: 40,
      precipitationProbability: 100, vpd: 9, temperature: 50, humidity: 100, isDay: false,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

describe('scoreSprayTimeline + summarizeSprayWindows', () => {
  const hourly = {
    time: Array.from({ length: 24 }, (_, i) => `2026-07-10T${String(i).padStart(2, '0')}:00`),
    temperature_2m: Array.from({ length: 24 }, () => 24),
    relative_humidity_2m: Array.from({ length: 24 }, () => 55),
    wind_speed_10m: Array.from({ length: 24 }, (_, i) => (i < 6 ? 5 : 40)),
    wind_gusts_10m: Array.from({ length: 24 }, (_, i) => (i < 6 ? 8 : 60)),
    precipitation: Array.from({ length: 24 }, () => 0),
    precipitation_probability: Array.from({ length: 24 }, () => 5),
    is_day: Array.from({ length: 24 }, () => 1),
  };

  it('produces one row per hour with a label and colour', () => {
    const rows = scoreSprayTimeline(hourly, {}, 0, 24);
    expect(rows).toHaveLength(24);
    expect(rows[0].spray.label).toBeTruthy();
    expect(rows[0].spray.color).toMatch(/^#/);
  });

  it('finds the calm block as the best window', () => {
    const rows = scoreSprayTimeline(hourly, {}, 0, 24);
    const { windows, best } = summarizeSprayWindows(rows);
    expect(windows.length).toBe(1);
    expect(best.startIdx).toBe(0);
    expect(best.endIdx).toBeGreaterThanOrEqual(1);
  });

  it('returns no windows when every hour is unsprayable', () => {
    const windy = {
      ...hourly,
      wind_speed_10m: Array.from({ length: 24 }, () => 50),
    };
    const rows = scoreSprayTimeline(windy, {}, 0, 24);
    const { windows } = summarizeSprayWindows(rows);
    expect(windows).toHaveLength(0);
  });

  it('ignores single-hour blips', () => {
    const mixed = {
      ...hourly,
      wind_speed_10m: Array.from({ length: 24 }, (_, i) => (i === 3 ? 5 : 40)),
    };
    const { windows } = summarizeSprayWindows(scoreSprayTimeline(mixed, {}, 0, 24));
    expect(windows).toHaveLength(0);
  });
});

// ── growing degree days ───────────────────────────────────────────

describe('computeGDD / sumGDD', () => {
  it('uses the (max+min)/2 - base formula', () => {
    expect(computeGDD(30, 20)).toBe(15);
    expect(computeGDD(30, 20, 0)).toBe(25);
  });

  it('floors at zero for cold days', () => {
    expect(computeGDD(4, 0, 10)).toBe(0);
  });

  it('returns null for missing data', () => {
    expect(computeGDD(NaN, 20)).toBeNull();
  });

  it('sums across daily arrays', () => {
    const total = sumGDD({
      temperature_2m_max: [30, 32, 20],
      temperature_2m_min: [20, 22, 10],
    }, 10);
    // (25-10)+(27-10)+(15-10) = 37
    expect(total).toBe(37);
  });
});

// ── soil moisture ─────────────────────────────────────────────────

describe('classifySoilMoisture', () => {
  it('flags loam below the dry line as dry', () => {
    expect(classifySoilMoisture(0.1, 'loam').status).toBe('dry');
  });

  it('treats loam near field capacity as good', () => {
    expect(classifySoilMoisture(0.28, 'loam').status).toBe('good');
  });

  it('flags waterlogging above the wet line', () => {
    expect(classifySoilMoisture(0.42, 'loam').status).toBe('saturated');
  });

  it('is texture-aware: clay at 0.28 is not "dry"', () => {
    expect(classifySoilMoisture(0.28, 'clay').status).not.toBe('dry');
  });

  it('degrades gracefully for unknown textures / values', () => {
    expect(classifySoilMoisture(0.3, 'made-up').status).toBe('good');
    const none = classifySoilMoisture(null, 'loam');
    expect(none.status).toBe('unknown');
  });
});

// ── water balance ─────────────────────────────────────────────────

describe('computeWaterBalance', () => {
  const daily = Array.from({ length: 7 }, (_, i) => ({
    date: `2026-07-${String(10 + i).padStart(2, '0')}`,
    rain: i < 3 ? 30 : 0,
    et0: 5,
  }));

  it('reports a rain-heavy week as a hold', () => {
    const wb = computeWaterBalance({ daily, soilMoisture: { status: 'good' } });
    expect(wb.fRain).toBe(90);
    expect(wb.fEt0).toBe(35);
    expect(wb.level).toBe('wet');
    expect(wb.action).toMatch(/Hold irrigation/);
  });

  it('escalates to urgent when the root zone is dry', () => {
    const wb = computeWaterBalance({ daily, soilMoisture: { status: 'dry' } });
    expect(wb.level).toBe('urgent');
    expect(wb.action).toMatch(/Irrigate now/);
  });

  it('holds water on saturated soil regardless of the week', () => {
    const dryWeek = daily.map((d) => ({ ...d, rain: 0, et0: 8 }));
    const wb = computeWaterBalance({ daily: dryWeek, soilMoisture: { status: 'saturated' } });
    expect(wb.level).toBe('hold');
  });

  it('flags an ET-heavy week as irrigation soon', () => {
    const dryWeek = daily.map((d) => ({ ...d, rain: 0, et0: 8 }));
    const wb = computeWaterBalance({ daily: dryWeek, soilMoisture: { status: 'good' } });
    expect(wb.level).toBe('soon');
    expect(wb.foreNet).toBe(56);
  });
});

// ── frost risk ────────────────────────────────────────────────────

describe('frostRiskForNight', () => {
  it('is low on a mild night', () => {
    expect(frostRiskForNight(8, 2).level).toBe('low');
  });

  it('watches borderline nights', () => {
    expect(frostRiskForNight(4, 2).level).toBe('watch');
  });

  it('raises moderate risk at the threshold', () => {
    expect(frostRiskForNight(1, 2).level).toBe('moderate');
  });

  it('raises high risk well below the threshold', () => {
    expect(frostRiskForNight(-1, 2).level).toBe('high');
  });

  it('honours tender-crop thresholds (banana: 5°C)', () => {
    // 3°C is harmless for wheat but damaging for banana
    expect(frostRiskForNight(3, -2).level).toBe('low');
    expect(frostRiskForNight(3, 5).level).toBe('high');
  });

  it('returns null without a temperature', () => {
    expect(frostRiskForNight(undefined)).toBeNull();
  });
});

// ── crop scoring ──────────────────────────────────────────────────

const kharifCoastal = {
  siteTemp: 30,
  meanTempNext7: 29,
  rainNext7: 120,
  soilMoisture: { status: 'good' },
  soilId: 'clay',
  humidity: 85,
  vpd: 0.8,
  elevation: 50,
  lat: 19,
  month: 7,
  hemisphere: 'n',
};

const rabiPlains = {
  siteTemp: 16,
  meanTempNext7: 14,
  rainNext7: 8,
  soilMoisture: { status: 'drying' },
  soilId: 'loam',
  humidity: 50,
  vpd: 0.7,
  elevation: 200,
  lat: 28,
  month: 11,
  hemisphere: 'n',
};

describe('scoreCropForLocation', () => {
  const byId = (id: string) => CROPS.find((c) => c.id === id)!;

  it('scores paddy perfectly at a monsoon coastal field', () => {
    const r = scoreCropForLocation(byId('rice'), kharifCoastal);
    expect(r.score).toBeGreaterThanOrEqual(95);
    expect(r.verdict).toMatch(/Excellent/);
  });

  it('scores wheat perfectly at a November loam field', () => {
    const r = scoreCropForLocation(byId('wheat'), rabiPlains);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('drops wheat badly out of its window in the monsoon', () => {
    const r = scoreCropForLocation(byId('wheat'), kharifCoastal);
    expect(r.score).toBeLessThan(60);
    expect(r.constraints.length).toBeGreaterThan(0);
    expect(r.parts.find((p) => p.key === 'timing')!.score).toBe(0);
  });

  it('caps a crop at ≤25 when temperature is lethal (tomato at -29 °C)', () => {
    const greenland = {
      ...kharifCoastal,
      meanTempNext7: -26,
      siteTemp: -29,
      humidity: 60,
      soilMoisture: { status: 'good' },
      soilId: 'loam',
      month: 10,
    };
    const r = scoreCropForLocation(byId('tomato'), greenland);
    expect(r.score).toBeLessThanOrEqual(25);
    expect(r.verdict).toBe("Not the right crop for this site");
    expect(r.constraints.join(' ')).toMatch(/Temperature/);
  });

  it('keeps every score within 0..100 with parts summing to 100 of weight', () => {
    for (const crop of CROPS) {
      const r = scoreCropForLocation(crop, kharifCoastal);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.parts.reduce((a, p) => a + p.weight, 0)).toBe(100);
    }
  });

  it('flags a thirsty crop on a bone-dry sandy field', () => {
    const dry = { ...kharifCoastal, soilMoisture: { status: 'dry' }, soilId: 'sandy', humidity: 30 };
    const r = scoreCropForLocation(byId('rice'), dry);
    expect(r.score).toBeLessThan(70);
    expect(r.score).toBeLessThan(scoreCropForLocation(byId('rice'), kharifCoastal).score);
    expect(r.verdict).toMatch(/Workable|Not/);
    // the dry root zone and the wrong soil are both surfaced as constraints
    expect(r.constraints.join(' ')).toMatch(/Water/);
    expect(r.constraints.join(' ')).toMatch(/Soil/);
  });
});

describe('recommendCrops', () => {
  it('ranks monsoon-field crops with paddy near the top', () => {
    const recs = recommendCrops(kharifCoastal);
    const ids = recs.map((r) => r.cropId);
    expect(recs.length).toBeGreaterThan(2);
    expect(ids[0]).toBe('rice');
    expect(recs[0].score).toBeGreaterThanOrEqual(recs[1].score);
  });

  it('puts the rabi grain core at the top of the November field', () => {
    const recs = recommendCrops(rabiPlains);
    const top = recs.slice(0, 8).map((r) => r.cropId);
    // mustard/wheat/chickpea/lentil/barley/peas/garlic are all correct November rabi crops;
    // the ranking between them is a judgment call, their presence is not.
    for (const id of ['wheat', 'chickpea', 'mustard']) {
      expect(top).toContain(id);
    }
    expect(recs[0].score).toBeGreaterThanOrEqual(90);
  });

  it('filters out clearly wrong crops', () => {
    // Watermelon at a November chill with wet clay: far below the 35 cut.
    const ids = recommendCrops(rabiPlains).map((r) => r.cropId);
    expect(ids).not.toContain('watermelon');
  });

  it('recommends zero crops in sub-zero polar climate (Greenland at 79°N, -29°C)', () => {
    const greenlandCtx = {
      lat: 79.5335,
      siteTemp: -29,
      meanTempNext7: -26,
      nightMin: -31,
      elevation: 200,
      month: 10,
      hemisphere: 'n',
      soilId: 'loam',
    };
    const recs = recommendCrops(greenlandCtx);
    expect(recs).toHaveLength(0);
  });

  it('changes crop recommendations dynamically based on location and climate', () => {
    // Yalduru / South India (13°N, 24°C, October)
    const yalduru = {
      lat: 13.2843,
      siteTemp: 24,
      meanTempNext7: 23,
      rainNext7: 25,
      soilMoisture: { status: 'good' },
      soilId: 'red-laterite',
      humidity: 70,
      elevation: 800,
      month: 10,
      hemisphere: 'n',
    };
    const yalduruRecs = recommendCrops(yalduru).map((r) => r.cropId);
    expect(yalduruRecs).toContain('tomato');
    expect(yalduruRecs).toContain('onion');

    // London / Temperate (51°N, 12°C, October)
    const london = {
      lat: 51.5074,
      siteTemp: 12,
      meanTempNext7: 11,
      rainNext7: 20,
      soilMoisture: { status: 'good' },
      soilId: 'loam',
      humidity: 75,
      elevation: 35,
      month: 10,
      hemisphere: 'n',
    };
    const londonRecs = recommendCrops(london).map((r) => r.cropId);
    // Cool autumn temperate crops thrive
    expect(londonRecs).toContain('garlic');
    // Tropical crops are strictly excluded from outdoor temperate autumn
    expect(londonRecs).not.toContain('sugarcane');
    expect(londonRecs).not.toContain('banana');
    expect(londonRecs).not.toContain('mango');
  });
});

// ── advisories ────────────────────────────────────────────────────

describe('farmAdvisories', () => {
  it('raises a frost warning at a cold night minimum', () => {
    const a = farmAdvisories({ nightMin: -1, soilTemp6: 15 });
    const frost = a.find((x) => x.type === 'frost');
    expect(frost).toBeTruthy();
    expect(frost!.severity).toBe('severe');
    expect(frost!.desc).toMatch(/sprinklers/i);
  });

  it('stays silent on a mild night', () => {
    expect(farmAdvisories({ nightMin: 14, soilTemp6: 20 }).length).toBe(0);
  });

  it('holds sowing when the soil is too cold', () => {
    const a = farmAdvisories({ nightMin: 12, soilTemp6: 5 });
    expect(a.some((x) => x.type === 'cold-soil')).toBe(true);
  });

  it('flags a dry root zone and a saturated one', () => {
    expect(farmAdvisories({ soilMoisture: { status: 'dry' } }).some((x) => x.type === 'dry-soil')).toBe(true);
    expect(farmAdvisories({ soilMoisture: { status: 'saturated' } }).some((x) => x.type === 'wet-soil')).toBe(true);
  });

  it('flags heat, heavy rain and high wind', () => {
    expect(farmAdvisories({ tmaxNext7: 43 }).some((x) => x.type === 'heat')).toBe(true);
    expect(farmAdvisories({ rainNext24h: 30 }).some((x) => x.type === 'rain')).toBe(true);
    expect(farmAdvisories({ windNow: 40 }).some((x) => x.type === 'wind')).toBe(true);
  });
});

describe('agroCacheKey', () => {
  it('rounds coordinates so nudged pans reuse cache', () => {
    expect(agroCacheKey(19.0861, 72.8529)).toBe('19.086,72.853');
    expect(agroCacheKey(19.0861, 72.8529)).toBe(agroCacheKey(19.0864, 72.8527));
  });
});

describe('classifyPlantType', () => {
  it('classifies trees and woody plants', () => {
    expect(classifyPlantType({ vernacularName: 'English Oak', family: 'Fagaceae' }).id).toBe('tree');
    expect(classifyPlantType({ scientificName: 'Pinus sylvestris', family: 'Pinaceae' }).id).toBe('tree');
    expect(classifyPlantType({ vernacularName: 'Neem Tree', family: 'Meliaceae' }).id).toBe('tree');
  });

  it('classifies herbs and medicinal plants', () => {
    expect(classifyPlantType({ vernacularName: 'Spearmint', family: 'Lamiaceae' }).id).toBe('herb');
    expect(classifyPlantType({ scientificName: 'Lavandula angustifolia', family: 'Lamiaceae' }).id).toBe('herb');
    expect(classifyPlantType({ vernacularName: 'Holy Basil', scientificName: 'Ocimum tenuiflorum' }).id).toBe('herb');
  });

  it('classifies wildflowers and floral ornamentals', () => {
    expect(classifyPlantType({ vernacularName: 'Common Daisy', family: 'Asteraceae' }).id).toBe('flower');
    expect(classifyPlantType({ vernacularName: 'Wild Rose', family: 'Rosaceae' }).id).toBe('flower');
    expect(classifyPlantType({ scientificName: 'Tagetes erecta' }).id).toBe('flower');
  });

  it('classifies grasses, reeds and ferns', () => {
    expect(classifyPlantType({ vernacularName: 'Meadow Fescue', family: 'Poaceae' }).id).toBe('grass');
    expect(classifyPlantType({ vernacularName: 'Bracken Fern', family: 'Dennstaedtiaceae' }).id).toBe('grass');
    expect(classifyPlantType({ scientificName: 'Bambusa vulgaris' }).id).toBe('grass');
  });

  it('falls back to general native flora when unclassified', () => {
    expect(classifyPlantType({ vernacularName: 'Common Moss', family: 'UnknownFam' }).id).toBe('flora');
  });
});

describe('isWaterBodyLocation & open water handling', () => {
  it('detects ocean by named water bodies or reverse geocode descriptions', () => {
    const ocean = isWaterBodyLocation({ lat: 0, lng: -30 }, { selectedName: 'North Atlantic Ocean' });
    expect(ocean.isWater).toBe(true);
    expect(ocean.label).toBe('Open Ocean');
  });

  it('detects maritime coordinates with zero elevation, zero soil moisture and no settlement', () => {
    const sulawesiSea = isWaterBodyLocation(
      { lat: -4.3837, lng: 117.0582, elevation: 0, hasSoil: true, soilVwc: 0, soilDeep: 0 },
      { selectedName: 'South Sulawesi', selectedAddress: { province: 'Sulawesi Selatan', country: 'Indonesia' } }
    );
    expect(sulawesiSea.isWater).toBe(true);
  });

  it('identifies terrestrial cities as not water bodies', () => {
    const london = isWaterBodyLocation(
      { lat: 51.5074, lng: -0.1278, elevation: 16, hasSoil: true, soilVwc: 0.34 },
      { selectedName: 'London', selectedAddress: { city: 'London', country: 'United Kingdom' } }
    );
    expect(london.isWater).toBe(false);

    const mumbai = isWaterBodyLocation(
      { lat: 19.076, lng: 72.877, elevation: 14, hasSoil: true, soilVwc: 0.22 },
      { selectedName: 'Mumbai', selectedAddress: { city: 'Mumbai', road: 'Marine Drive' } }
    );
    expect(mumbai.isWater).toBe(false);
  });

  it('excludes all crops and returns empty recommendations on water locations', () => {
    const waterCtx = { isWater: true, lat: -4.3837, lng: 117.0582 };
    const recs = recommendCrops(waterCtx);
    expect(recs).toEqual([]);

    const score = scoreCropForLocation(CROPS[0], waterCtx);
    expect(score.score).toBe(0);
    expect(score.verdict).toMatch(/open water/i);
  });
});

