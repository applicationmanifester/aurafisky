// tests/errorHandler.test.mjs
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildEntry,
  logError,
  getErrorLog,
  clearErrorLog,
} from "../features/errorHandler.js";

// Minimal localStorage shim
const store = {};
const localStorageMock = {
  getItem: (key) => store[key] ?? null,
  setItem: (key, val) => { store[key] = String(val); },
  removeItem: (key) => { delete store[key]; },
};
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", { value: localStorageMock });
}

describe("errorHandler", () => {
  beforeEach(() => {
    clearErrorLog();
  });

  describe("buildEntry", () => {
    it("builds from an Error object", () => {
      const err = new Error("test failure");
      const entry = buildEntry("error", err, "test.js");
      expect(entry.type).toBe("error");
      expect(entry.message).toBe("test failure");
      expect(entry.source).toBe("test.js");
      expect(entry.stack).toBeDefined();
      expect(entry.ts).toBeDefined();
    });

    it("builds from a string", () => {
      const entry = buildEntry("caught", "string error");
      expect(entry.message).toBe("string error");
      expect(entry.stack).toBeUndefined();
    });

    it("builds from a rejection reason object", () => {
      const entry = buildEntry("unhandledrejection", { reason: { message: "async fail", stack: "at line 1" } });
      expect(entry.message).toBe("async fail");
    });

    it("handles null/undefined gracefully", () => {
      const entry = buildEntry("error", null);
      expect(entry.message).toBe("Unknown error");
    });

    it("truncates stack to 1000 chars", () => {
      const err = new Error("x");
      err.stack = "a".repeat(2000);
      const entry = buildEntry("error", err);
      expect(entry.stack.length).toBe(1000);
    });
  });

  describe("logError / getErrorLog / clearErrorLog", () => {
    it("stores and retrieves errors", () => {
      logError(buildEntry("caught", "first"));
      logError(buildEntry("caught", "second"));
      const log = getErrorLog();
      expect(log).toHaveLength(2);
      expect(log[0].message).toBe("first");
      expect(log[1].message).toBe("second");
    });

    it("clears the log", () => {
      logError(buildEntry("error", "gone"));
      clearErrorLog();
      expect(getErrorLog()).toHaveLength(0);
    });

    it("caps at MAX_ERRORS (50)", () => {
      for (let i = 0; i < 60; i++) {
        logError(buildEntry("caught", `err ${i}`));
      }
      const log = getErrorLog();
      expect(log.length).toBeLessThanOrEqual(50);
      // Oldest entries should have been evicted
      expect(log[0].message).toBe("err 10");
    });
  });
});
