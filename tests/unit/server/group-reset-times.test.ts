/**
 * Unit Tests: getGroupResetTimes helper
 *
 * Tests the per-group quota reset time calculation from model rate limits.
 */

import { describe, it, expect } from "vitest";
import { getGroupResetTimes } from "../../../src/server.js";

describe("getGroupResetTimes", () => {
  describe("with no rate limits", () => {
    it("should return null for all groups when no models are rate limited", () => {
      const modelRateLimits: Record<string, { isRateLimited: boolean; resetTime: number | null }> = {
        "claude-sonnet-4-5": { isRateLimited: false, resetTime: null },
        "gemini-2.5-pro": { isRateLimited: false, resetTime: null },
      };

      const result = getGroupResetTimes(modelRateLimits);

      expect(result.claude).toBeNull();
      expect(result.geminiPro).toBeNull();
      expect(result.geminiFlash).toBeNull();
    });

    it("should return null for all groups when model rate limits is empty", () => {
      const result = getGroupResetTimes({});

      expect(result.claude).toBeNull();
      expect(result.geminiPro).toBeNull();
      expect(result.geminiFlash).toBeNull();
    });
  });

  describe("with rate limited models", () => {
    it("should return earliest reset time for Claude group", () => {
      const now = Date.now();
      const earlierReset = now + 1000 * 60 * 30; // 30 minutes
      const laterReset = now + 1000 * 60 * 60; // 1 hour

      const modelRateLimits: Record<string, { isRateLimited: boolean; resetTime: number | null }> = {
        "claude-sonnet-4-5": { isRateLimited: true, resetTime: earlierReset },
        "claude-opus-4-5": { isRateLimited: true, resetTime: laterReset },
      };

      const result = getGroupResetTimes(modelRateLimits);

      expect(result.claude).toBe(new Date(earlierReset).toISOString());
      expect(result.geminiPro).toBeNull();
      expect(result.geminiFlash).toBeNull();
    });

    it("should return earliest reset time for Gemini Pro group", () => {
      const now = Date.now();
      const resetTime = now + 1000 * 60 * 45; // 45 minutes

      const modelRateLimits: Record<string, { isRateLimited: boolean; resetTime: number | null }> = {
        "gemini-2.5-pro": { isRateLimited: true, resetTime: resetTime },
      };

      const result = getGroupResetTimes(modelRateLimits);

      expect(result.claude).toBeNull();
      expect(result.geminiPro).toBe(new Date(resetTime).toISOString());
      expect(result.geminiFlash).toBeNull();
    });

    it("should return earliest reset time for Gemini Flash group", () => {
      const now = Date.now();
      const resetTime = now + 1000 * 60 * 20; // 20 minutes

      const modelRateLimits: Record<string, { isRateLimited: boolean; resetTime: number | null }> = {
        "gemini-2.5-flash": { isRateLimited: true, resetTime: resetTime },
        "gemini-3-flash": { isRateLimited: true, resetTime: resetTime + 1000 },
      };

      const result = getGroupResetTimes(modelRateLimits);

      expect(result.claude).toBeNull();
      expect(result.geminiPro).toBeNull();
      expect(result.geminiFlash).toBe(new Date(resetTime).toISOString());
    });

    it("should handle mixed rate limited and non-rate limited models", () => {
      const now = Date.now();
      const claudeReset = now + 1000 * 60 * 30;
      const geminiProReset = now + 1000 * 60 * 45;

      const modelRateLimits: Record<string, { isRateLimited: boolean; resetTime: number | null }> = {
        "claude-sonnet-4-5": { isRateLimited: true, resetTime: claudeReset },
        "claude-opus-4-5": { isRateLimited: false, resetTime: null },
        "gemini-2.5-pro": { isRateLimited: true, resetTime: geminiProReset },
        "gemini-2.5-flash": { isRateLimited: false, resetTime: null },
      };

      const result = getGroupResetTimes(modelRateLimits);

      expect(result.claude).toBe(new Date(claudeReset).toISOString());
      expect(result.geminiPro).toBe(new Date(geminiProReset).toISOString());
      expect(result.geminiFlash).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should ignore rate limited models with null reset time", () => {
      const modelRateLimits: Record<string, { isRateLimited: boolean; resetTime: number | null }> = {
        "claude-sonnet-4-5": { isRateLimited: true, resetTime: null },
      };

      const result = getGroupResetTimes(modelRateLimits);

      expect(result.claude).toBeNull();
    });

    it("should handle models not in any quota group", () => {
      const now = Date.now();
      const resetTime = now + 1000 * 60 * 30;

      const modelRateLimits: Record<string, { isRateLimited: boolean; resetTime: number | null }> = {
        "unknown-model": { isRateLimited: true, resetTime: resetTime },
      };

      const result = getGroupResetTimes(modelRateLimits);

      // Unknown models should not affect any group
      expect(result.claude).toBeNull();
      expect(result.geminiPro).toBeNull();
      expect(result.geminiFlash).toBeNull();
    });
  });
});
