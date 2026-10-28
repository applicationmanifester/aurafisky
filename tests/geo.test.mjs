// Unit tests for modules/geo.js — place naming, coordinate formatting and
// distance maths.
//
// The address fixtures below are verbatim responses from Nominatim's
// reverse endpoint (zoom=18&addressdetails=1), captured for real
// coordinates, so these tests lock in the actual behaviour of the service
// rather than a guess at it.
import { test, expect, describe } from "vitest";
import {
  formatPlaceName,
  shortPlaceName,
  mediumPlaceName,
  formatCoordinates,
  formatCoordinateAccuracy,
  coordinateAccuracyMeters,
  coordinateResolution,
  haversineMeters,
  bearingDegrees,
  bearingLabel,
  formatDistance,
  describeProximity,
  describeCoordinates,
  breakdownAddress,
} from "../modules/geo.js";

// 12.9716, 77.5946 — central Bengaluru. Note how much of the ladder a
// city-first strategy throws away.
const ASHOKANAGAR = {
  amenity: "St. Joseph's Indian High School",
  road: "Vittal Mallya Road",
  neighbourhood: "D'Souza Layout",
  quarter: "Shanthala Nagar",
  suburb: "Ashokanagar",
  city_district: "Bengaluru Central City Corporation",
  city: "Bengaluru",
  county: "Bangalore North",
  state_district: "Bengaluru Urban",
  state: "Karnataka",
  "ISO3166-2-lvl4": "IN-KA",
  postcode: "560001",
  country: "India",
  country_code: "in",
};

// 13.2875, 78.2905 — a village with no city at all.
const YALDURU = {
  village: "Yalduru",
  county: "Kolar",
  state_district: "Kolar",
  state: "Karnataka",
  country: "India",
  country_code: "in",
};

// 34.1526, 77.5771 — a mountain pass whose nearest city is 100 km away.
const KHARDUNG_LA = {
  road: "Khardung La Road",
  quarter: "Chaktsal Gang",
  city: "Leh",
  state_district: "Leh district",
  state: "Ladakh",
  postcode: "194101",
  country: "India",
};

describe("formatPlaceName", () => {
  test("prefers the suburb over the city", () => {
    const name = formatPlaceName(ASHOKANAGAR);
    expect(name.startsWith("Ashokanagar")).toBe(true);
    expect(name).toContain("Bengaluru");
    // The city must appear as context, not as the headline.
    expect(name).not.toBe("Bengaluru, Karnataka, India");
  });

  test("handles a village with no city level", () => {
    expect(formatPlaceName(YALDURU)).toBe("Yalduru, Kolar, Karnataka, India");
  });

  test("keeps a remote quarter rather than the distant city", () => {
    const name = formatPlaceName(KHARDUNG_LA);
    expect(name.startsWith("Chaktsal Gang")).toBe(true);
    expect(name).toContain("Leh");
  });

  test("never emits the same value twice", () => {
    // Singapore/Singapore: state and country share a name.
    const dup = formatPlaceName({
      city: "Singapore",
      state: "Singapore",
      country: "Singapore",
    });
    expect(dup).toBe("Singapore");
  });

  test("is case- and punctuation-insensitive about duplicates", () => {
    const dup = formatPlaceName({ city: "Leh", county: "leh district", state: "Ladakh" });
    expect(dup.match(/Leh/gi)).toHaveLength(1);
  });

  test("never returns an empty string when the address has anything", () => {
    expect(formatPlaceName({ village: "Tiny" })).toBeTruthy();
  });

  test("falls back cleanly for a missing or empty address", () => {
    expect(formatPlaceName(null, { fallback: "Nowhere" })).toBe("Nowhere");
    expect(formatPlaceName({}, { fallback: "Nowhere" })).toBe("Nowhere");
    expect(formatPlaceName(undefined)).toBe("");
  });

  test("can omit the country for compact labels", () => {
    const withCountry = formatPlaceName(YALDURU);
    const without = formatPlaceName(YALDURU, { includeCountry: false });
    expect(withCountry).toContain("India");
    expect(without).not.toContain("India");
  });

  test("optionally inserts the postcode next to the primary name", () => {
    const name = formatPlaceName(ASHOKANAGAR, { includePostcode: true });
    expect(name.startsWith("Ashokanagar, 560001")).toBe(true);
  });

  test("identifies water bodies (lakes, rivers, bays, oceans) as primary place names", () => {
    const lake = formatPlaceName({
      water: "Lake Geneva",
      county: "District de Nyon",
      state: "Vaud",
      country: "Switzerland"
    });
    expect(lake.startsWith("Lake Geneva")).toBe(true);
    expect(lake).toContain("Vaud");

    const river = formatPlaceName({
      waterway: "River Thames",
      county: "Greater London",
      country: "United Kingdom"
    });
    expect(river.startsWith("River Thames")).toBe(true);

    const bay = formatPlaceName({
      bay: "San Francisco Bay",
      state: "California",
      country: "United States"
    });
    expect(bay.startsWith("San Francisco Bay")).toBe(true);

    const sea = formatPlaceName({
      sea: "Arabian Sea",
      country: "India"
    });
    expect(sea.startsWith("Arabian Sea")).toBe(true);
  });
});

