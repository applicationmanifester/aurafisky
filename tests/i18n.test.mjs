import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  t,
  setLocale,
  detectLocale,
  supportedLocales,
  isSupported,
  DICT,
} from "../modules/i18n.js";

describe("Internationalisation (i18n) Engine & Language Support", () => {
  it("supports major world and Indian languages", () => {
    const locales = supportedLocales();
    expect(locales).toContain("en");
    expect(locales).toContain("kn"); // Kannada
    expect(locales).toContain("hi"); // Hindi
    expect(locales).toContain("ta"); // Tamil
    expect(locales).toContain("te"); // Telugu
    expect(locales).toContain("mr"); // Marathi
    expect(locales).toContain("es"); // Spanish
    expect(locales).toContain("fr"); // French
    expect(locales).toContain("de"); // German
    expect(locales).toContain("ja"); // Japanese
    expect(locales).toContain("ar"); // Arabic
    expect(isSupported("kn")).toBe(true);
    expect(isSupported("hi")).toBe(true);
  });

  it("translates weather tabs accurately across languages", () => {
    // English
    expect(t("tab_farm", "en")).toBe("🌾 Farm");
    expect(t("tab_overview", "en")).toBe("Overview");
    expect(t("tab_daily", "en")).toBe("7-Day");

    // Kannada
    expect(t("tab_farm", "kn")).toBe("🌾 ಕೃಷಿ");
    expect(t("tab_overview", "kn")).toBe("ಅವಲೋಕನ");
    expect(t("tab_daily", "kn")).toBe("7 ದಿನಗಳು");

    // Hindi
    expect(t("tab_farm", "hi")).toBe("🌾 कृषि");
    expect(t("tab_overview", "hi")).toBe("अवलोकन");
    expect(t("tab_daily", "hi")).toBe("7-दिन");

    // Spanish
    expect(t("tab_farm", "es")).toBe("🌾 Granja");
    expect(t("tab_overview", "es")).toBe("Visión general");

    // French
    expect(t("tab_farm", "fr")).toBe("🌾 Agriculture");
    expect(t("tab_overview", "fr")).toBe("Vue d'ensemble");

    // German
    expect(t("tab_farm", "de")).toBe("🌾 Bauernhof");
    expect(t("tab_overview", "de")).toBe("Übersicht");

    // Japanese
    expect(t("tab_farm", "ja")).toBe("🌾 農業");
    expect(t("tab_overview", "ja")).toBe("概要");
  });

  it("translates navigation and quick chips", () => {
    // English
    expect(t("nav_home", "en")).toBe("Set Home");
    expect(t("nav_route", "en")).toBe("Route Weather");
    expect(t("nav_favs", "en")).toBe("Favourites");

    // Kannada
    expect(t("nav_home", "kn")).toBe("ಮನೆ ಹೊಂದಿಸಿ");
    expect(t("nav_route", "kn")).toBe("ಮಾರ್ಗ ಹವಾಮಾನ");
    expect(t("nav_favs", "kn")).toBe("ಮೆಚ್ಚಿನವುಗಳು");

    // Hindi
    expect(t("nav_home", "hi")).toBe("होम सेट करें");
    expect(t("nav_route", "hi")).toBe("मार्ग मौसम");
    expect(t("nav_favs", "hi")).toBe("पसंदीदा");
  });

  it("translates Farm section cards and how-to-grow sections", () => {
    // English
    expect(t("farm_how_to_grow", "en")).toBe("How to grow");
    expect(t("farm_sowing", "en")).toBe("Sowing");
    expect(t("farm_irrigation", "en")).toBe("Irrigation");
    expect(t("farm_harvest", "en")).toBe("Harvest");

    // Kannada
    expect(t("farm_how_to_grow", "kn")).toBe("ಬೆಳೆಯುವುದು ಹೇಗೆ");
    expect(t("farm_sowing", "kn")).toBe("ಬಿತ್ತನೆ");
    expect(t("farm_irrigation", "kn")).toBe("ನೀರಾವರಿ");
    expect(t("farm_harvest", "kn")).toBe("ಕೊಯ್ಲು");

    // Hindi
    expect(t("farm_how_to_grow", "hi")).toBe("कैसे उगाएं");
    expect(t("farm_sowing", "hi")).toBe("बुवाई");
    expect(t("farm_irrigation", "hi")).toBe("सिंचाई");
    expect(t("farm_harvest", "hi")).toBe("कटाई");
  });

  it("falls back to English when a key is missing in a specific language", () => {
    expect(t("app_name", "unknown_locale")).toBe("Aurafisky");
  });

  it("verifies settings panel contains App Language dropdown with world and Indian languages", () => {
    const html = readFileSync(resolve(__dirname, "../index.html"), "utf8");
    expect(html).toContain('id="settingsAppLanguageSelect"');
    expect(html).toContain('value="kn"');
    expect(html).toContain('value="hi"');
    expect(html).toContain('value="ta"');
    expect(html).toContain('value="te"');
    expect(html).toContain('value="es"');
    expect(html).toContain('value="fr"');
    expect(html).toContain('value="de"');
    expect(html).toContain('value="ja"');
    expect(html).toContain('value="ar"');
    expect(html).toContain('id="google_translate_element"');
  });
});
