/**
 * Performance Benchmarks for Format Converters
 *
 * Benchmarks the request/response conversion functions that translate
 * between Anthropic Messages API format and Google Generative AI format.
 *
 * Run with: npx vitest bench tests/bench/format-converters.bench.ts
 */

import { bench, describe } from "vitest";
import { convertAnthropicToGoogle } from "../../src/format/request-converter.js";
import { convertGoogleToAnthropic } from "../../src/format/response-converter.js";
import { cleanSchemaForGemini, sanitizeSchema } from "../../src/format/schema-sanitizer.js";
import type { AnthropicRequest, GoogleResponse, JSONSchema, AnthropicContentBlock } from "../../src/format/types.js";

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Simple request - basic text message
 */
const simpleRequest: AnthropicRequest = {
  model: "claude-sonnet-4-5-thinking",
  messages: [{ role: "user", content: "Hello, how are you?" }],
  max_tokens: 1024,
};

/**
 * Complex request - multi-turn with tools, thinking, and system prompt
 */
const complexRequest: AnthropicRequest = {
  model: "claude-sonnet-4-5-thinking",
  messages: [
    { role: "user", content: "I need help with file operations" },
    {
      role: "assistant",
      content: [
        {
          type: "thinking",
          thinking: "The user wants help with file operations. I should explain the available tools.",
          signature: "abc123signature",
        } as AnthropicContentBlock,
        {
          type: "text",
          text: "I can help you with file operations. What would you like to do?",
        } as AnthropicContentBlock,
      ],
    },
    { role: "user", content: "Please read the contents of /tmp/test.txt" },
    {
      role: "assistant",
      content: [
        {
          type: "thinking",
          thinking: "I need to use the read_file tool to read the file contents.",
          signature: "def456signature",
        } as AnthropicContentBlock,
        {
          type: "tool_use",
          id: "toolu_abc123",
          name: "read_file",
          input: { path: "/tmp/test.txt" },
        } as AnthropicContentBlock,
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_abc123",
          content: "Hello, World!\nThis is a test file.",
        } as AnthropicContentBlock,
      ],
    },
  ],
  system: "You are a helpful coding assistant with access to file system tools.",
  max_tokens: 8192,
  temperature: 0.7,
  thinking: { budget_tokens: 4096 },
  tools: [
    {
      name: "read_file",
      description: "Read the contents of a file at the specified path",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute path to the file to read",
          },
        },
        required: ["path"],
      },
    },
    {
      name: "write_file",
      description: "Write content to a file at the specified path",
      input_schema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The absolute path to the file to write",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  ],
};

/**
 * Request with image content
 */
const imageRequest: AnthropicRequest = {
  model: "claude-sonnet-4-5",
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          },
        } as AnthropicContentBlock,
        {
          type: "text",
          text: "What do you see in this image?",
        } as AnthropicContentBlock,
      ],
    },
  ],
  max_tokens: 1024,
};

/**
 * Simple Google response - just text
 */
const simpleGoogleResponse: GoogleResponse = {
  candidates: [
    {
      content: {
        parts: [{ text: "I'm doing well, thank you for asking!" }],
      },
      finishReason: "STOP",
    },
  ],
  usageMetadata: {
    promptTokenCount: 10,
    candidatesTokenCount: 15,
  },
};

/**
 * Complex Google response - thinking and tool calls
 */
const thinkingGoogleResponse: GoogleResponse = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: "Let me think about this carefully. The user is asking about file operations which requires careful consideration of security and permissions.",
            thought: true,
            thoughtSignature: "gemini_thinking_sig_abc123xyz",
          },
          {
            text: "I'll help you read the file. Let me use the read_file tool.",
          },
          {
            functionCall: {
              name: "read_file",
              args: { path: "/tmp/test.txt" },
              id: "call_xyz789",
            },
            thoughtSignature: "gemini_tool_sig_def456abc",
          },
        ],
      },
      finishReason: "TOOL_USE",
    },
  ],
  usageMetadata: {
    promptTokenCount: 150,
    candidatesTokenCount: 85,
    cachedContentTokenCount: 50,
  },
};

/**
 * Complex JSON Schema for tool parameters
 */