describe("shortPlaceName / mediumPlaceName", () => {
  test("short takes the first segment", () => {
    expect(shortPlaceName("Yalduru, Kolar, Karnataka, India")).toBe("Yalduru");
    expect(shortPlaceName("Ashokanagar, Bengaluru, Karnataka")).toBe("Ashokanagar");
  });

  test("short survives empty and whitespace input", () => {
    expect(shortPlaceName("")).toBe("");
    expect(shortPlaceName("   ")).toBe("");
    expect(shortPlaceName(undefined)).toBe("");
  });

  test("short does not repeat a duplicated name", () => {
    expect(shortPlaceName("Singapore, Singapore")).toBe("Singapore");
  });

  test("short pairs non-Latin primary segment with Latin parent settlement", () => {
    expect(shortPlaceName("ಬನ್ನೂರು, Puttur Taluk, Dakshina Kannada, Karnataka, India"))
      .toBe("Puttur (ಬನ್ನೂರು)");
    expect(shortPlaceName("गांधीनगर, Jaipur District, Rajasthan, India"))
      .toBe("Jaipur (गांधीनगर)");
  });

  test("medium keeps two segments so list items are distinguishable", () => {
    expect(mediumPlaceName("Yalduru, Kolar, Karnataka, India")).toBe("Yalduru, Kolar");
    expect(mediumPlaceName("Only One")).toBe("Only One");
  });

  test("medium skips a duplicated second segment", () => {
    expect(mediumPlaceName("Singapore, Singapore, Singapore")).toBe("Singapore");
  });
});

