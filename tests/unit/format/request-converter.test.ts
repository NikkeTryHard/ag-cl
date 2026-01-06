/**
 * Unit tests for request-converter.ts
 *
 * Tests conversion of Anthropic Messages API requests to Google Generative AI format.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { convertAnthropicToGoogle } from "../../../src/format/request-converter.js";
import { _resetCacheForTesting, cacheThinkingSignature } from "../../../src/format/signature-cache.js";
import { MIN_SIGNATURE_LENGTH, GEMINI_MAX_OUTPUT_TOKENS } from "../../../src/constants.js";
import { createAnthropicRequest, createAnthropicMessage, createTextBlock, createToolUseBlock, createToolResultBlock, createThinkingBlock } from "../../helpers/factories.js";
import type { AnthropicRequest, AnthropicMessage, AnthropicContentBlock } from "../../../src/format/types.js";

beforeEach(() => {
  _resetCacheForTesting();
});

describe("convertAnthropicToGoogle", () => {
  describe("basic conversion", () => {
    it("converts simple user message", () => {
      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
        messages: [{ role: "user", content: "Hello" }],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].role).toBe("user");
      expect(result.contents[0].parts).toEqual([{ text: "Hello" }]);
    });

    it("converts assistant message to model role", () => {
      const request = createAnthropicRequest({
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: [createTextBlock("Hi there!")] },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.contents[1].role).toBe("model");
      expect(result.contents[1].parts).toEqual([{ text: "Hi there!" }]);
    });

    it("handles multiple messages", () => {
      const request = createAnthropicRequest({
        messages: [
          { role: "user", content: "First" },
          { role: "assistant", content: [createTextBlock("Second")] },
          { role: "user", content: "Third" },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.contents).toHaveLength(3);
    });
  });

  describe("system instruction", () => {
    it("converts string system prompt", () => {
      const request = createAnthropicRequest({
        system: "You are a helpful assistant.",
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.systemInstruction).toBeDefined();
      expect(result.systemInstruction?.parts).toEqual([{ text: "You are a helpful assistant." }]);
    });

    it("converts array system prompt with text blocks", () => {
      const request = createAnthropicRequest({
        system: [
          { type: "text", text: "First instruction." },
          { type: "text", text: "Second instruction." },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.systemInstruction?.parts).toEqual([{ text: "First instruction." }, { text: "Second instruction." }]);
    });

    it("adds interleaved thinking hint for Claude thinking models with tools", () => {
      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
        system: "Be helpful.",
        tools: [{ name: "test_tool", description: "A test tool", input_schema: { type: "object" } }],
      });
      const result = convertAnthropicToGoogle(request);

      const systemText = result.systemInstruction?.parts[0]?.text ?? "";
      expect(systemText).toContain("Interleaved thinking is enabled");
    });

    it("does not add hint for Gemini models", () => {
      const request = createAnthropicRequest({
        model: "gemini-3-flash",
        system: "Be helpful.",
        tools: [{ name: "test_tool", description: "A test tool", input_schema: { type: "object" } }],
      });
      const result = convertAnthropicToGoogle(request);

      const systemText = result.systemInstruction?.parts[0]?.text ?? "";
      expect(systemText).not.toContain("Interleaved thinking");
    });
  });

  describe("generation config", () => {
    it("sets maxOutputTokens from max_tokens", () => {
      const request = createAnthropicRequest({
        max_tokens: 2048,
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.maxOutputTokens).toBe(2048);
    });

    it("sets temperature", () => {
      const request = createAnthropicRequest({
        temperature: 0.7,
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.temperature).toBe(0.7);
    });

    it("sets topP", () => {
      const request = createAnthropicRequest({
        top_p: 0.9,
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.topP).toBe(0.9);
    });

    it("sets topK", () => {
      const request = createAnthropicRequest({
        top_k: 40,
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.topK).toBe(40);
    });

    it("sets stopSequences", () => {
      const request = createAnthropicRequest({
        stop_sequences: ["STOP", "END"],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.stopSequences).toEqual(["STOP", "END"]);
    });

    it("does not set stopSequences for empty array", () => {
      const request = createAnthropicRequest({
        stop_sequences: [],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.stopSequences).toBeUndefined();
    });

    it("caps max_tokens for Gemini models", () => {
      const request = createAnthropicRequest({
        model: "gemini-3-flash",
        max_tokens: 100000,
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.maxOutputTokens).toBe(GEMINI_MAX_OUTPUT_TOKENS);
    });

    it("does not cap max_tokens for Claude models", () => {
      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 100000,
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.maxOutputTokens).toBe(100000);
    });
  });

  describe("thinking configuration", () => {
    it("enables thinking for Claude thinking models", () => {
      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.thinkingConfig).toBeDefined();
      expect(result.generationConfig.thinkingConfig?.include_thoughts).toBe(true);
    });

    it("sets thinking_budget for Claude when provided", () => {
      const request = createAnthropicRequest({
        model: "claude-opus-4-5-thinking",
        thinking: { budget_tokens: 10000 },
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.thinkingConfig?.thinking_budget).toBe(10000);
    });

    it("adjusts max_tokens when less than or equal to thinking_budget", () => {
      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
        max_tokens: 5000,
        thinking: { budget_tokens: 10000 },
      });
      const result = convertAnthropicToGoogle(request);

      // Should be adjusted to budget + 8192
      expect(result.generationConfig.maxOutputTokens).toBe(10000 + 8192);
    });

    it("enables thinking for Gemini 3+ models", () => {
      const request = createAnthropicRequest({
        model: "gemini-3-flash",
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.thinkingConfig).toBeDefined();
      expect(result.generationConfig.thinkingConfig?.includeThoughts).toBe(true);
    });

    it("sets default thinkingBudget for Gemini", () => {
      const request = createAnthropicRequest({
        model: "gemini-3-pro-high",
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.thinkingConfig?.thinkingBudget).toBe(16000);
    });

    it("uses provided thinking budget for Gemini", () => {
      const request = createAnthropicRequest({
        model: "gemini-3-flash",
        thinking: { budget_tokens: 8000 },
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.thinkingConfig?.thinkingBudget).toBe(8000);
    });

    it("does not enable thinking for non-thinking models", () => {
      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5", // No "thinking" in name
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.generationConfig.thinkingConfig).toBeUndefined();
    });
  });

  describe("tools conversion", () => {
    it("converts tools to functionDeclarations", () => {
      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
        tools: [
          {
            name: "get_weather",
            description: "Get weather for a city",
            input_schema: {
              type: "object",
              properties: {
                city: { type: "string", description: "City name" },
              },
              required: ["city"],
            },
          },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.tools).toHaveLength(1);
      expect(result.tools?.[0].functionDeclarations).toHaveLength(1);
      expect(result.tools?.[0].functionDeclarations[0].name).toBe("get_weather");
      expect(result.tools?.[0].functionDeclarations[0].description).toBe("Get weather for a city");
    });

    it("sanitizes tool name (removes special chars)", () => {
      const request = createAnthropicRequest({
        tools: [
          {
            name: "my.tool@name#test",
            description: "Test",
            input_schema: { type: "object" },
          },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.tools?.[0].functionDeclarations[0].name).toBe("my_tool_name_test");
    });

    it("truncates long tool names to 64 characters", () => {
      const longName = "a".repeat(100);
      const request = createAnthropicRequest({
        tools: [
          {
            name: longName,
            description: "Test",
            input_schema: { type: "object" },
          },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.tools?.[0].functionDeclarations[0].name.length).toBe(64);
    });

    it("extracts name from function.name if not at top level", () => {
      const request = createAnthropicRequest({
        tools: [
          {
            function: {
              name: "nested_tool",
              description: "Nested description",
              parameters: { type: "object" },
            },
          } as any,
        ],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.tools?.[0].functionDeclarations[0].name).toBe("nested_tool");
    });

    it("generates placeholder name for tools without name", () => {
      const request = createAnthropicRequest({
        tools: [{ description: "No name", input_schema: { type: "object" } }],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.tools?.[0].functionDeclarations[0].name).toBe("tool-0");
    });

    it("applies cleanSchemaForGemini for Gemini models", () => {
      const request = createAnthropicRequest({
        model: "gemini-3-flash",
        tools: [
          {
            name: "test",
            description: "Test",
            input_schema: {
              type: "object",
              properties: {
                value: { type: ["string", "null"] },
              },
            },
          },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      // Type array should be flattened
      expect(result.tools?.[0].functionDeclarations[0].parameters.properties?.value?.type).toBe("string");
    });
  });

  describe("assistant message processing", () => {
    it("reorders content: thinking -> text -> tool_use", () => {
      const validSig = "r".repeat(MIN_SIGNATURE_LENGTH);
      cacheThinkingSignature(validSig, "claude");

      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
        messages: [
          { role: "user", content: "Do something" },
          {
            role: "assistant",
            content: [createToolUseBlock("tool", {}, "t1"), createTextBlock("Here's what I'll do"), createThinkingBlock("Let me think", validSig)],
          },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      const assistantParts = result.contents[1].parts;
      // Thinking should come first
      expect(assistantParts[0]).toMatchObject({ thought: true });
      // Text second
      expect(assistantParts[1]).toMatchObject({ text: "Here's what I'll do" });
      // Tool use last
      expect(assistantParts[2]).toHaveProperty("functionCall");
    });

    it("removes trailing unsigned thinking blocks", () => {
      const request = createAnthropicRequest({
        messages: [
          { role: "user", content: "Think" },
          {
            role: "assistant",
            content: [createTextBlock("Answer"), createThinkingBlock("unsigned", "")],
          },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      const assistantParts = result.contents[1].parts;
      expect(assistantParts.every((p: any) => !p.thought)).toBe(true);
    });

    it("adds placeholder when all parts are filtered out", () => {
      const request = createAnthropicRequest({
        messages: [
          { role: "user", content: "Think" },
          {
            role: "assistant",
            content: [createThinkingBlock("unsigned", "")],
          },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      // Should have placeholder text
      expect(result.contents[1].parts.length).toBeGreaterThan(0);
      expect(result.contents[1].parts[0]).toHaveProperty("text");
    });
  });

  describe("thinking recovery", () => {
    it("applies recovery for Gemini in tool loop without thinking", () => {
      const request = createAnthropicRequest({
        model: "gemini-3-flash",
        messages: [
          { role: "assistant", content: [createToolUseBlock("tool", {}, "t1")] },
          { role: "user", content: [createToolResultBlock("t1", "result")] },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      // Should have additional synthetic messages
      expect(result.contents.length).toBeGreaterThan(2);
    });

    it("applies recovery for Claude when switching from Gemini history", () => {
      // Create a message with Gemini-style tool_use (has thoughtSignature)
      const messages: AnthropicMessage[] = [
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "tool",
              input: {},
              thoughtSignature: "gemini_sig",
            } as AnthropicContentBlock,
          ],
        },
        { role: "user", content: [createToolResultBlock("t1", "result")] },
      ];

      const request: AnthropicRequest = {
        model: "claude-sonnet-4-5-thinking",
        messages,
        max_tokens: 1024,
      };
      const result = convertAnthropicToGoogle(request);

      // Should have recovery applied
      expect(result.contents.length).toBeGreaterThan(2);
    });

    it("does not apply recovery for normal Claude conversation", () => {
      const validSig = "n".repeat(MIN_SIGNATURE_LENGTH);
      cacheThinkingSignature(validSig, "claude");

      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
        messages: [
          { role: "user", content: "Hello" },
          {
            role: "assistant",
            content: [createThinkingBlock("thinking", validSig), createTextBlock("Hi")],
          },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.contents.length).toBe(2);
    });
  });

  describe("filtering for Claude models", () => {
    it("filters unsigned thinking blocks from Claude contents", () => {
      const request = createAnthropicRequest({
        model: "claude-sonnet-4-5-thinking",
        messages: [
          { role: "user", content: "Hello" },
          {
            role: "assistant",
            content: [createThinkingBlock("unsigned", ""), createTextBlock("Text")],
          },
        ],
      });
      const result = convertAnthropicToGoogle(request);

      // Unsigned thinking should be filtered
      const assistantParts = result.contents[1].parts;
      expect(assistantParts.some((p: any) => p.thought === true)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty messages array", () => {
      const request = createAnthropicRequest({
        messages: [],
      });
      const result = convertAnthropicToGoogle(request);

      expect(result.contents).toEqual([]);
    });

    it("handles missing model name", () => {
      const request = createAnthropicRequest({
        model: "",
      });
      const result = convertAnthropicToGoogle(request);

      // Should not throw
      expect(result.contents).toBeDefined();
    });

    it("handles message with undefined content", () => {
      const request = createAnthropicRequest({
        messages: [{ role: "user", content: undefined as unknown as string }],
      });
      const result = convertAnthropicToGoogle(request);

      // Should handle gracefully
      expect(result.contents).toBeDefined();
    });
  });
});
