// tests/weatherErrorStates.test.mjs
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { JSDOM } from "jsdom";

describe("Weather Error States & Retry UI (Phase 1 Foundation)", () => {
  const html = readFileSync(resolve(__dirname, "../index.html"), "utf-8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  it("contains weatherPanelError with title, message, and retry button in index.html", () => {
    const errorPanel = doc.getElementById("weatherPanelError");
    expect(errorPanel).not.toBeNull();
    expect(errorPanel.getAttribute("role")).toBe("alert");

    const errorTitle = doc.getElementById("weatherErrorTitle");
    expect(errorTitle).not.toBeNull();
    expect(errorTitle.textContent.length).toBeGreaterThan(0);

    const errorMessage = doc.getElementById("weatherErrorMessage");
    expect(errorMessage).not.toBeNull();

    const retryBtn = doc.getElementById("weatherRetryBtn");
    expect(retryBtn).not.toBeNull();

    const viewCachedBtn = doc.getElementById("weatherViewCachedBtn");
    expect(viewCachedBtn).not.toBeNull();
  });

  it("coordinates state changes between loading, content, and error states", () => {
    const skeleton = doc.getElementById("weatherPanelSkeleton");
    const content = doc.getElementById("weatherPanelContent");
    const error = doc.getElementById("weatherPanelError");
    const title = doc.getElementById("weatherErrorTitle");
    const msg = doc.getElementById("weatherErrorMessage");
    const icon = doc.getElementById("weatherErrorIcon");
    const viewCached = doc.getElementById("weatherViewCachedBtn");

    const setWeatherPanelState = (state, options = {}) => {
      skeleton.classList.toggle("hidden", state !== "loading");
      content.classList.toggle("hidden", state !== "content");
      error.classList.toggle("hidden", state !== "error");
      if (state === "error") {
        if (title && options.title) title.textContent = options.title;
        if (msg && options.message) msg.textContent = options.message;
        if (icon && options.icon) icon.textContent = options.icon;
        if (viewCached) viewCached.classList.toggle("hidden", !options.hasCachedData);
      }
    };

    // Test Loading State
    setWeatherPanelState("loading");
    expect(skeleton.classList.contains("hidden")).toBe(false);
    expect(content.classList.contains("hidden")).toBe(true);
    expect(error.classList.contains("hidden")).toBe(true);

    // Test Content State
    setWeatherPanelState("content");
    expect(skeleton.classList.contains("hidden")).toBe(true);
    expect(content.classList.contains("hidden")).toBe(false);
    expect(error.classList.contains("hidden")).toBe(true);

    // Test Error State
    setWeatherPanelState("error", {
      title: "Connection Lost",
      message: "Please retry.",
      icon: "⚠️",
      hasCachedData: true,
    });
    expect(skeleton.classList.contains("hidden")).toBe(true);
    expect(content.classList.contains("hidden")).toBe(true);
    expect(error.classList.contains("hidden")).toBe(false);
    expect(title.textContent).toBe("Connection Lost");
    expect(msg.textContent).toBe("Please retry.");
    expect(icon.textContent).toBe("⚠️");
    expect(viewCached.classList.contains("hidden")).toBe(false);
  });

  it("contains first-run onboarding feature tour modal and trigger in index.html", () => {
    const tourModal = doc.getElementById("onboardingTourModal");
    expect(tourModal).not.toBeNull();
    expect(tourModal.getAttribute("role")).toBe("dialog");

    const tourTitle = doc.getElementById("tourTitle");
    expect(tourTitle).not.toBeNull();
    expect(tourTitle.textContent.replace(/\s+/g, " ")).toContain("Welcome to Aurafisky");

    const closeBtn = doc.getElementById("onboardingCloseBtn");
    expect(closeBtn).not.toBeNull();

    const dismissBtn = doc.getElementById("onboardingDismissBtn");
    expect(dismissBtn).not.toBeNull();

    const featureTourBtn = doc.getElementById("settingsFeatureTourBtn");
    expect(featureTourBtn).not.toBeNull();
  });
});
