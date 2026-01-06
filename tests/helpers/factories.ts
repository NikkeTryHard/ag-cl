/**
 * Test Data Factories
 *
 * Functions to create test data objects with sensible defaults.
 */

import type { AnthropicRequest, AnthropicMessage, AnthropicContentBlock, GoogleResponse, GooglePart } from "../../src/format/types.js";

/**
 * Create an Anthropic request with defaults
 */
export function createAnthropicRequest(overrides: Partial<AnthropicRequest> = {}): AnthropicRequest {
  return {
    model: "claude-sonnet-4-5-thinking",
    messages: [{ role: "user", content: "Hello" }],
    max_tokens: 1024,
    ...overrides,
  };
}

/**
 * Create an Anthropic message
 */
export function createAnthropicMessage(overrides: Partial<AnthropicMessage> = {}): AnthropicMessage {
  return {
    role: "user",
    content: "Hello",
    ...overrides,
  };
}

/**
 * Create an account object for testing
 */
export function createAccount(
  overrides: Partial<{
    email: string;
    source: "oauth" | "database" | "manual";
    lastUsed: number | null;
    modelRateLimits: Record<string, { isRateLimited: boolean; resetTime: number | null }>;
    isInvalid?: boolean;
    invalidReason?: string | null;
    refreshToken?: string;
    projectId?: string;
  }> = {},
) {
  return {
    email: "test@example.com",
    source: "oauth" as const,
    lastUsed: null,
    modelRateLimits: {},
    ...overrides,
  };
}

/**
 * Create a Google API response
 */
export function createGoogleResponse(overrides: Partial<GoogleResponse> = {}): GoogleResponse {
  return {
    candidates: [
      {
        content: { parts: [{ text: "Hello!" }] },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
    },
    ...overrides,
  } as GoogleResponse;
}

/**
 * Create a thinking content block
 */
export function createThinkingBlock(thinking: string, signature?: string): AnthropicContentBlock {
  return {
    type: "thinking",
    thinking,
    ...(signature ? { signature } : {}),
  } as AnthropicContentBlock;
}

/**
 * Create a text content block
 */
export function createTextBlock(text: string): AnthropicContentBlock {
  return {
    type: "text",
    text,
  } as AnthropicContentBlock;
}

/**
 * Create a tool_use content block
 */
export function createToolUseBlock(name: string, input: Record<string, unknown>, id?: string): AnthropicContentBlock {
  return {
    type: "tool_use",
    id: id ?? `toolu_${Math.random().toString(36).substring(2, 15)}`,
    name,
    input,
  } as AnthropicContentBlock;
}

/**
 * Create a tool_result content block
 */
export function createToolResultBlock(toolUseId: string, content: string | AnthropicContentBlock[]): AnthropicContentBlock {
  return {
    type: "tool_result",
    tool_use_id: toolUseId,
    content,
  } as AnthropicContentBlock;
}

/**
 * Create a Google part with thinking
 */
export function createGoogleThinkingPart(thinking: string, thoughtSignature?: string): GooglePart {
  return {
    thought: true,
    text: thinking,
    ...(thoughtSignature ? { thoughtSignature } : {}),
  } as GooglePart;
}

/**
 * Create a Google function call part
 */
export function createGoogleFunctionCallPart(name: string, args: Record<string, unknown>, thoughtSignature?: string): GooglePart {
  return {
    functionCall: { name, args },
    ...(thoughtSignature ? { thoughtSignature } : {}),
  } as GooglePart;
}
