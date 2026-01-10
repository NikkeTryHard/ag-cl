/**
 * Snapshot normalization helpers.
 * Centralizes dynamic field normalization for consistent snapshots.
 */

import type { AnthropicResponse } from "../../src/format/types.js";

/** Mock ID for normalized snapshots */
export const MOCK_ID = "msg_normalized_id";

/** Mock tool ID for normalized snapshots */
export const MOCK_TOOL_ID = "toolu_normalized_id";

/**
 * Normalize dynamic fields in an Anthropic response for snapshot stability.
 * Replaces generated IDs with stable mock values.
 */
export function normalizeResponse(response: AnthropicResponse): AnthropicResponse {
  return {
    ...response,
    id: MOCK_ID,
    content: response.content.map((block) => {
      if (block.type === "tool_use") {
        return { ...block, id: MOCK_TOOL_ID };
      }
      return block;
    }),
  };
}

/**
 * Normalize response with indexed tool IDs for multiple tool uses.
 * Each tool_use block gets an indexed ID like "toolu_normalized_id_0".
 */
export function normalizeResponseWithIndexedTools(response: AnthropicResponse): AnthropicResponse {
  return {
    ...response,
    id: MOCK_ID,
    content: response.content.map((block, i) => {
      if (block.type === "tool_use") {
        return { ...block, id: `${MOCK_TOOL_ID}_${i}` };
      }
      return block;
    }),
  };
}

/**
 * Normalize just the top-level ID.
 */
export function normalizeId<T extends { id: string }>(obj: T): T {
  return { ...obj, id: MOCK_ID };
}
