/**
 * Performance Benchmarks for SSE Parsing
 *
 * Benchmarks the SSE response parsing functions that process
 * streaming responses from the Cloud Code API.
 *
 * Run with: npx vitest bench tests/bench/sse-parsing.bench.ts
 */

import { bench, describe } from "vitest";
import { parseThinkingSSEResponse } from "../../src/cloudcode/sse-parser.js";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a mock ReadableStream from an array of string chunks
 */
function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/**
 * Create a mock response with a readable body
 */
function createMockResponse(chunks: string[]): { body: ReadableStream<Uint8Array> } {
  return {
    body: createMockStream(chunks),
  };
}

/**
 * Generate a single SSE data line from a Google response object
 */
function generateSSELine(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Simple SSE response - single text chunk
 */
function createSimpleSSEChunks(): string[] {
  return [
    generateSSELine({
      candidates: [
        {
          content: {
            parts: [{ text: "Hello, how can I help you today?" }],
          },
          finishReason: "STOP",
        },
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 12,
      },
    }),
  ];
}

/**
 * Multi-chunk SSE response - text arrives in multiple chunks
 */
function createMultiChunkSSEResponse(): string[] {
  const chunks: string[] = [];

  // Simulate streaming text in multiple parts
  const textParts = [
    "I'll help you with that. ",
    "Let me think about this carefully. ",
    "The solution involves several steps: ",
    "First, we need to understand the problem. ",
    "Then, we can implement the solution. ",
    "Finally, we test everything works correctly.",
  ];

  for (let i = 0; i < textParts.length; i++) {
    chunks.push(
      generateSSELine({
        candidates: [
          {
            content: {
              parts: [{ text: textParts[i] }],
            },
            ...(i === textParts.length - 1 ? { finishReason: "STOP" } : {}),
          },
        ],
        ...(i === textParts.length - 1
          ? {
              usageMetadata: {
                promptTokenCount: 25,
                candidatesTokenCount: 50,
              },
            }
          : {}),
      })
    );
  }

  return chunks;
}

/**
 * Thinking SSE response - includes thinking blocks
 */
function createThinkingSSEResponse(): string[] {
  const chunks: string[] = [];

  // Thinking part (streamed in chunks)
  const thinkingParts = [
    "Let me analyze this request. ",
    "The user wants to understand how to implement a feature. ",
    "I should provide a clear explanation with examples. ",
    "I'll break this down into manageable steps.",
  ];

  for (const part of thinkingParts) {
    chunks.push(
      generateSSELine({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: part,
                  thought: true,
                },
              ],
            },
          },
        ],
      })
    );
  }

  // Thinking signature
  chunks.push(
    generateSSELine({
      candidates: [
        {
          content: {
            parts: [
              {
                text: "",
                thought: true,
                thoughtSignature: "thinking_signature_abc123def456xyz789",
              },
            ],
          },
        },
      ],
    })
  );

  // Regular text response
  const textParts = [
    "Here's how to implement this feature:\n\n",
    "1. First, create a new component\n",
    "2. Add the necessary state management\n",
    "3. Implement the UI elements\n",
    "4. Connect to the backend API\n",
    "5. Add error handling and loading states",
  ];

  for (let i = 0; i < textParts.length; i++) {
    chunks.push(
      generateSSELine({
        candidates: [
          {
            content: {
              parts: [{ text: textParts[i] }],
            },
            ...(i === textParts.length - 1 ? { finishReason: "STOP" } : {}),
          },
        ],
        ...(i === textParts.length - 1
          ? {
              usageMetadata: {
                promptTokenCount: 100,
                candidatesTokenCount: 150,
              },
            }
          : {}),
      })
    );
  }

  return chunks;
}

/**
 * Tool call SSE response - includes function calls
 */
function createToolCallSSEResponse(): string[] {
  const chunks: string[] = [];

  // Thinking before tool call
  chunks.push(
    generateSSELine({
      candidates: [
        {
          content: {
            parts: [
              {
                text: "I need to read the file to understand its contents.",
                thought: true,
                thoughtSignature: "tool_thinking_sig_123",
              },
            ],
          },
        },
      ],
    })
  );

  // Text explaining action
  chunks.push(
    generateSSELine({
      candidates: [
        {
          content: {
            parts: [{ text: "Let me read that file for you." }],
          },
        },
      ],
    })
  );

  // Tool call
  chunks.push(
    generateSSELine({
      candidates: [
        {
          content: {
            parts: [
              {
                functionCall: {
                  name: "read_file",
                  args: { path: "/tmp/test.txt" },
                  id: "call_abc123",
                },
                thoughtSignature: "tool_call_sig_456",
              },
            ],
          },
          finishReason: "TOOL_USE",
        },
      ],
      usageMetadata: {
        promptTokenCount: 50,
        candidatesTokenCount: 30,
      },
    })
  );

  return chunks;
}

