import { describe, it, expect, beforeEach } from "vitest";
import {
  HIGHWAY_DATABASE,
  detectHighway,
  traceHighwayOnMap,
  clearHighwayTrace,
  init
} from "../features/highwayInspector.js";

describe("Interactive Highway Inspector", () => {
  it("has complete metadata for major national highways and expressways", () => {
    expect(HIGHWAY_DATABASE.NH48).toBeDefined();
    expect(HIGHWAY_DATABASE.NH48.origin).toContain("Delhi");
    expect(HIGHWAY_DATABASE.NH48.destination).toContain("Chennai");
    expect(HIGHWAY_DATABASE.NH48.lengthKm).toBeGreaterThan(2500);
    expect(HIGHWAY_DATABASE.NH48.waypoints.length).toBeGreaterThan(15);

    expect(HIGHWAY_DATABASE.NH44).toBeDefined();
    expect(HIGHWAY_DATABASE.NH44.origin).toContain("Srinagar");
    expect(HIGHWAY_DATABASE.NH44.destination).toContain("Kanyakumari");
    expect(HIGHWAY_DATABASE.NH44.lengthKm).toBeGreaterThan(3500);

    expect(HIGHWAY_DATABASE.NH16).toBeDefined();
    expect(HIGHWAY_DATABASE.NH66).toBeDefined();
    expect(HIGHWAY_DATABASE.MPE).toBeDefined();
  });

  it("detects NH 48 from address containing road name 'NH48'", () => {
    const res = detectHighway({ road: "NH48", state: "Tamil Nadu" });
    expect(res).not.toBeNull();
    expect(res.id).toBe("NH48");
    expect(res.origin).toContain("Delhi");
    expect(res.destination).toContain("Chennai");
  });

  it("detects NH 48 from text string 'National Highway 48'", () => {
    const res = detectHighway("Bengaluru to Chennai via National Highway 48");
    expect(res).not.toBeNull();
    expect(res.id).toBe("NH48");
  });

  it("detects NH 44 from text string 'NH-44'", () => {
    const res = detectHighway("Near Salem on NH-44 corridor");
    expect(res).not.toBeNull();
    expect(res.id).toBe("NH44");
    expect(res.origin).toContain("Srinagar");
    expect(res.destination).toContain("Kanyakumari");
  });

  it("computes relative position along highway for given coordinates", () => {
    // Krishnagiri coordinates near NH 48
    const lat = 12.5186;
    const lng = 78.2137;
    const res = detectHighway("NH 48 near Krishnagiri", lat, lng);
    expect(res).not.toBeNull();
    expect(res.relativeInfo).toBeDefined();
    expect(res.relativeInfo.nearestCity).toBe("Krishnagiri");
    expect(res.relativeInfo.approxKmFromOrigin).toBeGreaterThan(2000);
    expect(res.relativeInfo.approxKmToDestination).toBeLessThan(500);
  });

  it("detects highway via spatial proximity when coordinates are within range", () => {
    // Hosur coordinates on NH 48
    const lat = 12.7409;
    const lng = 77.8253;
    const res = detectHighway(null, lat, lng);
    expect(res).not.toBeNull();
    expect(res.id).toBe("NH48");
    expect(res.relativeInfo.nearestCity).toBe("Hosur");
  });

  it("returns null for non-highway locations far from any corridor", () => {
    // Middle of Indian Ocean
    const res = detectHighway("Ocean", -10.0, 75.0);
    expect(res).toBeNull();
  });

  it("returns null for rural/interior village locations like Pachgaon", () => {
    // Pachgaon, Rajura Taluka, Maharashtra (19.7082°N, 79.2668°E)
    const pachgaonAddress = {
      hamlet: "Golkarguda",
      village: "Pachgaon",
      county: "Rajura Taluka",
      state_district: "Chandrapur",
      state: "Maharashtra"
    };
    const res = detectHighway(pachgaonAddress, 19.7082, 79.2668);
    expect(res).toBeNull();
  });

  it("dynamically detects regional state highways or uncataloged highways", () => {
    const shAddress = {
      road: "State Highway 233",
      ref: "SH 233",
      highway: "primary",
      state: "Maharashtra"
    };
    const res = detectHighway(shAddress, 19.8, 79.3);
    expect(res).not.toBeNull();
    expect(res.ref).toBe("SH 233");
    expect(res.isDynamic).toBe(true);
  });
});

