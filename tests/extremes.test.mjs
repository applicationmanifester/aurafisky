import { describe, it, expect } from "vitest";
import {
  EXTREME_STATIONS,
  SURF_EXTREME_STATIONS,
  _extremeCardHtml,
} from "../features/extremes.js";

describe("Explore Extremes Station Network & Quality Guards", () => {
  it("contains balanced global stations across Northern and Southern hemispheres", () => {
    const southStations = EXTREME_STATIONS.filter((s) => s.lat < 0);
    const northStations = EXTREME_STATIONS.filter((s) => s.lat > 0);

    expect(southStations.length).toBeGreaterThanOrEqual(5);
    expect(northStations.length).toBeGreaterThanOrEqual(10);
  });

  it("includes Southern hemisphere and equatorial year-round heat poles to prevent winter diurnal anomalies", () => {
    const heatPoles = [
      "Marble Bar, Australia",
      "Oodnadatta, Australia",
      "Dallol, Ethiopia",
      "Death Valley, USA",
      "Dasht-e Lut, Iran",
      "Bilma, Niger",
      "Upington, South Africa",
      "Las Lomitas, Argentina",
      "Lodwar, Kenya",
      "Mecca, Saudi Arabia",
    ];

    heatPoles.forEach((name) => {
      const station = EXTREME_STATIONS.find((s) => s.name === name);
      expect(station, `Expected station ${name} in EXTREME_STATIONS`).toBeDefined();
      expect(typeof station.lat).toBe("number");
      expect(typeof station.lng).toBe("number");
      expect(station.note).toBeTruthy();
    });
  });

  it("includes world-class cold poles in Antarctica, Siberia, and Greenland", () => {
    const coldPoles = [
      "Vostok Station, Antarctica",
      "Dome C, Antarctica",
      "Oymyakon, Russia",
      "Verkhoyansk, Russia",
      "Summit Camp, Greenland",
      "Denali Summit, USA",
    ];

    coldPoles.forEach((name) => {
      const station = EXTREME_STATIONS.find((s) => s.name === name);
      expect(station, `Expected station ${name} in EXTREME_STATIONS`).toBeDefined();
    });
  });

  it("includes top global ocean surf and swell stations", () => {
    const surfBreaks = ["Nazaré, Portugal", "Teahupo'o, French Polynesia", "Jaws (Peʻahi), Hawaii"];
    surfBreaks.forEach((name) => {
      const breakPt = SURF_EXTREME_STATIONS.find((s) => s.name === name);
      expect(breakPt, `Expected surf break ${name}`).toBeDefined();
    });
  });

  it("renders extreme cards with notes, proper icons, and escaped HTML attributes", () => {
    const station = {
      name: 'Marble Bar, "Pilbara" Australia',
      lat: -21.17,
      lng: 119.75,
      note: "Pilbara heat pole · World record 160-day heatwave",
    };
    const html = _extremeCardHtml("hottest", "🔥", "Hottest tracked", station, "41°C", station.note);

    expect(html).toContain("data-kind=\"hottest\"");
    expect(html).toContain("data-lat=\"-21.17\"");
    expect(html).toContain("data-lng=\"119.75\"");
    expect(html).toContain("&quot;Pilbara&quot;");
    expect(html).toContain("41°C");
    expect(html).toContain("Pilbara heat pole · World record 160-day heatwave");
  });
});
