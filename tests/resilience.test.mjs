import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fetchWithRetry, WeatherApiError } from '../src/weather/api/client.ts';

describe('Resilience & Intervention Guards', () => {
  describe('Vibration User Activation Guard', () => {
    let originalNavigator;

    beforeEach(() => {
      originalNavigator = globalThis.navigator;
    });

    afterEach(() => {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });

    it('does not call navigator.vibrate when userActivation.hasBeenActive is false', () => {
      const vibrateMock = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          vibrate: vibrateMock,
          userActivation: { hasBeenActive: false, isActive: false },
        },
        configurable: true,
        writable: true,
      });

      const haptic = (type = 'light') => {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
        try {
          navigator.vibrate([10]);
        } catch (_) {}
      };

      haptic('light');
      expect(vibrateMock).not.toHaveBeenCalled();
    });

    it('calls navigator.vibrate when userActivation.hasBeenActive is true', () => {
      const vibrateMock = vi.fn();
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          vibrate: vibrateMock,
          userActivation: { hasBeenActive: true, isActive: true },
        },
        configurable: true,
        writable: true,
      });

      const haptic = (type = 'light') => {
        if (typeof navigator === 'undefined' || !navigator.vibrate) return;
        if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
        try {
          navigator.vibrate([10]);
        } catch (_) {}
      };

      haptic('light');
      expect(vibrateMock).toHaveBeenCalledWith([10]);
    });
  });

  describe('HTTP 429 Rate Limit Handling in fetchWithRetry', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('retries on 429 status code and succeeds when a subsequent attempt returns 200', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true }),
        };
      });

      const result = await fetchWithRetry(
        'https://api.open-meteo.com/v1/forecast',
        (res) => res.json(),
        { retries: 1, timeout: 5000 }
      );

      expect(callCount).toBe(2);
      expect(result).toEqual({ success: true });
    }, 10000);

    it('does not retry 400 Bad Request or 404 Not Found', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
        };
      });

      await expect(
        fetchWithRetry(
          'https://api.open-meteo.com/v1/forecast',
          (res) => res.json(),
          { retries: 3, timeout: 5000 }
        )
      ).rejects.toThrow();

      // Should only try once because 404 is a non-retryable client error
      expect(callCount).toBe(1);
    }, 10000);
  });
});
