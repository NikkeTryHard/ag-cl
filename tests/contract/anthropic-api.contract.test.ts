/**
 * Contract Tests for Anthropic API Compliance
 *
 * Validates that response converters produce output matching
 * the Anthropic Messages API specification using JSON Schema validation.
 */

import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { convertGoogleToAnthropic } from "../../src/format/response-converter.js";
import { createGoogleResponse, createGoogleThinkingPart, createGoogleFunctionCallPart } from "../helpers/factories.js";
import type { GoogleResponse, GooglePart } from "../../src/format/types.js";

// Initialize AJV with formats for schema validation
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// ============================================================================
// JSON Schemas for Anthropic Messages API
// ============================================================================

/**
 * Schema for Anthropic usage object
 */
const anthropicUsageSchema = {
  type: "object",
  properties: {
    input_tokens: { type: "integer", minimum: 0 },
    output_tokens: { type: "integer", minimum: 0 },
    cache_read_input_tokens: { type: "integer", minimum: 0 },
    cache_creation_input_tokens: { type: "integer", minimum: 0 },
  },
  required: ["input_tokens", "output_tokens"],
  additionalProperties: true,
};

/**
 * Schema for text content block
 */
const textBlockSchema = {
  type: "object",
  properties: {
    type: { const: "text" },
    text: { type: "string" },
  },
  required: ["type", "text"],
  additionalProperties: true,
};

/**
 * Schema for thinking content block
 */
const thinkingBlockSchema = {
  type: "object",
  properties: {
    type: { const: "thinking" },
    thinking: { type: "string" },
    signature: { type: "string" },
  },
  required: ["type", "thinking"],
  additionalProperties: true,
};

/**
 * Schema for tool_use content block
 */
const toolUseBlockSchema = {
  type: "object",
  properties: {
    type: { const: "tool_use" },
    id: { type: "string", pattern: "^toolu_" },
    name: { type: "string" },
    input: { type: "object" },
    thoughtSignature: { type: "string" },
  },
  required: ["type", "id", "name", "input"],
  additionalProperties: true,
};

/**
 * Schema for any content block
 */
const contentBlockSchema = {
  oneOf: [textBlockSchema, thinkingBlockSchema, toolUseBlockSchema],
};

/**
 * Schema for Anthropic Messages API response
 */
const anthropicResponseSchema = {
  type: "object",
  properties: {
    id: { type: "string", pattern: "^msg_" },
    type: { const: "message" },
    role: { const: "assistant" },
    content: {
      type: "array",
      items: contentBlockSchema,
      minItems: 1,
    },
    model: { type: "string" },
    stop_reason: {
      type: ["string", "null"],
      enum: ["end_turn", "max_tokens", "tool_use", "stop_sequence", null],
    },
    stop_sequence: { type: ["string", "null"] },
    usage: anthropicUsageSchema,
  },
  required: ["id", "type", "role", "content", "model", "stop_reason", "stop_sequence", "usage"],
  additionalProperties: false,
};

// Compile schemas
const validateAnthropicResponse = ajv.compile(anthropicResponseSchema);
const validateTextBlock = ajv.compile(textBlockSchema);
const validateThinkingBlock = ajv.compile(thinkingBlockSchema);
const validateToolUseBlock = ajv.compile(toolUseBlockSchema);
const validateUsage = ajv.compile(anthropicUsageSchema);

// ============================================================================
// Contract Tests
// ============================================================================

