/**
 * Unit tests for fallback-utils module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shouldAttemptFallback, is5xxError } from "../../../src/cloudcode/fallback-utils.js";

// Mock the logger to avoid side effects in tests
vi.mock("../../../src/utils/logger.js", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  }),
}));

// Mock the fallback-config to control what models have fallbacks
vi.mock("../../../src/fallback-config.js", () => ({
  getFallbackModel: (model: string) => {
    const fallbacks: Record<string, string> = {
      "claude-opus-4-5-thinking": "gemini-3-pro-high",
      "claude-sonnet-4-5": "gemini-3-flash",
      "gemini-3-pro-high": "claude-opus-4-5-thinking",
    };
    return fallbacks[model] ?? null;
  },
}));

describe("is5xxError", () => {
  describe("returns true for 5xx errors", () => {
    it("returns true for 'API error 500'", () => {
      const err = new Error("API error 500: Internal Server Error");
      expect(is5xxError(err)).toBe(true);
    });

    it("returns true for 'API error 503'", () => {
      const err = new Error("API error 503: Service Unavailable");
      expect(is5xxError(err)).toBe(true);
    });

    it("returns true for message containing 'API error 5'", () => {
      const err = new Error("API error 502: Bad Gateway");
      expect(is5xxError(err)).toBe(true);
    });

    it("returns true for message containing just '500'", () => {
      const err = new Error("Server returned 500");
      expect(is5xxError(err)).toBe(true);
    });

    it("returns true for message containing just '503'", () => {
      const err = new Error("Got 503 from upstream");
      expect(is5xxError(err)).toBe(true);
    });

    it("returns true for API error 504", () => {
      const err = new Error("API error 504: Gateway Timeout");
      expect(is5xxError(err)).toBe(true);
    });
  });

  describe("returns false for non-5xx errors", () => {
    it("returns false for rate limit errors (429)", () => {
      const err = new Error("Rate limited: 429 Too Many Requests");
      expect(is5xxError(err)).toBe(false);
    });

    it("returns false for auth errors (401)", () => {
      const err = new Error("API error 401: Unauthorized");
      expect(is5xxError(err)).toBe(false);
    });

    it("returns false for not found errors (404)", () => {
      const err = new Error("API error 404: Not Found");
      expect(is5xxError(err)).toBe(false);
    });

    it("returns false for bad request errors (400)", () => {
      const err = new Error("API error 400: Bad Request");
      expect(is5xxError(err)).toBe(false);
    });

    it("returns false for generic errors", () => {
      const err = new Error("Network error: Connection refused");
      expect(is5xxError(err)).toBe(false);
    });

    it("returns false for empty error message", () => {
      const err = new Error("");
      expect(is5xxError(err)).toBe(false);
    });
  });
});

describe("shouldAttemptFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("returns true when conditions are met", () => {
    it("returns true when all5xxErrors is true, fallbackEnabled is true, and model has fallback", () => {
      const result = shouldAttemptFallback("claude-opus-4-5-thinking", true, true);
      expect(result.shouldFallback).toBe(true);
      expect(result.fallbackModel).toBe("gemini-3-pro-high");
    });

    it("returns correct fallback model for claude-sonnet-4-5", () => {
      const result = shouldAttemptFallback("claude-sonnet-4-5", true, true);
      expect(result.shouldFallback).toBe(true);
      expect(result.fallbackModel).toBe("gemini-3-flash");
    });

    it("returns correct fallback model for gemini-3-pro-high", () => {
      const result = shouldAttemptFallback("gemini-3-pro-high", true, true);
      expect(result.shouldFallback).toBe(true);
      expect(result.fallbackModel).toBe("claude-opus-4-5-thinking");
    });
  });

  describe("returns false when all5xxErrors is false", () => {
    it("returns false even when fallback is enabled and model has fallback", () => {
      const result = shouldAttemptFallback("claude-opus-4-5-thinking", false, true);
      expect(result.shouldFallback).toBe(false);
      expect(result.fallbackModel).toBeNull();
    });
  });

  describe("returns false when fallbackEnabled is false", () => {
    it("returns false even when all5xxErrors is true and model has fallback", () => {
      const result = shouldAttemptFallback("claude-opus-4-5-thinking", true, false);
      expect(result.shouldFallback).toBe(false);
      expect(result.fallbackModel).toBeNull();
    });
  });

  describe("returns false when model has no configured fallback", () => {
    it("returns false for unknown model", () => {
      const result = shouldAttemptFallback("unknown-model", true, true);
      expect(result.shouldFallback).toBe(false);
      expect(result.fallbackModel).toBeNull();
    });

    it("returns false for empty model string", () => {
      const result = shouldAttemptFallback("", true, true);
      expect(result.shouldFallback).toBe(false);
      expect(result.fallbackModel).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns false when both all5xxErrors and fallbackEnabled are false", () => {
      const result = shouldAttemptFallback("claude-opus-4-5-thinking", false, false);
      expect(result.shouldFallback).toBe(false);
      expect(result.fallbackModel).toBeNull();
    });

    it("returns consistent results for multiple calls with same inputs", () => {
      const result1 = shouldAttemptFallback("claude-opus-4-5-thinking", true, true);
      const result2 = shouldAttemptFallback("claude-opus-4-5-thinking", true, true);
      expect(result1).toEqual(result2);
    });
  });
});
