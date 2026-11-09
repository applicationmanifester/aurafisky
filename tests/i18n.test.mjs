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

  it("translates all Settings drawer and core UI elements when Chinese (zh-CN) is selected", () => {
    // Settings panel phrases in Simplified Chinese
    expect(translateText("Settings", "zh-CN")).toBe("设置");
    expect(translateText("Units (Metric)", "zh-CN")).toBe("单位 (公制)");
    expect(translateText("Dark mode", "zh-CN")).toBe("深色模式");
    expect(translateText("24h timeline", "zh-CN")).toBe("24小时时间轴");
    expect(translateText("Map style", "zh-CN")).toBe("地图样式");
    expect(translateText("App Language", "zh-CN")).toBe("应用语言");
    expect(translateText("Map language", "zh-CN")).toBe("地图语言");
    expect(translateText("Ambient sounds", "zh-CN")).toBe("环境音效");
    expect(translateText("Sync history", "zh-CN")).toBe("同步历史");
    expect(translateText("Default location", "zh-CN")).toBe("默认位置");
    expect(translateText("Set here", "zh-CN")).toBe("设在此处");
    expect(translateText("Notify on default", "zh-CN")).toBe("在默认位置提醒");

    // Weather, Search & Briefing phrases
    expect(translateText("Search a city...", "zh-CN")).toBe("搜索城市…");
    expect(translateText("Today's briefing", "zh-CN")).toBe("今日简报");
    expect(translateText("TODAY'S BRIEFING", "zh-CN")).toBe("今日简报");
    expect(translateText("Right now", "zh-CN")).toBe("当前天气");
    expect(translateText("Elevation Key", "zh-CN")).toBe("海拔图例");

    // Trust score translations (pure English and mixed partial)
    const trustPure = translateText("55% trust (temp 62%, wind 52%, precip 47%)", "zh-CN");
    expect(trustPure).toBe("🎯 55% 置信度 (温度 62%, 风速 52%, 降水 47%)");

    const trustMixed = translateText("🎯 55% trust (温度 62%, 风速 52%, precipitation 47%)", "zh-CN");
    expect(trustMixed).toBe("🎯 55% 置信度 (温度 62%, 风速 52%, 降水 47%)");
  });

  it("translates Settings panel DOM elements to Chinese and reverts back to English", () => {
    const panel = document.createElement("div");
    panel.innerHTML = `
      <h3>Settings</h3>
      <span id="settingsUnitsLabel">Units (Metric)</span>
      <span id="settingsUnitsSub">°C, km/h, mm</span>
      <span>Dark mode</span>
      <span>24h timeline</span>
      <span>Map style</span>
      <span id="settingsAppLanguageLabel">App Language</span>
      <span id="settingsAppLanguageSub">Translate all features & tabs</span>
      <span>Ambient sounds</span>
      <span>Sync history</span>
      <span>Default location</span>
      <button id="setDefaultLocationBtn">Set here</button>
    `;

    // Translate to Chinese
    translateDOM(panel, "zh-CN");

    expect(panel.querySelector("h3").textContent).toBe("设置");
    expect(panel.querySelector("#settingsUnitsLabel").textContent).toBe("单位 (公制)");
    expect(panel.querySelector("#settingsAppLanguageLabel").textContent).toBe("应用语言");
    expect(panel.querySelector("#settingsAppLanguageSub").textContent).toBe("翻译所有功能与标签页");
    expect(panel.querySelector("#setDefaultLocationBtn").textContent).toBe("设在此处");

    // Revert to English
    translateDOM(panel, "en");
    expect(panel.querySelector("h3").textContent).toBe("Settings");
    expect(panel.querySelector("#settingsUnitsLabel").textContent).toBe("Units (Metric)");
    expect(panel.querySelector("#settingsAppLanguageLabel").textContent).toBe("App Language");
    expect(panel.querySelector("#settingsAppLanguageSub").textContent).toBe("Translate all features & tabs");
    expect(panel.querySelector("#setDefaultLocationBtn").textContent).toBe("Set here");
  });

  it("translates Today at a Glance, Smart To-Dos, Map Key and Freshness into Kannada", () => {
    // Today at a Glance & Emoji-prefixed items
    expect(translateText("Today at a Glance", "kn")).toBe("ಇಂದಿನ ಒಂದು ನೋಟ");
    expect(translateText("TODAY AT A GLANCE", "kn")).toBe("ಇಂದಿನ ಒಂದು ನೋಟ");
    expect(translateText("🌅 Sunrise", "kn")).toBe("🌅 ಸೂರ್ಯೋದಯ");
    expect(translateText("🌇 Sunset", "kn")).toBe("🌇 ಸೂರ್ಯಾಸ್ತ");
    expect(translateText("🌧️ Rain Chance", "kn")).toBe("🌧️ ಮಳೆ ಸಂಭವ");
    expect(translateText("☀️ Max UV", "kn")).toBe("☀️ ಗರಿಷ್ಠ UV");
    expect(translateText("💨 Max Wind", "kn")).toBe("💨 ಗರಿಷ್ಠ ಗಾಳಿ");
    expect(translateText("💧 Precip Total", "kn")).toBe("💧 ಒಟ್ಟು ಮಳೆ");

    // Freshness & Badges
    expect(translateText("Just now", "kn")).toBe("ಈಗಷ್ಟೇ");
    expect(translateText("📡 Just now", "kn")).toBe("📡 ಈಗಷ್ಟೇ");
    expect(translateText("Updated just now", "kn")).toBe("ಈಗಷ್ಟೇ ನವೀಕರಿಸಲಾಗಿದೆ");
    expect(translateText("Forecast updated just now", "kn")).toBe("ಮುನ್ಸೂಚನೆ ನವೀಕರಿಸಲಾಗಿದೆ ಈಗಷ್ಟೇ");
    expect(translateText("5 min ago", "kn")).toBe("5 ನಿಮಿಷಗಳ ಹಿಂದೆ");

    // Smart To-Dos
    expect(translateText("SMART TO-DOS", "kn")).toBe("ಸ್ಮಾರ್ಟ್ ಕಾರ್ಯಗಳು");
    expect(translateText("Smart to-dos", "kn")).toBe("ಸ್ಮಾರ್ಟ್ ಕಾರ್ಯಗಳು");
    expect(translateText("from today's forecast", "kn")).toBe("ಇಂದಿನ ಮುನ್ಸೂಚನೆಯಿಂದ");
    expect(translateText("Good day to wash the car", "kn")).toBe("ಕಾರು ತೊಳೆಯಲು ಉತ್ತಮ ದಿನ");
    expect(translateText("Dry and calm through tomorrow — it will stay clean", "kn")).toBe("ನಾಳೆಯವರೆಗೂ ಒಣ ಮತ್ತು ಶಾಂತ ಹವಾಮಾನ — ಸ್ವಚ್ಛವಾಗಿರುತ್ತದೆ");
    expect(translateText("Carry an umbrella", "kn")).toBe("ಛತ್ರಿ ಜೊತೆಯಲ್ಲಿಡಿ");
    expect(translateText("Sunscreen before you head out", "kn")).toBe("ಹೊರಡುವ ಮುನ್ನ ಸನ್‌ಸ್ಕ್ರೀನ್ ಬಳಸಿ");
    expect(translateText("🔔 Alert me", "kn")).toBe("🔔 ನನಗೆ ತಿಳಿಸಿ");

    // Map Key & Legend
    expect(translateText("Map Key", "kn")).toBe("ನಕ್ಷೆಯ ವಿವರಣೆ");
    expect(translateText("Map Color Legend", "kn")).toBe("ನಕ್ಷೆಯ ವಿವರಣೆ ಮತ್ತು ಸೂಚಿ");
    expect(translateText("Show Live Temperature Grid", "kn")).toBe("ಲೈವ್ ತಾಪಮಾನ ಗ್ರಿಡ್ ತೋರಿಸು");

    // Farm tab patterns
    expect(translateText("Trees (26)", "kn")).toBe("ಮರಗಳು (26)");
    expect(translateText("Wildflowers (8)", "kn")).toBe("ಕಾಡು ಹೂವುಗಳು (8)");
    expect(translateText("92 observed nearby", "kn")).toBe("92 ಸಮೀಪದಲ್ಲಿ ದಾಖಲಾದವು");
    expect(translateText("Sowing:", "kn")).toBe("ಬಿತ್ತನೆ:");
  });

  it("translates weather panel DOM subtrees to Kannada and back to English idempotently", () => {
    const card = document.createElement("div");
    card.innerHTML = `
      <div id="todaySummarySection">
        <h4>Today at a Glance</h4>
        <div>🌅 Sunrise</div>
        <div>🌇 Sunset</div>
        <div>🌧️ Rain Chance</div>
        <div>☀️ Max UV</div>
        <div>💨 Max Wind</div>
        <div>💧 Precip Total</div>
      </div>
      <div id="smartTodosCard">
        <h4>SMART TO-DOS</h4>
        <span>from today's forecast</span>
        <div>Good day to wash the car</div>
        <div>Dry and calm through tomorrow — it will stay clean</div>
        <button>🔔 Alert me</button>
      </div>
      <div id="freshnessLabel">📡 Just now</div>
      <div id="mapLegendPill">Map Key</div>
    `;

    translateDOM(card, "kn");

    expect(card.querySelector("#todaySummarySection h4").textContent).toBe("ಇಂದಿನ ಒಂದು ನೋಟ");
    expect(card.querySelector("#smartTodosCard h4").textContent).toBe("ಸ್ಮಾರ್ಟ್ ಕಾರ್ಯಗಳು");
    expect(card.querySelector("#smartTodosCard span").textContent).toBe("ಇಂದಿನ ಮುನ್ಸೂಚನೆಯಿಂದ");
    expect(card.querySelector("#freshnessLabel").textContent).toBe("📡 ಈಗಷ್ಟೇ");
    expect(card.querySelector("#mapLegendPill").textContent).toBe("ನಕ್ಷೆಯ ವಿವರಣೆ");

    // Revert back
    translateDOM(card, "en");
    expect(card.querySelector("#todaySummarySection h4").textContent).toBe("Today at a Glance");
    expect(card.querySelector("#smartTodosCard h4").textContent).toBe("SMART TO-DOS");
    expect(card.querySelector("#smartTodosCard span").textContent).toBe("from today's forecast");
    expect(card.querySelector("#freshnessLabel").textContent).toBe("📡 Just now");
    expect(card.querySelector("#mapLegendPill").textContent).toBe("Map Key");
  });
});

