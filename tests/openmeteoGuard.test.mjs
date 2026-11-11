import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isOpenMeteoCoolingDown,
  getOpenMeteoCooldownMs,
  parseRetryAfterMs,
  recordOpenMeteoRateLimit,
  clearOpenMeteoRateLimit,
  resetOpenMeteoGuard,
  guardedOpenMeteoFetch,
} from "../modules/openmeteo-guard.js";
import { WeatherService } from "../weather.js";
import { fetchAgroData } from "../features/farm.js";
import { init as initEnsemble, renderEnsemble } from "../features/ensemble.js";

describe("Open-Meteo rate-limit guard & request storm prevention", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    resetOpenMeteoGuard();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetOpenMeteoGuard();
    document.body.innerHTML = "";
  });

  it("activates shared cooldown on 429 and clears it on a healthy 200 response", async () => {
    expect(isOpenMeteoCoolingDown()).toBe(false);

    const mock429 = {
      ok: false,
      status: 429,
      headers: { get: (k) => (k === "Retry-After" ? "120" : null) },
    };
    expect(parseRetryAfterMs(mock429)).toBe(120000);

    globalThis.fetch = vi.fn().mockResolvedValue(mock429);
    const res = await guardedOpenMeteoFetch("https://api.open-meteo.com/v1/forecast?test=1");
    expect(res.status).toBe(429);
    expect(isOpenMeteoCoolingDown()).toBe(true);
    expect(getOpenMeteoCooldownMs()).toBeGreaterThan(30000);

    // Subsequent non-bypassed calls abort immediately before fetch()
    await expect(
      guardedOpenMeteoFetch("https://api.open-meteo.com/v1/forecast?test=2"),
    ).rejects.toMatchObject({ status: 429, isRateLimited: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Explicit bypass probe that returns 200 clears the cooldown
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
    });
    const okRes = await guardedOpenMeteoFetch(
      "https://api.open-meteo.com/v1/forecast?test=3",
      {},
      { bypassCooldown: true },
    );
    expect(okRes.status).toBe(200);
    expect(isOpenMeteoCoolingDown()).toBe(false);
  });

  it("does not retry HTTP 429 inside WeatherService.fetchForecast and blocks storm repeats", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
    });

    await expect(
      WeatherService.fetchForecast(13.0413, 78.0165, 3),
    ).rejects.toMatchObject({ status: 429 });

    // Must stop after 1 attempt — not 4 attempts
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(isOpenMeteoCoolingDown()).toBe(true);

    // Another coordinate immediately afterwards must skip the network while cooling down
    await expect(
      WeatherService.fetchForecast(13.2817, 78.2909, 3),
    ).rejects.toMatchObject({ status: 429 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Explicit Retry (bypassCooldown) performs one single probe
    await expect(
      WeatherService.fetchForecast(13.2817, 78.2909, 3, undefined, { bypassCooldown: true }),
    ).rejects.toMatchObject({ status: 429 });
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry 429 in fetchAirQuality and skips secondary agro/ensemble fetches during cooldown", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: { get: () => null },
    });

    const aqi = await WeatherService.fetchAirQuality(14.1111, 77.1111, 2);
    expect(aqi).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    recordOpenMeteoRateLimit(90000);
    await expect(fetchAgroData(14.1111, 77.1111)).rejects.toMatchObject({ status: 429 });
    // Still 1 total fetch: agro did not hit Open-Meteo during active cooldown
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("skips ensemble requests off the daily tab and respects active cooldown when on the daily tab", async () => {
    document.body.innerHTML = '<div id="weatherTabDaily"></div>';
    const mockApp = { activeWeatherTab: "overview" };
    initEnsemble(mockApp);

    globalThis.fetch = vi.fn();
    await renderEnsemble(15.25, 76.25);
    expect(globalThis.fetch).not.toHaveBeenCalled();

    mockApp.activeWeatherTab = "daily";
    recordOpenMeteoRateLimit(60000);
    await renderEnsemble(15.25, 76.25);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.getElementById("ensembleBody")?.textContent).toContain("unavailable");
  });
});

