/**
 * Unit tests for signature-cache.ts
 *
 * Tests in-memory caching of Gemini thoughtSignatures and thinking block signatures
 * with TTL expiration support.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { cacheSignature, getCachedSignature, cleanupCache, getCacheSize, cacheThinkingSignature, getCachedSignatureFamily, getThinkingCacheSize, _resetCacheForTesting } from "../../../src/format/signature-cache.js";
import { GEMINI_SIGNATURE_CACHE_TTL_MS, MIN_SIGNATURE_LENGTH } from "../../../src/constants.js";

describe("signature-cache", () => {
  beforeEach(() => {
    _resetCacheForTesting();
    vi.useRealTimers();
  });

  describe("cacheSignature", () => {
    it("caches a signature for a tool_use_id", () => {
      cacheSignature("tool_123", "signature_abc");
      expect(getCachedSignature("tool_123")).toBe("signature_abc");
    });

    it("does not cache if toolUseId is empty", () => {
      cacheSignature("", "signature_abc");
      expect(getCacheSize()).toBe(0);
    });

    it("does not cache if signature is empty", () => {
      cacheSignature("tool_123", "");
      expect(getCacheSize()).toBe(0);
    });

    it("does not cache if toolUseId is null/undefined", () => {
      cacheSignature(null as unknown as string, "signature_abc");
      cacheSignature(undefined as unknown as string, "signature_abc");
      expect(getCacheSize()).toBe(0);
    });

    it("does not cache if signature is null/undefined", () => {
      cacheSignature("tool_123", null as unknown as string);
      cacheSignature("tool_456", undefined as unknown as string);
      expect(getCacheSize()).toBe(0);
    });

    it("overwrites existing signature for the same toolUseId", () => {
      cacheSignature("tool_123", "signature_old");
      cacheSignature("tool_123", "signature_new");
      expect(getCachedSignature("tool_123")).toBe("signature_new");
      expect(getCacheSize()).toBe(1);
    });
  });

  describe("getCachedSignature", () => {
    it("returns cached signature", () => {
      cacheSignature("tool_abc", "mysig");
      expect(getCachedSignature("tool_abc")).toBe("mysig");
    });

    it("returns null for non-existent toolUseId", () => {
      expect(getCachedSignature("nonexistent")).toBeNull();
    });

    it("returns null for empty toolUseId", () => {
      expect(getCachedSignature("")).toBeNull();
    });

    it("returns null for null/undefined toolUseId", () => {
      expect(getCachedSignature(null as unknown as string)).toBeNull();
      expect(getCachedSignature(undefined as unknown as string)).toBeNull();
    });

    it("returns null for expired signature (TTL exceeded)", () => {
      vi.useFakeTimers();
      cacheSignature("tool_expire", "sig_expire");
      expect(getCachedSignature("tool_expire")).toBe("sig_expire");

      // Advance time past TTL
      vi.advanceTimersByTime(GEMINI_SIGNATURE_CACHE_TTL_MS + 1000);

      expect(getCachedSignature("tool_expire")).toBeNull();
      expect(getCacheSize()).toBe(0); // Entry should be deleted
    });

    it("returns signature just before TTL expiration", () => {
      vi.useFakeTimers();
      cacheSignature("tool_valid", "sig_valid");

      // Advance time just before TTL
      vi.advanceTimersByTime(GEMINI_SIGNATURE_CACHE_TTL_MS - 1000);

      expect(getCachedSignature("tool_valid")).toBe("sig_valid");
    });
  });

  describe("cleanupCache", () => {
    it("removes expired entries from both caches", () => {
      vi.useFakeTimers();

      // Add entries to both caches
      cacheSignature("tool_1", "sig_1");
      cacheSignature("tool_2", "sig_2");
      const validSignature = "a".repeat(MIN_SIGNATURE_LENGTH);
      cacheThinkingSignature(validSignature, "claude");

      expect(getCacheSize()).toBe(2);
      expect(getThinkingCacheSize()).toBe(1);

      // Advance time past TTL
      vi.advanceTimersByTime(GEMINI_SIGNATURE_CACHE_TTL_MS + 1000);

      cleanupCache();

      expect(getCacheSize()).toBe(0);
      expect(getThinkingCacheSize()).toBe(0);
    });

    it("keeps non-expired entries", () => {
      vi.useFakeTimers();

      cacheSignature("tool_old", "sig_old");

      // Advance time partially
      vi.advanceTimersByTime(GEMINI_SIGNATURE_CACHE_TTL_MS / 2);

      cacheSignature("tool_new", "sig_new");

      // Advance time to expire only the first entry
      vi.advanceTimersByTime(GEMINI_SIGNATURE_CACHE_TTL_MS / 2 + 1000);

      cleanupCache();

      expect(getCachedSignature("tool_old")).toBeNull();
      expect(getCachedSignature("tool_new")).toBe("sig_new");
      expect(getCacheSize()).toBe(1);
    });

    it("handles empty cache gracefully", () => {
      expect(() => cleanupCache()).not.toThrow();
      expect(getCacheSize()).toBe(0);
    });
  });

  describe("getCacheSize", () => {
    it("returns 0 for empty cache", () => {
      expect(getCacheSize()).toBe(0);
    });

    it("returns correct count after adding entries", () => {
      cacheSignature("tool_1", "sig_1");
      expect(getCacheSize()).toBe(1);

      cacheSignature("tool_2", "sig_2");
      expect(getCacheSize()).toBe(2);

      cacheSignature("tool_3", "sig_3");
      expect(getCacheSize()).toBe(3);
    });

    it("does not count duplicate entries", () => {
      cacheSignature("tool_1", "sig_1");
      cacheSignature("tool_1", "sig_1_updated");
      expect(getCacheSize()).toBe(1);
    });
  });

  describe("cacheThinkingSignature", () => {
    it("caches a thinking signature with model family", () => {
      const validSig = "x".repeat(MIN_SIGNATURE_LENGTH);
      cacheThinkingSignature(validSig, "claude");
      expect(getCachedSignatureFamily(validSig)).toBe("claude");
    });

    it("caches signature for gemini family", () => {
      const validSig = "y".repeat(MIN_SIGNATURE_LENGTH);
      cacheThinkingSignature(validSig, "gemini");
      expect(getCachedSignatureFamily(validSig)).toBe("gemini");
    });

    it("does not cache signature shorter than MIN_SIGNATURE_LENGTH", () => {
      const shortSig = "a".repeat(MIN_SIGNATURE_LENGTH - 1);
      cacheThinkingSignature(shortSig, "claude");
      expect(getThinkingCacheSize()).toBe(0);
    });

    it("does not cache empty signature", () => {
      cacheThinkingSignature("", "claude");
      expect(getThinkingCacheSize()).toBe(0);
    });

    it("does not cache null/undefined signature", () => {
      cacheThinkingSignature(null as unknown as string, "claude");
      cacheThinkingSignature(undefined as unknown as string, "gemini");
      expect(getThinkingCacheSize()).toBe(0);
    });

    it("overwrites existing signature entry", () => {
      const sig = "z".repeat(MIN_SIGNATURE_LENGTH);
      cacheThinkingSignature(sig, "claude");
      cacheThinkingSignature(sig, "gemini");
      expect(getCachedSignatureFamily(sig)).toBe("gemini");
      expect(getThinkingCacheSize()).toBe(1);
    });
  });

  describe("getCachedSignatureFamily", () => {
    it("returns model family for cached signature", () => {
      const sig = "m".repeat(MIN_SIGNATURE_LENGTH);
      cacheThinkingSignature(sig, "claude");
      expect(getCachedSignatureFamily(sig)).toBe("claude");
    });

    it("returns null for non-existent signature", () => {
      expect(getCachedSignatureFamily("nonexistent")).toBeNull();
    });

    it("returns null for empty signature", () => {
      expect(getCachedSignatureFamily("")).toBeNull();
    });

    it("returns null for null/undefined signature", () => {
      expect(getCachedSignatureFamily(null as unknown as string)).toBeNull();
      expect(getCachedSignatureFamily(undefined as unknown as string)).toBeNull();
    });

    it("returns null for expired thinking signature", () => {
      vi.useFakeTimers();
      const sig = "n".repeat(MIN_SIGNATURE_LENGTH);
      cacheThinkingSignature(sig, "gemini");

      // Advance time past TTL
      vi.advanceTimersByTime(GEMINI_SIGNATURE_CACHE_TTL_MS + 1000);

      expect(getCachedSignatureFamily(sig)).toBeNull();
      expect(getThinkingCacheSize()).toBe(0);
    });
  });

  describe("getThinkingCacheSize", () => {
    it("returns 0 for empty cache", () => {
      expect(getThinkingCacheSize()).toBe(0);
    });

    it("returns correct count after adding entries", () => {
      cacheThinkingSignature("a".repeat(MIN_SIGNATURE_LENGTH), "claude");
      expect(getThinkingCacheSize()).toBe(1);

      cacheThinkingSignature("b".repeat(MIN_SIGNATURE_LENGTH), "gemini");
      expect(getThinkingCacheSize()).toBe(2);
    });
  });

  describe("_resetCacheForTesting", () => {
    it("clears all caches", () => {
      cacheSignature("tool_1", "sig_1");
      cacheThinkingSignature("c".repeat(MIN_SIGNATURE_LENGTH), "claude");

      expect(getCacheSize()).toBe(1);
      expect(getThinkingCacheSize()).toBe(1);

      _resetCacheForTesting();

      expect(getCacheSize()).toBe(0);
      expect(getThinkingCacheSize()).toBe(0);
    });
  });
});
