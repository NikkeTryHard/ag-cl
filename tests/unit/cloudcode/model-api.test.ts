/**
 * Tests for src/cloudcode/model-api.ts
 * Model listing and quota retrieval from Cloud Code API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listModels, fetchAvailableModels, getModelQuotas } from "../../../src/cloudcode/model-api.js";
import { ANTIGRAVITY_ENDPOINT_FALLBACKS } from "../../../src/constants.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger
vi.mock("../../../src/utils/logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  })),
  initLogger: vi.fn(),
  setLogLevel: vi.fn(),
}));

describe("cloudcode/model-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchAvailableModels", () => {
    it("fetches models from first available endpoint", async () => {
      const mockResponse = {
        models: {
          "claude-3-5-sonnet": { displayName: "Claude 3.5 Sonnet" },
          "gemini-2.0-flash": { displayName: "Gemini 2.0 Flash" },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await fetchAvailableModels("test-token");

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        `${ANTIGRAVITY_ENDPOINT_FALLBACKS[0]}/v1internal:fetchAvailableModels`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({}),
        }),
      );
    });

    it("includes Authorization header with bearer token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: {} }),
      });

      await fetchAvailableModels("my-access-token");

      const call = mockFetch.mock.calls[0];
      expect(call[1].headers.Authorization).toBe("Bearer my-access-token");
    });

    it("tries fallback endpoints on failure", async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, text: () => Promise.resolve("Error") }).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: { "fallback-model": {} } }),
      });

      const result = await fetchAvailableModels("token");

      expect(result).toEqual({ models: { "fallback-model": {} } });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("throws when all endpoints fail", async () => {
      mockFetch.mockResolvedValue({ ok: false, text: () => Promise.resolve("Error") });

      await expect(fetchAvailableModels("token")).rejects.toThrow("Failed to fetch available models from all endpoints");
    });

    it("handles network errors and tries next endpoint", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: {} }),
      });

      const result = await fetchAvailableModels("token");

      expect(result).toEqual({ models: {} });
    });
  });

  describe("listModels", () => {
    it("returns models in Anthropic API format", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "claude-3-5-sonnet-20241022": { displayName: "Claude 3.5 Sonnet" },
              "gemini-2.0-flash": { displayName: "Gemini 2.0 Flash" },
            },
          }),
      });

      const result = await listModels("token");

      expect(result.object).toBe("list");
      expect(result.data).toHaveLength(2);

      const claudeModel = result.data.find((m) => m.id === "claude-3-5-sonnet-20241022");
      expect(claudeModel).toBeDefined();
      expect(claudeModel?.object).toBe("model");
      expect(claudeModel?.owned_by).toBe("anthropic");
      expect(claudeModel?.description).toBe("Claude 3.5 Sonnet");
    });

    it("filters out unsupported models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "claude-3-opus": { displayName: "Claude 3 Opus" },
              "some-other-model": { displayName: "Other Model" },
              "gemini-1.5-pro": { displayName: "Gemini 1.5 Pro" },
            },
          }),
      });

      const result = await listModels("token");

      // Should only include Claude and Gemini models
      const modelIds = result.data.map((m) => m.id);
      expect(modelIds).toContain("claude-3-opus");
      expect(modelIds).toContain("gemini-1.5-pro");
      expect(modelIds).not.toContain("some-other-model");
    });

    it("returns empty list when no models in response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await listModels("token");

      expect(result).toEqual({ object: "list", data: [] });
    });

    it("returns empty list when models is null", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: null }),
      });

      const result = await listModels("token");

      expect(result).toEqual({ object: "list", data: [] });
    });

    it("includes created timestamp for each model", async () => {
      const beforeTime = Math.floor(Date.now() / 1000);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "claude-3-5-sonnet": { displayName: "Claude 3.5 Sonnet" },
            },
          }),
      });

      const result = await listModels("token");
      const afterTime = Math.floor(Date.now() / 1000);

      expect(result.data[0].created).toBeGreaterThanOrEqual(beforeTime);
      expect(result.data[0].created).toBeLessThanOrEqual(afterTime);
    });

    it("uses model ID as description when displayName is missing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "claude-3-haiku": {},
            },
          }),
      });

      const result = await listModels("token");

      expect(result.data[0].description).toBe("claude-3-haiku");
    });
  });

  describe("getModelQuotas", () => {
    it("returns quota info for each model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "claude-3-5-sonnet": {
                displayName: "Claude 3.5 Sonnet",
                quotaInfo: {
                  remainingFraction: 0.75,
                  resetTime: "2024-01-01T00:00:00Z",
                },
              },
              "gemini-2.0-flash": {
                displayName: "Gemini 2.0 Flash",
                quotaInfo: {
                  remainingFraction: 0.5,
                  resetTime: "2024-01-02T00:00:00Z",
                },
              },
            },
          }),
      });

      const result = await getModelQuotas("token");

      expect(result["claude-3-5-sonnet"]).toEqual({
        remainingFraction: 0.75,
        resetTime: "2024-01-01T00:00:00Z",
      });
      expect(result["gemini-2.0-flash"]).toEqual({
        remainingFraction: 0.5,
        resetTime: "2024-01-02T00:00:00Z",
      });
    });

    it("returns empty object when no models", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await getModelQuotas("token");

      expect(result).toEqual({});
    });

    it("handles missing quotaInfo", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "claude-3-opus": { displayName: "Claude 3 Opus" },
            },
          }),
      });

      const result = await getModelQuotas("token");

      // Model without quotaInfo should not be in the result
      expect(result["claude-3-opus"]).toBeUndefined();
    });

    it("handles partial quotaInfo (missing fields)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "claude-3-5-sonnet": {
                quotaInfo: {
                  remainingFraction: 0.25,
                  // resetTime is missing
                },
              },
            },
          }),
      });

      const result = await getModelQuotas("token");

      expect(result["claude-3-5-sonnet"]).toEqual({
        remainingFraction: 0.25,
        resetTime: null,
      });
    });

    it("filters out unsupported models from quotas", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: {
              "claude-3-5-sonnet": {
                quotaInfo: { remainingFraction: 0.5 },
              },
              "unsupported-model": {
                quotaInfo: { remainingFraction: 0.8 },
              },
            },
          }),
      });

      const result = await getModelQuotas("token");

      expect(result["claude-3-5-sonnet"]).toBeDefined();
      expect(result["unsupported-model"]).toBeUndefined();
    });
  });
});
