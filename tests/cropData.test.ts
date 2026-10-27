import { describe, it, expect } from 'vitest';
import {
  CROPS,
  SOIL_TYPES,
  getSoil,
  filterCrops,
  getSowMonthsForHemisphere,
  isMonthInWindow,
  monthsUntilWindow,
  formatSowWindow,
  classifyClimate,
  describeWhereToGrow,
} from '../features/cropData.js';

describe('soil textures', () => {
  it('orders thresholds dryBelow < fieldCapacity < wetAbove for every texture', () => {
    for (const s of SOIL_TYPES) {
      expect(s.dryBelow).toBeLessThan(s.fieldCapacity);
      expect(s.fieldCapacity).toBeLessThan(s.wetAbove);
    }
  });

  it('falls back to null for unknown ids', () => {
    expect(getSoil('volcanic-ash')).toBeNull();
  });
});

describe('crop database integrity', () => {
  it('has a decent spread of crops', () => {
    expect(CROPS.length).toBeGreaterThanOrEqual(25);
  });

  it('gives every crop the fields the UI and scorer rely on', () => {
    for (const c of CROPS) {
      expect(c.id).toMatch(/^[a-z-]+$/);
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.emoji.length).toBeGreaterThan(0);
      expect(c.temp.optMin).toBeLessThan(c.temp.optMax);
      expect(c.temp.min).toBeLessThanOrEqual(c.temp.optMin);
      expect(c.temp.max).toBeGreaterThanOrEqual(c.temp.optMax);
      expect(c.rainfall.min).toBeLessThan(c.rainfall.max);
      expect(c.altitude.max).toBeGreaterThan(0);
      expect(['low', 'medium', 'high']).toContain(c.waterNeed);
      expect(c.soils.length).toBeGreaterThan(0);
      expect(c.sowMonths.length).toBeGreaterThan(0);
      expect(c.duration).toBeGreaterThan(30);
      expect(c.how.sow.length).toBeGreaterThan(10);
      expect(c.how.harvest.length).toBeGreaterThan(10);
    }
  });

  it('uses valid soil ids and valid sowing months', () => {
    const valid = new Set(SOIL_TYPES.map((s) => s.id));
    for (const c of CROPS) {
      for (const s of c.soils) expect(valid.has(s), `${c.id} soil "${s}"`).toBe(true);
      for (const m of c.sowMonths) {
        expect(Number.isInteger(m)).toBe(true);
        expect(m).toBeGreaterThanOrEqual(1);
        expect(m).toBeLessThanOrEqual(12);
      }
    }
  });

  it('keeps crop ids unique', () => {
    const ids = CROPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers both grain and vegetable/fruit families', () => {
    const cats = new Set(CROPS.map((c) => c.category));
    expect(cats.has('Cereal')).toBe(true);
    expect(cats.has('Pulse')).toBe(true);
    expect(cats.has('Vegetable')).toBe(true);
    expect(cats.has('Fruit')).toBe(true);
  });
});

describe('hemisphere window rotation', () => {
  it('shifts southern windows by six months', () => {
    const wheat = CROPS.find((c) => c.id === 'wheat')!;
    expect(getSowMonthsForHemisphere(wheat, 'n')).toEqual([10, 11, 12]);
    expect(getSowMonthsForHemisphere(wheat, 's')).toEqual([4, 5, 6]);
  });

  it('wraps month rotation across the year boundary', () => {
    const rice = CROPS.find((c) => c.id === 'rice')!; // [6, 7]
    expect(getSowMonthsForHemisphere(rice, 's')).toEqual([1, 12]); // Dec-Jan, sorted
  });
});

describe('isMonthInWindow', () => {
  it('matches inside the window', () => {
    expect(isMonthInWindow(11, [10, 11, 12])).toBe(true);
  });

  it('rejects outside the window', () => {
    expect(isMonthInWindow(7, [10, 11, 12])).toBe(false);
  });

  it('accepts slack months', () => {
    expect(isMonthInWindow(9, [10, 11, 12], 1)).toBe(true);
    expect(isMonthInWindow(9, [10, 11, 12], 0)).toBe(false);
  });

  it('handles windows that wrap the year end', () => {
    expect(isMonthInWindow(1, [12, 1, 2])).toBe(true);
  });
});

describe('monthsUntilWindow', () => {
  it('is zero inside the window', () => {
    expect(monthsUntilWindow(11, [10, 11, 12])).toBe(0);
  });

  it('counts forward to the next opening', () => {
    expect(monthsUntilWindow(7, [10, 11, 12])).toBe(3);
    expect(monthsUntilWindow(1, [6, 7])).toBe(5);
  });

  it('handles wrap-around', () => {
    expect(monthsUntilWindow(8, [12, 1])).toBe(4);
  });
});

describe('formatSowWindow', () => {
  it('renders month names', () => {
    expect(formatSowWindow([10, 11, 12])).toBe('Oct-Nov-Dec');
    expect(formatSowWindow([])).toBe('');
  });
});

describe('classifyClimate', () => {
  it('labels equatorial lowlands tropical', () => {
    expect(classifyClimate(1, 50).zone).toBe('tropical');
  });

  it('labels north-Indian plains semi-arid tropical', () => {
    expect(classifyClimate(28, 200).zone).toBe('subtropical');
  });

  it('labels high plains cool at altitude', () => {
    expect(classifyClimate(28, 2600).zone).toBe('temperate-cool');
  });

  it('labels temperate latitudes temperate', () => {
    expect(classifyClimate(45, 100).zone).toBe('temperate');
  });
});

describe('describeWhereToGrow', () => {
  it('names the soils a crop suits', () => {
    const rice = CROPS.find((c) => c.id === 'rice')!;
    const where = describeWhereToGrow(rice, { lat: 19, elevation: 20, soilId: 'clay' });
    expect(where.soilTxt).toMatch(/Clay loam/);
    expect(where.climate.band).toBeTruthy();
  });
});

describe('filterCrops', () => {
  it('filters by category', () => {
    const veg = filterCrops({ category: 'Vegetable' });
    expect(veg.every((c) => c.category === 'Vegetable')).toBe(true);
    expect(veg.length).toBeGreaterThan(3);
  });

  it('filters by water need', () => {
    const low = filterCrops({ waterNeed: 'low' });
    expect(low.some((c) => c.id === 'pearl-millet')).toBe(true);
    expect(low.every((c) => c.waterNeed === 'low')).toBe(true);
  });

  it('searches by name', () => {
    expect(filterCrops({ search: 'chana' }).map((c) => c.id)).toEqual(['chickpea']);
    expect(filterCrops({ search: 'RICE' }).map((c) => c.id)).toEqual(['rice']);
  });
});
