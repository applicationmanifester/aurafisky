import { describe, it, expect } from "vitest";
import {
  cleanBotanicalName,
  resolveIndianFloraName,
  INDIAN_FLORA_DICT,
  INDIAN_GENUS_DICT,
} from "../modules/indianFloraNames.js";
import { fetchLocalPlants } from "../features/farm.js";

describe("Indian Flora Normalization & Localization", () => {
  describe("cleanBotanicalName", () => {
    it("cleans botanical author citations and parentheticals", () => {
      expect(cleanBotanicalName("Ficus hispida L.fil.")).toBe("Ficus hispida");
      expect(cleanBotanicalName("Ficus microcarpa L.fil.")).toBe("Ficus microcarpa");
      expect(cleanBotanicalName("Ficus benghalensis L.")).toBe("Ficus benghalensis");
      expect(cleanBotanicalName("Tectona grandis L.f.")).toBe("Tectona grandis");
      expect(cleanBotanicalName("Zanthoxylum asiaticum (L.) Appelhans, Groppo & Schori")).toBe("Zanthoxylum asiaticum");
      expect(cleanBotanicalName("Kigelia africana (Lam.) Benth.")).toBe("Kigelia africana");
      expect(cleanBotanicalName("Ficus auriculata Lour.")).toBe("Ficus auriculata");
      expect(cleanBotanicalName("Azadirachta indica A.Juss.")).toBe("Azadirachta indica");
      expect(cleanBotanicalName("Ocimum tenuiflorum L.")).toBe("Ocimum tenuiflorum");
    });

    it("handles edge cases gracefully", () => {
      expect(cleanBotanicalName("")).toBe("");
      expect(cleanBotanicalName(null)).toBe("");
      expect(cleanBotanicalName(undefined)).toBe("");
      expect(cleanBotanicalName("Ficus")).toBe("Ficus");
    });
  });

  describe("resolveIndianFloraName in Bengaluru / Karnataka context", () => {
    const karnatakaOpts = {
      lat: 12.9602,
      lng: 77.7060,
      locationName: "Priyadarshini Ward • Bangalore",
    };

    it("resolves Ficus hispida with Kannada vernacular name and Karnataka badge", () => {
      const res = resolveIndianFloraName(
        { scientificName: "Ficus hispida L.fil.", family: "Moraceae" },
        karnatakaOpts,
      );
      expect(res.cleanScientific).toBe("Ficus hispida");
      expect(res.primaryDisplay).toContain("ಕಾಡತ್ತಿ");
      expect(res.regionalBadge).toBe("ಕನ್ನಡ (Karnataka)");
      expect(res.searchKeywords).toContain("kadaththi");
      expect(res.searchKeywords).toContain("kala umbar");
      expect(res.searchKeywords).toContain("ficus hispida");
    });

    it("resolves Ficus benghalensis as Banyan Tree · ಆಲದ ಮರ (Ala Mara)", () => {
      const res = resolveIndianFloraName(
        { scientificName: "Ficus benghalensis L.", family: "Moraceae" },
        karnatakaOpts,
      );
      expect(res.cleanScientific).toBe("Ficus benghalensis");
      expect(res.primaryDisplay).toContain("ಆಲದ ಮರ (Ala Mara)");
      expect(res.regionalBadge).toBe("ಕನ್ನಡ (Karnataka)");
      expect(res.searchKeywords).toContain("ala mara");
      expect(res.searchKeywords).toContain("bargad");
      expect(res.searchKeywords).toContain("banyan");
    });

    it("resolves Tectona grandis (Teak) with Kannada and Hindi local names", () => {
      const res = resolveIndianFloraName(
        { scientificName: "Tectona grandis L.f.", family: "Lamiaceae" },
        karnatakaOpts,
      );
      expect(res.cleanScientific).toBe("Tectona grandis");
      expect(res.primaryDisplay).toContain("ತೇಗದ ಮರ");
      expect(res.searchKeywords).toContain("teak");
      expect(res.searchKeywords).toContain("sagwan");
    });

    it("resolves Zanthoxylum asiaticum with local name", () => {
      const res = resolveIndianFloraName(
        { scientificName: "Zanthoxylum asiaticum (L.) Appelhans, Groppo & Schori", family: "Rutaceae" },
        karnatakaOpts,
      );
      expect(res.cleanScientific).toBe("Zanthoxylum asiaticum");
      expect(res.primaryDisplay).toContain("ಜುಮ್ಮಿನ ಮರ");
      expect(res.searchKeywords).toContain("jummina mara");
    });

    it("resolves Kigelia africana (Sausage tree)", () => {
      const res = resolveIndianFloraName(
        { scientificName: "Kigelia africana (Lam.) Benth.", family: "Bignoniaceae" },
        karnatakaOpts,
      );
      expect(res.cleanScientific).toBe("Kigelia africana");
      expect(res.primaryDisplay).toContain("ಮರ ಸೌತೆ / ಆನೆತೊಂಡೆ");
      expect(res.searchKeywords).toContain("sausage tree");
    });

    it("falls back to genus dictionary when species is unrecognized", () => {
      const res = resolveIndianFloraName(
        { scientificName: "Acacia unknownspecies Wall.", family: "Fabaceae", genus: "Acacia" },
        karnatakaOpts,
      );
      expect(res.primaryDisplay).toContain("ಜಾಲಿ ಮರ");
      expect(res.searchKeywords).toContain("acacia");
    });
  });

  describe("resolveIndianFloraName in other regions", () => {
    it("prioritizes Tamil in Tamil Nadu (Chennai)", () => {
      const chennaiOpts = {
        lat: 13.0827,
        lng: 80.2707,
        locationName: "Chennai, Tamil Nadu",
      };
      const res = resolveIndianFloraName(
        { scientificName: "Azadirachta indica A.Juss.", family: "Meliaceae" },
        chennaiOpts,
      );
      expect(res.primaryDisplay).toContain("வேம்பு (Veppamaram)");
      expect(res.regionalBadge).toBe("தமிழ் (Tamil Nadu)");
      expect(res.searchKeywords).toContain("neem");
      expect(res.searchKeywords).toContain("veppamaram");
    });

    it("uses Hindi / Indian Flora badges for North India (Delhi)", () => {
      const delhiOpts = {
        lat: 28.6139,
        lng: 77.2090,
        locationName: "New Delhi, Delhi",
      };
      const res = resolveIndianFloraName(
        { scientificName: "Azadirachta indica A.Juss.", family: "Meliaceae" },
        delhiOpts,
      );
      expect(res.primaryDisplay).toContain("नीम (Neem)");
      expect(res.regionalBadge).toBe("Indian Flora");
      expect(res.searchKeywords).toContain("neem");
    });
  });
});
