/**
 * Session Management for Cloud Code
 *
 * Handles session ID derivation for prompt caching continuity.
 * Session IDs are derived from the first user message to ensure
 * the same conversation uses the same session across turns.
 */

import * as crypto from "crypto";
import type { AnthropicRequest, AnthropicContentBlock } from "../format/types.js";

// Re-export for convenience
export type { AnthropicRequest };

/**
 * Derive a stable session ID from the first user message in the conversation.
 * This ensures the same conversation uses the same session ID across turns,
 * enabling prompt caching (cache is scoped to session + organization).
 *
 * @param anthropicRequest - The Anthropic-format request
 * @returns A stable session ID (32 hex characters) or random UUID if no user message
 */
export function deriveSessionId(anthropicRequest: AnthropicRequest): string {
  const messages = anthropicRequest.messages ?? [];

  // Find the first user message
  for (const msg of messages) {
    if (msg.role === "user") {
      let content = "";

      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Extract text from content blocks
        content = (msg.content)
          .filter((block): block is AnthropicContentBlock & { type: "text"; text: string } => block.type === "text" && "text" in block && typeof block.text === "string")
          .map((block) => block.text)
          .join("\n");
      }

      if (content) {
        // Hash the content with SHA256, return first 32 hex chars
        const hash = crypto.createHash("sha256").update(content).digest("hex");
        return hash.substring(0, 32);
      }
    }
  }

  // Fallback to random UUID if no user message found
  return crypto.randomUUID();
}
