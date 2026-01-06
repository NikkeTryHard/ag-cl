/**
 * Unit tests for sse-streamer
 *
 * Tests streaming SSE events in real-time, converting Google format to Anthropic format.
 */

import { describe, it, expect, vi } from "vitest";
import { streamSSEResponse, type AnthropicSSEEvent } from "../../../src/cloudcode/sse-streamer.js";
import { createMockStream } from "../../helpers/mocks.js";

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

/**
 * Collect all events from the async generator
 */
async function collectEvents(response: { body: ReadableStream<Uint8Array> }, model: string): Promise<AnthropicSSEEvent[]> {
  const events: AnthropicSSEEvent[] = [];
  for await (const event of streamSSEResponse(response, model)) {
    events.push(event);
  }
  return events;
}

describe("streamSSEResponse", () => {
  describe("message_start event", () => {
    it("yields message_start as first event", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Hello" }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      expect(events[0].type).toBe("message_start");
      const messageStart = events[0] as Extract<AnthropicSSEEvent, { type: "message_start" }>;
      expect(messageStart.message).toMatchObject({
        type: "message",
        role: "assistant",
        content: [],
        model: "claude-sonnet-4-5-thinking",
        stop_reason: null,
        stop_sequence: null,
      });
    });

    it("includes usage in message_start", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Hello" }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 150,
            candidatesTokenCount: 25,
            cachedContentTokenCount: 50,
          },
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const messageStart = events[0] as Extract<AnthropicSSEEvent, { type: "message_start" }>;
      expect(messageStart.message.usage).toMatchObject({
        input_tokens: 100, // promptTokenCount - cachedContentTokenCount
        output_tokens: 0,
        cache_read_input_tokens: 50,
        cache_creation_input_tokens: 0,
      });
    });

    it("generates unique message ID", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Test" }],
              },
            },
          ],
        }),
      ];

      const response1 = createSSEResponse(chunks);
      const response2 = createSSEResponse(chunks);

      const events1 = await collectEvents(response1, "claude-sonnet-4-5-thinking");
      const events2 = await collectEvents(response2, "claude-sonnet-4-5-thinking");

      const id1 = (events1[0] as Extract<AnthropicSSEEvent, { type: "message_start" }>).message.id;
      const id2 = (events2[0] as Extract<AnthropicSSEEvent, { type: "message_start" }>).message.id;

      expect(id1).toMatch(/^msg_/);
      expect(id2).toMatch(/^msg_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe("content_block_start event", () => {
    it("yields content_block_start for text block", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Hello" }],
              },
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const blockStart = events.find((e) => e.type === "content_block_start") as Extract<AnthropicSSEEvent, { type: "content_block_start" }>;
      expect(blockStart).toBeDefined();
      expect(blockStart.index).toBe(0);
      expect(blockStart.content_block).toMatchObject({
        type: "text",
        text: "",
      });
    });

    it("yields content_block_start for thinking block", async () => {
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
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const blockStart = events.find((e) => e.type === "content_block_start") as Extract<AnthropicSSEEvent, { type: "content_block_start" }>;
      expect(blockStart).toBeDefined();
      expect(blockStart.content_block).toMatchObject({
        type: "thinking",
        thinking: "",
      });
    });

    it("yields content_block_start for tool_use block", async () => {
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
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "gemini-3-flash");

      const blockStart = events.find((e) => e.type === "content_block_start") as Extract<AnthropicSSEEvent, { type: "content_block_start" }>;
      expect(blockStart).toBeDefined();
      expect(blockStart.content_block).toMatchObject({
        type: "tool_use",
        name: "search",
      });
      expect(blockStart.content_block).toHaveProperty("id");
    });
  });

  describe("content_block_delta event", () => {
    it("yields text_delta for text content", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Hello world" }],
              },
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const deltas = events.filter((e) => e.type === "content_block_delta") as Extract<AnthropicSSEEvent, { type: "content_block_delta" }>[];
      const textDelta = deltas.find((d) => d.delta.type === "text_delta");
      expect(textDelta).toBeDefined();
      expect(textDelta!.delta).toMatchObject({
        type: "text_delta",
        text: "Hello world",
      });
    });

    it("yields thinking_delta for thinking content", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "Let me analyze" }],
              },
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const deltas = events.filter((e) => e.type === "content_block_delta") as Extract<AnthropicSSEEvent, { type: "content_block_delta" }>[];
      const thinkingDelta = deltas.find((d) => d.delta.type === "thinking_delta");
      expect(thinkingDelta).toBeDefined();
      expect(thinkingDelta!.delta).toMatchObject({
        type: "thinking_delta",
        thinking: "Let me analyze",
      });
    });

    it("yields signature_delta when transitioning from thinking", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "Thinking...", thoughtSignature: "a".repeat(60) }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Answer" }],
              },
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const deltas = events.filter((e) => e.type === "content_block_delta") as Extract<AnthropicSSEEvent, { type: "content_block_delta" }>[];
      const signatureDelta = deltas.find((d) => d.delta.type === "signature_delta");
      expect(signatureDelta).toBeDefined();
      expect(signatureDelta!.delta).toMatchObject({
        type: "signature_delta",
        signature: "a".repeat(60),
      });
    });

    it("yields input_json_delta for tool arguments", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "test_tool",
                      args: { param1: "value1", param2: 42 },
                    },
                  },
                ],
              },
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "gemini-3-flash");

      const deltas = events.filter((e) => e.type === "content_block_delta") as Extract<AnthropicSSEEvent, { type: "content_block_delta" }>[];
      const jsonDelta = deltas.find((d) => d.delta.type === "input_json_delta");
      expect(jsonDelta).toBeDefined();
      expect(jsonDelta!.delta).toHaveProperty("partial_json");
      expect(JSON.parse((jsonDelta!.delta as { type: "input_json_delta"; partial_json: string }).partial_json)).toMatchObject({
        param1: "value1",
        param2: 42,
      });
    });
  });

  describe("content_block_stop event", () => {
    it("yields content_block_stop when block ends", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Hello" }],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const blockStop = events.find((e) => e.type === "content_block_stop") as Extract<AnthropicSSEEvent, { type: "content_block_stop" }>;
      expect(blockStop).toBeDefined();
      expect(blockStop.index).toBe(0);
    });

    it("yields content_block_stop when transitioning between blocks", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "Thinking", thoughtSignature: "b".repeat(60) }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Answer" }],
              },
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const blockStops = events.filter((e) => e.type === "content_block_stop");
      expect(blockStops.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("block transitions", () => {
    it("handles thinking -> text transition", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "Analyzing...", thoughtSignature: "c".repeat(60) }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "The answer is 42" }],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const blockStarts = events.filter((e) => e.type === "content_block_start");
      expect(blockStarts.length).toBe(2);
      expect((blockStarts[0] as Extract<AnthropicSSEEvent, { type: "content_block_start" }>).content_block.type).toBe("thinking");
      expect((blockStarts[1] as Extract<AnthropicSSEEvent, { type: "content_block_start" }>).content_block.type).toBe("text");
    });

    it("handles thinking -> tool_use transition", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "I need to search", thoughtSignature: "d".repeat(60) }],
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
                      args: { q: "query" },
                    },
                  },
                ],
              },
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "gemini-3-flash");

      const blockStarts = events.filter((e) => e.type === "content_block_start") as Extract<AnthropicSSEEvent, { type: "content_block_start" }>[];
      expect(blockStarts.length).toBe(2);
      expect(blockStarts[0].content_block.type).toBe("thinking");
      expect(blockStarts[1].content_block.type).toBe("tool_use");
    });

    it("increments block index on transitions", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ thought: true, text: "Think", thoughtSignature: "e".repeat(60) }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Text" }],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const blockStarts = events.filter((e) => e.type === "content_block_start") as Extract<AnthropicSSEEvent, { type: "content_block_start" }>[];
      expect(blockStarts[0].index).toBe(0);
      expect(blockStarts[1].index).toBe(1);
    });
  });

  describe("message_delta event", () => {
    it("yields message_delta with stop_reason", async () => {
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
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20 },
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const messageDelta = events.find((e) => e.type === "message_delta") as Extract<AnthropicSSEEvent, { type: "message_delta" }>;
      expect(messageDelta).toBeDefined();
      expect(messageDelta.delta).toMatchObject({
        stop_reason: "end_turn",
        stop_sequence: null,
      });
    });

    it("sets stop_reason based on finishReason even with function calls", async () => {
      // Note: Current implementation has finishReason check AFTER tool_use detection,
      // so finishReason="STOP" will override tool_use to end_turn.
      // This test documents actual behavior.
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "test",
                      args: {},
                    },
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "gemini-3-flash");

      const messageDelta = events.find((e) => e.type === "message_delta") as Extract<AnthropicSSEEvent, { type: "message_delta" }>;
      // finishReason "STOP" currently overrides the tool_use stop_reason to end_turn
      expect(messageDelta.delta.stop_reason).toBe("end_turn");
    });

    it("sets stop_reason to tool_use when finishReason is not STOP or MAX_TOKENS", async () => {
      // When finishReason is something else (or not set), tool_use should persist
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "test",
                      args: {},
                    },
                  },
                ],
              },
              // No finishReason or different finishReason won't override
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "gemini-3-flash");

      const messageDelta = events.find((e) => e.type === "message_delta") as Extract<AnthropicSSEEvent, { type: "message_delta" }>;
      expect(messageDelta.delta.stop_reason).toBe("tool_use");
    });

    it("sets stop_reason to max_tokens when MAX_TOKENS", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Truncated..." }],
              },
              finishReason: "MAX_TOKENS",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const messageDelta = events.find((e) => e.type === "message_delta") as Extract<AnthropicSSEEvent, { type: "message_delta" }>;
      expect(messageDelta.delta.stop_reason).toBe("max_tokens");
    });

    it("includes final usage in message_delta", async () => {
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
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            cachedContentTokenCount: 25,
          },
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const messageDelta = events.find((e) => e.type === "message_delta") as Extract<AnthropicSSEEvent, { type: "message_delta" }>;
      expect(messageDelta.usage).toMatchObject({
        output_tokens: 50,
        cache_read_input_tokens: 25,
        cache_creation_input_tokens: 0,
      });
    });
  });

  describe("message_stop event", () => {
    it("yields message_stop as final event", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "End" }],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const lastEvent = events[events.length - 1];
      expect(lastEvent.type).toBe("message_stop");
    });
  });

  describe("empty response handling", () => {
    it("emits fallback content when no parts received", async () => {
      const chunks: string[] = [];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      // Should still emit message_start
      expect(events[0].type).toBe("message_start");

      // Should emit fallback text block
      const blockStart = events.find((e) => e.type === "content_block_start");
      expect(blockStart).toBeDefined();

      // Should emit message_stop
      const messageStop = events.find((e) => e.type === "message_stop");
      expect(messageStop).toBeDefined();
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
                  parts: [{ text: "Wrapped" }],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
          },
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const deltas = events.filter((e) => e.type === "content_block_delta") as Extract<AnthropicSSEEvent, { type: "content_block_delta" }>[];
      const textDelta = deltas.find((d) => d.delta.type === "text_delta");
      expect(textDelta).toBeDefined();
      expect((textDelta!.delta as { type: "text_delta"; text: string }).text).toBe("Wrapped");
    });
  });

  describe("error handling", () => {
    it("handles malformed JSON gracefully", async () => {
      const chunks = [
        "data: {invalid\n",
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Valid" }],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      // Should continue processing and emit valid content
      const deltas = events.filter((e) => e.type === "content_block_delta");
      expect(deltas.length).toBeGreaterThan(0);
    });
  });

  describe("skipping empty text parts", () => {
    it("skips empty text parts", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "" }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Actual content" }],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      // Should only have one text block start (for "Actual content")
      const blockStarts = events.filter((e) => e.type === "content_block_start");
      expect(blockStarts.length).toBe(1);
    });

    it("skips whitespace-only text parts", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "   " }],
              },
            },
          ],
        }),
        sseData({
          candidates: [
            {
              content: {
                parts: [{ text: "Real content" }],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "claude-sonnet-4-5-thinking");

      const blockStarts = events.filter((e) => e.type === "content_block_start");
      expect(blockStarts.length).toBe(1);
    });
  });

  describe("tool_use with thoughtSignature", () => {
    it("includes thoughtSignature in tool_use block", async () => {
      const chunks = [
        sseData({
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: "get_data",
                      args: {},
                    },
                    thoughtSignature: "f".repeat(60),
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
        }),
      ];

      const response = createSSEResponse(chunks);
      const events = await collectEvents(response, "gemini-3-flash");

      const blockStart = events.find((e) => e.type === "content_block_start") as Extract<AnthropicSSEEvent, { type: "content_block_start" }>;
      expect(blockStart.content_block).toHaveProperty("thoughtSignature", "f".repeat(60));
    });
  });
});