describe("formatCoordinates", () => {
  test("formats decimals with hemispheres", () => {
    expect(formatCoordinates(13.2875, 78.2905)).toBe("13.2875°N, 78.2905°E");
    expect(formatCoordinates(-33.8688, -70.6693)).toBe("33.8688°S, 70.6693°W");
  });

  test("honours the requested precision", () => {
    expect(formatCoordinates(13.287512345, 78.290512345, { precision: 2 }))
      .toBe("13.29°N, 78.29°E");
  });

  test("can omit hemispheres", () => {
    expect(formatCoordinates(-33.8688, -70.6693, { hemisphere: false }))
      .toBe("33.8688, 70.6693");
  });

  test("formats DMS", () => {
    // 13.2875 -> 13 deg 17.25 min -> 13°17'15.0"N
    const out = formatCoordinates(13.2875, 78.2905, { format: "dms" });
    expect(out).toMatch(/^13°17'15\.0"N 78°17'2\d\.\d"E$/);
  });

  test("DMS handles zero and negative values", () => {
    expect(formatCoordinates(0, 0, { format: "dms" })).toMatch(/^0°00'00\.0"N 0°00'00\.0"E$/);
    expect(formatCoordinates(-0.5, 0.5, { format: "dms" })).toContain('S');
  });

  test("does not roll minutes over to 60 on rounding", () => {
    // 13.9999999 -> 13 deg 59.99999 min -> must render 14°00'00.0", not 13°60'
    const out = formatCoordinates(13.9999999, 0, { format: "dms" });
    expect(out).not.toContain("60'");
    expect(out.startsWith("14°00'")).toBe(true);
  });

  test("returns a placeholder for invalid input", () => {
    expect(formatCoordinates(null, 5)).toBe("--");
    expect(formatCoordinates(5, NaN)).toBe("--");
  });
});

describe("coordinateResolution / accuracy", () => {
  test("longitude resolution shrinks with the cosine of latitude", () => {
    const equator = coordinateResolution(0);
    const high = coordinateResolution(60);
    expect(equator.lng).toBeGreaterThan(high.lng);
    expect(equator.lat).toBe(111320);
  });

  test("describes resolution in human units", () => {
    expect(formatCoordinateAccuracy(0, 4)).toMatch(/±/);
    expect(formatCoordinateAccuracy(0, 4)).toContain('m');
    expect(formatCoordinateAccuracy(0, 1)).toContain('km');
  });

  test("reports the worse of the two axes", () => {
    // At the equator longitude is the limit (4dp -> ~11 m). Near the poles a
    // longitude degree is much shorter, so the pair becomes *finer*, not
    // coarser — latitude never degrades.
    const eq = coordinateAccuracyMeters(0, 4);
    const polar = coordinateAccuracyMeters(78, 4);
    expect(eq).toBeCloseTo(11, 0);
    expect(polar).toBeLessThan(eq);
    // Latitude resolution is latitude-independent.
    expect(coordinateResolution(0).lat).toBe(coordinateResolution(78).lat);
  });

  test("the formatted string and the numeric helper agree", () => {
    expect(formatCoordinateAccuracy(0, 4)).toBe('±11 m');
    expect(coordinateAccuracyMeters(0, 4)).toBeCloseTo(11, 0);
  });
});

describe("haversineMeters", () => {
  test("is zero for the same point", () => {
    expect(haversineMeters(13.2875, 78.2905, 13.2875, 78.2905)).toBe(0);
  });

  test("matches a known distance", () => {
    // Bengaluru -> Mysuru is ~128 km as the crow flies.
    const m = haversineMeters(12.9716, 77.5946, 12.2958, 76.6394);
    expect(m / 1000).toBeGreaterThan(125);
    expect(m / 1000).toBeLessThan(131);
  });

  test("is symmetric", () => {
    const a = haversineMeters(12.9716, 77.5946, 13.0827, 77.2197);
    const b = haversineMeters(13.0827, 77.2197, 12.9716, 77.5946);
    expect(a).toBeCloseTo(b, 6);
  });

  test("returns Infinity for invalid input rather than NaN", () => {
    expect(haversineMeters(null, 1, 2, 3)).toBe(Infinity);
    expect(haversineMeters(1, 1, NaN, 3)).toBe(Infinity);
  });

  test("crosses the antimeridian correctly", () => {
    // 179.9E to 179.9W is 0.2 degrees apart, not 359.8.
    const m = haversineMeters(0, 179.9, 0, -179.9);
    expect(m / 1000).toBeLessThan(25);
  });
});

describe("bearing", () => {
  test("points north/south/east/west correctly", () => {
    expect(bearingLabel(bearingDegrees(0, 0, 1, 0))).toBe("N");
    expect(bearingLabel(bearingDegrees(1, 0, 0, 0))).toBe("S");
    expect(bearingLabel(bearingDegrees(0, 0, 0, 1))).toBe("E");
    expect(bearingLabel(bearingDegrees(0, 1, 0, 0))).toBe("W");
  });

  test("returns null for invalid input", () => {
    expect(bearingDegrees(null, 0, 1, 1)).toBeNull();
    expect(bearingLabel(null)).toBe("");
  });
});

describe("formatDistance", () => {
  test("scales units sensibly", () => {
    expect(formatDistance(12)).toBe("10 m");
    expect(formatDistance(940)).toBe("940 m");
    expect(formatDistance(1450)).toBe("1.5 km");
    expect(formatDistance(14500)).toBe("15 km");
    expect(formatDistance(145000)).toBe("145 km");
  });

  test("returns empty for non-finite input", () => {
    expect(formatDistance(Infinity)).toBe("");
    expect(formatDistance(null)).toBe("");
  });
});

describe("describeProximity", () => {
  test("describes a distant parent city with distance and bearing", () => {
    const text = describeProximity(34.1526, 77.5771, 34.1526, 77.5771 + 2, "Leh");
    expect(text).toMatch(/km .* of Leh$/);
  });

  test("says nothing when the parent is right here", () => {
    expect(describeProximity(12.9716, 77.5946, 12.9717, 77.5947, "Bengaluru")).toBe("");
  });

  test("says nothing without a parent name or coordinates", () => {
    expect(describeProximity(1, 1, 2, 2, "")).toBe("");
    expect(describeProximity(1, 1, null, null, "Somewhere")).toBe("");
  });
});

describe("describeCoordinates", () => {
  test("labels oceans and polar regions", () => {
    expect(describeCoordinates(-70, 0)).toBe("Antarctic Region");
    expect(describeCoordinates(70, 0)).toBe("Arctic Region");
    expect(describeCoordinates(0, -30)).toBe("North Atlantic Ocean");
    expect(describeCoordinates(-20, 100)).toBe("Indian Ocean");
    expect(describeCoordinates(0, -140)).toBe("North Pacific Ocean");
  });

  test("identifies specific regional seas, gulfs, bays, and large lakes", () => {
    expect(describeCoordinates(20.0, 38.5)).toBe("Red Sea");
    expect(describeCoordinates(18.0, 66.0)).toBe("Arabian Sea");
    expect(describeCoordinates(35.0, 18.0)).toBe("Mediterranean Sea");
    expect(describeCoordinates(15.0, 88.0)).toBe("Bay of Bengal");
    expect(describeCoordinates(27.0, 51.0)).toBe("Persian Gulf");
    expect(describeCoordinates(43.0, 35.0)).toBe("Black Sea");
    expect(describeCoordinates(42.0, 50.0)).toBe("Caspian Sea");
    expect(describeCoordinates(15.0, -72.0)).toBe("Caribbean Sea");
    expect(describeCoordinates(25.0, -90.0)).toBe("Gulf of Mexico");
    expect(describeCoordinates(58.0, 20.0)).toBe("Baltic Sea");
    expect(describeCoordinates(47.5, -88.0)).toBe("Lake Superior");
  });

  test("normalises multi-world longitudes", () => {
    // A click three worlds to the right arrives as lng 900.
    expect(describeCoordinates(0, 900)).toBe(describeCoordinates(0, -180));
  });
});

describe("breakdownAddress", () => {
  test("extracts area, taluk, district, province/state for urban addresses", () => {
    const res = breakdownAddress(ASHOKANAGAR, "", 12.9716, 77.5946);
    expect(res.area).toContain("Vittal Mallya Road");
    expect(res.area).toContain("Ashokanagar");
    expect(res.city).toBe("Bengaluru");
    expect(res.taluk).toBe("Bangalore North");
    expect(res.district).toBe("Bengaluru Urban");
    expect(res.state).toBe("Karnataka");
    expect(res.postcode).toBe("560001");
    expect(res.country).toBe("India");
    expect(res.fullAddress).toContain("Vittal Mallya Road");
    expect(res.fullAddress).toContain("Bengaluru");
    expect(res.fullAddress).toContain("Karnataka");
  });

  test("handles rural addresses without city", () => {
    const res = breakdownAddress(YALDURU, "", 13.2875, 78.2905);
    expect(res.area).toBe("Yalduru");
    expect(res.taluk).toBe("Kolar");
    expect(res.district).toBe("Kolar");
    expect(res.state).toBe("Karnataka");
    expect(res.country).toBe("India");
  });

  test("handles remote regions and addresses with minimal fields", () => {
    const res = breakdownAddress(KHARDUNG_LA, "", 34.1526, 77.5771);
    expect(res.area).toContain("Khardung La Road");
    expect(res.city).toBe("Leh");
    expect(res.district).toBe("Leh district");
    expect(res.state).toBe("Ladakh");
  });

  test("falls back gracefully when address object is empty or null", () => {
    const res = breakdownAddress(null, "Custom Display Name", 12.34, 56.78);
    expect(res.area).toBe("");
    expect(res.city).toBe("");
    expect(res.taluk).toBe("");
    expect(res.district).toBe("");
    expect(res.state).toBe("");
    expect(res.fullAddress).toBe("Custom Display Name");

    const resEmpty = breakdownAddress({}, "", 12.3456, 78.9012);
    expect(resEmpty.fullAddress).toBe("12.3456, 78.9012");
  });

  test("extracts administrative components from comma-separated displayName when address is empty", () => {
    const res = breakdownAddress(null, "Chitvel, Kadapa, Andhra Pradesh, India", 14.1612, 79.3037);
    expect(res.area).toBe("Chitvel");
    expect(res.district).toBe("Kadapa");
    expect(res.state).toBe("Andhra Pradesh");
    expect(res.fullAddress).toBe("Chitvel, Kadapa, Andhra Pradesh, India");
  });

  test("never extracts raw coordinate strings into address hierarchy fields or shortPlaceName", () => {
    const res = breakdownAddress(null, "16.4106, 77.6953", 16.4106, 77.6953);
    expect(res.area).toBe("");
    expect(res.taluk).toBe("");
    expect(res.district).toBe("");
    expect(res.state).toBe("");
    expect(res.fullAddress).toBe("16.4106, 77.6953");

    expect(shortPlaceName("16.4106, 77.6953")).toBe("Locating...");
    expect(shortPlaceName("16.4106° N, 77.6953° E")).toBe("Locating...");
  });
});