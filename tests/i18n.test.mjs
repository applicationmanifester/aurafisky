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
  translateText,
  translateDOM,
} from "../modules/i18n.js";
import { getWeatherInfo } from "../weather.js";

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
    expect(html).toContain('value="or"'); // Odia
    expect(html).toContain('value="sa"'); // Sanskrit
    expect(html).toContain('value="as"'); // Assamese
    expect(html).toContain('value="zh-TW"'); // Chinese Traditional
    expect(html).toContain('value="ko"'); // Korean
    expect(html).toContain('value="tr"'); // Turkish
    expect(html).toContain('id="google_translate_element"');
  });

  it("translates universal weather card and route phrases via translateText", () => {
    // Buttons & Labels in Kannada
    expect(translateText("Copy", "kn")).toBe("ನಕಲಿಸಿ");
    expect(translateText("Details", "kn")).toBe("ವಿವರಗಳು");
    expect(translateText("Generate Briefing", "kn")).toBe("ಸಂಕ್ಷಿಪ್ತ ವರದಿ ರಚಿಸಿ");
    expect(translateText("Show All (6)", "kn")).toBe("ಎಲ್ಲವನ್ನೂ ತೋರಿಸಿ (6)");
    expect(translateText("Show Less", "kn")).toBe("ಕಡಿಮೆ ತೋರಿಸಿ");
    expect(translateText("Stop 2", "kn")).toBe("ನಿಲುಗಡೆ 2");
    expect(translateText("Earlier", "kn")).toBe("ಮೊದಲು");
    expect(translateText("Remove Stop", "kn")).toBe("ನಿಲುಗಡೆ ತೆಗೆದುಹಾಕಿ");
    expect(translateText("Start Navigation", "kn")).toBe("ನ್ಯಾವಿಗೇಷನ್ ಪ್ರಾರಂಭಿಸಿ");
    expect(translateText("Driving & Road Grip", "kn")).toBe("ಚಾಲನೆ ಮತ್ತು ರಸ್ತೆ ಹಿಡಿತ");
    expect(translateText("Temperature Scale", "kn")).toBe("ತಾಪಮಾನ ಮಾಪಕ");

    // Dynamic patterns in Kannada
    const trustStr = translateText("55% trust (temp 62%, wind 52%, precip 47%)", "kn");
    expect(trustStr).toContain("ವಿಶ್ವಾಸಾರ್ಹತೆ");
    expect(trustStr).toContain("ತಾಪ 62%");

    const arriveStr = translateText("arriving in ~2h from the ENE", "kn");
    expect(arriveStr).toBe("~2 ಗಂಟೆಯಲ್ಲಿ ENE ನಿಂದ ಬರುತ್ತಿದೆ");

    const lwiStr = translateText("LIVE WEATHER INTELLIGENCE • JAKKANAHALLI", "kn");
    expect(lwiStr).toContain("ಲೈವ್ ಹವಾಮಾನ ಮಾಹಿತಿ");
    expect(lwiStr).toContain("JAKKANAHALLI");

    const comfortStr = translateText("Temperature > Humidity > Wind limiting comfort", "kn");
    expect(comfortStr).toContain("ಆರಾಮದಾಯಕತೆಯನ್ನು ಸೀಮಿತಗೊಳಿಸುತ್ತದೆ");
  });

  it("translates DOM tree elements idempotently using translateDOM", () => {
    const container = document.createElement("div");
    container.innerHTML = `
      <div id="cardTitle">Live Intelligence</div>
      <button id="copyBtn" title="Copy coordinates">Copy</button>
      <input id="searchInp" placeholder="Add stop by city, address or landmark..." />
      <span id="scaleLabel">Temperature Scale</span>
    `;

    // Translate to Kannada
    translateDOM(container, "kn");

    expect(container.querySelector("#cardTitle").textContent).toBe("ಲೈವ್ ಮಾಹಿತಿ");
    expect(container.querySelector("#copyBtn").textContent).toBe("ನಕಲಿಸಿ");
    expect(container.querySelector("#copyBtn").getAttribute("title")).toBe("ನಿರ್ದೇಶಾಂಕಗಳನ್ನು ನಕಲಿಸಿ");
    expect(container.querySelector("#searchInp").getAttribute("placeholder")).toBe("ನಗರ, ವಿಳಾಸ ಅಥವಾ ಸ್ಥಳದಿಂದ ನಿಲುಗಡೆ ಸೇರಿಸಿ...");
    expect(container.querySelector("#scaleLabel").textContent).toBe("ತಾಪಮಾನ ಮಾಪಕ");

    // Revert back to English
    translateDOM(container, "en");
    expect(container.querySelector("#cardTitle").textContent).toBe("Live Intelligence");
    expect(container.querySelector("#copyBtn").textContent).toBe("Copy");
    expect(container.querySelector("#searchInp").getAttribute("placeholder")).toBe("Add stop by city, address or landmark...");
    expect(container.querySelector("#scaleLabel").textContent).toBe("Temperature Scale");
  });

  it("translates WMO weather descriptions according to active language", () => {
    const clearDayKn = getWeatherInfo(0, true, "kn");
    expect(clearDayKn.description).toBe("ಸ್ಪಷ್ಟ ಆಕಾಶ");

    const clearDayHi = getWeatherInfo(0, true, "hi");
    expect(clearDayHi.description).toBe("साफ आसमान");

    const thunderKn = getWeatherInfo(95, true, "kn");
    expect(thunderKn.description).toBe("ಗುಡುಗು ಸಹಿತ ಮಳೆ");
  });
});

