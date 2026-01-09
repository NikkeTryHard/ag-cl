/**
 * Unit tests for constants module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getModelFamily, isThinkingModel, DEFAULT_SCHEDULING_MODE } from "../../src/constants.js";

describe("getModelFamily", () => {
  describe("claude family", () => {
    it.each([
      ["claude-sonnet-4-5-thinking", "claude"],
      ["claude-opus-4-5-thinking", "claude"],
      ["claude-sonnet-4-5", "claude"],
      ["Claude-Sonnet-4-5", "claude"],
      ["CLAUDE-OPUS", "claude"],
    ])("returns 'claude' for model '%s'", (model, expected) => {
      expect(getModelFamily(model)).toBe(expected);
    });
  });

  describe("gemini family", () => {
    it.each([
      ["gemini-3-flash", "gemini"],
      ["gemini-3-pro-low", "gemini"],
      ["gemini-3-pro-high", "gemini"],
      ["Gemini-3-Flash", "gemini"],
      ["GEMINI-PRO", "gemini"],
    ])("returns 'gemini' for model '%s'", (model, expected) => {
      expect(getModelFamily(model)).toBe(expected);
    });
  });

  describe("unknown family", () => {
    it.each([
      ["gpt-4", "unknown"],
      ["llama-2", "unknown"],
      ["mistral-7b", "unknown"],
      ["some-random-model", "unknown"],
    ])("returns 'unknown' for model '%s'", (model, expected) => {
      expect(getModelFamily(model)).toBe(expected);
    });
  });

  describe("edge cases", () => {
    it("handles null input gracefully", () => {
      expect(getModelFamily(null as unknown as string)).toBe("unknown");
    });

    it("handles undefined input gracefully", () => {
      expect(getModelFamily(undefined as unknown as string)).toBe("unknown");
    });

    it("handles empty string input", () => {
      expect(getModelFamily("")).toBe("unknown");
    });

    it("is case insensitive", () => {
      expect(getModelFamily("CLAUDE-SONNET")).toBe("claude");
      expect(getModelFamily("Claude-Sonnet")).toBe("claude");
      expect(getModelFamily("claude-sonnet")).toBe("claude");
      expect(getModelFamily("GEMINI-FLASH")).toBe("gemini");
      expect(getModelFamily("Gemini-Flash")).toBe("gemini");
      expect(getModelFamily("gemini-flash")).toBe("gemini");
    });

    it("matches partial model names", () => {
      expect(getModelFamily("my-claude-custom")).toBe("claude");
      expect(getModelFamily("gemini-custom-model")).toBe("gemini");
    });
  });
});

describe("isThinkingModel", () => {
  describe("claude thinking models", () => {
    it.each([
      ["claude-sonnet-4-5-thinking", true],
      ["claude-opus-4-5-thinking", true],
      ["Claude-Sonnet-4-5-Thinking", true],
      ["CLAUDE-OPUS-THINKING", true],
    ])("returns true for claude thinking model '%s'", (model, expected) => {
      expect(isThinkingModel(model)).toBe(expected);
    });
  });

  describe("claude non-thinking models", () => {
    it.each([
      ["claude-sonnet-4-5", false],
      ["claude-opus-4-5", false],
      ["claude-3-opus", false],
    ])("returns false for claude non-thinking model '%s'", (model, expected) => {
      expect(isThinkingModel(model)).toBe(expected);
    });
  });

  describe("gemini thinking models", () => {
    describe("explicit thinking suffix", () => {
      it.each([
        ["gemini-2-flash-thinking", true],
        ["gemini-thinking-model", true],
      ])("returns true for gemini with explicit 'thinking' in name '%s'", (model, expected) => {
        expect(isThinkingModel(model)).toBe(expected);
      });
    });

    describe("version >= 3 implicit thinking", () => {
      it.each([
        ["gemini-3-flash", true],
        ["gemini-3-pro-low", true],
        ["gemini-3-pro-high", true],
        ["gemini-4-flash", true],
        ["gemini-5-ultra", true],
        ["gemini-10-mega", true],
      ])("returns true for gemini version >= 3: '%s'", (model, expected) => {
        expect(isThinkingModel(model)).toBe(expected);
      });
    });
  });

  describe("gemini non-thinking models", () => {
    it.each([
      ["gemini-1-flash", false],
      ["gemini-2-flash", false],
      ["gemini-1.5-pro", false],
      ["gemini-pro", false],
    ])("returns false for gemini version < 3: '%s'", (model, expected) => {
      expect(isThinkingModel(model)).toBe(expected);
    });
  });

  describe("non-thinking models (other families)", () => {
    it.each([
      ["gpt-4", false],
      ["llama-2", false],
      ["mistral-7b", false],
    ])("returns false for non-claude/gemini model '%s'", (model, expected) => {
      expect(isThinkingModel(model)).toBe(expected);
    });
  });

  describe("edge cases", () => {
    it("handles null input gracefully", () => {
      expect(isThinkingModel(null as unknown as string)).toBe(false);
    });

    it("handles undefined input gracefully", () => {
      expect(isThinkingModel(undefined as unknown as string)).toBe(false);
    });

    it("handles empty string input", () => {
      expect(isThinkingModel("")).toBe(false);
    });

    it("is case insensitive for thinking suffix", () => {
      expect(isThinkingModel("claude-opus-THINKING")).toBe(true);
      expect(isThinkingModel("gemini-2-flash-THINKING")).toBe(true);
    });
  });
});

describe("MAX_EMPTY_RETRIES constant", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should default to 2 when env not set", async () => {
    delete process.env.MAX_EMPTY_RETRIES;
    const { MAX_EMPTY_RETRIES } = await import("../../src/constants.js");
    expect(MAX_EMPTY_RETRIES).toBe(2);
  });

  it("should use env value when set", async () => {
    process.env.MAX_EMPTY_RETRIES = "5";
    const { MAX_EMPTY_RETRIES } = await import("../../src/constants.js");
    expect(MAX_EMPTY_RETRIES).toBe(5);
  });

  it("should fallback to 2 for invalid env value", async () => {
    process.env.MAX_EMPTY_RETRIES = "invalid";
    const { MAX_EMPTY_RETRIES } = await import("../../src/constants.js");
    expect(MAX_EMPTY_RETRIES).toBe(2);
  });

  it("should clamp to MAX_EMPTY_RETRIES_LIMIT when value exceeds upper bound", async () => {
    process.env.MAX_EMPTY_RETRIES = "100";
    const { MAX_EMPTY_RETRIES, MAX_EMPTY_RETRIES_LIMIT } = await import("../../src/constants.js");
    expect(MAX_EMPTY_RETRIES).toBe(MAX_EMPTY_RETRIES_LIMIT);
    expect(MAX_EMPTY_RETRIES_LIMIT).toBe(10);
  });

  it("should allow 0 retries when explicitly set", async () => {
    process.env.MAX_EMPTY_RETRIES = "0";
    const { MAX_EMPTY_RETRIES } = await import("../../src/constants.js");
    expect(MAX_EMPTY_RETRIES).toBe(0);
  });
});

describe("DEFAULT_SCHEDULING_MODE constant", () => {
  it("should be 'sticky' by default", () => {
    expect(DEFAULT_SCHEDULING_MODE).toBe("sticky");
  });

  it("should be a valid SchedulingMode value", () => {
    const validModes = ["sticky", "refresh-priority", "drain-highest", "round-robin"];
    expect(validModes).toContain(DEFAULT_SCHEDULING_MODE);
  });
});
