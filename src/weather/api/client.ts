/**
 * HTTP client with retry, timeout, and AbortSignal support.
 */

import type { FetchOptions } from '../types.js';

/** Default fetch options */
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT = 10_000; // 10 seconds
const BASE_DELAY = 1_000; // 1 second

/** Error class for API errors */
export class WeatherApiError extends Error {
  public readonly status: number;
  public readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = 'WeatherApiError';
    this.status = status;
    this.url = url;
  }
}

/** Error class for timeout */
export class WeatherTimeoutError extends Error {
  public readonly url: string;

  constructor(url: string) {
    super(`Request timeout: ${url}`);
    this.name = 'WeatherTimeoutError';
    this.url = url;
  }
}

/**
 * Fetch with timeout support.
 * Uses AbortController for cancellation.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, signal, ...fetchOptions } = options;

  const controller = new AbortController();
  const abortSignals: AbortSignal[] = [controller.signal];
  if (signal) abortSignals.push(signal);

  // Combine signals
  const combinedSignal = AbortSignal.any(abortSignals);

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...fetchOptions, signal: combinedSignal });
    return response;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Check if it was our timeout or external abort
      if (signal?.aborted) throw err; // Re-throw external abort
      throw new WeatherTimeoutError(url);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Exponential backoff retry logic.
 * Retries on network errors and 5xx responses.
 */
export async function fetchWithRetry<T>(
  url: string,
  parseFn: (response: Response) => Promise<T>,
  options: FetchOptions = {}
): Promise<T> {
  const { retries = DEFAULT_RETRIES, signal, timeout } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, { signal, timeout });

      if (!response.ok) {
        // Don't retry 4xx errors (client errors)
        if (response.status >= 400 && response.status < 500) {
          throw new WeatherApiError(
            `API error: ${response.status}`,
            response.status,
            url
          );
        }
        // Retry 5xx errors
        throw new WeatherApiError(
          `Server error: ${response.status}`,
          response.status,
          url
        );
      }

      return await parseFn(response);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on client errors or abort
      if (err instanceof WeatherApiError && err.status < 500) throw err;
      if (err instanceof DOMException && err.name === 'AbortError') throw err;

      if (attempt < retries) {
        const delay = BASE_DELAY * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Convenience wrapper for JSON APIs.
 */
export async function fetchJson<T>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  return fetchWithRetry(
    url,
    (response) => response.json() as Promise<T>,
    options
  );
}

/**
 * Build URL with query parameters.
 */
export function buildUrl(baseUrl: string, params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }
  return `${baseUrl}?${searchParams.toString()}`;
}