import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  t,
  setLocale,
  detectLocale,
  supportedLocales,
  isSupported,
  loadLocale,
  DICT,
  translateText,
  translateDOM,
} from "../modules/i18n.js";
import { getWeatherInfo } from "../weather.js";

describe("Internationalisation (i18n) Engine & Language Support", () => {
  beforeAll(async () => {
    await Promise.all(supportedLocales().map((loc) => loadLocale(loc)));
  });
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
    expect(html).not.toContain('id="google_translate_element"');
    expect(html).not.toContain('translate.google.com/translate_a/element.js');
    const appCode = readFileSync(resolve(__dirname, "../app.js"), "utf8");
    const i18nCode = readFileSync(resolve(__dirname, "../modules/i18n.js"), "utf8");
    expect(appCode).not.toContain('translate.google.com/translate_a/element.js');
    expect(appCode).not.toContain('.goog-te-combo');
    expect(i18nCode).not.toContain('.goog-te-combo');
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

  it("translates all Astronomy tab stars, constellations, badges and directions across languages", () => {
    // Kannada
    expect(translateText("Sirius", "kn")).toBe("ಸಿರಿಯಸ್ (ಲುಬ್ಧಕ)");
    expect(translateText("Vega", "kn")).toBe("ವೇಗಾ (ಅಭಿಜಿತ್)");
    expect(translateText("Canis Major", "kn")).toBe("ಕ್ಯಾನಿಸ್ ಮೇಜರ್ (ಮಹಾಶ್ವಾನ)");
    expect(translateText("Orion", "kn")).toBe("ಓರಿಯನ್ (ಮೃಗಶಿರ)");
    expect(translateText("Visible", "kn")).toBe("ಗೋಚರ");
    expect(translateText("Set", "kn")).toBe("ಅಸ್ತ");
    expect(translateText("4 visible", "kn")).toBe("4 ಗೋಚರಿಸುತ್ತವೆ");
    expect(translateText("Alt: 39°", "kn")).toBe("ಎತ್ತರ: 39°");
    expect(translateText("SE (39°)", "kn")).toBe("ಆಗ್ನೇಯ (39°)");

    // Chinese (zh-CN)
    expect(translateText("Sirius", "zh-CN")).toBe("天狼星");
    expect(translateText("Vega", "zh-CN")).toBe("织女一");
    expect(translateText("Canis Major", "zh-CN")).toBe("大犬座");
    expect(translateText("Visible", "zh-CN")).toBe("可见");
    expect(translateText("Set", "zh-CN")).toBe("已落下");
    expect(translateText("4 visible", "zh-CN")).toBe("4 颗可见");
    expect(translateText("Alt: 39°", "zh-CN")).toBe("仰角: 39°");
    expect(translateText("SE (39°)", "zh-CN")).toBe("东南 (39°)");

    // Hindi (hi)
    expect(translateText("Sirius", "hi")).toBe("सीरियस (व्याध)");
    expect(translateText("Visible", "hi")).toBe("दृश्यमान");
    expect(translateText("Set", "hi")).toBe("अस्त");
    expect(translateText("4 visible", "hi")).toBe("4 दृश्य");

    // Astronomy card DOM translation
    const astroCard = document.createElement("div");
    astroCard.innerHTML = `
      <span id="starName">Sirius</span>
      <span id="starConst">Canis Major</span>
      <span id="starStatus">Visible</span>
      <span id="badge">4 visible</span>
    `;
    translateDOM(astroCard, "kn");
    expect(astroCard.querySelector("#starName").textContent).toBe("ಸಿರಿಯಸ್ (ಲುಬ್ಧಕ)");
    expect(astroCard.querySelector("#starConst").textContent).toBe("ಕ್ಯಾನಿಸ್ ಮೇಜರ್ (ಮಹಾಶ್ವಾನ)");
    expect(astroCard.querySelector("#starStatus").textContent).toBe("ಗೋಚರ");
    expect(astroCard.querySelector("#badge").textContent).toBe("4 ಗೋಚರಿಸುತ್ತವೆ");

    // Revert to English
    translateDOM(astroCard, "en");
    expect(astroCard.querySelector("#starName").textContent).toBe("Sirius");
    expect(astroCard.querySelector("#starConst").textContent).toBe("Canis Major");
    expect(astroCard.querySelector("#starStatus").textContent).toBe("Visible");
  });

  it("translates all Farm tab crops, categories, sowing schedules and advice across languages", () => {
    // Kannada
    expect(translateText("Alfalfa (Lucerne)", "kn")).toBe("ಕುದುರೆ ಮೆಂತ್ಯ (ಲುಸರ್ನ್)");
    expect(translateText("Finger Millet (Ragi)", "kn")).toBe("ರಾಗಿ");
    expect(translateText("Cabbage", "kn")).toBe("ಎಲೆಕೋಸು");
    expect(translateText("Green Peas", "kn")).toBe("ಹಸಿರು ಬಟಾಣಿ");
    expect(translateText("Spinach", "kn")).toBe("ಪಾಲಕ್");
    expect(translateText("Cover & Forage", "kn")).toBe("ಹೊದಿಕೆ ಮತ್ತು ಮೇವು");
    expect(translateText("Cereal", "kn")).toBe("ಧಾನ್ಯ");
    expect(translateText("Pulse", "kn")).toBe("ದ್ವಿದಳ ಧಾನ್ಯ / ಬೇಳೆಕಾಳು");
    expect(translateText("Vegetable", "kn")).toBe("ತರಕಾರಿ");
    expect(translateText("· sow Sep-Oct-Nov · ~80 days", "kn")).toBe("· ಬಿತ್ತನೆ ಸೆಪ್ಟೆ-ಅಕ್ಟೋ-ನವೆಂ · ~80 ದಿನಗಳು");
    expect(translateText("Next window in ~7 months · sow Jun-Jul-Sep-Oct · ~110 days", "kn")).toBe("⏳ ಮುಂದಿನ ಬಿತ್ತನೆ ~7 ತಿಂಗಳಲ್ಲಿ · ಬಿತ್ತನೆ ಜೂನ್-ಜುಲೈ-ಸೆಪ್ಟೆ-ಅಕ್ಟೋ · ~110 ದಿನಗಳು");
    expect(translateText("Sow now", "kn")).toBe("ಈಗ ಬಿತ್ತಿ");
    expect(translateText("High water", "kn")).toBe("ಹೆಚ್ಚು ನೀರು");
    expect(translateText("frost limit", "kn")).toBe("ಹಿಮ ಮಿತಿ");

    // Chinese (zh-CN)
    expect(translateText("Finger Millet (Ragi)", "zh-CN")).toBe("䅟子 (龙爪稷)");
    expect(translateText("Cover & Forage", "zh-CN")).toBe("覆盖与饲料");
    expect(translateText("Cereal", "zh-CN")).toBe("谷物");
    expect(translateText("· sow Sep-Oct-Nov · ~80 days", "zh-CN")).toBe("· 播种期 9月-10月-11月 · ~80 天");
    expect(translateText("Sow now", "zh-CN")).toBe("适时播种");

    // Farm card DOM translation
    const farmCard = document.createElement("div");
    farmCard.innerHTML = `
      <span id="cropName">Finger Millet (Ragi)</span>
      <span id="cropCat">Cereal</span>
      <div id="cropTiming">· sow Sep-Oct-Nov · ~80 days</div>
      <span id="whereHeader">Where</span>
      <span id="needsHeader">Needs</span>
      <span id="howHeader">How to grow</span>
    `;
    translateDOM(farmCard, "kn");
    expect(farmCard.querySelector("#cropName").textContent).toBe("ರಾಗಿ");
    expect(farmCard.querySelector("#cropCat").textContent).toBe("ಧಾನ್ಯ");
    expect(farmCard.querySelector("#cropTiming").textContent).toBe("· ಬಿತ್ತನೆ ಸೆಪ್ಟೆ-ಅಕ್ಟೋ-ನವೆಂ · ~80 ದಿನಗಳು");
    expect(farmCard.querySelector("#howHeader").textContent).toBe("ಬೆಳೆಯುವುದು ಹೇಗೆ");

    // Revert to English
    translateDOM(farmCard, "en");
    expect(farmCard.querySelector("#cropName").textContent).toBe("Finger Millet (Ragi)");
    expect(farmCard.querySelector("#cropCat").textContent).toBe("Cereal");
    expect(farmCard.querySelector("#cropTiming").textContent).toBe("· sow Sep-Oct-Nov · ~80 days");
    expect(farmCard.querySelector("#howHeader").textContent).toBe("How to grow");
  });

  it("verifies all 41 languages are fully supported with complete dictionary coverage", () => {
    const locales = supportedLocales();
    expect(locales.length).toBe(41);
    expect(Object.keys(DICT).length).toBe(41);

    // Verify key core dictionary keys exist for every single language
    const sampleKeys = ["tab_overview", "tab_farm", "tab_astronomy", "nav_home", "nav_route", "settings_title", "farm_how_to_grow"];
    for (const loc of locales) {
      for (const k of sampleKeys) {
        expect(DICT[loc][k]).toBeDefined();
        expect(DICT[loc][k].length).toBeGreaterThan(0);
      }
    }
  });

  it("translates Astronomy and Farm domain terms across Marathi, Tamil, Telugu, Bengali, French, and German", () => {
    // Marathi (mr)
    expect(translateText("Sirius", "mr")).toBe("सिरियस");
    expect(translateText("Canis Major", "mr")).toBe("कॅनिस मेजर");
    expect(translateText("Alfalfa (Lucerne)", "mr")).toBe("अल्फाल्फा (ल्युसर्न)");
    expect(translateText("Finger Millet (Ragi)", "mr")).toBe("फिंगर बाजरी (नाचणी)");
    expect(translateText("Cover & Forage", "mr")).toBe("कव्हर आणि चारा");

    // Tamil (ta)
    expect(translateText("Sirius", "ta")).toBe("சிரியஸ்");
    expect(translateText("Finger Millet (Ragi)", "ta")).toBe("ஃபிங்கர் தினை (ராகி)");
    expect(translateText("Cabbage", "ta")).toBe("முட்டைக்கோஸ்");
    expect(translateText("Pulse", "ta")).toBe("பருப்பு வகை");

    // Telugu (te)
    expect(translateText("Sirius", "te")).toBe("సిరియస్");
    expect(translateText("Finger Millet (Ragi)", "te")).toBe("ఫింగర్ మిల్లెట్ (రాగి)");
    expect(translateText("Green Peas", "te")).toBe("పచ్చి బఠానీలు");
    expect(translateText("Cereal", "te")).toBe("తృణధాన్యాలు");

    // Bengali (bn)
    expect(translateText("Sirius", "bn")).toBe("সিরিয়াস");
    expect(translateText("Cabbage", "bn")).toBe("বাঁধাকপি");
    expect(translateText("Vegetable", "bn")).toBe("সবজি");

    // French (fr)
    expect(translateText("Sirius", "fr")).toBe("Sirius");
    expect(translateText("Canis Major", "fr")).toBe("Grand Chien");
    expect(translateText("Cover & Forage", "fr")).toBe("Couverture et fourrage");
    expect(translateText("Cereal", "fr")).toBe("Céréales");

    // German (de)
    expect(translateText("Sirius", "de")).toBe("Sirius");
    expect(translateText("Canis Major", "de")).toBe("Großer Hund");
    expect(translateText("Cover & Forage", "de")).toBe("Deckung und Futter");
    expect(translateText("Cereal", "de")).toBe("Getreide");
  });

  it("translates dynamic sowing schedule templates across diverse languages", () => {
    // Marathi
    const sowMr = translateText("· sow Mar-Apr-Sep-Oct-Nov · ~70 days", "mr");
    expect(sowMr).toContain("पेरणे");
    expect(sowMr).toContain("दिवस");

    // Tamil
    const sowTa = translateText("· sow Mar-Apr-Sep-Oct-Nov · ~70 days", "ta");
    expect(sowTa).toContain("விதைக்க");
    expect(sowTa).toContain("நாட்கள்");

    // Telugu
    const sowTe = translateText("· sow Mar-Apr-Sep-Oct-Nov · ~70 days", "te");
    expect(sowTe).toContain("విత్తండి");
    expect(sowTe).toContain("రోజులు");

    // French
    const sowFr = translateText("· sow Mar-Apr-Sep-Oct-Nov · ~70 days", "fr");
    expect(sowFr).toContain("semer");
    expect(sowFr).toContain("jours");

    // German
    const sowDe = translateText("· sow Mar-Apr-Sep-Oct-Nov · ~70 days", "de");
    expect(sowDe).toContain("säen");
    expect(sowDe).toContain("Tage");
  });

  it("verifies 100% Gujarati translation without English leakage for all user screenshot elements", () => {
    // Top Bar & Controls
    expect(translateText("Search a city...", "gu")).toBe("શહેર અથવા સ્થળ શોધો…");
    expect(translateText("Search a city…", "gu")).toBe("શહેર અથવા સ્થળ શોધો…");
    expect(translateText("Ask Aura", "gu")).toBe("ઓરાને પૂછો");
    expect(translateText("Rain Radar", "gu")).toBe("વરસાદ રડાર");
    expect(translateText("Plan a route", "gu")).toBe("રૂટ હવામાન");
    expect(translateText("Set Home", "gu")).toBe("ઘર સેટ કરો");

    // Weather Card Meta & Freshness
    expect(translateText("Just now", "gu")).toBe("હમણાં જ");
    expect(translateText("📡 Just now", "gu")).toBe("📡 હમણાં જ");
    expect(translateText("Copy", "gu")).toBe("કૉપિ કરો");
    expect(translateText("Details", "gu")).toBe("વિગતો");
    const trustPure = translateText("55% trust (temp 62%, wind 52%, precip 47%)", "gu");
    expect(trustPure).toContain("વિશ્વસનીયતા");
    expect(trustPure).toContain("તાપમાન");
    expect(trustPure).toContain("પવન");
    expect(trustPure).toContain("વરસાદ");
    const trustMixed = translateText("🎯 55% trust (તાપમાન 62%, Wind 52%, Precipitation 47%)", "gu");
    expect(trustMixed).toContain("વિશ્વસનીયતા");
    expect(trustMixed).toContain("તાપમાન");
    expect(trustMixed).toContain("પવન");
    expect(trustMixed).toContain("વરસાદ");

    // Weather Tabs
    expect(translateText("Overview", "gu")).toBe("ઝાંખી");
    expect(translateText("Hourly", "gu")).toBe("કલાકદીઠ");
    expect(translateText("7-Day", "gu")).toBe("૭ દિવસ");
    expect(translateText("Details & AQI", "gu")).toBe("વિગતો અને AQI");
    expect(translateText("Astronomy", "gu")).toBe("ખગોળશાસ્ત્ર");
    expect(translateText("🌾 Farm", "gu")).toBe("🌾 ખેતી");

    // Today's Briefing Card
    expect(translateText("TODAY'S BRIEFING", "gu")).toBe("આજનો સારાંશ");
    expect(translateText("Today's briefing", "gu")).toBe("આજનો સારાંશ");
    const headline = translateText("Rain expected around 2:00 PM — keep the umbrella handy.", "gu");
    expect(headline).toContain("વરસાદની શક્યતા");
    expect(headline).toContain("છત્રી");

    const bestTime = translateText("Best time to be outside: 7:00 PM–9:00 AM overnight.", "gu");
    expect(bestTime).toContain("બહાર રહેવા માટે શ્રેષ્ઠ સમય");
    expect(bestTime).toContain("રાતોરાત");

    const nowDrizzle = translateText("Right now Light drizzle · 29° (feels 33°)", "gu");
    expect(nowDrizzle).toContain("અત્યારે");
    expect(nowDrizzle).toContain("હળવી ઝરમર");
    expect(nowDrizzle).toContain("અનુભવાય છે");

    const rangeStr = translateText("Today's range 23° - 31°", "gu");
    expect(rangeStr).toContain("આજનું તાપમાન");

    const rain6h = translateText("Rain 61% chance within 6 hours — plan around it", "gu");
    expect(rain6h).toContain("વરસાદ");
    expect(rain6h).toContain("6 કલાકમાં શક્યતા");

    const rain24h = translateText("Rain 33% peak over 24h — low concern", "gu");
    expect(rain24h).toContain("વરસાદ");
    expect(rain24h).toContain("24 કલાકમાં ટોચ");

    const bestOut = translateText("Best outdoor window 11:00 PM - 12:00 PM (overnight) (14h)", "gu");
    expect(bestOut).toContain("બહાર જવા માટે શ્રેષ્ઠ સમય");
    expect(bestOut).toContain("રાતોરાત");

    const daylight = translateText("Daylight 6:10 AM - 5:54 PM", "gu");
    expect(daylight).toContain("દિવસનો પ્રકાશ");

    const footer = translateText("Generated from your live forecast — regenerated once a day.", "gu");
    expect(footer).toContain("લાઈવ પૂર્વાનુમાનમાંથી જનરેટ કરેલ");

    // Map Keys & Legends
    expect(translateText("Map Key", "gu")).toBe("નકશાની સંજ્ઞા સૂચિ");
    expect(translateText("Elevation Key", "gu")).toBe("ઊંચાઈની સંજ્ઞા સૂચિ");
    expect(translateText("Temperature Scale", "gu")).toBe("તાપમાન સ્કેલ");

    // Farm & Local Plants
    expect(translateText("Local Plants & Wild Flora (GBIF)", "gu")).toBe("સ્થાનિક છોડ અને જંગલી વનસ્પતિ (GBIF)");
    expect(translateText("92 observed nearby", "gu")).toBe("92 નજીકમાં જોવા મળ્યા");
    expect(translateText("Trees (26)", "gu")).toBe("વૃક્ષો (26)");
    expect(translateText("Wildflowers (8)", "gu")).toBe("જંગલી ફૂલો (8)");
    expect(translateText("Herbs (7)", "gu")).toBe("જડીબુટ્ટીઓ (7)");
    expect(translateText("Search local plants, trees, herbs...", "gu")).toBe("સ્થાનિક છોડ, વૃક્ષો, જડીબુટ્ટીઓ શોધો...");
    expect(translateText("Observed within ~25 km. Shows what naturally survives here.", "gu")).toContain("~25 કિમીની અંદર");
    expect(translateText("Show fewer", "gu")).toBe("ઓછા બતાવો");
  });

  it("verifies 100% Chinese translation without English leakage for all user screenshot elements", () => {
    // Settings Drawer
    expect(translateText("Units (Metric)", "zh-CN")).toBe("单位 (公制)");
    expect(translateText("Dark mode", "zh-CN")).toBe("深色模式");
    expect(translateText("24h timeline", "zh-CN")).toBe("24小时时间轴");
    expect(translateText("Map style", "zh-CN")).toBe("地图样式");
    expect(translateText("App Language", "zh-CN")).toBe("应用语言");
    expect(translateText("Translate all features & tabs", "zh-CN")).toBe("翻译所有功能与标签页");
    expect(translateText("Map language", "zh-CN")).toBe("地图语言");
    expect(translateText("Ambient sounds", "zh-CN")).toBe("环境音效");
    expect(translateText("Sync history", "zh-CN")).toBe("同步历史");
    expect(translateText("Default location", "zh-CN")).toBe("默认位置");
    expect(translateText("Set here", "zh-CN")).toBe("设在此处");

    // Weather Panel
    expect(translateText("Search a city...", "zh-CN")).toBe("搜索城市…");
    expect(translateText("Elevation Key", "zh-CN")).toBe("海拔图例");
    expect(translateText("Map Key", "zh-CN")).toBe("地图图例");
    expect(translateText("TODAY'S BRIEFING", "zh-CN")).toBe("今日简报");

    const bestTime = translateText("Best time to be outside: 7:00 PM–9:00 AM overnight.", "zh-CN");
    expect(bestTime).toContain("最佳户外时间");
    expect(bestTime).toContain("通宵");

    const rainPeak = translateText("Rain 33% peak over 24h — low concern", "zh-CN");
    expect(rainPeak).toContain("降雨");
    expect(rainPeak).toContain("24小时内峰值");

    const bestOut = translateText("Best outdoor window 7:00 PM – 9:00 AM (overnight) (15h)", "zh-CN");
    expect(bestOut).toContain("最佳户外时段");
    expect(bestOut).toContain("通宵");

    const daylight = translateText("Daylight 6:12 AM – 6:09 PM", "zh-CN");
    expect(daylight).toContain("日照时段");

    const footer = translateText("Generated from your live forecast — regenerated once a day.", "zh-CN");
    expect(footer).toContain("根据实时预报生成");
  });

  it("translates Settings default-location, Home dropdown, offline badge, and address-card labels across languages", () => {
    const keys = [
      "(local)",
      "Not set",
      "Select a place first",
      "Area / Locality",
      "Taluk / Tehsil",
      "District",
      "State / Province",
      "Coordinates (Lat, Long)",
      "Local Time & Timezone",
      "Full Address",
      "Hide Details",
      "Resolving address...",
      "Resolving address details...",
      "Cached",
    ];
    for (const lang of ["kn", "hi", "gu", "zh-CN"]) {
      for (const key of keys) {
        const translated = translateText(key, lang);
        expect(translated, `${lang}:${key}`).toBeTruthy();
        expect(translated, `${lang}:${key}`).not.toBe(key);
      }
    }
    expect(translateText("(local)", "en")).toBe("(local)");
    expect(translateText("(local)", "fr")).toBeTruthy();
    for (const key of ["Not set", "Select a place first", "Area / Locality", "State / Province", "Full Address", "Hide Details", "Resolving address..."]) {
      const frVal = translateText(key, "fr");
      expect(frVal, `fr:${key}`).toBeTruthy();
      expect(frVal, `fr:${key}`).not.toBe(key);
    }
  });

  it("allows translateAsync to translate non-ASCII strings back to English and joins segments", async () => {
    const { translateAsync } = await import("../modules/i18n.js");
    const origFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = async (url) => {
      called = true;
      expect(String(url)).toContain("tl=en");
      return {
        ok: true,
        json: async () => [[
          ["Yalduru, ", "ಯಲ್ಲೂರು, "],
          ["Srinivaspur Taluk, Kolar, Karnataka, India", "ಶ್ರೀನಿವಾಸಪುರ ತಾಲೂಕು, ಕೋಲಾರ ಜಿಲ್ಲೆ, ಕರ್ನಾಟಕ, ಭಾರತ"],
        ]],
      };
    };
    try {
      const result = await translateAsync(
        "ಯಲ್ಲೂರು, ಶ್ರೀನಿವಾಸಪುರ ತಾಲೂಕು, ಕೋಲಾರ ಜಿಲ್ಲೆ, ಕರ್ನಾಟಕ, ಭಾರತ",
        "en",
      );
      expect(called).toBe(true);
      expect(result).toBe("Yalduru, Srinivaspur Taluk, Kolar, Karnataka, India");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("falls back to secondary translate endpoint when primary dict-chrome-ex returns HTTP 429", async () => {
    const { translateAsync } = await import("../modules/i18n.js");
    const origFetch = globalThis.fetch;
    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes("/translate_a/single?client=dict-chrome-ex")) {
        return { ok: false, status: 429 };
      }
      return {
        ok: true,
        status: 200,
        json: async () => [[["यल्दुरु", "Yalduru"]]],
      };
    };
    try {
      const result = await translateAsync("Yalduru", "hi");
      expect(urls.length).toBe(2);
      expect(urls[0]).toContain("/translate_a/single?client=dict-chrome-ex");
      expect(urls[1]).toContain("/translate_a/t?client=dict-chrome-ex");
      expect(result).toBe("यल्दुरु");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("normalizes Prettier-wrapped HTML whitespace before offline dictionary lookup", () => {
    expect(translateText("Map\n          Mode", "kn")).toBe("ನಕ್ಷೆ ಮೋಡ್");
    expect(translateText("  Map\n          Mode ", "kn")).toBe("  ನಕ್ಷೆ ಮೋಡ್ ");

    const expectedOpacity = translateText("Map Opacity", "kn");
    expect(expectedOpacity).not.toBe("Map Opacity");
    expect(translateText("\n  Map\n            Opacity", "kn")).toBe(
      `\n  ${expectedOpacity}`
    );
  });

  it("deduplicates concurrent translateAsync lookups and stops endpoint probing on network error", async () => {
    const { translateAsync } = await import("../modules/i18n.js");
    const origFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new TypeError("Failed to fetch");
    };
    try {
      const [a, b] = await Promise.all([
        translateAsync("Unique Uncached Phrase XYZ", "te"),
        translateAsync("Unique Uncached Phrase XYZ", "te"),
      ]);
      expect(calls).toBe(1);
      expect(a).toBe("Unique Uncached Phrase XYZ");
      expect(b).toBe("Unique Uncached Phrase XYZ");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("stamps and cleans lang attribute on dynamically translated DOM elements", () => {
    const box = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = "App Language";
    box.appendChild(label);
    document.body.appendChild(box);

    try {
      setLocale("kn");
      translateDOM(box, "kn");
      expect(label.getAttribute("lang")).toBe("kn");

      setLocale("en");
      translateDOM(box, "en");
      expect(label.textContent).toBe("App Language");
      expect(label.getAttribute("lang")).toBeNull();
    } finally {
      setLocale("en");
      box.remove();
    }
  });

  it("ignores localized timestamps/units in hasTranslatableText and translates address/sync UI phrases offline", async () => {
    const { hasTranslatableText } = await import("../modules/i18n.js");
    expect(hasTranslatableText("🕒 ಬುಧ, 11 ನವೆಂ · 7:42 PM · GMT+7")).toBe(false);
    expect(hasTranslatableText("ಬುಧ, 11 ನವೆಂ · 12:42 PM")).toBe(false);
    expect(hasTranslatableText("12 km/h")).toBe(false);
    expect(hasTranslatableText("0.00 mm")).toBe(false);
    expect(hasTranslatableText("+30m: 0.00 mm (3% ಸಾಧ್ಯತೆ)")).toBe(false);
    expect(hasTranslatableText("Location address details")).toBe(true);
    expect(hasTranslatableText("Hodh Ech Chargui")).toBe(true);

    expect(translateText("Location address details", "kn")).toBe("ಸ್ಥಳದ ವಿಳಾಸದ ವಿವರಗಳು");
    expect(translateText("Location sync", "kn")).toBe("ಸ್ಥಳ ಸಿಂಕ್");
    expect(translateText("Default (None)", "kn")).toBe("ಡೀಫಾಲ್ಟ್ (ಯಾವುದೂ ಇಲ್ಲ)");
    expect(translateText("chance", "kn")).toBe("ಸಾಧ್ಯತೆ");
    expect(translateText("Temp", "kn")).toBe("ತಾಪಮಾನ");
    expect(translateText("Hybrid (Satellite + Labels)", "kn")).toBe("ಹೈಬ್ರಿಡ್ (ಉಪಗ್ರಹ + ಲೇಬಲ್‌ಗಳು)");
    expect(translateText("Every 5 minutes", "kn")).toBe("ಪ್ರತಿ 5 ನಿಮಿಷಕ್ಕೆ");
    expect(translateText("🌌 Midnight", "kn")).toBe("🌌 ಮಧ್ಯರಾತ್ರಿ");
  });

  it("skips nested spans inside .notranslate / [translate='no'] and resolves multiline dictionary text offline", async () => {
    const origFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
      fetchCalls += 1;
      throw new Error("unexpected network fetch");
    };

    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <span class="notranslate" translate="no"><span>Aura</span><span>fisky</span></span>
      <a href="#main-content">Skip\n    to main content</a>
    `;
    document.body.appendChild(wrap);

    try {
      setLocale("kn");
      translateDOM(wrap, "kn");
      await new Promise((r) => setTimeout(r, 150));

      expect(wrap.querySelector(".notranslate").textContent).toBe("Aurafisky");
      expect(wrap.querySelector("a").textContent).toBe("ಮುಖ್ಯ ವಿಷಯಕ್ಕೆ ಹೋಗಿ");
      expect(fetchCalls).toBe(0);
    } finally {
      setLocale("en");
      wrap.remove();
      globalThis.fetch = origFetch;
    }
  });
});