/**
 * Large SSE response - many chunks simulating a long response
 */
function createLargeSSEResponse(chunkCount: number = 100): string[] {
  const chunks: string[] = [];

  // Initial thinking
  for (let i = 0; i < 10; i++) {
    chunks.push(
      generateSSELine({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `Analyzing step ${i + 1} of the problem. `,
                  thought: true,
                },
              ],
            },
          },
        ],
      })
    );
  }

  // Thinking signature
  chunks.push(
    generateSSELine({
      candidates: [
        {
          content: {
            parts: [
              {
                text: "",
                thought: true,
                thoughtSignature: "large_response_thinking_sig",
              },
            ],
          },
        },
      ],
    })
  );

  // Many text chunks
  for (let i = 0; i < chunkCount; i++) {
    chunks.push(
      generateSSELine({
        candidates: [
          {
            content: {
              parts: [{ text: `Response chunk ${i + 1}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. ` }],
            },
            ...(i === chunkCount - 1 ? { finishReason: "STOP" } : {}),
          },
        ],
        ...(i === chunkCount - 1
          ? {
              usageMetadata: {
                promptTokenCount: 500,
                candidatesTokenCount: chunkCount * 15,
              },
            }
          : {}),
      })
    );
  }

  return chunks;
}

/**
 * Chunked data - simulates network fragmentation where SSE events are split across TCP packets
 */
function createFragmentedSSEResponse(): string[] {
  const fullResponse = generateSSELine({
    candidates: [
      {
        content: {
          parts: [{ text: "This is a complete response that arrived in fragments." }],
        },
        finishReason: "STOP",
      },
    ],
    usageMetadata: {
      promptTokenCount: 20,
      candidatesTokenCount: 15,
    },
  });

  // Split the response into random-sized fragments
  const fragments: string[] = [];
  let remaining = fullResponse;

  while (remaining.length > 0) {
    const chunkSize = Math.min(remaining.length, Math.floor(Math.random() * 50) + 10);
    fragments.push(remaining.slice(0, chunkSize));
    remaining = remaining.slice(chunkSize);
  }

  return fragments;
}

// ============================================================================
// Benchmarks: SSE Parsing
// ============================================================================

describe("parseThinkingSSEResponse", () => {
  bench("simple response (single chunk)", async () => {
    const response = createMockResponse(createSimpleSSEChunks());
    await parseThinkingSSEResponse(response, "claude-sonnet-4-5");
  });

  bench("multi-chunk response (6 chunks)", async () => {
    const response = createMockResponse(createMultiChunkSSEResponse());
    await parseThinkingSSEResponse(response, "claude-sonnet-4-5");
  });

  bench("thinking response (thinking + text)", async () => {
    const response = createMockResponse(createThinkingSSEResponse());
    await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");
  });

  bench("tool call response (thinking + text + tool)", async () => {
    const response = createMockResponse(createToolCallSSEResponse());
    await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");
  });

  bench("large response (100 chunks)", async () => {
    const response = createMockResponse(createLargeSSEResponse(100));
    await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");
  });

  bench("fragmented response (network simulation)", async () => {
    const response = createMockResponse(createFragmentedSSEResponse());
    await parseThinkingSSEResponse(response, "claude-sonnet-4-5");
  });
});

// ============================================================================
// Benchmarks: Throughput Tests
// ============================================================================

describe("SSE Parsing Throughput", () => {
  bench("50 chunks throughput", async () => {
    const response = createMockResponse(createLargeSSEResponse(50));
    await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");
  });

  bench("200 chunks throughput", async () => {
    const response = createMockResponse(createLargeSSEResponse(200));
    await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");
  });

  bench("500 chunks throughput", async () => {
    const response = createMockResponse(createLargeSSEResponse(500));
    await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");
  });
});

// ============================================================================
// Benchmarks: Gemini Model Responses
// ============================================================================

describe("Gemini SSE Parsing", () => {
  bench("Gemini thinking response", async () => {
    const response = createMockResponse(createThinkingSSEResponse());
    await parseThinkingSSEResponse(response, "gemini-3-flash");
  });

  bench("Gemini tool call response", async () => {
    const response = createMockResponse(createToolCallSSEResponse());
    await parseThinkingSSEResponse(response, "gemini-3-pro-high");
  });
});
