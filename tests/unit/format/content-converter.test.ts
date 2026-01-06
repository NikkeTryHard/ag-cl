/**
 * Unit tests for content-converter.ts
 *
 * Tests conversion of Anthropic message content to Google Generative AI parts format.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { convertRole, convertContentToParts } from "../../../src/format/content-converter.js";
import { cacheSignature, cacheThinkingSignature, _resetCacheForTesting } from "../../../src/format/signature-cache.js";
import { MIN_SIGNATURE_LENGTH, GEMINI_SKIP_SIGNATURE } from "../../../src/constants.js";
import type { AnthropicContentBlock, GooglePart } from "../../../src/format/types.js";

// Reset signature cache before each test
beforeEach(() => {
  _resetCacheForTesting();
});

describe("convertRole", () => {
  it('converts "assistant" to "model"', () => {
    expect(convertRole("assistant")).toBe("model");
  });

  it('converts "user" to "user"', () => {
    expect(convertRole("user")).toBe("user");
  });

  it("defaults to user for unknown roles", () => {
    expect(convertRole("system")).toBe("user");
    expect(convertRole("")).toBe("user");
    expect(convertRole("other")).toBe("user");
  });
});

describe("convertContentToParts", () => {
  describe("string content", () => {
    it("converts simple string to text part", () => {
      const result = convertContentToParts("Hello, world!");
      expect(result).toEqual([{ text: "Hello, world!" }]);
    });

    it("handles empty string", () => {
      const result = convertContentToParts("");
      expect(result).toEqual([{ text: "" }]);
    });
  });

  describe("non-array content", () => {
    it("converts non-array content to string", () => {
      const result = convertContentToParts(123 as unknown as string);
      expect(result).toEqual([{ text: "123" }]);
    });
  });

  describe("text blocks", () => {
    it("converts text block to text part", () => {
      const content: AnthropicContentBlock[] = [{ type: "text", text: "Hello" }];
      const result = convertContentToParts(content);
      expect(result).toEqual([{ text: "Hello" }]);
    });

    it("skips empty text blocks", () => {
      const content: AnthropicContentBlock[] = [
        { type: "text", text: "" },
        { type: "text", text: "   " },
        { type: "text", text: "Valid" },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([{ text: "Valid" }]);
    });

    it("handles multiple text blocks", () => {
      const content: AnthropicContentBlock[] = [
        { type: "text", text: "First" },
        { type: "text", text: "Second" },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([{ text: "First" }, { text: "Second" }]);
    });
  });

  describe("image blocks", () => {
    it("converts base64 image to inlineData part", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: "iVBORw0KGgo=",
          },
        },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([
        {
          inlineData: {
            mimeType: "image/png",
            data: "iVBORw0KGgo=",
          },
        },
      ]);
    });

    it("converts URL image to fileData part", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "image",
          source: {
            type: "url",
            media_type: "image/jpeg",
            url: "https://example.com/image.jpg",
          },
        },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([
        {
          fileData: {
            mimeType: "image/jpeg",
            fileUri: "https://example.com/image.jpg",
          },
        },
      ]);
    });

    it("uses default mime type for URL images without media_type", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "image",
          source: {
            type: "url",
            media_type: "",
            url: "https://example.com/image.jpg",
          },
        },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([
        {
          fileData: {
            mimeType: "image/jpeg",
            fileUri: "https://example.com/image.jpg",
          },
        },
      ]);
    });
  });

  describe("document blocks", () => {
    it("converts base64 document to inlineData part", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: "JVBERi0xLjQ=",
          },
        },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([
        {
          inlineData: {
            mimeType: "application/pdf",
            data: "JVBERi0xLjQ=",
          },
        },
      ]);
    });

    it("converts URL document to fileData part", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "document",
          source: {
            type: "url",
            media_type: "application/pdf",
            url: "https://example.com/doc.pdf",
          },
        },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([
        {
          fileData: {
            mimeType: "application/pdf",
            fileUri: "https://example.com/doc.pdf",
          },
        },
      ]);
    });

    it("uses default mime type for URL documents without media_type", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "document",
          source: {
            type: "url",
            media_type: "",
            url: "https://example.com/doc.pdf",
          },
        },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([
        {
          fileData: {
            mimeType: "application/pdf",
            fileUri: "https://example.com/doc.pdf",
          },
        },
      ]);
    });
  });

  describe("tool_use blocks", () => {
    it("converts tool_use to functionCall for Claude model", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_use",
          id: "tool_123",
          name: "get_weather",
          input: { city: "Tokyo" },
        },
      ];
      const result = convertContentToParts(content, true, false);
      expect(result).toEqual([
        {
          functionCall: {
            name: "get_weather",
            args: { city: "Tokyo" },
            id: "tool_123",
          },
        },
      ]);
    });

    it("does not include id for non-Claude models", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_use",
          id: "tool_123",
          name: "get_weather",
          input: { city: "Tokyo" },
        },
      ];
      const result = convertContentToParts(content, false, false);
      expect(result).toEqual([
        {
          functionCall: {
            name: "get_weather",
            args: { city: "Tokyo" },
          },
        },
      ]);
    });

    it("includes thoughtSignature from block for Gemini models", () => {
      const content = [
        {
          type: "tool_use" as const,
          id: "tool_456",
          name: "search",
          input: { query: "test" },
          thoughtSignature: "gemini_sig_123",
        },
      ];
      const result = convertContentToParts(content as AnthropicContentBlock[], false, true);
      expect(result[0]).toMatchObject({
        functionCall: { name: "search", args: { query: "test" } },
        thoughtSignature: "gemini_sig_123",
      });
    });

    it("restores thoughtSignature from cache for Gemini models", () => {
      cacheSignature("tool_cached", "cached_sig_abc");
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_use",
          id: "tool_cached",
          name: "read_file",
          input: { path: "/tmp/file.txt" },
        },
      ];
      const result = convertContentToParts(content, false, true);
      expect(result[0]).toMatchObject({
        functionCall: { name: "read_file", args: { path: "/tmp/file.txt" } },
        thoughtSignature: "cached_sig_abc",
      });
    });

    it("uses GEMINI_SKIP_SIGNATURE when no signature available for Gemini", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_use",
          id: "tool_no_sig",
          name: "list_files",
          input: {},
        },
      ];
      const result = convertContentToParts(content, false, true);
      expect(result[0]).toMatchObject({
        functionCall: { name: "list_files", args: {} },
        thoughtSignature: GEMINI_SKIP_SIGNATURE,
      });
    });

    it("handles empty input", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_use",
          id: "tool_empty",
          name: "no_args_tool",
          input: {},
        },
      ];
      const result = convertContentToParts(content);
      expect(result[0]).toMatchObject({
        functionCall: { name: "no_args_tool", args: {} },
      });
    });
  });

  describe("tool_result blocks", () => {
    it("converts string tool_result to functionResponse", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_result",
          tool_use_id: "tool_123",
          content: "Success: File created",
        },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([
        {
          functionResponse: {
            name: "tool_123",
            response: { result: "Success: File created" },
          },
        },
      ]);
    });

    it("includes id for Claude models", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_result",
          tool_use_id: "tool_claude",
          content: "Done",
        },
      ];
      const result = convertContentToParts(content, true, false);
      expect(result[0]).toMatchObject({
        functionResponse: {
          name: "tool_claude",
          response: { result: "Done" },
          id: "tool_claude",
        },
      });
    });

    it("converts array tool_result with text content", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_result",
          tool_use_id: "tool_arr",
          content: [
            { type: "text", text: "Line 1" },
            { type: "text", text: "Line 2" },
          ],
        },
      ];
      const result = convertContentToParts(content);
      expect(result[0]).toMatchObject({
        functionResponse: {
          name: "tool_arr",
          response: { result: "Line 1\nLine 2" },
        },
      });
    });

    it("extracts images from tool_result and adds as separate parts", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_result",
          tool_use_id: "tool_img",
          content: [
            { type: "text", text: "Screenshot taken" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "base64data",
              },
            },
          ],
        },
      ];
      const result = convertContentToParts(content);
      expect(result.length).toBe(2);
      expect(result[0]).toMatchObject({
        functionResponse: {
          name: "tool_img",
          response: { result: "Screenshot taken" },
        },
      });
      expect(result[1]).toMatchObject({
        inlineData: {
          mimeType: "image/png",
          data: "base64data",
        },
      });
    });

    it("handles tool_result with only image content", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_result",
          tool_use_id: "tool_only_img",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: "jpegdata",
              },
            },
          ],
        },
      ];
      const result = convertContentToParts(content);
      expect(result[0]).toMatchObject({
        functionResponse: {
          name: "tool_only_img",
          response: { result: "Image attached" },
        },
      });
    });

    it("handles empty array content", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "tool_result",
          tool_use_id: "tool_empty",
          content: [],
        },
      ];
      const result = convertContentToParts(content);
      expect(result[0]).toMatchObject({
        functionResponse: {
          name: "tool_empty",
          response: { result: "" },
        },
      });
    });

    it("uses 'unknown' as name when tool_use_id is missing", () => {
      const content = [
        {
          type: "tool_result" as const,
          tool_use_id: undefined as unknown as string,
          content: "result",
        },
      ];
      const result = convertContentToParts(content as AnthropicContentBlock[]);
      expect(result[0]).toMatchObject({
        functionResponse: {
          name: "unknown",
          response: { result: "result" },
        },
      });
    });
  });

  describe("thinking blocks", () => {
    it("converts thinking block with valid signature to thought part for Gemini", () => {
      const validSig = "x".repeat(MIN_SIGNATURE_LENGTH);
      // Pre-cache the signature as gemini family
      cacheThinkingSignature(validSig, "gemini");

      const content: AnthropicContentBlock[] = [
        {
          type: "thinking",
          thinking: "Let me think about this...",
          signature: validSig,
        },
      ];
      const result = convertContentToParts(content, false, true);
      expect(result).toEqual([
        {
          text: "Let me think about this...",
          thought: true,
          thoughtSignature: validSig,
        },
      ]);
    });

    it("drops thinking block with signature below MIN_SIGNATURE_LENGTH", () => {
      const shortSig = "x".repeat(MIN_SIGNATURE_LENGTH - 1);
      const content: AnthropicContentBlock[] = [
        {
          type: "thinking",
          thinking: "Short signature thinking",
          signature: shortSig,
        },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([]);
    });

    it("drops thinking block without signature", () => {
      const content: AnthropicContentBlock[] = [
        {
          type: "thinking",
          thinking: "Unsigned thinking",
        },
      ];
      const result = convertContentToParts(content);
      expect(result).toEqual([]);
    });

    it("drops thinking block with incompatible signature family for Gemini", () => {
      const validSig = "c".repeat(MIN_SIGNATURE_LENGTH);
      // Cache as Claude signature
      cacheThinkingSignature(validSig, "claude");

      const content: AnthropicContentBlock[] = [
        {
          type: "thinking",
          thinking: "Claude thinking going to Gemini",
          signature: validSig,
        },
      ];
      const result = convertContentToParts(content, false, true);
      // Should be dropped due to incompatible family
      expect(result).toEqual([]);
    });

    it("drops thinking block with unknown signature origin for Gemini", () => {
      const unknownSig = "u".repeat(MIN_SIGNATURE_LENGTH);
      // Don't cache - signature origin is unknown

      const content: AnthropicContentBlock[] = [
        {
          type: "thinking",
          thinking: "Unknown origin thinking",
          signature: unknownSig,
        },
      ];
      const result = convertContentToParts(content, false, true);
      // Should be dropped due to unknown origin (cold cache)
      expect(result).toEqual([]);
    });

    it("keeps thinking block with compatible signature for Claude", () => {
      const validSig = "d".repeat(MIN_SIGNATURE_LENGTH);
      // Cache as Claude signature
      cacheThinkingSignature(validSig, "claude");

      const content: AnthropicContentBlock[] = [
        {
          type: "thinking",
          thinking: "Claude thinking for Claude",
          signature: validSig,
        },
      ];
      const result = convertContentToParts(content, true, false);
      expect(result).toEqual([
        {
          text: "Claude thinking for Claude",
          thought: true,
          thoughtSignature: validSig,
        },
      ]);
    });
  });

  describe("null/undefined handling", () => {
    it("skips null blocks in array", () => {
      const content = [null, { type: "text", text: "Valid" }] as unknown as AnthropicContentBlock[];
      const result = convertContentToParts(content);
      expect(result).toEqual([{ text: "Valid" }]);
    });

    it("skips undefined blocks in array", () => {
      const content = [undefined, { type: "text", text: "Valid" }] as unknown as AnthropicContentBlock[];
      const result = convertContentToParts(content);
      expect(result).toEqual([{ text: "Valid" }]);
    });
  });

  describe("mixed content", () => {
    it("converts mixed content types correctly", () => {
      const validSig = "m".repeat(MIN_SIGNATURE_LENGTH);
      cacheThinkingSignature(validSig, "gemini");

      const content: AnthropicContentBlock[] = [
        {
          type: "thinking",
          thinking: "Thinking first",
          signature: validSig,
        },
        { type: "text", text: "Then text" },
        {
          type: "tool_use",
          id: "tool_mix",
          name: "mixed_tool",
          input: { arg: 1 },
        },
      ];
      const result = convertContentToParts(content, false, true);
      expect(result.length).toBe(3);
      expect(result[0]).toMatchObject({ thought: true });
      expect(result[1]).toMatchObject({ text: "Then text" });
      expect(result[2]).toMatchObject({ functionCall: { name: "mixed_tool" } });
    });
  });
});
