// Runs under Vitest
import { test, describe, expect } from "vitest";
import fs from "fs";
import path from "path";

const i18nSource = fs.readFileSync("modules/i18n.js", "utf-8");
const dataSource = fs.readFileSync("modules/i18n-data.js", "utf-8");
const extendedSource = fs.readFileSync("modules/i18n-extended.js", "utf-8");
const loaderIndex = fs.readFileSync("modules/i18n-locales/index.js", "utf-8");

describe("Per-language dictionary chunks", () => {
  test("the dictionaries are not on the critical path any more", () => {
    // They used to be a single 818 KB chunk that every visitor downloaded
    // before the app could start — for the one language they read.
    expect(i18nSource).not.toContain('from "./i18n-data.js"');
    expect(i18nSource).not.toContain('from "./i18n-extended.js"');
    expect(i18nSource).toContain('from "./i18n-locales/index.js"');
  });

  test("English stays static because it is the fallback for every string", () => {
    expect(i18nSource).toContain('from "./i18n-locales/en.js"');
    expect(fs.existsSync("modules/i18n-locales/en.js")).toBe(true);
  });

  test("every language the app supports has its own chunk", async () => {
    const { ALL_DICTIONARIES } = await import("../modules/i18n-data.js");
    const languages = Object.keys(ALL_DICTIONARIES);
    expect(languages.length).toBeGreaterThan(20);
    for (const lang of languages) {
      expect(fs.existsSync(`modules/i18n-locales/${lang}.js`)).toBe(true);
    }
    // ...and the loader map knows about each of them.
    for (const lang of languages) {
      expect(loaderIndex).toContain(`"${lang}": () => import("./${lang}.js")`);
    }
  });

  test("the generated chunks are in step with the source dictionaries", async () => {
    // The generator turns the two data files into per-language modules. If
    // the dictionaries change without the generator being re-run, the app
    // would keep serving stale translations — so this fails loudly.
    const { ALL_DICTIONARIES } = await import("../modules/i18n-data.js");
    const { COMPREHENSIVE_TRANSLATIONS } = await import("../modules/i18n-extended.js");

    for (const [lang, dict] of Object.entries(ALL_DICTIONARIES)) {
      const file = `modules/i18n-locales/${lang}.js`;
      const mod = await import(`../${file.replace(/\.js$/, ".js")}`);
      expect(Object.keys(mod.DICTIONARY).sort()).toEqual(Object.keys(dict).sort());
      for (const [key, value] of Object.entries(dict)) {
        expect(mod.DICTIONARY[key]).toBe(value);
      }
    }

    // The comprehensive translations are keyed by English phrase and hold
    // every language, so each language's file takes the slice that is its own.
    for (const lang of Object.keys(ALL_DICTIONARIES)) {
      const mod = await import(`../modules/i18n-locales/${lang}.js`);
      for (const [key, langMap] of Object.entries(COMPREHENSIVE_TRANSLATIONS)) {
        const expected = langMap[lang];
        if (expected === undefined) continue;
        expect(mod.COMPREHENSIVE[key]).toBeTruthy();
        expect(mod.COMPREHENSIVE[key][lang]).toBe(expected);
      }
    }
  });

  test("a language chunk is a fraction of the size of the whole set", () => {
    const all = fs.statSync("modules/i18n-data.js").size + fs.statSync("modules/i18n-extended.js").size;
    const one = fs.statSync("modules/i18n-locales/kn.js").size;
    expect(one).toBeLessThan(all / 8);
  });
});

describe("Loading a language at runtime", () => {
  test("loadLocale fetches a language and makes it available to t()", async () => {
    const { loadLocale, t, DICT } = await import("../modules/i18n.js");

    expect(DICT.kn).toBeUndefined();
    const loaded = await loadLocale("kn");
    expect(loaded).toBe("kn");
    expect(DICT.kn).toBeTruthy();
    // A dictionary entry now resolves to Kannada rather than English.
    const text = t("search_placeholder", "kn");
    expect(text).not.toBe("search_placeholder");
    // Kannada script, U+0C80 to U+0CFF.
    const hasKannada = [...text].some((ch) => {
      const code = ch.codePointAt(0);
      return code >= 0x0c80 && code <= 0x0cff;
    });
    expect(hasKannada).toBe(true);
  });

  test("an unknown language falls back to English instead of failing", async () => {
    const { loadLocale } = await import("../modules/i18n.js");
    expect(await loadLocale("xx-YY")).toBe("en");
  });

  test("English needs no chunk at all", async () => {
    const { loadLocale } = await import("../modules/i18n.js");
    expect(await loadLocale("en")).toBe("en");
    expect(await loadLocale("en-GB")).toBe("en");
  });

  test("the source dictionaries stay as the generator's input", () => {
    // They are no longer bundled, but the split has to be reproducible from
    // them — otherwise a translation fix would never reach the app.
    expect(fs.existsSync("scripts/split-i18n-locales.mjs")).toBe(true);
    const generator = fs.readFileSync("scripts/split-i18n-locales.mjs", "utf-8");
    expect(generator).toContain("i18n-data.js");
    expect(generator).toContain("i18n-extended.js");
    expect(dataSource).toContain("ALL_DICTIONARIES");
    expect(extendedSource).toContain("COMPREHENSIVE_TRANSLATIONS");
  });
});
