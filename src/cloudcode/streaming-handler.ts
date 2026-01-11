/**
 * Streaming Handler for Cloud Code
 *
 * Handles streaming message requests with multi-account support,
 * retry logic, and endpoint failover.
 */

import * as crypto from "crypto";
import { ANTIGRAVITY_ENDPOINT_FALLBACKS, MAX_RETRIES, MAX_WAIT_BEFORE_ERROR_MS, MAX_EMPTY_RETRIES, RATE_LIMIT_BUFFER_MS } from "../constants.js";
import { isRateLimitError, isAuthError, isEmptyResponseError } from "../errors.js";
import { formatDuration, sleep, isNetworkError } from "../utils/helpers.js";
import { getLogger } from "../utils/logger.js";
import { parseResetTime } from "./rate-limit-parser.js";
import { buildCloudCodeRequest, buildHeaders } from "./request-builder.js";
import { streamSSEResponse } from "./sse-streamer.js";
import type { AnthropicSSEEvent } from "./sse-streamer.js";
import { getFallbackModel } from "../fallback-config.js";
import { is5xxError, shouldAttemptFallback } from "./fallback-utils.js";
import type { AnthropicRequest } from "../format/types.js";
import type { Account, AccountManagerInterface } from "./message-handler.js";

/**
 * Rate limit error with 429 info
 */
interface RateLimitErrorInfo {
  is429: true;
  response: Response;
  errorText: string;
  resetMs: number | null;
}

/**
 * Emit fallback message when all empty response retries are exhausted
 */
export function* emitEmptyResponseFallback(model: string): Generator<AnthropicSSEEvent, void, unknown> {
  const messageId = `msg_${crypto.randomBytes(16).toString("hex")}`;

  yield {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      content: [],
      model: model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  };

  yield {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  };

  yield {
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "[No response received from API]" },
  };

  yield { type: "content_block_stop", index: 0 };

  yield {
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: {
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };

  yield { type: "message_stop" };
}

/**
 * Send a streaming request to Cloud Code with multi-account support
 * Streams events in real-time as they arrive from the server
 *
 * @param anthropicRequest - The Anthropic-format request
 * @param accountManager - The account manager instance
 * @param fallbackEnabled - Whether to enable model fallback
 * @yields Anthropic-format SSE events (message_start, content_block_start, content_block_delta, etc.)
 * @throws Error if max retries exceeded or no accounts available
 */
