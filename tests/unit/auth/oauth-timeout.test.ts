/**
 * Tests for OAuth fetch timeout functionality
 *
 * Verifies that OAuth-related fetch calls have proper timeout handling
 * to prevent hanging indefinitely after idle periods.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithTimeout } from "../../../src/utils/helpers.js";
import { OAUTH_FETCH_TIMEOUT_MS } from "../../../src/constants.js";

describe("fetchWithTimeout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns response when fetch completes before timeout", async () => {
    const mockResponse = new Response(JSON.stringify({ success: true }), { status: 200 });

    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    const result = await fetchWithTimeout("https://example.com", {}, 1000);
    expect(result).toBe(mockResponse);
    expect(result.status).toBe(200);
  });

  it("aborts fetch when timeout is exceeded", async () => {
    // Use a very short timeout with real timers to test abort behavior
    const veryShortTimeout = 10; // 10ms

    // Mock fetch to respect the abort signal
    vi.spyOn(global, "fetch").mockImplementation((_url, options) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = options?.signal as AbortSignal | undefined;
        if (signal) {
          if (signal.aborted) {
            reject(new DOMException("The operation was aborted", "AbortError"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        }
        // Never resolves naturally - simulates hanging request
      });
    });

    const resultPromise = fetchWithTimeout("https://slow-server.com", {}, veryShortTimeout);

    // The promise should reject with an abort error
    await expect(resultPromise).rejects.toThrow();
  });

  it("clears timeout when fetch completes successfully", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const mockResponse = new Response("ok", { status: 200 });

    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse);

    await fetchWithTimeout("https://example.com", {}, 1000);

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("clears timeout when fetch fails", async () => {
    const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
    const networkError = new Error("Network error");

    vi.spyOn(global, "fetch").mockRejectedValue(networkError);

    await expect(fetchWithTimeout("https://example.com", {}, 1000)).rejects.toThrow("Network error");
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it("passes through fetch options correctly", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok"));

    const options: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    };

    await fetchWithTimeout("https://api.example.com", options, 5000);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("adds AbortSignal to the fetch request", async () => {
    let receivedSignal: AbortSignal | undefined;

    vi.spyOn(global, "fetch").mockImplementation((_url, options) => {
      receivedSignal = options?.signal;
      return Promise.resolve(new Response("ok"));
    });

    await fetchWithTimeout("https://example.com", {}, 1000);

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});

describe("OAUTH_FETCH_TIMEOUT_MS constant", () => {
  it("is set to 15 seconds (15000ms)", () => {
    expect(OAUTH_FETCH_TIMEOUT_MS).toBe(15000);
  });

  it("is a reasonable timeout for OAuth operations", () => {
    // Should be long enough for slow networks (at least 5 seconds)
    expect(OAUTH_FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(5000);
    // Should be short enough to fail fast (no more than 60 seconds)
    expect(OAUTH_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(60000);
  });
});

describe("OAuth functions integration with fetchWithTimeout", () => {
  // These tests verify that the OAuth functions import and use fetchWithTimeout correctly
  // by checking that the function calls include the expected timeout behavior.

  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("refreshAccessToken passes signal to fetch", async () => {
    const { refreshAccessToken } = await import("../../../src/auth/oauth.js");

    let receivedSignal: AbortSignal | undefined;

    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      receivedSignal = options?.signal;
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    await refreshAccessToken("test-refresh-token");

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it("getUserEmail passes signal to fetch", async () => {
    const { getUserEmail } = await import("../../../src/auth/oauth.js");

    let receivedSignal: AbortSignal | undefined;

    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      receivedSignal = options?.signal;
      return Promise.resolve(
        new Response(JSON.stringify({ email: "test@example.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    await getUserEmail("test-access-token");

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it("discoverProjectId passes signal to fetch", async () => {
    const { discoverProjectId } = await import("../../../src/auth/oauth.js");

    let receivedSignal: AbortSignal | undefined;

    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      receivedSignal = options?.signal;
      return Promise.resolve(
        new Response(JSON.stringify({ cloudaicompanionProject: "test-project-123" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    await discoverProjectId("test-access-token");

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it("discoverProject passes signal to fetch", async () => {
    const { discoverProject } = await import("../../../src/account-manager/credentials.js");

    let receivedSignal: AbortSignal | undefined;

    global.fetch = vi.fn().mockImplementation((_url: string, options?: RequestInit) => {
      receivedSignal = options?.signal;
      return Promise.resolve(
        new Response(JSON.stringify({ cloudaicompanionProject: "test-project-456" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    await discoverProject("test-access-token");

    expect(receivedSignal).toBeDefined();
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });
});
