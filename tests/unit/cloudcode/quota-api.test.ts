/**
 * Tests for quota-api.ts
 * Tier detection and quota fetching from Cloud Code API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("cloudcode/quota-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchAccountTier", () => {
    it("returns PRO tier when paidTier.id is PRO", async () => {
      // Arrange: API returns PRO tier
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            cloudaicompanionProject: "test-project-123",
            paidTier: { id: "PRO", name: "Pro" },
            currentTier: { id: "FREE", name: "Free" },
          }),
      });

      // Act
      const { fetchAccountTier } = await import("../../../src/cloudcode/quota-api.js");
      const result = await fetchAccountTier("test-token");

      // Assert
      expect(result.tier).toBe("PRO");
      expect(result.projectId).toBe("test-project-123");
    });

    it("returns ULTRA tier when paidTier.id is ULTRA", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            cloudaicompanionProject: "ultra-project",
            paidTier: { id: "ULTRA", name: "Ultra" },
          }),
      });

      const { fetchAccountTier } = await import("../../../src/cloudcode/quota-api.js");
      const result = await fetchAccountTier("test-token");

      expect(result.tier).toBe("ULTRA");
      expect(result.projectId).toBe("ultra-project");
    });

    it("returns FREE tier when only currentTier exists", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            cloudaicompanionProject: "free-project",
            currentTier: { id: "FREE", name: "Free" },
          }),
      });

      const { fetchAccountTier } = await import("../../../src/cloudcode/quota-api.js");
      const result = await fetchAccountTier("test-token");

      expect(result.tier).toBe("FREE");
      expect(result.projectId).toBe("free-project");
    });

    it("returns UNKNOWN tier when no tier info present", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            cloudaicompanionProject: "unknown-project",
          }),
      });

      const { fetchAccountTier } = await import("../../../src/cloudcode/quota-api.js");
      const result = await fetchAccountTier("test-token");

      expect(result.tier).toBe("UNKNOWN");
      expect(result.projectId).toBe("unknown-project");
    });

    it("returns UNKNOWN tier when API fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      // Second fallback endpoint also fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { fetchAccountTier } = await import("../../../src/cloudcode/quota-api.js");
      const result = await fetchAccountTier("test-token");

      expect(result.tier).toBe("UNKNOWN");
      expect(result.projectId).toBeNull();
    });

    it("sends correct headers and payload", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paidTier: { id: "PRO" } }),
      });

      const { fetchAccountTier } = await import("../../../src/cloudcode/quota-api.js");
      await fetchAccountTier("my-oauth-token");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1internal:loadCodeAssist"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer my-oauth-token",
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining("ANTIGRAVITY"),
        }),
      );
    });
  });

  describe("fetchAccountCapacity", () => {
    it("returns full account capacity with tier and quotas", async () => {
      // First call: loadCodeAssist for tier
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            cloudaicompanionProject: "test-project",
            paidTier: { id: "PRO" },
          }),
      });

      // Second call: fetchAvailableModels for quotas
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "claude-sonnet-4-5-thinking": {
                quotaInfo: {
                  remainingFraction: 0.75,
                  resetTime: "2026-01-07T18:00:00Z",
                },
              },
              "gemini-3-pro-high": {
                quotaInfo: {
                  remainingFraction: 0.5,
                  resetTime: "2026-01-07T20:00:00Z",
                },
              },
            },
          }),
      });

      const { fetchAccountCapacity } = await import("../../../src/cloudcode/quota-api.js");
      const result = await fetchAccountCapacity("test-token", "user@example.com");

      expect(result.email).toBe("user@example.com");
      expect(result.tier).toBe("PRO");
      expect(result.projectId).toBe("test-project");
      expect(result.isForbidden).toBe(false);

      // Claude pool
      expect(result.claudePool.models).toHaveLength(1);
      expect(result.claudePool.models[0].name).toBe("claude-sonnet-4-5-thinking");
      expect(result.claudePool.models[0].percentage).toBe(75);
      expect(result.claudePool.aggregatedPercentage).toBe(75);

      // Gemini pool
      expect(result.geminiPool.models).toHaveLength(1);
      expect(result.geminiPool.models[0].name).toBe("gemini-3-pro-high");
      expect(result.geminiPool.models[0].percentage).toBe(50);
      expect(result.geminiPool.aggregatedPercentage).toBe(50);
    });

    it("marks account as forbidden on 403 response", async () => {
      // First call: loadCodeAssist succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            cloudaicompanionProject: "forbidden-project",
            paidTier: { id: "FREE" },
          }),
      });

      // Second call: fetchAvailableModels returns 403
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      const { fetchAccountCapacity } = await import("../../../src/cloudcode/quota-api.js");
      const result = await fetchAccountCapacity("test-token", "forbidden@example.com");

      expect(result.isForbidden).toBe(true);
      expect(result.claudePool.models).toHaveLength(0);
      expect(result.geminiPool.models).toHaveLength(0);
    });

    it("finds earliest reset time in pool", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ paidTier: { id: "PRO" } }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "gemini-3-pro-high": {
                quotaInfo: {
                  remainingFraction: 0.5,
                  resetTime: "2026-01-07T20:00:00Z",
                },
              },
              "gemini-3-flash": {
                quotaInfo: {
                  remainingFraction: 0.8,
                  resetTime: "2026-01-07T18:00:00Z", // Earlier
                },
              },
            },
          }),
      });

      const { fetchAccountCapacity } = await import("../../../src/cloudcode/quota-api.js");
      const result = await fetchAccountCapacity("test-token", "user@example.com");

      expect(result.geminiPool.earliestReset).toBe("2026-01-07T18:00:00Z");
    });
  });
});