export async function* sendMessageStream(anthropicRequest: AnthropicRequest, accountManager: AccountManagerInterface, fallbackEnabled = false): AsyncGenerator<AnthropicSSEEvent, void, unknown> {
  const model = anthropicRequest.model;

  // Retry loop with account failover
  // Ensure we try at least as many times as there are accounts to cycle through everyone
  // +1 to ensure we hit the "all accounts rate-limited" check at the start of the next loop
  const maxAttempts = Math.max(MAX_RETRIES, accountManager.getAccountCount() + 1);

  // Track if all failures were 5xx errors (for fallback on exhaustion)
  let all5xxErrors = true;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Use sticky account selection for cache continuity
    const { account: stickyAccount, waitMs } = accountManager.pickStickyAccount(model);
    let account: Account | null = stickyAccount;

    // Handle waiting for sticky account
    if (!account && waitMs > 0) {
      getLogger().info(`[CloudCode] Waiting ${formatDuration(waitMs)} for sticky account...`);
      await sleep(waitMs);
      accountManager.clearExpiredLimits();
      account = accountManager.getCurrentStickyAccount(model);
    }

    // Handle all accounts rate-limited
    if (!account) {
      if (accountManager.isAllRateLimited(model)) {
        const allWaitMs = accountManager.getMinWaitTimeMs(model);
        const resetTime = new Date(Date.now() + allWaitMs).toISOString();

        // If wait time is too long (> 2 minutes), throw error immediately
        if (allWaitMs > MAX_WAIT_BEFORE_ERROR_MS) {
          throw new Error(`RESOURCE_EXHAUSTED: Rate limited on ${model}. Quota will reset after ${formatDuration(allWaitMs)}. Next available: ${resetTime}`);
        }

        // Wait for reset (applies to both single and multi-account modes)
        const accountCount = accountManager.getAccountCount();
        getLogger().warn(`[CloudCode] All ${accountCount} account(s) rate-limited. Waiting ${formatDuration(allWaitMs)}...`);
        await sleep(allWaitMs);

        // Add buffer delay to handle timing race conditions
        await sleep(RATE_LIMIT_BUFFER_MS);

        accountManager.clearExpiredLimits();
        account = accountManager.pickNext(model);

        // If still no account after buffer, try optimistic reset
        if (!account) {
          getLogger().info(`[CloudCode] Selection failed after buffer, trying optimistic reset for ${model}`);
          accountManager.optimisticReset(model);
          account = accountManager.pickNext(model);
        }
      }

      if (!account) {
        // Check if fallback is enabled and available
        if (fallbackEnabled) {
          const fallbackModel = getFallbackModel(model);
          if (fallbackModel) {
            getLogger().warn(`[CloudCode] All accounts exhausted for ${model}. Attempting fallback to ${fallbackModel} (streaming)`);
            // Retry with fallback model
            const fallbackRequest: AnthropicRequest = { ...anthropicRequest, model: fallbackModel };
            yield* sendMessageStream(fallbackRequest, accountManager, false /* prevent infinite recursion */);
            return;
          }
        }
        throw new Error("No accounts available");
      }
    }

    try {
      // Get token and project for this account
      const token = await accountManager.getTokenForAccount(account);
      const project = await accountManager.getProjectForAccount(account, token);
      const payload = buildCloudCodeRequest(anthropicRequest, project);

      getLogger().debug(`[CloudCode] Starting stream for model: ${model}`);

      // Try each endpoint for streaming
      let lastError: Error | RateLimitErrorInfo | null = null;
      for (const endpoint of ANTIGRAVITY_ENDPOINT_FALLBACKS) {
        try {
          const url = `${endpoint}/v1internal:streamGenerateContent?alt=sse`;

          const response = await fetch(url, {
            method: "POST",
            headers: buildHeaders(token, model, "text/event-stream"),
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            const errorText = await response.text();
            getLogger().warn(`[CloudCode] Stream error at ${endpoint}: ${response.status} - ${errorText}`);

            if (response.status === 401) {
              // Auth error - clear caches and retry
              accountManager.clearTokenCache(account.email);
              accountManager.clearProjectCache(account.email);
              continue;
            }

            if (response.status === 429) {
              // Rate limited on this endpoint - try next endpoint first (DAILY -> PROD)
              getLogger().debug(`[CloudCode] Stream rate limited at ${endpoint}, trying next endpoint...`);
              const resetMs = parseResetTime(response, errorText);
              // Keep minimum reset time across all 429 responses
              const lastRateLimit = lastError as RateLimitErrorInfo | null;
              if (!lastRateLimit?.is429 || (resetMs && (!lastRateLimit.resetMs || resetMs < lastRateLimit.resetMs))) {
                lastError = { is429: true, response, errorText, resetMs };
              }
              continue;
            }

            lastError = new Error(`API error ${response.status}: ${errorText}`);

            // If it's a 5xx error, wait a bit before trying the next endpoint
            if (response.status >= 500) {
              getLogger().warn(`[CloudCode] ${response.status} stream error, waiting 1s before retry...`);
              await sleep(1000);
            }

            continue;
          }

          // Stream the response with empty response retry logic
          if (!response.body) {
            throw new Error("Response body is null");
          }

          let emptyRetries = 0;
          let currentResponse = response;

          while (emptyRetries <= MAX_EMPTY_RETRIES) {
            try {
              // Safety check: body should exist after the null check above
              if (!currentResponse.body) {
                throw new Error("Response body is null");
              }
              yield* streamSSEResponse({ body: currentResponse.body }, anthropicRequest.model);
              getLogger().debug("[CloudCode] Stream completed");
              return;
            } catch (streamError) {
              if (isEmptyResponseError(streamError as Error) && emptyRetries < MAX_EMPTY_RETRIES) {
                emptyRetries++;
                getLogger().warn(`[CloudCode] Empty response, retry ${emptyRetries}/${MAX_EMPTY_RETRIES}...`);

                // Re-fetch for retry
                currentResponse = await fetch(url, {
                  method: "POST",
                  headers: buildHeaders(token, model, "text/event-stream"),
                  body: JSON.stringify(payload),
                });

                if (!currentResponse.ok) {
                  throw new Error(`Empty response retry failed: ${currentResponse.status}`);
                }

                if (!currentResponse.body) {
                  throw new Error("Response body is null on retry");
                }

                continue;
              }

              if (isEmptyResponseError(streamError as Error)) {
                getLogger().error(`[CloudCode] Empty response after ${MAX_EMPTY_RETRIES} retries`);
                yield* emitEmptyResponseFallback(anthropicRequest.model);
                return;
              }

              throw streamError;
            }
          }
        } catch (endpointError) {
          if (isRateLimitError(endpointError as Error)) {
            throw endpointError; // Re-throw to trigger account switch
          }
          const err = endpointError as Error;
          getLogger().warn({ endpoint, error: err.message }, "[CloudCode] Stream error");
          lastError = err;
        }
      }

      // If all endpoints failed for this account
      if (lastError) {
        // If all endpoints returned 429, mark account as rate-limited
        if ("is429" in lastError && lastError.is429) {
          getLogger().warn(`[CloudCode] All endpoints rate-limited for ${account.email}`);
          accountManager.markRateLimited(account.email, lastError.resetMs, model);
          throw new Error(`Rate limited: ${lastError.errorText}`);
        }
        // lastError is an Error object
        throw lastError as Error;
      }
    } catch (error) {
      const err = error as Error;
      if (isRateLimitError(err)) {
        // Rate limited - already marked, continue to next account
        getLogger().info(`[CloudCode] Account ${account.email} rate-limited, trying next...`);
        all5xxErrors = false;
        continue;
      }
      if (isAuthError(err)) {
        // Auth invalid - already marked, continue to next account
        getLogger().warn(`[CloudCode] Account ${account.email} has invalid credentials, trying next...`);
        all5xxErrors = false;
        continue;
      }
      // Non-rate-limit error: throw immediately
      // UNLESS it's a 5xx error, then we treat it as a "soft" failure for this account and try the next one
      if (is5xxError(err)) {
        getLogger().warn(`[CloudCode] Account ${account.email} failed with 5xx stream error, trying next...`);
        accountManager.pickNext(model); // Force advance to next account
        continue;
      }

      if (isNetworkError(err)) {
        getLogger().warn(`[CloudCode] Network error for ${account.email} (stream), trying next account... (${err.message})`);
        await sleep(1000); // Brief pause before retry
        accountManager.pickNext(model); // Advance to next account
        all5xxErrors = false;
        continue;
      }

      throw error;
    }
  }

  // Check if we should attempt fallback on 5xx exhaustion
  const decision = shouldAttemptFallback(model, all5xxErrors, fallbackEnabled);
  if (decision.shouldFallback) {
    // Recursively call with fallback model (disable fallback to prevent infinite recursion)
    const fallbackRequest: AnthropicRequest = { ...anthropicRequest, model: decision.fallbackModel };
    yield* sendMessageStream(fallbackRequest, accountManager, false /* prevent infinite recursion */);
    return;
  }

  throw new Error("Max retries exceeded");
}
