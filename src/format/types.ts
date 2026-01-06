/**
 * Type definitions for format converters
 * Shared types used across the format module
 */

import type { ModelFamily } from "../constants.js";

// ============================================================================
// Anthropic API Types
// ============================================================================

/**
 * Anthropic text block
 */
export interface AnthropicTextBlock {
  type: "text";
  text: string;
  cache_control?: { type: string };
}

/**
 * Anthropic image source
 */
export interface AnthropicImageSource {
  type: "base64" | "url";
  media_type: string;
  data?: string;
  url?: string;
}

/**
 * Anthropic image block
 */
export interface AnthropicImageBlock {
  type: "image";
  source: AnthropicImageSource;
}

/**
 * Anthropic document block
 */
export interface AnthropicDocumentBlock {
  type: "document";
  source: AnthropicImageSource;
}

/**
 * Anthropic tool use block
 */
export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
  thoughtSignature?: string;
}

/**
 * Anthropic tool result content item
 */
export interface AnthropicToolResultContentItem {
  type: "text" | "image";
  text?: string;
  source?: AnthropicImageSource;
}

/**
 * Anthropic tool result block
 */
export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | AnthropicToolResultContentItem[];
  is_error?: boolean;
}

/**
 * Anthropic thinking block
 */
export interface AnthropicThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
  cache_control?: { type: string };
}

/**
 * Anthropic redacted thinking block
 */
export interface AnthropicRedactedThinkingBlock {
  type: "redacted_thinking";
  data?: string;
}

/**
 * Union of all Anthropic content block types
 */
export type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock | AnthropicDocumentBlock | AnthropicToolUseBlock | AnthropicToolResultBlock | AnthropicThinkingBlock | AnthropicRedactedThinkingBlock;

/**
 * Anthropic message
 */
export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

/**
 * Anthropic tool definition
 */
export interface AnthropicTool {
  name?: string;
  description?: string;
  input_schema?: JSONSchema;
  function?: {
    name?: string;
    description?: string;
    input_schema?: JSONSchema;
    parameters?: JSONSchema;
  };
  custom?: {
    name?: string;
    description?: string;
    input_schema?: JSONSchema;
  };
  parameters?: JSONSchema;
}

/**
 * Anthropic thinking configuration
 */
export interface AnthropicThinkingConfig {
  budget_tokens?: number;
}

/**
 * Anthropic Messages API request
 */
export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  system?: string | AnthropicTextBlock[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  tools?: AnthropicTool[];
  tool_choice?: unknown;
  thinking?: AnthropicThinkingConfig;
  stream?: boolean;
}

/**
 * Anthropic usage info
 */
export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * Anthropic Messages API response
 */
export interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence" | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}

// ============================================================================
// Google/Gemini API Types
// ============================================================================

/**
 * Google text part
 */
export interface GoogleTextPart {
  text: string;
  thought?: boolean;
  thoughtSignature?: string;
}

/**
 * Google inline data part
 */
export interface GoogleInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

/**
 * Google file data part
 */
export interface GoogleFileDataPart {
  fileData: {
    mimeType: string;
    fileUri: string;
  };
}

/**
 * Google function call part
 */
export interface GoogleFunctionCallPart {
  functionCall: {
    name: string;
    args: Record<string, unknown>;
    id?: string;
  };
  thoughtSignature?: string;
}

/**
 * Google function response part
 */
export interface GoogleFunctionResponsePart {
  functionResponse: {
    name: string;
    response: Record<string, unknown>;
    id?: string;
  };
}

/**
 * Union of all Google part types
 */
export type GooglePart = GoogleTextPart | GoogleInlineDataPart | GoogleFileDataPart | GoogleFunctionCallPart | GoogleFunctionResponsePart;

/**
 * Google content message
 */
export interface GoogleContent {
  role: "user" | "model";
  parts: GooglePart[];
}

/**
 * Google system instruction
 */
export interface GoogleSystemInstruction {
  parts: GoogleTextPart[];
}

/**
 * Google thinking configuration
 */
export interface GoogleThinkingConfig {
  include_thoughts?: boolean;
  thinking_budget?: number;
  includeThoughts?: boolean;
  thinkingBudget?: number;
}

/**
 * Google generation configuration
 */
export interface GoogleGenerationConfig {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  thinkingConfig?: GoogleThinkingConfig;
}

/**
 * Google function declaration
 */
export interface GoogleFunctionDeclaration {
  name: string;
  description: string;
  parameters: JSONSchema;
}

/**
 * Google tools
 */
export interface GoogleTools {
  functionDeclarations: GoogleFunctionDeclaration[];
}

/**
 * Google/Cloud Code API request
 */
export interface GoogleRequest {
  contents: GoogleContent[];
  systemInstruction?: GoogleSystemInstruction;
  generationConfig: GoogleGenerationConfig;
  tools?: GoogleTools[];
}

/**
 * Google usage metadata
 */
export interface GoogleUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
}

/**
 * Google candidate
 */
export interface GoogleCandidate {
  content?: {
    parts?: GooglePart[];
  };
  finishReason?: string;
}

/**
 * Google/Cloud Code API response
 */
export interface GoogleResponse {
  response?: {
    candidates?: GoogleCandidate[];
    usageMetadata?: GoogleUsageMetadata;
  };
  candidates?: GoogleCandidate[];
  usageMetadata?: GoogleUsageMetadata;
}

// ============================================================================
// JSON Schema Types
// ============================================================================

/**
 * JSON Schema type
 */
export interface JSONSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema | JSONSchema[];
  enum?: unknown[];
  const?: unknown;
  title?: string;
  $ref?: string;
  $defs?: Record<string, JSONSchema>;
  definitions?: Record<string, JSONSchema>;
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  additionalProperties?: boolean | JSONSchema;
  default?: unknown;
  format?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  examples?: unknown[];
  $schema?: string;
  $id?: string;
  $comment?: string;
  [key: string]: unknown;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Thinking part (either Anthropic or Google format)
 */
export interface ThinkingPart {
  type?: "thinking" | "redacted_thinking";
  thinking?: string;
  signature?: string;
  thought?: boolean;
  text?: string;
  thoughtSignature?: string;
  data?: string;
  cache_control?: { type: string };
}

/**
 * Conversation state analysis result
 */
export interface ConversationState {
  inToolLoop: boolean;
  interruptedTool: boolean;
  turnHasThinking: boolean;
  toolResultCount: number;
  lastAssistantIdx?: number;
}

/**
 * Message type for analysis (can be Anthropic or Google format)
 */
export interface AnalyzableMessage {
  role: string;
  content?: string | AnthropicContentBlock[];
  parts?: GooglePart[];
}

/**
 * Re-export ModelFamily for convenience
 */
export type { ModelFamily };
