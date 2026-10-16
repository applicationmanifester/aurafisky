// Unit tests for modules/reverseGeocode.js — the zoom-merge policy.
//
// Every fixture below is a verbatim Nominatim response for the SAME
// coordinate (13.5146, 78.2258), captured live. That point is 7 m from
// Gaunipalli's own centroid, yet zoom 18 answers "Kottahudya" and zoom 14
// answers "Gaunipalli". These tests lock in the rule that resolves that.
import { test, expect, describe } from "vitest";
import {
  pickSettlement,
  mergeReverseAddresses,
  labelFromReverse,
  reverseUrls,
} from "../modules/reverseGeocode.js";

// zoom=14 -> the correct settlement
const GAUNIPALLI_Z14 = {
  name: "Gaunipalli",
  display_name: "Gaunipalli, Srinivasapura taluku, Kolar, Karnataka, 563161, India",
  address: {
    village: "Gaunipalli",
    county: "Srinivasapura taluku",
    state_district: "Kolar",
    state: "Karnataka",
    country: "India",
    country_code: "in",
  },
};

// zoom=18 -> the parent of the nearest address node, a DIFFERENT village
const KOTTAHUDYA_Z18 = {
  name: "AP Model School & Jr College, B. Kottakota",
  display_name:
    "AP Model School & Jr College, B. Kottakota, Kottahudya, Srinivasapura taluku, Kolar, Karnataka, 563161, India",
  address: {
    road: "AP Model School & Jr College, B. Kottakota",
    village: "Kottahudya",
    county: "Srinivasapura taluku",
    state_district: "Kolar",
    state: "Karnataka",
    postcode: "563161",
    country: "India",
    country_code: "in",
  },
};

// A city where both zooms agree, and the fine one is strictly richer.
const ASHOKANAGAR_Z14 = {
  name: "Bengaluru",
  address: { city: "Bengaluru", state: "Karnataka", country: "India" },
};
const ASHOKANAGAR_Z18 = {
  name: "St. Joseph's Indian High School",
  address: {
    suburb: "Ashokanagar",
    quarter: "Shanthala Nagar",
    city: "Bengaluru",
    state: "Karnataka",
    country: "India",
    postcode: "560001",
  },
};

describe("pickSettlement", () => {
  test("reads the settlement from whichever level is present", () => {
    expect(pickSettlement({ village: "Gaunipalli" })).toBe("Gaunipalli");
    expect(pickSettlement({ town: "Mysuru" })).toBe("Mysuru");
    expect(pickSettlement({ city: "Bengaluru" })).toBe("Bengaluru");
  });

  test("prefers city over town over village", () => {
    expect(pickSettlement({ village: "V", town: "T", city: "C" })).toBe("C");
  });

  test("returns empty when there is no settlement", () => {
    expect(pickSettlement({ state: "Karnataka" })).toBe("");
    expect(pickSettlement(null)).toBe("");
    expect(pickSettlement(undefined)).toBe("");
  });
});

describe("mergeReverseAddresses", () => {
  test("detects the settlement disagreement", () => {
    const m = mergeReverseAddresses(
      GAUNIPALLI_Z14.address,
      KOTTAHUDYA_Z18.address,
    );
    expect(m.disagreed).toBe(true);
    expect(m.settlement).toBe("Gaunipalli");
  });

  test("the coarse settlement wins, and the fine one is gone", () => {
    const m = mergeReverseAddresses(
      GAUNIPALLI_Z14.address,
      KOTTAHUDYA_Z18.address,
    );
    expect(pickSettlement(m.address)).toBe("Gaunipalli");
    expect(m.address.village).toBe("Gaunipalli");
    expect(m.address.road).toBe("AP Model School & Jr College, B. Kottakota");
  });

  test("no disagreement when both agree — the finer address is used", () => {
    const m = mergeReverseAddresses(ASHOKANAGAR_Z14.address, ASHOKANAGAR_Z18.address);
    expect(m.disagreed).toBe(false);
    expect(m.address.suburb).toBe("Ashokanagar");
  });

  test("survives one or both responses being null", () => {
    expect(mergeReverseAddresses(GAUNIPALLI_Z14.address, null).settlement)
      .toBe("Gaunipalli");
    expect(mergeReverseAddresses(null, ASHOKANAGAR_Z18.address).settlement)
      .toBe("Bengaluru");
    const both = mergeReverseAddresses(null, null);
    expect(both.address).toEqual({});
    expect(both.settlement).toBe("");
  });
});

describe("labelFromReverse", () => {
  test("the reported bug: map says Gaunipalli, card must not say Kottahudya", () => {
    const { name } = labelFromReverse(GAUNIPALLI_Z14, KOTTAHUDYA_Z18);
    expect(name.startsWith("Gaunipalli")).toBe(true);
    expect(name).not.toContain("Kottahudya");
    expect(name).toBe("Gaunipalli, Srinivasapura taluku, Kolar, Karnataka, India");
  });

  test("agrees with the finer level inside a city", () => {
    const { name } = labelFromReverse(ASHOKANAGAR_Z14, ASHOKANAGAR_Z18);
    expect(name.startsWith("Ashokanagar")).toBe(true);
    expect(name).toContain("Bengaluru");
  });

  test("falls back to the fine display_name when the address is empty", () => {
    const { name } = labelFromReverse(
      null,
      { display_name: "Somewhere, India", address: {} },
    );
    expect(name).toBe("Somewhere, India");
  });

  test("falls back to the descriptor when nothing is named", () => {
    const { name } = labelFromReverse(null, null, {
      describeFallback: "North Atlantic Ocean",
    });
    expect(name).toBe("North Atlantic Ocean");
  });

  test("runs the sanitizer over fallbacks", () => {
    const { name } = labelFromReverse(
      null,
      { display_name: "<img src=x>Bad</img>", address: {} },
      { sanitize: (s) => String(s || "").replace(/[<>&]/g, "") },
    );
    expect(name).not.toContain("<");
  });

  test("works with only the coarse response", () => {
    const { name } = labelFromReverse(GAUNIPALLI_Z14, null);
    expect(name.startsWith("Gaunipalli")).toBe(true);
  });
});

describe("reverseUrls", () => {
  test("asks for both zoom levels", () => {
    const { coarse, fine } = reverseUrls(13.5146, 78.2258);
    expect(coarse).toContain("zoom=14");
    expect(fine).toContain("zoom=18");
    expect(coarse).toContain("addressdetails=1");
    expect(fine).toContain("addressdetails=1");
    expect(coarse).toContain("lat=13.5146");
    expect(fine).toContain("lon=78.2258");
  });

  test("encodes the language parameter", () => {
    const { coarse } = reverseUrls(1, 2, "pt-BR");
    expect(coarse).toContain("accept-language=pt-BR");
  });

  test("defaults to English", () => {
    expect(reverseUrls(1, 2).coarse).toContain("accept-language=en");
  });
});