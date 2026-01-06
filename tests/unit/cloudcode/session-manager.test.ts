/**
 * Unit tests for session-manager
 *
 * Tests session ID derivation from Anthropic requests for prompt caching.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as crypto from "crypto";
import { deriveSessionId } from "../../../src/cloudcode/session-manager.js";
import type { AnthropicRequest } from "../../../src/format/types.js";

describe("deriveSessionId", () => {
  describe("with string content", () => {
    it("derives session ID from first user message with string content", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "Hello world" },
        ],
      };

      const sessionId = deriveSessionId(request);

      // Should be first 32 chars of SHA256 hash
      expect(sessionId).toHaveLength(32);
      expect(sessionId).toMatch(/^[a-f0-9]{32}$/);
    });

    it("produces deterministic output for same content", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "Consistent message" },
        ],
      };

      const sessionId1 = deriveSessionId(request);
      const sessionId2 = deriveSessionId(request);

      expect(sessionId1).toBe(sessionId2);
    });

    it("produces different output for different content", () => {
      const request1: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Message A" }],
      };

      const request2: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [{ role: "user", content: "Message B" }],
      };

      const sessionId1 = deriveSessionId(request1);
      const sessionId2 = deriveSessionId(request2);

      expect(sessionId1).not.toBe(sessionId2);
    });

    it("uses first user message only, ignoring subsequent messages", () => {
      const request1: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "First message" },
        ],
      };

      const request2: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "First message" },
          { role: "assistant", content: "Response" },
          { role: "user", content: "Second message" },
        ],
      };

      const sessionId1 = deriveSessionId(request1);
      const sessionId2 = deriveSessionId(request2);

      expect(sessionId1).toBe(sessionId2);
    });

    it("skips assistant messages to find first user message", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "assistant", content: "I am ready" },
          { role: "user", content: "Hello" },
        ],
      };

      // Should still derive from "Hello"
      const sessionId = deriveSessionId(request);
      expect(sessionId).toHaveLength(32);
      expect(sessionId).toMatch(/^[a-f0-9]{32}$/);
    });
  });

  describe("with array content blocks", () => {
    it("extracts text from content blocks", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Hello" },
              { type: "text", text: "World" },
            ],
          },
        ],
      };

      const sessionId = deriveSessionId(request);

      expect(sessionId).toHaveLength(32);
      expect(sessionId).toMatch(/^[a-f0-9]{32}$/);
    });

    it("produces consistent hash for joined text blocks", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Hello" },
              { type: "text", text: "World" },
            ],
          },
        ],
      };

      // Expected: "Hello\nWorld"
      const expectedHash = crypto.createHash("sha256").update("Hello\nWorld").digest("hex").substring(0, 32);
      const sessionId = deriveSessionId(request);

      expect(sessionId).toBe(expectedHash);
    });

    it("ignores non-text content blocks", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: "abc123" } },
              { type: "text", text: "Caption" },
            ],
          },
        ],
      };

      // Should derive from "Caption" only
      const expectedHash = crypto.createHash("sha256").update("Caption").digest("hex").substring(0, 32);
      const sessionId = deriveSessionId(request);

      expect(sessionId).toBe(expectedHash);
    });
  });

  describe("with no user messages", () => {
    it("returns UUID when no messages", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [],
      };

      const sessionId = deriveSessionId(request);

      // Should return a valid UUID format
      expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
    });

    it("returns UUID when only assistant messages", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "assistant", content: "Hello" },
        ],
      };

      const sessionId = deriveSessionId(request);

      // Should return a valid UUID format
      expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
    });

    it("returns UUID when messages array is undefined", () => {
      const request = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
      } as AnthropicRequest;

      const sessionId = deriveSessionId(request);

      // Should return a valid UUID format
      expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
    });
  });

  describe("with empty content", () => {
    it("returns UUID for empty string content", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "" },
        ],
      };

      const sessionId = deriveSessionId(request);

      // Empty string should fall back to UUID
      expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
    });

    it("returns UUID for empty content array", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "user", content: [] },
        ],
      };

      const sessionId = deriveSessionId(request);

      // Empty array should fall back to UUID
      expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
    });

    it("returns UUID for content array with only non-text blocks", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: "abc" } },
            ],
          },
        ],
      };

      const sessionId = deriveSessionId(request);

      // No text blocks means empty joined string, falls back to UUID
      expect(sessionId).toMatch(/^[a-f0-9-]{36}$/);
    });

    it("hashes content when text blocks have empty strings joined with newline", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "" },
              { type: "text", text: "" },
            ],
          },
        ],
      };

      const sessionId = deriveSessionId(request);

      // Empty texts joined with newline is "\n", which is truthy so it should hash it
      // Expected: SHA256("\n") prefix
      const expectedHash = crypto.createHash("sha256").update("\n").digest("hex").substring(0, 32);
      expect(sessionId).toBe(expectedHash);
    });
  });

  describe("determinism", () => {
    it("same input always produces same output", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "Deterministic test message" },
        ],
      };

      const results: string[] = [];
      for (let i = 0; i < 10; i++) {
        results.push(deriveSessionId(request));
      }

      // All results should be identical
      expect(new Set(results).size).toBe(1);
    });

    it("produces expected SHA256 hash prefix", () => {
      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 1024,
        messages: [
          { role: "user", content: "test" },
        ],
      };

      // Known SHA256 of "test": 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08
      const expectedPrefix = "9f86d081884c7d659a2feaa0c55ad015";
      const sessionId = deriveSessionId(request);

      expect(sessionId).toBe(expectedPrefix);
    });
  });
});
