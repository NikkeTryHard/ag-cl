/**
 * Unit tests for fallback-config module
 */

import { describe, it, expect } from "vitest";
import { getFallbackModel, hasFallback, MODEL_FALLBACK_MAP } from "../../src/fallback-config.js";

describe("getFallbackModel", () => {
  describe("known model mappings", () => {
    it.each([
      ["gemini-3-pro-high", "claude-opus-4-5-thinking"],
      ["gemini-3-pro-low", "claude-sonnet-4-5"],
      ["gemini-3-flash", "claude-sonnet-4-5-thinking"],
      ["claude-opus-4-5-thinking", "gemini-3-pro-high"],
      ["claude-sonnet-4-5-thinking", "gemini-3-flash"],
      ["claude-sonnet-4-5", "gemini-3-flash"],
    ])("returns fallback '%s' -> '%s'", (model, expected) => {
      expect(getFallbackModel(model)).toBe(expected);
    });
  });

  describe("unknown models", () => {
    it.each(["gpt-4", "llama-2", "mistral-7b", "unknown-model", ""])("returns null for unknown model '%s'", (model) => {
      expect(getFallbackModel(model)).toBeNull();
    });
  });

  describe("case sensitivity", () => {
    it("is case sensitive - returns null for wrong case", () => {
      // The mapping uses exact keys, so case matters
      expect(getFallbackModel("GEMINI-3-FLASH")).toBeNull();
      expect(getFallbackModel("Gemini-3-Flash")).toBeNull();
      expect(getFallbackModel("CLAUDE-OPUS-4-5-THINKING")).toBeNull();
    });
  });

  describe("mapping completeness", () => {
    it("covers all models in MODEL_FALLBACK_MAP", () => {
      for (const [model, expected] of Object.entries(MODEL_FALLBACK_MAP)) {
        expect(getFallbackModel(model)).toBe(expected);
      }
    });
  });
});

describe("hasFallback", () => {
  describe("known models with fallbacks", () => {
    it.each(["gemini-3-pro-high", "gemini-3-pro-low", "gemini-3-flash", "claude-opus-4-5-thinking", "claude-sonnet-4-5-thinking", "claude-sonnet-4-5"])("returns true for model with fallback '%s'", (model) => {
      expect(hasFallback(model)).toBe(true);
    });
  });

  describe("unknown models without fallbacks", () => {
    it.each(["gpt-4", "llama-2", "mistral-7b", "unknown-model", ""])("returns false for unknown model '%s'", (model) => {
      expect(hasFallback(model)).toBe(false);
    });
  });

  describe("case sensitivity", () => {
    it("is case sensitive - returns false for wrong case", () => {
      expect(hasFallback("GEMINI-3-FLASH")).toBe(false);
      expect(hasFallback("Gemini-3-Flash")).toBe(false);
      expect(hasFallback("CLAUDE-OPUS-4-5-THINKING")).toBe(false);
    });
  });

  describe("mapping completeness", () => {
    it("returns true for all models in MODEL_FALLBACK_MAP", () => {
      for (const model of Object.keys(MODEL_FALLBACK_MAP)) {
        expect(hasFallback(model)).toBe(true);
      }
    });
  });
});

describe("MODEL_FALLBACK_MAP", () => {
  it("contains expected number of mappings", () => {
    expect(Object.keys(MODEL_FALLBACK_MAP).length).toBe(6);
  });

  it("maps thinking models to thinking models", () => {
    // Verify thinking models fall back to thinking models
    expect(MODEL_FALLBACK_MAP["claude-opus-4-5-thinking"]).toBe("gemini-3-pro-high");
    expect(MODEL_FALLBACK_MAP["claude-sonnet-4-5-thinking"]).toBe("gemini-3-flash");
    expect(MODEL_FALLBACK_MAP["gemini-3-flash"]).toBe("claude-sonnet-4-5-thinking");
    expect(MODEL_FALLBACK_MAP["gemini-3-pro-high"]).toBe("claude-opus-4-5-thinking");
  });

  it("maps non-thinking claude to gemini", () => {
    expect(MODEL_FALLBACK_MAP["claude-sonnet-4-5"]).toBe("gemini-3-flash");
  });

  it("has symmetric mappings for some models", () => {
    // Check that some mappings are bidirectional
    const opusToGemini = MODEL_FALLBACK_MAP["claude-opus-4-5-thinking"];
    const geminiToOpus = MODEL_FALLBACK_MAP["gemini-3-pro-high"];
    expect(opusToGemini).toBe("gemini-3-pro-high");
    expect(geminiToOpus).toBe("claude-opus-4-5-thinking");
  });
});
