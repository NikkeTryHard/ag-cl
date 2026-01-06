/**
 * Unit tests for thinking-utils.ts
 *
 * Tests thinking block processing, validation, filtering, and recovery utilities.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { isThinkingPart, hasValidSignature, hasGeminiHistory, analyzeConversationState, needsThinkingRecovery, removeTrailingThinkingBlocks, restoreThinkingSignatures, reorderAssistantContent, closeToolLoopForThinking, filterUnsignedThinkingBlocks } from "../../../src/format/thinking-utils.js";
import { _resetCacheForTesting, cacheThinkingSignature } from "../../../src/format/signature-cache.js";
import { MIN_SIGNATURE_LENGTH } from "../../../src/constants.js";
import type { ThinkingPart, AnthropicContentBlock, AnalyzableMessage, GooglePart } from "../../../src/format/types.js";
import { createTextBlock, createToolUseBlock, createToolResultBlock, createThinkingBlock } from "../../helpers/factories.js";

beforeEach(() => {
  _resetCacheForTesting();
});

describe("isThinkingPart", () => {
  it('returns true for type "thinking"', () => {
    const part: ThinkingPart = { type: "thinking", thinking: "test" };
    expect(isThinkingPart(part)).toBe(true);
  });

  it('returns true for type "redacted_thinking"', () => {
    const part: ThinkingPart = { type: "redacted_thinking", data: "redacted" };
    expect(isThinkingPart(part)).toBe(true);
  });

  it("returns true for part with thinking property", () => {
    const part: ThinkingPart = { thinking: "some thought" };
    expect(isThinkingPart(part)).toBe(true);
  });

  it("returns true for Gemini-style thought: true", () => {
    const part: ThinkingPart = { thought: true, text: "thinking text" };
    expect(isThinkingPart(part)).toBe(true);
  });

  it("returns false for text block", () => {
    const part = { type: "text", text: "hello" } as unknown as ThinkingPart;
    expect(isThinkingPart(part)).toBe(false);
  });

  it("returns false for tool_use block", () => {
    const part = { type: "tool_use", id: "123", name: "test", input: {} } as unknown as ThinkingPart;
    expect(isThinkingPart(part)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isThinkingPart({} as ThinkingPart)).toBe(false);
  });
});

describe("hasValidSignature", () => {
  it("returns true for Anthropic thinking with valid signature", () => {
    const validSig = "s".repeat(MIN_SIGNATURE_LENGTH);
    const part: ThinkingPart = { type: "thinking", thinking: "test", signature: validSig };
    expect(hasValidSignature(part)).toBe(true);
  });

  it("returns false for signature shorter than MIN_SIGNATURE_LENGTH", () => {
    const shortSig = "s".repeat(MIN_SIGNATURE_LENGTH - 1);
    const part: ThinkingPart = { type: "thinking", thinking: "test", signature: shortSig };
    expect(hasValidSignature(part)).toBe(false);
  });

  it("returns false for missing signature", () => {
    const part: ThinkingPart = { type: "thinking", thinking: "test" };
    expect(hasValidSignature(part)).toBe(false);
  });

  it("returns true for Gemini thought with valid thoughtSignature", () => {
    const validSig = "g".repeat(MIN_SIGNATURE_LENGTH);
    const part: ThinkingPart = { thought: true, text: "thinking", thoughtSignature: validSig };
    expect(hasValidSignature(part)).toBe(true);
  });

  it("returns false for Gemini thought with short thoughtSignature", () => {
    const shortSig = "g".repeat(MIN_SIGNATURE_LENGTH - 1);
    const part: ThinkingPart = { thought: true, text: "thinking", thoughtSignature: shortSig };
    expect(hasValidSignature(part)).toBe(false);
  });

  it("returns false for undefined signature", () => {
    const part: ThinkingPart = { type: "thinking", thinking: "test", signature: undefined };
    expect(hasValidSignature(part)).toBe(false);
  });
});

describe("hasGeminiHistory", () => {
  it("returns true when tool_use has thoughtSignature", () => {
    const messages: AnalyzableMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool_1",
            name: "test",
            input: {},
            thoughtSignature: "gemini_sig",
          } as AnthropicContentBlock,
        ],
      },
    ];
    expect(hasGeminiHistory(messages)).toBe(true);
  });

  it("returns false when tool_use lacks thoughtSignature", () => {
    const messages: AnalyzableMessage[] = [
      {
        role: "assistant",
        content: [createToolUseBlock("test", {})],
      },
    ];
    expect(hasGeminiHistory(messages)).toBe(false);
  });

  it("returns false for empty messages", () => {
    expect(hasGeminiHistory([])).toBe(false);
  });

  it("returns false for messages with only text", () => {
    const messages: AnalyzableMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: [createTextBlock("Hi there")] },
    ];
    expect(hasGeminiHistory(messages)).toBe(false);
  });

  it("returns false when content is string", () => {
    const messages: AnalyzableMessage[] = [{ role: "user", content: "Hello" }];
    expect(hasGeminiHistory(messages)).toBe(false);
  });
});

describe("analyzeConversationState", () => {
  it("returns default state for empty messages", () => {
    const state = analyzeConversationState([]);
    expect(state).toEqual({
      inToolLoop: false,
      interruptedTool: false,
      turnHasThinking: false,
      toolResultCount: 0,
    });
  });

  it("returns default state for non-array input", () => {
    const state = analyzeConversationState(null as unknown as AnalyzableMessage[]);
    expect(state.inToolLoop).toBe(false);
  });

  it("detects tool loop (assistant tool_use followed by tool_result)", () => {
    const messages: AnalyzableMessage[] = [
      { role: "user", content: "Do something" },
      { role: "assistant", content: [createToolUseBlock("test_tool", { arg: 1 }, "tool_123")] },
      { role: "user", content: [createToolResultBlock("tool_123", "Tool result")] },
    ];
    const state = analyzeConversationState(messages);
    expect(state.inToolLoop).toBe(true);
    expect(state.interruptedTool).toBe(false);
    expect(state.toolResultCount).toBe(1);
  });

  it("detects interrupted tool (assistant tool_use followed by plain user message)", () => {
    const messages: AnalyzableMessage[] = [
      { role: "user", content: "Do something" },
      { role: "assistant", content: [createToolUseBlock("test_tool", {})] },
      { role: "user", content: "Actually, nevermind" },
    ];
    const state = analyzeConversationState(messages);
    expect(state.inToolLoop).toBe(false);
    expect(state.interruptedTool).toBe(true);
  });

  it("detects valid thinking in turn", () => {
    const validSig = "v".repeat(MIN_SIGNATURE_LENGTH);
    const messages: AnalyzableMessage[] = [
      { role: "user", content: "Think about this" },
      { role: "assistant", content: [createThinkingBlock("I am thinking...", validSig), createTextBlock("Here is my answer")] },
    ];
    const state = analyzeConversationState(messages);
    expect(state.turnHasThinking).toBe(true);
  });

  it("returns false for turnHasThinking when signature is too short", () => {
    const shortSig = "s".repeat(MIN_SIGNATURE_LENGTH - 1);
    const messages: AnalyzableMessage[] = [{ role: "assistant", content: [createThinkingBlock("thinking", shortSig)] }];
    const state = analyzeConversationState(messages);
    expect(state.turnHasThinking).toBe(false);
  });

  it("counts multiple tool results", () => {
    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createToolUseBlock("tool1", {}, "t1"), createToolUseBlock("tool2", {}, "t2")] },
      { role: "user", content: [createToolResultBlock("t1", "result 1")] },
      { role: "user", content: [createToolResultBlock("t2", "result 2")] },
    ];
    const state = analyzeConversationState(messages);
    expect(state.toolResultCount).toBe(2);
    expect(state.inToolLoop).toBe(true);
  });

  it("returns lastAssistantIdx correctly", () => {
    const messages: AnalyzableMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: [createTextBlock("Hi")] },
      { role: "user", content: "Bye" },
    ];
    const state = analyzeConversationState(messages);
    expect(state.lastAssistantIdx).toBe(1);
  });

  it("handles 'model' role as assistant", () => {
    const messages: AnalyzableMessage[] = [
      { role: "user", content: "Hello" },
      { role: "model", content: [createToolUseBlock("tool", {})] },
      { role: "user", content: [createToolResultBlock("id", "result")] },
    ];
    const state = analyzeConversationState(messages);
    expect(state.inToolLoop).toBe(true);
  });
});

describe("needsThinkingRecovery", () => {
  it("returns false for empty messages", () => {
    expect(needsThinkingRecovery([])).toBe(false);
  });

  it("returns false for normal conversation without tool loop", () => {
    const messages: AnalyzableMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: [createTextBlock("Hi")] },
    ];
    expect(needsThinkingRecovery(messages)).toBe(false);
  });

  it("returns true for tool loop without valid thinking", () => {
    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createToolUseBlock("tool", {}, "t1")] },
      { role: "user", content: [createToolResultBlock("t1", "result")] },
    ];
    expect(needsThinkingRecovery(messages)).toBe(true);
  });

  it("returns false for tool loop with valid thinking", () => {
    const validSig = "x".repeat(MIN_SIGNATURE_LENGTH);
    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createThinkingBlock("thinking", validSig), createToolUseBlock("tool", {}, "t1")] },
      { role: "user", content: [createToolResultBlock("t1", "result")] },
    ];
    expect(needsThinkingRecovery(messages)).toBe(false);
  });

  it("returns true for interrupted tool without thinking", () => {
    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createToolUseBlock("tool", {})] },
      { role: "user", content: "Interrupted" },
    ];
    expect(needsThinkingRecovery(messages)).toBe(true);
  });
});

describe("removeTrailingThinkingBlocks", () => {
  it("returns input for non-array", () => {
    const result = removeTrailingThinkingBlocks("not an array" as unknown as AnthropicContentBlock[]);
    expect(result).toBe("not an array");
  });

  it("returns empty array for empty input", () => {
    expect(removeTrailingThinkingBlocks([])).toEqual([]);
  });

  it("removes trailing unsigned thinking blocks", () => {
    const content: AnthropicContentBlock[] = [createTextBlock("Hello"), createThinkingBlock("unsigned thinking", "")];
    const result = removeTrailingThinkingBlocks(content);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ type: "text", text: "Hello" });
  });

  it("keeps trailing signed thinking blocks", () => {
    const validSig = "y".repeat(MIN_SIGNATURE_LENGTH);
    const content: AnthropicContentBlock[] = [createTextBlock("Hello"), createThinkingBlock("signed thinking", validSig)];
    const result = removeTrailingThinkingBlocks(content);
    expect(result.length).toBe(2);
  });

  it("removes multiple trailing unsigned thinking blocks", () => {
    const content: AnthropicContentBlock[] = [createTextBlock("Text"), createThinkingBlock("think1", ""), createThinkingBlock("think2", "")];
    const result = removeTrailingThinkingBlocks(content);
    expect(result.length).toBe(1);
  });

  it("stops at first non-thinking block from end", () => {
    const content: AnthropicContentBlock[] = [createThinkingBlock("keep", ""), createTextBlock("Stopper"), createThinkingBlock("remove", "")];
    const result = removeTrailingThinkingBlocks(content);
    expect(result.length).toBe(2);
    expect(result[1]).toMatchObject({ type: "text" });
  });

  it("handles null blocks", () => {
    const content = [createTextBlock("Valid"), null] as unknown as AnthropicContentBlock[];
    const result = removeTrailingThinkingBlocks(content);
    expect(result.length).toBe(2); // Stops at null (non-thinking)
  });
});

describe("restoreThinkingSignatures", () => {
  it("returns input for non-array", () => {
    const result = restoreThinkingSignatures("not an array" as unknown as AnthropicContentBlock[]);
    expect(result).toBe("not an array");
  });

  it("keeps non-thinking blocks unchanged", () => {
    const content: AnthropicContentBlock[] = [createTextBlock("Hello"), createToolUseBlock("tool", {})];
    const result = restoreThinkingSignatures(content);
    expect(result.length).toBe(2);
  });

  it("keeps thinking blocks with valid signatures", () => {
    const validSig = "z".repeat(MIN_SIGNATURE_LENGTH);
    const content: AnthropicContentBlock[] = [createThinkingBlock("Valid thinking", validSig)];
    const result = restoreThinkingSignatures(content);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ type: "thinking", thinking: "Valid thinking" });
  });

  it("drops thinking blocks without signatures", () => {
    const content: AnthropicContentBlock[] = [createThinkingBlock("Unsigned", ""), createTextBlock("Keep me")];
    const result = restoreThinkingSignatures(content);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ type: "text" });
  });

  it("drops thinking blocks with short signatures", () => {
    const shortSig = "a".repeat(MIN_SIGNATURE_LENGTH - 1);
    const content: AnthropicContentBlock[] = [createThinkingBlock("Short sig", shortSig)];
    const result = restoreThinkingSignatures(content);
    expect(result.length).toBe(0);
  });

  it("sanitizes thinking blocks (removes cache_control)", () => {
    const validSig = "b".repeat(MIN_SIGNATURE_LENGTH);
    const content = [
      {
        type: "thinking" as const,
        thinking: "With cache",
        signature: validSig,
        cache_control: { type: "ephemeral" },
      },
    ] as AnthropicContentBlock[];
    const result = restoreThinkingSignatures(content);
    expect(result[0]).not.toHaveProperty("cache_control");
  });
});

describe("reorderAssistantContent", () => {
  it("returns input for non-array", () => {
    const result = reorderAssistantContent("not an array" as unknown as AnthropicContentBlock[]);
    expect(result).toBe("not an array");
  });

  it("sanitizes single thinking block", () => {
    const content = [
      {
        type: "thinking" as const,
        thinking: "Thinking",
        signature: "sig",
        cache_control: { type: "ephemeral" },
      },
    ] as AnthropicContentBlock[];
    const result = reorderAssistantContent(content);
    expect(result[0]).not.toHaveProperty("cache_control");
  });

  it("puts thinking blocks first", () => {
    const content: AnthropicContentBlock[] = [createTextBlock("Text first"), createThinkingBlock("Thinking", "sig")];
    const result = reorderAssistantContent(content);
    expect(result[0]).toMatchObject({ type: "thinking" });
    expect(result[1]).toMatchObject({ type: "text" });
  });

  it("puts tool_use blocks last", () => {
    const content: AnthropicContentBlock[] = [createToolUseBlock("tool", {}), createTextBlock("Text")];
    const result = reorderAssistantContent(content);
    expect(result[0]).toMatchObject({ type: "text" });
    expect(result[1]).toMatchObject({ type: "tool_use" });
  });

  it("maintains thinking -> text -> tool_use order", () => {
    const content: AnthropicContentBlock[] = [createToolUseBlock("tool", {}), createTextBlock("Text"), createThinkingBlock("Think", "sig")];
    const result = reorderAssistantContent(content);
    expect(result[0]).toMatchObject({ type: "thinking" });
    expect(result[1]).toMatchObject({ type: "text" });
    expect(result[2]).toMatchObject({ type: "tool_use" });
  });

  it("filters empty text blocks", () => {
    const content: AnthropicContentBlock[] = [createTextBlock(""), createTextBlock("   "), createTextBlock("Valid")];
    const result = reorderAssistantContent(content);
    expect(result.length).toBe(1);
    expect(result[0]).toMatchObject({ text: "Valid" });
  });

  it("handles null blocks", () => {
    const content = [null, createTextBlock("Valid")] as unknown as AnthropicContentBlock[];
    const result = reorderAssistantContent(content);
    expect(result.length).toBe(1);
  });

  it("handles redacted_thinking blocks", () => {
    const content = [{ type: "redacted_thinking" as const, data: "redacted" }, createTextBlock("Text")] as AnthropicContentBlock[];
    const result = reorderAssistantContent(content);
    expect(result[0]).toMatchObject({ type: "redacted_thinking" });
  });
});

describe("closeToolLoopForThinking", () => {
  it("returns messages unchanged when not in tool loop or interrupted", () => {
    const messages: AnalyzableMessage[] = [
      { role: "user", content: "Hello" },
      { role: "assistant", content: [createTextBlock("Hi")] },
    ];
    const result = closeToolLoopForThinking(messages);
    expect(result).toEqual(messages);
  });

  it("injects synthetic messages for tool loop", () => {
    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createToolUseBlock("tool", {}, "t1")] },
      { role: "user", content: [createToolResultBlock("t1", "result")] },
    ];
    const result = closeToolLoopForThinking(messages);
    expect(result.length).toBeGreaterThan(messages.length);
    // Should have synthetic assistant and user messages
    const lastTwo = result.slice(-2);
    expect(lastTwo[0].role).toBe("assistant");
    expect(lastTwo[1].role).toBe("user");
  });

  it("uses singular message for single tool result", () => {
    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createToolUseBlock("tool", {}, "t1")] },
      { role: "user", content: [createToolResultBlock("t1", "result")] },
    ];
    const result = closeToolLoopForThinking(messages);
    const syntheticAssistant = result[result.length - 2];
    const content = syntheticAssistant.content as AnthropicContentBlock[];
    expect((content[0] as { text?: string }).text).toContain("completed");
    expect((content[0] as { text?: string }).text).not.toContain("2");
  });

  it("uses plural message for multiple tool results", () => {
    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createToolUseBlock("tool1", {}, "t1"), createToolUseBlock("tool2", {}, "t2")] },
      { role: "user", content: [createToolResultBlock("t1", "r1")] },
      { role: "user", content: [createToolResultBlock("t2", "r2")] },
    ];
    const result = closeToolLoopForThinking(messages);
    const syntheticAssistant = result[result.length - 2];
    const content = syntheticAssistant.content as AnthropicContentBlock[];
    expect((content[0] as { text?: string }).text).toContain("2 tool executions");
  });

  it("handles interrupted tool by inserting acknowledgment", () => {
    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createToolUseBlock("tool", {})] },
      { role: "user", content: "Interrupted" },
    ];
    const result = closeToolLoopForThinking(messages);
    // Should insert synthetic assistant message between tool_use and user message
    expect(result.length).toBe(3);
    expect(result[1].role).toBe("assistant");
    const content = result[1].content as AnthropicContentBlock[];
    expect((content[0] as { text?: string }).text).toContain("interrupted");
  });

  it("strips invalid thinking blocks during recovery for Gemini", () => {
    // Pre-cache as Claude signature (incompatible with Gemini)
    const claudeSig = "c".repeat(MIN_SIGNATURE_LENGTH);
    cacheThinkingSignature(claudeSig, "claude");

    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createThinkingBlock("Claude thinking", claudeSig), createToolUseBlock("tool", {}, "t1")] },
      { role: "user", content: [createToolResultBlock("t1", "result")] },
    ];
    const result = closeToolLoopForThinking(messages, "gemini");
    // The Claude thinking block should be stripped for Gemini
    const assistantContent = result[0].content as AnthropicContentBlock[];
    const thinkingBlocks = assistantContent.filter((b) => (b as { type?: string }).type === "thinking");
    expect(thinkingBlocks.length).toBe(0);
  });

  it("keeps valid thinking blocks during recovery for Claude", () => {
    const claudeSig = "d".repeat(MIN_SIGNATURE_LENGTH);
    cacheThinkingSignature(claudeSig, "claude");

    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createThinkingBlock("Claude thinking", claudeSig), createToolUseBlock("tool", {}, "t1")] },
      { role: "user", content: [createToolResultBlock("t1", "result")] },
    ];
    const result = closeToolLoopForThinking(messages, "claude");
    // For Claude, we are lenient - let Claude validate its own signatures
    // The block should be kept
    const assistantContent = result[0].content as AnthropicContentBlock[];
    const thinkingBlocks = assistantContent.filter((b) => (b as { type?: string }).type === "thinking");
    expect(thinkingBlocks.length).toBe(1);
  });

  it("replaces empty content with placeholder", () => {
    // All content will be stripped
    const messages: AnalyzableMessage[] = [
      { role: "assistant", content: [createThinkingBlock("unsigned", ""), createToolUseBlock("tool", {}, "t1")] },
      { role: "user", content: [createToolResultBlock("t1", "result")] },
    ];
    const result = closeToolLoopForThinking(messages, "gemini");
    // After stripping unsigned thinking, should have placeholder
    const assistantContent = result[0].content as AnthropicContentBlock[];
    // Should have tool_use (kept) or placeholder
    expect(assistantContent.length).toBeGreaterThan(0);
  });

  it("handles messages with parts property (Google format) instead of content", () => {
    // Test the msg.parts branch in stripInvalidThinkingBlocks (lines 474-477)
    const messages: AnalyzableMessage[] = [
      {
        role: "assistant",
        parts: [{ thought: true, text: "thinking", thoughtSignature: "" }, { text: "response" }],
      } as unknown as AnalyzableMessage,
      { role: "user", parts: [{ text: "next question" }] } as unknown as AnalyzableMessage,
    ];
    const result = closeToolLoopForThinking(messages, "gemini");
    // Should handle parts-based messages without error
    expect(result.length).toBeGreaterThanOrEqual(2);
    // The unsigned thinking should be stripped, leaving placeholder or text
    const firstMsg = result[0] as unknown as { parts?: GooglePart[] };
    expect(firstMsg.parts).toBeDefined();
  });

  it("handles empty parts array with placeholder", () => {
    // Test placeholder injection when all parts are stripped
    // Need to set up a tool loop context so closeToolLoopForThinking actually processes the messages
    const messages: AnalyzableMessage[] = [
      {
        role: "assistant",
        content: [createThinkingBlock("unsigned", ""), createToolUseBlock("tool", {}, "t1")],
      },
      { role: "user", content: [createToolResultBlock("t1", "result")] },
    ];
    const result = closeToolLoopForThinking(messages, "gemini");
    const firstMsg = result[0];
    // Should have at least the tool_use block or placeholder
    const content = firstMsg.content as AnthropicContentBlock[];
    expect(content.length).toBeGreaterThan(0);
  });
});

describe("filterUnsignedThinkingBlocks", () => {
  it("handles content without parts array", () => {
    // Test line 129: content that doesn't have a parts array
    const contents = [
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "assistant" } as unknown as { role: string; parts: GooglePart[] }, // No parts property
      { role: "model", parts: [{ text: "Response" }] },
    ];
    const result = filterUnsignedThinkingBlocks(contents);
    expect(result.length).toBe(3);
    // The content without parts should be returned unchanged
    expect(result[1]).toEqual({ role: "assistant" });
  });

  it("handles non-object content", () => {
    // Edge case: content is not an object
    const contents = [null, undefined, { role: "user", parts: [{ text: "Valid" }] }] as unknown as {
      role: string;
      parts: GooglePart[];
    }[];
    const result = filterUnsignedThinkingBlocks(contents);
    expect(result.length).toBe(3);
    // Non-objects should be returned as-is
    expect(result[0]).toBeNull();
    expect(result[1]).toBeUndefined();
  });

  it("filters unsigned thinking from parts", () => {
    const validSig = "v".repeat(MIN_SIGNATURE_LENGTH);
    const contents = [
      {
        role: "model",
        parts: [
          { thought: true, text: "unsigned thinking" }, // No signature
          { thought: true, text: "signed thinking", thoughtSignature: validSig },
          { text: "regular text" },
        ],
      },
    ];
    const result = filterUnsignedThinkingBlocks(contents);
    // Unsigned thinking should be filtered out
    expect(result[0].parts.length).toBe(2);
    expect(result[0].parts[0]).toMatchObject({ thought: true, thoughtSignature: validSig });
    expect(result[0].parts[1]).toMatchObject({ text: "regular text" });
  });
});

describe("reorderAssistantContent - other block types", () => {
  it("handles image blocks by placing them in text position", () => {
    // Test line 251: other block types go in text position
    const content: AnthropicContentBlock[] = [{ type: "image", source: { type: "base64", data: "abc", media_type: "image/png" } } as unknown as AnthropicContentBlock, createTextBlock("Caption")];
    const result = reorderAssistantContent(content);
    // Image should be placed with text blocks
    expect(result.length).toBe(2);
  });

  it("handles document blocks by placing them in text position", () => {
    const content: AnthropicContentBlock[] = [{ type: "document", source: { type: "base64", data: "pdf" } } as unknown as AnthropicContentBlock, createTextBlock("Summary")];
    const result = reorderAssistantContent(content);
    expect(result.length).toBe(2);
  });

  it("handles unknown block types by placing them in text position", () => {
    const content: AnthropicContentBlock[] = [{ type: "custom_block", data: "unknown" } as unknown as AnthropicContentBlock, createThinkingBlock("thought", "s".repeat(MIN_SIGNATURE_LENGTH)), createTextBlock("Text")];
    const result = reorderAssistantContent(content);
    // Order should be: thinking, then text/custom blocks
    expect(result.length).toBe(3);
    expect((result[0] as { type: string }).type).toBe("thinking");
  });
});
