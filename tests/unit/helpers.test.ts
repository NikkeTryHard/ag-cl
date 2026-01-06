/**
 * Unit tests for utility helpers
 */

import { describe, it, expect } from "vitest";
import { formatDuration, sleep, isNetworkError, isAuthError, isRateLimitError } from "../../src/utils/helpers.js";

describe("formatDuration", () => {
  it("formats milliseconds to human readable string", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(60000)).toBe("1m0s");
    expect(formatDuration(3600000)).toBe("1h0m0s");
    expect(formatDuration(3661000)).toBe("1h1m1s");
    expect(formatDuration(0)).toBe("0s");
  });

  it("handles partial durations", () => {
    expect(formatDuration(5500)).toBe("5s");
    expect(formatDuration(90000)).toBe("1m30s");
    expect(formatDuration(7500000)).toBe("2h5m0s");
  });
});

describe("sleep", () => {
  it("delays execution for specified time", async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow small timing variance
    expect(elapsed).toBeLessThan(150);
  });
});

describe("isNetworkError", () => {
  it("returns true for network-related errors", () => {
    expect(isNetworkError(new Error("fetch failed"))).toBe(true);
    expect(isNetworkError(new Error("network error"))).toBe(true);
    expect(isNetworkError(new Error("ECONNRESET"))).toBe(true);
    expect(isNetworkError(new Error("ETIMEDOUT"))).toBe(true);
    expect(isNetworkError(new Error("socket hang up"))).toBe(true);
    expect(isNetworkError(new Error("timeout"))).toBe(true);
  });

  it("returns false for non-network errors", () => {
    expect(isNetworkError(new Error("Some other error"))).toBe(false);
    expect(isNetworkError(new Error("Rate limited"))).toBe(false);
    expect(isNetworkError(new Error("Authentication failed"))).toBe(false);
  });
});

describe("isAuthError", () => {
  describe("returns true for auth-related error messages", () => {
    it.each(["401 Unauthorized", "Error: 401", "unauthenticated", "UNAUTHENTICATED: Invalid credentials", "invalid_grant", "INVALID_GRANT", "invalid_client", "INVALID_CLIENT"])("returns true for '%s'", (message) => {
      expect(isAuthError(new Error(message))).toBe(true);
    });
  });

  describe("returns false for non-auth error messages", () => {
    it.each(["Some other error", "Rate limited", "Network error", "Server error 500", "Bad request"])("returns false for '%s'", (message) => {
      expect(isAuthError(new Error(message))).toBe(false);
    });
  });

  it("is case insensitive", () => {
    expect(isAuthError(new Error("UNAUTHENTICATED"))).toBe(true);
    expect(isAuthError(new Error("Unauthenticated"))).toBe(true);
    expect(isAuthError(new Error("unauthenticated"))).toBe(true);
  });
});

describe("isRateLimitError", () => {
  describe("returns true for rate-limit-related error messages", () => {
    it.each(["429 Too Many Requests", "Error: 429", "resource_exhausted", "RESOURCE_EXHAUSTED", "quota_exhausted", "QUOTA_EXHAUSTED"])("returns true for '%s'", (message) => {
      expect(isRateLimitError(new Error(message))).toBe(true);
    });
  });

  describe("returns false for non-rate-limit error messages", () => {
    it.each(["Some other error", "Authentication failed", "Network error", "Server error 500", "Bad request"])("returns false for '%s'", (message) => {
      expect(isRateLimitError(new Error(message))).toBe(false);
    });
  });

  it("is case insensitive", () => {
    expect(isRateLimitError(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isRateLimitError(new Error("Resource_Exhausted"))).toBe(true);
    expect(isRateLimitError(new Error("resource_exhausted"))).toBe(true);
  });
});