describe("Anthropic API Contract Tests", () => {
  describe("convertGoogleToAnthropic output schema compliance", () => {
    it("produces valid response for simple text response", () => {
      const googleResponse = createGoogleResponse({
        candidates: [
          {
            content: { parts: [{ text: "Hello, world!" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
        },
      });

      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      const isValid = validateAnthropicResponse(result);
      if (!isValid) {
        console.error("Validation errors:", validateAnthropicResponse.errors);
      }
      expect(isValid).toBe(true);
    });

    it("produces valid response with thinking blocks", () => {
      const thinkingPart = createGoogleThinkingPart("Let me think about this...", "sig_" + "a".repeat(100));
      const googleResponse: GoogleResponse = {
        candidates: [
          {
            content: {
              parts: [thinkingPart as GooglePart, { text: "The answer is 42." }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 20,
        },
      };

      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      const isValid = validateAnthropicResponse(result);
      if (!isValid) {
        console.error("Validation errors:", validateAnthropicResponse.errors);
      }
      expect(isValid).toBe(true);

      // Verify thinking block is present
      const thinkingBlock = result.content.find((b) => b.type === "thinking");
      expect(thinkingBlock).toBeDefined();
      expect(validateThinkingBlock(thinkingBlock)).toBe(true);
    });

    it("produces valid response with tool_use blocks", () => {
      const functionCallPart = createGoogleFunctionCallPart("get_weather", { location: "San Francisco" }, "sig_" + "b".repeat(100));
      const googleResponse: GoogleResponse = {
        candidates: [
          {
            content: {
              parts: [functionCallPart as GooglePart],
            },
            finishReason: "TOOL_USE",
          },
        ],
        usageMetadata: {
          promptTokenCount: 20,
          candidatesTokenCount: 10,
        },
      };

      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      const isValid = validateAnthropicResponse(result);
      if (!isValid) {
        console.error("Validation errors:", validateAnthropicResponse.errors);
      }
      expect(isValid).toBe(true);

      // Verify tool_use block is present and valid
      const toolUseBlock = result.content.find((b) => b.type === "tool_use");
      expect(toolUseBlock).toBeDefined();
      expect(validateToolUseBlock(toolUseBlock)).toBe(true);
      expect(result.stop_reason).toBe("tool_use");
    });

    it("produces valid response with mixed content blocks", () => {
      const thinkingPart = createGoogleThinkingPart("Analyzing the request...", "sig_" + "c".repeat(100));
      const functionCallPart = createGoogleFunctionCallPart("search", { query: "test" }, "sig_" + "d".repeat(100));

      const googleResponse: GoogleResponse = {
        candidates: [
          {
            content: {
              parts: [thinkingPart as GooglePart, { text: "I will search for that." }, functionCallPart as GooglePart],
            },
            finishReason: "TOOL_USE",
          },
        ],
        usageMetadata: {
          promptTokenCount: 30,
          candidatesTokenCount: 25,
        },
      };

      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      const isValid = validateAnthropicResponse(result);
      if (!isValid) {
        console.error("Validation errors:", validateAnthropicResponse.errors);
      }
      expect(isValid).toBe(true);

      // Verify all content types are present
      expect(result.content.some((b) => b.type === "thinking")).toBe(true);
      expect(result.content.some((b) => b.type === "text")).toBe(true);
      expect(result.content.some((b) => b.type === "tool_use")).toBe(true);
    });

    it("produces valid response with empty content (fallback text block)", () => {
      const googleResponse: GoogleResponse = {
        candidates: [
          {
            content: { parts: [] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 0,
        },
      };

      const result = convertGoogleToAnthropic(googleResponse, "claude-sonnet-4-5-thinking");

      const isValid = validateAnthropicResponse(result);
      if (!isValid) {
        console.error("Validation errors:", validateAnthropicResponse.errors);
      }
      expect(isValid).toBe(true);

      // Should have at least one content block (fallback empty text)
      expect(result.content.length).toBeGreaterThanOrEqual(1);
      expect(result.content[0].type).toBe("text");
    });
  });

  describe("Response field validation", () => {
    it("has required id field starting with msg_", () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^msg_/);
      expect(result.id.length).toBeGreaterThan(4);
    });

    it("has type field set to message", () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(result.type).toBe("message");
    });

    it("has role field set to assistant", () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(result.role).toBe("assistant");
    });

    it("preserves model name in response", () => {
      const googleResponse = createGoogleResponse();
      const modelName = "claude-opus-4-5-thinking";
      const result = convertGoogleToAnthropic(googleResponse, modelName);

      expect(result.model).toBe(modelName);
    });

    it("has stop_sequence set to null", () => {
      const googleResponse = createGoogleResponse();
      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(result.stop_sequence).toBeNull();
    });
  });

  describe("Stop reason mapping", () => {
    it("maps STOP to end_turn", () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Done" }] }, finishReason: "STOP" }],
      });
      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(result.stop_reason).toBe("end_turn");
    });

    it("maps MAX_TOKENS to max_tokens", () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Truncated" }] }, finishReason: "MAX_TOKENS" }],
      });
      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(result.stop_reason).toBe("max_tokens");
    });

    it("maps TOOL_USE to tool_use", () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Using tool" }] }, finishReason: "TOOL_USE" }],
      });
      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(result.stop_reason).toBe("tool_use");
    });

    it("infers tool_use from function call when finishReason is not STOP", () => {
      const functionCallPart = createGoogleFunctionCallPart("test_tool", {});
      const googleResponse: GoogleResponse = {
        candidates: [
          {
            content: { parts: [functionCallPart as GooglePart] },
            finishReason: undefined, // No explicit finish reason, should infer tool_use
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      };

      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(result.stop_reason).toBe("tool_use");
    });

    it("respects STOP finish reason even with function calls present", () => {
      // Note: This documents current behavior - STOP takes precedence over hasToolCalls
      const functionCallPart = createGoogleFunctionCallPart("test_tool", {});
      const googleResponse: GoogleResponse = {
        candidates: [
          {
            content: { parts: [functionCallPart as GooglePart] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      };

      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      // Current behavior: STOP takes precedence, stop_reason is end_turn
      expect(result.stop_reason).toBe("end_turn");
    });
  });

  describe("Usage metadata", () => {
    it("correctly calculates input tokens", () => {
      const googleResponse = createGoogleResponse({
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          cachedContentTokenCount: 30,
        },
      });

      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(validateUsage(result.usage)).toBe(true);
      expect(result.usage.input_tokens).toBe(70); // 100 - 30 cached
      expect(result.usage.output_tokens).toBe(50);
      expect(result.usage.cache_read_input_tokens).toBe(30);
      expect(result.usage.cache_creation_input_tokens).toBe(0);
    });

    it("handles missing usage metadata gracefully", () => {
      const googleResponse: GoogleResponse = {
        candidates: [{ content: { parts: [{ text: "Hello" }] }, finishReason: "STOP" }],
      };

      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(validateUsage(result.usage)).toBe(true);
      expect(result.usage.input_tokens).toBe(0);
      expect(result.usage.output_tokens).toBe(0);
    });

    it("handles zero cached tokens", () => {
      const googleResponse = createGoogleResponse({
        usageMetadata: {
          promptTokenCount: 50,
          candidatesTokenCount: 25,
        },
      });

      const result = convertGoogleToAnthropic(googleResponse, "test-model");

      expect(result.usage.input_tokens).toBe(50);
      expect(result.usage.cache_read_input_tokens).toBe(0);
    });
  });

  describe("Content block structure", () => {
    it("text blocks have correct structure", () => {
      const googleResponse = createGoogleResponse({
        candidates: [{ content: { parts: [{ text: "Test message" }] }, finishReason: "STOP" }],
      });

      const result = convertGoogleToAnthropic(googleResponse, "test-model");
      const textBlock = result.content[0];

      expect(validateTextBlock(textBlock)).toBe(true);
      expect(textBlock).toEqual({
        type: "text",
        text: "Test message",
      });
    });

    it("thinking blocks have correct structure", () => {
      const thinkingPart = createGoogleThinkingPart("Deep thoughts", "sig_" + "x".repeat(100));
      const googleResponse: GoogleResponse = {
        candidates: [
          {
            content: { parts: [thinkingPart as GooglePart] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      };

      const result = convertGoogleToAnthropic(googleResponse, "test-model");
      const thinkingBlock = result.content.find((b) => b.type === "thinking");

      expect(thinkingBlock).toBeDefined();
      expect(validateThinkingBlock(thinkingBlock)).toBe(true);
      expect(thinkingBlock).toMatchObject({
        type: "thinking",
        thinking: "Deep thoughts",
      });
    });

    it("tool_use blocks have correct structure with generated id", () => {
      const functionCallPart = createGoogleFunctionCallPart("my_function", { arg1: "value1" });
      const googleResponse: GoogleResponse = {
        candidates: [
          {
            content: { parts: [functionCallPart as GooglePart] },
            finishReason: "TOOL_USE",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      };

      const result = convertGoogleToAnthropic(googleResponse, "test-model");
      const toolUseBlock = result.content.find((b) => b.type === "tool_use");

      expect(toolUseBlock).toBeDefined();
      expect(validateToolUseBlock(toolUseBlock)).toBe(true);
      if (toolUseBlock && toolUseBlock.type === "tool_use") {
        expect(toolUseBlock.id).toMatch(/^toolu_/);
        expect(toolUseBlock.name).toBe("my_function");
        expect(toolUseBlock.input).toEqual({ arg1: "value1" });
      }
    });
  });
});
