/**
 * Unit tests for response-converter.ts
 *
 * Tests conversion of Google Generative AI responses to Anthropic Messages API format.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { convertGoogleToAnthropic } from "../../../src/format/response-converter.js";
import { _resetCacheForTesting, getCachedSignature, getCachedSignatureFamily } from "../../../src/format/signature-cache.js";
import { MIN_SIGNATURE_LENGTH } from "../../../src/constants.js";
import { createGoogleResponse, createGoogleThinkingPart, createGoogleFunctionCallPart } from "../../helpers/factories.js";
import type { GoogleResponse, GooglePart } from "../../../src/format/types.js";

beforeEach(() => {
  _resetCacheForTesting();
});

describe("convertGoogleToAnthropic", () => {
  describe("basic text responses", () => {
    it("converts simple text response", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: { parts: [{ text: "Hello, world!" }] },
            finishReason: "STOP",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Hello, world!",
      });
    });

    it("handles multiple text parts", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: { parts: [{ text: "First part." }, { text: "Second part." }] },
            finishReason: "STOP",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toMatchObject({ type: "text", text: "First part." });
      expect(result.content[1]).toMatchObject({ type: "text", text: "Second part." });
    });

    it("returns empty text block when no content", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: { parts: [] },
            finishReason: "STOP",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({ type: "text", text: "" });
    });
  });

  describe("thinking responses", () => {
    it("converts thinking part to thinking block", () => {
      const validSig = "t".repeat(MIN_SIGNATURE_LENGTH);
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [createGoogleThinkingPart("Let me think about this...", validSig) as GooglePart, { text: "Here is my answer." }],
            },
            finishReason: "STOP",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toMatchObject({
        type: "thinking",
        thinking: "Let me think about this...",
        signature: validSig,
      });
      expect(result.content[1]).toMatchObject({
        type: "text",
        text: "Here is my answer.",
      });
    });

    it("includes empty signature when not provided", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [createGoogleThinkingPart("Thinking", undefined) as GooglePart],
            },
            finishReason: "STOP",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.content[0]).toMatchObject({
        type: "thinking",
        signature: "",
      });
    });

    it("caches thinking signature with model family", () => {
      const validSig = "c".repeat(MIN_SIGNATURE_LENGTH);
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [createGoogleThinkingPart("Thinking", validSig) as GooglePart],
            },
            finishReason: "STOP",
          },
        ],
      });
      convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(getCachedSignatureFamily(validSig)).toBe("claude");
    });

    it("caches Gemini thinking signature correctly", () => {
      const validSig = "g".repeat(MIN_SIGNATURE_LENGTH);
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [createGoogleThinkingPart("Thinking", validSig) as GooglePart],
            },
            finishReason: "STOP",
          },
        ],
      });
      convertGoogleToAnthropic(googleResponse, "gemini-3-pro-high");

      expect(getCachedSignatureFamily(validSig)).toBe("gemini");
    });

    it("does not cache short signatures", () => {
      const shortSig = "s".repeat(MIN_SIGNATURE_LENGTH - 1);
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [createGoogleThinkingPart("Thinking", shortSig) as GooglePart],
            },
            finishReason: "STOP",
          },
        ],
      });
      convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(getCachedSignatureFamily(shortSig)).toBeNull();
    });
  });

  describe("function call responses", () => {
    it("converts functionCall to tool_use block", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [createGoogleFunctionCallPart("get_weather", { city: "Tokyo" }) as GooglePart],
            },
            finishReason: "TOOL_USE",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "tool_use",
        name: "get_weather",
        input: { city: "Tokyo" },
      });
      expect(result.content[0]).toHaveProperty("id");
    });

    it("uses id from response if available", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: {
                    name: "test_tool",
                    args: {},
                    id: "tool_123",
                  },
                },
              ],
            },
            finishReason: "TOOL_USE",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.content[0]).toMatchObject({
        type: "tool_use",
        id: "tool_123",
      });
    });

    it("generates id if not in response", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [createGoogleFunctionCallPart("tool", {}) as GooglePart],
            },
            finishReason: "TOOL_USE",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.content[0]).toHaveProperty("id");
      expect((result.content[0] as { id: string }).id).toMatch(/^toolu_/);
    });

    it("includes thoughtSignature from Gemini 3+ responses", () => {
      const validSig = "f".repeat(MIN_SIGNATURE_LENGTH);
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [createGoogleFunctionCallPart("tool", { arg: 1 }, validSig) as GooglePart],
            },
            finishReason: "TOOL_USE",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.content[0]).toHaveProperty("thoughtSignature", validSig);
    });

    it("caches thoughtSignature for tool_use", () => {
      const validSig = "x".repeat(MIN_SIGNATURE_LENGTH);
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: "tool", args: {}, id: "tool_cache_test" },
                  thoughtSignature: validSig,
                },
              ],
            },
            finishReason: "TOOL_USE",
          },
        ],
      });
      convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(getCachedSignature("tool_cache_test")).toBe(validSig);
    });

    it("handles empty args", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: "no_args" },
                },
              ],
            },
            finishReason: "TOOL_USE",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.content[0]).toMatchObject({
        type: "tool_use",
        name: "no_args",
        input: {},
      });
    });

    it("handles multiple tool calls", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: {
              parts: [createGoogleFunctionCallPart("tool1", { a: 1 }) as GooglePart, createGoogleFunctionCallPart("tool2", { b: 2 }) as GooglePart],
            },
            finishReason: "TOOL_USE",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toMatchObject({ type: "tool_use", name: "tool1" });
      expect(result.content[1]).toMatchObject({ type: "tool_use", name: "tool2" });
    });
  });

  describe("stop reason", () => {
    it('returns "end_turn" for STOP', () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Done" }] }, finishReason: "STOP" }],
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.stop_reason).toBe("end_turn");
    });

    it('returns "max_tokens" for MAX_TOKENS', () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Truncated" }] }, finishReason: "MAX_TOKENS" }],
      });
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.stop_reason).toBe("max_tokens");
    });

    it('returns "tool_use" for TOOL_USE finish reason', () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: { parts: [createGoogleFunctionCallPart("tool", {}) as GooglePart] },
            finishReason: "TOOL_USE",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.stop_reason).toBe("tool_use");
    });

    it('returns "end_turn" when has tool calls with STOP reason (STOP takes precedence)', () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: { parts: [createGoogleFunctionCallPart("tool", {}) as GooglePart] },
            finishReason: "STOP",
          },
        ],
      });
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      // Note: The code checks STOP first, so it returns end_turn even with tool calls
      // This matches the implementation where STOP takes precedence
      expect(result.stop_reason).toBe("end_turn");
    });

    it('defaults to "end_turn" for unknown finish reason', () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Text" }] }, finishReason: "UNKNOWN" }],
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.stop_reason).toBe("end_turn");
    });
  });

  describe("usage metadata", () => {
    it("calculates input_tokens correctly (prompt - cached)", () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Response" }] }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          cachedContentTokenCount: 30,
        },
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.usage.input_tokens).toBe(70); // 100 - 30
      expect(result.usage.output_tokens).toBe(50);
      expect(result.usage.cache_read_input_tokens).toBe(30);
    });

    it("handles missing usage metadata", () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Response" }] }, finishReason: "STOP" }],
        usageMetadata: undefined,
      });
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.usage.input_tokens).toBe(0);
      expect(result.usage.output_tokens).toBe(0);
      expect(result.usage.cache_read_input_tokens).toBe(0);
    });

    it("handles missing cached token count", () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Response" }] }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
        },
      });
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.usage.input_tokens).toBe(100);
      expect(result.usage.cache_read_input_tokens).toBe(0);
    });

    it("always sets cache_creation_input_tokens to 0", () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.usage.cache_creation_input_tokens).toBe(0);
    });
  });

  describe("response structure", () => {
    it("generates unique message id", () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.id).toMatch(/^msg_[a-f0-9]+$/);
    });

    it('sets type to "message"', () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.type).toBe("message");
    });

    it('sets role to "assistant"', () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.role).toBe("assistant");
    });

    it("includes model name in response", () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "claude-opus-4-5-thinking");

      expect(result.model).toBe("claude-opus-4-5-thinking");
    });

    it("sets stop_sequence to null", () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.stop_sequence).toBeNull();
    });
  });

  describe("response wrapper handling", () => {
    it("handles nested response object", () => {
      const googleResponse: GoogleResponse = {
        response: {
          candidates: [{ content: { parts: [{ text: "Nested" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        },
      };
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.content[0]).toMatchObject({ type: "text", text: "Nested" });
    });

    it("handles flat response object", () => {
      const googleResponse: GoogleResponse = {
        candidates: [{ content: { parts: [{ text: "Flat" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      };
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.content[0]).toMatchObject({ type: "text", text: "Flat" });
    });
  });

  describe("edge cases", () => {
    it("handles empty candidates array", () => {
      const googleResponse: GoogleResponse = {
        candidates: [],
        usageMetadata: { promptTokenCount: 10 },
      };
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({ type: "text", text: "" });
    });

    it("handles missing content in candidate", () => {
      const googleResponse: GoogleResponse = {
        candidates: [{ finishReason: "STOP" }],
      };
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({ type: "text", text: "" });
    });

    it("handles missing parts in content", () => {
      const googleResponse: GoogleResponse = {
        candidates: [{ content: {}, finishReason: "STOP" }],
      };
      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({ type: "text", text: "" });
    });

    it("handles undefined text in part", () => {
      const googleResponse: GoogleResponse = {
        candidates: [
          {
            content: { parts: [{ text: undefined }] },
            finishReason: "STOP",
          },
        ],
      };
      const result = convertGoogleToAnthropic(googleResponse, "gemini-3-flash");

      // Should skip parts with undefined text
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({ type: "text", text: "" });
    });
  });
});
