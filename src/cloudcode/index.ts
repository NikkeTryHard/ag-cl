/**
 * Cloud Code Client for Antigravity
 *
 * Communicates with Google's Cloud Code internal API using the
 * v1internal:streamGenerateContent endpoint with proper request wrapping.
 *
 * Supports multi-account load balancing with automatic failover.
 *
 * Based on: https://github.com/NoeFabris/opencode-antigravity-auth
 */

// Re-export public API
export { sendMessage } from "./message-handler.js";
export { sendMessageStream } from "./streaming-handler.js";
export { listModels, fetchAvailableModels, getModelQuotas } from "./model-api.js";

// Re-export types from format/types.js for convenience
export type { AnthropicRequest, AnthropicResponse } from "../format/types.js";
export type { AnthropicSSEEvent } from "./sse-streamer.js";
export type { Account, AccountManagerInterface } from "./message-handler.js";
export type { AnthropicModelList, AnthropicModel, ModelQuotas, QuotaInfo } from "./model-api.js";
