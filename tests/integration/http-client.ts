/**
 * Shared Test HTTP Client Utilities
 *
 * Provides common HTTP request functions for integration tests.
 * Eliminates code duplication across test files.
 *
 * TypeScript version of http-client.cjs
 */
import http from "node:http";

// Server configuration
export const BASE_URL = "localhost";
export const PORT = 8080;

// Type definitions for content blocks
export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature: string;
}

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
  thoughtSignature?: string;
  partial_json?: string;
}

export type ContentBlock = ThinkingBlock | TextBlock | ToolUseBlock;

// SSE event types
export interface SSEEvent {
  type: string;
  data: {
    delta?: {
      type?: string;
      thinking?: string;
      signature?: string;
      text?: string;
      partial_json?: string;
    };
    content_block?: ContentBlock;
    message?: {
      usage?: UsageInfo;
    };
    usage?: UsageInfo;
  };
}

export interface UsageInfo {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface StreamRequestResult {
  content: ContentBlock[];
  events: SSEEvent[];
  statusCode: number;
  raw: string;
}

export interface MakeRequestResult<T = Record<string, unknown>> {
  statusCode: number;
  [key: string]: unknown;
}

export interface ContentAnalysis {
  thinking: ThinkingBlock[];
  toolUse: ToolUseBlock[];
  text: TextBlock[];
  hasThinking: boolean;
  hasToolUse: boolean;
  hasText: boolean;
  thinkingHasSignature: boolean;
  toolUseHasSignature: boolean;
  hasSignature: boolean;
}

export interface EventAnalysis {
  messageStart: number;
  blockStart: number;
  blockDelta: number;
  blockStop: number;
  messageDelta: number;
  messageStop: number;
  thinkingDeltas: number;
  signatureDeltas: number;
  textDeltas: number;
  inputJsonDeltas: number;
}

// Tool input schema type
export interface ToolInputSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string;
      description?: string;
    }
  >;
  required: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

/**
 * Make a streaming SSE request to the API
 */
