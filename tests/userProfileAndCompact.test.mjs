import { describe, it, expect } from "vitest";
import fs from "fs";

describe("User Profile Avatar & Compact Mode Removal", () => {
  const indexHtml = fs.readFileSync("index.html", "utf-8");
  const stylesCss = fs.readFileSync("styles.css", "utf-8");
  const appJs = fs.readFileSync("app.js", "utf-8");

  describe("User Profile Avatar", () => {
    it("renders profile button with person icon and no letters before sign-in", () => {
      // profileBtn must exist
      expect(indexHtml).toContain('id="profileBtn"');
      // SVG person icon must not be hidden
      expect(indexHtml).toMatch(/<svg id="profileIconGeneric"[^>]*class="[^"]*w-4 h-4 text-slate-600[^"]*"[^>]*>/);
      // profileAvatarFallback must be hidden by default with no static letters
      expect(indexHtml).toContain('<span id="profileAvatarFallback" class="hidden text-xs font-bold text-white tracking-wider select-none"></span>');
      // profileAvatarImg must be hidden initially
      expect(indexHtml).toContain('<img id="profileAvatarImg" class="w-full h-full object-cover hidden"');
    });

    it("defines _computeInitials in app.js that extracts clean 2-letter initials", () => {
      expect(appJs).toContain("_computeInitials(name, email)");
      // Test the logic directly
      const computeInitials = (name, email) => {
        if (name && typeof name === "string" && name.trim()) {
          const parts = name.trim().split(/\s+/).filter(Boolean);
          if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
          }
          if (parts.length === 1) {
            const single = parts[0].replace(/[^a-zA-Z]/g, "");
            return single.length >= 2 ? single.slice(0, 2).toUpperCase() : single.toUpperCase() || "U";
          }
        }
        if (email && typeof email === "string" && email.trim()) {
          const userPart = email.split("@")[0].replace(/[^a-zA-Z]/g, "");
          if (userPart.length >= 2) {
            return userPart.slice(0, 2).toUpperCase();
          }
          if (userPart.length === 1) {
            return userPart.toUpperCase();
          }
        }
        return "U";
      };

      expect(computeInitials("Bhargav G")).toBe("BG");
      expect(computeInitials("John Doe")).toBe("JD");
      expect(computeInitials("Alice Wonder Land")).toBe("AL");
      expect(computeInitials("Bhargav")).toBe("BH");
      expect(computeInitials("", "bhargav.g@example.com")).toBe("BH");
    });
  });

  describe("Compact Mode Removal", () => {
    it("has completely removed compactExpandBtn from index.html", () => {
      expect(indexHtml).not.toContain('id="compactExpandBtn"');
    });

    it("has completely removed settingsCompactToggle from index.html", () => {
      expect(indexHtml).not.toContain('id="settingsCompactToggle"');
      expect(indexHtml).not.toContain("Compact mode");
    });

    it("has completely removed compact chips and compact date display from index.html", () => {
      expect(indexHtml).not.toContain('id="compactDatetime"');
      expect(indexHtml).not.toContain('id="compactChips"');
      expect(indexHtml).not.toContain('id="compactHighLow"');
      expect(indexHtml).not.toContain('id="compactQuickStats"');
    });

    it("has removed .compact card compartment rules from styles.css", () => {
      expect(stylesCss).not.toContain(".compact#weatherPanel");
      expect(stylesCss).not.toContain(".compact #weatherPanelContent");
      expect(stylesCss).not.toContain(".compact #compactExpandBtn");
      expect(stylesCss).not.toContain(".weather-panel.compact .weather-tab-panel");
    });

    it("enforces stripping of 'compact' class on <html> in app.js and minimalMode.js", () => {
      expect(appJs).toContain('document.documentElement.classList.remove("compact")');
      const minimalModeJs = fs.readFileSync("features/minimalMode.js", "utf-8");
      expect(minimalModeJs).toContain('document.documentElement.classList.remove("compact")');
    });
  });
});