const complexSchema: JSONSchema = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "The search query",
      minLength: 1,
      maxLength: 1000,
    },
    options: {
      type: "object",
      properties: {
        caseSensitive: {
          type: "boolean",
          description: "Whether the search should be case sensitive",
          default: false,
        },
        maxResults: {
          type: "integer",
          description: "Maximum number of results to return",
          minimum: 1,
          maximum: 100,
          default: 10,
        },
        fileTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["js", "ts", "py", "go", "rs", "java"],
          },
          description: "File types to include in search",
        },
        excludePatterns: {
          anyOf: [
            { type: "string" },
            {
              type: "array",
              items: { type: "string" },
            },
          ],
          description: "Patterns to exclude from search",
        },
      },
      required: ["maxResults"],
      additionalProperties: false,
    },
    paths: {
      oneOf: [
        { type: "string" },
        {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
      ],
      description: "Path or paths to search in",
    },
    metadata: {
      allOf: [
        {
          type: "object",
          properties: {
            createdBy: { type: "string" },
            timestamp: { type: "string", format: "date-time" },
          },
        },
        {
          type: "object",
          properties: {
            version: { type: "string" },
            tags: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
      ],
    },
  },
  required: ["query"],
  additionalProperties: false,
  $defs: {
    PathType: {
      type: "string",
      pattern: "^/.*",
    },
  },
};

/**
 * Schema with $refs
 */
const schemaWithRefs: JSONSchema = {
  type: "object",
  properties: {
    user: { $ref: "#/$defs/User" },
    settings: { $ref: "#/$defs/Settings" },
  },
  $defs: {
    User: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string", format: "email" },
      },
      required: ["name"],
    },
    Settings: {
      type: "object",
      properties: {
        theme: { enum: ["light", "dark", "system"] },
        notifications: { type: "boolean" },
      },
    },
  },
};

// ============================================================================
// Benchmarks: Request Conversion (Anthropic -> Google)
// ============================================================================

describe("convertAnthropicToGoogle", () => {
  bench("simple request (single message)", () => {
    convertAnthropicToGoogle(simpleRequest);
  });

  bench("complex request (tools, thinking, multi-turn)", () => {
    convertAnthropicToGoogle(complexRequest);
  });

  bench("request with image content", () => {
    convertAnthropicToGoogle(imageRequest);
  });

  bench("Gemini model request", () => {
    convertAnthropicToGoogle({
      ...complexRequest,
      model: "gemini-3-flash",
    });
  });
});

// ============================================================================
// Benchmarks: Response Conversion (Google -> Anthropic)
// ============================================================================

describe("convertGoogleToAnthropic", () => {
  bench("simple response (text only)", () => {
    convertGoogleToAnthropic(simpleGoogleResponse, "claude-sonnet-4-5");
  });

  bench("thinking response (thinking + tool calls)", () => {
    convertGoogleToAnthropic(thinkingGoogleResponse, "claude-sonnet-4-5-thinking");
  });

  bench("Gemini model response", () => {
    convertGoogleToAnthropic(thinkingGoogleResponse, "gemini-3-flash");
  });
});

// ============================================================================
// Benchmarks: Schema Sanitization
// ============================================================================

describe("Schema Sanitization", () => {
  bench("sanitizeSchema - simple", () => {
    sanitizeSchema({
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "integer" },
      },
      required: ["name"],
    });
  });

  bench("sanitizeSchema - complex", () => {
    sanitizeSchema(complexSchema);
  });

  bench("cleanSchemaForGemini - simple", () => {
    cleanSchemaForGemini({
      type: "object",
      properties: {
        name: { type: "string" },
        count: { type: "integer" },
      },
      required: ["name"],
    });
  });

  bench("cleanSchemaForGemini - complex (anyOf/oneOf/allOf)", () => {
    cleanSchemaForGemini(complexSchema);
  });

  bench("cleanSchemaForGemini - with $refs", () => {
    cleanSchemaForGemini(schemaWithRefs);
  });
});

// ============================================================================
// Benchmarks: End-to-end Request/Response Cycle
// ============================================================================

describe("End-to-end Conversion", () => {
  bench("full request + response cycle (simple)", () => {
    const googleRequest = convertAnthropicToGoogle(simpleRequest);
    // Verify conversion happened (side-effect free check)
    if (!googleRequest.contents) throw new Error("Conversion failed");
    convertGoogleToAnthropic(simpleGoogleResponse, simpleRequest.model);
  });

  bench("full request + response cycle (complex)", () => {
    const googleRequest = convertAnthropicToGoogle(complexRequest);
    if (!googleRequest.contents) throw new Error("Conversion failed");
    convertGoogleToAnthropic(thinkingGoogleResponse, complexRequest.model);
  });
});