export function streamRequest(body: Record<string, unknown>): Promise<StreamRequestResult> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: BASE_URL,
        port: PORT,
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "interleaved-thinking-2025-05-14",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        const events: SSEEvent[] = [];
        let fullData = "";

        res.on("data", (chunk: Buffer) => {
          fullData += chunk.toString();
        });

        res.on("end", () => {
          // Parse SSE events
          const parts = fullData.split("\n\n").filter((e) => e.trim());
          for (const part of parts) {
            const lines = part.split("\n");
            const eventLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (eventLine && dataLine) {
              try {
                const eventType = eventLine.replace("event:", "").trim();
                const eventData = JSON.parse(dataLine.replace("data:", "").trim());
                events.push({ type: eventType, data: eventData });
              } catch {
                // Ignore parse errors
              }
            }
          }

          // Build content from events
          const content: ContentBlock[] = [];
          let currentBlock: Partial<ContentBlock> | null = null;

          for (const event of events) {
            if (event.type === "content_block_start") {
              currentBlock = { ...event.data.content_block };
              if (currentBlock && currentBlock.type === "thinking") {
                (currentBlock as ThinkingBlock).thinking = "";
                (currentBlock as ThinkingBlock).signature = "";
              }
              if (currentBlock && currentBlock.type === "text") {
                (currentBlock as TextBlock).text = "";
              }
            } else if (event.type === "content_block_delta") {
              const delta = event.data.delta;
              if (delta?.type === "thinking_delta" && currentBlock) {
                (currentBlock as ThinkingBlock).thinking += delta.thinking || "";
              }
              if (delta?.type === "signature_delta" && currentBlock) {
                (currentBlock as ThinkingBlock).signature += delta.signature || "";
              }
              if (delta?.type === "text_delta" && currentBlock) {
                (currentBlock as TextBlock).text += delta.text || "";
              }
              if (delta?.type === "input_json_delta" && currentBlock) {
                (currentBlock as ToolUseBlock).partial_json = ((currentBlock as ToolUseBlock).partial_json || "") + delta.partial_json;
              }
            } else if (event.type === "content_block_stop") {
              if (currentBlock?.type === "tool_use" && (currentBlock as ToolUseBlock).partial_json) {
                try {
                  (currentBlock as ToolUseBlock).input = JSON.parse((currentBlock as ToolUseBlock).partial_json!);
                } catch {
                  // Ignore parse errors
                }
                delete (currentBlock as ToolUseBlock).partial_json;
              }
              if (currentBlock) content.push(currentBlock as ContentBlock);
              currentBlock = null;
            }
          }

          resolve({
            content,
            events,
            statusCode: res.statusCode || 0,
            raw: fullData,
          });
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/**
 * Make a non-streaming JSON request to the API
 */
export function makeRequest<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T & { statusCode: number }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: BASE_URL,
        port: PORT,
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "test",
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "interleaved-thinking-2025-05-14",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let fullData = "";
        res.on("data", (chunk: Buffer) => (fullData += chunk.toString()));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(fullData) as T;
            resolve({ ...parsed, statusCode: res.statusCode || 0 });
          } catch (e) {
            reject(new Error(`Parse error: ${(e as Error).message}\nRaw: ${fullData.substring(0, 500)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/**
 * Analyze content blocks from a response
 */
export function analyzeContent(content: ContentBlock[]): ContentAnalysis {
  const thinking = content.filter((b): b is ThinkingBlock => b.type === "thinking");
  const toolUse = content.filter((b): b is ToolUseBlock => b.type === "tool_use");
  const text = content.filter((b): b is TextBlock => b.type === "text");

  // Check for signatures in thinking blocks (Claude style)
  const thinkingHasSignature = thinking.some((t) => t.signature && t.signature.length >= 50);

  // Check for signatures in tool_use blocks (Gemini 3+ style)
  const toolUseHasSignature = toolUse.some((t) => t.thoughtSignature && t.thoughtSignature.length >= 50);

  return {
    thinking,
    toolUse,
    text,
    hasThinking: thinking.length > 0,
    hasToolUse: toolUse.length > 0,
    hasText: text.length > 0,
    thinkingHasSignature,
    toolUseHasSignature,
    // Combined check: signature exists somewhere (thinking or tool_use)
    hasSignature: thinkingHasSignature || toolUseHasSignature,
  };
}

/**
 * Analyze SSE events from a streaming response
 */
export function analyzeEvents(events: SSEEvent[]): EventAnalysis {
  return {
    messageStart: events.filter((e) => e.type === "message_start").length,
    blockStart: events.filter((e) => e.type === "content_block_start").length,
    blockDelta: events.filter((e) => e.type === "content_block_delta").length,
    blockStop: events.filter((e) => e.type === "content_block_stop").length,
    messageDelta: events.filter((e) => e.type === "message_delta").length,
    messageStop: events.filter((e) => e.type === "message_stop").length,
    thinkingDeltas: events.filter((e) => e.data?.delta?.type === "thinking_delta").length,
    signatureDeltas: events.filter((e) => e.data?.delta?.type === "signature_delta").length,
    textDeltas: events.filter((e) => e.data?.delta?.type === "text_delta").length,
    inputJsonDeltas: events.filter((e) => e.data?.delta?.type === "input_json_delta").length,
  };
}

/**
 * Extract usage metadata from SSE events
 */
export function extractUsage(events: SSEEvent[]): UsageInfo {
  const usage: UsageInfo = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  // Get usage from message_start
  const messageStart = events.find((e) => e.type === "message_start");
  if (messageStart?.data?.message?.usage) {
    const startUsage = messageStart.data.message.usage;
    usage.input_tokens = startUsage.input_tokens || 0;
    usage.cache_read_input_tokens = startUsage.cache_read_input_tokens || 0;
    usage.cache_creation_input_tokens = startUsage.cache_creation_input_tokens || 0;
  }

  // Get output tokens from message_delta
  const messageDelta = events.find((e) => e.type === "message_delta");
  if (messageDelta?.data?.usage) {
    const deltaUsage = messageDelta.data.usage;
    usage.output_tokens = deltaUsage.output_tokens || 0;
    // Also check for cache tokens in delta (may be updated)
    if (deltaUsage.cache_read_input_tokens !== undefined) {
      usage.cache_read_input_tokens = deltaUsage.cache_read_input_tokens;
    }
  }

  return usage;
}

// Common tool definitions for tests
export const commonTools: Record<string, ToolDefinition> = {
  getWeather: {
    name: "get_weather",
    description: "Get the current weather for a location",
    input_schema: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
      },
      required: ["location"],
    },
  },
  searchFiles: {
    name: "search_files",
    description: "Search for files matching a pattern",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Glob pattern to search" },
        path: { type: "string", description: "Directory to search in" },
      },
      required: ["pattern"],
    },
  },
  readFile: {
    name: "read_file",
    description: "Read contents of a file",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to file" },
      },
      required: ["path"],
    },
  },
  executeCommand: {
    name: "execute_command",
    description: "Execute a shell command",
    input_schema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Command to execute" },
        cwd: { type: "string", description: "Working directory" },
      },
      required: ["command"],
    },
  },
  writeFile: {
    name: "write_file",
    description: "Write to a file",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  runTests: {
    name: "run_tests",
    description: "Run test suite",
    input_schema: {
      type: "object",
      properties: { pattern: { type: "string" } },
      required: ["pattern"],
    },
  },
};
