/**
 * Unit tests for sse-parser
 *
 * Tests parsing SSE responses for non-streaming thinking models.
 */

import { describe, it, expect, vi } from "vitest";
import { parseThinkingSSEResponse } from "../../../src/cloudcode/sse-parser.js";
import { createMockStream, createMockStreamResponse } from "../../helpers/mocks.js";

/**
 * Helper to create SSE data lines
 */
function sseData(data: object): string {
  return `data: ${JSON.stringify(data)}\n`;
}

/**
 * Create a readable response with SSE chunks
 */
function createSSEResponse(chunks: string[]): { body: ReadableStream<Uint8Array> } {
  return {
    body: createMockStream(chunks),
  };
}

describe("parseThinkingSSEResponse", () => {
  describe("thinking block accumulation", () => {
    it("accumulates thinking text from multiple chunks", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "Let me think" }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: " about this problem" }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "...", thoughtSignature: "sig123abc" }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "thinking",
        thinking: "Let me think about this problem...",
      });
    });

    it("captures thinking signature from last chunk", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "Thinking..." }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: " more", thoughtSignature: "final-signature-xyz" }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.content[0]).toHaveProperty("signature", "final-signature-xyz");
    });
  });

  describe("text accumulation", () => {
    it("accumulates text from multiple chunks", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Hello, " }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "world!" }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Hello, world!",
      });
    });
  });

  describe("thinking followed by text", () => {
    it("creates separate blocks for thinking and text", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "Let me think" }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "...", thoughtSignature: "sig123" }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Here is my answer" }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toMatchObject({
        type: "thinking",
        thinking: "Let me think...",
      });
      expect(result.content[1]).toMatchObject({
        type: "text",
        text: "Here is my answer",
      });
    });
  });

  describe("function call handling", () => {
    it("parses function call parts", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "search",
                      args: { query: "test" },
                    },
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 25 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "gemini-3-flash");

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "tool_use",
        name: "search",
        input: { query: "test" },
      });
      // Note: Current implementation checks finishReason before hasToolCalls,
      // so finishReason="STOP" takes precedence. This documents actual behavior.
      expect(result.stop_reason).toBe("end_turn");
    });

    it("sets stop_reason to tool_use when finishReason is TOOL_USE", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "search",
                      args: { query: "test" },
                    },
                  },
                ],
              },
              finishReason: "TOOL_USE",
            },
          ],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 25 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "gemini-3-flash");

      expect(result.stop_reason).toBe("tool_use");
    });

    it("preserves thoughtSignature on function call when signature meets minimum length", async () => {
      // MIN_SIGNATURE_LENGTH is 50, so we need a signature of at least 50 chars
      const longSignature = "a".repeat(60);
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "get_weather",
                      args: { location: "NYC" },
                    },
                    thoughtSignature: longSignature,
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 25 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "gemini-3-flash");

      expect(result.content[0]).toHaveProperty("thoughtSignature", longSignature);
    });

    it("does not preserve thoughtSignature when below minimum length", async () => {
      const shortSignature = "tool-sig-abc"; // Less than MIN_SIGNATURE_LENGTH (50)
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "get_weather",
                      args: { location: "NYC" },
                    },
                    thoughtSignature: shortSignature,
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 25 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "gemini-3-flash");

      // Short signatures are not preserved
      expect(result.content[0]).not.toHaveProperty("thoughtSignature");
    });

    it("handles thinking followed by function call", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "I need to search", thoughtSignature: "think-sig" }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "search",
                      args: { q: "test" },
                    },
                    thoughtSignature: "tool-sig",
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "gemini-3-flash");

      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe("thinking");
      expect(result.content[1].type).toBe("tool_use");
    });
  });

  describe("usage metadata", () => {
    it("includes usage from final chunk", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Response" }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 150,
            candidatesTokenCount: 75,
            cachedContentTokenCount: 50,
          },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.usage).toMatchObject({
        input_tokens: 100, // promptTokenCount - cachedContentTokenCount
        output_tokens: 75,
        cache_read_input_tokens: 50,
      });
    });

    it("handles missing usage metadata gracefully", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Response" }],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.usage).toBeDefined();
    });
  });

  describe("finish reason handling", () => {
    it("maps STOP to end_turn", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Done" }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.stop_reason).toBe("end_turn");
    });

    it("maps MAX_TOKENS to max_tokens", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Cut off..." }],
              },
              finishReason: "MAX_TOKENS",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.stop_reason).toBe("max_tokens");
    });
  });

  describe("nested response structure", () => {
    it("handles response wrapper object", async () => {
      const chunks = [
        sseData({
          response: {
            candidates: [
              {
                content: {
                  parts: [{ text: "Wrapped response" }],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Wrapped response",
      });
    });
  });

  describe("error handling", () => {
    it("handles malformed JSON gracefully", async () => {
      const chunks = [
        "data: {invalid json\n",
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Valid response" }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      // Should skip malformed line and process valid data
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Valid response",
      });
    });

    it("handles empty parts array with fallback empty text block", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      // The converter adds a fallback empty text block when no content
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "",
      });
    });
  });

  describe("model passthrough", () => {
    it("includes original model in response", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Test" }],
              },
              finishReason: "STOP",
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "gemini-3-pro-high");

      expect(result.model).toBe("gemini-3-pro-high");
    });
  });

  describe("chunked line handling", () => {
    it("handles SSE lines split across chunks", async () => {
      const encoder = new TextEncoder();
      const fullLine = sseData({
        candidates: [
          {
            content: {
              parts: [{ text: "Complete message" }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      });

      // Split the line in the middle
      const midpoint = Math.floor(fullLine.length / 2);
      const chunks = [fullLine.slice(0, midpoint), fullLine.slice(midpoint)];

      const response = createSSEResponse(chunks);
      const result = await parseThinkingSSEResponse(response, "claude-sonnet-4-5-thinking");

      expect(result.content[0]).toMatchObject({
        type: "text",
        text: "Complete message",
      });
    });
  });
});
